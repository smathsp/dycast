import { markRaw, reactive, watch } from 'vue';
import type { Danmu, DanmuState, DanmuSettings } from './types';
import {
  getEligibleLotteryPool,
  getParticipantKeys,
  getPrimaryParticipantKey,
  isLotteryCandidateEligible
} from './lottery';
import {
  DEFAULT_LOTTERY_THRESHOLD,
  getAutomaticLotteryBlockReason,
  normalizeLotteryThreshold
} from './lotteryPolicy';
import { normalizeDanmuBaseFontSize } from './visual';
import { appendWithBatchedHeadEviction } from './boundedPool';
import { useSettings } from '@/utils/settingUtil';
import {
  finalizeLotteryBatch,
  normalizeWinnerCount,
  reserveLotteryBatch,
  restoreRemainingWinnerCount
} from '@/utils/liveOverlayUtil';
import {
  diffPersistentSettingsValues,
  enqueuePersistentSettingsSection,
  getRetainedPersistentSettingsSection,
  markPersistentSettingsCanonicalPatch
} from '@/utils/persistentSettingsQueue';

/** 屏幕最大同时显示弹幕数 */
const MAX_ACTIVE = 100;

/** 观众弹幕展示页保留的最近弹幕数 */
const MAX_DISPLAY_DANMU = 500;

/** 抽奖池最大容量 */
const MAX_POOL_SIZE = 50000;

/** 满池后一次淘汰的数量；将 5 万元素数组的搬移从每条一次降为约每千条一次。 */
const POOL_EVICTION_BATCH_SIZE = 1000;

/** 本机同步保存的最近中奖记录；防止 localStorage 长期增长直至写满。 */
const MAX_LOTTERY_HISTORY = 2000;

/** 单轮最多抽取人数 */
const MAX_LOTTERY_WINNERS = 24;

/** localStorage keys */
const STATE_KEY = 'dycast_danmu_state';
const LOTTERY_HISTORY_KEY = 'dycast_danmu_lottery_history';
const PENDING_LOTTERY_KEY = 'dycast_danmu_pending_lottery';
const SETTINGS_KEY = 'dycast_danmu_settings';
const USER_ID_CACHE_KEY = 'dycast_douyin_display_id_cache';
const USER_ID_DB_NAME = 'dycast_user_identity_cache';
const USER_ID_DB_STORE = 'identities';
const TARGET_BADGE_DB_STORE = 'targetBadges';
const TARGET_BADGE_CACHE_VERSION_KEY = 'dycast_target_badge_cache_version';
const TARGET_BADGE_CACHE_VERSION = '6';
/** 渲染进程只保留最近活跃用户，完整历史留在 IndexedDB，避免长场直播持续抬高内存。 */
const MAX_USER_ID_CACHE_SIZE = 20000;
const HOT_USER_ID_CACHE_SIZE = 5000;
const MAX_TARGET_BADGE_USER_CACHE_SIZE = 20000;
const RECENT_DANMU_KEY_LIMIT = 10000;

type DisplayDanmuSubscriber = (danmu: Danmu | null) => void;
const displayDanmuSubscribers = new Set<DisplayDanmuSubscriber>();
const recentDanmuKeys = new Set<string>();
const lotteryEligibilityState = reactive({ count: 0 });
let eligibleLotteryPool: Danmu[] = [];
const eligibleLotteryMembers = new Set<Danmu>();
const lastEligibleTicketAt = new Map<string, number>();
let staleEligibleCandidateCount = 0;

/** 默认设置 */
const defaultSettings: DanmuSettings = {
  lotteryThreshold: DEFAULT_LOTTERY_THRESHOLD,
  lotteryWinnerCount: 1,
  lotteryKeyword: '',
  lotteryUserCooldownEnabled: false,
  redDanmuNicknameKeywords: '',
  fontSize: 15,
  speedBase: 12,
  speedRange: 3
};

function normalizeLotteryWinnerCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(MAX_LOTTERY_WINNERS, Math.max(1, Math.round(parsed)))
    : defaultSettings.lotteryWinnerCount;
}

function normalizeLotteryKeyword(value: unknown): string {
  return String(value ?? '').slice(0, 50);
}

function normalizeRedDanmuNicknameKeywords(value: unknown): string {
  return String(value ?? '').replace(/\r\n?/g, '\n').slice(0, 500);
}

function normalizeDanmuSettings(value: Partial<DanmuSettings>): DanmuSettings {
  const loaded = { ...defaultSettings, ...value };
  loaded.lotteryThreshold = normalizeLotteryThreshold(loaded.lotteryThreshold);
  loaded.lotteryWinnerCount = normalizeLotteryWinnerCount(loaded.lotteryWinnerCount);
  loaded.lotteryKeyword = normalizeLotteryKeyword(loaded.lotteryKeyword);
  loaded.lotteryUserCooldownEnabled = Boolean(loaded.lotteryUserCooldownEnabled);
  loaded.redDanmuNicknameKeywords = normalizeRedDanmuNicknameKeywords(loaded.redDanmuNicknameKeywords);
  loaded.fontSize = normalizeDanmuBaseFontSize(loaded.fontSize);
  const speedBase = Number(loaded.speedBase);
  loaded.speedBase = Number.isFinite(speedBase) ? Math.min(20, Math.max(6, Math.round(speedBase))) : defaultSettings.speedBase;
  const speedRange = Number(loaded.speedRange);
  loaded.speedRange = Number.isFinite(speedRange) ? Math.min(12, Math.max(0, Math.round(speedRange))) : defaultSettings.speedRange;
  return loaded;
}

// ===== BroadcastChannel =====
const channel = new BroadcastChannel('dycast-danmu');

// ===== 设置（独立持久化） =====
function loadSettings(): DanmuSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      return normalizeDanmuSettings(JSON.parse(raw));
    }
  } catch {}
  return { ...defaultSettings };
}

let nextDanmuSettingsPatchId = 1;
const inFlightDanmuSettingsPatches = new Map<number, Partial<DanmuSettings>>();

function writeDanmuSettingsToLocalStorage(value: DanmuSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(value));
  } catch {}
}

export const settings = reactive<DanmuSettings>(loadSettings());
const appSettings = useSettings();
let lastCanonicalDanmuSettings = { ...settings } as DanmuSettings;

function applyCanonicalDanmuSettings(value: unknown, canonicalPatch?: object): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const canonical = normalizeDanmuSettings(value as Partial<DanmuSettings>);
  const canonicalChanges = diffPersistentSettingsValues(
    lastCanonicalDanmuSettings as unknown as Record<string, unknown>,
    canonical as unknown as Record<string, unknown>
  );
  lastCanonicalDanmuSettings = { ...canonical };
  const supersedingPatch = canonicalPatch && typeof canonicalPatch === 'object' && !Array.isArray(canonicalPatch)
    ? canonicalPatch
    : canonicalChanges;
  if (Object.keys(supersedingPatch).length > 0) {
    markPersistentSettingsCanonicalPatch('danmu', supersedingPatch);
  }
  let combined = normalizeDanmuSettings({
    ...canonical,
    ...getRetainedPersistentSettingsSection('danmu')
  });
  for (const patch of inFlightDanmuSettingsPatches.values()) {
    combined = normalizeDanmuSettings({ ...combined, ...patch });
  }
  Object.assign(settings, combined);
  writeDanmuSettingsToLocalStorage(combined);
}

