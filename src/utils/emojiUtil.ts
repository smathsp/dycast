import { emojis } from '@/core/emoji';

export interface DouyinEmojiSegment {
  type: 'text' | 'emoji';
  text: string;
  url?: string;
}

/**
 * 使用仓库自带的抖音表情表拆分弹幕。
 * 已收录的 `[看]` 等标签变成原表情图片，未知标签保持原文，避免错误猜测。
 */
export function parseDouyinEmojiContent(content?: string): DouyinEmojiSegment[] {
  const value = content || '';
  if (!value) return [];

  const segments: DouyinEmojiSegment[] = [];
  const pattern = /\[[^\[\]]+]/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value))) {
    if (match.index > cursor) {
      segments.push({ type: 'text', text: value.slice(cursor, match.index) });
    }
    const label = match[0];
    const url = emojis[label];
    segments.push(url
      ? { type: 'emoji', text: label, url }
      : { type: 'text', text: label });
    cursor = match.index + label.length;
  }

  if (cursor < value.length) {
    segments.push({ type: 'text', text: value.slice(cursor) });
  }
  return segments.length ? segments : [{ type: 'text', text: value }];
}
