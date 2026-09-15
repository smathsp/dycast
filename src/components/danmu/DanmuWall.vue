<template>
  <div class="danmu-wall approved-wall">
    <div
      v-for="item in displayDanmu"
      :key="item.id"
      class="danmu-item"
      :class="getBadgeTierClass(item._visualLevel)"
      :style="{
        top: `${item._y}%`,
        left: '0',
        '--approved-width': `${item._displayWidthPx}px`,
        '--panel-left-px': `${item._panelLeftPx}px`,
        '--panel-right-px': `${item._panelRightPx}px`,
        '--nickname-width-px': `${item._nicknameWidthPx}px`,
        '--content-width-px': `${item._contentWidthPx}px`,
        fontSize: `${getDanmuTierFontSize(item._visualLevel, settings.fontSize)}px`,
        animation: `danmuScroll ${item._speed}s linear forwards`
      }"
      @animationend.self="onDanmuEnd(item.id)"
      @click.stop="emit('select', item)">
      <span class="approved-skin" aria-hidden="true"></span>
      <span class="tier-crest" aria-hidden="true"></span>
      <span class="tier-tail" aria-hidden="true"></span>
      <span v-if="item._visualLevel >= 10" class="tier-fragments" aria-hidden="true"><i></i><i></i><i></i></span>
      <span v-if="item._visualLevel >= 10" class="tier-aura" aria-hidden="true"></span>
      <span v-if="item._visualLevel >= 15" class="dragon-pattern" aria-hidden="true"></span>
      <img v-if="item.avatar" class="danmu-avatar" :src="item.avatar" alt="" />
      <span v-else class="danmu-avatar danmu-avatar-fallback">{{ getInitial(item.nickname) }}</span>
      <span v-if="item._badge && item._badgeLevel > 0" class="badge-level-mark danmu-click-target" :aria-label="`当前主播灯牌 ${item._badgeLevel} 级`">
        <b>{{ item._badgeLevel }}级</b>
      </span>
      <span class="danmu-nickname danmu-click-target">{{ item.nickname || '匿名' }}：</span>
      <span class="danmu-content danmu-click-target" v-html="item._parsedContent"></span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch, watchEffect } from 'vue';
import { useDanmuState, settings, removeActiveDanmu, subscribeDisplayDanmu } from '@/danmu/store';
import type { Danmu } from '@/danmu/types';
import { getCurrentAnchorBadge, type CurrentAnchorBadge } from '@/danmu/lottery';
import { mayMovingDanmuMeet } from '@/danmu/trajectory';
import { getDanmuTierFontSize, getDanmuVisualLevel } from '@/danmu/visual';
import { calculateFlyingDanmuWidth } from '@/danmu/widthLayout';
import { parseDouyinEmojiContent } from '@/utils/emojiUtil';

interface DisplayDanmu extends Danmu {
  _y: number;
  _speed: number;
  _parsedContent: string;
  _badge?: CurrentAnchorBadge;
  _badgeLevel: number;
  _visualLevel: number;
  _spawnedAt: number;
  _displayWidthPx: number;
  _panelLeftPx: number;
  _panelRightPx: number;
  _nicknameWidthPx: number;
  _contentWidthPx: number;
  _velocityPxPerSecond: number;
  _heightPercent: number;
}

const state = useDanmuState();
const displayDanmu = ref<DisplayDanmu[]>([]);
const emit = defineEmits<{
  (event: 'select', danmu: Danmu): void;
}>();

function getBadgeTierClass(level: number): string {
  if (level >= 15) return 'badge-tier-red';
  if (level >= 10) return 'badge-tier-purple';
  if (level >= 5) return 'badge-tier-orange';
  return 'badge-tier-white';
}

function getInitial(nickname?: string): string {
  return (nickname || '观').trim().slice(0, 1).toUpperCase();
}

/**
 * 转义 HTML 实体，防止 XSS 注入
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 解析弹幕内容，先转义 HTML，再将 [捂脸] 等标签转为 emoji 图片
 */
function parseContent(content?: string, emojiUrl?: string): string {
  if (emojiUrl) {
    return `<img class="danmu-emoji" src="${escapeHtml(emojiUrl)}" alt="${escapeHtml(content || '会员表情')}" />`;
  }
  if (!content) return '';
  return parseDouyinEmojiContent(content).map(segment => {
    if (segment.type === 'text') return escapeHtml(segment.text);
    return `<img class="danmu-emoji" src="${escapeHtml(segment.url || '')}" alt="${escapeHtml(segment.text)}" />`;
  }).join('');
}

/** 持久化的已显示弹幕 ID 集合，避免每次 watcher 重建 */
const displayedIds = new Set<string>();
const pendingRetryTick = ref(0);
let pendingRetryTimer: ReturnType<typeof setTimeout> | null = null;
let staleDanmuTimer: ReturnType<typeof setInterval> | null = null;
let stopSessionResetSubscription: (() => void) | null = null;

function clearFlyingDanmu(): void {
  if (pendingRetryTimer) clearTimeout(pendingRetryTimer);
  pendingRetryTimer = null;
  if (staleDanmuTimer) clearInterval(staleDanmuTimer);
  staleDanmuTimer = null;
  displayDanmu.value.splice(0);
  displayedIds.clear();
}

onMounted(() => {
  // 会话切换会清空 store 的弹幕队列，但已飞出的画面由本组件单独维护。
  stopSessionResetSubscription = subscribeDisplayDanmu(danmu => {
    if (danmu === null) clearFlyingDanmu();
  });
});

watch(() => state.activeDanmu.length, length => {
  // 手动重置也会清空 activeDanmu，却不会发送直播会话的 null 通知。
  if (length === 0 && displayDanmu.value.length > 0) clearFlyingDanmu();
});

function schedulePendingRetry(): void {
  if (pendingRetryTimer) return;
  pendingRetryTimer = setTimeout(() => {
    pendingRetryTimer = null;
    pendingRetryTick.value += 1;
  }, 280);
}

function estimateHeightPixels(level: number, fontSize: number): number {
  const viewportWidth = Math.max(640, window.innerWidth);
  const skinHeight = level >= 15
    ? Math.min(294, Math.max(150, viewportWidth * 0.153))
    : level >= 10
      ? Math.min(170, Math.max(104, viewportWidth * 0.088))
      : level >= 5
        ? Math.min(78, Math.max(56, viewportWidth * 0.043))
        : Math.min(64, Math.max(48, viewportWidth * 0.042));
  return Math.max(skinHeight, fontSize + (level >= 15 ? 42 : level >= 10 ? 28 : 22));
}

function estimateHeightPercent(pixelHeight: number): number {
  return Math.min(36, pixelHeight / Math.max(360, window.innerHeight) * 100);
}

let measurementContext: CanvasRenderingContext2D | null = null;
function estimateTextWidth(text: string, fontSize: number): number {
  const conservativeEstimate = Array.from(text).reduce((width, character) => {
    if (/\s/.test(character)) return width + fontSize * .35;
    if (/^[\x20-\x7e]$/.test(character)) return width + fontSize * .59;
    // CJK 字形按略大于字号预留，避免不同字体回退时只差少量像素被截断。
    return width + fontSize * 1.04;
  }, 0);
  if (!measurementContext) {
    measurementContext = document.createElement('canvas').getContext('2d');
  }
  if (!measurementContext) return conservativeEstimate;
  measurementContext.font = `700 ${fontSize}px "LXGW WenKai", "Microsoft YaHei UI", sans-serif`;
  // 留出字体 hinting、描边和不同 DPI 下的亚像素误差，杜绝尾字只差几像素被裁。
  return Math.max(conservativeEstimate, measurementContext.measureText(text).width * 1.08 + 4);
}

/** 判断新弹幕在横向移动过程中是否可能追上现有弹幕。 */
function mayMeetHorizontally(existing: DisplayDanmu, newSpeed: number, newWidthPx: number): boolean {
  return mayMovingDanmuMeet({
    existing: {
      spawnedAtMs: existing._spawnedAt,
      durationSeconds: existing._speed,
      widthPx: existing._displayWidthPx,
      velocityPxPerSecond: existing._velocityPxPerSecond
    },
    nowMs: performance.now(),
    viewportWidthPx: window.innerWidth,
    newDurationSeconds: newSpeed,
    newWidthPx
  });
}

