export interface MovingDanmuSnapshot {
  spawnedAtMs: number;
  durationSeconds: number;
  widthPx: number;
  velocityPxPerSecond: number;
}

export interface MovingDanmuCollisionInput {
  existing: MovingDanmuSnapshot;
  nowMs: number;
  viewportWidthPx: number;
  newDurationSeconds: number;
  newWidthPx: number;
  safeGapPx?: number;
}

/**
 * 判断一条刚从屏幕右侧进入的弹幕是否可能追上正在移动的弹幕。
 * 这里使用与 CSS 动画一致的实际像素路径，避免长弹幕仍按固定百分比估算。
 */
export function mayMovingDanmuMeet(input: MovingDanmuCollisionInput): boolean {
  const existing = input.existing;
  const elapsedSeconds = Math.max(0, (input.nowMs - existing.spawnedAtMs) / 1000);
  if (elapsedSeconds >= existing.durationSeconds) return false;

  const viewportWidthPx = Math.max(1, input.viewportWidthPx);
  const safeGapPx = Math.max(0, input.safeGapPx ?? 24);
  const existingVelocity = Math.max(.1, existing.velocityPxPerSecond);
  const existingLeft = viewportWidthPx - existingVelocity * elapsedSeconds;
  const existingRight = existingLeft + Math.max(0, existing.widthPx);

  // 上一条的尾部尚未完整进入屏幕时，新弹幕必须先等待。
  if (existingRight + safeGapPx >= viewportWidthPx) return true;

  const newDurationSeconds = Math.max(.1, input.newDurationSeconds);
  const newVelocity = (viewportWidthPx + Math.max(0, input.newWidthPx) + safeGapPx) /
    newDurationSeconds;
  if (newVelocity <= existingVelocity) return false;

  const initialClearance = viewportWidthPx - existingRight - safeGapPx;
  const catchTime = initialClearance / (newVelocity - existingVelocity);
  const existingRemaining = (existingRight + safeGapPx) / existingVelocity;
  return catchTime >= 0 && catchTime < Math.min(existingRemaining, newDurationSeconds);
}
