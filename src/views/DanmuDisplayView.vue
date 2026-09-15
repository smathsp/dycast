<template>
  <main class="display-view">
    <aside class="comment-rail" aria-label="直播弹幕展示">
      <header class="rail-header">
        <div class="live-mark"><i></i><span>LIVE</span></div>
        <div>
          <h1>直播弹幕</h1>
          <p>点击任意内容即可放大</p>
        </div>
        <div class="rail-actions">
          <strong class="comment-count">{{ state.totalPoolCount.toLocaleString() }}</strong>
          <button
            type="button"
            class="window-action record-history-action"
            :class="{ active: recordPanelVisible }"
            :aria-label="`查看保留弹幕，共 ${commentRecords.length} 条`"
            :title="`保留弹幕（${commentRecords.length}）`"
            @click="toggleRecordPanel">
            <span class="record-history-shape"></span>
            <b>{{ commentRecords.length > 99 ? '99+' : commentRecords.length }}</b>
          </button>
          <button
            type="button"
            class="window-action pin-action"
            :class="{ active: displayPinned }"
            :aria-label="displayPinned ? '取消窗口置顶' : '窗口置顶'"
            :title="displayPinned ? '取消置顶' : '置顶窗口'"
            @click="toggleDisplayPinned">
            <span class="pin-shape"></span>{{ displayPinned ? '已置顶' : '置顶' }}
          </button>
          <button
            type="button"
            class="window-action close-action"
            aria-label="关闭观众弹幕展示"
            title="关闭"
            @click="closeDisplayWindow">×</button>
        </div>
      </header>

      <div
        ref="streamRef"
        class="comment-stream"
        @scroll.passive="handleStreamScroll"
        @wheel="handleStreamWheel"
        @pointerdown="handleStreamPointerDown"
        @touchstart.passive="handleStreamTouchStart"
        @touchmove.passive="handleStreamTouchMove">
        <div ref="commentListRef" class="comment-list">
          <button
            v-for="item in displayItems"
            :key="getItemKey(item)"
            type="button"
            class="comment-card"
            :class="getBadgeEffectClass(item)"
            @click="openHighlight(item)">
            <img v-if="item.avatar" :src="item.avatar" alt="" class="comment-avatar" loading="lazy" />
            <span v-else class="comment-avatar avatar-fallback">{{ getInitial(item.nickname) }}</span>
            <span class="comment-body">
              <span class="comment-meta">
                <strong :title="item.nickname">{{ item.nickname || '匿名观众' }}</strong>
                <span
                  v-if="getCurrentAnchorBadge(item)"
                  class="comment-level-mark"
                  :aria-label="`当前主播灯牌 ${getCurrentAnchorBadgeLevel(item)} 级`">
                  <b>{{ getCurrentAnchorBadgeLevel(item) }}级</b>
                </span>
                <time>{{ formatTime(item.timestamp) }}</time>
              </span>
              <span class="comment-content">
                <InlineEmojiText :content="item.content" :emoji-url="item.emojiUrl" />
              </span>
            </span>
          </button>
        </div>
        <div v-if="!displayItems.length" class="empty-stream">
          <span>◌</span>
          <strong>等待直播弹幕</strong>
          <small>连接直播间后将实时显示</small>
        </div>
        <button
          v-if="!isFollowingLatest"
          type="button"
          class="return-latest"
          @click="resumeAutoFollow">
          <span v-if="unreadDisplayCount">{{ unreadDisplayCount > 99 ? '99+' : unreadDisplayCount }} 条新弹幕</span>
          <strong>回到最新 ↓</strong>
        </button>
      </div>

      <Transition name="record-panel">
        <section v-if="recordPanelVisible" class="record-panel" aria-label="保留弹幕记录">
          <header class="record-panel-header">
            <div>
              <span>BOOKMARKS</span>
              <strong>保留弹幕</strong>
            </div>
            <button type="button" aria-label="关闭保留弹幕" @click="recordPanelVisible = false">×</button>
          </header>

          <div class="record-list">
            <div v-for="record in commentRecords" :key="record.recordKey" class="record-row">
              <button type="button" class="record-open" @click="openRecordedHighlight(record)">
                <img v-if="record.avatar" :src="record.avatar" alt="" loading="lazy" />
                <span v-else class="record-avatar-fallback">{{ getInitial(record.nickname) }}</span>
                <span class="record-copy">
                  <span class="record-meta">
                    <strong :title="record.nickname">{{ record.nickname || '匿名观众' }}</strong>
                    <b v-if="record.badgeLevel" class="record-level" :aria-label="`当前主播灯牌 ${record.badgeLevel} 级`">{{ record.badgeLevel }}级</b>
                    <time>{{ formatRecordTime(record.recordedAt) }}</time>
                  </span>
                  <span class="record-content">
                    <InlineEmojiText :content="record.content" :emoji-url="record.emojiUrl" />
                  </span>
                </span>
              </button>
              <button
                type="button"
                class="record-delete"
                aria-label="删除这条保留弹幕"
                title="删除"
                @click="deleteRecordedComment(record.recordKey)">×</button>
            </div>

            <div v-if="!commentRecords.length" class="record-empty">
              <span class="record-empty-shape"></span>
              <strong>还没有保留弹幕</strong>
              <small>放大弹幕后，点击右上角书签按钮即可保存</small>
            </div>
          </div>

          <footer v-if="commentRecords.length" class="record-panel-footer">
            <span>
              共 {{ commentRecords.length }} 条 · 仅保存在本机
              <em v-if="recordExportFeedback">{{ recordExportFeedback }}</em>
            </span>
            <div class="record-footer-actions">
              <button
                type="button"
                class="record-export"
                :disabled="Boolean(recordExporting)"
                @click="exportRecordedCommentsExcel">
                {{ recordExporting === 'xlsx' ? '导出中…' : '导出 Excel' }}
              </button>
              <button
                type="button"
                class="record-export record-export-secondary"
                :disabled="Boolean(recordExporting)"
                @click="exportRecordedCommentsCsv">
                {{ recordExporting === 'csv' ? '导出中…' : 'CSV' }}
              </button>
              <button type="button" class="record-clear" @click="clearRecordedComments">清空全部</button>
            </div>
          </footer>
        </section>
      </Transition>

      <div
        class="window-resize-handle"
        aria-hidden="true"
        @pointerdown="startCurrentWindowResize"></div>
    </aside>

    <TransitionGroup
      v-if="curatedItems.length"
      name="curated-float"
      tag="div"
      class="curated-float-stack"
      aria-label="AI 推荐内容">
      <button
        v-for="item in curatedItems"
        :key="`curated-${getItemKey(item)}`"
        type="button"
        class="curated-float-card"
        @click="openCuratedHighlight(item)">
        <span class="float-spark">✦</span>
        <img v-if="item.avatar" :src="item.avatar" alt="" />
        <span v-else class="curated-avatar-fallback">{{ getInitial(item.nickname) }}</span>
        <span class="float-copy">
          <strong :title="item.nickname">{{ item.nickname || '匿名观众' }}</strong>
          <em><InlineEmojiText :content="item.content" :emoji-url="item.emojiUrl" /></em>
        </span>
      </button>
    </TransitionGroup>

    <Transition name="highlight-pop">
      <article
        v-if="highlighted"
        ref="highlightRef"
        class="highlight-card"
        :style="{ left: `${highlightPosition.x}px`, top: `${highlightPosition.y}px` }">
        <header class="highlight-handle" @pointerdown="beginHighlightDrag">
          <span><i></i> 主播正在回应</span>
          <button type="button" aria-label="关闭放大弹幕" @pointerdown.stop @click.stop="closeHighlight">×</button>
        </header>
        <div class="highlight-content">
          <img v-if="highlighted.avatar" :src="highlighted.avatar" alt="" />
          <span v-else class="highlight-avatar-fallback">{{ getInitial(highlighted.nickname) }}</span>
          <div>
            <strong :title="highlighted.nickname">{{ highlighted.nickname || '匿名观众' }}</strong>
            <p><InlineEmojiText :content="highlighted.content" :emoji-url="highlighted.emojiUrl" /></p>
            <time>{{ formatFullTime(highlighted.timestamp) }}</time>
          </div>
        </div>
        <span class="resize-tip">拖动标题移动 · 右下角缩放</span>
      </article>
    </Transition>
  </main>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue';