function saveSettings(patch: Partial<DanmuSettings>) {
  const snapshot = JSON.parse(JSON.stringify(settings)) as DanmuSettings;
  const patchSnapshot = JSON.parse(JSON.stringify(patch)) as Partial<DanmuSettings>;
  writeDanmuSettingsToLocalStorage(snapshot);
  const patchId = nextDanmuSettingsPatchId++;
  inFlightDanmuSettingsPatches.set(patchId, patchSnapshot);
  void enqueuePersistentSettingsSection('danmu', patchSnapshot).then(saved => {
    inFlightDanmuSettingsPatches.delete(patchId);
    if (!saved) console.warn('[settings] 弹幕设置未能保存到公共目录');
  });
}

// 主页与弹幕页是独立窗口，监听持久化变化以实时同步显示设置。
window.addEventListener('storage', (event) => {
  if (!event.newValue) return;
  try {
    if (event.key === SETTINGS_KEY) {
      // Electron 只接受主进程落盘后的 canonical 广播。其它窗口预写的整份
      // localStorage 快照可能更旧，晚到时不得反向覆盖新的字段补丁。
      if (!window.electronAPI?.onPersistentSettingsSectionUpdated) {
        applyCanonicalDanmuSettings(JSON.parse(event.newValue));
      }
    } else if (event.key === STATE_KEY) {
      syncPersistedLotteryState(JSON.parse(event.newValue));
    } else if (event.key === LOTTERY_HISTORY_KEY) {
      syncPersistedLotteryState({ lotteryHistory: JSON.parse(event.newValue) });
    } else if (event.key === PENDING_LOTTERY_KEY) {
      syncPersistedLotteryState({ pendingLotteryBatch: JSON.parse(event.newValue) });
    }
  } catch {}
});

window.electronAPI?.onPersistentSettingsSectionUpdated?.((section, value, canonicalPatch) => {
  if (section === 'danmu') applyCanonicalDanmuSettings(value, canonicalPatch);
});

export function updateSettings(partial: Partial<DanmuSettings>) {
  if (partial.lotteryThreshold !== undefined) {
    partial = { ...partial, lotteryThreshold: normalizeLotteryThreshold(partial.lotteryThreshold) };
  }
  if (partial.lotteryWinnerCount !== undefined) {
    partial = {
      ...partial,
      lotteryWinnerCount: normalizeLotteryWinnerCount(partial.lotteryWinnerCount)
    };
  }
  if (partial.lotteryKeyword !== undefined) {
    partial = { ...partial, lotteryKeyword: normalizeLotteryKeyword(partial.lotteryKeyword) };
  }
  if (partial.lotteryUserCooldownEnabled !== undefined) {
    partial = { ...partial, lotteryUserCooldownEnabled: Boolean(partial.lotteryUserCooldownEnabled) };
  }
  if (partial.redDanmuNicknameKeywords !== undefined) {
    partial = {
      ...partial,
      redDanmuNicknameKeywords: normalizeRedDanmuNicknameKeywords(partial.redDanmuNicknameKeywords)
    };
  }
  if (partial.fontSize !== undefined) {
    partial = { ...partial, fontSize: normalizeDanmuBaseFontSize(partial.fontSize) };
  }
  if (partial.speedBase !== undefined) {
    partial = { ...partial, speedBase: normalizeDanmuSettings({ ...settings, speedBase: partial.speedBase }).speedBase };
  }
  if (partial.speedRange !== undefined) {
    partial = { ...partial, speedRange: normalizeDanmuSettings({ ...settings, speedRange: partial.speedRange }).speedRange };
  }
  Object.assign(settings, partial);
  saveSettings(partial);
}

// ===== 状态恢复 =====
function loadPersistedState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

const restored = loadPersistedState();
function loadPersistedArray(key: string, fallback: unknown): unknown[] {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return Array.isArray(fallback) ? fallback : [];
}

const restoredLotteryHistoryValue = loadPersistedArray(LOTTERY_HISTORY_KEY, restored.lotteryHistory);
const restoredPendingLotteryValue = loadPersistedArray(PENDING_LOTTERY_KEY, restored.pendingLotteryBatch);
const restoredLotteryHistory: Danmu[] = Array.isArray(restoredLotteryHistoryValue)
  ? restoredLotteryHistoryValue
      .filter((item: unknown) => item && typeof item === 'object')
      .slice(-MAX_LOTTERY_HISTORY)
      .map(item => markRaw(item as Danmu))
  : [];
let pendingLotteryBatch: Danmu[] = Array.isArray(restoredPendingLotteryValue)
  ? restoredPendingLotteryValue
      .filter((item: unknown) => item && typeof item === 'object')
      .map(item => markRaw(item as Danmu))
  : [];

const state = reactive<DanmuState>({
  connected: false,
  wsUrl: '',
  isCollecting: false,
  isDisplaying: false,
  totalDanmuCount: restored.totalDanmuCount || 0,
  totalPoolCount: 0,
  energy: restored.energy || 0,
  lotteryPool: [],
  activeDanmu: [],
  displayDanmu: [],
  isLotteryActive: pendingLotteryBatch.length > 0,
  lotteryResult: null,
  lotteryHistory: restoredLotteryHistory,
  lotteryCount: restored.lotteryCount || 0
});

let currentLiveSessionId = String(restored.liveSessionId || '').trim().slice(0, 256);

/** 清掉尚未揭晓的预留结果，并按实际未揭晓人数返还名额。 */
function cancelPendingLotteryBatch(restoreSlots: boolean): number {
  const unrevealedCount = pendingLotteryBatch.length;
  if (unrevealedCount === 0) return 0;
  const batchId = String(pendingLotteryBatch[0]?.batchId || '').trim();
  const usesReservationLedger = pendingLotteryBatch[0]?.lotteryReservationVersion === 1;
  if (restoreSlots) {
    try {
      if (batchId) {
        // 总是先幂等确认账本：新批次若在“名单已落盘、名额未预留”边界崩溃，
        // 这里会先预留再立即返还；旧批次则以无扣减方式接管。
        reserveLotteryBatch(batchId, unrevealedCount, !usesReservationLedger);
        const finalized = finalizeLotteryBatch(batchId, unrevealedCount);
        if (finalized.status === 'active') return 0;
      } else {
        // 极旧版本没有 batchId，只能沿用一次性返还；新生成批次永远不会进入这里。
        restoreRemainingWinnerCount(unrevealedCount);
      }
    } catch (error) {
      // 公共账本没有落盘时保留 pending，稍后或下次启动可用同一批次号安全重试。
      console.warn('[store] 取消抽奖批次暂未完成，将保留待揭晓名单重试:', error);
      return -1;
    }
  }
  if (restoreSlots && unrevealedCount > 0) {
    const drawNo = Number(pendingLotteryBatch[0]?.drawNo) || 0;
    const batchHasRevealedWinner = Boolean(batchId) && state.lotteryHistory.some(item => item.batchId === batchId);
    if (!batchHasRevealedWinner && drawNo > 0 && state.lotteryCount === drawNo) {
      state.lotteryCount -= 1;
    }
  }
  pendingLotteryBatch = [];
  return unrevealedCount;
}

/** 让主页、飘屏和侧边栏窗口都看到同一份中奖记录，避免旧窗口退出时覆盖新记录。 */
function syncPersistedLotteryState(value: Partial<DanmuState> & {
  pendingLotteryBatch?: unknown;
}): void {
  if (Array.isArray(value.lotteryHistory)) {
    const history = value.lotteryHistory
        .filter(item => item && typeof item === 'object' && String(item.id || item.winRecordId || ''))
        .slice(-MAX_LOTTERY_HISTORY)
        .map(item => markRaw(item));
    state.lotteryHistory.splice(0, state.lotteryHistory.length, ...history);
  }
  if (value.lotteryCount !== undefined) {
    state.lotteryCount = Math.max(0, Math.round(Number(value.lotteryCount) || 0));
  }
  if (Array.isArray(value.pendingLotteryBatch)) {
    pendingLotteryBatch = value.pendingLotteryBatch
      .filter(item => item && typeof item === 'object')
      .map(item => markRaw(item as Danmu));
  }
}

