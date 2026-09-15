import type { Danmu } from './types';

export type CurrentAnchorBadge = NonNullable<Danmu['fansClub']>[number];

function normalizeAnchorId(value: unknown): string {
  return String(value ?? '').trim();
}

/** 获取该弹幕属于当前直播间主播的灯牌；同主播重复数据取最高等级。 */
export function getCurrentAnchorBadge(danmu: Danmu): CurrentAnchorBadge | undefined {
  const currentAnchorId = normalizeAnchorId(danmu.targetAnchorId);
  if (!currentAnchorId) return undefined;
  return (danmu.fansClub || [])
    .filter(club => normalizeAnchorId(club.anchorId) === currentAnchorId)
    .reduce<CurrentAnchorBadge | undefined>((highest, club) => {
      if (!highest || (Number(club.level) || 0) > (Number(highest.level) || 0)) return club;
      return highest;
    }, undefined);
}

/** 获取该弹幕在当前直播间主播粉丝团中的灯牌等级。 */
export function getCurrentAnchorBadgeLevel(danmu: Danmu): number {
  return Math.max(0, Number(getCurrentAnchorBadge(danmu)?.level) || 0);
}

/** 检查弹幕是否满足灯牌等级预设。 */
export function meetsBadgeLevel(
  danmu: Danmu,
  level: number
): boolean {
  if (level === 0) return true;

  // 只检查当前直播间主播的灯牌等级。
  return getCurrentAnchorBadgeLevel(danmu) >= level;
}

function getLegacyParticipantKeys(danmu: Danmu): string[] {
  const nickname = String(danmu?.nickname ?? '').trim().toLocaleLowerCase('zh-CN') || '匿名';
  const keys = [`name:${nickname}`];
  if (danmu.avatar) keys.push(`avatar:${danmu.avatar}`);
  return keys;
}

/** 生成同一批抽奖内用于识别同一观众的标识。 */
export function getParticipantKeys(winner: Danmu): string[] {
  const keys: string[] = [];
  if (winner.secUid) keys.push(`secuid:${winner.secUid}`);
  if (winner.userId) {
    keys.push(/^\d+$/.test(winner.userId)
      ? `uid:${winner.userId}`
      : `secuid:${winner.userId}`);
  }
  return keys.length > 0 ? Array.from(new Set(keys)) : getLegacyParticipantKeys(winner);
}

export function getPrimaryParticipantKey(candidate: Danmu): string {
  if (candidate.secUid) return `secuid:${candidate.secUid}`;
  if (candidate.userId) return `uid:${candidate.userId}`;
  if (candidate.avatar) return `avatar:${candidate.avatar}`;
  return `name:${String(candidate?.nickname ?? '').trim().toLocaleLowerCase('zh-CN') || '匿名'}`;
}

function normalizeKeywordText(value: unknown): string {
  return String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('zh-CN');
}

export interface LotteryEligibilityOptions {
  /** 弹幕内容必须包含的关键词；留空表示不限。 */
  keyword?: string;
  /** 同一用户两张有效票之间的最短间隔，0 表示关闭。 */
  userCooldownSeconds?: number;
}

/** 判断一条新弹幕是否满足当前关键词和灯牌条件。 */
export function isLotteryCandidateEligible(
  candidate: Danmu,
  badgeLevel: number,
  keywordValue: unknown = ''
): boolean {
  const keyword = normalizeKeywordText(keywordValue);
  const contentMatches = !keyword || normalizeKeywordText(candidate.content).includes(keyword);
  return contentMatches && meetsBadgeLevel(candidate, badgeLevel);
}

/**
 * 生成当前可参与抽奖的弹幕池。
 * 历史中奖者可在后续新一轮再次参与；同一批内的用户去重由锁定中奖者时完成。
 */
export function getEligibleLotteryPool(
  pool: Danmu[],
  badgeLevel: number,
  options: LotteryEligibilityOptions = {},
): Danmu[] {
  const keyword = normalizeKeywordText(options.keyword);
  const cooldownMs = Math.max(0, Number(options.userCooldownSeconds) || 0) * 1000;

  const eligible = pool.filter(candidate => isLotteryCandidateEligible(candidate, badgeLevel, keyword));

  if (!cooldownMs) return eligible;

  const lastTicketAt = new Map<string, number>();
  return eligible
    .slice()
    .sort((a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0))
    .filter(candidate => {
      const participantKey = getPrimaryParticipantKey(candidate);
      const timestamp = Number(candidate.timestamp) || 0;
      const previousTimestamp = lastTicketAt.get(participantKey);
      if (previousTimestamp !== undefined && timestamp - previousTimestamp < cooldownMs) return false;
      lastTicketAt.set(participantKey, timestamp);
      return true;
    });
}