import InlineEmojiText from '@/components/InlineEmojiText.vue';
import { startCurrentWindowResize } from '@/utils/windowResizeUtil';
import { settings as danmuSettings, startListening, stopListening, subscribeDisplayDanmu, useDanmuState } from '@/danmu/store';
import type { Danmu } from '@/danmu/types';
import { getCurrentAnchorBadge, getCurrentAnchorBadgeLevel } from '@/danmu/lottery';
import { getDanmuVisualLevel } from '@/danmu/visual';
import { useSettings } from '@/utils/settingUtil';
import FileSaver from '@/utils/fileUtil';
import { createExportTimestamp, exportExcel } from '@/utils/excelExportUtil';
import {
  COMMENT_RECORDS_STORAGE_KEY,
  clearCommentRecords,
  loadCommentRecords,
  removeCommentRecord,
  type StoredCommentRecord
} from '@/utils/commentRecordUtil';

const state = useDanmuState();
const appSettings = useSettings();
const streamRef = ref<HTMLElement | null>(null);
const commentListRef = ref<HTMLElement | null>(null);
const highlightRef = ref<HTMLElement | null>(null);
const highlighted = ref<Danmu | StoredCommentRecord | null>(null);
const displayPinned = ref(true);
const curatedItems = ref<Danmu[]>([]);
const curationLoading = ref(false);
const curationError = ref(false);
const isFollowingLatest = ref(true);
const unreadDisplayCount = ref(0);
const highlightPosition = reactive({ x: 180, y: 150 });
const displayItems = shallowRef<Danmu[]>([]);
const recordPanelVisible = ref(false);
const commentRecords = ref<StoredCommentRecord[]>([]);
const recordExporting = ref<'' | 'xlsx' | 'csv'>('');
const recordExportFeedback = ref('');

let curationTimer: number | null = null;
let lastCuratedTimestamp = 0;
let curationFailureCount = 0;
let curationRetryAfter = 0;
let curationGeneration = 0;
let displayMounted = false;
let dragCleanup: (() => void) | null = null;
let stopDisplaySubscription: (() => void) | null = null;
let displayFrame: number | null = null;
let scrollFrame: number | null = null;
let streamResizeObserver: ResizeObserver | null = null;
let suppressScrollDetection = false;
let streamTouchStartY: number | null = null;
let wheelUpDistance = 0;
let lastWheelAt = 0;
const pendingDisplayItems: Danmu[] = [];
const curatedExpiryTimers = new Map<string, number>();
const DISPLAY_RENDER_LIMIT = 48;
const DISPLAY_QUEUE_LIMIT = 72;

function getItemKey(item: Danmu): string {
  return `${item.id}-${item.timestamp}`;
}

function getInitial(nickname?: string): string {
  return (nickname || '观').trim().slice(0, 1).toUpperCase();
}