// ===== 可搜索抖音号缓存 =====
// 同一用户的不同弹幕可能只携带精简资料。使用稳定 secUid 关联后续完整消息中的 display_id。
function loadHotUserIdCache(): Map<string, string> {
  try {
    const raw = localStorage.getItem(USER_ID_CACHE_KEY);
    const entries = raw ? JSON.parse(raw) as Array<[string, string]> : [];
    return new Map(entries.filter(([secUid, displayId]) => Boolean(secUid) && /^\d+$/.test(displayId)));
  } catch {
    return new Map();
  }
}

interface StoredUserId {
  secUid: string;
  displayId: string;
  updatedAt: number;
}

const hotUserIdCache = loadHotUserIdCache();
const userIdCache = new Map(hotUserIdCache);
const pendingUserIdWrites = new Map<string, StoredUserId>();
const pendingUserIdDeletes = new Set<string>();
let userIdCacheSaveTimer: ReturnType<typeof setTimeout> | null = null;
let userIdDatabasePromise: Promise<IDBDatabase> | null = null;
let userIdCacheRetryDelay = 1000;
let targetBadgeRetryDelay = 1000;

function openUserIdDatabase(): Promise<IDBDatabase> {
  if (userIdDatabasePromise) return userIdDatabasePromise;
  userIdDatabasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(USER_ID_DB_NAME, 2);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(USER_ID_DB_STORE)) {
        const store = database.createObjectStore(USER_ID_DB_STORE, { keyPath: 'secUid' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
      if (!database.objectStoreNames.contains(TARGET_BADGE_DB_STORE)) {
        const store = database.createObjectStore(TARGET_BADGE_DB_STORE, { keyPath: 'key' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
        store.createIndex('secUid', 'secUid', { unique: false });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        userIdDatabasePromise = null;
      };
      resolve(database);
    };
    request.onerror = () => {
      userIdDatabasePromise = null;
      reject(request.error || new Error('用户 ID 缓存打开失败'));
    };
  });
  return userIdDatabasePromise;
}

/** 按更新时间倒序读取固定数量，避免 getAll() 在长期使用后一次复制整库到每个窗口。 */
function readNewestRecords<T>(
  database: IDBDatabase,
  storeName: string,
  limit: number,
  errorMessage: string
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const records: T[] = [];
    const transaction = database.transaction(storeName, 'readonly');
    const request = transaction.objectStore(storeName).index('updatedAt').openCursor(null, 'prev');
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || records.length >= limit) {
        resolve(records.reverse());
        return;
      }
      records.push(cursor.value as T);
      cursor.continue();
    };
    request.onerror = () => reject(request.error || new Error(errorMessage));
    transaction.onabort = () => reject(transaction.error || new Error(errorMessage));
  });
}

async function loadPersistentUserIds(): Promise<void> {
  const database = await openUserIdDatabase();
  const records = await readNewestRecords<StoredUserId>(
    database,
    USER_ID_DB_STORE,
    MAX_USER_ID_CACHE_SIZE,
    '用户 ID 缓存读取失败'
  );
  records
    .filter(record => Boolean(record.secUid) && /^\d+$/.test(record.displayId))
    .sort((a, b) => a.updatedAt - b.updatedAt)
    .forEach(record => {
      if (!userIdCache.has(record.secUid)) userIdCache.set(record.secUid, record.displayId);
    });
  // 本地热缓存是最近数据，放回 Map 尾部保持淘汰顺序。
  hotUserIdCache.forEach((displayId, secUid) => {
    userIdCache.delete(secUid);
    userIdCache.set(secUid, displayId);
    pendingUserIdWrites.set(secUid, { secUid, displayId, updatedAt: Date.now() });
  });
  while (userIdCache.size > MAX_USER_ID_CACHE_SIZE) {
    const oldestKey = userIdCache.keys().next().value;
    if (!oldestKey) break;
    userIdCache.delete(oldestKey);
    pendingUserIdDeletes.add(oldestKey);
  }
  if (pendingUserIdWrites.size || pendingUserIdDeletes.size) scheduleUserIdCacheSave();
}

export const userIdCacheReady = loadPersistentUserIds().catch(error => {
  console.warn('[store] 完整用户 ID 缓存加载失败，继续使用热缓存:', error);
});

async function flushUserIdCache(): Promise<void> {
  userIdCacheSaveTimer = null;
  try {
    localStorage.setItem(USER_ID_CACHE_KEY, JSON.stringify(Array.from(hotUserIdCache.entries())));
  } catch {}

  if (!pendingUserIdWrites.size && !pendingUserIdDeletes.size) return;
  const writes = Array.from(pendingUserIdWrites.values());
  const deletes = Array.from(pendingUserIdDeletes);
  pendingUserIdWrites.clear();
  pendingUserIdDeletes.clear();
  try {
    const database = await openUserIdDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(USER_ID_DB_STORE, 'readwrite');
      const store = transaction.objectStore(USER_ID_DB_STORE);
      writes.forEach(record => store.put(record));
      deletes.forEach(secUid => store.delete(secUid));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('用户 ID 缓存保存失败'));
      transaction.onabort = () => reject(transaction.error || new Error('用户 ID 缓存保存中止'));
    });
    userIdCacheRetryDelay = 1000;
  } catch (error) {
    console.warn('[store] 用户 ID 缓存保存失败:', error);
    // 保留写入期间产生的更新；失败批次仅在没有更新操作覆盖同一键时放回队列。
    writes.forEach(record => {
      if (!pendingUserIdWrites.has(record.secUid) && !pendingUserIdDeletes.has(record.secUid)) {
        pendingUserIdWrites.set(record.secUid, record);
      }
    });
    deletes.forEach(secUid => {
      if (!pendingUserIdWrites.has(secUid)) pendingUserIdDeletes.add(secUid);
    });
    scheduleUserIdCacheSave(userIdCacheRetryDelay);
    userIdCacheRetryDelay = Math.min(30000, userIdCacheRetryDelay * 2);
    return;
  }
  if (pendingUserIdWrites.size || pendingUserIdDeletes.size) scheduleUserIdCacheSave();
}

function scheduleUserIdCacheSave(delay = 1000): void {
  if (userIdCacheSaveTimer) return;
  userIdCacheSaveTimer = setTimeout(() => {
    void flushUserIdCache();
  }, delay);
}

function cacheUserId(secUid: string, displayId: string): void {
  if (userIdCache.get(secUid) === displayId) return;
  // 重新插入以维持最近使用顺序。
  userIdCache.delete(secUid);
  userIdCache.set(secUid, displayId);
  hotUserIdCache.delete(secUid);
  hotUserIdCache.set(secUid, displayId);
  while (hotUserIdCache.size > HOT_USER_ID_CACHE_SIZE) {
    const oldestHotKey = hotUserIdCache.keys().next().value;
    if (!oldestHotKey) break;
    hotUserIdCache.delete(oldestHotKey);
  }
  pendingUserIdWrites.set(secUid, { secUid, displayId, updatedAt: Date.now() });
  pendingUserIdDeletes.delete(secUid);
  while (userIdCache.size > MAX_USER_ID_CACHE_SIZE) {
    const oldestKey = userIdCache.keys().next().value;
    if (!oldestKey) break;
    userIdCache.delete(oldestKey);
    pendingUserIdWrites.delete(oldestKey);
    pendingUserIdDeletes.add(oldestKey);
  }
  scheduleUserIdCacheSave();
}