function getVerticalGap(y: number, height: number, existing: DisplayDanmu): number {
  if (y >= existing._y + existing._heightPercent) return y - existing._y - existing._heightPercent;
  if (existing._y >= y + height) return existing._y - y - height;
  return -Math.min(height, existing._heightPercent);
}

/**
 * 保留连续随机位置，不使用固定轨道；从多组随机候选中选择轨迹最安全的一组。
 */
function chooseRandomY(speed: number, widthPx: number, heightPercent: number): number | null {
  const blockers = displayDanmu.value.filter(existing => mayMeetHorizontally(existing, speed, widthPx));
  const minY = 3;
  const maxY = Math.max(minY, 97 - heightPercent);
  if (!blockers.length) return minY + Math.random() * (maxY - minY);

  const candidates = Array.from({ length: 32 }, () => {
    const y = minY + Math.random() * (maxY - minY);
    const score = Math.min(...blockers.map(existing => getVerticalGap(y, heightPercent, existing)));
    return { y, score };
  });
  const safeCandidates = candidates.filter(candidate => candidate.score >= 1.2);
  if (safeCandidates.length) {
    return safeCandidates[Math.floor(Math.random() * safeCandidates.length)].y;
  }
  // 完整神兽框无法安全放下时先排队；压扁或强塞都会破坏示意图效果。
  return null;
}

watchEffect(() => {
  pendingRetryTick.value;
  const arr = state.activeDanmu;
  const newcomers = arr.filter(d => !displayedIds.has(d.id));

  for (const danmu of newcomers) {
    const speed = settings.speedBase + Math.random() * settings.speedRange;
    const badge = getCurrentAnchorBadge(danmu);
    const badgeLevel = Math.max(0, Number(badge?.level) || 0);
    const visualLevel = getDanmuVisualLevel(badgeLevel, danmu.nickname, settings.redDanmuNicknameKeywords);
    const tierFontSize = getDanmuTierFontSize(visualLevel, settings.fontSize);
    const heightPixels = estimateHeightPixels(visualLevel, tierFontSize);
    const heightPercent = estimateHeightPercent(heightPixels);
    const widthLayout = calculateFlyingDanmuWidth({
      nickname: danmu.nickname,
      content: danmu.content,
      hasEmoji: Boolean(danmu.emojiUrl),
      badgeLevel,
      fontSize: tierFontSize,
      visualLevel,
      height: heightPixels,
      viewportWidth: window.innerWidth
    }, estimateTextWidth);
    const y = chooseRandomY(speed, widthLayout.width, heightPercent);
    if (y === null) {
      schedulePendingRetry();
      // 保持原始先后顺序，避免后来的低级弹幕越过正在等待的高级弹幕。
      break;
    }
    displayedIds.add(danmu.id);
    displayDanmu.value.push({
      ...danmu,
      _y: y,
      _speed: speed,
      _parsedContent: parseContent(danmu.content, danmu.emojiUrl),
      _badge: badge,
      _badgeLevel: badgeLevel,
      _visualLevel: visualLevel,
      _spawnedAt: performance.now(),
      _displayWidthPx: widthLayout.width,
      _panelLeftPx: widthLayout.panelLeft,
      _panelRightPx: widthLayout.panelRight,
      _nicknameWidthPx: widthLayout.nicknameWidth,
      _contentWidthPx: widthLayout.contentWidth,
      _velocityPxPerSecond: (Math.max(1, window.innerWidth) + widthLayout.width + 24) / Math.max(.1, speed),
      _heightPercent: heightPercent
    });
    ensureStaleDanmuWatchdog();
  }
});

function ensureStaleDanmuWatchdog(): void {
  if (staleDanmuTimer) return;
  staleDanmuTimer = setInterval(() => {
    const now = performance.now();
    const staleIds = displayDanmu.value
      .filter(item => now - item._spawnedAt > (item._speed + 5) * 1000)
      .map(item => item.id);
    staleIds.forEach(onDanmuEnd);
    if (!displayDanmu.value.length && staleDanmuTimer) {
      clearInterval(staleDanmuTimer);
      staleDanmuTimer = null;
    }
  }, 1000);
}

onBeforeUnmount(() => {
  stopSessionResetSubscription?.();
  stopSessionResetSubscription = null;
  clearFlyingDanmu();
});

function onDanmuEnd(id: string) {
  const idx = displayDanmu.value.findIndex(d => d.id === id);
  if (idx !== -1) {
    displayDanmu.value.splice(idx, 1);
  }
  displayedIds.delete(id);
  removeActiveDanmu(id);
}

</script>

<style lang="scss" scoped>
.danmu-wall {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.danmu-item {
  position: absolute;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 36px;
  padding: 4px 14px 4px 5px;
  background: rgba(5, 7, 25, 0.82);
  border: 1px solid rgba(91, 119, 191, 0.18);
  border-radius: 18px;
  box-shadow:
    0 3px 10px rgba(0, 0, 0, 0.25),
    inset 0 1px rgba(255, 255, 255, 0.04);
  backdrop-filter: blur(6px);
  color: #fff;
  // 外层美术画布不参与命中，只允许等级、昵称和弹幕文字触发放大。
  pointer-events: none;
  cursor: default;
  will-change: transform;
  overflow: hidden;

  > * {
    position: relative;
    z-index: 2;
  }

  .danmu-avatar {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
  }

  .danmu-nickname {
    color: #fff;
    font-weight: 800;
    font-size: 1em;
    flex-shrink: 0;
    text-shadow: 0 0 7px rgba(255, 255, 255, 0.22);
  }

  .danmu-content {
    color: rgba(255, 255, 255, 0.94);
    font-size: 1em;
    display: inline-flex;
    align-items: center;
    gap: 2px;

    :deep(.danmu-emoji) {
      width: 1.2em;
      height: 1.2em;
      vertical-align: middle;
      object-fit: contain;
    }
  }
}

.danmu-click-target {
  pointer-events: auto;
  cursor: zoom-in;
}

.badge-level-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin: 0 2px;
  flex-shrink: 0;
  color: #fff;

  b {
    font-family: 'PangMenZhengDaoCuShuTi', 'Arial Black', sans-serif;
    font-size: max(26px, 1em);
    font-weight: 400;
    line-height: 1;
    letter-spacing: 0;
    color: inherit;
    text-shadow: 0 0 4px rgba(255, 255, 255, 0.82), 0 0 10px rgba(168, 186, 225, 0.48);
    transform: translateY(1px);
  }
}

.danmu-item > .tier-aura {
  position: absolute;
  z-index: 1;
  inset: 0;
  pointer-events: none;
  transform-origin: center;
  mix-blend-mode: screen;
}