function getBadgeEffectClass(item: Danmu): string {
  const level = getDanmuVisualLevel(
    getCurrentAnchorBadgeLevel(item),
    item.nickname,
    danmuSettings.redDanmuNicknameKeywords
  );
  if (level >= 15) return 'comment-tier-red';
  if (level >= 10) return 'comment-tier-purple';
  if (level >= 5) return 'comment-tier-orange';
  return 'comment-tier-white';
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp || Date.now());
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatFullTime(timestamp: number): string {
  const date = new Date(timestamp || Date.now());
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

function formatRecordTime(timestamp: number): string {
  const date = new Date(timestamp || Date.now());
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${formatTime(timestamp)}`;
}

function refreshCommentRecords(): void {
  commentRecords.value = loadCommentRecords();
}

function toggleRecordPanel(): void {
  refreshCommentRecords();
  recordPanelVisible.value = !recordPanelVisible.value;
}

function openRecordedHighlight(record: StoredCommentRecord): void {
  openHighlight(record);
}

function deleteRecordedComment(recordKey: string): void {
  commentRecords.value = removeCommentRecord(recordKey);
}

function clearRecordedComments(): void {
  if (!confirm('确定清空全部保留弹幕吗？该操作无法撤销。')) return;
  clearCommentRecords();
  commentRecords.value = [];
}

function formatExportDate(timestamp: number): string {
  const date = new Date(timestamp || Date.now());
  return [
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
  ].join(' ');
}

function escapeCsvCell(value: unknown): string {
  let text = String(value ?? '').replace(/\r?\n/g, ' ');
  // 防止观众输入在 Excel 中被解析为公式。
  if (/^\s*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function getRecordedCommentRows(): Array<Array<string | number>> {
  return commentRecords.value.map((record, index) => [
    index + 1,
    record.nickname || '匿名观众',
    record.badgeLevel && record.badgeLevel > 0 ? record.badgeLevel : '无灯牌',
    record.content,
    formatExportDate(record.timestamp),
    formatExportDate(record.recordedAt)
  ]);
}

async function exportRecordedCommentsExcel(): Promise<void> {
  if (!commentRecords.value.length || recordExporting.value) return;
  recordExporting.value = 'xlsx';
  recordExportFeedback.value = '';
  const rows = getRecordedCommentRows();
  try {
    const result = await exportExcel({
      fileName: `保留弹幕_${createExportTimestamp()}_${rows.length}条`,
      sheetName: '保留弹幕',
      dialogTitle: '导出保留弹幕 Excel',
      columns: [
        { header: '序号', width: 9 },
        { header: '昵称', width: 22 },
        { header: '灯牌等级', width: 12 },
        { header: '弹幕内容', width: 46 },
        { header: '弹幕发送时间', width: 22 },
        { header: '手动保留时间', width: 22 }
      ],
      rows
    });
    recordExportFeedback.value = result.success ? `已导出 ${rows.length} 条` : result.canceled ? '已取消' : '导出失败';
  } catch (error) {
    console.warn('[display] 导出保留弹幕 Excel 失败:', error);
    recordExportFeedback.value = '导出失败';
  } finally {
    recordExporting.value = '';
  }
}

async function exportRecordedCommentsCsv(): Promise<void> {
  if (!commentRecords.value.length || recordExporting.value) return;
  recordExporting.value = 'csv';
  recordExportFeedback.value = '';
  const header = ['序号', '昵称', '灯牌等级', '弹幕内容', '弹幕发送时间', '手动保留时间'];
  const rows = getRecordedCommentRows();
  const csv = `\uFEFF${[header, ...rows].map(row => row.map(escapeCsvCell).join(',')).join('\r\n')}`;

  try {
    const result = await FileSaver.save(csv, {
      name: `保留弹幕_${createExportTimestamp()}_${commentRecords.value.length}条`,
      ext: '.csv',
      mimeType: 'text/csv;charset=utf-8',
      description: '保留弹幕表格',
      existStrategy: 'new'
    });
    recordExportFeedback.value = result.success ? `已导出 ${rows.length} 条 CSV` : result.message === '用户取消操作' ? '已取消' : '导出失败';
  } catch (error) {
    console.warn('[display] 导出保留弹幕失败:', error);
    recordExportFeedback.value = '导出失败';
  } finally {
    recordExporting.value = '';
  }
}

function handleCommentRecordStorage(event: StorageEvent): void {
  if (event.key === COMMENT_RECORDS_STORAGE_KEY || event.key === null) {
    refreshCommentRecords();
  }
}

function handleWindowFocus(): void {
  refreshCommentRecords();
  scheduleScrollToBottom();
}

function scheduleScrollToBottom(): void {
  if (!isFollowingLatest.value) return;
  if (scrollFrame !== null) return;
  void nextTick().then(() => {
    if (scrollFrame === null) {
      scrollFrame = window.requestAnimationFrame(advanceScrollToBottom);
    }
  });
}

function handleStreamScroll(): void {
  if (suppressScrollDetection || scrollFrame !== null) return;
  const stream = streamRef.value;
  if (!stream) return;
  const distance = stream.scrollHeight - stream.clientHeight - stream.scrollTop;
  if (!isFollowingLatest.value && distance <= 12) {
    void resumeAutoFollow();
  } else if (isFollowingLatest.value && distance > 12) {
    // 图片、字体和折行会在渲染后改变列表高度；这类布局滚动不应被误判为手动翻阅。
    scheduleScrollToBottom();
  }
}

function handleStreamPointerDown(event: PointerEvent): void {
  const stream = streamRef.value;
  if (!stream || event.pointerType !== 'mouse') return;
  const rect = stream.getBoundingClientRect();
  // 仅在用户按下滚动条时暂停；点击弹幕卡片不会打断自动跟随。
  if (event.clientX >= rect.right - 18 && stream.scrollHeight > stream.clientHeight) {
    void pauseAutoFollow();
  }
}

function handleStreamTouchStart(event: TouchEvent): void {
  streamTouchStartY = event.touches[0]?.clientY ?? null;
}

function handleStreamTouchMove(event: TouchEvent): void {
  const currentY = event.touches[0]?.clientY;
  if (streamTouchStartY === null || currentY === undefined) return;
  if (currentY - streamTouchStartY > 8 && isFollowingLatest.value) {
    void pauseAutoFollow();
  }
  streamTouchStartY = currentY;
}

async function pauseAutoFollow(): Promise<void> {
  if (!isFollowingLatest.value) return;
  isFollowingLatest.value = false;
  if (scrollFrame !== null) window.cancelAnimationFrame(scrollFrame);
  scrollFrame = null;
  if (displayFrame !== null) window.cancelAnimationFrame(displayFrame);
  displayFrame = null;
  pendingDisplayItems.splice(0);

  const stream = streamRef.value;
  const previousHeight = stream?.scrollHeight || 0;
  const previousTop = stream?.scrollTop || 0;
  suppressScrollDetection = true;
  // 浏览历史时展示完整缓存快照；后续新弹幕只累计数量，不再改动当前列表。
  displayItems.value = state.displayDanmu.slice();
  await nextTick();
  if (stream) {
    stream.scrollTop = previousTop + Math.max(0, stream.scrollHeight - previousHeight);
  }
  window.requestAnimationFrame(() => {
    suppressScrollDetection = false;
  });
}

async function handleStreamWheel(event: WheelEvent): Promise<void> {
  if (event.deltaY >= 0 || !isFollowingLatest.value) {
    wheelUpDistance = 0;
    return;
  }
  const now = performance.now();
  if (now - lastWheelAt > 420) wheelUpDistance = 0;
  lastWheelAt = now;
  wheelUpDistance += Math.abs(event.deltaY);
  // 过滤触控板的轻微反向抖动，避免用户无意间进入“浏览历史”而误以为停更。
  if (wheelUpDistance < 30) return;
  wheelUpDistance = 0;
  event.preventDefault();
  await pauseAutoFollow();
  const stream = streamRef.value;
  if (stream) {
    stream.scrollTop = Math.max(0, stream.scrollTop - Math.max(48, Math.abs(event.deltaY)));
  }
}

async function resumeAutoFollow(): Promise<void> {
  if (isFollowingLatest.value && !unreadDisplayCount.value) {
    scheduleScrollToBottom();
    return;
  }
  isFollowingLatest.value = true;
  unreadDisplayCount.value = 0;
  pendingDisplayItems.splice(0);
  displayItems.value = state.displayDanmu.slice(-DISPLAY_RENDER_LIMIT);
  await nextTick();
  const stream = streamRef.value;
  if (stream) stream.scrollTop = stream.scrollHeight;
}

function restoreStreamPosition(): void {
  if (!document.hidden) scheduleScrollToBottom();
}

function advanceScrollToBottom(): void {
  const stream = streamRef.value;
  if (!stream) {
    scrollFrame = null;
    return;
  }

  const bottom = Math.max(0, stream.scrollHeight - stream.clientHeight);
  const distance = bottom - stream.scrollTop;
  if (distance <= 0.75) {
    stream.scrollTop = bottom;
    scrollFrame = null;
    return;
  }

  // 平时柔和跟随；弹幕积压时提高追赶速度，但仍然只保留一个滚动动画。
  const isCatchingUp = pendingDisplayItems.length > 18 || distance > stream.clientHeight * 0.8;
  const easing = isCatchingUp ? 0.48 : 0.24;
  const minimumStep = isCatchingUp ? 14 : 3;
  stream.scrollTop += Math.min(distance, Math.max(minimumStep, distance * easing));
  scrollFrame = window.requestAnimationFrame(advanceScrollToBottom);
}

function drainDisplayQueue(): void {
  displayFrame = null;
  if (!pendingDisplayItems.length) return;

  // 正常流量逐条呈现；积压时每帧最多补 2 条，兼顾实时性和连贯动画。
  const takeCount = pendingDisplayItems.length > 18 ? 2 : 1;
  const nextItems = pendingDisplayItems.splice(0, takeCount);
  displayItems.value = [...displayItems.value, ...nextItems].slice(-DISPLAY_RENDER_LIMIT);
  scheduleScrollToBottom();

  if (pendingDisplayItems.length) {
    displayFrame = window.requestAnimationFrame(drainDisplayQueue);
  }
}

function enqueueDisplayDanmu(danmu: Danmu | null): void {
  if (!danmu) {
    pendingDisplayItems.splice(0);
    displayItems.value = [];
    isFollowingLatest.value = true;
    unreadDisplayCount.value = 0;
    scheduleScrollToBottom();
    return;
  }

  if (!isFollowingLatest.value) {
    unreadDisplayCount.value++;
    return;
  }

  pendingDisplayItems.push(danmu);
  if (pendingDisplayItems.length > DISPLAY_QUEUE_LIMIT) {
    pendingDisplayItems.splice(0, pendingDisplayItems.length - DISPLAY_QUEUE_LIMIT);
  }
  if (displayFrame === null) {
    displayFrame = window.requestAnimationFrame(drainDisplayQueue);
  }
}

function getHighlightBadgeLevel(item: Danmu | StoredCommentRecord): number {
  if ('badgeLevel' in item && Number(item.badgeLevel) > 0) {
    return Math.max(0, Math.round(Number(item.badgeLevel)));
  }
  return getCurrentAnchorBadgeLevel(item as Danmu);
}

function openHighlight(item: Danmu | StoredCommentRecord): void {
  const duration = Math.min(120, Math.max(3, Number(appSettings.value.commentHighlightDuration) || 10));
  if (window.electronAPI?.showCommentHighlight) {
    const highlightItem = {
      id: String(item.id || ''),
      avatar: String(item.avatar || ''),
      nickname: String(item.nickname || ''),
      content: String(item.content || ''),
      emojiUrl: item.emojiUrl ? String(item.emojiUrl) : undefined,
      timestamp: Number(item.timestamp) || Date.now(),
      badgeLevel: getHighlightBadgeLevel(item)
    };
    void window.electronAPI.showCommentHighlight(highlightItem, duration);
    return;
  }
  highlighted.value = item;
  const railWidth = Math.min(460, Math.max(380, window.innerWidth * 0.29));
  const availableWidth = window.innerWidth - railWidth;
  highlightPosition.x = Math.max(28, Math.round((availableWidth - 680) / 2));
  highlightPosition.y = Math.max(76, Math.round((window.innerHeight - 340) / 2));
}

function openCuratedHighlight(item: Danmu): void {
  const key = getItemKey(item);
  const expiryTimer = curatedExpiryTimers.get(key);
  if (expiryTimer !== undefined) {
    window.clearTimeout(expiryTimer);
    curatedExpiryTimers.delete(key);
  }
  curatedItems.value = curatedItems.value.filter(current => getItemKey(current) !== key);
  openHighlight(item);
}

async function toggleDisplayPinned(): Promise<void> {
  if (!window.electronAPI?.setDisplayAlwaysOnTop) return;
  displayPinned.value = await window.electronAPI.setDisplayAlwaysOnTop(!displayPinned.value);
}

function closeDisplayWindow(): void {
  if (window.electronAPI?.closeDisplayWindow) {
    window.electronAPI.closeDisplayWindow();
  } else {
    window.close();
  }
}

function closeHighlight(): void {
  highlighted.value = null;
  dragCleanup?.();
}

function beginHighlightDrag(event: PointerEvent): void {
  if (event.button !== 0 || !highlighted.value) return;
  const card = highlightRef.value;
  if (!card) return;
  event.preventDefault();
  const startX = event.clientX;
  const startY = event.clientY;
  const originX = highlightPosition.x;
  const originY = highlightPosition.y;

  const move = (moveEvent: PointerEvent) => {
    const maxX = Math.max(16, window.innerWidth - card.offsetWidth - 16);
    const maxY = Math.max(16, window.innerHeight - card.offsetHeight - 16);
    highlightPosition.x = Math.min(maxX, Math.max(16, originX + moveEvent.clientX - startX));
    highlightPosition.y = Math.min(maxY, Math.max(16, originY + moveEvent.clientY - startY));
  };
  const stop = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', stop);
    dragCleanup = null;
  };
  dragCleanup?.();
  dragCleanup = stop;
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', stop, { once: true });
}

async function requestCuration(candidates: Danmu[]): Promise<string[]> {
  const config = {
    endpoint: appSettings.value.aiCurationEndpoint,
    model: appSettings.value.aiCurationModel
  };
  const messages = candidates.map(item => ({
    id: getItemKey(item),
    nickname: item.nickname || '',
    content: item.content || ''
  }));
  if (window.electronAPI?.curateDanmu) {
    return window.electronAPI.curateDanmu(config, messages);
  }

  const browserApiKey = appSettings.value.aiCurationApiKey;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(browserApiKey ? { authorization: `Bearer ${browserApiKey}` } : {})
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: '从候选直播弹幕中选最多3条值得主播回应的问题或建设性内容。排除政治、辱骂、黑粉喷子、带节奏、违法、色情、广告和刷屏。只返回JSON：{"selectedIds":["候选id"]}。'
          },
          { role: 'user', content: JSON.stringify(messages) }
        ]
      }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`AI 接口返回 ${response.status}`);
    const payload = await response.json();
    let rawContent = payload?.choices?.[0]?.message?.content;
    if (Array.isArray(rawContent)) {
      rawContent = rawContent.map(part => typeof part === 'string' ? part : part?.text || '').join('');
    }
    const content = String(rawContent || '')
      .replace(/^\s*```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '');
    const selectedIds = JSON.parse(content)?.selectedIds;
    const allowedIds = new Set(messages.map(item => item.id));
    return Array.isArray(selectedIds)
      ? Array.from(new Set(selectedIds.map(String))).filter(id => allowedIds.has(id)).slice(0, 3)
      : [];
  } finally {
    window.clearTimeout(timeout);
  }
}

