/**
 * 弹幕字号设置是 0–4 级的基础字号，灯牌阶段越高越醒目。
 * 低基数字号使用最小增量，较大基数按比例放大；15 级以上最高 88px。
 */
export function normalizeDanmuBaseFontSize(value: number): number {
  return Math.min(48, Math.max(12, Math.round(Number(value) || 15)));
}

export function getDanmuTierFontSize(level: number, baseFontSize: number): number {
  const base = normalizeDanmuBaseFontSize(baseFontSize);
  if (level >= 15) return Math.min(88, Math.max(base + 12, Math.round(base * 1.55)));
  if (level >= 10) return Math.min(76, Math.max(base + 7, Math.round(base * 1.3)));
  if (level >= 5) return Math.min(48, Math.max(base + 2, Math.round(base * 1.08)));
  return base;
}

function normalizeNickname(value: unknown): string {
  return String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('zh-CN');
}

export function getRedDanmuNicknameKeywords(value: unknown): string[] {
  return String(value ?? '')
    .split(/[\n,，;；]+/)
    .map(normalizeNickname)
    .filter((keyword, index, keywords) => Boolean(keyword) && keywords.indexOf(keyword) === index);
}

export function matchesRedDanmuNickname(nickname: unknown, configuredKeywords: unknown): boolean {
  const normalizedNickname = normalizeNickname(nickname);
  if (!normalizedNickname) return false;
  return getRedDanmuNicknameKeywords(configuredKeywords)
    .some(keyword => normalizedNickname.includes(keyword));
}

/** 昵称特例只提升视觉档位，不改变真实灯牌数字。 */
export function getDanmuVisualLevel(level: number, nickname: unknown, configuredKeywords: unknown): number {
  const normalizedLevel = Math.max(0, Number(level) || 0);
  return matchesRedDanmuNickname(nickname, configuredKeywords)
    ? Math.max(15, normalizedLevel)
    : normalizedLevel;
}
