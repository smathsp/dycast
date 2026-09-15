<template>
  <div
    class="danmu-view"
    :class="{ 'is-overlay': state.isDisplaying, 'is-preview': isPreviewMode }"
    @mousemove="syncMousePassthrough"
    @mouseleave="enableMousePassthrough">
    <button
      v-if="!isPreviewMode"
      type="button"
      class="window-close-btn"
      title="关闭弹幕充能窗口"
      aria-label="关闭弹幕充能窗口"
      @click.stop="handleCloseWindow">×</button>
    <WindowDisplayPicker v-if="state.isDisplaying && !state.isLotteryActive && !isPreviewMode" />
    <!-- 左上角隐藏历史按钮 -->
    <div v-if="!isPreviewMode" class="history-zone">
      <button class="history-btn" @click.stop="showHistory = true" title="Happy 记录">
        <span class="trophy-icon">🏆</span>
      </button>
    </div>

    <!-- 待机画面 -->
    <ChargingStart v-if="!state.isDisplaying" />

    <!-- 弹幕墙 -->
    <div class="danmu-main" v-if="state.isDisplaying">
      <DanmuWall @select="handleDanmuSelect" />
    </div>

    <!-- 展示与抽奖分别控制；仅展示时不会累计奖池。 -->
    <div class="danmu-hud" v-if="state.isDisplaying && !state.isLotteryActive && !isPreviewMode">
      <div class="hud-center">
        <EnergyBar v-if="state.isCollecting" />
      </div>
      <div class="hud-actions">
        <button v-if="!state.isCollecting" class="action-btn start-lottery-btn" @click="handleStartCollecting">开始攒能量</button>
        <button
          v-if="state.isCollecting"
          class="action-btn start-lottery-btn"
          :disabled="!manualLotteryReady"
          @click="handleStartLottery">开始抽奖</button>
        <button v-if="state.isCollecting" class="action-btn" @click="handleStopCollecting">停止攒能量</button>
        <button v-if="!state.isCollecting" class="action-btn" @click="handleStopDisplaying">停止展示</button>
      </div>
    </div>

    <!-- 抽奖动画叠加层 -->
    <LotteryAnimation />
    <!-- Happy 记录 -->
    <WinnerHistoryModal
      :visible="showHistory"
      :winners="state.lotteryHistory"
      :draw-no="state.lotteryCount"
      @close="showHistory = false"
      @clear="handleClearHistory"
      @delete="handleDeleteHistory"
    />
    <WinnerPngPreview />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue';
import ChargingStart from '@/components/danmu/ChargingStart.vue';
import DanmuWall from '@/components/danmu/DanmuWall.vue';
import EnergyBar from '@/components/danmu/EnergyBar.vue';
import LotteryAnimation from '@/components/danmu/LotteryAnimation.vue';
import WinnerHistoryModal from '@/components/danmu/WinnerHistoryModal.vue';
import WinnerPngPreview from '@/components/danmu/WinnerPngPreview.vue';
import WindowDisplayPicker from '@/components/danmu/WindowDisplayPicker.vue';
import type { Danmu } from '@/danmu/types';
import { getCurrentAnchorBadgeLevel } from '@/danmu/lottery';
import { useDanmuState, startListening, stopListening, startCollecting, stopCollecting, stopDisplaying, startLottery, canStartLottery, clearLotteryHistory, deleteLotteryItems } from '@/danmu/store';
import { playCharging, stopAll } from '@/danmu/audio';
import { useSettings } from '@/utils/settingUtil';

const state = useDanmuState();
const appSettings = useSettings();
const manualLotteryReady = computed(() => canStartLottery());
const showHistory = ref(false);
const previewVariant = new URLSearchParams(location.search).get('preview');
const isPreviewMode = !window.electronAPI && previewVariant !== null;
const previewTimers: number[] = [];
let isMousePassthrough = false;
let cursorPollingTimer: ReturnType<typeof setInterval> | null = null;
let cursorPollingBusy = false;
const INTERACTIVE_OVERLAY_SELECTOR = '.danmu-click-target, button, .window-display-picker, .winner-host, .png-preview-float';

function createPreviewDanmu(level: number, nickname: string, content: string, index: number): Danmu {
  const anchorId = 'preview-anchor';
  return {
    id: `preview-danmu-${level}-${index}`,
    avatar: '',
    nickname,
    content,
    timestamp: Date.now() + index,
    secUid: `preview-user-${index}`,
    targetAnchorId: anchorId,
    fansClub: [{ anchorId, clubName: '当前主播', level }]
  };
}

function startPreviewDanmu(): void {
  state.isDisplaying = true;
  state.isLotteryActive = false;
  state.activeDanmu.splice(0);
  const samples = [
    createPreviewDanmu(3, '阿初', '好！', 0),
    createPreviewDanmu(3, '小路', '第一次来看，讲得很清楚', 1),
    createPreviewDanmu(3, '云上', '这是一条专门用来验证弹幕宽度会随内容自动伸展的长弹幕', 2),
    createPreviewDanmu(7, '橘子海', '这个演示也太丝滑了', 3),
    createPreviewDanmu(12, '星河', '主播下一场还能讲这个主题吗', 4),
    createPreviewDanmu(18, '龙吟', '全场最佳！这个思路真的绝了', 5)
  ];
  samples.forEach((sample, index) => {
    previewTimers.push(window.setTimeout(() => state.activeDanmu.push(sample), index * 450));
  });
}

