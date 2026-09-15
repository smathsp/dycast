import { ref, watch } from 'vue';
import {
  createStorageEventWriteGuard,
  diffPersistentSettingsValues,
  enqueuePersistentSettingsSection,
  getRetainedPersistentSettingsSection,
  markPersistentSettingsCanonicalPatch,
  mergePersistentSettingsValues,
  registerPersistentSettingsFlushHook
} from './persistentSettingsQueue';
import { createSettingsPatchVersionTracker } from './settingsPatchVersion';

const STORAGE_KEY = 'dycast_settings';

export type LotteryBadgeMode = 'max';

export interface Settings {
  /** 显示礼物价值 */
  showGiftPrice: boolean;
  /** 显示总计价值 */
  showGiftTotal: boolean;
  /** 置顶礼物价值阈值（抖币） */
  giftHighlightThreshold: number;
  /** 置顶显示时长（秒） */
  giftHighlightDuration: number;
  /** 最高灯牌等级限制；0 表示不限，手动输入范围 0-30。 */
  lotteryBadgeLevel: number;
  /** 当前直播间主播的灯牌等级筛选。 */
  lotteryBadgeMode: LotteryBadgeMode;
  /** 是否启用观众弹幕页的 AI 精选 */
  aiCurationEnabled: boolean;
  /** OpenAI Chat Completions 兼容接口地址 */
  aiCurationEndpoint: string;
  /** API 密钥；Electron 中交由主进程加密保存，浏览器模式仅保留在当前会话内 */
  aiCurationApiKey: string;
  /** 接口使用的模型名称 */
  aiCurationModel: string;
  /** AI 筛选间隔（秒） */
  aiCurationInterval: number;
  /** AI 推荐悬浮卡片未点击时的自动展示时长（秒） */
  commentHighlightDuration: number;
  /** 绿幕直播倒计时的复位时长（秒）。 */
  liveCountdownInitialSeconds: number;
  /** 倒计时暂停时保留的剩余秒数。 */
  liveCountdownPausedSeconds: number;
  /** 倒计时运行时对应的绝对结束时间。 */
  liveCountdownEndAt: number;
  /** 倒计时是否处于运行状态。 */
  liveCountdownRunning: boolean;
  /** 仍可抽取的实际中奖人数。 */
  remainingWinnerCount: number;
}

const defaultSettings: Settings = {
  showGiftPrice: true,
  showGiftTotal: true,
  giftHighlightThreshold: 100,
  giftHighlightDuration: 5,
  lotteryBadgeLevel: 0,
  lotteryBadgeMode: 'max',
  aiCurationEnabled: false,
  aiCurationEndpoint: 'https://api.openai.com/v1/chat/completions',
  aiCurationApiKey: '',
  aiCurationModel: 'gpt-4o-mini',
  aiCurationInterval: 60,
  commentHighlightDuration: 10,
  liveCountdownInitialSeconds: 2 * 60 * 60,
  liveCountdownPausedSeconds: 2 * 60 * 60,
  liveCountdownEndAt: 0,
  liveCountdownRunning: false,
  remainingWinnerCount: 10
};

function normalizeCountdownSeconds(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(359999, Math.max(0, Math.round(parsed)))
    : fallback;
}

function normalizeWinnerCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(9999, Math.max(0, Math.round(parsed)))
    : defaultSettings.remainingWinnerCount;
}

/**
 * 从 localStorage 加载设置
 */