/** 返回已确认来自 display_id 的可搜索纯数字抖音号。 */
export function getCachedNumericUserId(secUid?: string): string | undefined {
  return secUid ? userIdCache.get(secUid) : undefined;
}

function enrichDanmuUserId(danmu: Danmu): Danmu {
  const directId = danmu.userIdSource === 'displayId' && /^\d+$/.test(danmu.userId || '')
    ? danmu.userId
    : undefined;
  if (danmu.secUid && directId) {
    cacheUserId(danmu.secUid, directId);
    return danmu;
  }
  const cachedId = getCachedNumericUserId(danmu.secUid);
  if (cachedId) {
    danmu.userId = cachedId;
    danmu.userIdVerified = true;
    danmu.userIdSource = 'displayId';
  }
  return danmu;
}

// ===== 当前直播间主播灯牌实时缓存 =====
type DanmuFansClub = NonNullable<Danmu['fansClub']>[number];
const targetBadgeCache = new Map<string, Map<string, DanmuFansClub>>();
interface StoredTargetBadge extends DanmuFansClub {
  key: string;
  secUid: string;
  anchorId: string;
  updatedAt: number;
}
const pendingTargetBadgeWrites = new Map<string, StoredTargetBadge>();
const pendingTargetBadgeDeletes = new Set<string>();
let targetBadgeSaveTimer: ReturnType<typeof setTimeout> | null = null;

function targetBadgeKey(secUid: string, anchorId: string): string {
  return `${secUid}|${anchorId}`;
}

async function flushTargetBadgeCache(): Promise<void> {
  targetBadgeSaveTimer = null;
  if (!pendingTargetBadgeWrites.size && !pendingTargetBadgeDeletes.size) return;
  const writes = Array.from(pendingTargetBadgeWrites.values());
  const deletes = Array.from(pendingTargetBadgeDeletes);
  pendingTargetBadgeWrites.clear();
  pendingTargetBadgeDeletes.clear();
  try {
    const database = await openUserIdDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(TARGET_BADGE_DB_STORE, 'readwrite');
      const store = transaction.objectStore(TARGET_BADGE_DB_STORE);
      writes.forEach(record => store.put(record));
      deletes.forEach(key => store.delete(key));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('灯牌缓存保存失败'));
      transaction.onabort = () => reject(transaction.error || new Error('灯牌缓存保存中止'));
    });
    targetBadgeRetryDelay = 1000;
  } catch (error) {
    console.warn('[store] 灯牌缓存保存失败:', error);
    writes.forEach(record => {
      if (!pendingTargetBadgeWrites.has(record.key) && !pendingTargetBadgeDeletes.has(record.key)) {
        pendingTargetBadgeWrites.set(record.key, record);
      }
    });
    deletes.forEach(key => {
      if (!pendingTargetBadgeWrites.has(key)) pendingTargetBadgeDeletes.add(key);
    });
    scheduleTargetBadgeSave(targetBadgeRetryDelay);
    targetBadgeRetryDelay = Math.min(30000, targetBadgeRetryDelay * 2);
    return;
  }
  if (pendingTargetBadgeWrites.size || pendingTargetBadgeDeletes.size) scheduleTargetBadgeSave();
}

function scheduleTargetBadgeSave(delay = 1000): void {
  if (targetBadgeSaveTimer) return;
  targetBadgeSaveTimer = setTimeout(() => void flushTargetBadgeCache(), delay);
}

async function loadPersistentTargetBadges(): Promise<void> {
  const database = await openUserIdDatabase();
  if (localStorage.getItem(TARGET_BADGE_CACHE_VERSION_KEY) !== TARGET_BADGE_CACHE_VERSION) {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(TARGET_BADGE_DB_STORE, 'readwrite');
      transaction.objectStore(TARGET_BADGE_DB_STORE).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('灯牌缓存升级失败'));
      transaction.onabort = () => reject(transaction.error || new Error('灯牌缓存升级中止'));
    });
    localStorage.setItem(TARGET_BADGE_CACHE_VERSION_KEY, TARGET_BADGE_CACHE_VERSION);
  }
  const records = await readNewestRecords<StoredTargetBadge>(
    database,
    TARGET_BADGE_DB_STORE,
    MAX_TARGET_BADGE_USER_CACHE_SIZE,
    '灯牌缓存读取失败'
  );
  records
    .filter(record => Boolean(record.anchorId) && Number.isFinite(Number(record.level)))
    .sort((a, b) => a.updatedAt - b.updatedAt)
    .forEach(record => {
      const cached = targetBadgeCache.get(record.secUid) || new Map<string, DanmuFansClub>();
      if (!cached.has(record.anchorId)) {
        cached.set(record.anchorId, {
          anchorId: record.anchorId,
          clubName: record.clubName,
          level: Math.max(0, Number(record.level) || 0),
          badgeIcon: record.badgeIcon
        });
      }
      targetBadgeCache.set(record.secUid, cached);
    });
  while (targetBadgeCache.size > MAX_TARGET_BADGE_USER_CACHE_SIZE) {
    const oldestSecUid = targetBadgeCache.keys().next().value;
    if (!oldestSecUid) break;
    const removed = targetBadgeCache.get(oldestSecUid);
    removed?.forEach((_club, anchorId) => pendingTargetBadgeDeletes.add(targetBadgeKey(oldestSecUid, anchorId)));
    targetBadgeCache.delete(oldestSecUid);
  }
  if (pendingTargetBadgeDeletes.size) scheduleTargetBadgeSave();
}

export const targetBadgeCacheReady = loadPersistentTargetBadges().catch(error => {
  console.warn('[store] 完整灯牌缓存加载失败，继续使用会话缓存:', error);
});

function cacheTargetBadges(secUid: string, clubs: DanmuFansClub[]): void {
  const targetClubs = clubs
    .map(club => ({ ...club, anchorId: String(club.anchorId ?? '').trim() }))
    .filter(club => Boolean(club.anchorId) && Number.isFinite(Number(club.level)));
  if (!targetClubs.length) return;

  const cached = targetBadgeCache.get(secUid) || new Map<string, DanmuFansClub>();
  let changed = false;
  targetClubs.forEach(club => {
    const normalizedClub: DanmuFansClub = {
      ...club,
      anchorId: club.anchorId,
      level: Math.max(0, Number(club.level) || 0)
    };
    const anchorId = club.anchorId!;
    const previousClub = cached.get(anchorId);
    cached.set(anchorId, normalizedClub);
    if (
      previousClub &&
      previousClub.level === normalizedClub.level &&
      previousClub.clubName === normalizedClub.clubName &&
      previousClub.badgeIcon === normalizedClub.badgeIcon
    ) {
      return;
    }
    const key = targetBadgeKey(secUid, anchorId);
    pendingTargetBadgeWrites.set(key, {
      ...normalizedClub,
      key,
      secUid,
      anchorId,
      updatedAt: Date.now()
    });
    pendingTargetBadgeDeletes.delete(key);
    changed = true;
  });
  // 每次收到明确灯牌数据都移动到末尾，按最近活跃用户淘汰。
  targetBadgeCache.delete(secUid);
  targetBadgeCache.set(secUid, cached);
  while (targetBadgeCache.size > MAX_TARGET_BADGE_USER_CACHE_SIZE) {
    const oldestSecUid = targetBadgeCache.keys().next().value;
    if (!oldestSecUid) break;
    const removed = targetBadgeCache.get(oldestSecUid);
    removed?.forEach((_club, anchorId) => {
      const key = targetBadgeKey(oldestSecUid, anchorId);
      pendingTargetBadgeWrites.delete(key);
      pendingTargetBadgeDeletes.add(key);
      changed = true;
    });
    targetBadgeCache.delete(oldestSecUid);
  }
  if (changed) scheduleTargetBadgeSave();
}

