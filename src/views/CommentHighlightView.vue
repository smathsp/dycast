<template>
  <main v-if="item" class="focus-window" :class="focusTierClass">
    <article class="focus-card">
      <div class="window-drag-handle" aria-hidden="true"></div>
      <div class="concept-plate" aria-hidden="true"></div>
      <div class="concept-content">
        <div class="concept-user">
          <img v-if="item.avatar" class="concept-avatar" :src="item.avatar" alt="" />
          <span v-else class="concept-avatar concept-avatar-fallback">{{ getInitial(item.nickname) }}</span>
          <span v-if="item.badgeLevel" class="concept-level">{{ item.badgeLevel }}级</span>
          <strong ref="conceptNameRef" :title="item.nickname">{{ item.nickname || '匿名观众' }}</strong>
        </div>
        <div
          ref="conceptPanelRef"
          class="concept-message"
          :class="{ 'message-overflowing': conceptOverflowing }"
          :title="conceptOverflowing ? '内容较长，可在框内滚动查看完整弹幕' : ''">
          <p ref="conceptBodyRef" :style="{ fontSize: `${conceptFontSize}px` }">
            <InlineEmojiText :content="item.content" :emoji-url="item.emojiUrl" />
          </p>
        </div>
      </div>
      <div class="concept-actions">
        <span v-if="recordFeedback" class="record-feedback">{{ recordFeedback }}</span>
        <button
          class="record-button"
          :class="{ recorded: isRecorded }"
          type="button"
          :aria-label="isRecorded ? '这条弹幕已记录' : '记录这条弹幕'"
          :title="isRecorded ? '已记录' : '记录弹幕'"
          @click="recordComment">
          <span class="record-icon"></span>
        </button>
        <button type="button" aria-label="关闭放大弹幕" @click="closeWindow">×</button>
      </div>
      <div class="energy-rays"></div>
      <div class="card-shine"></div>
      <div class="focus-border"></div>
      <div class="energy-particles" aria-hidden="true">
        <i v-for="index in 12" :key="index" :style="{ '--i': index }"></i>
      </div>
      <div class="tier-visual" aria-hidden="true">
        <span class="tier-portal"></span>
        <span class="tier-crest"></span>
        <span class="tier-wing wing-left"></span>
        <span class="tier-wing wing-right"></span>
        <span class="tier-shards"><i></i><i></i><i></i><i></i><i></i></span>
        <span class="tier-orbit orbit-a"></span>
        <span class="tier-orbit orbit-b"></span>
        <svg class="focus-dragon" viewBox="0 0 520 190" preserveAspectRatio="xMidYMid meet">
          <path class="dragon-cloud" d="M12 154c28-29 55-28 82 2 19-31 53-38 82-15 14 11 20 27 18 45m165-24c18-22 39-23 61-3 18-27 48-30 70-8 8 8 12 18 12 31" />
          <path class="dragon-glow" d="M22 133C92 28 157 175 239 94s143-95 202-34c24 25 44 27 68 5" />
          <path class="dragon-body" d="M22 133C92 28 157 175 239 94s143-95 202-34c24 25 44 27 68 5" />
          <path class="dragon-scales" d="M72 86c12 22 27 29 45 18m22 25c16 17 32 18 48 2m23-2c16 8 31 5 45-9m25-34c15 7 30 4 43-8m25-19c14 10 28 10 42 2" />
          <path class="dragon-claws" d="M189 124c-5 24-19 38-42 42m42-42 14 32m-56 10-15-7m15 7-7 15m217-116c-2 23-15 38-37 46m37-46 18 30m-54 16-15-3m15 3-3 16" />
          <path class="dragon-head" d="M423 63c19-23 51-24 74-7l31 2-18 19 21 13-36 9c-23 19-54 14-72-8l-22-5 19-12-18-12z" />
          <path class="dragon-horns" d="M440 54c-6-22 4-39 28-50m5 46c4-20 17-33 39-37m-84 80c-35 11-58 29-70 55m83-47c-26 21-39 43-40 68" />
          <path class="dragon-whiskers" d="M496 72c25-14 40-10 47 10m-52 13c24 10 36 25 34 46" />
          <circle class="dragon-eye" cx="482" cy="64" r="5" />
        </svg>
      </div>

      <header class="focus-header">
        <span class="focus-kicker"><i></i> LIVE COMMENT FOCUS</span>
        <span class="header-line"></span>
        <div class="window-actions">
          <span v-if="recordFeedback" class="record-feedback">{{ recordFeedback }}</span>
          <button
            class="record-button"
            :class="{ recorded: isRecorded }"
            type="button"
            :aria-label="isRecorded ? '这条弹幕已记录' : '记录这条弹幕'"
            :title="isRecorded ? '已记录' : '记录弹幕'"
            @click="recordComment">
            <span class="record-icon"></span>
          </button>
          <button type="button" aria-label="关闭放大弹幕" @click="closeWindow">×</button>
        </div>
      </header>

      <div class="focus-main">
        <div class="avatar-stage">
          <span class="avatar-ring ring-a"></span>
          <span class="avatar-ring ring-b"></span>
          <span class="avatar-ring ring-c"></span>
          <img v-if="item.avatar" :src="item.avatar" alt="" />
          <span v-else class="avatar-fallback">{{ getInitial(item.nickname) }}</span>
          <span
            v-if="item.badgeLevel"
            class="comment-badge"
            :class="getBadgeTierClass(item.badgeLevel)"
            :aria-label="`当前主播灯牌 ${item.badgeLevel} 级`">
            {{ item.badgeLevel }}级
          </span>
        </div>

        <div class="focus-copy">
          <div class="user-line">
            <span>主播回应</span>
            <time>{{ formatTime(item.timestamp) }}</time>
          </div>
          <strong ref="focusNameRef" class="focus-name" :title="item.nickname">{{ item.nickname || '匿名观众' }}</strong>
          <div
            ref="messagePanelRef"
            class="message-panel"
            :class="{ 'message-overflowing': messageOverflowing }"
            :title="messageOverflowing ? '内容较长，可在框内滚动查看完整弹幕' : ''"
            @load.capture="scheduleMessageFit">
            <b>“</b>
            <p ref="messageBodyRef" :style="{ fontSize: `${fittedFontSize}px` }">
              <InlineEmojiText :content="item.content" :emoji-url="item.emojiUrl" />
            </p>
            <b>”</b>
          </div>
        </div>
      </div>

      <footer class="energy-footer">
        <span>拖动窗口 · 边缘调整大小</span>
        <div class="energy-bars" aria-hidden="true">
          <i v-for="index in 14" :key="index" :style="{ animationDelay: `${index * -0.05}s` }"></i>
        </div>
        <strong>ON AIR</strong>
      </footer>
      <div
        class="window-resize-handle"
        aria-hidden="true"
        @pointerdown="startCurrentWindowResize"></div>
    </article>
  </main>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import InlineEmojiText from '@/components/InlineEmojiText.vue';
import { getDanmuVisualLevel } from '@/danmu/visual';
import { startCurrentWindowResize } from '@/utils/windowResizeUtil';
import {
  COMMENT_RECORDS_STORAGE_KEY,
  getCommentRecordKey,
  loadCommentRecords,
  saveCommentRecord,
  type CommentRecordItem
} from '@/utils/commentRecordUtil';

interface HighlightItem extends CommentRecordItem {}

const item = ref<HighlightItem | null>(null);
const isRecorded = ref(false);
const recordFeedback = ref('');
const messagePanelRef = ref<HTMLElement | null>(null);
const messageBodyRef = ref<HTMLElement | null>(null);
const fittedFontSize = ref(36);
const messageOverflowing = ref(false);
const conceptPanelRef = ref<HTMLElement | null>(null);
const conceptBodyRef = ref<HTMLElement | null>(null);
const conceptNameRef = ref<HTMLElement | null>(null);
const focusNameRef = ref<HTMLElement | null>(null);
const conceptFontSize = ref(36);
const conceptOverflowing = ref(false);
const DANMU_SETTINGS_KEY = 'dycast_danmu_settings';
function loadRedNicknameKeywords(): string {
  try {
    const parsed = JSON.parse(localStorage.getItem(DANMU_SETTINGS_KEY) || '{}');
    return String(parsed.redDanmuNicknameKeywords || '').slice(0, 500);
  } catch {
    return '';
  }
}
const redNicknameKeywords = ref(loadRedNicknameKeywords());
const focusTierClass = computed(() => {
  const visualLevel = getDanmuVisualLevel(
    item.value?.badgeLevel || 0,
    item.value?.nickname,
    redNicknameKeywords.value
  );
  return `focus-tier-${getBadgeTierClass(visualLevel).replace('badge-', '')}`;
});
let stopHighlightListener: (() => void) | null = null;
let messageResizeObserver: ResizeObserver | null = null;
let fitFrame: number | null = null;
let recordFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

function handleDanmuSettingsStorage(event: StorageEvent): void {
  if (event.key === DANMU_SETTINGS_KEY) redNicknameKeywords.value = loadRedNicknameKeywords();
}

function updateRecordedState(): void {
  if (!item.value) {
    isRecorded.value = false;
    return;
  }
  const key = getCommentRecordKey(item.value);
  isRecorded.value = loadCommentRecords().some(record => record.recordKey === key);
}

function showRecordFeedback(message: string): void {
  recordFeedback.value = message;
  if (recordFeedbackTimer) clearTimeout(recordFeedbackTimer);
  recordFeedbackTimer = setTimeout(() => {
    recordFeedback.value = '';
    recordFeedbackTimer = null;
  }, 1600);
}

function recordComment(): void {
  if (!item.value) return;
  if (isRecorded.value) {
    showRecordFeedback('已记录');
    return;
  }

  try {
    saveCommentRecord(item.value);
    isRecorded.value = true;
    showRecordFeedback('已记录');
  } catch (error) {
    console.warn('[CommentHighlight] 保存弹幕记录失败:', error);
    showRecordFeedback('保存失败');
  }
}

const MIN_NICKNAME_FONT_SIZE = 18;

function fitNicknameFont(element: HTMLElement | null): void {
  if (!element) return;
  element.classList.remove('nickname-multiline');
  element.style.fontSize = '';
  const maximumSize = Math.max(MIN_NICKNAME_FONT_SIZE, Math.round(parseFloat(getComputedStyle(element).fontSize) || MIN_NICKNAME_FONT_SIZE));
  const availableWidth = element.clientWidth;
  if (availableWidth <= 0) return;

  let low = MIN_NICKNAME_FONT_SIZE;
  let high = maximumSize;
  let best = MIN_NICKNAME_FONT_SIZE;
  while (low <= high) {
    const candidate = Math.floor((low + high) / 2);
    element.style.fontSize = `${candidate}px`;
    if (element.scrollWidth <= availableWidth + 1) {
      best = candidate;
      low = candidate + 1;
    } else {
      high = candidate - 1;
    }
  }
  element.style.fontSize = `${best}px`;
  if (element.scrollWidth > availableWidth + 1) {
    element.classList.add('nickname-multiline');
  }
}

function fitMessageFont(): void {
  fitFrame = null;
  fitNicknameFont(focusNameRef.value);
  fitNicknameFont(conceptNameRef.value);
  const panel = messagePanelRef.value;
  const body = messageBodyRef.value;
  if (panel && body) {
    const panelStyle = getComputedStyle(panel);
    const availableHeight = panel.clientHeight
      - parseFloat(panelStyle.paddingTop)
      - parseFloat(panelStyle.paddingBottom);
    if (availableHeight > 0) {
      const minSize = 12;
      const maxSize = Math.min(144, Math.max(36, Math.floor(availableHeight / 1.42)));
      let low = minSize;
      let high = maxSize;
      let best = minSize;
      while (low <= high) {
        const candidate = Math.floor((low + high) / 2);
        body.style.fontSize = `${candidate}px`;
        if (body.scrollHeight <= availableHeight + 1) {
          best = candidate;
          low = candidate + 1;
        } else {
          high = candidate - 1;
        }
      }
      fittedFontSize.value = best;
      body.style.fontSize = `${best}px`;
      messageOverflowing.value = body.scrollHeight > availableHeight + 1;
    }
  } else {
    messageOverflowing.value = false;
  }

  const conceptPanel = conceptPanelRef.value;
  const conceptBody = conceptBodyRef.value;
  if (!conceptPanel || !conceptBody) return;
  const conceptStyle = getComputedStyle(conceptPanel);
  const conceptHeight = conceptPanel.clientHeight
    - parseFloat(conceptStyle.paddingTop)
    - parseFloat(conceptStyle.paddingBottom);
  const conceptWidth = conceptPanel.clientWidth
    - parseFloat(conceptStyle.paddingLeft)
    - parseFloat(conceptStyle.paddingRight);
  let conceptLow = 12;
  let conceptHigh = Math.min(108, Math.max(34, Math.floor(conceptHeight / 1.18)));
  let conceptBest = conceptLow;
  while (conceptLow <= conceptHigh) {
    const candidate = Math.floor((conceptLow + conceptHigh) / 2);
    conceptBody.style.fontSize = `${candidate}px`;
    if (conceptBody.scrollHeight <= conceptHeight + 1 && conceptBody.scrollWidth <= conceptWidth + 1) {
      conceptBest = candidate;
      conceptLow = candidate + 1;
    } else {
      conceptHigh = candidate - 1;
    }
  }
  conceptFontSize.value = conceptBest;
  conceptBody.style.fontSize = `${conceptBest}px`;
  conceptOverflowing.value =
    conceptBody.scrollHeight > conceptHeight + 1 || conceptBody.scrollWidth > conceptWidth + 1;
}

function scheduleMessageFit(): void {
  if (fitFrame !== null) cancelAnimationFrame(fitFrame);
  fitFrame = requestAnimationFrame(() => fitMessageFont());
}

function getInitial(nickname?: string): string {
  return (nickname || '观').trim().slice(0, 1).toUpperCase();
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp || Date.now());
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

function getBadgeTierClass(level: number): string {
  if (level >= 15) return 'badge-red';
  if (level >= 10) return 'badge-purple';
  if (level >= 5) return 'badge-orange';
  return 'badge-white';
}

function closeWindow(): void {
  if (window.electronAPI?.closeCommentHighlight) window.electronAPI.closeCommentHighlight();
  else window.close();
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') closeWindow();
}

function handleRecordStorage(event: StorageEvent): void {
  if (event.key === COMMENT_RECORDS_STORAGE_KEY || event.key === null) updateRecordedState();
}

onMounted(() => {
  stopHighlightListener = window.electronAPI?.onCommentHighlight?.((payload: HighlightItem) => {
    item.value = payload;
  }) || null;
  if (!window.electronAPI && new URLSearchParams(location.search).has('preview')) {
    const previewParams = new URLSearchParams(location.search);
    const previewBadgeLevel = Math.min(30, Math.max(0, Math.round(Number(previewParams.get('badge')) || 0)));
    item.value = {
      id: `preview-${previewBadgeLevel}`,
      avatar: '',
      nickname: previewParams.get('nickname')?.slice(0, 40) || '观山海',
      content: previewParams.get('content')?.slice(0, 500) || '首赢了，接下来主播准备讲哪一部分？',
      timestamp: Date.now(),
      badgeLevel: previewBadgeLevel
    };
  }
  messageResizeObserver = new ResizeObserver(() => scheduleMessageFit());
  void nextTick().then(() => {
    if (messagePanelRef.value) messageResizeObserver?.observe(messagePanelRef.value);
    if (conceptPanelRef.value) messageResizeObserver?.observe(conceptPanelRef.value);
    scheduleMessageFit();
  });
  void document.fonts?.ready.then(() => scheduleMessageFit());
  window.addEventListener('resize', scheduleMessageFit);
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('storage', handleRecordStorage);
  window.addEventListener('storage', handleDanmuSettingsStorage);
});

onBeforeUnmount(() => {
  stopHighlightListener?.();
  messageResizeObserver?.disconnect();
  if (fitFrame !== null) cancelAnimationFrame(fitFrame);
  if (recordFeedbackTimer) clearTimeout(recordFeedbackTimer);
  window.removeEventListener('resize', scheduleMessageFit);
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('storage', handleRecordStorage);
  window.removeEventListener('storage', handleDanmuSettingsStorage);
});