function loadSettings(): Settings {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      const stored = JSON.parse(data) as Partial<Settings>;
      const lotteryBadgeMode: LotteryBadgeMode = 'max';
      const legacySettings = stored as Partial<Settings> & { targetAnchors?: unknown };
      const storedSettings = { ...legacySettings };
      delete storedSettings.targetAnchors;
      const legacyAIApiKey = String(storedSettings.aiCurationApiKey || '').trim().slice(0, 4096);
      delete storedSettings.aiCurationApiKey;
      const lotteryBadgeLevel = Math.min(30, Math.max(0, Math.round(Number(stored.lotteryBadgeLevel) || 0)));
      const aiCurationInterval = Math.min(
        600,
        Math.max(20, Math.round(Number(stored.aiCurationInterval) || defaultSettings.aiCurationInterval))
      );
      const commentHighlightDuration = Math.min(
        120,
        Math.max(3, Math.round(Number(stored.commentHighlightDuration) || defaultSettings.commentHighlightDuration))
      );
      const liveCountdownInitialSeconds = normalizeCountdownSeconds(
        stored.liveCountdownInitialSeconds,
        defaultSettings.liveCountdownInitialSeconds
      );
      const liveCountdownPausedSeconds = normalizeCountdownSeconds(
        stored.liveCountdownPausedSeconds,
        liveCountdownInitialSeconds
      );
      const liveCountdownEndAt = Number.isFinite(Number(stored.liveCountdownEndAt))
        ? Math.max(0, Math.round(Number(stored.liveCountdownEndAt)))
        : 0;
      return {
        ...defaultSettings,
        ...storedSettings,
        aiCurationApiKey: legacyAIApiKey,
        lotteryBadgeMode,
        lotteryBadgeLevel,
        aiCurationInterval,
        commentHighlightDuration,
        liveCountdownInitialSeconds,
        liveCountdownPausedSeconds,
        liveCountdownEndAt,
        liveCountdownRunning: Boolean(stored.liveCountdownRunning && liveCountdownEndAt > 0),
        remainingWinnerCount: normalizeWinnerCount(stored.remainingWinnerCount)
      };
    }
  } catch {}
  return { ...defaultSettings };
}

type PersistedSettings = Record<string, unknown>;

function getPersistedSettingsSnapshot(source: Settings): PersistedSettings {
  const persistedSettings: Partial<Settings> = { ...source };
  delete persistedSettings.aiCurationApiKey;
  return JSON.parse(JSON.stringify(persistedSettings)) as PersistedSettings;
}

function writeSettingsToLocalStorage(source: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(getPersistedSettingsSnapshot(source)));
  } catch {}
}

/** 全局设置状态 */
const settings = ref<Settings>(loadSettings());
const legacyAIApiKey = settings.value.aiCurationApiKey;
const storageEventWriteGuard = createStorageEventWriteGuard();
let saveTimer: number | null = null;
let pendingSettingsPatch: PersistedSettings = {};
let pendingSettingsPatchVersion = 0;
let observedSettingsSnapshot = getPersistedSettingsSnapshot(settings.value);
let lastCanonicalSettingsSnapshot = observedSettingsSnapshot;
let canonicalSettingsRevision = 0;
let nextInFlightPatchId = 1;
const inFlightSettingsPatches = new Map<number, {
  patch: PersistedSettings;
  version: number;
  canonicalRevision: number;
}>();
const settingsPatchVersionTracker = createSettingsPatchVersionTracker();

function getUncommittedSettingsPatch(): PersistedSettings {
  // 队列已向调用方报告失败后仍会保留补丁等待退出重试。它必须继续叠加在
  // 权威快照之上，否则此时收到一条无关字段广播会让界面短暂回滚失败值。
  let result = getRetainedPersistentSettingsSection('app');
  for (const entry of inFlightSettingsPatches.values()) {
    const currentPatch = settingsPatchVersionTracker.filterForRetry(entry.patch, entry.version);
    result = mergePersistentSettingsValues(result, currentPatch);
  }
  return mergePersistentSettingsValues(result, pendingSettingsPatch);
}