async function runCuration(): Promise<void> {
  const settings = appSettings.value;
  if (!settings.aiCurationEnabled || curationLoading.value) return;
  if (!settings.aiCurationEndpoint || !settings.aiCurationModel) return;
  if (Date.now() < curationRetryAfter) return;
  const candidates = state.displayDanmu
    .filter(item => item.timestamp > lastCuratedTimestamp && Boolean(item.content?.trim()))
    .slice(-50);
  if (!candidates.length) return;

  curationLoading.value = true;
  curationError.value = false;
  const requestGeneration = curationGeneration;
  try {
    const selectedIds = new Set(await requestCuration(candidates));
    if (!displayMounted || requestGeneration !== curationGeneration) return;
    const selected = candidates.filter(item => selectedIds.has(getItemKey(item)));
    const known = new Set(curatedItems.value.map(getItemKey));
    curatedItems.value = [
      ...selected.filter(item => !known.has(getItemKey(item))),
      ...curatedItems.value
    ].slice(0, 4);
    const duration = Math.min(120, Math.max(3, Number(appSettings.value.commentHighlightDuration) || 10));
    selected.forEach(item => {
      const key = getItemKey(item);
      const previousTimer = curatedExpiryTimers.get(key);
      if (previousTimer !== undefined) window.clearTimeout(previousTimer);
      const timer = window.setTimeout(() => {
        curatedItems.value = curatedItems.value.filter(current => getItemKey(current) !== key);
        curatedExpiryTimers.delete(key);
      }, duration * 1000);
      curatedExpiryTimers.set(key, timer);
    });
    lastCuratedTimestamp = Math.max(...candidates.map(item => item.timestamp));
    curationFailureCount = 0;
    curationRetryAfter = 0;
  } catch (error) {
    if (!displayMounted || requestGeneration !== curationGeneration) return;
    curationError.value = true;
    curationFailureCount += 1;
    const baseInterval = Math.min(600, Math.max(20, Number(appSettings.value.aiCurationInterval) || 60)) * 1000;
    // 连续失败指数退避；达到 5 次后暂停，修改 AI 设置即可恢复，避免接口异常持续产生费用。
    curationRetryAfter = curationFailureCount >= 5
      ? Number.POSITIVE_INFINITY
      : Date.now() + Math.min(10 * 60 * 1000, baseInterval * 2 ** (curationFailureCount - 1));
    console.warn('[display] AI 精选失败:', error);
  } finally {
    curationLoading.value = false;
  }
}

