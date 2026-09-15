import type { Settings } from './settingUtil';
import {
  consumeRemainingWinnerCountPersistently,
  flushSettings,
  restoreRemainingWinnerCountPersistently,
  setRemainingWinnerCountPersistently,
  useSettings
} from './settingUtil';

const MAX_COUNTDOWN_SECONDS = 99 * 60 * 60 + 59 * 60 + 59;
const MAX_WINNER_COUNT = 9999;

export interface LotteryBatchMutationResult {
  batchId: string;
  reserved: number;
  restored: number;
  status: 'active' | 'finalized' | 'missing';
}

const browserLotteryReservations = new Map<string, LotteryBatchMutationResult>();

export function normalizeCountdownSeconds(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(MAX_COUNTDOWN_SECONDS, Math.max(0, Math.round(parsed)));
}

export function formatCountdown(seconds: unknown): string {
  const safeSeconds = normalizeCountdownSeconds(seconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;
  return [hours, minutes, remainingSeconds]
    .map(value => String(value).padStart(2, '0'))
    .join(':');
}

export function parseCountdown(value: string): number | null {
  const match = String(value || '').trim().match(/^(\d{1,2}):([0-5]\d):([0-5]\d)$/);
  if (!match) return null;
  return normalizeCountdownSeconds(Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]));
}

export function getRemainingCountdownSeconds(settings: Settings, now = Date.now()): number {
  if (!settings.liveCountdownRunning || settings.liveCountdownEndAt <= 0) {
    return normalizeCountdownSeconds(settings.liveCountdownPausedSeconds);
  }
  return normalizeCountdownSeconds(Math.ceil((settings.liveCountdownEndAt - now) / 1000));
}

export function setCountdownDuration(seconds: number): void {
  const settings = useSettings();
  const normalized = normalizeCountdownSeconds(seconds);
  settings.value.liveCountdownInitialSeconds = normalized;
  settings.value.liveCountdownPausedSeconds = normalized;
  settings.value.liveCountdownEndAt = 0;
  settings.value.liveCountdownRunning = false;
  flushSettings();
}

export function startCountdown(): boolean {
  const settings = useSettings();
  const remaining = getRemainingCountdownSeconds(settings.value);
  if (remaining <= 0) return false;
  settings.value.liveCountdownPausedSeconds = remaining;
  settings.value.liveCountdownEndAt = Date.now() + remaining * 1000;
  settings.value.liveCountdownRunning = true;
  flushSettings();
  return true;
}

export function pauseCountdown(): void {
  const settings = useSettings();
  settings.value.liveCountdownPausedSeconds = getRemainingCountdownSeconds(settings.value);
  settings.value.liveCountdownEndAt = 0;
  settings.value.liveCountdownRunning = false;
  flushSettings();
}

export function resetCountdown(): void {
  const settings = useSettings();
  settings.value.liveCountdownPausedSeconds = normalizeCountdownSeconds(settings.value.liveCountdownInitialSeconds);
  settings.value.liveCountdownEndAt = 0;
  settings.value.liveCountdownRunning = false;
  flushSettings();
}

export function normalizeWinnerCount(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(MAX_WINNER_COUNT, Math.max(0, Math.round(parsed)));
}

export function setRemainingWinnerCount(value: unknown): void {
  setRemainingWinnerCountPersistently(normalizeWinnerCount(value));
}

/** 扣除已锁定的实际中奖人数，返回本次真正扣除的名额。 */
export function consumeRemainingWinnerCount(value: unknown): number {
  return consumeRemainingWinnerCountPersistently(value);
}

/** 取消未揭晓批次时，把已经预留但尚未使用的名额原子返还。 */
export function restoreRemainingWinnerCount(value: unknown): number {
  return restoreRemainingWinnerCountPersistently(value);
}

/**
 * Electron 通过主进程批次账本幂等预留；纯浏览器预览沿用本地计数逻辑。
 */
export function reserveLotteryBatch(
  batchId: string,
  value: unknown,
  legacyAlreadyReserved = false
): LotteryBatchMutationResult {
  const requested = Math.min(24, normalizeWinnerCount(value));
  const reserveCanonical = window.electronAPI?.reserveLotteryBatch;
  if (reserveCanonical) {
    const result = reserveCanonical({ batchId, requested, legacyAlreadyReserved });
    return {
      batchId: String(result.batchId || batchId),
      reserved: Math.min(24, normalizeWinnerCount(result.reserved)),
      restored: Math.min(24, normalizeWinnerCount(result.restored)),
      status: result.status === 'active' || result.status === 'finalized' ? result.status : 'missing'
    };
  }
  const existing = browserLotteryReservations.get(batchId);
  if (existing) {
    return existing.status === 'active'
      ? { ...existing }
      : { ...existing, reserved: 0, restored: 0 };
  }
  const reserved = legacyAlreadyReserved ? requested : consumeRemainingWinnerCount(requested);
  const result: LotteryBatchMutationResult = {
    batchId,
    reserved,
    restored: 0,
    status: reserved > 0 ? 'active' : 'finalized'
  };
  browserLotteryReservations.set(batchId, result);
  return { ...result };
}

/** 同一批次只结算一次；unrevealed 是需要返还的尚未揭晓人数。 */
export function finalizeLotteryBatch(batchId: string, unrevealed: unknown): LotteryBatchMutationResult {
  const requestedRestore = Math.min(24, normalizeWinnerCount(unrevealed));
  const finalizeCanonical = window.electronAPI?.finalizeLotteryBatch;
  if (finalizeCanonical) {
    const result = finalizeCanonical({ batchId, unrevealed: requestedRestore });
    return {
      batchId: String(result.batchId || batchId),
      reserved: Math.min(24, normalizeWinnerCount(result.reserved)),
      restored: Math.min(24, normalizeWinnerCount(result.restored)),
      status: result.status === 'active' || result.status === 'finalized' ? result.status : 'missing'
    };
  }
  const existing = browserLotteryReservations.get(batchId);
  if (!existing) return { batchId, reserved: 0, restored: 0, status: 'missing' };
  if (existing.status === 'finalized') return { ...existing, restored: 0 };
  const restored = restoreRemainingWinnerCount(Math.min(existing.reserved, requestedRestore));
  const result: LotteryBatchMutationResult = {
    batchId,
    reserved: existing.reserved,
    restored,
    status: 'finalized'
  };
  browserLotteryReservations.set(batchId, result);
  return { ...result };
}