/** 只补全当前直播间主播的灯牌，绝不合并其它房间的缓存。 */
export function enrichDanmuTargetBadges(danmu: Danmu): Danmu {
  const currentAnchorId = String(danmu.targetAnchorId ?? '').trim();
  if (!danmu.secUid || !currentAnchorId) {
    danmu.targetAnchorId = undefined;
    danmu.fansClub = [];
    return danmu;
  }
  danmu.targetAnchorId = currentAnchorId;
  const incoming = (danmu.fansClub || []).filter(club => {
    return String(club.anchorId ?? '').trim() === currentAnchorId;
  });
  cacheTargetBadges(danmu.secUid, incoming);
  const cached = targetBadgeCache.get(danmu.secUid)?.get(currentAnchorId);
  if (cached) {
    danmu.fansClub = [cached];
  } else {
    danmu.fansClub = incoming.map(club => ({ ...club, anchorId: currentAnchorId }));
  }
  return danmu;
}

// 进度条能量最多显示到阈值；达到阈值后会自动启动开奖。
state.energy = Math.min(state.totalDanmuCount, settings.lotteryThreshold);

// ===== 持久化（节流 1 秒） =====
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let lotteryRecordsDirty = (() => {
  try {
    return localStorage.getItem(LOTTERY_HISTORY_KEY) === null ||
      localStorage.getItem(PENDING_LOTTERY_KEY) === null;
  } catch {
    return true;
  }
})();
function writePersistedState(): boolean {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  try {
    localStorage.setItem(
      STATE_KEY,
      JSON.stringify({
        totalDanmuCount: state.totalDanmuCount,
        energy: state.energy,
        lotteryCount: state.lotteryCount,
        liveSessionId: currentLiveSessionId
      })
    );
    if (lotteryRecordsDirty) {
      localStorage.setItem(LOTTERY_HISTORY_KEY, JSON.stringify(state.lotteryHistory));
      localStorage.setItem(PENDING_LOTTERY_KEY, JSON.stringify(pendingLotteryBatch));
      lotteryRecordsDirty = false;
    }
    return true;
  } catch (e) {
    console.warn('[store] 状态持久化失败:', e);
    return false;
  }
}

function persistState(immediate = false, lotteryRecordsChanged = false): boolean {
  if (lotteryRecordsChanged) lotteryRecordsDirty = true;
  if (immediate) {
    return writePersistedState();
  }
  if (saveTimer) return true;
  saveTimer = setTimeout(writePersistedState, 1000);
  return true;
}

// 正常退出或刷新时，只把本窗口仍在节流队列里的状态写完；没有本地改动的辅助窗口
// 不得在关闭瞬间用旧内存反向覆盖最新中奖记录。
window.addEventListener('pagehide', () => {
  if (saveTimer) writePersistedState();
  if (userIdCacheSaveTimer || pendingUserIdWrites.size || pendingUserIdDeletes.size) {
    void flushUserIdCache();
  }
  if (targetBadgeSaveTimer || pendingTargetBadgeWrites.size || pendingTargetBadgeDeletes.size) {
    void flushTargetBadgeCache();
  }
});

// ===== 弹幕操作 =====

function getDanmuDeliveryKey(danmu: Danmu): string {
  const sessionId = String(danmu?.liveSessionId ?? currentLiveSessionId ?? '');
  const messageId = String(danmu?.id ?? '').trim();
  if (messageId) return `${sessionId}|id:${messageId}`;
  return [
    sessionId,
    String(danmu?.timestamp ?? ''),
    String(danmu?.secUid ?? danmu?.userId ?? danmu?.nickname ?? ''),
    String(danmu?.content ?? '')
  ].join('|');
}

/** IPC 回放、窗口重挂载或直播重连都可能重复投递，重复消息不能再次充能。 */
function rememberDanmuDelivery(danmu: Danmu): boolean {
  const key = getDanmuDeliveryKey(danmu);
  if (recentDanmuKeys.has(key)) return false;
  recentDanmuKeys.add(key);
  if (recentDanmuKeys.size > RECENT_DANMU_KEY_LIMIT) {
    const oldestKey = recentDanmuKeys.values().next().value as string | undefined;
    if (oldestKey !== undefined) recentDanmuKeys.delete(oldestKey);
  }
  return true;
}

function resetLotteryEligibilityIndex(): void {
  eligibleLotteryPool = [];
  eligibleLotteryMembers.clear();
  lastEligibleTicketAt.clear();
  staleEligibleCandidateCount = 0;
  lotteryEligibilityState.count = 0;
}

function compactEligibleLotteryPool(): void {
  if (staleEligibleCandidateCount <= 0) return;
  eligibleLotteryPool = eligibleLotteryPool.filter(candidate => eligibleLotteryMembers.has(candidate));
  staleEligibleCandidateCount = 0;
}

function discardEligibleLotteryCandidates(candidates: Danmu[]): void {
  candidates.forEach(candidate => {
    if (!eligibleLotteryMembers.delete(candidate)) return;
    staleEligibleCandidateCount++;
  });
  lotteryEligibilityState.count = eligibleLotteryMembers.size;
  if (staleEligibleCandidateCount >= 1000) compactEligibleLotteryPool();
}

function rebuildLotteryEligibilityIndex(): void {
  const candidates = getEligibleLotteryPool(
    state.lotteryPool,
    appSettings.value.lotteryBadgeLevel,
    {
      keyword: settings.lotteryKeyword,
      userCooldownSeconds: settings.lotteryUserCooldownEnabled ? 20 : 0
    }
  );
  eligibleLotteryPool = candidates;
  eligibleLotteryMembers.clear();
  candidates.forEach(candidate => eligibleLotteryMembers.add(candidate));
  lastEligibleTicketAt.clear();
  if (settings.lotteryUserCooldownEnabled) {
    candidates.forEach(candidate => {
      lastEligibleTicketAt.set(
        getPrimaryParticipantKey(candidate),
        Number(candidate.timestamp) || 0
      );
    });
  }
  staleEligibleCandidateCount = 0;
  lotteryEligibilityState.count = eligibleLotteryMembers.size;
}

/** 满能量后的每条新弹幕只检查自身，避免反复扫描整个奖池。 */
function indexLotteryCandidate(candidate: Danmu): void {
  if (!isLotteryCandidateEligible(
    candidate,
    appSettings.value.lotteryBadgeLevel,
    settings.lotteryKeyword
  )) return;

  if (settings.lotteryUserCooldownEnabled) {
    const participantKey = getPrimaryParticipantKey(candidate);
    const timestamp = Number(candidate.timestamp) || 0;
    const previousTimestamp = lastEligibleTicketAt.get(participantKey);
    if (previousTimestamp !== undefined && timestamp - previousTimestamp < 20_000) return;
    lastEligibleTicketAt.set(participantKey, timestamp);
  }

  eligibleLotteryPool.push(candidate);
  eligibleLotteryMembers.add(candidate);
  lotteryEligibilityState.count = eligibleLotteryMembers.size;
}