function scheduleCuration(immediate = false): void {
  if (curationTimer !== null) window.clearInterval(curationTimer);
  if (!appSettings.value.aiCurationEnabled) return;
  const interval = Math.min(600, Math.max(20, Number(appSettings.value.aiCurationInterval) || 60));
  if (immediate) void runCuration();
  curationTimer = window.setInterval(() => void runCuration(), interval * 1000);
}

watch(
  () => [
    appSettings.value.aiCurationEnabled,
    appSettings.value.aiCurationInterval,
    appSettings.value.aiCurationEndpoint,
    appSettings.value.aiCurationModel,
    appSettings.value.aiCurationApiKey
  ],
  () => {
    curationGeneration += 1;
    curationFailureCount = 0;
    curationRetryAfter = 0;
    curationError.value = false;
    scheduleCuration(true);
  }
);

onMounted(() => {
  displayMounted = true;
  refreshCommentRecords();
  stopDisplaySubscription = subscribeDisplayDanmu(enqueueDisplayDanmu);
  if (state.displayDanmu.length) {
    displayItems.value = state.displayDanmu.slice(-DISPLAY_RENDER_LIMIT);
  }
  // 侧边栏只消费展示数据，抽奖与能量状态由弹幕主窗口唯一计算。
  startListening({ displayOnly: true });
  scheduleScrollToBottom();
  if (typeof ResizeObserver !== 'undefined' && commentListRef.value) {
    streamResizeObserver = new ResizeObserver(scheduleScrollToBottom);
    streamResizeObserver.observe(commentListRef.value);
  }
  window.addEventListener('resize', scheduleScrollToBottom);
  window.addEventListener('focus', handleWindowFocus);
  window.addEventListener('storage', handleCommentRecordStorage);
  document.addEventListener('visibilitychange', restoreStreamPosition);
  scheduleCuration(true);
  void window.electronAPI?.getDisplayAlwaysOnTop?.().then(value => {
    displayPinned.value = value;
  });
});

onBeforeUnmount(() => {
  displayMounted = false;
  curationGeneration += 1;
  stopListening();
  stopDisplaySubscription?.();
  stopDisplaySubscription = null;
  if (displayFrame !== null) window.cancelAnimationFrame(displayFrame);
  if (scrollFrame !== null) window.cancelAnimationFrame(scrollFrame);
  displayFrame = null;
  scrollFrame = null;
  streamResizeObserver?.disconnect();
  streamResizeObserver = null;
  window.removeEventListener('resize', scheduleScrollToBottom);
  window.removeEventListener('focus', handleWindowFocus);
  window.removeEventListener('storage', handleCommentRecordStorage);
  document.removeEventListener('visibilitychange', restoreStreamPosition);
  pendingDisplayItems.splice(0);
  if (curationTimer !== null) window.clearInterval(curationTimer);
  curatedExpiryTimers.forEach(timer => window.clearTimeout(timer));
  curatedExpiryTimers.clear();
  dragCleanup?.();
});
</script>

<style lang="scss" scoped>
.display-view {
  position: relative;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  color: #f5f8ff;
  background: transparent;
  font-family: 'DouyinSansBold', 'Microsoft YaHei UI', sans-serif;
}

.comment-rail {
  position: absolute;
  z-index: 3;
  inset: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid rgba(126, 150, 205, 0.16);
  border-radius: 14px;
  background:
    linear-gradient(180deg, rgba(12, 18, 33, 0.96), rgba(7, 11, 21, 0.95));
  box-shadow: 0 16px 50px rgba(0, 0, 0, 0.34), inset 0 1px rgba(255, 255, 255, 0.035);
  backdrop-filter: blur(18px);
}

.rail-header {
  min-height: 70px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  padding: 0 16px;
  border-bottom: 1px solid rgba(128, 158, 255, 0.1);
  background: rgba(255, 255, 255, 0.018);
  user-select: none;
  -webkit-app-region: drag;

  h1, p { margin: 0; }
  h1 { font-size: 18px; letter-spacing: 0.025em; }
  p { margin-top: 3px; color: #68738e; font: 11px/1.2 'Microsoft YaHei UI', sans-serif; }
}

.live-mark {
  display: grid;
  justify-items: center;
  gap: 4px;
  color: #54d8ff;
  font: 800 8px/1 sans-serif;
  letter-spacing: 0.08em;

  i {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: #36d6ff;
    box-shadow: 0 0 0 4px rgba(54, 214, 255, 0.08), 0 0 14px rgba(54, 214, 255, 0.7);
    animation: live-pulse 1.8s ease-in-out infinite;
  }
}

.comment-count {
  min-width: 32px;
  color: #aab8e0;
  font: 700 15px/1 sans-serif;
  text-align: right;
}

.rail-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  -webkit-app-region: no-drag;
}