.danmu-item > .dragon-pattern {
  position: absolute;
  z-index: 1;
  top: 50%;
  right: 7px;
  width: clamp(190px, 30vw, 390px);
  height: calc(100% + 12px);
  pointer-events: none;
  transform: translateY(-50%);
  opacity: 0.5;
  mix-blend-mode: screen;
  filter: drop-shadow(0 0 4px rgba(255, 224, 143, 0.95)) drop-shadow(0 0 10px rgba(255, 64, 39, 0.7));
  mask-image: linear-gradient(90deg, transparent, #000 14%, #000 94%, transparent);
  animation: dragonPatternFloat 2.6s ease-in-out infinite alternate;

  svg {
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  path {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .dragon-body-glow {
    stroke: rgba(255, 48, 38, 0.65);
    stroke-width: 7;
    filter: blur(4px);
  }

  .dragon-body,
  .dragon-head,
  .dragon-neck {
    stroke: #ffe29a;
    stroke-width: 2.3;
  }

  .dragon-body {
    stroke-dasharray: 34 8 6 8;
    animation: dragonEnergyFlow 2.2s linear infinite;
  }

  .dragon-head {
    fill: rgba(255, 113, 42, 0.14);
  }

  .dragon-tail,
  .dragon-scales,
  .dragon-claws,
  .dragon-horns,
  .dragon-whiskers {
    stroke: rgba(255, 201, 100, 0.9);
    stroke-width: 1.55;
  }

  .dragon-cloud {
    stroke: rgba(255, 120, 62, 0.48);
    stroke-width: 1.2;
    stroke-dasharray: 5 5;
  }

  .dragon-eye {
    fill: #fff9d7;
    stroke: #ff3b35;
    stroke-width: 1;
    filter: drop-shadow(0 0 4px #fff) drop-shadow(0 0 7px #ff2e36);
    animation: dragonEyePulse 0.72s ease-in-out infinite alternate;
  }
}

.danmu-item.badge-tier-white {
  border-color: rgba(255, 255, 255, 0.28);
  background: linear-gradient(110deg, rgba(41, 45, 57, 0.9), rgba(8, 11, 25, 0.88));
  box-shadow: 0 3px 11px rgba(0, 0, 0, 0.28), inset 0 1px rgba(255, 255, 255, 0.07);

  .danmu-avatar { border: 1px solid rgba(255, 255, 255, 0.52); }
  .danmu-nickname { color: #fff; }
}

.danmu-item.badge-tier-orange {
  min-height: 38px;
  border-color: rgba(255, 157, 49, 0.66);
  background: linear-gradient(110deg, rgba(75, 38, 7, 0.94), rgba(25, 18, 19, 0.94) 56%, rgba(65, 29, 4, 0.92));
  box-shadow: 0 0 13px rgba(255, 127, 24, 0.34), inset 0 0 16px rgba(255, 147, 42, 0.08);

  &::before {
    content: '';
    position: absolute;
    z-index: 1;
    inset: -80% auto -80% -25%;
    width: 22%;
    transform: rotate(18deg);
    background: linear-gradient(90deg, transparent, rgba(255, 218, 147, 0.5), transparent);
    animation: badgeOrangeSweep 2.6s ease-in-out infinite;
  }

  .danmu-avatar { border: 2px solid #ff9d35; box-shadow: 0 0 9px rgba(255, 130, 34, 0.64); }
  .danmu-nickname { color: #ffad4d; text-shadow: 0 0 9px rgba(255, 116, 28, 0.52); }
  .badge-level-mark {
    color: #fff4dd;
    b { text-shadow: 0 0 4px #fff2ce, 0 0 11px #ff8d27, 0 0 18px rgba(255, 83, 17, 0.58); }
  }
}

.danmu-item.badge-tier-purple {
  min-height: 41px;
  padding-right: 17px;
  border: 1.5px solid rgba(191, 104, 255, 0.86);
  background:
    radial-gradient(circle at 15% 50%, rgba(214, 112, 255, 0.18), transparent 28%),
    linear-gradient(112deg, rgba(47, 12, 73, 0.97), rgba(82, 24, 116, 0.96) 50%, rgba(31, 13, 59, 0.97));
  box-shadow:
    0 0 9px rgba(249, 222, 255, 0.62),
    0 0 23px rgba(183, 73, 255, 0.72),
    0 0 38px rgba(120, 35, 222, 0.3),
    inset 0 0 20px rgba(206, 103, 255, 0.12);

  .tier-aura {
    background:
      radial-gradient(circle at 17% 50%, rgba(255, 232, 255, 0.42), transparent 20%),
      repeating-linear-gradient(112deg, transparent 0 18px, rgba(229, 161, 255, 0.08) 19px 20px, transparent 21px 38px);
    animation: badgePurpleAura 0.95s ease-in-out infinite alternate;
  }

  &::before {
    content: '';
    position: absolute;
    z-index: 1;
    inset: 0;
    background: linear-gradient(105deg, transparent 15%, rgba(246, 212, 255, 0.27) 35%, transparent 52%);
    transform: translateX(-110%);
    animation: badgePurpleSweep 1.9s ease-in-out infinite;
  }

  &::after {
    content: '✦  ·  ✧  ·  ✦';
    position: absolute;
    z-index: 1;
    inset: 2px 12px auto auto;
    color: rgba(232, 181, 255, 0.62);
    font: 9px/1 sans-serif;
    letter-spacing: 4px;
    animation: badgePurpleStars 1.1s ease-in-out infinite alternate;
  }

  .danmu-avatar {
    width: 30px;
    height: 30px;
    border: 2px solid #d48aff;
    box-shadow: 0 0 7px #f7dcff, 0 0 15px #b448ff, 0 0 23px rgba(119, 44, 211, 0.62);
  }
  .danmu-nickname {
    color: #e7b6ff;
    text-shadow: 0 0 5px rgba(255, 255, 255, 0.68), 0 0 12px #b548ff, 0 0 19px rgba(122, 44, 211, 0.7);
  }
  .danmu-content { text-shadow: 0 0 8px rgba(209, 139, 255, 0.48); }
  .badge-level-mark {
    color: #f3ceff;
    b { text-shadow: 0 0 4px #fff, 0 0 12px #d269ff, 0 0 21px rgba(150, 46, 255, 0.78); }
  }
}

.danmu-item.badge-tier-red {
  min-height: 45px;
  padding-right: 20px;
  border: 2px solid rgba(255, 77, 94, 0.94);
  background:
    radial-gradient(circle at 12% 50%, rgba(255, 187, 82, 0.2), transparent 25%),
    radial-gradient(circle at 80% 0, rgba(255, 40, 72, 0.2), transparent 32%),
    linear-gradient(110deg, rgba(91, 8, 22, 0.98), rgba(45, 7, 19, 0.98) 54%, rgba(107, 12, 21, 0.97));
  box-shadow:
    0 0 8px rgba(255, 244, 211, 0.82),
    0 0 23px rgba(255, 51, 77, 0.9),
    0 0 44px rgba(255, 24, 55, 0.56),
    0 0 64px rgba(255, 103, 32, 0.2),
    inset 0 0 23px rgba(255, 92, 66, 0.17);

  .tier-aura {
    background:
      radial-gradient(circle at 14% 50%, rgba(255, 248, 210, 0.52), transparent 18%),
      radial-gradient(circle at 55% 120%, rgba(255, 48, 38, 0.46), transparent 48%),
      repeating-linear-gradient(108deg, transparent 0 22px, rgba(255, 210, 130, 0.1) 23px 25px, transparent 26px 46px);
    animation: badgeRedAura 0.62s ease-in-out infinite alternate;
  }

  &::before {
    content: '';
    position: absolute;
    z-index: 1;
    inset: -25% auto -25% -35%;
    width: 32%;
    transform: skewX(-20deg);
    background: linear-gradient(90deg, transparent, rgba(255, 245, 215, 0.58), rgba(255, 89, 74, 0.34), transparent);
    animation: badgeRedSweep 1.45s ease-in-out infinite;
  }

  &::after {
    content: '✦  ✶  ✦';
    position: absolute;
    z-index: 1;
    inset: 3px 12px auto auto;
    color: rgba(255, 195, 120, 0.75);
    font: 10px/1 sans-serif;
    letter-spacing: 5px;
    text-shadow: 0 0 7px #ff394f, 0 0 13px #ff9e45;
    animation: badgeRedStars 0.8s ease-in-out infinite alternate;
  }

  .danmu-avatar {
    width: 31px;
    height: 31px;
    border: 2px solid #ff6473;
    box-shadow: 0 0 6px #fff1dc, 0 0 14px #ff334f, 0 0 24px rgba(255, 117, 44, 0.68);
  }
  .danmu-nickname {
    color: #ff8996;
    text-shadow: 0 0 5px rgba(255, 232, 220, 0.75), 0 0 12px #ff304a, 0 0 20px rgba(255, 68, 35, 0.7);
  }
  .danmu-content { text-shadow: 0 0 9px rgba(255, 97, 89, 0.55); }
  .badge-level-mark {
    color: #fff8e8;
    b { text-shadow: 0 0 4px #fff5cf, 0 0 12px #ff6745, 0 0 23px rgba(255, 25, 58, 0.94); }
  }
}

@keyframes badgeOrangeSweep {
  0%, 24% { left: -25%; opacity: 0; }
  42% { opacity: 1; }
  72%, 100% { left: 112%; opacity: 0; }
}

@keyframes badgePurpleSweep {
  0%, 18% { transform: translateX(-110%); opacity: 0; }
  42% { opacity: 1; }
  76%, 100% { transform: translateX(115%); opacity: 0; }
}

@keyframes badgePurpleStars {
  to { opacity: 0.25; filter: drop-shadow(0 0 7px #c862ff); }
}

@keyframes badgePurpleAura {
  from { opacity: 0.42; transform: scaleX(0.96); filter: brightness(0.92); }
  to { opacity: 0.88; transform: scaleX(1.04); filter: brightness(1.42); }
}

@keyframes badgeRedSweep {
  0%, 12% { left: -35%; opacity: 0; }
  38% { opacity: 1; }
  72%, 100% { left: 118%; opacity: 0; }
}

@keyframes badgeRedStars {
  to { opacity: 0.32; transform: scale(1.14); filter: brightness(1.45); }
}

@keyframes badgeRedAura {
  from { opacity: 0.48; transform: scaleX(0.96); filter: saturate(1.05) brightness(0.94); }
  to { opacity: 0.96; transform: scaleX(1.05); filter: saturate(1.5) brightness(1.48); }
}

@keyframes dragonPatternFloat {
  from { transform: translate3d(8px, -52%, 0) scale(0.98); opacity: 0.34; }
  to { transform: translate3d(-5px, -48%, 0) scale(1.03); opacity: 0.58; }
}

@keyframes dragonEnergyFlow {
  to { stroke-dashoffset: -56; }
}

@keyframes dragonEyePulse {
  to { opacity: 0.42; transform: scale(1.35); transform-origin: 216px 19px; }
}

@media (prefers-reduced-motion: reduce) {
  .danmu-item > .dragon-pattern,
  .danmu-item > .dragon-pattern .dragon-body,
  .danmu-item > .dragon-pattern .dragon-eye {
    animation: none;
  }
}
</style>

<style lang="scss" scoped>
/* Approved reference skins: the complete frame is the danmu, not a small leading icon. */
.danmu-wall.approved-wall.approved-wall.approved-wall.approved-wall {
  .danmu-item {
    --approved-width: clamp(760px, 62vw, 1190px);
    --approved-height: clamp(68px, 8.6vw, 104px);
    --approved-skin: url('../../assets/danmu-approved/clear-approved.png');
    width: var(--approved-width);
    height: var(--approved-height);
    min-height: var(--approved-height);
    box-sizing: border-box;
    display: grid;
    grid-template-columns: minmax(42px, 8%) max-content minmax(0, 1fr);
    align-items: center;
    column-gap: clamp(8px, .7vw, 14px);
    padding: 0 var(--panel-right-px) 0 var(--panel-left-px);
    overflow: visible;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    filter: none;
  }

  .danmu-item::before,
  .danmu-item::after,
  .danmu-item > .tier-crest,
  .danmu-item > .tier-tail,
  .danmu-item > .tier-fragments,
  .danmu-item > .tier-aura,
  .danmu-item > .dragon-pattern,
  .danmu-item > .danmu-avatar {
    display: none !important;
  }

  .danmu-item > .approved-skin {
    position: absolute;
    z-index: 0;
    inset: 0;
    display: block;
    box-sizing: border-box;
    border-style: solid;
    border-width: 0 var(--skin-edge-right) 0 var(--skin-edge-left);
    border-image-source: var(--approved-skin);
    border-image-slice: 0 var(--skin-slice-right) 0 var(--skin-slice-left) fill;
    border-image-width: 0 var(--skin-edge-right) 0 var(--skin-edge-left);
    border-image-repeat: stretch;
    background: none;
    pointer-events: none;
    filter: drop-shadow(0 5px 12px rgba(0, 0, 0, .46));
  }

  .danmu-item > .badge-level-mark,
  .danmu-item > .danmu-nickname,
  .danmu-item > .danmu-content {
    position: relative;
    z-index: 3;
    margin: 0;
    min-width: 0;
    align-self: center;
    white-space: nowrap;
  }

  .danmu-item > .badge-level-mark {
    grid-column: 1;
    grid-row: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .danmu-item > .badge-level-mark b {
    display: block;
    min-width: auto;
    font-family: 'PangMenZhengDaoCuShuTi', 'Arial Black', sans-serif;
    font-size: clamp(28px, 1.18em, 46px);
    font-style: normal;
    font-weight: 400;
    line-height: .92;
    letter-spacing: 0;
    transform: translateY(1px);
  }

  .danmu-item > .danmu-nickname {
    grid-column: 2;
    grid-row: 1;
    display: inline;
    justify-self: start;
    max-width: clamp(82px, 7.4vw, 142px);
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: 'DouyinSansBold', 'Microsoft YaHei UI', sans-serif;
    font-size: max(22px, 1em);
    font-weight: 800;
    line-height: 1;
  }

  .danmu-item > .danmu-content {
    grid-column: 3;
    grid-row: 1;
    display: block;
    justify-self: start;
    width: min(100%, var(--content-width-px));
    max-width: 100%;
    min-width: 0;
    padding-left: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: 'DouyinSansBold', 'Microsoft YaHei UI', sans-serif;
    font-size: max(22px, 1em);
    line-height: 1;
  }

  .danmu-item.badge-tier-white {
    --approved-height: clamp(48px, 4.2vw, 64px);
    grid-template-columns: minmax(34px, 7%) max-content minmax(0, 1fr);
    border: 1px solid rgba(255, 255, 255, .16);
    border-radius: calc(var(--approved-height) * .22);
    background:
      linear-gradient(100deg, rgba(72, 77, 86, .82), rgba(43, 47, 55, .72) 58%, rgba(29, 32, 39, .52)),
      rgba(48, 52, 60, .62);
    box-shadow: 0 6px 18px rgba(0, 0, 0, .2), inset 0 1px rgba(255, 255, 255, .08);
    color: rgba(255, 255, 255, .94);
    overflow: hidden;
  }

  .danmu-item.badge-tier-white > .approved-skin {
    display: none;
  }

  .danmu-item.badge-tier-white > .badge-level-mark b {
    color: rgba(255, 255, 255, .88);
    font-size: clamp(25px, 1.12em, 36px);
    text-shadow: 0 1px 2px rgba(0, 0, 0, .8);
  }

  .danmu-item.badge-tier-white > .danmu-nickname,
  .danmu-item.badge-tier-white > .danmu-content {
    color: rgba(255, 255, 255, .93);
    text-shadow: 0 1px 3px rgba(0, 0, 0, .7);
  }

  .danmu-item.badge-tier-orange {
    --approved-height: clamp(56px, 4.3vw, 78px);
    grid-template-columns: max-content max-content minmax(0, 1fr);
    column-gap: clamp(6px, .45vw, 10px);
    overflow: hidden;
    border: 1px solid rgba(255, 235, 158, .34);
    border-left: 3px solid #ffe68a;
    border-radius: calc(var(--approved-height) * .2);
    background:
      linear-gradient(100deg, rgba(67, 58, 20, .76), rgba(27, 26, 18, .76) 55%, rgba(16, 17, 17, .58)),
      rgba(16, 16, 12, .68);
    box-shadow: 0 7px 20px rgba(0, 0, 0, .22), inset 0 1px rgba(255, 250, 209, .08);
  }

  .danmu-item.badge-tier-orange > .approved-skin {
    display: none;
  }

  .danmu-item.badge-tier-orange > .badge-level-mark b {
    font-size: clamp(28px, 1.12em, 42px);
    transform: none;
  }

  .danmu-item.badge-tier-orange > .badge-level-mark,
  .danmu-item.badge-tier-orange > .danmu-nickname,
  .danmu-item.badge-tier-orange > .danmu-content {
    line-height: 1;
    transform: none;
    color: #fff3b7;
    text-shadow: 0 2px 5px rgba(0, 0, 0, .78), 0 0 7px rgba(255, 226, 126, .2);
  }

  .danmu-item.badge-tier-orange > .danmu-nickname,
  .danmu-item.badge-tier-purple > .danmu-nickname {
    max-width: clamp(96px, 12vw, 220px);
  }

  .danmu-item.badge-tier-purple {
    --approved-skin: url('../../assets/danmu-approved/astral-approved.png');
    --approved-width: clamp(820px, 65vw, 1250px);
    --approved-height: clamp(104px, 8.8vw, 170px);
    --skin-slice-left: 192;
    --skin-slice-right: 428;
    --skin-edge-left: calc(var(--approved-height) * 1.1035);
    --skin-edge-right: calc(var(--approved-height) * 2.4598);
    grid-template-columns: max-content max-content minmax(0, 1fr);
    column-gap: clamp(6px, .5vw, 11px);
  }

  .danmu-item.badge-tier-purple > .badge-level-mark,
  .danmu-item.badge-tier-purple > .danmu-nickname,
  .danmu-item.badge-tier-purple > .danmu-content {
    // The astral plate sits lower than the transparent decorative canvas.
    transform: translateY(calc(var(--approved-height) * .1322));
  }

  .danmu-item.badge-tier-red {
    --approved-skin: url('../../assets/danmu-approved/dragon-approved.png');
    --approved-width: clamp(900px, 72vw, 1380px);
    --approved-height: clamp(150px, 15.3vw, 294px);
    --skin-slice-left: 230;
    --skin-slice-right: 440;
    --skin-edge-left: calc(var(--approved-height) * .7667);
    --skin-edge-right: calc(var(--approved-height) * 1.4667);
    grid-template-columns: minmax(58px, 9%) max-content minmax(0, 1fr);
  }

  .danmu-item.badge-tier-red > .badge-level-mark b {
    color: #ffe09b;
    font-size: clamp(42px, 1.72em, 70px);
  }

  .danmu-item.badge-tier-red > .danmu-nickname,
  .danmu-item.badge-tier-red > .danmu-content {
    color: #fff4df;
  }

  .danmu-item.badge-tier-red > .badge-level-mark,
  .danmu-item.badge-tier-red > .danmu-nickname,
  .danmu-item.badge-tier-red > .danmu-content {
    transform: translateY(calc(var(--approved-height) * .0083));
  }

}
</style>

<style lang="scss" scoped>
/* Four-tier ceremonial skins. Static artwork carries detail; animations only touch transform/opacity. */
.danmu-wall.danmu-wall.danmu-wall {
.danmu-item {
  --crest-size: 64px;
  --panel-left: 42px;
  box-sizing: border-box;
  min-height: 44px;
  padding: 8px 22px 9px var(--panel-left);
  gap: 8px;
  transform-origin: left center;
}

.danmu-item::before {
  inset: 4px -2px 4px 18px;
  border-radius: 4px 18px 18px 4px;
  border: 1px solid rgba(var(--tier-rgb), .42);
  border-left-width: 0;
  background:
    linear-gradient(90deg, rgba(var(--tier-rgb), .17), rgba(7, 11, 22, .91) 19%, rgba(5, 9, 20, .83) 72%, rgba(var(--tier-rgb), .12)),
    linear-gradient(180deg, rgba(255,255,255,.08), transparent 36%, rgba(0,0,0,.18));
  box-shadow:
    0 8px 20px rgba(0,0,0,.32),
    inset 0 1px rgba(255,255,255,.1),
    inset 0 -1px rgba(var(--tier-rgb), .22);
}

.danmu-item::after {
  left: 42px;
  right: 8px;
  bottom: 4px;
  height: 2px;
  opacity: .88;
  background: linear-gradient(90deg, var(--tier-color), rgba(var(--tier-rgb), .35) 60%, transparent);
  box-shadow: 0 0 8px rgba(var(--tier-rgb), .55);
  animation: tierEnergyPulse 2.4s ease-in-out infinite;
}

.tier-crest {
  position: absolute !important;
  z-index: 5 !important;
  left: -18px;
  top: 50%;
  width: var(--crest-size);
  height: var(--crest-size);
  transform: translateY(-50%);
  background: var(--tier-crest) center / contain no-repeat;
  filter: drop-shadow(0 0 5px rgba(var(--tier-rgb), .82));
  pointer-events: none;
}

.tier-tail {
  position: absolute !important;
  z-index: 1 !important;
  top: 50%;
  right: -40px;
  width: 86px;
  height: 58px;
  transform: translateY(-50%);
  pointer-events: none;
}

.tier-tail::before,
.tier-tail::after {
  content: '';
  position: absolute;
  right: 0;
  width: 82px;
  height: 12px;
  border-radius: 0 100% 0 100%;
  background: linear-gradient(90deg, rgba(var(--tier-rgb), .48), rgba(var(--tier-rgb), .05) 74%, transparent);
  filter: drop-shadow(0 0 5px rgba(var(--tier-rgb), .45));
}

.tier-tail::before { top: 13px; transform: skewX(-28deg) rotate(-6deg); }
.tier-tail::after { bottom: 13px; transform: skewX(28deg) rotate(6deg); }

.tier-fragments {
  position: absolute !important;
  z-index: 6 !important;
  top: 50%;
  right: -46px;
  width: 72px;
  height: 50px;
  transform: translateY(-50%);
  pointer-events: none;
}

.tier-fragments i {
  position: absolute;
  width: 9px;
  height: 16px;
  background: linear-gradient(145deg, #fff, var(--tier-color) 38%, rgba(var(--tier-rgb), .05));
  clip-path: polygon(50% 0, 100% 42%, 68% 100%, 0 72%);
  filter: drop-shadow(0 0 4px rgba(var(--tier-rgb), .9));
  animation: fragmentFloat 2.6s ease-in-out infinite alternate;
}

.tier-fragments i:nth-child(1) { left: 6px; top: 4px; transform: rotate(20deg); }
.tier-fragments i:nth-child(2) { left: 34px; top: 28px; width: 7px; height: 12px; animation-delay: -.8s; }
.tier-fragments i:nth-child(3) { right: 3px; top: 10px; width: 5px; height: 9px; animation-delay: -1.5s; }

.danmu-item .danmu-avatar {
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  border-width: 2px;
  box-shadow: 0 0 0 2px rgba(2,6,15,.78), 0 0 9px rgba(var(--tier-rgb), .4);
}

.danmu-item .badge-level-mark b {
  min-width: 1.15em;
  font-size: max(28px, 1.05em);
  font-family: 'DouyinSansBold', 'Arial Black', sans-serif;
  font-style: italic;
  letter-spacing: -.06em;
}

.danmu-item .danmu-nickname,
.danmu-item .danmu-content {
  text-shadow: 0 2px 3px rgba(0,0,0,.95), 0 0 7px rgba(var(--tier-rgb), .28);
}

.danmu-item.badge-tier-white {
  --tier-color: #f8feff;
  --tier-soft: #f8feff;
  --tier-rgb: 154, 228, 255;
  --tier-crest: url('../../assets/danmu-tier/moon-crest.svg');
  --crest-size: 66px;
  --panel-left: 48px;
}

.danmu-item.badge-tier-white::before {
  background:
    linear-gradient(90deg, rgba(129,220,255,.18), rgba(7,17,30,.88) 22%, rgba(7,13,24,.78) 76%, rgba(116,215,255,.09)),
    linear-gradient(180deg, rgba(239,253,255,.14), transparent 44%);
}

.danmu-item.badge-tier-orange {
  --tier-color: #ffd454;
  --tier-soft: #fff2c8;
  --tier-rgb: 255, 136, 31;
  --tier-crest: url('../../assets/danmu-tier/phoenix-crest.svg');
  --crest-size: 88px;
  --panel-left: 64px;
  min-height: 52px;
}

.danmu-item.badge-tier-orange::before {
  inset-block: 4px;
  background:
    linear-gradient(90deg, rgba(255,106,20,.3), rgba(38,15,11,.94) 24%, rgba(19,10,14,.86) 74%, rgba(255,102,17,.13)),
    linear-gradient(180deg, rgba(255,221,121,.15), transparent 42%);
  box-shadow: 0 8px 24px rgba(0,0,0,.36), inset 0 1px rgba(255,223,132,.24), 0 0 11px rgba(255,91,17,.15);
}

.danmu-item.badge-tier-orange .tier-tail::before,
.danmu-item.badge-tier-orange .tier-tail::after {
  height: 15px;
  background: linear-gradient(90deg, rgba(255,219,82,.75), rgba(255,78,17,.35) 55%, transparent);
}

.danmu-item.badge-tier-purple {
  --tier-color: #dcaaff;
  --tier-soft: #f3e8ff;
  --tier-rgb: 158, 80, 255;
  --tier-crest: url('../../assets/danmu-tier/astral-crest.svg');
  --crest-size: 96px;
  --panel-left: 70px;
  min-height: 62px;
  padding-right: 32px;
}

.danmu-item.badge-tier-purple::before {
  inset-block: 5px;
  border-color: rgba(191,126,255,.64);
  clip-path: polygon(0 18%, 7% 0, 91% 0, 100% 29%, 96% 100%, 8% 100%, 0 75%);
  background:
    linear-gradient(90deg, rgba(96,35,188,.4), rgba(20,9,48,.95) 24%, rgba(11,13,39,.9) 70%, rgba(41,112,171,.18)),
    linear-gradient(180deg, rgba(214,183,255,.18), transparent 40%);
  box-shadow: inset 0 1px rgba(221,199,255,.3), 0 0 16px rgba(127,55,255,.25);
}

.danmu-item.badge-tier-purple > .tier-aura {
  inset: -13px 5% -13px 12%;
  opacity: .45;
  background: radial-gradient(ellipse, rgba(124,53,255,.45), rgba(50,177,255,.12) 55%, transparent 72%);
  animation: tierAuraBreathe 2.4s ease-in-out infinite alternate;
}

.danmu-item.badge-tier-red {
  --tier-color: #ffd36b;
  --tier-soft: #fff1d5;
  --tier-rgb: 255, 52, 62;
  --tier-crest: url('../../assets/highlight/dragon-filigree-optimized.png');
  --crest-size: 132px;
  --panel-left: 104px;
  min-height: 76px;
  padding-right: 42px;
}

.danmu-item.badge-tier-red .tier-crest {
  left: -23px;
  background-position: left center;
  background-size: 220% auto;
  filter: sepia(.15) saturate(1.55) drop-shadow(0 0 6px rgba(255,48,42,.9)) drop-shadow(0 0 12px rgba(255,183,55,.48));
}

.danmu-item.badge-tier-red::before {
  inset-block: 7px;
  border: 1px solid rgba(255,196,82,.68);
  border-left: 0;
  clip-path: polygon(0 20%, 5% 0, 92% 0, 100% 34%, 97% 100%, 7% 100%, 0 74%);
  background:
    linear-gradient(90deg, rgba(183,20,30,.48), rgba(48,8,17,.96) 24%, rgba(19,8,15,.93) 68%, rgba(124,15,27,.25)),
    linear-gradient(180deg, rgba(255,210,112,.18), transparent 38%);
  box-shadow: inset 0 1px rgba(255,222,151,.32), 0 0 18px rgba(255,29,46,.28);
}

.danmu-item.badge-tier-red > .tier-aura {
  inset: -20px 2% -20px 5%;
  opacity: .5;
  background:
    radial-gradient(ellipse at 24% 50%, rgba(255,36,48,.5), transparent 45%),
    radial-gradient(ellipse at 78% 50%, rgba(255,182,49,.2), transparent 52%);
  animation: tierAuraBreathe 1.8s ease-in-out infinite alternate;
}

.danmu-item.badge-tier-red > .dragon-pattern {
  right: -5px;
  width: clamp(270px, 34vw, 460px);
  height: calc(100% + 52px);
  opacity: .26;
  mix-blend-mode: screen;
  filter: saturate(1.5) drop-shadow(0 0 6px rgba(255,50,50,.35));
  animation: dragonDrift 4s steps(32, end) infinite alternate;
}

.danmu-item.badge-tier-red .tier-tail {
  right: -62px;
  width: 126px;
}

.danmu-item.badge-tier-red .tier-tail::before,
.danmu-item.badge-tier-red .tier-tail::after {
  width: 124px;
  height: 18px;
  background: linear-gradient(90deg, rgba(255,211,91,.82), rgba(255,39,46,.45) 48%, transparent);
  box-shadow: 18px 0 0 -7px rgba(255,64,55,.3);
}

@keyframes tierEnergyPulse {
  50% { opacity: .42; transform: scaleX(.96); transform-origin: left; }
}

@keyframes tierAuraBreathe {
  from { opacity: .26; transform: scale(.97); }
  to { opacity: .55; transform: scale(1.025); }
}

@keyframes fragmentFloat {
  to { translate: 5px -5px; opacity: .38; }
}

@keyframes dragonDrift {
  from { transform: translate3d(5px,-50%,0); opacity: .2; }
  to { transform: translate3d(-5px,-50%,0); opacity: .3; }
}

@media (prefers-reduced-motion: reduce) {
  .danmu-item::after,
  .tier-fragments i,
  .danmu-item > .tier-aura,
  .danmu-item > .dragon-pattern { animation: none !important; }
}
}
</style>

<style lang="scss" scoped>
/* Refined subtitle-style danmu: typography first, effects second. */
.danmu-item,
.danmu-item.badge-tier-white,
.danmu-item.badge-tier-orange,
.danmu-item.badge-tier-purple,
.danmu-item.badge-tier-red {
  --tier-color: #ffffff;
  --tier-soft: #f4f7fb;
  --tier-rgb: 255, 255, 255;
  position: absolute;
  isolation: isolate;
  min-height: 34px;
  padding: 7px 18px 8px 13px;
  gap: 7px;
  overflow: visible;
  border: 0;
  border-radius: 0;
  color: var(--tier-soft);
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
  font-family: 'LXGW WenKai', 'Microsoft YaHei UI', sans-serif;
}

.danmu-item::before {
  content: '';
  position: absolute;
  z-index: 0;
  inset: 1px 0;
  border: 1px solid rgba(var(--tier-rgb), 0.14);
  border-left: 2px solid rgba(var(--tier-rgb), 0.72);
  border-radius: 7px 11px 11px 7px;
  background:
    linear-gradient(100deg, rgba(8, 12, 19, 0.84), rgba(8, 12, 20, 0.69) 72%, rgba(8, 12, 20, 0.34)),
    rgba(4, 7, 12, 0.54);
  box-shadow: 0 7px 20px rgba(0, 0, 0, 0.24), inset 0 1px rgba(255, 255, 255, 0.035);
  backdrop-filter: blur(9px) saturate(1.08);
}

.danmu-item.badge-tier-white::before,
.danmu-item.badge-tier-orange::before,
.danmu-item.badge-tier-purple::before,
.danmu-item.badge-tier-red::before {
  inset: 1px 0;
  width: auto;
  transform: none;
  animation: none;
}

.danmu-item::after {
  content: '';
  position: absolute;
  z-index: 3;
  left: 14px;
  right: 12px;
  bottom: 1px;
  height: 1px;
  opacity: 0.5;
  background: linear-gradient(90deg, rgba(var(--tier-rgb), 0.62), rgba(var(--tier-rgb), 0.08), transparent);
}

.danmu-item > * {
  position: relative;
  z-index: 2;
}

.danmu-item .danmu-avatar,
.danmu-item.badge-tier-purple .danmu-avatar,
.danmu-item.badge-tier-red .danmu-avatar {
  width: 27px;
  height: 27px;
  border: 1px solid rgba(var(--tier-rgb), 0.55);
  box-shadow: 0 0 0 3px rgba(var(--tier-rgb), 0.055);
}

.danmu-item .badge-level-mark {
  min-width: 0;
  margin: 0 1px 0 0;
  color: var(--tier-color);

  b {
    font-size: max(24px, 0.94em);
    color: inherit;
    text-shadow: 0 1px 0 rgba(0, 0, 0, 0.82), 0 0 7px rgba(var(--tier-rgb), 0.36);
    transform: translateY(1px);
  }
}

.danmu-item .danmu-nickname,
.danmu-item .danmu-content {
  color: var(--tier-soft);
  font-size: 1em;
  line-height: 1.12;
  text-shadow: 0 2px 5px rgba(0, 0, 0, 0.78);
}

.danmu-item .danmu-content {
  font-family: 'LXGW WenKai', 'Microsoft YaHei UI', sans-serif;
  font-weight: 700;
}

.danmu-item .danmu-nickname {
  color: var(--tier-color);
  font-weight: 800;
}

.danmu-item > .tier-aura {
  z-index: 1;
  inset: -4px 10% -4px 20%;
  opacity: 0;
  border-radius: 50%;
  mix-blend-mode: screen;
  filter: blur(10px);
  transform: none;
  animation: none;
}

.danmu-item > .dragon-pattern {
  z-index: 1;
  top: 50%;
  right: -18px;
  width: clamp(210px, 29vw, 360px);
  height: calc(100% + 26px);
  opacity: 0;
  mix-blend-mode: normal;
  filter: none;
  mask-image: linear-gradient(90deg, transparent, #000 24%, #000 86%, transparent);
  background: url('../../assets/highlight/dragon-filigree-optimized.png') center right / contain no-repeat;
  animation: none;

  svg { display: none; }
}

.danmu-item.badge-tier-white {
  --tier-color: #ffffff;
  --tier-soft: #ffffff;
  --tier-rgb: 231, 240, 250;
}

.danmu-item.badge-tier-white::before {
  border-color: rgba(224, 235, 247, 0.14);
  border-left-color: rgba(239, 247, 255, 0.7);
  background: linear-gradient(100deg, rgba(13, 18, 26, 0.82), rgba(12, 17, 26, 0.65) 76%, rgba(12, 17, 26, 0.24));
}

.danmu-item.badge-tier-orange {
  --tier-color: #ffe68a;
  --tier-soft: #fff4bd;
  --tier-rgb: 255, 226, 126;
  min-height: 36px;
}

.danmu-item.badge-tier-orange::before {
  border-color: rgba(255, 233, 148, 0.18);
  border-left-color: rgba(255, 232, 139, 0.74);
  background:
    linear-gradient(100deg, rgba(28, 25, 14, 0.84), rgba(18, 17, 14, 0.69) 72%, rgba(18, 17, 13, 0.26)),
    rgba(7, 8, 12, 0.5);
  box-shadow: 0 7px 20px rgba(0, 0, 0, 0.24), inset 18px 0 32px rgba(255, 226, 126, 0.025);
}

.danmu-item.badge-tier-orange::after {
  content: '';
  inset: auto 12px 1px 14px;
  width: auto;
  opacity: 0.48;
  background: linear-gradient(90deg, #ffe68a, rgba(255, 235, 158, 0.12) 42%, transparent 88%);
  animation: refinedLinePulse 4.2s ease-in-out infinite;
}

.danmu-item.badge-tier-purple {
  --tier-color: #cda0ff;
  --tier-soft: #e7d5ff;
  --tier-rgb: 180, 106, 255;
  min-height: 38px;
  padding-right: 19px;
}

.danmu-item.badge-tier-purple::before {
  border-color: rgba(191, 124, 255, 0.22);
  border-left-color: rgba(203, 145, 255, 0.88);
  background:
    linear-gradient(100deg, rgba(27, 18, 42, 0.88), rgba(15, 17, 30, 0.73) 68%, rgba(15, 17, 30, 0.31)),
    rgba(6, 7, 14, 0.54);
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.28), inset 22px 0 46px rgba(150, 73, 237, 0.055);
}

.danmu-item.badge-tier-purple::after {
  content: '';
  top: auto;
  left: 14px;
  right: 12px;
  bottom: 1px;
  height: 1px;
  opacity: 0.76;
  letter-spacing: 0;
  background: linear-gradient(90deg, #b678ff, rgba(86, 203, 255, 0.36) 52%, transparent 92%);
  text-shadow: none;
  animation: refinedLinePulse 2.2s ease-in-out infinite;
}

.danmu-item.badge-tier-purple .tier-aura {
  opacity: 0.2;
  background: linear-gradient(90deg, transparent, rgba(171, 91, 255, 0.68), rgba(76, 188, 255, 0.3), transparent);
  animation: refinedAuraBreathe 2.6s ease-in-out infinite alternate;
}

.danmu-item.badge-tier-red {
  --tier-color: #ff7d84;
  --tier-soft: #ffe4d8;
  --tier-rgb: 255, 74, 84;
  min-height: 41px;
  padding-right: 22px;
}

.danmu-item.badge-tier-red::before {
  border: 1px solid rgba(235, 178, 100, 0.24);
  border-left: 2px solid rgba(255, 197, 103, 0.88);
  background:
    linear-gradient(100deg, rgba(42, 17, 22, 0.9), rgba(20, 15, 22, 0.78) 64%, rgba(24, 13, 19, 0.38)),
    rgba(7, 7, 12, 0.58);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3), inset 28px 0 52px rgba(167, 35, 48, 0.07);
}

.danmu-item.badge-tier-red::after {
  content: '';
  top: auto;
  left: 14px;
  right: 10px;
  bottom: 1px;
  height: 1px;
  opacity: 0.82;
  letter-spacing: 0;
  background: linear-gradient(90deg, #e9bd6b, rgba(255, 85, 89, 0.56) 55%, transparent 94%);
  text-shadow: none;
  animation: refinedLinePulse 1.8s ease-in-out infinite;
}

.danmu-item.badge-tier-red .tier-aura {
  opacity: 0.19;
  background: linear-gradient(90deg, transparent, rgba(255, 58, 67, 0.64), rgba(229, 181, 91, 0.28), transparent);
  animation: refinedAuraBreathe 2s ease-in-out infinite alternate;
}

.danmu-item.badge-tier-red > .dragon-pattern {
  opacity: 0.13;
  animation: refinedDragonTrail 6s steps(36, end) infinite alternate;
}

.danmu-item.badge-tier-red .badge-level-mark {
  color: #f2c978;
}

@keyframes refinedLinePulse {
  50% { opacity: 0.34; transform: scaleX(0.94); transform-origin: left; }
}

@keyframes refinedAuraBreathe {
  from { opacity: 0.1; transform: translateX(-4px) scaleX(0.96); }
  to { opacity: 0.26; transform: translateX(5px) scaleX(1.04); }
}

@keyframes refinedDragonTrail {
  from { opacity: 0.09; transform: translate3d(6px, -51%, 0); }
  to { opacity: 0.16; transform: translate3d(-6px, -49%, 0); }
}

@media (prefers-reduced-motion: reduce) {
  .danmu-item::after,
  .danmu-item > .tier-aura,
  .danmu-item > .dragon-pattern { animation: none !important; }
}
</style>

<style>
.danmu-item {
  contain: layout style;
  backface-visibility: hidden;
}

.danmu-item::before {
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}

@keyframes danmuScroll {
  from {
    transform: translate3d(100vw, 0, 0);
  }
  to {
    /* Move by the viewport plus the item's own width. Extra-wide ceremonial
       skins therefore remain visible until their decorated tail has passed. */
    transform: translate3d(calc(-100% - 24px), 0, 0);
  }
}
</style>

<style lang="scss" scoped>
/* LXGW WenKai has deeper descenders than the previous display font. Keep a
   slightly taller content line box so glyph bottoms are not clipped. */
.danmu-item > .danmu-content {
  box-sizing: border-box;
  padding-block: .06em .12em;
  font-family: 'LXGW WenKai', 'Microsoft YaHei UI', sans-serif;
  font-weight: 700;
  line-height: 1.3;
}
</style>

<style lang="scss" scoped>
/* Text-first flying danmu: transparent copy, visible avatar, explicit level label. */
.danmu-wall.approved-wall.approved-wall.approved-wall.approved-wall.approved-wall {
  .danmu-item,
  .danmu-item.badge-tier-white,
  .danmu-item.badge-tier-orange,
  .danmu-item.badge-tier-purple,
  .danmu-item.badge-tier-red {
    width: var(--approved-width);
    height: var(--approved-height);
    min-height: var(--approved-height);
    display: inline-flex;
    align-items: center;
    gap: clamp(4px, .4vw, 8px);
    padding: 5px var(--panel-right-px) 6px var(--panel-left-px);
    overflow: visible;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  .danmu-item::before,
  .danmu-item::after,
  .danmu-item > .approved-skin {
    display: none !important;
  }

  .danmu-item.badge-tier-purple > .approved-skin,
  .danmu-item.badge-tier-red > .approved-skin {
    display: block !important;
    /* Do not paint the source PNG's centre slice: only the illustrated ends
       remain, so the slide/page behind the flying comment stays visible. */
    border-image-slice: 0 var(--skin-slice-right) 0 var(--skin-slice-left) !important;
    background: none !important;
  }

  .danmu-item.badge-tier-purple > .approved-skin::before,
  .danmu-item.badge-tier-purple > .approved-skin::after,
  .danmu-item.badge-tier-red > .approved-skin::before,
  .danmu-item.badge-tier-red > .approved-skin::after {
    content: '';
    position: absolute;
    z-index: 1;
    left: var(--skin-edge-left);
    right: var(--skin-edge-right);
    height: 2px;
    pointer-events: none;
  }

  .danmu-item.badge-tier-purple > .approved-skin::before {
    top: 39.5%;
    background: linear-gradient(90deg, rgba(175, 127, 255, .92), #f4e8ff 28%, #78cfff 61%, rgba(164, 100, 255, .82));
    box-shadow: 0 0 5px rgba(194, 135, 255, .9), 0 0 12px rgba(73, 166, 255, .45);
  }

  .danmu-item.badge-tier-purple > .approved-skin::after {
    top: 85%;
    background: linear-gradient(90deg, rgba(153, 89, 255, .86), #d8bcff 34%, #4bbdff 67%, rgba(142, 73, 247, .72));
    box-shadow: 0 0 5px rgba(137, 78, 255, .9), 0 0 11px rgba(52, 153, 255, .45);
  }

  .danmu-item.badge-tier-red > .approved-skin::before {
    top: 32.5%;
    background: linear-gradient(90deg, rgba(255, 123, 25, .9), #ffe08b 30%, #ff9125 67%, rgba(255, 58, 34, .82));
    box-shadow: 0 0 5px rgba(255, 186, 67, .95), 0 0 13px rgba(255, 58, 37, .5);
  }

  .danmu-item.badge-tier-red > .approved-skin::after {
    top: 69.5%;
    background: linear-gradient(90deg, rgba(255, 89, 23, .85), #ffd774 34%, #ff6a2c 69%, rgba(213, 25, 34, .72));
    box-shadow: 0 0 5px rgba(255, 178, 48, .9), 0 0 12px rgba(255, 37, 45, .52);
  }

  /* 1-4 / 5-9 keep a restrained frame; the full illustrated skins start at level 10. */
  .danmu-item.badge-tier-white::before,
  .danmu-item.badge-tier-orange::before {
    content: '';
    position: absolute;
    z-index: 0;
    inset: 3px 0;
    display: block !important;
    box-sizing: border-box;
    border: 1px solid rgba(226, 231, 239, .72);
    border-radius: calc(var(--approved-height) * .22);
    background: linear-gradient(100deg, rgba(38, 42, 49, .34), rgba(15, 17, 21, .1));
    box-shadow:
      0 4px 14px rgba(0, 0, 0, .22),
      inset 0 0 0 1px rgba(255, 255, 255, .05);
    pointer-events: none;
  }

  .danmu-item.badge-tier-orange::before {
    border-color: rgba(255, 231, 139, .86);
    background: linear-gradient(100deg, rgba(77, 64, 18, .3), rgba(28, 25, 12, .1));
    box-shadow:
      0 4px 15px rgba(0, 0, 0, .24),
      0 0 10px rgba(255, 220, 101, .14),
      inset 3px 0 rgba(255, 231, 139, .72);
  }

  .danmu-item > .danmu-avatar {
    position: relative;
    z-index: 5;
    width: clamp(30px, 1.05em, 46px);
    height: clamp(30px, 1.05em, 46px);
    flex: 0 0 clamp(30px, 1.05em, 46px);
    display: grid !important;
    place-items: center;
    overflow: hidden;
    box-sizing: border-box;
    border: 2px solid rgba(var(--tier-rgb), .82);
    border-radius: 50%;
    object-fit: cover;
    color: var(--tier-color);
    background: rgba(8, 10, 15, .78);
    box-shadow: 0 0 0 2px rgba(3, 5, 10, .78), 0 0 12px rgba(var(--tier-rgb), .58);
    font: 700 .62em/1 'Microsoft YaHei UI', sans-serif;
  }

  .danmu-item > .badge-level-mark,
  .danmu-item > .danmu-nickname,
  .danmu-item > .danmu-content {
    position: relative;
    z-index: 5;
    display: inline-flex;
    align-items: center;
    transform: none;
  }

  .danmu-item > .badge-level-mark {
    flex: 0 0 auto;
  }

  .danmu-item > .badge-level-mark b {
    min-width: max-content;
    color: var(--tier-color);
    // 等级数字保留原展示字体；只有昵称和弹幕正文使用霞鹜文楷。
    font-family: 'PangMenZhengDaoCuShuTi', 'Arial Black', sans-serif;
    font-size: max(23px, .82em);
    font-style: normal;
    font-weight: 700;
    letter-spacing: 0;
    text-shadow: 0 2px 3px #000, 0 0 8px rgba(var(--tier-rgb), .82);
    transform: none;
  }

  .danmu-item > .danmu-nickname {
    width: var(--nickname-width-px);
    max-width: var(--nickname-width-px);
    flex: 0 0 var(--nickname-width-px);
    overflow: visible;
    text-overflow: clip;
    white-space: nowrap;
    color: var(--tier-color);
    font-family: 'LXGW WenKai', 'Microsoft YaHei UI', sans-serif;
    font-size: 1em;
    font-weight: 700;
    -webkit-text-stroke: .35px rgba(0, 0, 0, .76);
    text-shadow: 0 2px 3px #000, 0 0 9px rgba(var(--tier-rgb), .58);
  }

  .danmu-item > .danmu-content {
    width: var(--content-width-px);
    min-width: var(--content-width-px);
    max-width: var(--content-width-px);
    flex: 0 0 var(--content-width-px);
    overflow: visible;
    text-overflow: clip;
    white-space: nowrap;
    color: var(--tier-soft);
    font-family: 'LXGW WenKai', 'Microsoft YaHei UI', sans-serif;
    font-size: 1em;
    font-weight: 700;
    -webkit-text-stroke: .45px rgba(0, 0, 0, .82);
    text-shadow:
      -1px -1px 1px rgba(0, 0, 0, .92),
      1px 1px 2px rgba(0, 0, 0, .94),
      0 0 9px rgba(var(--tier-rgb), .52);
  }

  .danmu-item.badge-tier-white {
    --tier-color: #fff;
    --tier-soft: #fff;
    --tier-rgb: 225, 231, 239;
  }

  .danmu-item.badge-tier-orange {
    --tier-color: #ffe784;
    --tier-soft: #fff3ad;
    --tier-rgb: 255, 226, 112;
  }

  .danmu-item.badge-tier-purple {
    --tier-color: #d99dff;
    --tier-soft: #ebc9ff;
    --tier-rgb: 190, 93, 255;
  }

  .danmu-item.badge-tier-red {
    --tier-color: #ff4b59;
    --tier-soft: #ff5b67;
    --tier-rgb: 255, 48, 65;

    > .danmu-content,
    > .danmu-nickname {
      color: #ff5360;
      text-shadow:
        -1px -1px 1px rgba(35, 0, 4, .95),
        1px 1px 2px rgba(35, 0, 4, .98),
        0 0 7px #ff283c,
        0 0 15px rgba(255, 48, 52, .7);
    }
  }

  /* The illustrated panels are not vertically centred in their transparent canvases.
     Move the complete identity/content row into each artwork's real inner plaque. */
  .danmu-item.badge-tier-purple > .danmu-avatar,
  .danmu-item.badge-tier-purple > .badge-level-mark,
  .danmu-item.badge-tier-purple > .danmu-nickname,
  .danmu-item.badge-tier-purple > .danmu-content {
    transform: translateY(calc(var(--approved-height) * .1322));
  }

  .danmu-item.badge-tier-red > .danmu-avatar,
  .danmu-item.badge-tier-red > .badge-level-mark,
  .danmu-item.badge-tier-red > .danmu-nickname,
  .danmu-item.badge-tier-red > .danmu-content {
    transform: translateY(calc(var(--approved-height) * .0083));
  }

  .danmu-item.badge-tier-purple > .tier-fragments,
  .danmu-item.badge-tier-purple > .tier-aura,
  .danmu-item.badge-tier-red > .tier-fragments,
  .danmu-item.badge-tier-red > .tier-aura,
  .danmu-item.badge-tier-red > .dragon-pattern {
    display: block !important;
  }
}
</style>