function pushDisplayLocal(danmu: Danmu, persistSessionReset = true): Danmu | null {
  const incomingSessionId = String(danmu?.liveSessionId || '').trim();
  // 若窗口错过了单独的 reset IPC（例如连接后才打开弹幕页），第一条带新会话号的
  // 消息仍会先清掉旧房间的临时状态，绝不让能量或奖池跨直播间混合。
  if (incomingSessionId && !currentLiveSessionId) {
    // 晚打开的窗口可能先点了“开始充能”再收到当前场第一条弹幕；首次绑定只记录
    // 会话号，不能把刚开始的充能静默停掉。真正换房只接受主进程的显式 reset。
    currentLiveSessionId = incomingSessionId;
    if (persistSessionReset) persistState();
  } else if (incomingSessionId && incomingSessionId !== currentLiveSessionId) {
    // 明确 reset 后才允许切换会话。迟到的旧连接回调不能把窗口再切回旧房间。
    return null;
  }
  if (!danmu || typeof danmu !== 'object' || !rememberDanmuDelivery(danmu)) return null;
  enrichDanmuUserId(danmu);
  enrichDanmuTargetBadges(danmu);
  // 观众弹幕展示始终接收直播间消息，不受“开始攒能量”影响。
  const immutableDanmu = markRaw(danmu);
  state.displayDanmu.push(immutableDanmu);
  if (state.displayDanmu.length > MAX_DISPLAY_DANMU) {
    state.displayDanmu.splice(0, state.displayDanmu.length - MAX_DISPLAY_DANMU);
  }
  displayDanmuSubscribers.forEach(subscriber => subscriber(immutableDanmu));

  // 本场累计独立于充能与奖池。窗口晚打开时可通过带序号的缓存弹幕补齐到本场总数。
  if (danmu.liveSessionId) {
    if (currentLiveSessionId !== danmu.liveSessionId) {
      currentLiveSessionId = danmu.liveSessionId;
      state.totalPoolCount = 0;
    }
    const receivedCount = Math.max(1, Math.round(Number(danmu.liveSessionCount) || 0));
    state.totalPoolCount = Math.max(state.totalPoolCount, receivedCount);
  } else {
    state.totalPoolCount++;
  }

  return immutableDanmu;
}

function _pushLocal(danmu: Danmu) {
  const immutableDanmu = pushDisplayLocal(danmu);
  if (!immutableDanmu) return;

  // 展示与抽奖解耦：只要开启展示，弹幕就进入大屏；不因此进入奖池。
  if (state.isDisplaying) {
    state.activeDanmu.push(immutableDanmu);
    if (state.activeDanmu.length > MAX_ACTIVE) {
      state.activeDanmu.splice(0, state.activeDanmu.length - MAX_ACTIVE);
    }
  }

  // 未开始攒能量时只更新用户资料和灯牌缓存，不进入本轮奖池。
  if (!state.isCollecting) return;

  // 弹幕进入队列后不会再被修改，跳过深层响应式代理可显著降低高频写入开销。
  // 奖池与本轮充能共用同一个明确的开始边界。
  appendWithBatchedHeadEviction(
    state.lotteryPool,
    immutableDanmu,
    MAX_POOL_SIZE,
    POOL_EVICTION_BATCH_SIZE,
    discardEligibleLotteryCandidates
  );
  indexLotteryCandidate(immutableDanmu);

  state.totalDanmuCount++;
  state.energy = Math.min(state.totalDanmuCount, settings.lotteryThreshold);

  persistState();

  // 满能量立即自动开奖。若当前弹幕均被关键词或灯牌规则过滤，
  // startLottery 会安全返回 false，并在下一条合格弹幕到来时再次尝试。
  if (state.totalDanmuCount >= settings.lotteryThreshold) startLottery();
}

function resetLiveSessionLocal(sessionId: string, persistLotteryReset = true): void {
  const normalizedSessionId = String(sessionId || '').trim().slice(0, 256);
  if (!normalizedSessionId || normalizedSessionId === currentLiveSessionId) return;
  if (cancelPendingLotteryBatch(persistLotteryReset) < 0) {
    console.error('[store] 旧直播间抽奖批次结算失败，暂不切换会话以避免混入新房间');
    return;
  }
  currentLiveSessionId = normalizedSessionId;
  recentDanmuKeys.clear();
  state.isCollecting = false;
  state.totalDanmuCount = 0;
  state.energy = 0;
  state.lotteryPool.splice(0);
  resetLotteryEligibilityIndex();
  state.activeDanmu.splice(0);
  state.isLotteryActive = false;
  state.lotteryResult = null;
  state.totalPoolCount = 0;
  state.displayDanmu.splice(0);
  displayDanmuSubscribers.forEach(subscriber => subscriber(null));
  // 中奖历史和累计轮数属于长期记录；只有抽奖状态所有者可以把本轮清空写回共享存储。
  // 侧边栏晚打开时会载入同源快照，但不得清掉弹幕大屏正在揭晓的 pending batch。
  if (persistLotteryReset) persistState(true, true);
}

/** 崩溃重载/晚开窗口只绑定主进程当前会话；同一场不得清掉已锁定批次。 */
function bindLiveSessionLocal(sessionId: string, persistSession = true): void {
  const normalizedSessionId = String(sessionId || '').trim().slice(0, 256);
  if (!normalizedSessionId || normalizedSessionId === currentLiveSessionId) return;
  if (!currentLiveSessionId) {
    const hasLegacyUnscopedState = pendingLotteryBatch.length > 0 || state.totalDanmuCount > 0 || state.energy > 0;
    if (hasLegacyUnscopedState) {
      // 旧版本没有保存会话号，不能把无法归属的旧奖池带进主进程明确告知的当前场。
      resetLiveSessionLocal(normalizedSessionId, persistSession);
      return;
    }
    currentLiveSessionId = normalizedSessionId;
    if (persistSession) persistState();
    return;
  }
  resetLiveSessionLocal(normalizedSessionId, persistSession);
}

/** 开始一场新的直播弹幕计数；不修改幸运记录。 */
export function beginLiveSession(sessionId: string): void {
  // Electron 中只有弹幕/侧边栏窗口负责处理状态，主页只通过主进程广播。
  // 否则同一条消息会在主页和弹幕窗口各累计一次，并产生互相覆盖的开奖状态。
  if (window.electronAPI?.resetDanmuSession) {
    window.electronAPI.resetDanmuSession(sessionId);
    return;
  }
  resetLiveSessionLocal(sessionId);
  try {
    channel.postMessage({ type: 'live-session-reset', data: { sessionId } });
  } catch {}
}

export function pushDanmu(danmu: Danmu) {
  // Electron 主页是消息源而不是状态拥有者；只转发一次，由各展示窗口本地消费。
  if (window.electronAPI?.sendDanmu) {
    window.electronAPI.sendDanmu(danmu);
    return;
  }
  _pushLocal(danmu);
  try {
    channel.postMessage({ type: 'danmu', data: danmu });
  } catch {}
}

/**
 * 右侧展示页使用轻量增量订阅，不依赖整个响应式数组重新计算。
 * null 表示开始了新的直播会话，需要清空旧画面。
 */
export function subscribeDisplayDanmu(subscriber: DisplayDanmuSubscriber): () => void {
  displayDanmuSubscribers.add(subscriber);
  return () => displayDanmuSubscribers.delete(subscriber);
}

export function removeActiveDanmu(id: string) {
  const idx = state.activeDanmu.findIndex(d => d.id === id);
  if (idx !== -1) state.activeDanmu.splice(idx, 1);
}

/** 开始单纯的弹幕展示，不会创建奖池或累计抽奖能量。 */
export function startDisplaying() {
  state.isDisplaying = true;
}

/** 停止弹幕展示，不影响正在进行的抽奖。 */
export function stopDisplaying() {
  state.isDisplaying = false;
  state.activeDanmu.splice(0);
}

