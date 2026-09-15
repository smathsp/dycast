/**
 * 向有上限的高频队列追加一项。到达上限后按块淘汰队首，避免此后每条消息都
 * 移动整个大数组；回调仍能让调用方同步清理派生索引。
 */
export function appendWithBatchedHeadEviction<T>(
  items: T[],
  item: T,
  maximumSize: number,
  evictionBatchSize: number,
  onEvicted?: (removed: T[]) => void
): T[] {
  const limit = Math.max(1, Math.floor(Number(maximumSize) || 1));
  const batchSize = Math.max(1, Math.min(limit, Math.floor(Number(evictionBatchSize) || 1)));
  items.push(item);
  if (items.length <= limit) return [];

  const overflow = items.length - limit;
  const removed = items.splice(0, Math.max(overflow, batchSize));
  if (removed.length) onEvicted?.(removed);
  return removed;
}