.window-action {
  height: 29px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  box-sizing: border-box;
  color: #8997bb;
  border: 1px solid rgba(124, 151, 219, 0.2);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.025);
  font: 12px/1 'Microsoft YaHei UI', sans-serif;
  cursor: pointer;
  transition: color 0.18s, border-color 0.18s, background 0.18s;

  &:hover { color: #eaf5ff; border-color: rgba(83, 210, 255, 0.5); background: rgba(70, 159, 223, 0.14); }
}
.pin-action {
  padding: 0 9px;
  &.active { color: #68ddff; border-color: rgba(76, 216, 255, 0.5); background: rgba(48, 177, 226, 0.15); }
}
.record-history-action {
  min-width: 42px;
  padding: 0 7px;

  b { font: 800 10px/1 Arial, sans-serif; }
  &.active { color: #ffe278; border-color: rgba(255, 205, 73, 0.52); background: rgba(255, 184, 42, 0.12); }
}
.record-history-shape,
.record-empty-shape {
  width: 9px;
  height: 12px;
  box-sizing: border-box;
  border: 1.5px solid currentColor;
  clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 72%, 0 100%);
}
.pin-shape {
  position: relative;
  width: 8px;
  height: 8px;
  box-sizing: border-box;
  border: 1.5px solid currentColor;
  border-radius: 2px;
  transform: rotate(45deg) translateY(-1px);

  &::after {
    content: '';
    position: absolute;
    width: 1px;
    height: 6px;
    left: 50%;
    top: 6px;
    background: currentColor;
    transform: translateX(-50%);
  }
}
.close-action {
  width: 29px;
  padding: 0;
  font-size: 20px;
  &:hover { color: #fff; border-color: rgba(255, 105, 126, 0.56); background: rgba(225, 71, 94, 0.18); }
}

.record-panel {
  position: absolute;
  z-index: 20;
  inset: 70px 0 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  color: #edf5ff;
  background:
    radial-gradient(circle at 95% 0, rgba(84, 78, 186, 0.16), transparent 36%),
    linear-gradient(180deg, rgba(10, 16, 30, 0.985), rgba(6, 10, 19, 0.99));
  box-shadow: 0 -12px 40px rgba(0, 0, 0, 0.34);
  backdrop-filter: blur(22px);
}

.record-panel-header {
  min-height: 62px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 15px 0 18px;
  border-bottom: 1px solid rgba(120, 150, 215, 0.12);

  div { display: grid; gap: 4px; }
  span { color: #5edfff; font: 800 8px/1 Arial, sans-serif; letter-spacing: 0.18em; }
  strong { font-size: 17px; letter-spacing: 0.04em; }

  button {
    width: 30px;
    height: 30px;
    color: #8794b4;
    border: 1px solid rgba(132, 154, 207, 0.18);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.025);
    font: 21px/1 sans-serif;
    cursor: pointer;

    &:hover { color: #fff; border-color: rgba(255, 105, 126, 0.5); background: rgba(225, 71, 94, 0.16); }
  }
}

.record-list {
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 10px;
  scrollbar-width: thin;
  scrollbar-color: rgba(112, 141, 222, 0.34) transparent;
}

.record-row {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 27px;
  align-items: center;
  gap: 4px;
  margin-bottom: 5px;
  border: 1px solid rgba(124, 151, 219, 0.1);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.022);
  transition: border-color 0.18s, background 0.18s, transform 0.18s;

  &:hover {
    transform: translateX(2px);
    border-color: rgba(78, 207, 255, 0.3);
    background: linear-gradient(90deg, rgba(39, 97, 144, 0.18), rgba(75, 55, 126, 0.1));
  }
}

.record-open {
  min-width: 0;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  align-items: center;
  gap: 9px;
  padding: 9px 5px 9px 9px;
  color: inherit;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;

  > img,
  > .record-avatar-fallback {
    width: 38px;
    height: 38px;
    box-sizing: border-box;
    border: 1px solid rgba(111, 211, 255, 0.38);
    border-radius: 50%;
    object-fit: cover;
  }
}

.record-avatar-fallback {
  display: grid;
  place-items: center;
  color: #dff9ff;
  background: linear-gradient(135deg, #247a9b, #5e4eaa);
  font-size: 14px;
}

.record-copy { min-width: 0; display: grid; gap: 5px; }
.record-meta {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;

  strong { min-width: 0; flex: 1 0 100%; color: #cfeeff; font-size: 12px; line-height: 1.35; overflow-wrap: anywhere; }
  .record-level { flex: none; min-width: 17px; padding: 2px 4px; color: #ffe39a; border-radius: 5px; background: rgba(245, 173, 52, 0.14); font: 800 10px/1 Arial, sans-serif; text-align: center; }
  time { margin-left: auto; color: #596782; font: 9px/1 Arial, sans-serif; white-space: nowrap; }
}
.record-content {
  min-width: 0;
  overflow: hidden;
  color: #e9edf7;
  font: 13px/1.45 'Microsoft YaHei UI', sans-serif;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.record-delete {
  width: 24px;
  height: 24px;
  padding: 0;
  color: #596681;
  border: 0;
  border-radius: 6px;
  background: transparent;
  font: 17px/1 sans-serif;
  cursor: pointer;

  &:hover { color: #ff9aac; background: rgba(218, 69, 91, 0.13); }
}

.record-empty {
  height: 100%;
  min-height: 260px;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 9px;
  color: #66738f;
  text-align: center;

  .record-empty-shape { width: 22px; height: 29px; color: #546383; margin-bottom: 3px; }
  strong { color: #8996b2; font-size: 14px; }
  small { max-width: 240px; font: 11px/1.6 'Microsoft YaHei UI', sans-serif; }
}

.record-panel-footer {
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 14px 0 18px;
  border-top: 1px solid rgba(120, 150, 215, 0.1);
  color: #5d6b87;
  font: 10px/1 'Microsoft YaHei UI', sans-serif;

  > span { min-width: 0; display: grid; gap: 5px; white-space: nowrap; }
  em { overflow: hidden; color: #68d9b8; font-style: normal; text-overflow: ellipsis; }

  button {
    padding: 6px 9px;
    border-radius: 7px;
    font: inherit;
    cursor: pointer;
    transition: color 0.18s, border-color 0.18s, background 0.18s;

    &:disabled { opacity: 0.55; cursor: wait; }
  }

  .record-export {
    min-width: 64px;
    color: #72dff8;
    border: 1px solid rgba(73, 205, 239, 0.25);
    background: rgba(43, 176, 214, 0.08);

    &:hover:not(:disabled) { color: #dffbff; border-color: rgba(78, 222, 255, 0.52); background: rgba(43, 176, 214, 0.17); }
  }

  .record-export-secondary {
    min-width: 42px;
    color: #8d9ab5;
    border-color: rgba(128, 147, 188, 0.18);
    background: rgba(77, 93, 129, 0.08);

    &:hover:not(:disabled) { color: #dbe4fa; border-color: rgba(151, 174, 226, 0.38); background: rgba(77, 93, 129, 0.16); }
  }

  .record-clear {
    color: #a77880;
    border: 1px solid rgba(206, 86, 105, 0.16);
    background: rgba(185, 51, 72, 0.055);

    &:hover { color: #ff9bac; border-color: rgba(231, 92, 115, 0.38); background: rgba(185, 51, 72, 0.14); }
  }
}

.record-footer-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.record-panel-enter-active,
.record-panel-leave-active { transition: opacity 0.18s ease, transform 0.18s ease; }
.record-panel-enter-from,
.record-panel-leave-to { opacity: 0; transform: translateY(-8px); }

.comment-stream {
  box-sizing: border-box;
  width: 100%;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overflow-anchor: none;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  padding: 8px 9px 20px;
  scrollbar-width: thin;
  scrollbar-color: rgba(112, 141, 222, 0.34) transparent;
  will-change: scroll-position;
}

.comment-list {
  min-width: 0;
}

.comment-card {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: 11px;
  margin-bottom: 3px;
  padding: 11px 10px;
  color: inherit;
  border: 0;
  border-left: 2px solid transparent;
  border-radius: 9px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  content-visibility: auto;
  contain-intrinsic-size: auto 70px;
  animation: feed-arrive 0.18s ease-out both;
  transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;

  &:hover {
    z-index: 1;
    transform: translateX(2px);
    border-left-color: rgba(83, 205, 255, 0.72);
    background: linear-gradient(90deg, rgba(42, 82, 135, 0.25), rgba(25, 36, 57, 0.16));
  }
}

.comment-card.comment-tier-white {
  border-left-color: rgba(255, 255, 255, 0.18);

  .comment-avatar { border-color: rgba(255, 255, 255, 0.42); }
  .comment-meta strong { color: #fff; text-shadow: 0 0 7px rgba(255, 255, 255, 0.16); }
}

.comment-card.comment-tier-orange {
  position: relative;
  overflow: hidden;
  border-left-color: #ffe27d;
  background: linear-gradient(100deg, rgba(104, 88, 27, 0.25), rgba(42, 39, 25, 0.18) 68%, transparent);
  box-shadow: inset 0 0 18px rgba(255, 226, 125, 0.035);

  &::after {
    content: '';
    position: absolute;
    inset: 0 auto 0 -30%;
    width: 18%;
    pointer-events: none;
    transform: skewX(-18deg);
    background: linear-gradient(90deg, transparent, rgba(255, 241, 171, 0.16), transparent);
    animation: commentOrangeSweep 4.2s ease-in-out infinite;
  }

  .comment-avatar { border-color: #ffe58c; box-shadow: 0 0 8px rgba(255, 227, 130, 0.25); }
  .comment-meta strong { color: #fff0a6; text-shadow: 0 0 7px rgba(255, 226, 123, 0.2); }
  .comment-level-mark {
    color: #fff6c9;
    b { text-shadow: 0 0 4px #fffbea, 0 0 9px rgba(255, 226, 112, 0.52); }
  }
}

.comment-card.comment-tier-purple {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(190, 91, 255, 0.38);
  border-left: 3px solid #bd5dff;
  background:
    radial-gradient(circle at 6% 50%, rgba(219, 111, 255, 0.15), transparent 24%),
    linear-gradient(105deg, rgba(71, 25, 99, 0.44), rgba(85, 33, 117, 0.3) 55%, rgba(47, 21, 78, 0.26));
  box-shadow: 0 0 17px rgba(175, 72, 255, 0.17), inset 0 0 20px rgba(192, 87, 255, 0.1);

  &::before {
    content: '';
    position: absolute;
    inset: 0 auto 0 -26%;
    width: 20%;
    pointer-events: none;
    transform: skewX(-18deg);
    background: linear-gradient(90deg, transparent, rgba(233, 185, 255, 0.26), transparent);
    animation: commentPurpleSweep 2.05s ease-in-out infinite;
  }
  &::after {
    content: '✦';
    position: absolute;
    right: 12px;
    bottom: 5px;
    color: rgba(222, 142, 255, 0.42);
    font-size: 20px;
    pointer-events: none;
    text-shadow: 0 0 9px #c15cff, -18px -29px 0 rgba(224, 126, 255, 0.25);
    animation: commentPurpleStarPulse 1.1s ease-in-out infinite alternate;
  }

  .comment-avatar {
    border: 2px solid #d07bff;
    box-shadow: 0 0 6px rgba(255, 255, 255, 0.7), 0 0 13px #b34cff, 0 0 20px rgba(118, 44, 204, 0.45);
  }
  .comment-meta strong { color: #e4b2ff; text-shadow: 0 0 9px rgba(190, 75, 255, 0.66); }
  .comment-content { text-shadow: 0 0 8px rgba(198, 104, 255, 0.3); }
  .comment-level-mark {
    color: #edc7ff;
    b { text-shadow: 0 0 4px #fff, 0 0 11px #cf61ff, 0 0 18px rgba(139, 42, 231, 0.7); }
  }
}

.comment-card.comment-tier-red {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(255, 69, 89, 0.52);
  border-left: 3px solid #ff3c55;
  background:
    radial-gradient(circle at 7% 50%, rgba(255, 161, 60, 0.17), transparent 25%),
    linear-gradient(105deg, rgba(113, 13, 31, 0.5), rgba(69, 9, 27, 0.36) 57%, rgba(105, 15, 20, 0.3));
  box-shadow: 0 0 19px rgba(255, 44, 69, 0.2), inset 0 0 22px rgba(255, 69, 50, 0.12);

  &::before {
    content: '';
    position: absolute;
    inset: 0 auto 0 -32%;
    width: 25%;
    pointer-events: none;
    transform: skewX(-20deg);
    background: linear-gradient(90deg, transparent, rgba(255, 240, 199, 0.38), rgba(255, 82, 74, 0.2), transparent);
    animation: commentRedSweep 1.55s ease-in-out infinite;
  }

  &::after {
    content: '✶';
    position: absolute;
    right: 12px;
    bottom: 4px;
    color: rgba(255, 169, 86, 0.52);
    font-size: 22px;
    pointer-events: none;
    text-shadow: 0 0 8px #ff394f, -19px -30px 0 rgba(255, 104, 81, 0.3);
    animation: commentRedStarPulse 0.78s ease-in-out infinite alternate;
  }

  .comment-avatar {
    border: 2px solid #ff5b70;
    box-shadow: 0 0 5px rgba(255, 244, 218, 0.86), 0 0 13px #ff304b, 0 0 21px rgba(255, 104, 39, 0.5);
  }
  .comment-meta strong { color: #ff8795; text-shadow: 0 0 5px rgba(255, 232, 218, 0.6), 0 0 10px rgba(255, 47, 70, 0.72); }
  .comment-content { text-shadow: 0 0 9px rgba(255, 86, 80, 0.38); }
  .comment-level-mark {
    color: #fff8e8;
    b { text-shadow: 0 0 4px #fff3ce, 0 0 12px #ff6544, 0 0 20px rgba(255, 30, 61, 0.8); }
  }
}

.comment-level-mark {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  white-space: nowrap;

  b {
    color: inherit;
    font: 400 26px/1 'PangMenZhengDaoCuShuTi', 'Arial Black', sans-serif;
    text-shadow: 0 0 4px rgba(255, 255, 255, 0.78), 0 0 9px rgba(138, 158, 205, 0.48);
  }
}

@keyframes commentOrangeSweep {
  0%, 28% { left: -30%; opacity: 0; }
  45% { opacity: 1; }
  76%, 100% { left: 115%; opacity: 0; }
}

@keyframes commentPurpleSweep {
  0%, 18% { left: -26%; opacity: 0; }
  42% { opacity: 1; }
  78%, 100% { left: 116%; opacity: 0; }
}

@keyframes commentPurpleStarPulse {
  to { opacity: 0.35; transform: scale(1.18) rotate(12deg); }
}

@keyframes commentRedSweep {
  0%, 10% { left: -32%; opacity: 0; }
  38% { opacity: 1; }
  72%, 100% { left: 118%; opacity: 0; }
}

@keyframes commentRedStarPulse {
  to { opacity: 0.28; transform: scale(1.22) rotate(14deg); filter: brightness(1.5); }
}

.return-latest {
  position: sticky;
  z-index: 8;
  bottom: 8px;
  width: max-content;
  max-width: calc(100% - 24px);
  min-height: 38px;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px auto 0;
  padding: 0 15px;
  color: #eafaff;
  border: 1px solid rgba(86, 211, 255, 0.5);
  border-radius: 999px;
  background: rgba(17, 42, 72, 0.94);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.42), 0 0 18px rgba(64, 201, 255, 0.12);
  cursor: pointer;
  backdrop-filter: blur(12px);

  span {
    color: #8ca4ca;
    font: 12px/1 'Microsoft YaHei UI', sans-serif;
  }

  strong {
    color: #6de0ff;
    font: 700 13px/1 'Microsoft YaHei UI', sans-serif;
  }

  &:hover {
    border-color: rgba(108, 224, 255, 0.8);
    background: rgba(23, 56, 92, 0.98);
  }
}

.comment-avatar,
.avatar-fallback {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  object-fit: cover;
  box-sizing: border-box;
  border: 1.5px solid rgba(75, 200, 247, 0.55);
}

.avatar-fallback,
.curated-avatar-fallback,
.highlight-avatar-fallback {
  display: grid;
  place-items: center;
  color: #dff8ff;
  background: linear-gradient(135deg, #3556a5, #1582a7);
  font-weight: 800;
}

.comment-body { min-width: 0; display: grid; align-content: start; gap: 3px; }
.comment-meta {
  display: flex;
  align-items: center;
  gap: 7px;

  strong {
    flex: 1 1 auto;
    min-width: 0;
    color: #fff;
    font-size: 15px;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }
  time { flex: 0 0 auto; color: #576486; font: 11px/1 sans-serif; }
}

.comment-content {
  display: block;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  color: #f1f5ff;
  font: 17px/1.5 'Microsoft YaHei UI', sans-serif;
  overflow-wrap: anywhere;
  word-break: break-word;

  :deep(*) { max-width: 100%; }
}

.empty-stream {
  height: 100%;
  min-height: 180px;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 7px;
  color: #596685;
  span { font-size: 32px; }
  strong { color: #8490ae; font-size: 15px; }
  small { font: 12px/1 sans-serif; }
}

.curated-float-stack {
  position: absolute;
  z-index: 12;
  left: 12px;
  right: 12px;
  bottom: 14px;
  display: grid;
  gap: 9px;
  pointer-events: none;
}

.curated-float-card {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: 20px 42px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 12px 13px 12px 10px;
  color: #fff;
  border: 1px solid rgba(255, 207, 92, 0.35);
  border-radius: 14px;
  background:
    linear-gradient(110deg, rgba(43, 42, 31, 0.98), rgba(14, 24, 43, 0.98) 44%, rgba(12, 20, 35, 0.98));
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.46), 0 0 0 3px rgba(255, 207, 92, 0.045);
  text-align: left;
  cursor: pointer;
  pointer-events: auto;
  transition: border-color 0.18s, transform 0.18s, box-shadow 0.18s;

  &:hover {
    transform: translateY(-3px);
    border-color: rgba(255, 218, 119, 0.72);
    box-shadow: 0 18px 42px rgba(0, 0, 0, 0.54), 0 0 22px rgba(255, 205, 85, 0.09);
  }
  img, .curated-avatar-fallback { width: 42px; height: 42px; border-radius: 50%; object-fit: cover; }
}

.float-spark {
  color: #ffd66c;
  font-size: 19px;
  text-align: center;
  filter: drop-shadow(0 0 8px rgba(255, 207, 75, 0.42));
}

.float-copy {
  min-width: 0;
  display: grid;
  gap: 4px;

  strong { color: #72d9f5; font-size: 13px; line-height: 1.3; overflow-wrap: anywhere; }
  em {
    overflow: hidden;
    color: #f4f6fb;
    font: normal 15px/1.4 'Microsoft YaHei UI', sans-serif;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow-wrap: anywhere;
  }
}

.highlight-card {
  position: absolute;
  z-index: 20;
  width: min(680px, calc(100vw - 520px));
  min-width: 430px;
  min-height: 250px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 32px);
  overflow: auto;
  resize: both;
  border: 1px solid rgba(91, 216, 255, 0.72);
  border-radius: 24px;
  background:
    linear-gradient(140deg, rgba(18, 31, 72, 0.98), rgba(7, 14, 34, 0.99));
  box-shadow:
    0 30px 100px rgba(0, 0, 0, 0.62),
    0 0 0 6px rgba(53, 196, 255, 0.08),
    inset 0 1px rgba(255, 255, 255, 0.08);
}

.highlight-handle {
  height: 58px;
  box-sizing: border-box;
  padding: 0 16px 0 22px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #7cddff;
  border-bottom: 1px solid rgba(92, 202, 255, 0.2);
  background: linear-gradient(90deg, rgba(54, 101, 198, 0.22), transparent);
  cursor: move;
  user-select: none;

  span { display: flex; align-items: center; gap: 10px; font-size: 13px; letter-spacing: 0.1em; }
  i { width: 8px; height: 8px; border-radius: 50%; background: #4ce2ff; box-shadow: 0 0 14px #4ce2ff; }
  button {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    color: #d8e4ff;
    border: 1px solid rgba(145, 173, 231, 0.24);
    border-radius: 11px;
    background: rgba(255, 255, 255, 0.06);
    font: 24px/1 sans-serif;
    cursor: pointer;
    &:hover { color: #fff; border-color: #5ad8ff; background: rgba(80, 183, 239, 0.16); }
  }
}

.highlight-content {
  min-height: 160px;
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  align-items: center;
  gap: 24px;
  padding: 32px 36px 20px;

  > img, > .highlight-avatar-fallback {
    width: 92px;
    height: 92px;
    border-radius: 50%;
    object-fit: cover;
    border: 3px solid #54d8ff;
    box-shadow: 0 0 0 7px rgba(84, 216, 255, 0.09), 0 12px 30px rgba(0, 0, 0, 0.35);
  }
  > div { min-width: 0; }
  strong { color: #72dfff; font-size: 22px; line-height: 1.3; overflow-wrap: anywhere; }
  p {
    margin: 12px 0 18px;
    color: #fff;
    font: 700 clamp(26px, 2.3vw, 38px)/1.42 'Microsoft YaHei UI', sans-serif;
    word-break: break-word;
    text-shadow: 0 4px 24px rgba(0, 0, 0, 0.34);
  }
  time { color: #657698; font: 11px/1 sans-serif; letter-spacing: 0.1em; }
}

.resize-tip {
  display: block;
  padding: 0 22px 14px;
  color: #4d5c7a;
  font: 10px/1 sans-serif;
  text-align: right;
}

.curated-float-enter-active,
.curated-float-leave-active { transition: opacity 0.32s ease, transform 0.32s cubic-bezier(0.22, 1, 0.36, 1); }
.curated-float-enter-from { opacity: 0; transform: translateY(28px) scale(0.96); }
.curated-float-leave-to { opacity: 0; transform: translateX(30px) scale(0.97); }
.highlight-pop-enter-active, .highlight-pop-leave-active { transition: opacity 0.22s ease, transform 0.22s ease; }
.highlight-pop-enter-from, .highlight-pop-leave-to { opacity: 0; transform: scale(0.94); }

@keyframes live-pulse { 50% { opacity: 0.45; transform: scale(0.82); } }
@keyframes feed-arrive {
  from { opacity: 0; transform: translateX(18px); }
  to { opacity: 1; transform: translateX(0); }
}

@media (max-width: 1250px) {
  .highlight-card { width: min(610px, calc(100vw - 440px)); min-width: 390px; }
  .highlight-content { grid-template-columns: 74px minmax(0, 1fr); padding-inline: 26px; }
  .highlight-content > img,
  .highlight-content > .highlight-avatar-fallback { width: 74px; height: 74px; }
}

@media (max-width: 430px) {
  .rail-header { padding-inline: 13px; gap: 9px; }
  .rail-header p { display: none; }
  .pin-action { width: 31px; padding: 0; font-size: 0; }
  .comment-rail { border-radius: 12px; }
}

.comment-meta strong,
.record-meta strong,
.float-copy strong,
.highlight-card strong {
  font-family: 'LXGW WenKai', 'Microsoft YaHei UI', sans-serif;
  font-weight: 700;
}

.comment-card.comment-tier-red {
  .comment-meta strong,
  .comment-content {
    color: #ff5360;
    text-shadow: 0 1px 2px rgba(40, 0, 5, .96), 0 0 7px #ff283c, 0 0 14px rgba(255, 48, 52, .58);
  }
}

.window-resize-handle {
  position: absolute;
  z-index: 80;
  left: 0;
  bottom: 0;
  width: 28px;
  height: 28px;
  cursor: nesw-resize;
  touch-action: none;
  -webkit-app-region: no-drag;

  &::after {
    content: '';
    position: absolute;
    left: 6px;
    bottom: 6px;
    width: 10px;
    height: 10px;
    border-left: 2px solid rgba(104, 221, 255, .58);
    border-bottom: 2px solid rgba(104, 221, 255, .58);
  }
}
</style>