function scheduleSettingsSave(): void {
  if (saveTimer !== null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(flushSettings, 120);
}

function saveSettingsPatch(patch: PersistedSettings, patchVersion: number): void {
  writeSettingsToLocalStorage(settings.value);
  if (Object.keys(patch).length === 0) return;

  const patchId = nextInFlightPatchId++;
  inFlightSettingsPatches.set(patchId, {
    patch,
    version: patchVersion,
    canonicalRevision: canonicalSettingsRevision
  });
  void enqueuePersistentSettingsSection('app', patch).then(saved => {
    const completedPatch = inFlightSettingsPatches.get(patchId);
    inFlightSettingsPatches.delete(patchId);
    if (completedPatch && canonicalSettingsRevision > completedPatch.canonicalRevision) {
      // 广播到达时会暂时叠加尚未完成的本地补丁；补丁完成/被取代后重新合成，
      // 避免界面永远停留在已经禁止重试的旧值。
      applyCanonicalAppSettings(lastCanonicalSettingsSnapshot);
    }
    // 失败值由公共队列保留；后续设置或退出 flush 会重试。队列会在重试前
    // 根据主进程权威广播裁掉已被更新覆盖的字段。
    if (!saved) console.warn('[settings] 应用设置将在下次刷新时重试');
  });
}

function applyCanonicalAppSettings(value: object, canonicalPatch?: object): void {
  let canonical: Settings;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    canonical = loadSettings();
  } catch {
    return;
  }
  const canonicalSnapshot = getPersistedSettingsSnapshot(canonical);
  const canonicalChanges = diffPersistentSettingsValues(
    lastCanonicalSettingsSnapshot,
    canonicalSnapshot
  );
  lastCanonicalSettingsSnapshot = canonicalSnapshot;
  canonicalSettingsRevision += 1;
  const supersedingPatch = canonicalPatch && typeof canonicalPatch === 'object' && !Array.isArray(canonicalPatch)
    ? canonicalPatch as PersistedSettings
    : canonicalChanges;
  if (Object.keys(supersedingPatch).length > 0) {
    // 权威广播比此前排队的本地失败更新更晚；同字段旧值不得再次重试。
    markPersistentSettingsCanonicalPatch('app', supersedingPatch);
  }
  const combinedPersisted = mergePersistentSettingsValues(
    canonicalSnapshot,
    getUncommittedSettingsPatch()
  );
  const combined = {
    ...combinedPersisted,
    aiCurationApiKey: settings.value.aiCurationApiKey || ''
  } as unknown as Settings;
  storageEventWriteGuard.runWithoutWrite(() => {
    settings.value = combined;
  });
  writeSettingsToLocalStorage(combined);
  observedSettingsSnapshot = getPersistedSettingsSnapshot(combined);
}

// 浏览器模式依靠 storage 同步；Electron 使用主进程落盘后的权威广播，避免
// 任一窗口刚写入 localStorage 的旧整份快照短暂回滚另一窗口的字段。
window.addEventListener('storage', (event) => {
  if (window.electronAPI?.onPersistentSettingsSectionUpdated) return;
  if (event.key !== STORAGE_KEY || !event.newValue) return;
  try {
    applyCanonicalAppSettings(JSON.parse(event.newValue));
  } catch {}
});

window.electronAPI?.onPersistentSettingsSectionUpdated?.((section, value, canonicalPatch) => {
  if (section === 'app' && value && typeof value === 'object') {
    applyCanonicalAppSettings(value, canonicalPatch);
  }
});

export function flushSettings(): void {
  if (saveTimer !== null) window.clearTimeout(saveTimer);
  saveTimer = null;
  if (Object.keys(pendingSettingsPatch).length === 0) return;
  const patch = pendingSettingsPatch;
  const patchVersion = pendingSettingsPatchVersion;
  pendingSettingsPatch = {};
  pendingSettingsPatchVersion = 0;
  saveSettingsPatch(patch, patchVersion);
}

// 表单输入可能逐字触发深度监听，合并为一次持久化，降低同步 localStorage 写入开销。
watch(settings, () => {
  if (!storageEventWriteGuard.shouldWrite()) return;
  const nextSnapshot = getPersistedSettingsSnapshot(settings.value);
  let changed = diffPersistentSettingsValues(observedSettingsSnapshot, nextSnapshot);
  observedSettingsSnapshot = nextSnapshot;
  if (
    window.electronAPI?.setRemainingWinnerCount
    && Object.prototype.hasOwnProperty.call(changed, 'remainingWinnerCount')
  ) {
    const { remainingWinnerCount, ...ordinaryChanges } = changed;
    changed = ordinaryChanges;
    setRemainingWinnerCountPersistently(remainingWinnerCount);
  }
  if (Object.keys(changed).length === 0) return;
  pendingSettingsPatchVersion = settingsPatchVersionTracker.record(changed);
  pendingSettingsPatch = mergePersistentSettingsValues(pendingSettingsPatch, changed);
  scheduleSettingsSave();
}, { deep: true, flush: 'sync' });