/** 开始攒能量（能量从 0 开始，同时确保弹幕大屏可见） */
export function startCollecting() {
  state.isDisplaying = true;
  state.isCollecting = true;
  state.totalDanmuCount = 0;
  state.energy = 0;
  state.lotteryPool.splice(0);
  resetLotteryEligibilityIndex();
}

/** 停止攒能量；展示模式可继续保持开启。 */
export function stopCollecting() {
  state.isCollecting = false;
}

function getCurrentEligiblePool(): Danmu[] {
  compactEligibleLotteryPool();
  return eligibleLotteryPool;
}

export function canStartLottery(): boolean {
  return getLotteryStartBlockReason() === null;
}

export type LotteryStartBlockReason =
  | 'not-collecting'
  | 'already-active'
  | 'threshold-not-reached'
  | 'no-remaining-winners'
  | 'empty-pool'
  | 'no-eligible-candidates'
  | null;

export function getLotteryStartBlockReason(): LotteryStartBlockReason {
  const baseReason = getAutomaticLotteryBlockReason({
    isCollecting: state.isCollecting,
    isLotteryActive: state.isLotteryActive,
    totalDanmuCount: state.totalDanmuCount,
    lotteryThreshold: settings.lotteryThreshold,
    remainingWinnerCount: normalizeWinnerCount(appSettings.value.remainingWinnerCount),
    lotteryPoolSize: state.lotteryPool.length
  });
  if (baseReason) return baseReason;
  return lotteryEligibilityState.count > 0 ? null : 'no-eligible-candidates';
}

/** 达到阈值后同步锁定整批结果，再启动动画，避免资格检查与开奖之间出现竞态。 */
export function startLottery(): boolean {
  const baseReason = getAutomaticLotteryBlockReason({
    isCollecting: state.isCollecting,
    isLotteryActive: state.isLotteryActive,
    totalDanmuCount: state.totalDanmuCount,
    lotteryThreshold: settings.lotteryThreshold,
    remainingWinnerCount: normalizeWinnerCount(appSettings.value.remainingWinnerCount),
    lotteryPoolSize: state.lotteryPool.length
  });
  if (baseReason) return false;
  try {
    if (prepareLotteryBatch(settings.lotteryWinnerCount).length === 0) return false;
    // 锁定中奖结果后仍保留并继续接收飘屏弹幕；中奖层会覆盖在飘屏之上。
    state.isLotteryActive = true;
    return true;
  } catch (error) {
    console.error('[store] 自动抽奖锁定中奖者失败:', error);
    state.isLotteryActive = false;
    return false;
  }
}

// 修改资格条件时才重算整个奖池；高频新弹幕走上面的单条增量路径。
watch(
  [
    () => settings.lotteryKeyword,
    () => settings.lotteryUserCooldownEnabled,
    () => appSettings.value.lotteryBadgeLevel
  ],
  () => {
    rebuildLotteryEligibilityIndex();
    if (getLotteryStartBlockReason() === null) startLottery();
  }
);

// 降低阈值或补充中奖名额后也应立即重新尝试。
watch(
  [
    () => state.isCollecting,
    () => settings.lotteryThreshold,
    () => appSettings.value.remainingWinnerCount
  ],
  () => {
    state.energy = Math.min(state.totalDanmuCount, settings.lotteryThreshold);
    if (getLotteryStartBlockReason() === null) startLottery();
  }
);

function getSecureCrypto(): Crypto {
  const secureCrypto = globalThis.crypto;
  if (!secureCrypto?.getRandomValues) {
    throw new Error('当前环境不支持安全随机数，已停止抽奖');
  }
  return secureCrypto;
}

/** 使用拒绝采样消除取模偏差，等概率返回 [0, upperBound) 的整数。 */
function secureRandomIndex(upperBound: number): number {
  if (!Number.isSafeInteger(upperBound) || upperBound <= 0 || upperBound > 0x100000000) {
    throw new RangeError('安全随机数范围无效');
  }
  const randomValues = new Uint32Array(1);
  const range = 0x100000000;
  const unbiasedLimit = range - range % upperBound;
  let value: number;
  do {
    getSecureCrypto().getRandomValues(randomValues);
    value = randomValues[0];
  } while (value >= unbiasedLimit);
  return value % upperBound;
}