watch(item, () => {
  fittedFontSize.value = 36;
  messageOverflowing.value = false;
  conceptFontSize.value = 36;
  conceptOverflowing.value = false;
  recordFeedback.value = '';
  updateRecordedState();
  void nextTick().then(() => {
    if (messagePanelRef.value) messageResizeObserver?.observe(messagePanelRef.value);
    if (conceptPanelRef.value) messageResizeObserver?.observe(conceptPanelRef.value);
    scheduleMessageFit();
  });
});
</script>

<style lang="scss" scoped>
.focus-window {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 0;
  overflow: hidden;
  background: transparent;
  font-family: 'DouyinSansBold', 'Microsoft YaHei UI', sans-serif;
}

.focus-card {
  position: relative;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: grid;
  grid-template-rows: 58px minmax(0, 1fr) 30px;
  overflow: hidden;
  color: #fff;
  clip-path: polygon(22px 0, calc(100% - 22px) 0, 100% 22px, 100% calc(100% - 22px), calc(100% - 22px) 100%, 22px 100%, 0 calc(100% - 22px), 0 22px);
  background:
    radial-gradient(circle at 17% 52%, rgba(255, 191, 34, 0.18), transparent 27%),
    radial-gradient(circle at 76% 5%, rgba(59, 119, 255, 0.18), transparent 40%),
    linear-gradient(120deg, rgba(23, 19, 21, 0.99), rgba(13, 20, 39, 0.99) 48%, rgba(18, 13, 28, 0.99));
  box-shadow: inset 0 0 0 1px rgba(255, 230, 150, 0.1);
  -webkit-app-region: no-drag;
  animation: focusReveal 0.28s cubic-bezier(0.18, 1.2, 0.3, 1) both;
}

/*
 * Electron 的原生拖拽命中区域不应覆盖整个带动画的透明窗口。
 * 单独保留一条顶部拖拽带，并避开右侧操作按钮，防止高 DPI 下命中蒙版错位。
 */
.window-drag-handle {
  position: absolute;
  z-index: 19;
  top: 0;
  left: 0;
  right: clamp(200px, 24vw, 280px);
  height: clamp(58px, 10vh, 86px);
  -webkit-app-region: drag;
  user-select: none;
}

