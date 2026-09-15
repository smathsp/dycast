export const COMMENT_RECORDS_STORAGE_KEY = 'dycast_comment_records_v1';
const COMMENT_RECORDS_LIMIT = 500;

export interface CommentRecordItem {
  id: string;
  avatar: string;
  nickname: string;
  content: string;
  emojiUrl?: string;
  timestamp: number;
  /** 当前主播灯牌等级；0 或缺失表示没有灯牌。 */
  badgeLevel?: number;
}

export interface StoredCommentRecord extends CommentRecordItem {
  recordKey: string;
  recordedAt: number;
}

export function getCommentRecordKey(record: CommentRecordItem): string {
  return `${record.id || ''}:${Number(record.timestamp) || 0}:${record.content || ''}`;
}

export function loadCommentRecords(): StoredCommentRecord[] {
  try {
    const value = JSON.parse(localStorage.getItem(COMMENT_RECORDS_STORAGE_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    return value
      .filter(record => record && typeof record === 'object' && String(record.content || '').trim())
      .map(record => ({
        id: String(record.id || ''),
        avatar: String(record.avatar || ''),
        nickname: String(record.nickname || ''),
        content: String(record.content || ''),
        emojiUrl: record.emojiUrl ? String(record.emojiUrl) : undefined,
        timestamp: Number(record.timestamp) || Date.now(),
        badgeLevel: Math.min(99, Math.max(0, Math.round(Number(record.badgeLevel) || 0))),
        recordKey: String(record.recordKey || getCommentRecordKey(record)),
        recordedAt: Number(record.recordedAt) || Number(record.timestamp) || Date.now()
      }));
  } catch {
    return [];
  }
}

export function saveCommentRecord(item: CommentRecordItem): StoredCommentRecord[] {
  const recordKey = getCommentRecordKey(item);
  const records = loadCommentRecords().filter(record => record.recordKey !== recordKey);
  records.unshift({
    id: String(item.id || ''),
    avatar: String(item.avatar || ''),
    nickname: String(item.nickname || ''),
    content: String(item.content || ''),
    emojiUrl: item.emojiUrl ? String(item.emojiUrl) : undefined,
    timestamp: Number(item.timestamp) || Date.now(),
    badgeLevel: Math.min(99, Math.max(0, Math.round(Number(item.badgeLevel) || 0))),
    recordKey,
    recordedAt: Date.now()
  });
  const nextRecords = records.slice(0, COMMENT_RECORDS_LIMIT);
  localStorage.setItem(COMMENT_RECORDS_STORAGE_KEY, JSON.stringify(nextRecords));
  return nextRecords;
}

export function removeCommentRecord(recordKey: string): StoredCommentRecord[] {
  const records = loadCommentRecords().filter(record => record.recordKey !== recordKey);
  localStorage.setItem(COMMENT_RECORDS_STORAGE_KEY, JSON.stringify(records));
  return records;
}

export function clearCommentRecords(): void {
  localStorage.removeItem(COMMENT_RECORDS_STORAGE_KEY);
}