registerPersistentSettingsFlushHook(flushSettings);

// 老版本曾将 API Key 明文放在 localStorage；启动后立即移除并迁移到系统加密存储。
if (legacyAIApiKey) {
  writeSettingsToLocalStorage(settings.value);
  if (window.electronAPI?.setAIApiKey) {
    void window.electronAPI.setAIApiKey(legacyAIApiKey, settings.value.aiCurationEndpoint)
      .then(() => {
        if (settings.value.aiCurationApiKey === legacyAIApiKey) {
          settings.value.aiCurationApiKey = '';
        }
      })
      .catch((error) => console.warn('[settings] 迁移 AI API Key 失败:', error));
  }
}

function normalizeWinnerMutationAmount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(9999, Math.max(0, Math.round(parsed)))
    : 0;
}

function applyWinnerCountMutationSettings(value: unknown): void {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    applyCanonicalAppSettings(value);
  }
}

/**
 * 名额的设置、预留和返还都同步经过主进程的同一份公共文档。开奖频率很低，
 * 这里短暂等待磁盘落盘，可确保界面锁定的人数一定等于实际扣除的人数。
 */
export function setRemainingWinnerCountPersistently(value: unknown): number {
  const next = normalizeWinnerMutationAmount(value);
  const setCanonical = window.electronAPI?.setRemainingWinnerCount;
  if (setCanonical) {
    try {
      const result = setCanonical(next);
      applyWinnerCountMutationSettings(result.settings);
      return normalizeWinnerCount(result.remainingWinnerCount);
    } catch (error) {
      console.warn('[settings] 设置剩余中奖名额失败:', error);
      return normalizeWinnerCount(settings.value.remainingWinnerCount);
    }
  }
  settings.value.remainingWinnerCount = next;
  flushSettings();
  return next;
}

export function consumeRemainingWinnerCountPersistently(value: unknown): number {
  const requested = normalizeWinnerMutationAmount(value);
  if (requested <= 0) return 0;
  const consumeCanonical = window.electronAPI?.consumeRemainingWinnerCount;
  if (consumeCanonical) {
    try {
      const result = consumeCanonical(requested);
      applyWinnerCountMutationSettings(result.settings);
      return Math.min(requested, normalizeWinnerMutationAmount(result.consumed));
    } catch (error) {
      console.warn('[settings] 原子扣减剩余中奖名额失败:', error);
      return 0;
    }
  }
  const current = normalizeWinnerCount(settings.value.remainingWinnerCount);
  const consumed = Math.min(current, requested);
  settings.value.remainingWinnerCount = current - consumed;
  flushSettings();
  return consumed;
}

export function restoreRemainingWinnerCountPersistently(value: unknown): number {
  const requested = normalizeWinnerMutationAmount(value);
  if (requested <= 0) return 0;
  const restoreCanonical = window.electronAPI?.restoreRemainingWinnerCount;
  if (restoreCanonical) {
    try {
      const result = restoreCanonical(requested);
      applyWinnerCountMutationSettings(result.settings);
      return Math.min(requested, normalizeWinnerMutationAmount(result.restored));
    } catch (error) {
      console.warn('[settings] 返还未揭晓中奖名额失败:', error);
      return 0;
    }
  }
  const current = normalizeWinnerCount(settings.value.remainingWinnerCount);
  const restored = Math.min(9999 - current, requested);
  settings.value.remainingWinnerCount = current + restored;
  flushSettings();
  return restored;
}

/**
 * 使用设置
 */
export function useSettings() {
  return settings;
}
