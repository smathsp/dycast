export interface FlyingDanmuWidthInput {
  nickname?: string;
  content?: string;
  hasEmoji: boolean;
  badgeLevel?: number;
  fontSize: number;
  visualLevel: number;
  height: number;
  viewportWidth: number;
}

export interface FlyingDanmuWidthLayout {
  width: number;
  panelLeft: number;
  panelRight: number;
  nicknameWidth: number;
  contentWidth: number;
}

export const MAX_FLYING_DANMU_WIDTH_PX = 16384;

/**
 * 将文字实际宽度、美术两端和 CSS 列间距一次性算入移动图层，保证看到的范围、
 * 动画离场距离与文字可点击范围使用同一份几何数据。
 */
export function calculateFlyingDanmuWidth(
  input: FlyingDanmuWidthInput,
  measureText: (text: string, fontSize: number) => number
): FlyingDanmuWidthLayout {
  const fontSize = Math.max(12, Number(input.fontSize) || 12);
  const height = Math.max(1, Number(input.height) || 1);
  const level = Math.max(0, Number(input.visualLevel) || 0);
  const viewportWidth = Math.max(640, Number(input.viewportWidth) || 0);
  const tier = level >= 15
    ? { sourceHeight: 300, left: 230, right: 440, minPanel: 160 }
    : level >= 10
      ? { sourceHeight: 174, left: 192, right: 428, minPanel: 150 }
      : level >= 5
        ? { sourceHeight: height, left: 12, right: 20, minPanel: 190 }
        : { sourceHeight: height, left: 10, right: 18, minPanel: 150 };
  const artworkScale = height / tier.sourceHeight;
  const edgeLeft = tier.left * artworkScale;
  const edgeRight = tier.right * artworkScale;
  const panelInsetLeft = level >= 5 ? 2 : 8;
  const panelInsetRight = 12;
  const nicknameText = `${input.nickname || '匿名'}：`;
  const nicknameNaturalWidth = Math.max(fontSize, measureText(nicknameText, fontSize))
    + Math.max(2, fontSize * .1);
  const contentNaturalWidth = input.hasEmoji
    ? fontSize * 1.2
    : Math.max(fontSize, measureText(input.content || '', fontSize)) + Math.max(3, fontSize * .16);
  const avatarWidth = Math.min(46, Math.max(30, fontSize * 1.05));
  const badgeFontSize = Math.max(23, fontSize * .82);
  const hasBadge = Number(input.badgeLevel) > 0;
  const badgeWidth = hasBadge ? Math.max(42, measureText(`${input.badgeLevel}级`, badgeFontSize)) : 0;
  const columnGap = Math.min(8, Math.max(4, viewportWidth * .004));
  const gapCount = hasBadge ? 3 : 2;
  const fixedWidth = edgeLeft + edgeRight + panelInsetLeft + panelInsetRight
    + avatarWidth + badgeWidth + columnGap * gapCount;
  const availableTextWidth = Math.max(fontSize * 2, MAX_FLYING_DANMU_WIDTH_PX - fixedWidth);
  let nicknameWidth = nicknameNaturalWidth;
  let contentWidth = contentNaturalWidth;
  if (nicknameWidth + contentWidth > availableTextWidth) {
    nicknameWidth = Math.min(nicknameWidth, Math.max(fontSize * 2, availableTextWidth * .25));
    contentWidth = Math.max(fontSize, availableTextWidth - nicknameWidth);
  }
  const panelContentWidth = avatarWidth + badgeWidth + nicknameWidth + contentWidth + columnGap * gapCount;
  const desiredWidth = edgeLeft + edgeRight + panelInsetLeft + panelInsetRight
    + Math.max(tier.minPanel, panelContentWidth);

  return {
    width: Math.min(
      MAX_FLYING_DANMU_WIDTH_PX,
      Math.max(edgeLeft + edgeRight + tier.minPanel, desiredWidth)
    ),
    panelLeft: edgeLeft + panelInsetLeft,
    panelRight: edgeRight + panelInsetRight,
    nicknameWidth,
    contentWidth
  };
}