function startHistoryPreview(): void {
  const now = Date.now();
  const samples = Array.from({ length: 48 }, (_, index) => {
    const batchIndex = Math.floor(index / 3);
    return {
      ...createPreviewDanmu((index * 3) % 20 + 1, `中奖观众${index + 1}`, `用于验证长列表滚动的测试弹幕 ${index + 1}`, index),
      winRecordId: `preview-winner-${index}`,
      drawNo: batchIndex + 1,
      wonAt: now - (15 - batchIndex) * 60000,
      batchId: `preview-batch-${batchIndex}`,
      batchPosition: index % 3 + 1,
      batchSize: 3
    };
  });
  state.lotteryHistory.splice(0, state.lotteryHistory.length, ...samples);
  state.lotteryCount = 16;
  showHistory.value = true;
}

function setMousePassthrough(ignore: boolean) {
  if (isMousePassthrough === ignore) return;
  isMousePassthrough = ignore;
  window.electronAPI?.setDanmuMousePassthrough?.(ignore);
}

function enableMousePassthrough() {
  if (state.isDisplaying && !state.isLotteryActive && !showHistory.value) setMousePassthrough(true);
}

function syncMousePassthrough(event: MouseEvent) {
  if (!state.isDisplaying || state.isLotteryActive) return;
  if (showHistory.value) {
    setMousePassthrough(false);
    return;
  }
  const target = event.target;
  const isInteractive = target instanceof Element && Boolean(target.closest(INTERACTIVE_OVERLAY_SELECTOR));
  setMousePassthrough(!isInteractive);
}

async function syncMousePassthroughFromCursor() {
  if (cursorPollingBusy || document.hidden || !state.isDisplaying || !window.electronAPI?.getDanmuCursorPosition) return;
  if (showHistory.value) {
    setMousePassthrough(false);
    return;
  }
  cursorPollingBusy = true;
  try {
    const cursor = await window.electronAPI.getDanmuCursorPosition();
    if (!cursor?.inside) {
      setMousePassthrough(true);
      return;
    }
    const target = document.elementFromPoint(cursor.x, cursor.y);
    const isInteractive = Boolean(target?.closest(INTERACTIVE_OVERLAY_SELECTOR));
    setMousePassthrough(!isInteractive);
  } catch (error) {
    console.warn('[DanmuView] 读取鼠标位置失败:', error);
  } finally {
    cursorPollingBusy = false;
  }
}

function startCursorPolling() {
  if (document.hidden || cursorPollingTimer || !window.electronAPI?.getDanmuCursorPosition) return;
  cursorPollingTimer = setInterval(() => void syncMousePassthroughFromCursor(), 120);
}

function stopCursorPolling() {
  if (cursorPollingTimer) clearInterval(cursorPollingTimer);
  cursorPollingTimer = null;
  cursorPollingBusy = false;
}

function handleDanmuSelect(danmu: Danmu) {
  const duration = Math.min(120, Math.max(3, Number(appSettings.value.commentHighlightDuration) || 10));
  // DanmuWall 的列表是 Vue 响应式对象，Electron IPC 无法克隆 Proxy。
  // 显式构造普通对象，保持与侧边栏放大入口传递的数据结构一致。
  const highlightItem = {
    id: String(danmu.id || ''),
    avatar: String(danmu.avatar || ''),
    nickname: String(danmu.nickname || ''),
    content: String(danmu.content || ''),
    emojiUrl: danmu.emojiUrl ? String(danmu.emojiUrl) : undefined,
    timestamp: Number(danmu.timestamp) || Date.now(),
    badgeLevel: getCurrentAnchorBadgeLevel(danmu)
  };
  void window.electronAPI?.showCommentHighlight?.(highlightItem, duration).catch(error => {
    console.warn('[DanmuView] 打开放大弹幕失败:', error);
  });
}

function handleStartCollecting() {
  playCharging();
  startCollecting();
}

function handleStopCollecting() {
  stopAll();
  stopCollecting();
}

function handleStartLottery() {
  startLottery();
}

function handleStopDisplaying() {
  stopDisplaying();
}

function handleCloseWindow() {
  setMousePassthrough(false);
  window.electronAPI?.closeDanmuPage?.();
}

function handleClearHistory() {
  if (confirm('确定清空全部 Happy 记录吗？该操作无法撤销。')) {
    clearLotteryHistory();
  }
}

function handleDeleteHistory(recordKey: string) {
  if (confirm('确定删除这条 Happy 记录吗？')) {
    deleteLotteryItems(new Set([recordKey]));
  }
}

function handleVisibilityChange() {
  if (document.hidden) stopCursorPolling();
  else if (state.isDisplaying && !state.isLotteryActive && !showHistory.value) startCursorPolling();
}

