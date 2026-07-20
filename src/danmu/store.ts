import { reactive } from 'vue';
import type { Danmu, DanmuState, DanmuSettings } from './types';

/** 屏幕最大同时显示弹幕数 */
const MAX_ACTIVE = 100;

/** 抽奖池最大容量 */
const MAX_POOL_SIZE = 500000;

/** localStorage keys */
const STATE_KEY = 'dycast_danmu_state';
const SETTINGS_KEY = 'dycast_danmu_settings';

/** 默认设置 */
const defaultSettings: DanmuSettings = {
  lotteryThreshold: 10000,
  fontSize: 15,
  speedBase: 12,
  speedRange: 3,
  minFansLevel: 0
};

// ===== BroadcastChannel =====
const channel = new BroadcastChannel('dycast-danmu');

// ===== 设置（独立持久化） =====
function loadSettings(): DanmuSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {}
  return { ...defaultSettings };
}

function saveSettings(s: DanmuSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {}
}

export const settings = reactive<DanmuSettings>(loadSettings());

export function updateSettings(partial: Partial<DanmuSettings>) {
  Object.assign(settings, partial);
  saveSettings(settings);
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

const state = reactive<DanmuState>({
  connected: false,
  wsUrl: '',
  isCollecting: false,
  totalDanmuCount: restored.totalDanmuCount || 0,
  totalPoolCount: restored.totalPoolCount || 0,
  energy: restored.energy || 0,
  lotteryPool: [],
  activeDanmu: [],
  isLotteryActive: false,
  lotteryResult: null,
  lotteryHistory: restored.lotteryHistory || [],
  lotteryCount: restored.lotteryCount || 0
});

// 初始化 energy 基于当前阈值
state.energy = state.totalDanmuCount % settings.lotteryThreshold;

// ===== 持久化（节流 1 秒） =====
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function persistState() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      localStorage.setItem(
        STATE_KEY,
        JSON.stringify({
          totalDanmuCount: state.totalDanmuCount,
          totalPoolCount: state.totalPoolCount,
          energy: state.energy,
          lotteryCount: state.lotteryCount,
          lotteryHistory: state.lotteryHistory.slice(-100)
        })
      );
    } catch (e) { console.warn('[store] 状态持久化失败:', e); }
  }, 1000);
}

// ===== 弹幕操作 =====

function _pushLocal(danmu: Danmu) {
  // 粉丝灯牌等级过滤
  const fansLevel = danmu.fansClub?.level || 0;
  if (settings.minFansLevel > 0 && fansLevel < settings.minFansLevel) {
    return; // 等级不够，不参与抽奖也不显示
  }

  // 始终加入抽奖池（不论是否在攒能量）
  state.lotteryPool.push(danmu);
  state.totalPoolCount++;
  if (state.lotteryPool.length > MAX_POOL_SIZE) {
    state.lotteryPool.splice(0, state.lotteryPool.length - MAX_POOL_SIZE);
  }

  // 只有在攒能量状态下才累计和显示
  if (!state.isCollecting) return;

  state.totalDanmuCount++;
  state.energy = state.totalDanmuCount % settings.lotteryThreshold;

  // 加入显示队列
  state.activeDanmu.push(danmu);
  if (state.activeDanmu.length > MAX_ACTIVE) {
    state.activeDanmu.splice(0, state.activeDanmu.length - MAX_ACTIVE);
  }

  persistState();

  // 检测触发抽奖
  if (state.energy === 0 && state.totalDanmuCount > 0) {
    triggerLottery();
  }
}

export function pushDanmu(danmu: Danmu) {
  _pushLocal(danmu);
  try {
    channel.postMessage({ type: 'danmu', data: danmu });
  } catch {}
}

export function removeActiveDanmu(id: string) {
  const idx = state.activeDanmu.findIndex(d => d.id === id);
  if (idx !== -1) state.activeDanmu.splice(idx, 1);
}

/** 开始攒能量（能量从 0 开始） */
export function startCollecting() {
  state.isCollecting = true;
  state.totalDanmuCount = 0;
  state.energy = 0;
  state.activeDanmu.splice(0);
}

/** 停止攒能量（保留数据，只是停止显示和累计） */
export function stopCollecting() {
  state.isCollecting = false;
  state.activeDanmu.splice(0);
}

function triggerLottery() {
  if (state.lotteryPool.length === 0) return;
  state.isLotteryActive = true;
}

export function drawLottery(): Danmu {
  const pool = state.lotteryPool;
  const index = Math.floor(Math.random() * pool.length);
  const winner = { ...pool[index] };

  state.lotteryResult = winner;
  state.lotteryCount++;
  state.lotteryHistory.push(winner);
  persistState();

  return winner;
}

export function closeLottery() {
  state.isLotteryActive = false;
  state.lotteryResult = null;
}

export function setConnected(val: boolean) {
  state.connected = val;
}

export function resetDanmuState() {
  state.totalDanmuCount = 0;
  state.totalPoolCount = 0;
  state.energy = 0;
  state.lotteryPool.splice(0);
  state.activeDanmu.splice(0);
  state.isLotteryActive = false;
  state.lotteryResult = null;
  persistState();
}

export function clearLotteryHistory() {
  state.lotteryHistory.splice(0);
  state.lotteryCount = 0;
  persistState();
}

export function deleteLotteryItems(ids: Set<string>) {
  state.lotteryHistory = state.lotteryHistory.filter(d => !ids.has(d.id));
  state.lotteryCount = state.lotteryHistory.length;
  persistState();
}

// ===== 监听 =====

export function startListening() {
  // BroadcastChannel 监听（同源非 Electron 环境）
  channel.onmessage = (event) => {
    const msg = event.data;
    if (msg.type === 'danmu' && msg.data) {
      _pushLocal(msg.data);
    }
  };
  // Electron IPC 监听（跨窗口通信）
  const api = (window as any).electronAPI;
  if (api?.onDanmu) {
    api.onDanmu((danmu: Danmu) => {
      _pushLocal(danmu);
    });
    // 请求回放缓存的弹幕
    if (api.requestBuffer) {
      api.requestBuffer();
    }
  }
}

export function stopListening() {
  channel.onmessage = null;
}

export function useDanmuState() {
  return state;
}
