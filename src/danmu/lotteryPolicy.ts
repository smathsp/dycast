export const MIN_LOTTERY_THRESHOLD = 10;
export const MAX_LOTTERY_THRESHOLD = 999_999_999;
export const DEFAULT_LOTTERY_THRESHOLD = 100;

export function normalizeLotteryThreshold(
  value: unknown,
  fallback = DEFAULT_LOTTERY_THRESHOLD
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return Math.min(MAX_LOTTERY_THRESHOLD, Math.max(MIN_LOTTERY_THRESHOLD, Math.round(fallback)));
  }
  return Math.min(MAX_LOTTERY_THRESHOLD, Math.max(MIN_LOTTERY_THRESHOLD, Math.round(parsed)));
}

export interface AutomaticLotteryState {
  isCollecting: boolean;
  isLotteryActive: boolean;
  totalDanmuCount: number;
  lotteryThreshold: number;
  remainingWinnerCount: number;
  lotteryPoolSize: number;
}

export type AutomaticLotteryBlockReason =
  | 'not-collecting'
  | 'already-active'
  | 'threshold-not-reached'
  | 'no-remaining-winners'
  | 'empty-pool'
  | null;

/** 只判断是否应该尝试锁定中奖者；关键词和灯牌资格由奖池筛选负责。 */
export function getAutomaticLotteryBlockReason(
  state: AutomaticLotteryState
): AutomaticLotteryBlockReason {
  if (!state.isCollecting) return 'not-collecting';
  if (state.isLotteryActive) return 'already-active';
  if (state.totalDanmuCount < normalizeLotteryThreshold(state.lotteryThreshold)) {
    return 'threshold-not-reached';
  }
  if (!Number.isFinite(Number(state.remainingWinnerCount)) || Number(state.remainingWinnerCount) <= 0) {
    return 'no-remaining-winners';
  }
  if (!Number.isFinite(Number(state.lotteryPoolSize)) || Number(state.lotteryPoolSize) <= 0) {
    return 'empty-pool';
  }
  return null;
}

export function shouldAttemptAutomaticLottery(state: AutomaticLotteryState): boolean {
  return getAutomaticLotteryBlockReason(state) === null;
}