onMounted(() => {
  if (isPreviewMode) {
    if (previewVariant === 'history') startHistoryPreview();
    else startPreviewDanmu();
    return;
  }
  startListening();
  document.addEventListener('visibilitychange', handleVisibilityChange);
  if (state.isDisplaying) {
    setMousePassthrough(true);
    startCursorPolling();
  }
});

onUnmounted(() => {
  previewTimers.forEach(timer => window.clearTimeout(timer));
  previewTimers.splice(0);
  window.electronAPI?.setLotteryOverlayActive?.(false);
  stopListening();
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  stopCursorPolling();
  setMousePassthrough(false);
});

watch(() => state.isDisplaying, displaying => {
  const canPassThrough = displaying && !state.isLotteryActive && !showHistory.value;
  setMousePassthrough(canPassThrough);
  if (canPassThrough) startCursorPolling();
  else stopCursorPolling();
});

watch(() => state.isLotteryActive, active => {
  window.electronAPI?.setLotteryOverlayActive?.(active);
  if (active) {
    // 记录面板不能遮挡自动开奖；满能量后优先显示抽奖结果。
    showHistory.value = false;
    stopCursorPolling();
    setMousePassthrough(false);
  } else if (state.isDisplaying && !showHistory.value) {
    setMousePassthrough(true);
    startCursorPolling();
  }
}, { immediate: true });

watch(() => state.isCollecting, collecting => {
  // 设置页或会话切换可由 IPC 停止充能，不能只停状态而让旧充能音乐继续播放。
  if (!collecting && !state.isLotteryActive) stopAll();
});

watch(showHistory, visible => {
  if (visible) {
    stopCursorPolling();
    setMousePassthrough(false);
  } else if (state.isDisplaying && !state.isLotteryActive) {
    setMousePassthrough(true);
    startCursorPolling();
  }
});
</script>

<style lang="scss" scoped>
.danmu-view {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  min-height: 0;
  background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  user-select: none;
}

.danmu-view.is-overlay {
  background: transparent;
}

.danmu-view.is-overlay.is-preview {
  background:
    radial-gradient(circle at 18% 24%, rgba(65, 111, 176, 0.12), transparent 25%),
    radial-gradient(circle at 82% 78%, rgba(117, 87, 192, 0.16), transparent 28%),
    linear-gradient(108deg, #eef1f5 0 48%, #152032 48.2% 100%);
}

.danmu-view.is-preview::before {
  content: 'PRESENTATION PREVIEW';
  position: absolute;
  z-index: 0;
  left: 5.5%;
  top: 8%;
  color: rgba(22, 37, 57, 0.16);
  font: 800 clamp(18px, 3.4vw, 46px)/1 'DouyinSansBold', sans-serif;
  letter-spacing: 0.15em;
}

.danmu-view.is-preview .danmu-main { z-index: 1; }

.window-close-btn {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 10000;
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  padding: 0 0 3px;
  border: 1px solid rgba(255, 255, 255, .22);
  border-radius: 10px;
  background: rgba(10, 12, 20, .55);
  color: rgba(255, 255, 255, .78);
  box-shadow: 0 5px 18px rgba(0, 0, 0, .22);
  backdrop-filter: blur(10px);
  font: 300 30px/1 'Microsoft YaHei UI', sans-serif;
  cursor: pointer;
  pointer-events: auto;
  transition: background .16s ease, border-color .16s ease, color .16s ease, transform .16s ease;

  &:hover {
    border-color: rgba(255, 118, 118, .76);
    background: rgba(151, 35, 47, .78);
    color: #fff;
    transform: scale(1.06);
  }

  &:active {
    transform: scale(.96);
  }
}

.history-zone {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 100;
  padding: 12px;

  .history-btn {
    opacity: 0;
    transition: opacity 0.3s;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    font-size: 16px;

    &:hover {
      background: rgba(255, 215, 0, 0.15);
      border-color: rgba(255, 215, 0, 0.3);
    }

    &:disabled {
      cursor: not-allowed;
      opacity: .38;
    }
  }

  &:hover .history-btn {
    opacity: 1;
  }
}

.danmu-main {
  flex: 1;
  min-height: 0;
  position: relative;
  z-index: 1;
}

.danmu-hud {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 50;
  pointer-events: none;
  box-sizing: border-box;
  padding-bottom: max(12px, env(safe-area-inset-bottom));

  .hud-center {
    width: 80%;
    max-width: 900px;
    margin: 0 auto;
    pointer-events: auto;
  }

  .hud-actions {
    position: absolute;
    right: max(22px, env(safe-area-inset-right));
    bottom: max(18px, env(safe-area-inset-bottom));
    z-index: 3;
    display: flex;
    gap: 8px;
    pointer-events: auto;
  }

  .action-btn {
    pointer-events: auto;
    padding: 6px 18px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.5);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;

    &:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
      border-color: rgba(255, 255, 255, 0.3);
    }
  }

  .start-lottery-btn {
    color: #c9f7ff;
    border-color: rgba(53, 230, 255, 0.45);
    background: rgba(31, 139, 205, 0.2);
  }
}
</style>