.focus-border {
  position: absolute;
  z-index: 6;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(100deg, #ff9d18, #ffe790 28%, #58cfff 58%, #9674ff 78%, #ffb32c);
  clip-path: polygon(
    22px 0, calc(100% - 22px) 0, 100% 22px, 100% calc(100% - 22px),
    calc(100% - 22px) 100%, 22px 100%, 0 calc(100% - 22px), 0 22px,
    3px 24px, 3px calc(100% - 24px), 24px calc(100% - 3px),
    calc(100% - 24px) calc(100% - 3px), calc(100% - 3px) calc(100% - 24px),
    calc(100% - 3px) 24px, calc(100% - 24px) 3px, 24px 3px
  );
  filter: drop-shadow(0 0 8px rgba(255, 193, 50, 0.56)) drop-shadow(0 0 18px rgba(83, 179, 255, 0.3));
}

.energy-rays {
  position: absolute;
  left: -90px;
  top: 50%;
  width: 420px;
  height: 420px;
  opacity: 0.22;
  transform: translateY(-50%);
  background: repeating-conic-gradient(from 0deg, #ffd451 0deg 2deg, transparent 2deg 16deg);
  mask-image: radial-gradient(circle, #000, transparent 68%);
  animation: raysSpin 18s linear infinite;
}

.card-shine {
  position: absolute;
  z-index: 5;
  top: -45%;
  bottom: -45%;
  left: -220px;
  width: 110px;
  pointer-events: none;
  background: linear-gradient(90deg, transparent, rgba(255, 247, 199, 0.32), transparent);
  transform: rotate(18deg);
  animation: cardShine 3.2s 0.5s ease-in-out infinite;
}

.focus-header {
  position: relative;
  z-index: 8;
  height: 58px;
  padding: 0 17px 0 29px;
  display: flex;
  align-items: center;
  gap: 17px;
  box-sizing: border-box;
  user-select: none;
  -webkit-app-region: drag;
}

.focus-kicker {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #ffe07c;
  font: 900 11px/1 sans-serif;
  letter-spacing: 0.22em;
  text-shadow: 0 0 12px rgba(255, 184, 34, 0.55);

  i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ffe27b;
    box-shadow: 0 0 5px #fff, 0 0 15px #ffb222;
    animation: beaconPulse 1.3s ease-in-out infinite;
  }
}

.header-line {
  height: 1px;
  flex: 1;
  opacity: 0.55;
  background: linear-gradient(90deg, rgba(255, 214, 91, 0.72), rgba(84, 196, 255, 0.4), transparent);
}

.focus-header button {
  width: 37px;
  height: 37px;
  display: grid;
  place-items: center;
  color: #e8ebf5;
  border: 1px solid rgba(255, 224, 126, 0.3);
  clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px);
  background: rgba(255, 255, 255, 0.055);
  font: 26px/1 sans-serif;
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition: color 0.18s, background 0.18s, border-color 0.18s;

  &:hover { color: #fff; border-color: #ffbd3b; background: rgba(226, 97, 44, 0.2); }
}

.window-actions {
  display: flex;
  align-items: center;
  gap: 7px;
  -webkit-app-region: no-drag;
}

.window-actions,
.window-actions button,
.window-actions button * {
  -webkit-app-region: no-drag !important;
}

.record-feedback {
  margin-right: 3px;
  color: #ffe28a;
  font: 800 11px/1 'Microsoft YaHei UI', sans-serif;
  letter-spacing: 0.08em;
  text-shadow: 0 0 10px rgba(255, 193, 55, 0.5);
  animation: recordFeedbackIn 0.18s ease both;
}

.record-icon {
  width: 14px;
  height: 17px;
  box-sizing: border-box;
  border: 2px solid currentColor;
  clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 72%, 0 100%);
  transition: background 0.18s, box-shadow 0.18s;
}

.record-button.recorded {
  color: #ffe27d;
  border-color: rgba(255, 211, 94, 0.62);
  background: rgba(255, 190, 46, 0.14);

  .record-icon {
    background: currentColor;
    box-shadow: 0 0 10px rgba(255, 195, 52, 0.72);
  }
}

.focus-main {
  position: relative;
  z-index: 4;
  min-height: 0;
  display: grid;
  grid-template-columns: 162px minmax(0, 1fr);
  align-items: stretch;
  gap: 36px;
  box-sizing: border-box;
  padding: 3px 58px 25px 54px;
}

.avatar-stage {
  position: relative;
  width: 146px;
  height: 146px;
  display: grid;
  place-items: center;
  align-self: center;
}

.avatar-stage > img,
.avatar-fallback {
  position: relative;
  z-index: 3;
  width: 124px;
  height: 124px;
  box-sizing: border-box;
  border: 3px solid #ffda5c;
  border-radius: 50%;
  object-fit: cover;
  box-shadow: 0 0 0 7px rgba(255, 203, 58, 0.09), 0 14px 34px rgba(0, 0, 0, 0.42);
}

.avatar-fallback {
  display: grid;
  place-items: center;
  color: #2e1b00;
  background: linear-gradient(135deg, #fff2a0, #ffac22);
  font-size: 43px;
}

.avatar-ring {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
}
.ring-a {
  inset: 0;
  border: 3px solid rgba(255, 211, 76, 0.95);
  border-left-color: transparent;
  box-shadow: 0 0 15px rgba(255, 197, 39, 0.65);
  animation: ringSpin 4s linear infinite;
}
.ring-b {
  inset: -9px;
  border: 1px dashed rgba(116, 206, 255, 0.65);
  animation: ringSpinReverse 6s linear infinite;
}
.ring-c {
  inset: 10px;
  border: 1px solid rgba(255, 241, 172, 0.2);
  box-shadow: inset 0 0 18px rgba(255, 193, 43, 0.14);
}

.comment-badge {
  position: absolute;
  z-index: 7;
  right: 3px;
  bottom: 4px;
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  color: #fff;
  font: 400 36px/1 'PangMenZhengDaoCuShuTi', 'Arial Black', sans-serif;
  padding-top: 2px;
  text-shadow: 0 0 5px #fff, 0 0 13px rgba(130, 153, 211, 0.72);
}

.comment-badge.badge-orange {
  color: #fff5e2;
  text-shadow: 0 0 5px #fff1cb, 0 0 14px #ff8a27, 0 0 24px rgba(255, 76, 17, 0.72);
}

.comment-badge.badge-purple {
  color: #f3ceff;
  text-shadow: 0 0 5px #fff, 0 0 15px #d568ff, 0 0 26px rgba(139, 43, 237, 0.82);
}

.comment-badge.badge-red {
  color: #fff8e8;
  text-shadow: 0 0 5px #fff3ce, 0 0 16px #ff6541, 0 0 28px rgba(255, 24, 58, 0.94);
}

.focus-copy {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.user-line {
  display: flex;
  align-items: center;
  gap: 14px;

  span {
    color: #ffcd53;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.18em;
    text-shadow: 0 0 9px rgba(255, 174, 23, 0.52);
  }
  time { color: rgba(142, 174, 215, 0.62); font: 700 10px/1 sans-serif; letter-spacing: 0.1em; }
}

.focus-name {
  display: block;
  max-width: 100%;
  margin-top: 7px;
  overflow: hidden;
  font-size: clamp(28px, 4vw, 38px);
  font-style: italic;
  letter-spacing: 0.04em;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: linear-gradient(180deg, #fff, #fff5bd 48%, #ffd84c 82%, #ff9b20);
  -webkit-background-clip: text;
  color: transparent;
  filter: drop-shadow(0 3px 0 rgba(77, 39, 0, 0.7)) drop-shadow(0 0 11px rgba(255, 187, 42, 0.45));
}

.message-panel {
  position: relative;
  max-width: 100%;
  flex: 1 1 auto;
  margin-top: 10px;
  padding: 10px 36px 12px;
  box-sizing: border-box;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: none;
  border-left: 3px solid rgba(255, 211, 70, 0.82);
  background: linear-gradient(90deg, rgba(255, 198, 54, 0.1), rgba(41, 75, 126, 0.08), transparent);

  &::-webkit-scrollbar {
    width: 0;
    height: 0;
  }

  p {
    margin: 0;
    color: #fffdf3;
    font: 800 clamp(22px, 3.2vw, 36px)/1.48 'Microsoft YaHei UI', sans-serif;
    overflow-wrap: anywhere;
    word-break: break-word;
    text-shadow: 0 3px 18px rgba(0, 0, 0, 0.38), 0 0 14px rgba(255, 219, 116, 0.08);
  }
  b {
    position: absolute;
    color: rgba(255, 219, 101, 0.42);
    font: 46px/1 Georgia, serif;
  }
  b:first-child { left: 8px; top: 2px; }
  b:last-child { right: 8px; bottom: -13px; }
}

.energy-footer {
  position: relative;
  z-index: 7;
  align-self: end;
  margin: 0 28px 14px;
  height: 16px;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 14px;
  color: rgba(109, 137, 174, 0.48);
  font: 8px/1 sans-serif;
  letter-spacing: 0.08em;

  strong { color: rgba(255, 210, 71, 0.55); font-size: 8px; letter-spacing: 0.2em; }
}

.energy-bars {
  display: grid;
  grid-template-columns: repeat(14, 1fr);
  gap: 4px;

  i {
    height: 3px;
    transform: skewX(-22deg);
    background: linear-gradient(90deg, rgba(255, 195, 43, 0.28), rgba(76, 190, 255, 0.42));
    animation: barPulse 0.8s calc(var(--n, 0) * -0.04s) ease-in-out infinite alternate;
  }
}

.energy-particles {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;

  i {
    --angle: calc(var(--i) * 29deg);
    position: absolute;
    left: calc(8% + (var(--i) * 7%));
    top: calc(8% + var(--i) * 6.5%);
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: #ffd663;
    box-shadow: 0 0 7px #ffc23b, 0 0 15px rgba(70, 188, 255, 0.45);
    animation: particleDrift calc(2.3s + var(--i) * 0.08s) calc(var(--i) * -0.17s) ease-in-out infinite;
  }
}

/* 等级主题背景：全部位于正文下层，不参与鼠标交互。 */
.tier-visual {
  position: absolute;
  inset: 0;
  z-index: 1;
  overflow: hidden;
  pointer-events: none;
}

.tier-orbit {
  position: absolute;
  border-radius: 50%;
  opacity: 0;
  transform-origin: center;
}

.focus-dragon {
  position: absolute;
  right: -2%;
  top: 50%;
  width: min(68%, 760px);
  height: 82%;
  overflow: visible;
  opacity: 0;
  transform: translateY(-50%);
  filter: drop-shadow(0 0 8px rgba(255, 220, 127, 0.8)) drop-shadow(0 0 22px rgba(255, 36, 45, 0.66));

  path {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .dragon-glow { stroke: rgba(255, 35, 38, 0.58); stroke-width: 17; filter: blur(10px); }
  .dragon-body,
  .dragon-head { stroke: #ffe4a2; stroke-width: 5; }
  .dragon-body { stroke-dasharray: 72 16 12 16; animation: focusDragonEnergy 2.4s linear infinite; }
  .dragon-head { fill: rgba(255, 87, 38, 0.12); }
  .dragon-scales,
  .dragon-claws,
  .dragon-horns,
  .dragon-whiskers { stroke: rgba(255, 193, 84, 0.88); stroke-width: 3.3; }
  .dragon-cloud { stroke: rgba(255, 94, 52, 0.43); stroke-width: 2.4; stroke-dasharray: 10 11; }
  .dragon-eye {
    fill: #fffbd8;
    stroke: #ff253b;
    stroke-width: 2.2;
    filter: drop-shadow(0 0 6px #fff) drop-shadow(0 0 13px #ff263d);
    transform-origin: 482px 64px;
    animation: focusDragonEye 0.7s ease-in-out infinite alternate;
  }
}

/* 0–4级：银白冷光 */
.focus-tier-white {
  .focus-card {
    background:
      radial-gradient(circle at 17% 52%, rgba(221, 241, 255, 0.16), transparent 28%),
      radial-gradient(circle at 78% 7%, rgba(87, 178, 255, 0.15), transparent 42%),
      linear-gradient(120deg, rgba(22, 27, 34, 0.99), rgba(13, 25, 40, 0.99) 52%, rgba(20, 21, 31, 0.99));
  }
  .focus-border { background: linear-gradient(100deg, #eef8ff, #94cfff 32%, #fff 56%, #758cff 82%, #e9f8ff); }
  .energy-rays { background: repeating-conic-gradient(from 0deg, #e8f6ff 0deg 2deg, transparent 2deg 17deg); opacity: 0.14; }
  .focus-kicker, .user-line span { color: #eaf7ff; text-shadow: 0 0 11px rgba(142, 211, 255, 0.62); }
  .focus-kicker i { background: #eafaff; box-shadow: 0 0 5px #fff, 0 0 15px #70cfff; }
  .avatar-stage > img, .avatar-fallback { border-color: #eaf8ff; box-shadow: 0 0 0 7px rgba(187, 228, 255, 0.08), 0 0 22px rgba(119, 197, 255, 0.38); }
  .ring-a { border-color: rgba(225, 247, 255, 0.94); border-left-color: transparent; box-shadow: 0 0 15px rgba(121, 207, 255, 0.6); }
  .focus-name { background: linear-gradient(180deg, #fff, #e9f6ff 54%, #a6d8ff); -webkit-background-clip: text; filter: drop-shadow(0 3px 0 rgba(16, 36, 52, 0.76)) drop-shadow(0 0 11px rgba(135, 210, 255, 0.42)); }
  .message-panel { border-left-color: rgba(211, 242, 255, 0.82); background: linear-gradient(90deg, rgba(180, 227, 255, 0.1), rgba(61, 94, 136, 0.07), transparent); }
  .message-panel b { color: rgba(211, 241, 255, 0.38); }
  .energy-particles i { background: #e8f8ff; box-shadow: 0 0 7px #b8e9ff, 0 0 15px rgba(96, 169, 255, 0.45); }
}

/* 5–9级：橙金能量 */
.focus-tier-orange {
  .focus-card {
    background:
      radial-gradient(circle at 17% 52%, rgba(255, 174, 43, 0.26), transparent 29%),
      radial-gradient(circle at 80% 3%, rgba(255, 92, 22, 0.2), transparent 41%),
      linear-gradient(120deg, rgba(35, 21, 13, 0.99), rgba(43, 22, 14, 0.99) 51%, rgba(27, 16, 27, 0.99));
  }
  .focus-border { background: linear-gradient(100deg, #ff8f24, #ffe29a 28%, #ffb52e 54%, #ff6430 79%, #fff0a9); filter: drop-shadow(0 0 10px rgba(255, 147, 35, 0.7)); }
  .energy-rays { background: repeating-conic-gradient(from 0deg, #ffbf3d 0deg 3deg, transparent 3deg 15deg); opacity: 0.28; }
  .card-shine { background: linear-gradient(90deg, transparent, rgba(255, 231, 157, 0.5), transparent); }
  .focus-kicker, .user-line span { color: #ffc351; text-shadow: 0 0 13px rgba(255, 115, 22, 0.72); }
  .focus-kicker i { background: #ffd76a; box-shadow: 0 0 5px #fff, 0 0 18px #ff7b20; }
  .avatar-stage > img, .avatar-fallback { border-color: #ffb63d; box-shadow: 0 0 0 7px rgba(255, 150, 35, 0.1), 0 0 26px rgba(255, 97, 23, 0.58); }
  .ring-a { border-color: #ffb02e; border-left-color: transparent; box-shadow: 0 0 18px rgba(255, 103, 22, 0.78); }
  .focus-name { background: linear-gradient(180deg, #fff, #fff0bc 43%, #ffbd3c 76%, #ff6824); -webkit-background-clip: text; filter: drop-shadow(0 3px 0 rgba(89, 34, 0, 0.74)) drop-shadow(0 0 14px rgba(255, 117, 27, 0.58)); }
  .message-panel { border-left-color: rgba(255, 171, 49, 0.9); background: linear-gradient(90deg, rgba(255, 126, 28, 0.14), rgba(125, 56, 25, 0.06), transparent); }
  .message-panel b { color: rgba(255, 180, 57, 0.5); }
  .energy-particles i { background: #ffd15c; box-shadow: 0 0 8px #ff9a28, 0 0 18px rgba(255, 74, 19, 0.62); }
  .orbit-a {
    left: -115px; top: 50%; width: 360px; height: 360px; opacity: 0.2; transform: translateY(-50%);
    background: repeating-conic-gradient(from 8deg, #ffb52d 0 3deg, transparent 3deg 15deg);
    -webkit-mask: radial-gradient(circle, transparent 0 46%, #000 47% 49%, transparent 50% 59%, #000 60% 61%, transparent 62%);
    animation: tierOrbitSpin 16s linear infinite;
  }
}

/* 10–14级：紫色星环 */
.focus-tier-purple {
  .focus-card {
    background:
      radial-gradient(circle at 17% 52%, rgba(208, 103, 255, 0.27), transparent 28%),
      radial-gradient(circle at 75% 10%, rgba(74, 102, 255, 0.23), transparent 42%),
      linear-gradient(120deg, rgba(25, 9, 44, 0.99), rgba(21, 16, 61, 0.99) 51%, rgba(36, 8, 49, 0.99));
    animation: focusReveal 0.28s cubic-bezier(0.18, 1.2, 0.3, 1) both, purpleCardPulse 2.4s 0.3s ease-in-out infinite alternate;
  }
  .focus-border { background: linear-gradient(100deg, #a34dff, #f0b6ff 27%, #68e7ff 55%, #7868ff 78%, #ee72ff); filter: drop-shadow(0 0 10px rgba(198, 91, 255, 0.78)) drop-shadow(0 0 22px rgba(71, 134, 255, 0.38)); }
  .energy-rays { background: repeating-conic-gradient(from 0deg, #ca72ff 0deg 2deg, transparent 2deg 14deg); opacity: 0.3; }
  .card-shine { background: linear-gradient(90deg, transparent, rgba(231, 178, 255, 0.48), rgba(103, 220, 255, 0.28), transparent); }
  .focus-kicker, .user-line span { color: #dea0ff; text-shadow: 0 0 13px rgba(182, 68, 255, 0.82); }
  .focus-kicker i { background: #e5a7ff; box-shadow: 0 0 5px #fff, 0 0 19px #a83fff; }
  .header-line { background: linear-gradient(90deg, rgba(221, 124, 255, 0.86), rgba(86, 217, 255, 0.58), transparent); }
  .avatar-stage > img, .avatar-fallback { border-color: #d282ff; box-shadow: 0 0 0 7px rgba(198, 89, 255, 0.11), 0 0 18px #a23dff, 0 0 35px rgba(59, 101, 255, 0.42); }
  .ring-a { border-color: #dc8cff; border-left-color: transparent; box-shadow: 0 0 20px rgba(177, 64, 255, 0.86); }
  .ring-b { border-color: rgba(88, 218, 255, 0.78); }
  .focus-name { background: linear-gradient(180deg, #fff, #f2cfff 43%, #c36cff 73%, #6cb9ff); -webkit-background-clip: text; filter: drop-shadow(0 3px 0 rgba(47, 13, 79, 0.78)) drop-shadow(0 0 15px rgba(179, 69, 255, 0.72)); }
  .message-panel { border-left-color: rgba(203, 105, 255, 0.92); background: linear-gradient(90deg, rgba(178, 68, 255, 0.16), rgba(61, 84, 179, 0.08), transparent); }
  .message-panel b { color: rgba(219, 139, 255, 0.52); }
  .energy-particles i { background: #e18aff; box-shadow: 0 0 8px #c04cff, 0 0 19px rgba(64, 178, 255, 0.72); }
  .orbit-a, .orbit-b {
    left: 58%; top: 50%; opacity: 0.26;
    background: conic-gradient(from 0deg, #d66dff, transparent 14%, #58dcff 29%, transparent 45%, #8a60ff 68%, transparent 82%, #e879ff);
    -webkit-mask: radial-gradient(circle, transparent 0 53%, #000 54% 55%, transparent 56% 67%, #000 68% 69%, transparent 70%);
  }
  .orbit-a { width: 520px; height: 520px; margin: -260px; animation: tierOrbitFlatSpin 12s linear infinite; }
  .orbit-b { width: 390px; height: 390px; margin: -195px; animation: tierOrbitFlatReverse 8s linear infinite; }
}

/* 15级以上：赤金龙纹 */
.focus-tier-red {
  .focus-card {
    background:
      radial-gradient(circle at 16% 52%, rgba(255, 180, 50, 0.29), transparent 28%),
      radial-gradient(circle at 76% 10%, rgba(255, 32, 66, 0.27), transparent 43%),
      linear-gradient(120deg, rgba(48, 8, 16, 0.995), rgba(27, 6, 23, 0.995) 50%, rgba(59, 7, 18, 0.995));
    animation: focusReveal 0.28s cubic-bezier(0.18, 1.2, 0.3, 1) both, redCardPulse 1.65s 0.3s ease-in-out infinite alternate;
  }
  .focus-border { background: linear-gradient(100deg, #ff293f, #ffd77a 25%, #fff1b4 43%, #ff633c 67%, #d72552 83%, #ffcb66); filter: drop-shadow(0 0 10px rgba(255, 224, 145, 0.82)) drop-shadow(0 0 27px rgba(255, 29, 60, 0.68)); }
  .energy-rays { background: repeating-conic-gradient(from 0deg, #ffcf56 0deg 3deg, transparent 3deg 13deg); opacity: 0.34; }
  .card-shine { width: 150px; background: linear-gradient(90deg, transparent, rgba(255, 244, 190, 0.62), rgba(255, 61, 47, 0.34), transparent); }
  .focus-kicker, .user-line span { color: #ffd05b; text-shadow: 0 0 6px #fff0bd, 0 0 16px rgba(255, 47, 51, 0.86); }
  .focus-kicker i { background: #fff0a6; box-shadow: 0 0 6px #fff, 0 0 22px #ff3140; }
  .header-line { background: linear-gradient(90deg, rgba(255, 210, 91, 0.92), rgba(255, 52, 62, 0.62), transparent); }
  .avatar-stage > img, .avatar-fallback { border-color: #ffcf57; box-shadow: 0 0 0 7px rgba(255, 187, 41, 0.12), 0 0 16px #fff0a4, 0 0 34px #ff2d47, 0 0 52px rgba(255, 89, 28, 0.42); }
  .ring-a { border-color: #ffd75c; border-left-color: transparent; box-shadow: 0 0 11px #fff1ad, 0 0 24px rgba(255, 40, 57, 0.9); }
  .ring-b { border-color: rgba(255, 82, 54, 0.82); }
  .focus-name { background: linear-gradient(180deg, #fff, #fff1b5 38%, #ffba37 68%, #ff3c3f); -webkit-background-clip: text; filter: drop-shadow(0 3px 0 rgba(93, 13, 20, 0.82)) drop-shadow(0 0 8px #fff0a4) drop-shadow(0 0 18px rgba(255, 37, 56, 0.82)); }
  .message-panel { border-left-color: rgba(255, 201, 63, 0.96); background: linear-gradient(90deg, rgba(255, 54, 45, 0.17), rgba(132, 42, 21, 0.08), transparent); }
  .message-panel b { color: rgba(255, 205, 82, 0.58); text-shadow: 0 0 13px rgba(255, 39, 47, 0.64); }
  .message-panel p { text-shadow: 0 3px 18px rgba(0, 0, 0, 0.48), 0 0 13px rgba(255, 192, 68, 0.16); }
  .energy-bars i { background: linear-gradient(90deg, rgba(255, 203, 55, 0.45), rgba(255, 48, 62, 0.62)); }
  .energy-particles i { width: 4px; height: 4px; background: #ffd15d; box-shadow: 0 0 8px #fff0a4, 0 0 20px #ff2d42; }
  .focus-dragon { opacity: 0.34; animation: focusDragonFloat 3.2s ease-in-out infinite alternate; }
}

@keyframes tierOrbitSpin { to { transform: translateY(-50%) rotate(360deg); } }
@keyframes tierOrbitFlatSpin { to { transform: rotate(360deg); } }
@keyframes tierOrbitFlatReverse { to { transform: rotate(-360deg); } }
@keyframes purpleCardPulse {
  to { filter: drop-shadow(0 0 19px rgba(183, 70, 255, 0.48)) saturate(1.16); }
}
@keyframes redCardPulse {
  to { filter: drop-shadow(0 0 10px rgba(255, 233, 166, 0.46)) drop-shadow(0 0 25px rgba(255, 28, 55, 0.58)) saturate(1.18); }
}
@keyframes focusDragonFloat {
  from { transform: translate3d(10px, -52%, 0) scale(0.98); opacity: 0.25; }
  to { transform: translate3d(-8px, -48%, 0) scale(1.035); opacity: 0.44; }
}
@keyframes focusDragonEnergy { to { stroke-dashoffset: -116; } }
@keyframes focusDragonEye { to { opacity: 0.4; transform: scale(1.45); } }

@keyframes focusReveal {
  0% { opacity: 0; transform: scale(0.78) translateY(24px); filter: brightness(2.1) blur(6px); }
  60% { opacity: 1; transform: scale(1.025) translateY(-3px); filter: brightness(1.22) blur(0); }
  100% { transform: scale(1); filter: brightness(1); }
}
@keyframes raysSpin { to { transform: translateY(-50%) rotate(360deg); } }
@keyframes cardShine {
  0%, 36% { left: -220px; opacity: 0; }
  50% { opacity: 1; }
  72%, 100% { left: calc(100% + 180px); opacity: 0; }
}
@keyframes ringSpin { to { transform: rotate(360deg); } }
@keyframes ringSpinReverse { to { transform: rotate(-360deg); } }
@keyframes beaconPulse { 50% { opacity: 0.45; transform: scale(0.75); } }
@keyframes barPulse { to { opacity: 0.28; } }
@keyframes recordFeedbackIn { from { opacity: 0; transform: translateX(5px); } }
@keyframes particleDrift {
  50% { transform: translate(12px, -10px) scale(1.5); opacity: 0.35; }
}

@media (max-width: 700px) {
  .focus-main { grid-template-columns: 120px minmax(0, 1fr); gap: 20px; padding-inline: 35px; }
  .avatar-stage { width: 112px; height: 112px; }
  .avatar-stage > img, .avatar-fallback { width: 96px; height: 96px; }
  .comment-badge { width: 32px; height: 32px; font-size: 29px; }
  .message-panel { padding-inline: 29px; }
}
</style>

<style lang="scss" scoped>
/* Exact approved concept presentation. The artwork is the frame; live copy sits on its empty plaque. */
.focus-window.focus-window.focus-window.focus-window {
  --concept-plate: url('../assets/highlight/concept/clear-highlight.png');
  --concept-ink: #fff7e7;
  --concept-accent: #f1d399;
  padding: 0;

  &.focus-tier-orange {
    --concept-plate: url('../assets/highlight/concept/pale-gold-highlight-v2.png');
    --concept-ink: #fffdf0;
    --concept-accent: #fff0a8;
  }

  &.focus-tier-purple {
    --concept-plate: url('../assets/highlight/concept/astral-wings-highlight-v2.png');
    --concept-ink: #fffaff;
    --concept-accent: #f0d6ff;
  }

  &.focus-tier-red {
    --concept-plate: url('../assets/highlight/concept/dragon-bright-eyes-highlight-v2.png');
    --concept-ink: #fff8e8;
    --concept-accent: #ffd77c;
  }

  .focus-card {
    width: 100%;
    height: 100%;
    display: block;
    overflow: hidden;
    clip-path: none;
    background: #02050b;
    box-shadow: none;
    animation: conceptReveal .36s cubic-bezier(.16,1,.3,1) both !important;
    transform: none !important;
  }

  .concept-plate {
    position: absolute;
    z-index: 1;
    inset: 0;
    background: var(--concept-plate) center / 100% 100% no-repeat;
    pointer-events: none;
  }

  /* The approved concept contains demo copy. This plaque masks only its interior, retaining the generated frame. */
  .concept-plate::after {
    content: '';
    position: absolute;
    z-index: 2;
    left: 21%;
    right: 18.5%;
    top: 38.8%;
    bottom: 17.5%;
    border-radius: 5px;
    background:
      radial-gradient(circle at 52% 55%, rgba(var(--tier-rgb), .06), transparent 58%),
      linear-gradient(110deg, rgb(3,5,11), rgb(10,6,16));
    box-shadow: inset 0 0 60px rgba(0,0,0,.36);
  }

  &.focus-tier-orange .concept-plate::after {
    left: 15%;
    right: 15%;
    top: 25%;
    bottom: 18%;
    background: radial-gradient(circle at 52% 55%, rgba(255,239,151,.055), transparent 58%), linear-gradient(110deg, rgb(8,8,5), rgb(16,14,7));
  }

  &.focus-tier-orange .concept-content {
    left: 15%;
    right: 15%;
    top: 25%;
    bottom: 18%;
  }

  &.focus-tier-purple .concept-plate::after {
    left: 20%;
    right: 20%;
    top: 35%;
    bottom: 24%;
    background: radial-gradient(circle at 52% 55%, rgba(127,73,255,.09), transparent 58%), linear-gradient(110deg, rgb(4,4,18), rgb(10,5,29));
  }

  &.focus-tier-purple .concept-content {
    left: 20%;
    right: 20%;
    top: 35%;
    bottom: 24%;
  }

  &.focus-tier-red .concept-plate::after {
    left: 18%;
    right: 14%;
    top: 34%;
    bottom: 17%;
    background: radial-gradient(circle at 52% 55%, rgba(148,12,25,.14), transparent 60%), linear-gradient(110deg, rgb(12,2,4), rgb(27,2,7));
  }

  &.focus-tier-red .concept-content {
    left: 18%;
    right: 14%;
    top: 34%;
    bottom: 17%;
  }

  &.focus-tier-orange .concept-plate::after,
  &.focus-tier-purple .concept-plate::after,
  &.focus-tier-red .concept-plate::after {
    display: none;
  }

  .concept-content {
    position: absolute;
    z-index: 6;
    left: 21%;
    right: 18.5%;
    top: 38.8%;
    bottom: 17.5%;
    display: grid;
    grid-template-rows: minmax(68px, .3fr) minmax(0, 1fr);
    box-sizing: border-box;
    padding: clamp(7px,1vw,16px) clamp(14px,2.4vw,40px) clamp(8px,1.2vw,18px);
    color: var(--concept-ink);
    pointer-events: none;
  }

  .concept-user {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: clamp(12px,1.6vw,26px);
    color: var(--concept-accent);
    font-family: 'PangMenZhengDaoCuShuTi','DouyinSansBold','Microsoft YaHei UI',sans-serif;
    text-shadow: 0 2px 8px #000,0 0 14px rgba(var(--tier-rgb),.35);
  }

  .concept-avatar {
    width: clamp(62px, 9vmin, 104px);
    height: clamp(62px, 9vmin, 104px);
    flex: 0 0 clamp(62px, 9vmin, 104px);
    display: grid;
    place-items: center;
    box-sizing: border-box;
    overflow: hidden;
    border: 2px solid var(--concept-accent);
    border-radius: 50%;
    object-fit: cover;
    color: var(--concept-accent);
    background: rgba(5, 7, 13, .62);
    box-shadow: 0 0 0 4px rgba(var(--tier-rgb), .09), 0 0 20px rgba(var(--tier-rgb), .48);
    font: 700 clamp(24px, 4vmin, 46px)/1 SimSun, '宋体', serif;
  }

  .concept-level {
    flex: 0 0 auto;
    font-family: 'PangMenZhengDaoCuShuTi','Arial Black',sans-serif;
    font-size: clamp(52px,8.8vmin,110px);
    line-height: .9;
  }

  .concept-user strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: clamp(34px,6vmin,76px);
    font-weight: 700;
  }

  .concept-message {
    min-width: 0;
    min-height: 0;
    display: grid;
    place-items: start;
    overflow: hidden;
    padding: clamp(3px,.7vh,8px) 0 0;
  }

  .concept-message p {
    width: 100%;
    max-width: 100%;
    margin: 0;
    overflow-wrap: anywhere;
    word-break: break-word;
    color: var(--concept-ink);
    font-family: 'DouyinSansBold','Microsoft YaHei UI',sans-serif;
    font-weight: 800;
    line-height: 1.16;
    letter-spacing: .02em;
    text-shadow: 0 3px 10px #000,0 0 14px rgba(var(--tier-rgb),.17);
  }

  .focus-header,
  .focus-main,
  .energy-footer,
  .energy-rays,
  .card-shine,
  .focus-border,
  .energy-particles,
  .tier-visual {
    display: none !important;
  }

  .concept-actions {
    position: absolute;
    z-index: 30;
    right: clamp(13px,2vw,28px);
    top: clamp(13px,2vw,28px);
    display: flex !important;
    align-items: center;
    gap: 9px;
    pointer-events: auto;
    -webkit-app-region: no-drag;
  }

  .concept-actions button {
    position: relative;
    z-index: 1;
    width: 46px;
    height: 46px;
    min-width: 46px;
    min-height: 46px;
    flex: 0 0 46px;
    display: grid;
    place-items: center;
    box-sizing: border-box;
    margin: 0;
    padding: 0 0 2px;
    color: var(--concept-accent);
    border: 1px solid rgba(var(--tier-rgb),.44);
    border-radius: 8px;
    background: rgba(2,4,10,.62);
    font: 30px/1 sans-serif;
    cursor: pointer;
    pointer-events: auto;
    -webkit-app-region: no-drag !important;
    box-shadow: inset 0 0 15px rgba(var(--tier-rgb),.1),0 0 12px rgba(var(--tier-rgb),.12);
  }

  .concept-actions button * {
    pointer-events: none;
    -webkit-app-region: no-drag !important;
  }

  .record-icon { display:block; }
  .record-feedback { color:var(--concept-accent); }
}

@keyframes conceptReveal {
  from { opacity:0; }
  to { opacity:1; }
}

@media (max-aspect-ratio: 4/3) {
  .focus-window.focus-window.focus-window.focus-window {
    .concept-plate { background-size: cover; }
    .concept-content { left:17%;right:14%;top:38%;bottom:18%; }
    .concept-plate::after { left:17%;right:14%;top:38%;bottom:18%; }
  }
}

@media (min-aspect-ratio: 16/10) {
  .focus-window.focus-window.focus-window.focus-window {
    .concept-message p { max-width: 82%; }
  }
}
</style>

<style lang="scss" scoped>
/* V4 tier showcase: aspect-ratio safe, with one static crest and compositor-only ambience. */
.focus-window.focus-window.focus-window {
& {
  --tier-rgb: 147, 225, 255;
  --tier: #dff9ff;
  --tier-2: #79d9ff;
  --tier-deep: #071828;
  --tier-crest: url('../assets/danmu-tier/moon-crest.svg');
  width: 100%;
  height: 100%;
  padding: clamp(10px, 2.2vmin, 24px);
  overflow: hidden;
  box-sizing: border-box;
  background: transparent;
}

&.focus-tier-orange {
  --tier-rgb: 255, 229, 135;
  --tier: #fff0a8;
  --tier-2: #e8c867;
  --tier-deep: #171406;
  --tier-crest: url('../assets/danmu-tier/phoenix-crest.svg');
}

&.focus-tier-purple {
  --tier-rgb: 162, 82, 255;
  --tier: #d9b0ff;
  --tier-2: #55ddff;
  --tier-deep: #10062c;
  --tier-crest: url('../assets/danmu-tier/astral-crest.svg');
}

&.focus-tier-red {
  --tier-rgb: 255, 45, 55;
  --tier: #ffd46d;
  --tier-2: #ff303f;
  --tier-deep: #26050b;
  --tier-crest: url('../assets/highlight/dragon-filigree-optimized.png');
}

.focus-card,
&.focus-tier-white .focus-card,
&.focus-tier-orange .focus-card,
&.focus-tier-purple .focus-card,
&.focus-tier-red .focus-card {
  position: relative;
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-rows: clamp(48px, 10vh, 64px) minmax(0, 1fr) 28px;
  overflow: hidden;
  isolation: isolate;
  clip-path: polygon(18px 0, calc(100% - 18px) 0, 100% 18px, 100% calc(100% - 18px), calc(100% - 18px) 100%, 18px 100%, 0 calc(100% - 18px), 0 18px);
  color: #fff;
  background:
    radial-gradient(ellipse at 14% 52%, rgba(var(--tier-rgb), .2), transparent 27%),
    radial-gradient(ellipse at 80% 0%, rgba(var(--tier-rgb), .16), transparent 42%),
    linear-gradient(118deg, rgba(4,9,17,.97), rgba(7,10,24,.96) 54%, rgba(var(--tier-rgb), .07)),
    #050812;
  box-shadow: inset 0 0 52px rgba(var(--tier-rgb), .08);
  contain: layout style;
  backface-visibility: hidden;
  -webkit-app-region: drag;
  animation: tierReveal .38s cubic-bezier(.16,1,.3,1) both;
}

.focus-border {
  z-index: 12;
  inset: 0;
  opacity: 1;
  background: linear-gradient(105deg, var(--tier-2), #fff1bd 26%, var(--tier) 51%, var(--tier-2) 78%, var(--tier));
  filter: drop-shadow(0 0 7px rgba(var(--tier-rgb), .75));
  clip-path: polygon(
    18px 0, calc(100% - 18px) 0, 100% 18px, 100% calc(100% - 18px), calc(100% - 18px) 100%, 18px 100%, 0 calc(100% - 18px), 0 18px,
    3px 20px, 3px calc(100% - 20px), 20px calc(100% - 3px), calc(100% - 20px) calc(100% - 3px), calc(100% - 3px) calc(100% - 20px), calc(100% - 3px) 20px, calc(100% - 20px) 3px, 20px 3px
  );
}

.energy-rays {
  z-index: 0;
  left: -9%;
  top: 54%;
  width: min(62vw, 620px);
  height: min(62vw, 620px);
  opacity: .17;
  background: repeating-conic-gradient(from 0deg, rgba(var(--tier-rgb), .75) 0 1.5deg, transparent 1.5deg 15deg);
  mask-image: radial-gradient(circle, #000, transparent 69%);
  animation: tierSpin 28s steps(180, end) infinite;
}

.card-shine {
  z-index: 10;
  left: -160px;
  width: 86px;
  opacity: .48;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.34), transparent);
  animation: tierSweep 4.8s 1s ease-in-out infinite;
}

.tier-visual {
  position: absolute;
  z-index: 1;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.tier-visual::before,
.tier-visual::after,
&.focus-tier-red .tier-visual::after {
  display: none;
}

.tier-crest {
  position: absolute;
  z-index: 4;
  left: clamp(20px, 6vw, 74px);
  top: 50%;
  width: clamp(160px, 25vw, 300px);
  height: clamp(150px, 52vh, 330px);
  transform: translateY(-50%);
  background: var(--tier-crest) center / contain no-repeat;
  filter: drop-shadow(0 0 8px rgba(var(--tier-rgb), .9)) drop-shadow(0 0 23px rgba(var(--tier-rgb), .35));
  animation: crestBreathe 2.8s steps(36,end) infinite alternate;
}

.tier-portal {
  position: absolute;
  z-index: 2;
  left: clamp(18px, 5vw, 66px);
  top: 50%;
  width: clamp(180px, 28vw, 340px);
  aspect-ratio: 1;
  border: 2px solid rgba(var(--tier-rgb), .42);
  border-radius: 50%;
  transform: translateY(-50%);
  opacity: .5;
  box-shadow: inset 0 0 28px rgba(var(--tier-rgb), .2), 0 0 28px rgba(var(--tier-rgb), .2);
}

.tier-portal::before,
.tier-portal::after {
  content: '';
  position: absolute;
  inset: 10%;
  border: 1px dashed rgba(var(--tier-rgb), .58);
  border-radius: 50%;
  animation: orbitSpin 18s steps(100,end) infinite reverse;
}

.tier-portal::after {
  inset: 23%;
  border-style: solid;
  opacity: .5;
  animation-direction: normal;
  animation-duration: 13s;
}

.tier-wing {
  position: absolute;
  z-index: 1;
  left: 18%;
  top: 50%;
  width: min(42vw, 520px);
  height: 20%;
  opacity: .55;
  transform-origin: left center;
  background: repeating-linear-gradient(171deg, rgba(var(--tier-rgb),.48) 0 3px, transparent 3px 13px);
  mask-image: linear-gradient(90deg, #000, transparent 88%);
  clip-path: polygon(0 43%, 100% 0, 84% 38%, 100% 62%, 0 60%);
}

.tier-wing.wing-left { transform: translateY(-70%) rotate(-7deg); }
.tier-wing.wing-right { transform: translateY(-28%) rotate(7deg) scaleY(-1); }

.tier-shards {
  position: absolute;
  z-index: 5;
  inset: 10% 4% 10% 22%;
  opacity: .7;
}

.tier-shards i {
  position: absolute;
  width: clamp(7px, 1vw, 14px);
  height: clamp(13px, 2.4vw, 30px);
  clip-path: polygon(50% 0,100% 45%,66% 100%,0 72%);
  background: linear-gradient(145deg,#fff,var(--tier) 36%,rgba(var(--tier-rgb),.05));
  filter: drop-shadow(0 0 5px rgba(var(--tier-rgb),.8));
  animation: shardDrift 3s ease-in-out infinite alternate;
}

.tier-shards i:nth-child(1){left:12%;top:8%;transform:rotate(20deg)}
.tier-shards i:nth-child(2){left:43%;top:3%;transform:rotate(-28deg);animation-delay:-.8s}
.tier-shards i:nth-child(3){right:8%;top:30%;transform:rotate(36deg);animation-delay:-1.5s}
.tier-shards i:nth-child(4){left:53%;bottom:6%;transform:rotate(15deg);animation-delay:-2.1s}
.tier-shards i:nth-child(5){right:22%;bottom:12%;transform:rotate(-32deg);animation-delay:-.4s}

.focus-dragon { display: none; }

.focus-header {
  z-index: 20;
  height: auto;
  padding: 0 clamp(14px,2vw,26px);
  gap: clamp(8px,1.5vw,18px);
}

.focus-kicker {
  color: var(--tier);
  text-shadow: 0 0 12px rgba(var(--tier-rgb), .6);
}

.focus-kicker i {
  background: var(--tier);
  box-shadow: 0 0 5px #fff,0 0 15px rgba(var(--tier-rgb),.9);
}

.header-line { background: linear-gradient(90deg, rgba(var(--tier-rgb),.75), transparent); }

.focus-header button {
  border-color: rgba(var(--tier-rgb),.48);
  color: #fff;
  background: rgba(var(--tier-rgb),.08);
}

.focus-main,
&.focus-tier-red .focus-main {
  z-index: 8;
  min-height: 0;
  display: grid;
  grid-template-columns: clamp(108px, 17vw, 178px) minmax(0,1fr);
  align-items: center;
  gap: clamp(22px,4vw,58px);
  padding: clamp(4px,1vh,10px) clamp(28px,5vw,72px) clamp(12px,3vh,32px) clamp(32px,6vw,84px);
}

.avatar-stage,
&.focus-tier-red .avatar-stage {
  width: clamp(104px, 16vw, 168px);
  height: clamp(104px, 16vw, 168px);
  align-self: center;
}

.avatar-stage > img,
.avatar-fallback,
&.focus-tier-red .avatar-stage > img,
&.focus-tier-red .avatar-fallback {
  width: 78%;
  height: 78%;
  border-color: var(--tier);
  box-shadow: 0 0 0 6px rgba(var(--tier-rgb),.1),0 0 30px rgba(var(--tier-rgb),.32),0 16px 35px rgba(0,0,0,.45);
}

.ring-a { border-color: rgba(var(--tier-rgb),.95); border-left-color:transparent; }
.ring-b { border-color: rgba(var(--tier-rgb),.58); }
.ring-c { box-shadow: inset 0 0 20px rgba(var(--tier-rgb),.22),0 0 22px rgba(var(--tier-rgb),.16); }

.comment-badge,
&.focus-tier-red .comment-badge {
  right: -3%;
  bottom: -4%;
  width: clamp(42px,6vw,62px);
  height: clamp(42px,6vw,62px);
  padding: 0;
  color: var(--tier);
  font-size: clamp(38px,6vw,60px);
  text-shadow: 0 2px 0 #000,0 0 6px #fff,0 0 18px rgba(var(--tier-rgb),.95);
  animation: numberPulse 1.5s steps(26,end) infinite alternate;
}

.focus-copy { position:relative;z-index:7;min-width:0;min-height:0;height:100%;justify-content:center; }
.user-line span { color:var(--tier);text-shadow:0 0 10px rgba(var(--tier-rgb),.7); }

.focus-name,
&.focus-tier-red .focus-name {
  margin-top: clamp(3px,1vh,9px);
  color: transparent;
  background: linear-gradient(100deg,#fff 2%,var(--tier) 43%,var(--tier-2) 100%);
  -webkit-background-clip:text;
  background-clip:text;
  font-size: clamp(24px,4.6vw,68px);
  line-height: 1.04;
  text-overflow: ellipsis;
  filter: drop-shadow(0 0 8px rgba(var(--tier-rgb),.52));
}

.message-panel,
&.focus-tier-red .message-panel {
  position:relative;
  min-width:0;
  min-height:0;
  flex:1;
  margin-top: clamp(8px,2vh,18px);
  padding: clamp(12px,2.4vh,24px) clamp(18px,3vw,42px);
  overflow:hidden;
  border:1px solid rgba(var(--tier-rgb),.38);
  border-left:3px solid var(--tier);
  border-radius:0 18px 18px 0;
  background:
    linear-gradient(105deg,rgba(var(--tier-rgb),.15),rgba(4,7,17,.82) 35%,rgba(3,6,14,.7)),
    rgba(4,7,13,.72);
  box-shadow:inset 0 1px rgba(255,255,255,.08),0 15px 38px rgba(0,0,0,.3),0 0 24px rgba(var(--tier-rgb),.12);
}

.message-panel::before,
&.focus-tier-red .message-panel::before { display:none; }

.message-panel p,
&.focus-tier-red .message-panel p {
  position:relative;
  z-index:2;
  width:100%;
  max-width:100%;
  overflow-wrap:anywhere;
  word-break:break-word;
  color:#fff;
  line-height:1.15;
  text-shadow:0 3px 7px rgba(0,0,0,.9),0 0 12px rgba(var(--tier-rgb),.2);
}

.message-panel > b { color:var(--tier);text-shadow:0 0 12px rgba(var(--tier-rgb),.75); }

.energy-footer { z-index:20;color:rgba(255,255,255,.5); }
.energy-footer strong { color:var(--tier); }
.energy-bars i { background:linear-gradient(90deg,var(--tier),var(--tier-2)); }

&.focus-tier-white {
  .tier-wing,.tier-shards { opacity:.18; }
  .tier-portal { opacity:.35; }
}

&.focus-tier-orange {
  .tier-crest { width:clamp(190px,30vw,360px);height:clamp(170px,58vh,360px);left:clamp(5px,3vw,38px); }
  .tier-portal { border-color:rgba(255,151,29,.34);box-shadow:inset 0 0 28px rgba(255,50,14,.25),0 0 36px rgba(255,72,16,.2); }
  .tier-wing { opacity:.78;background:repeating-linear-gradient(168deg,rgba(255,216,77,.78) 0 3px,rgba(255,67,15,.2) 3px 7px,transparent 7px 15px); }
  .tier-shards i { border-radius:70% 0 70% 0;background:linear-gradient(145deg,#fff5a3,#ff941c 40%,#e5240b); }
}

&.focus-tier-purple {
  .tier-crest { width:clamp(190px,29vw,350px);height:clamp(175px,58vh,370px);left:clamp(9px,3.5vw,44px); }
  .tier-portal { opacity:.82;border-width:3px;box-shadow:inset 0 0 42px rgba(126,55,255,.4),0 0 44px rgba(82,202,255,.25); }
  .tier-wing { opacity:.46;background:repeating-linear-gradient(170deg,rgba(178,105,255,.65) 0 2px,transparent 2px 11px); }
}

&.focus-tier-red {
  .focus-card { background:radial-gradient(ellipse at 16% 52%,rgba(255,46,38,.28),transparent 31%),radial-gradient(ellipse at 78% 4%,rgba(255,185,55,.13),transparent 42%),linear-gradient(118deg,rgba(31,2,8,.98),rgba(10,5,14,.97) 55%,rgba(75,7,17,.24)),#08030a; }
  .tier-crest { left:-3%;top:54%;width:clamp(340px,58vw,760px);height:82%;background-position:left center;background-size:contain;opacity:.8;filter:sepia(.12) saturate(1.7) drop-shadow(0 0 8px rgba(255,44,37,.95)) drop-shadow(0 0 25px rgba(255,181,55,.45)); }
  .tier-portal { left:-5%;width:clamp(280px,47vw,590px);opacity:.66;border-color:rgba(255,199,83,.52);box-shadow:inset 0 0 46px rgba(255,30,37,.35),0 0 56px rgba(255,28,42,.28); }
  .tier-wing { left:24%;width:min(55vw,720px);opacity:.58;background:repeating-linear-gradient(169deg,rgba(255,213,95,.75) 0 2px,rgba(255,39,45,.25) 2px 6px,transparent 6px 14px); }
  .tier-shards { opacity:.95; }
  .tier-shards i { background:linear-gradient(145deg,#fff4b5,#ffc148 34%,#ff283b 72%,transparent); }
  .energy-rays { opacity:.28; }
  .message-panel { border-color:rgba(255,200,91,.52);border-left-color:#ffd05f; }
}

@media (max-width:700px), (max-height:390px) {
  & { padding:8px; }
  .focus-card { grid-template-rows:46px minmax(0,1fr) 22px; }
  .focus-kicker { font-size:9px;letter-spacing:.13em; }
  .focus-main,
  &.focus-tier-red .focus-main { grid-template-columns:82px minmax(0,1fr);gap:18px;padding:0 24px 12px 28px; }
  .avatar-stage,
  &.focus-tier-red .avatar-stage { width:82px;height:82px; }
  .comment-badge,
  &.focus-tier-red .comment-badge { width:38px;height:38px;font-size:35px; }
  .focus-name,
  &.focus-tier-red .focus-name { font-size:clamp(22px,5vw,38px); }
  .message-panel,
  &.focus-tier-red .message-panel { margin-top:6px;padding:9px 18px; }
  .tier-crest { opacity:.52; }
  .energy-footer span { display:none; }
}

@keyframes tierReveal {
  from { opacity:0;transform:scale(.94); }
  to { opacity:1;transform:scale(1); }
}

@keyframes tierSpin { to { transform:translateY(-50%) rotate(360deg); } }
@keyframes crestBreathe { to { transform:translateY(-50%) scale(1.025);opacity:.88; } }

@keyframes tierSweep {
  0%,32% { opacity:0;transform:translate3d(0,0,0) rotate(17deg); }
  48% { opacity:.55; }
  72%,100% { opacity:0;transform:translate3d(calc(100vw + 270px),0,0) rotate(17deg); }
}

@keyframes orbitSpin { to { transform:rotate(360deg); } }
@keyframes shardDrift { to { translate:7px -7px;opacity:.3; } }
@keyframes numberPulse { to { transform:scale(1.06);opacity:.94; } }

@media (prefers-reduced-motion:reduce) {
  .focus-card,.energy-rays,.card-shine,.tier-crest,.tier-portal::before,.tier-portal::after,.tier-shards i,.comment-badge { animation:none !important; }
}
}
</style>

<style lang="scss" scoped>
/* Tier identity and high-emotion presentation layer. */
.tier-emblem {
  width: max-content;
  max-width: 100%;
  height: 23px;
  margin-top: 8px;
  padding: 0 11px 0 8px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  box-sizing: border-box;
  border: 1px solid rgba(var(--tier-rgb), 0.16);
  border-radius: 6px;
  color: var(--tier-accent);
  background: linear-gradient(90deg, rgba(var(--tier-rgb), 0.1), rgba(var(--tier-rgb), 0.018));
  box-shadow: inset 0 1px rgba(255, 255, 255, 0.03);

  i {
    width: 6px;
    height: 6px;
    flex: 0 0 auto;
    transform: rotate(45deg);
    background: currentColor;
    box-shadow: 0 0 9px rgba(var(--tier-rgb), 0.55);
  }

  strong {
    font: 900 11px/1 'Microsoft YaHei UI', sans-serif;
    letter-spacing: 0.12em;
  }

  span {
    color: rgba(255, 255, 255, 0.34);
    font: 800 8px/1 sans-serif;
    letter-spacing: 0.18em;
  }
}

/* 0–4: polished silver, intentionally calm. */
.focus-tier-white {
  .tier-emblem { opacity: 0.76; }
  .message-panel {
    box-shadow: inset 0 1px rgba(255, 255, 255, 0.035), 0 18px 50px rgba(0, 0, 0, 0.14);
  }
}

/* 5–9: warm gold energy begins to build. */
.focus-tier-orange {
  .focus-card {
    background:
      radial-gradient(circle at 9% 53%, rgba(255, 170, 45, 0.2), transparent 25%),
      radial-gradient(circle at 88% 8%, rgba(255, 92, 28, 0.14), transparent 34%),
      linear-gradient(135deg, rgba(30, 20, 16, 0.99), rgba(13, 14, 21, 0.995) 56%, rgba(25, 14, 19, 0.99));
    box-shadow:
      inset 0 1px rgba(255, 237, 194, 0.1),
      inset 0 0 70px rgba(255, 113, 24, 0.045),
      0 0 32px rgba(255, 131, 28, 0.12);
  }

  .focus-border {
    border-color: rgba(255, 181, 70, 0.38);
    box-shadow: inset 0 0 34px rgba(255, 128, 27, 0.035), 0 0 18px rgba(255, 137, 34, 0.16);
  }

  .energy-rays {
    opacity: 0.27;
    filter: none;
    background: repeating-conic-gradient(from 8deg, rgba(255, 192, 68, 0.64) 0 1.5deg, transparent 1.5deg 18deg);
    mask-image: radial-gradient(circle, #000 0 9%, transparent 68%);
    animation: raysSpin 24s linear infinite;
  }

  .tier-emblem {
    border-color: rgba(255, 175, 67, 0.34);
    background: linear-gradient(90deg, rgba(255, 139, 30, 0.19), rgba(255, 179, 70, 0.025));
    box-shadow: inset 0 1px rgba(255, 235, 186, 0.08), 0 0 15px rgba(255, 121, 24, 0.1);
  }

  .avatar-stage > img,
  .avatar-fallback {
    border-color: rgba(255, 193, 82, 0.82);
    box-shadow: 0 0 0 6px rgba(255, 153, 39, 0.065), 0 0 25px rgba(255, 110, 27, 0.28), 0 17px 38px rgba(0, 0, 0, 0.44);
  }

  .ring-a {
    border-color: rgba(255, 182, 65, 0.74);
    border-left-color: transparent;
    box-shadow: 0 0 13px rgba(255, 119, 24, 0.34);
    animation-duration: 6s;
  }

  .orbit-a { opacity: 0.22; }

  .message-panel {
    border-color: rgba(255, 173, 65, 0.2);
    border-left-color: rgba(255, 181, 72, 0.54);
    background:
      linear-gradient(100deg, rgba(255, 139, 36, 0.1), rgba(255, 255, 255, 0.024) 42%, transparent),
      rgba(4, 6, 11, 0.28);
    box-shadow: inset 0 1px rgba(255, 236, 190, 0.04), 0 18px 55px rgba(0, 0, 0, 0.16), 0 0 26px rgba(255, 121, 26, 0.055);
  }
}

/* 10–14: epic cosmic stage. */
.focus-tier-purple {
  .focus-card {
    background:
      radial-gradient(circle at 8% 53%, rgba(186, 87, 255, 0.24), transparent 25%),
      radial-gradient(circle at 82% 18%, rgba(63, 132, 255, 0.2), transparent 39%),
      radial-gradient(circle at 61% 106%, rgba(203, 63, 255, 0.12), transparent 42%),
      linear-gradient(135deg, rgba(24, 13, 39, 0.995), rgba(9, 14, 29, 0.995) 56%, rgba(25, 10, 40, 0.99));
    box-shadow:
      inset 0 1px rgba(244, 209, 255, 0.1),
      inset 0 0 92px rgba(139, 65, 255, 0.075),
      0 0 34px rgba(151, 70, 255, 0.18);
    animation: refinedReveal 0.3s cubic-bezier(0.2, 0.9, 0.25, 1) both, epicStagePulse 3.2s ease-in-out infinite alternate;
  }

  .focus-card::before {
    content: '';
    position: absolute;
    z-index: 0;
    inset: 0;
    pointer-events: none;
    background:
      linear-gradient(112deg, transparent 17%, rgba(219, 146, 255, 0.055) 36%, transparent 52%),
      radial-gradient(circle at 72% 48%, rgba(85, 207, 255, 0.065), transparent 23%);
    animation: epicAurora 4.8s ease-in-out infinite alternate;
  }

  .focus-border {
    border-color: rgba(203, 136, 255, 0.45);
    box-shadow: inset 0 0 34px rgba(149, 74, 255, 0.045), 0 0 16px rgba(194, 101, 255, 0.24), 0 0 34px rgba(74, 154, 255, 0.09);
  }

  .focus-border::before { border-color: #dfacff; }
  .focus-border::after { border-color: #62d9ff; }

  .energy-rays {
    opacity: 0.3;
    filter: none;
    background: repeating-conic-gradient(from 0deg, rgba(199, 105, 255, 0.65) 0 1.4deg, transparent 1.4deg 15deg);
    mask-image: radial-gradient(circle, #000 0 8%, transparent 70%);
    animation: raysSpin 20s linear infinite;
  }

  .tier-emblem {
    height: 25px;
    border-color: rgba(204, 130, 255, 0.44);
    background: linear-gradient(90deg, rgba(168, 72, 255, 0.23), rgba(64, 170, 255, 0.055));
    box-shadow: inset 0 1px rgba(245, 213, 255, 0.1), 0 0 17px rgba(173, 73, 255, 0.18);

    i { animation: epicSpark 0.9s ease-in-out infinite alternate; }
    strong { font-size: 12px; }
    span { color: rgba(112, 216, 255, 0.72); }
  }

  .avatar-stage { width: 116px; height: 116px; }
  .avatar-stage > img,
  .avatar-fallback {
    width: 94px;
    height: 94px;
    border-color: rgba(222, 160, 255, 0.9);
    box-shadow: 0 0 0 6px rgba(185, 82, 255, 0.09), 0 0 18px rgba(209, 128, 255, 0.52), 0 0 38px rgba(70, 151, 255, 0.22), 0 18px 42px rgba(0, 0, 0, 0.48);
  }

  .ring-a {
    border-color: rgba(222, 150, 255, 0.9);
    border-left-color: transparent;
    box-shadow: 0 0 16px rgba(177, 72, 255, 0.58);
    animation-duration: 4.5s;
  }

  .ring-b {
    border-color: rgba(89, 213, 255, 0.55);
    border-left-color: transparent;
    border-right-color: transparent;
    animation-duration: 7s;
  }

  .orbit-a { opacity: 0.3; }
  .orbit-b { opacity: 0.2; }

  .focus-name {
    background: linear-gradient(100deg, #fff 4%, #ecc8ff 46%, #8bdbff 100%);
    -webkit-background-clip: text;
    filter: drop-shadow(0 0 13px rgba(189, 94, 255, 0.45)) drop-shadow(0 5px 18px rgba(0, 0, 0, 0.42));
  }

  .message-panel {
    border-color: rgba(202, 128, 255, 0.25);
    border-left-color: rgba(211, 143, 255, 0.65);
    background:
      linear-gradient(102deg, rgba(163, 65, 255, 0.13), rgba(62, 106, 194, 0.06) 45%, rgba(6, 10, 19, 0.1)),
      rgba(4, 6, 13, 0.33);
    box-shadow: inset 0 1px rgba(242, 211, 255, 0.05), 0 20px 58px rgba(0, 0, 0, 0.18), 0 0 32px rgba(161, 65, 255, 0.075);
  }
}

/* 15+: legendary red-gold reveal. */
.focus-tier-red {
  .focus-card {
    background:
      radial-gradient(circle at 8% 53%, rgba(255, 188, 69, 0.28), transparent 24%),
      radial-gradient(circle at 85% 17%, rgba(255, 40, 61, 0.28), transparent 39%),
      radial-gradient(circle at 58% 110%, rgba(255, 118, 28, 0.14), transparent 44%),
      linear-gradient(135deg, rgba(48, 12, 17, 0.997), rgba(13, 10, 17, 0.998) 52%, rgba(49, 7, 18, 0.995));
    box-shadow:
      inset 0 1px rgba(255, 231, 168, 0.15),
      inset 0 0 120px rgba(255, 37, 55, 0.095),
      0 0 18px rgba(255, 220, 133, 0.26),
      0 0 48px rgba(255, 35, 55, 0.23);
    animation: legendaryReveal 0.46s cubic-bezier(0.16, 1, 0.3, 1) both, legendaryStagePulse 2.2s 0.5s ease-in-out infinite alternate;
  }

  .focus-card::before {
    content: '';
    position: absolute;
    z-index: 0;
    inset: 0;
    pointer-events: none;
    background:
      linear-gradient(112deg, transparent 8%, rgba(255, 221, 135, 0.09) 28%, transparent 43%),
      repeating-linear-gradient(118deg, transparent 0 54px, rgba(255, 204, 112, 0.025) 55px 56px, transparent 57px 108px);
    animation: legendaryAurora 3.6s ease-in-out infinite alternate;
  }

  .focus-card::after {
    content: '';
    position: absolute;
    z-index: 7;
    left: 8%;
    right: 8%;
    bottom: 7px;
    height: 2px;
    pointer-events: none;
    background: linear-gradient(90deg, transparent, #ff4a56, #ffe091, #ff6b39, transparent);
    filter: drop-shadow(0 0 6px rgba(255, 69, 73, 0.85));
    animation: legendaryBottomLine 1.7s ease-in-out infinite alternate;
  }

  .focus-border {
    inset: 5px;
    border: 2px solid rgba(255, 211, 113, 0.58);
    border-radius: 19px;
    box-shadow:
      inset 0 0 42px rgba(255, 45, 58, 0.075),
      0 0 10px rgba(255, 236, 175, 0.46),
      0 0 28px rgba(255, 35, 55, 0.35);
    animation: legendaryBorderPulse 1.55s ease-in-out infinite alternate;
  }

  .focus-border::before,
  .focus-border::after {
    width: 92px;
    height: 92px;
    border-width: 3px;
    border-color: #ffe296;
    filter: drop-shadow(0 0 7px rgba(255, 238, 176, 0.82)) drop-shadow(0 0 15px rgba(255, 41, 56, 0.52));
  }

  .energy-rays {
    left: -120px;
    width: 460px;
    height: 460px;
    opacity: 0.38;
    filter: none;
    background: repeating-conic-gradient(from 0deg, rgba(255, 215, 103, 0.85) 0 2deg, transparent 2deg 13deg);
    mask-image: radial-gradient(circle, #000 0 11%, transparent 71%);
    animation: raysSpin 14s linear infinite;
  }

  .card-shine {
    top: -45%;
    bottom: -45%;
    left: -190px;
    width: 120px;
    height: auto;
    opacity: 0;
    transform: rotate(17deg);
    background: linear-gradient(90deg, transparent, rgba(255, 246, 207, 0.72), rgba(255, 77, 61, 0.25), transparent);
    animation: legendarySweep 2.8s 0.7s ease-in-out infinite;
  }

  .tier-emblem {
    height: 29px;
    margin-top: 9px;
    padding-inline: 11px 14px;
    border-color: rgba(255, 211, 114, 0.6);
    color: #ffe19a;
    background: linear-gradient(90deg, rgba(181, 30, 43, 0.48), rgba(255, 108, 38, 0.18) 54%, rgba(255, 205, 99, 0.055));
    box-shadow: inset 0 1px rgba(255, 239, 190, 0.17), 0 0 11px rgba(255, 220, 132, 0.24), 0 0 23px rgba(255, 42, 53, 0.22);
    animation: legendaryEmblemPulse 1.3s ease-in-out infinite alternate;

    i {
      width: 8px;
      height: 8px;
      background: #ffe6a8;
      box-shadow: 0 0 7px #fff, 0 0 17px #ff3747;
      animation: legendarySpark 0.68s ease-in-out infinite alternate;
    }

    strong {
      font-size: 13px;
      letter-spacing: 0.16em;
      text-shadow: 0 0 10px rgba(255, 43, 54, 0.62);
    }

    span {
      color: #ff8a72;
      font-size: 9px;
      text-shadow: 0 0 9px rgba(255, 40, 55, 0.65);
    }
  }

  .focus-main {
    grid-template-columns: 132px minmax(0, 1fr);
    gap: 34px;
    padding-left: 44px;
  }

  .avatar-stage {
    width: 126px;
    height: 126px;
  }

  .avatar-stage > img,
  .avatar-fallback {
    width: 99px;
    height: 99px;
    border: 2px solid #ffe097;
    background:
      radial-gradient(circle at 35% 28%, rgba(255, 248, 205, 0.18), transparent 27%),
      linear-gradient(145deg, rgba(136, 24, 36, 0.9), rgba(20, 11, 17, 0.96));
    box-shadow:
      0 0 0 6px rgba(255, 193, 73, 0.09),
      0 0 11px rgba(255, 246, 202, 0.72),
      0 0 28px rgba(255, 46, 57, 0.72),
      0 0 48px rgba(255, 113, 33, 0.3),
      0 20px 46px rgba(0, 0, 0, 0.52);
  }

  .ring-a {
    inset: 1px;
    border: 2px solid #ffdb7f;
    border-left-color: transparent;
    box-shadow: 0 0 10px #fff0ba, 0 0 24px rgba(255, 44, 57, 0.78);
    animation: ringSpin 3.2s linear infinite;
  }

  .ring-b {
    inset: -7px;
    border: 1px dashed rgba(255, 93, 66, 0.82);
    animation: ringSpinReverse 5.2s linear infinite;
  }

  .ring-c {
    display: block;
    inset: -15px;
    border: 1px solid rgba(255, 221, 132, 0.24);
    box-shadow: 0 0 26px rgba(255, 40, 57, 0.36), inset 0 0 18px rgba(255, 196, 76, 0.1);
    animation: legendaryRingPulse 1.2s ease-in-out infinite alternate;
  }

  .comment-badge {
    right: -5px;
    bottom: -10px;
    width: 52px;
    height: 52px;
    font-size: 47px;
    color: #ffe39d;
    text-shadow: 0 2px 0 rgba(69, 3, 10, 0.92), 0 0 6px #fff2c4, 0 0 18px #ff394c, 0 0 32px rgba(255, 72, 32, 0.78);
    animation: legendaryNumberPulse 0.95s ease-in-out infinite alternate;
  }

  .focus-name {
    background: linear-gradient(100deg, #fff9df 4%, #ffd872 45%, #ff6a55 100%);
    -webkit-background-clip: text;
    filter: drop-shadow(0 0 7px rgba(255, 245, 196, 0.52)) drop-shadow(0 0 17px rgba(255, 45, 54, 0.62)) drop-shadow(0 5px 20px rgba(0, 0, 0, 0.48));
  }

  .message-panel {
    border: 1px solid rgba(255, 201, 102, 0.28);
    border-left: 2px solid rgba(255, 215, 122, 0.72);
    background:
      linear-gradient(102deg, rgba(159, 26, 39, 0.18), rgba(76, 18, 26, 0.085) 48%, rgba(7, 7, 12, 0.18)),
      rgba(4, 5, 9, 0.38);
    box-shadow:
      inset 0 1px rgba(255, 232, 170, 0.06),
      0 20px 62px rgba(0, 0, 0, 0.22),
      0 0 22px rgba(255, 218, 126, 0.09),
      0 0 44px rgba(255, 38, 52, 0.08);
  }

  .message-panel::before {
    inset: 2% 0 0 20%;
    opacity: 0.15;
    filter: saturate(0.92) contrast(1.04);
    mask-image: linear-gradient(90deg, transparent, #000 17%, #000 100%);
  }

  .message-panel p {
    color: #fffaf0;
    text-shadow: 0 4px 22px rgba(0, 0, 0, 0.5), 0 0 13px rgba(255, 217, 129, 0.12), 0 0 25px rgba(255, 55, 64, 0.075);
  }

  .tier-visual::after {
    inset: 5% -2% 3% 27%;
    opacity: 0.15;
    filter: saturate(0.94) contrast(1.05) drop-shadow(0 0 16px rgba(255, 44, 53, 0.2));
    animation: legendaryDragonFloat 4.4s ease-in-out infinite alternate;
  }

  .energy-particles { opacity: 0.78; }
  .energy-particles i {
    width: 3px;
    height: 3px;
    background: #ffe096;
    box-shadow: 0 0 7px #fff2c7, 0 0 17px #ff3c4c;
    animation-duration: calc(1.8s + var(--i) * 0.07s);
  }
}

.energy-particles i:nth-child(13) { left: 76%; top: 14%; }
.energy-particles i:nth-child(14) { left: 84%; top: 29%; }
.energy-particles i:nth-child(15) { left: 71%; top: 72%; }
.energy-particles i:nth-child(16) { left: 91%; top: 62%; }
.energy-particles i:nth-child(17) { left: 61%; top: 89%; }
.energy-particles i:nth-child(18) { left: 95%; top: 85%; }

@keyframes epicStagePulse {
  to { box-shadow: inset 0 1px rgba(244, 209, 255, 0.13), inset 0 0 112px rgba(139, 65, 255, 0.11), 0 0 43px rgba(151, 70, 255, 0.27); }
}

@keyframes epicAurora {
  from { opacity: 0.5; transform: translateX(-2%); }
  to { opacity: 1; transform: translateX(3%); }
}

@keyframes epicSpark {
  to { transform: rotate(225deg) scale(1.45); filter: brightness(1.5); }
}

@keyframes legendaryReveal {
  0% { opacity: 0; transform: scale(0.86); filter: brightness(2.2) blur(5px); }
  58% { opacity: 1; transform: scale(1.018); filter: brightness(1.28) blur(0); }
  100% { transform: scale(1); filter: brightness(1); }
}

@keyframes legendaryStagePulse {
  to { box-shadow: inset 0 1px rgba(255, 238, 188, 0.2), inset 0 0 140px rgba(255, 38, 56, 0.14), 0 0 24px rgba(255, 226, 146, 0.4), 0 0 60px rgba(255, 29, 50, 0.34); }
}

@keyframes legendaryAurora {
  from { opacity: 0.44; transform: translateX(-2.5%); }
  to { opacity: 0.95; transform: translateX(3.5%); }
}

@keyframes legendaryBorderPulse {
  to { border-color: rgba(255, 230, 158, 0.88); box-shadow: inset 0 0 50px rgba(255, 45, 58, 0.11), 0 0 13px rgba(255, 244, 207, 0.7), 0 0 38px rgba(255, 33, 52, 0.48); }
}

@keyframes legendaryBottomLine {
  from { opacity: 0.4; transform: scaleX(0.82); }
  to { opacity: 1; transform: scaleX(1); }
}

@keyframes legendarySweep {
  0%, 22% { left: -190px; opacity: 0; }
  42% { opacity: 0.9; }
  68%, 100% { left: calc(100% + 150px); opacity: 0; }
}

@keyframes legendaryEmblemPulse {
  to { filter: brightness(1.22); box-shadow: inset 0 1px rgba(255, 244, 211, 0.24), 0 0 16px rgba(255, 231, 157, 0.42), 0 0 31px rgba(255, 39, 52, 0.33); }
}

@keyframes legendarySpark {
  to { transform: rotate(225deg) scale(1.52); opacity: 0.72; }
}

@keyframes legendaryRingPulse {
  to { transform: scale(1.045); opacity: 0.68; box-shadow: 0 0 34px rgba(255, 36, 55, 0.58), inset 0 0 22px rgba(255, 208, 106, 0.15); }
}

@keyframes legendaryNumberPulse {
  to { transform: scale(1.08) translateY(-1px); filter: brightness(1.18); }
}

@keyframes legendaryDragonFloat {
  from { transform: translate3d(10px, 2px, 0) scale(0.99); opacity: 0.12; }
  to { transform: translate3d(-9px, -3px, 0) scale(1.025); opacity: 0.21; }
}

@media (max-width: 700px) {
  .focus-tier-red .focus-main { grid-template-columns: 94px minmax(0, 1fr); gap: 23px; padding-left: 30px; }
  .focus-tier-red .avatar-stage { width: 90px; height: 90px; }
  .focus-tier-red .avatar-stage > img,
  .focus-tier-red .avatar-fallback { width: 72px; height: 72px; }
  .focus-tier-red .comment-badge { width: 42px; height: 42px; font-size: 38px; }
}
</style>

<style lang="scss" scoped>
/*
 * Refined highlight skin.
 * Keep the same structure and behaviour, but move the visual hierarchy back
 * to the comment itself. Tier differences are expressed through materials and
 * restrained motion instead of full-screen colour washes.
 */
.focus-tier-white {
  --tier-accent: #eef7ff;
  --tier-accent-2: #78aee9;
  --tier-rgb: 190, 222, 255;
  --tier-deep-rgb: 57, 91, 132;
}

.focus-tier-orange {
  --tier-accent: #fff0a8;
  --tier-accent-2: #e8c867;
  --tier-rgb: 255, 229, 135;
  --tier-deep-rgb: 93, 78, 24;
}

.focus-tier-purple {
  --tier-accent: #e0b3ff;
  --tier-accent-2: #66d9ff;
  --tier-rgb: 194, 112, 255;
  --tier-deep-rgb: 74, 47, 151;
}

.focus-tier-red {
  --tier-accent: #ffe09a;
  --tier-accent-2: #ff5968;
  --tier-rgb: 255, 190, 85;
  --tier-deep-rgb: 153, 30, 48;
}

.focus-card,
.focus-tier-white .focus-card,
.focus-tier-orange .focus-card,
.focus-tier-purple .focus-card,
.focus-tier-red .focus-card {
  grid-template-rows: 62px minmax(0, 1fr) 30px;
  clip-path: none;
  border-radius: 24px;
  background:
    radial-gradient(circle at 8% 50%, rgba(var(--tier-rgb), 0.085), transparent 26%),
    radial-gradient(circle at 88% 10%, rgba(var(--tier-deep-rgb), 0.14), transparent 34%),
    linear-gradient(135deg, rgba(14, 18, 27, 0.985), rgba(9, 13, 22, 0.992) 56%, rgba(15, 15, 23, 0.99));
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.07),
    inset 0 0 0 1px rgba(var(--tier-rgb), 0.12),
    inset 0 -42px 80px rgba(0, 0, 0, 0.18);
  animation: refinedReveal 0.3s cubic-bezier(0.2, 0.9, 0.25, 1) both;
  filter: none;
}

.focus-border,
.focus-tier-white .focus-border,
.focus-tier-orange .focus-border,
.focus-tier-purple .focus-border,
.focus-tier-red .focus-border {
  inset: 7px;
  border: 1px solid rgba(var(--tier-rgb), 0.2);
  border-radius: 18px;
  background: transparent;
  clip-path: none;
  filter: none;
  box-shadow:
    inset 0 0 24px rgba(var(--tier-rgb), 0.025),
    0 0 18px rgba(var(--tier-rgb), 0.035);
}

.focus-border::before,
.focus-border::after {
  content: '';
  position: absolute;
  width: 54px;
  height: 54px;
  pointer-events: none;
}

.focus-border::before {
  left: -1px;
  top: -1px;
  border-left: 2px solid var(--tier-accent);
  border-top: 2px solid var(--tier-accent);
  border-radius: 17px 0 0;
  filter: drop-shadow(0 0 5px rgba(var(--tier-rgb), 0.38));
}

.focus-border::after {
  right: -1px;
  bottom: -1px;
  border-right: 2px solid var(--tier-accent-2);
  border-bottom: 2px solid var(--tier-accent-2);
  border-radius: 0 0 17px;
  filter: drop-shadow(0 0 5px rgba(var(--tier-rgb), 0.3));
}

.energy-rays,
.focus-tier-white .energy-rays,
.focus-tier-orange .energy-rays,
.focus-tier-purple .energy-rays,
.focus-tier-red .energy-rays {
  left: -110px;
  top: 54%;
  width: 400px;
  height: 400px;
  opacity: 0.42;
  background: radial-gradient(circle, rgba(var(--tier-rgb), 0.16), rgba(var(--tier-rgb), 0.04) 35%, transparent 67%);
  mask-image: none;
  filter: blur(8px);
  animation: ambientBreathe 4.8s ease-in-out infinite alternate;
}

.card-shine,
.focus-tier-white .card-shine,
.focus-tier-orange .card-shine,
.focus-tier-purple .card-shine,
.focus-tier-red .card-shine {
  top: 0;
  bottom: auto;
  left: 20%;
  width: 42%;
  height: 1px;
  opacity: 0.8;
  transform: none;
  background: linear-gradient(90deg, transparent, var(--tier-accent), transparent);
  animation: topLineDrift 3.8s ease-in-out infinite alternate;
}

.focus-header {
  height: 62px;
  padding: 0 25px 0 30px;
  gap: 18px;
}

.focus-kicker,
.focus-tier-white .focus-kicker,
.focus-tier-orange .focus-kicker,
.focus-tier-purple .focus-kicker,
.focus-tier-red .focus-kicker {
  color: rgba(255, 255, 255, 0.74);
  font-size: 10px;
  letter-spacing: 0.25em;
  text-shadow: none;

  i {
    width: 6px;
    height: 6px;
    background: var(--tier-accent);
    box-shadow: 0 0 10px rgba(var(--tier-rgb), 0.74);
  }
}

.header-line,
.focus-tier-purple .header-line,
.focus-tier-red .header-line {
  opacity: 0.7;
  background: linear-gradient(90deg, rgba(var(--tier-rgb), 0.28), rgba(255, 255, 255, 0.035), transparent);
}

.focus-header button {
  width: 34px;
  height: 34px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  clip-path: none;
  color: rgba(255, 255, 255, 0.72);
  background: rgba(255, 255, 255, 0.035);
  font-size: 23px;
  backdrop-filter: blur(10px);

  &:hover {
    color: #fff;
    border-color: rgba(var(--tier-rgb), 0.55);
    background: rgba(var(--tier-rgb), 0.1);
  }
}

.record-button.recorded {
  color: var(--tier-accent);
  border-color: rgba(var(--tier-rgb), 0.42);
  background: rgba(var(--tier-rgb), 0.09);
}

.record-feedback {
  color: var(--tier-accent);
  text-shadow: 0 0 12px rgba(var(--tier-rgb), 0.3);
}

.focus-main {
  grid-template-columns: 112px minmax(0, 1fr);
  gap: 30px;
  padding: 8px 54px 26px 48px;
}

.avatar-stage {
  width: 108px;
  height: 108px;
}

.avatar-stage > img,
.avatar-fallback,
.focus-tier-white .avatar-stage > img,
.focus-tier-white .avatar-fallback,
.focus-tier-orange .avatar-stage > img,
.focus-tier-orange .avatar-fallback,
.focus-tier-purple .avatar-stage > img,
.focus-tier-purple .avatar-fallback,
.focus-tier-red .avatar-stage > img,
.focus-tier-red .avatar-fallback {
  width: 88px;
  height: 88px;
  border: 1px solid rgba(var(--tier-rgb), 0.7);
  color: rgba(255, 255, 255, 0.88);
  background:
    radial-gradient(circle at 36% 28%, rgba(255, 255, 255, 0.13), transparent 28%),
    linear-gradient(145deg, rgba(var(--tier-rgb), 0.22), rgba(13, 18, 27, 0.92));
  box-shadow:
    0 0 0 6px rgba(var(--tier-rgb), 0.045),
    0 16px 38px rgba(0, 0, 0, 0.42),
    0 0 24px rgba(var(--tier-rgb), 0.12);
  font-size: 31px;
}

.ring-a,
.focus-tier-white .ring-a,
.focus-tier-orange .ring-a,
.focus-tier-purple .ring-a,
.focus-tier-red .ring-a {
  inset: 2px;
  border: 1px solid rgba(var(--tier-rgb), 0.36);
  border-left-color: transparent;
  box-shadow: none;
  animation-duration: 9s;
}

.ring-b,
.focus-tier-purple .ring-b,
.focus-tier-red .ring-b {
  inset: -4px;
  border: 1px solid rgba(var(--tier-rgb), 0.13);
  border-left-color: transparent;
  border-right-color: transparent;
  animation-duration: 13s;
}

.ring-c { display: none; }

.comment-badge {
  right: -4px;
  bottom: -7px;
  width: 42px;
  height: 42px;
  font-size: 37px;
  color: var(--tier-accent);
  text-shadow: 0 2px 0 rgba(0, 0, 0, 0.8), 0 0 13px rgba(var(--tier-rgb), 0.46);
}

.comment-badge.badge-orange,
.comment-badge.badge-purple,
.comment-badge.badge-red {
  color: var(--tier-accent);
  text-shadow: 0 2px 0 rgba(0, 0, 0, 0.82), 0 0 13px rgba(var(--tier-rgb), 0.56);
}

.focus-copy { justify-content: center; }

.user-line {
  gap: 12px;

  span,
  .focus-tier-white & span,
  .focus-tier-orange & span,
  .focus-tier-purple & span,
  .focus-tier-red & span {
    color: var(--tier-accent);
    font-size: 10px;
    letter-spacing: 0.2em;
    text-shadow: none;
  }

  time {
    color: rgba(255, 255, 255, 0.32);
    font-size: 9px;
  }
}

.focus-name,
.focus-tier-white .focus-name,
.focus-tier-orange .focus-name,
.focus-tier-purple .focus-name,
.focus-tier-red .focus-name {
  margin-top: 8px;
  font-size: clamp(23px, 3vw, 32px);
  font-style: normal;
  letter-spacing: 0.02em;
  background: linear-gradient(100deg, #fff 12%, var(--tier-accent) 82%);
  -webkit-background-clip: text;
  filter: drop-shadow(0 5px 16px rgba(0, 0, 0, 0.38));
}

.message-panel,
.focus-tier-white .message-panel,
.focus-tier-orange .message-panel,
.focus-tier-purple .message-panel,
.focus-tier-red .message-panel {
  margin-top: 14px;
  padding: 22px 35px 24px;
  display: flex;
  align-items: center;
  border: 1px solid rgba(var(--tier-rgb), 0.11);
  border-left: 1px solid rgba(var(--tier-rgb), 0.24);
  border-radius: 18px;
  background:
    linear-gradient(100deg, rgba(var(--tier-rgb), 0.075), rgba(255, 255, 255, 0.026) 38%, rgba(255, 255, 255, 0.012)),
    rgba(2, 7, 14, 0.23);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.025), 0 18px 50px rgba(0, 0, 0, 0.12);
  backdrop-filter: blur(12px);

  p {
    width: 100%;
    color: #f7f7f2;
    line-height: 1.28;
    letter-spacing: -0.025em;
    text-shadow: 0 4px 22px rgba(0, 0, 0, 0.42);
  }

  b {
    color: rgba(var(--tier-rgb), 0.34);
    font-size: 38px;
    text-shadow: none;
  }

  b:first-child { left: 12px; top: 8px; }
  b:last-child { right: 12px; bottom: -4px; }
}

.message-panel p,
.message-panel b {
  position: relative;
  z-index: 2;
}

.focus-tier-red .message-panel::before {
  content: '';
  position: absolute;
  z-index: 1;
  inset: 5% 1.5% 3% 26%;
  pointer-events: none;
  background: url('../assets/highlight/dragon-filigree-optimized.png') center right / contain no-repeat;
  opacity: 0.085;
  filter: saturate(0.72) sepia(0.12);
  mask-image: linear-gradient(90deg, transparent, #000 22%, #000 100%);
  animation: engravedDragonFloat 6.5s ease-in-out infinite alternate;
}

.energy-footer {
  margin: 0 27px 12px;
  gap: 12px;
  color: rgba(255, 255, 255, 0.22);
}

.energy-footer strong { color: rgba(var(--tier-rgb), 0.55); }

.energy-bars i,
.focus-tier-red .energy-bars i {
  height: 1px;
  transform: none;
  background: linear-gradient(90deg, rgba(var(--tier-rgb), 0.11), rgba(var(--tier-rgb), 0.42));
  animation-duration: 1.6s;
}

.energy-particles { opacity: 0.16; }
.focus-tier-orange .energy-particles { opacity: 0.25; }
.focus-tier-purple .energy-particles { opacity: 0.36; }
.focus-tier-red .energy-particles { opacity: 0.46; }

.energy-particles i,
.focus-tier-white .energy-particles i,
.focus-tier-orange .energy-particles i,
.focus-tier-purple .energy-particles i,
.focus-tier-red .energy-particles i {
  width: 2px;
  height: 2px;
  background: var(--tier-accent);
  box-shadow: 0 0 8px rgba(var(--tier-rgb), 0.8);
}

.tier-orbit { opacity: 0; }

.focus-tier-orange .orbit-a {
  left: -62px;
  top: 50%;
  width: 280px;
  height: 280px;
  opacity: 0.13;
  margin: -140px 0 0;
  background: conic-gradient(from 30deg, transparent, var(--tier-accent), transparent 36%, var(--tier-accent-2), transparent 70%);
  -webkit-mask: radial-gradient(circle, transparent 0 61%, #000 62% 63%, transparent 64%);
  animation: refinedOrbit 20s linear infinite;
}

.focus-tier-purple .orbit-a,
.focus-tier-purple .orbit-b {
  left: 78%;
  top: 51%;
  opacity: 0.14;
  background: conic-gradient(from 0deg, var(--tier-accent), transparent 22%, var(--tier-accent-2), transparent 58%, var(--tier-accent));
  -webkit-mask: radial-gradient(circle, transparent 0 62%, #000 63% 64%, transparent 65% 72%, #000 73% 74%, transparent 75%);
}

.focus-tier-purple .orbit-a {
  width: 570px;
  height: 570px;
  margin: -285px;
  animation: refinedOrbit 22s linear infinite;
}

.focus-tier-purple .orbit-b {
  width: 430px;
  height: 430px;
  margin: -215px;
  opacity: 0.09;
  animation: refinedOrbitReverse 16s linear infinite;
}

.focus-dragon,
.focus-tier-red .focus-dragon {
  right: 2.5%;
  top: 51%;
  width: min(54%, 640px);
  height: 68%;
  opacity: 0;
  filter: none;
  animation: none;
}

.focus-tier-red .focus-dragon {
  opacity: 0.12;
  animation: refinedDragonFloat 5.5s ease-in-out infinite alternate;

  .dragon-glow { stroke: rgba(255, 77, 78, 0.24); stroke-width: 10; filter: blur(12px); }
  .dragon-body,
  .dragon-head { stroke: #ffd987; stroke-width: 3.2; }
  .dragon-body { stroke-dasharray: 80 20; }
  .dragon-head { fill: rgba(255, 205, 112, 0.025); }
  .dragon-scales,
  .dragon-claws,
  .dragon-horns,
  .dragon-whiskers { stroke: rgba(255, 214, 136, 0.72); stroke-width: 2.2; }
  .dragon-cloud { stroke: rgba(255, 93, 91, 0.28); stroke-width: 1.6; }
}

/* The generated engraving replaces the old diagram-like SVG on the top tier. */
.focus-dragon { display: none; }

.tier-visual::after {
  content: '';
  position: absolute;
  inset: 11% 1.5% 8% 34%;
  opacity: 0;
  background: url('../assets/highlight/dragon-filigree-optimized.png') center right / contain no-repeat;
  filter: saturate(0.78) contrast(0.98);
  transform: translate3d(8px, 0, 0);
}

.focus-tier-red .tier-visual::after {
  opacity: 0.035;
  animation: engravedDragonFloat 6.5s ease-in-out infinite alternate;
}

@keyframes refinedReveal {
  from { opacity: 0; transform: translateY(8px) scale(0.985); filter: blur(3px); }
  to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
}

@keyframes ambientBreathe {
  from { transform: translateY(-50%) scale(0.92); opacity: 0.26; }
  to { transform: translateY(-50%) scale(1.08); opacity: 0.48; }
}

@keyframes topLineDrift {
  from { transform: translateX(-18%); opacity: 0.35; }
  to { transform: translateX(75%); opacity: 0.8; }
}

@keyframes refinedOrbit { to { transform: rotate(360deg); } }
@keyframes refinedOrbitReverse { to { transform: rotate(-360deg); } }

@keyframes refinedDragonFloat {
  from { transform: translate3d(6px, -51%, 0); opacity: 0.09; }
  to { transform: translate3d(-7px, -49%, 0); opacity: 0.15; }
}

@keyframes engravedDragonFloat {
  from { transform: translate3d(9px, 2px, 0); opacity: 0.085; }
  to { transform: translate3d(-7px, -3px, 0); opacity: 0.125; }
}

@media (max-width: 700px) {
  .focus-main {
    grid-template-columns: 86px minmax(0, 1fr);
    gap: 21px;
    padding: 5px 34px 22px 32px;
  }

  .avatar-stage { width: 82px; height: 82px; }
  .avatar-stage > img,
  .avatar-fallback { width: 68px; height: 68px; font-size: 25px; }
  .comment-badge { right: -8px; bottom: -11px; font-size: 31px; }
  .message-panel { padding-inline: 27px; }
}
</style>

<style lang="scss" scoped>
/* Final tier overrides live after the shared skin so rarity always wins. */
.focus-window.focus-tier-orange {
  .focus-card {
    background:
      radial-gradient(circle at 9% 53%, rgba(255, 170, 45, 0.2), transparent 25%),
      radial-gradient(circle at 88% 8%, rgba(255, 92, 28, 0.14), transparent 34%),
      linear-gradient(135deg, rgba(30, 20, 16, 0.99), rgba(13, 14, 21, 0.995) 56%, rgba(25, 14, 19, 0.99));
    box-shadow: inset 0 1px rgba(255, 237, 194, 0.1), inset 0 0 70px rgba(255, 113, 24, 0.045), 0 0 32px rgba(255, 131, 28, 0.12);
  }

  .focus-border {
    border-color: rgba(255, 181, 70, 0.38);
    box-shadow: inset 0 0 34px rgba(255, 128, 27, 0.035), 0 0 18px rgba(255, 137, 34, 0.16);
  }

  .energy-rays {
    opacity: 0.27;
    filter: none;
    background: repeating-conic-gradient(from 8deg, rgba(255, 192, 68, 0.64) 0 1.5deg, transparent 1.5deg 18deg);
    mask-image: radial-gradient(circle, #000 0 9%, transparent 68%);
    animation: raysSpin 24s linear infinite;
  }

  .avatar-stage > img,
  .avatar-fallback {
    border-color: rgba(255, 193, 82, 0.82);
    box-shadow: 0 0 0 6px rgba(255, 153, 39, 0.065), 0 0 25px rgba(255, 110, 27, 0.28), 0 17px 38px rgba(0, 0, 0, 0.44);
  }

  .ring-a {
    border-color: rgba(255, 182, 65, 0.74);
    border-left-color: transparent;
    box-shadow: 0 0 13px rgba(255, 119, 24, 0.34);
    animation-duration: 6s;
  }

  .orbit-a { opacity: 0.22; }

  .message-panel {
    border-color: rgba(255, 173, 65, 0.2);
    border-left-color: rgba(255, 181, 72, 0.54);
    background: linear-gradient(100deg, rgba(255, 139, 36, 0.1), rgba(255, 255, 255, 0.024) 42%, transparent), rgba(4, 6, 11, 0.28);
    box-shadow: inset 0 1px rgba(255, 236, 190, 0.04), 0 18px 55px rgba(0, 0, 0, 0.16), 0 0 26px rgba(255, 121, 26, 0.055);
  }
}

.focus-window.focus-tier-purple {
  .focus-card {
    background:
      radial-gradient(circle at 8% 53%, rgba(186, 87, 255, 0.24), transparent 25%),
      radial-gradient(circle at 82% 18%, rgba(63, 132, 255, 0.2), transparent 39%),
      radial-gradient(circle at 61% 106%, rgba(203, 63, 255, 0.12), transparent 42%),
      linear-gradient(135deg, rgba(24, 13, 39, 0.995), rgba(9, 14, 29, 0.995) 56%, rgba(25, 10, 40, 0.99));
    box-shadow: inset 0 1px rgba(244, 209, 255, 0.1), inset 0 0 92px rgba(139, 65, 255, 0.075), 0 0 34px rgba(151, 70, 255, 0.18);
    animation: refinedReveal 0.3s cubic-bezier(0.2, 0.9, 0.25, 1) both, epicStagePulse 3.2s ease-in-out infinite alternate;
  }

  .focus-border {
    border-color: rgba(203, 136, 255, 0.45);
    box-shadow: inset 0 0 34px rgba(149, 74, 255, 0.045), 0 0 16px rgba(194, 101, 255, 0.24), 0 0 34px rgba(74, 154, 255, 0.09);
  }

  .focus-border::before { border-color: #dfacff; }
  .focus-border::after { border-color: #62d9ff; }

  .energy-rays {
    opacity: 0.3;
    filter: none;
    background: repeating-conic-gradient(from 0deg, rgba(199, 105, 255, 0.65) 0 1.4deg, transparent 1.4deg 15deg);
    mask-image: radial-gradient(circle, #000 0 8%, transparent 70%);
    animation: raysSpin 20s linear infinite;
  }

  .avatar-stage { width: 116px; height: 116px; }
  .avatar-stage > img,
  .avatar-fallback {
    width: 94px;
    height: 94px;
    border-color: rgba(222, 160, 255, 0.9);
    box-shadow: 0 0 0 6px rgba(185, 82, 255, 0.09), 0 0 18px rgba(209, 128, 255, 0.52), 0 0 38px rgba(70, 151, 255, 0.22), 0 18px 42px rgba(0, 0, 0, 0.48);
  }

  .ring-a {
    border-color: rgba(222, 150, 255, 0.9);
    border-left-color: transparent;
    box-shadow: 0 0 16px rgba(177, 72, 255, 0.58);
    animation-duration: 4.5s;
  }

  .ring-b {
    border-color: rgba(89, 213, 255, 0.55);
    border-left-color: transparent;
    border-right-color: transparent;
    animation-duration: 7s;
  }

  .orbit-a { opacity: 0.3; }
  .orbit-b { opacity: 0.2; }

  .focus-name {
    background: linear-gradient(100deg, #fff 4%, #ecc8ff 46%, #8bdbff 100%);
    -webkit-background-clip: text;
    filter: drop-shadow(0 0 13px rgba(189, 94, 255, 0.45)) drop-shadow(0 5px 18px rgba(0, 0, 0, 0.42));
  }

  .message-panel {
    border-color: rgba(202, 128, 255, 0.25);
    border-left-color: rgba(211, 143, 255, 0.65);
    background: linear-gradient(102deg, rgba(163, 65, 255, 0.13), rgba(62, 106, 194, 0.06) 45%, rgba(6, 10, 19, 0.1)), rgba(4, 6, 13, 0.33);
    box-shadow: inset 0 1px rgba(242, 211, 255, 0.05), 0 20px 58px rgba(0, 0, 0, 0.18), 0 0 32px rgba(161, 65, 255, 0.075);
  }
}

.focus-window.focus-tier-red {
  .focus-card {
    background:
      radial-gradient(circle at 8% 53%, rgba(255, 188, 69, 0.28), transparent 24%),
      radial-gradient(circle at 85% 17%, rgba(255, 40, 61, 0.28), transparent 39%),
      radial-gradient(circle at 58% 110%, rgba(255, 118, 28, 0.14), transparent 44%),
      linear-gradient(135deg, rgba(48, 12, 17, 0.997), rgba(13, 10, 17, 0.998) 52%, rgba(49, 7, 18, 0.995));
    box-shadow: inset 0 1px rgba(255, 231, 168, 0.15), inset 0 0 120px rgba(255, 37, 55, 0.095), 0 0 18px rgba(255, 220, 133, 0.26), 0 0 48px rgba(255, 35, 55, 0.23);
    animation: legendaryReveal 0.46s cubic-bezier(0.16, 1, 0.3, 1) both, legendaryStagePulse 2.2s 0.5s ease-in-out infinite alternate;
  }

  .focus-border {
    inset: 5px;
    border: 2px solid rgba(255, 211, 113, 0.58);
    border-radius: 19px;
    box-shadow: inset 0 0 42px rgba(255, 45, 58, 0.075), 0 0 10px rgba(255, 236, 175, 0.46), 0 0 28px rgba(255, 35, 55, 0.35);
    animation: legendaryBorderPulse 1.55s ease-in-out infinite alternate;
  }

  .focus-border::before,
  .focus-border::after {
    width: 92px;
    height: 92px;
    border-width: 3px;
    border-color: #ffe296;
    filter: drop-shadow(0 0 7px rgba(255, 238, 176, 0.82)) drop-shadow(0 0 15px rgba(255, 41, 56, 0.52));
  }

  .energy-rays {
    left: -120px;
    width: 460px;
    height: 460px;
    opacity: 0.38;
    filter: none;
    background: repeating-conic-gradient(from 0deg, rgba(255, 215, 103, 0.85) 0 2deg, transparent 2deg 13deg);
    mask-image: radial-gradient(circle, #000 0 11%, transparent 71%);
    animation: raysSpin 14s linear infinite;
  }

  .card-shine {
    top: -45%;
    bottom: -45%;
    left: -190px;
    width: 120px;
    height: auto;
    opacity: 0;
    transform: rotate(17deg);
    background: linear-gradient(90deg, transparent, rgba(255, 246, 207, 0.72), rgba(255, 77, 61, 0.25), transparent);
    animation: legendarySweep 2.8s 0.7s ease-in-out infinite;
  }

  .avatar-stage { width: 126px; height: 126px; }
  .avatar-stage > img,
  .avatar-fallback {
    width: 99px;
    height: 99px;
    border: 2px solid #ffe097;
    background: radial-gradient(circle at 35% 28%, rgba(255, 248, 205, 0.18), transparent 27%), linear-gradient(145deg, rgba(136, 24, 36, 0.9), rgba(20, 11, 17, 0.96));
    box-shadow: 0 0 0 6px rgba(255, 193, 73, 0.09), 0 0 11px rgba(255, 246, 202, 0.72), 0 0 28px rgba(255, 46, 57, 0.72), 0 0 48px rgba(255, 113, 33, 0.3), 0 20px 46px rgba(0, 0, 0, 0.52);
  }

  .ring-a {
    inset: 1px;
    border: 2px solid #ffdb7f;
    border-left-color: transparent;
    box-shadow: 0 0 10px #fff0ba, 0 0 24px rgba(255, 44, 57, 0.78);
    animation: ringSpin 3.2s linear infinite;
  }

  .ring-b {
    inset: -7px;
    border: 1px dashed rgba(255, 93, 66, 0.82);
    animation: ringSpinReverse 5.2s linear infinite;
  }

  .ring-c {
    display: block;
    inset: -15px;
    border: 1px solid rgba(255, 221, 132, 0.24);
    box-shadow: 0 0 26px rgba(255, 40, 57, 0.36), inset 0 0 18px rgba(255, 196, 76, 0.1);
    animation: legendaryRingPulse 1.2s ease-in-out infinite alternate;
  }

  .comment-badge {
    right: -5px;
    bottom: -10px;
    width: 52px;
    height: 52px;
    font-size: 47px;
    color: #ffe39d;
    text-shadow: 0 2px 0 rgba(69, 3, 10, 0.92), 0 0 6px #fff2c4, 0 0 18px #ff394c, 0 0 32px rgba(255, 72, 32, 0.78);
    animation: legendaryNumberPulse 0.95s ease-in-out infinite alternate;
  }

  .focus-name {
    background: linear-gradient(100deg, #fff9df 4%, #ffd872 45%, #ff6a55 100%);
    -webkit-background-clip: text;
    filter: drop-shadow(0 0 7px rgba(255, 245, 196, 0.52)) drop-shadow(0 0 17px rgba(255, 45, 54, 0.62)) drop-shadow(0 5px 20px rgba(0, 0, 0, 0.48));
  }

  .message-panel {
    border: 1px solid rgba(255, 201, 102, 0.28);
    border-left: 2px solid rgba(255, 215, 122, 0.72);
    background: linear-gradient(102deg, rgba(159, 26, 39, 0.18), rgba(76, 18, 26, 0.085) 48%, rgba(7, 7, 12, 0.18)), rgba(4, 5, 9, 0.38);
    box-shadow: inset 0 1px rgba(255, 232, 170, 0.06), 0 20px 62px rgba(0, 0, 0, 0.22), 0 0 22px rgba(255, 218, 126, 0.09), 0 0 44px rgba(255, 38, 52, 0.08);
  }

  .message-panel::before {
    inset: 2% 0 0 20%;
    opacity: 0.15;
    filter: saturate(0.92) contrast(1.04);
    mask-image: linear-gradient(90deg, transparent, #000 17%, #000 100%);
  }

  .message-panel p {
    color: #fffaf0;
    text-shadow: 0 4px 22px rgba(0, 0, 0, 0.5), 0 0 13px rgba(255, 217, 129, 0.12), 0 0 25px rgba(255, 55, 64, 0.075);
  }

  .tier-visual::after {
    inset: 5% -2% 3% 27%;
    opacity: 0.15;
    filter: saturate(0.94) contrast(1.05) drop-shadow(0 0 16px rgba(255, 44, 53, 0.2));
    animation: legendaryDragonFloat 4.4s ease-in-out infinite alternate;
  }

  .energy-particles { opacity: 0.78; }
  .energy-particles i {
    width: 3px;
    height: 3px;
    background: #ffe096;
    box-shadow: 0 0 7px #fff2c7, 0 0 17px #ff3c4c;
  }
}

@media (max-width: 700px) {
  .focus-window.focus-tier-red .focus-main { grid-template-columns: 94px minmax(0, 1fr); gap: 23px; padding-left: 30px; }
  .focus-window.focus-tier-red .avatar-stage { width: 90px; height: 90px; }
  .focus-window.focus-tier-red .avatar-stage > img,
  .focus-window.focus-tier-red .avatar-fallback { width: 72px; height: 72px; }
  .focus-window.focus-tier-red .comment-badge { width: 42px; height: 42px; font-size: 38px; }
}
</style>

<style lang="scss" scoped>
/* High-refresh displays: keep the spectacle on compositor-friendly layers. */
.focus-card {
  contain: layout style;
  isolation: isolate;
  backface-visibility: hidden;
}

.message-panel {
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
  background-color: rgba(4, 7, 13, 0.72);
}

.message-panel.message-overflowing,
.concept-message.message-overflowing {
  overflow-y: auto !important;
  overflow-x: hidden !important;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 224, 146, .72) rgba(8, 12, 22, .35);
}

/* 概念稿正文默认仍可拖动窗口；仅当内容确实溢出时，把命中区交给滚轮。 */
.concept-message.message-overflowing {
  pointer-events: auto;
  -webkit-app-region: no-drag;
}

.message-panel.message-overflowing::-webkit-scrollbar,
.concept-message.message-overflowing::-webkit-scrollbar { width: 7px; }
.message-panel.message-overflowing::-webkit-scrollbar-thumb,
.concept-message.message-overflowing::-webkit-scrollbar-thumb {
  border-radius: 99px;
  background: rgba(255, 224, 146, .72);
}

.energy-rays,
.card-shine,
.tier-orbit,
.tier-visual::after {
  backface-visibility: hidden;
  will-change: transform, opacity;
}

.energy-rays {
  animation-timing-function: steps(160, end) !important;
}

.tier-orbit {
  animation-timing-function: steps(120, end) !important;
}

.energy-particles i {
  animation-timing-function: steps(24, end) !important;
}

/* Never animate full-card shadows or filters; they force a full repaint each frame. */
.focus-window.focus-tier-purple .focus-card {
  animation: refinedReveal 0.3s cubic-bezier(0.2, 0.9, 0.25, 1) both;
}

.focus-window.focus-tier-red {
  .focus-card {
    animation: legendaryReveal 0.46s cubic-bezier(0.16, 1, 0.3, 1) both;
  }

  .focus-border {
    animation: none;
  }

  /* The generated filigree is the single dragon layer; the duplicate SVG is costly. */
  .focus-dragon,
  .message-panel::before {
    display: none;
  }

  .card-shine {
    left: -190px;
    transform: translate3d(0, 0, 0) rotate(17deg);
    animation: legendarySweepComposite 3.4s 0.8s ease-in-out infinite;
  }

  .ring-a,
  .ring-b {
    animation-timing-function: steps(72, end);
  }

  .ring-c {
    animation: legendaryRingComposite 1.8s steps(28, end) infinite alternate;
  }

  .comment-badge {
    animation: legendaryNumberComposite 1.35s steps(24, end) infinite alternate;
  }

  .tier-visual::after {
    animation: legendaryDragonComposite 5.8s steps(40, end) infinite alternate;
  }
}

@keyframes legendarySweepComposite {
  0%, 24% {
    opacity: 0;
    transform: translate3d(0, 0, 0) rotate(17deg);
  }
  44% { opacity: 0.82; }
  72%, 100% {
    opacity: 0;
    transform: translate3d(calc(100vw + 340px), 0, 0) rotate(17deg);
  }
}

@keyframes legendaryRingComposite {
  from { opacity: 0.46; transform: scale(0.985); }
  to { opacity: 0.72; transform: scale(1.035); }
}

@keyframes legendaryNumberComposite {
  from { opacity: 0.92; transform: translate3d(0, 0, 0) scale(1); }
  to { opacity: 1; transform: translate3d(0, -1px, 0) scale(1.065); }
}

@keyframes legendaryDragonComposite {
  from { opacity: 0.12; transform: translate3d(8px, 2px, 0) scale(0.995); }
  to { opacity: 0.19; transform: translate3d(-7px, -3px, 0) scale(1.02); }
}

.focus-window .concept-user strong {
  font-family: 'LXGW WenKai', 'Microsoft YaHei UI', sans-serif;
  font-weight: 700;
}

.focus-window.focus-window.focus-window.focus-window .focus-name,
.focus-window.focus-window.focus-window.focus-window .concept-user strong {
  font-family: 'LXGW WenKai', 'Microsoft YaHei UI', sans-serif;
  font-weight: 700;
  overflow: hidden;
  text-overflow: clip;
  white-space: nowrap;
  overflow-wrap: normal;
}

.focus-window.focus-window.focus-window.focus-window .focus-name {
  line-height: 1.14;
}

.focus-window.focus-window.focus-window.focus-window .concept-user strong {
  line-height: 1.08;
}

.focus-window.focus-window.focus-window.focus-window.focus-tier-red {
  .concept-user strong,
  .concept-message p {
    color: #ff5660 !important;
    text-shadow:
      0 3px 8px rgba(30, 0, 4, .96),
      0 0 8px rgba(255, 38, 49, .92),
      0 0 20px rgba(255, 45, 52, .58);
  }
}

.focus-window.focus-window.focus-window.focus-window {
  &.focus-tier-orange,
  &.focus-tier-purple,
  &.focus-tier-red {
    .concept-plate::after {
      content: none !important;
      display: none !important;
      background: none !important;
    }
  }

  .concept-avatar {
    width: clamp(72px, 10vmin, 116px);
    height: clamp(72px, 10vmin, 116px);
    flex-basis: clamp(72px, 10vmin, 116px);
  }

  .concept-level {
    font-size: clamp(60px, 10vmin, 124px);
  }

  .concept-user strong {
    font-size: clamp(40px, 7.2vmin, 88px);
  }
}

/* 0-4: a deliberately plain enlarged comment. No themed artwork, glow,
   particles or entrance effects; hierarchy comes only from type and spacing. */
.focus-window.focus-window.focus-window.focus-window.focus-tier-white {
  --concept-ink: #f4f5f7;
  --concept-accent: #e2e5e9;

  .focus-card {
    background: transparent !important;
    box-shadow: none !important;
    animation: none !important;
    filter: none !important;
  }

  .concept-plate {
    display: none !important;
    background: none !important;
  }

  .concept-content {
    left: 5%;
    right: 5%;
    top: 7%;
    bottom: 7%;
    grid-template-rows: minmax(76px, .28fr) minmax(0, 1fr);
    padding: clamp(22px, 4vmin, 52px) clamp(28px, 5vw, 76px);
    border: 1px solid rgba(223, 227, 233, .38);
    border-radius: 20px;
    background: rgba(42, 45, 51, .94);
    box-shadow: none;
  }

  .concept-user {
    color: #f0f1f3;
    text-shadow: none;
  }

  .concept-avatar {
    border-color: rgba(232, 235, 239, .76);
    color: #f0f1f3;
    background: #34373d;
    box-shadow: none;
  }

  .concept-level,
  .concept-user strong,
  .concept-message p {
    color: #f4f5f7;
    text-shadow: none;
    filter: none;
  }

  .concept-actions {
    right: 7%;
    top: 9%;
  }

  .concept-actions button {
    color: #e4e6ea;
    border-color: rgba(224, 228, 234, .32);
    background: rgba(31, 34, 39, .9);
    box-shadow: none;
  }
}

.window-resize-handle {
  position: absolute;
  z-index: 80;
  right: 0;
  bottom: 0;
  width: 28px;
  height: 28px;
  cursor: nwse-resize;
  touch-action: none;
  -webkit-app-region: no-drag;

  &::after {
    content: '';
    position: absolute;
    right: 6px;
    bottom: 6px;
    width: 10px;
    height: 10px;
    border-right: 2px solid rgba(255, 255, 255, .58);
    border-bottom: 2px solid rgba(255, 255, 255, .58);
  }
}

.focus-window.focus-window.focus-window.focus-window .focus-name.nickname-multiline,
.focus-window.focus-window.focus-window.focus-window .concept-user strong.nickname-multiline {
  display: -webkit-box;
  overflow: hidden;
  white-space: normal;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
</style>