function secureRecordId(prefix: string): string {
  const secureCrypto = getSecureCrypto();
  if (typeof secureCrypto.randomUUID === 'function') return secureCrypto.randomUUID();
  const bytes = new Uint8Array(16);
  secureCrypto.getRandomValues(bytes);
  return `${prefix}-${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * 一次性锁定本轮全部中奖者，但暂不写入中奖记录。
 * 动画逐个揭晓时再调用 revealLotteryWinner，避免页面提前暴露完整结果。
 */
export function prepareLotteryBatch(requestedCount = settings.lotteryWinnerCount): Danmu[] {
  if (pendingLotteryBatch.length > 0) {
    const existingBatchId = String(pendingLotteryBatch[0]?.batchId || '').trim();
    const revealedIds = new Set(state.lotteryHistory.map(item => item.winRecordId).filter(Boolean));
    pendingLotteryBatch = pendingLotteryBatch.filter(item => !revealedIds.has(item.winRecordId));
    if (pendingLotteryBatch.length === 0) {
      // 最后一位已经写入历史、但 renderer 在完成账本结算前崩溃时，在这里补完提交。
      if (existingBatchId) {
        try { finalizeLotteryBatch(existingBatchId, 0); } catch {}
      }
      persistState(true, true);
    } else {
      const batchId = String(pendingLotteryBatch[0]?.batchId || '').trim();
      if (!batchId) return [...pendingLotteryBatch];
      const usesReservationLedger = pendingLotteryBatch[0]?.lotteryReservationVersion === 1;
      const reservation = reserveLotteryBatch(
        batchId,
        pendingLotteryBatch.length,
        !usesReservationLedger
      );
      if (reservation.status !== 'active' || reservation.reserved <= 0) {
        pendingLotteryBatch = [];
        persistState(true, true);
        return [];
      }
      if (pendingLotteryBatch.length > reservation.reserved) {
        pendingLotteryBatch = pendingLotteryBatch.slice(0, reservation.reserved);
      }
      pendingLotteryBatch.forEach((winner, index) => {
        winner.batchPosition = index + 1;
        winner.batchSize = pendingLotteryBatch.length;
        winner.lotteryReservationVersion = 1;
      });
      const drawNo = Number(pendingLotteryBatch[0]?.drawNo) || 0;
      if (drawNo > state.lotteryCount) state.lotteryCount = drawNo;
      persistState(true, true);
      return [...pendingLotteryBatch];
    }
  }
  let pool = getCurrentEligiblePool();
  if (pool.length === 0) return [];
  const targetCount = Math.min(normalizeLotteryWinnerCount(requestedCount), pool.length);
  const nextDrawNo = state.lotteryCount + 1;
  const wonAt = Date.now();
  const batchId = secureRecordId(`batch-${wonAt}`);
  const winners: Danmu[] = [];

  while (winners.length < targetCount && pool.length > 0) {
    const index = secureRandomIndex(pool.length);
    // 如果这个用户之前或之后的完整消息带出过 display_id，在锁定中奖者时补全。
    const selected = enrichDanmuUserId(pool[index]);
    const selectedKeys = new Set(getParticipantKeys(selected));
    winners.push({
      ...selected,
      winRecordId: secureRecordId(`${wonAt}-${winners.length}`),
      drawNo: nextDrawNo,
      wonAt: wonAt + winners.length,
      batchId,
      batchPosition: winners.length + 1,
      batchSize: targetCount,
      lotteryReservationVersion: 1
    });
    // 同一用户即使发送了多条弹幕，本轮也只能中奖一次。
    pool = pool.filter(candidate => {
      return !getParticipantKeys(candidate).some(key => selectedKeys.has(key));
    });
  }

  // 先把待揭晓名单写入同源存储，再让主进程按 batchId 原子预留。任一边界崩溃后，
  // 重启都能用相同批次号继续或结算，既不会永久少名额，也不会重复返还。
  pendingLotteryBatch = winners.map(winner => markRaw(winner));
  if (!persistState(true, true)) {
    pendingLotteryBatch = [];
    try { localStorage.removeItem(PENDING_LOTTERY_KEY); } catch {}
    return [];
  }
  const reservation = reserveLotteryBatch(batchId, winners.length);
  if (reservation.status !== 'active' || reservation.reserved <= 0) {
    pendingLotteryBatch = [];
    persistState(true, true);
    return [];
  }
  if (reservation.reserved < winners.length) winners.splice(reservation.reserved);
  winners.forEach(winner => { winner.batchSize = winners.length; });
  state.lotteryCount = nextDrawNo;
  state.lotteryResult = null;
  pendingLotteryBatch = winners.map(winner => markRaw(winner));
  // 整批结果必须先落盘，避免多人 Happy 过程中退出后未揭晓结果丢失。
  persistState(true, true);
  return winners;
}

/** 将当前揭晓的中奖者加入历史记录。 */
export function revealLotteryWinner(winner: Danmu): void {
  const pendingWinner = pendingLotteryBatch.find(item => (
    Boolean(item.winRecordId) && item.winRecordId === winner.winRecordId
  ));
  // 会话重置、手动取消或 renderer 恢复后，旧定时器不得把已取消批次写回历史。
  if (!pendingWinner) return;
  if (state.lotteryHistory.some(item => item.winRecordId === winner.winRecordId)) return;
  // Happy 卡片记录主播实际点击揭晓的时间，而不是整批结果预生成的时间。
  pendingWinner.wonAt = Date.now();
  state.lotteryResult = pendingWinner;
  state.lotteryHistory.push(pendingWinner);
  if (state.lotteryHistory.length > MAX_LOTTERY_HISTORY) {
    state.lotteryHistory.splice(0, state.lotteryHistory.length - MAX_LOTTERY_HISTORY);
  }
  pendingLotteryBatch = pendingLotteryBatch.filter(item => item.winRecordId !== winner.winRecordId);
  // 中奖是关键记录，不能等待节流计时器，避免关闭窗口或重复实例覆盖后丢失。
  const persisted = persistState(true, true);
  if (persisted && pendingLotteryBatch.length === 0 && pendingWinner.batchId) {
    try {
      finalizeLotteryBatch(pendingWinner.batchId, 0);
    } catch (error) {
      // 名额已在预留时扣除；完成标记可在重启恢复时安全补写，不影响当前中奖结果。
      console.warn('[store] 抽奖批次完成标记暂未写入，将在恢复时重试:', error);
    }
  }
}

/** 保留单人抽奖调用兼容性。 */
export function drawLottery(): Danmu | null {
  const winner = prepareLotteryBatch(1)[0] ?? null;
  if (winner) revealLotteryWinner(winner);
  return winner;
}

export function closeLottery() {
  if (cancelPendingLotteryBatch(true) < 0) return false;
  state.isLotteryActive = false;
  state.lotteryResult = null;
  // 关闭中奖层不打断仍在飞行的弹幕；它们会在各自动画结束时自然移除。
  return persistState(true, true);
}

export function setConnected(val: boolean) {
  state.connected = val;
}

function resetDanmuStateLocal(): boolean {
  if (cancelPendingLotteryBatch(true) < 0) return false;
  state.isCollecting = false;
  state.totalDanmuCount = 0;
  state.energy = 0;
  state.lotteryPool.splice(0);
  resetLotteryEligibilityIndex();
  state.activeDanmu.splice(0);
  state.isLotteryActive = false;
  state.lotteryResult = null;
  return persistState(true, true);
}

export function resetDanmuState() {
  const requestOwnerReset = window.electronAPI?.requestDanmuStateReset;
  if (!requestOwnerReset) {
    resetDanmuStateLocal();
    return;
  }
  void requestOwnerReset()
    .then(result => {
      const routed = typeof result === 'object' && result !== null
        ? Boolean(result.routed)
        : Boolean(result);
      // 没有打开弹幕窗口时，本窗口可以安全清理共享的持久化状态。
      if (routed) return;
      const requestId = typeof result === 'object' && result !== null
        ? String(result.requestId || '')
        : '';
      let succeeded = false;
      try {
        succeeded = resetDanmuStateLocal();
      } finally {
        if (requestId) {
          window.electronAPI?.completeDanmuStateResetFallback?.(requestId, succeeded);
        }
      }
    })
    .catch(error => {
      console.warn('[store] 请求弹幕窗口重置失败，改为本地重置:', error);
      resetDanmuStateLocal();
    });
}

export function clearLotteryHistory() {
  if (cancelPendingLotteryBatch(true) < 0) return;
  state.isLotteryActive = false;
  state.lotteryResult = null;
  state.lotteryHistory.splice(0);
  state.lotteryCount = 0;
  persistState(true, true);
}

export function deleteLotteryItems(ids: Set<string>) {
  state.lotteryHistory = state.lotteryHistory.filter(d => !ids.has(d.winRecordId || d.id));
  persistState(true, true);
}

// ===== 监听 =====

let stopElectronDanmuListener: (() => void) | null = null;
let stopElectronSessionListener: (() => void) | null = null;
let stopElectronSessionBindListener: (() => void) | null = null;
let stopElectronStateResetListener: (() => void) | null = null;

export function startListening(options: { displayOnly?: boolean } = {}) {
  // 避免页面重复挂载时遗留旧监听。
  stopListening();

  // Electron 环境只使用 IPC；否则同一条弹幕会同时经 BroadcastChannel 和 IPC 到达。
  const api = (window as any).electronAPI;
  if (api?.onDanmu) {
    stopElectronDanmuListener = api.onDanmu((danmu: Danmu) => {
      if (options.displayOnly) pushDisplayLocal(danmu, false);
      else _pushLocal(danmu);
    });
    stopElectronSessionListener = api.onDanmuSessionReset?.((sessionId: string) => {
      resetLiveSessionLocal(sessionId, !options.displayOnly);
    }) || null;
    stopElectronSessionBindListener = api.onDanmuSessionBind?.((sessionId: string) => {
      bindLiveSessionLocal(sessionId, !options.displayOnly);
    }) || null;
    stopElectronStateResetListener = !options.displayOnly
      ? api.onDanmuStateReset?.(resetDanmuStateLocal) || null
      : null;
    // 请求回放缓存的弹幕
    if (api.requestBuffer) {
      api.requestBuffer();
    }
    return;
  }

  // 浏览器环境使用同源 BroadcastChannel。
  channel.onmessage = (event) => {
    const msg = event.data;
    if (msg.type === 'danmu' && msg.data) {
      if (options.displayOnly) pushDisplayLocal(msg.data, false);
      else _pushLocal(msg.data);
    } else if (msg.type === 'live-session-reset' && msg.data?.sessionId) {
      resetLiveSessionLocal(msg.data.sessionId, !options.displayOnly);
    }
  };
}

export function stopListening() {
  channel.onmessage = null;
  stopElectronDanmuListener?.();
  stopElectronSessionListener?.();
  stopElectronSessionBindListener?.();
  stopElectronStateResetListener?.();
  stopElectronDanmuListener = null;
  stopElectronSessionListener = null;
  stopElectronSessionBindListener = null;
  stopElectronStateResetListener = null;
}

export function useDanmuState() {
  return state;
}
