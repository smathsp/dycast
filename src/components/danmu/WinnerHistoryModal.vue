<template>
  <Teleport to="body">
    <Transition name="winner-panel">
      <div
        v-if="visible"
        class="winner-host"
        role="dialog"
        aria-modal="true"
        aria-labelledby="winner-history-title"
        @click.self="emit('close')"
      >
        <section class="winner-shell">
          <div class="shell-decoration" aria-hidden="true"></div>

          <header class="shell-header">
            <div class="header-brand">
              <div class="brand-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M8 4h8v3.5c0 3.2-1.7 5.5-4 5.5s-4-2.3-4-5.5V4Z" />
                  <path d="M8 6H5.5v1.3c0 2.2 1.1 3.7 3.2 4.2M16 6h2.5v1.3c0 2.2-1.1 3.7-3.2 4.2M12 13v3.5M8.5 20h7M10 16.5h4V20h-4v-3.5Z" />
                </svg>
              </div>
              <div class="title-group">
                <div class="title-line">
                  <h2 id="winner-history-title">Happy 记录</h2>
                  <span>{{ winners.length }} 人</span>
                </div>
                <p>按批次查看和管理每一次 Happy 时刻</p>
              </div>
            </div>

            <button class="close-button" type="button" aria-label="关闭 Happy 记录" @click="emit('close')">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="m7 7 10 10M17 7 7 17" />
              </svg>
            </button>
          </header>

          <section class="summary-strip" aria-label="Happy 统计">
            <div class="summary-card summary-primary">
              <span>累计 Happy</span>
              <strong>{{ winners.length }}</strong>
              <small>HAPPY</small>
            </div>
            <div class="summary-card">
              <span>Happy 批次</span>
              <strong>{{ drawNo }}</strong>
              <small>BATCHES</small>
            </div>
            <div class="summary-card summary-latest">
              <span>最近 Happy</span>
              <strong>{{ latestTime }}</strong>
              <small>{{ latestDate }}</small>
            </div>
          </section>

          <div class="toolbar">
            <label class="search-field">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="10.8" cy="10.8" r="6.3" />
                <path d="m15.5 15.5 4 4" />
              </svg>
              <input
                v-model.trim="keyword"
                type="search"
                aria-label="搜索 Happy 记录"
                placeholder="搜索昵称或弹幕"
              />
              <button v-if="keyword" type="button" aria-label="清除搜索" @click="keyword = ''">×</button>
            </label>

            <div class="toolbar-actions">
              <span v-if="keyword" class="result-count">找到 {{ filteredWinners.length }} 条</span>
              <span v-else-if="exportTip" class="export-tip" :class="exportTipType">{{ exportTip }}</span>
              <button class="sort-button" type="button" @click="isNewestFirst = !isNewestFirst">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M8 6h11M8 12h8M8 18h5M4 5v14m0 0-2.2-2.3M4 19l2.2-2.3" />
                </svg>
                {{ isNewestFirst ? '末号优先' : '1号优先' }}
              </button>
              <button
                class="export-button"
                type="button"
                :disabled="filteredWinners.length === 0 || exportingExcel"
                @click="exportWinnersExcel"
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 3.5h9l3 3V20.5H6v-17Z" />
                  <path d="M15 3.5v3h3M9 10.5h6M9 14h6M9 17.5h6" />
                </svg>
                {{ exportingExcel ? '导出中…' : keyword ? '导出筛选 Excel' : '导出 Excel' }}
              </button>
              <button
                class="clear-button"
                type="button"
                :disabled="winners.length === 0"
                @click="emit('clear')"
              >
                清空记录
              </button>
            </div>
          </div>

          <main class="history-content">
            <div v-if="filteredWinners.length" class="happy-batches">
              <section v-for="batch in visibleFilteredBatches" :key="batch.batchKey" class="happy-batch">
                <header class="batch-header">
                  <div>
                    <strong>HAPPY BATCH {{ batch.drawNo || '—' }}</strong>
                    <span>{{ batch.items.length }} 人</span>
                  </div>
                  <div class="batch-actions">
                    <time :datetime="new Date(batch.wonAt).toISOString()">{{ formatCardTimestamp(batch.wonAt) }}</time>
                    <button
                      class="batch-export-button"
                      type="button"
                      :disabled="exporting"
                      @click="queueWinnerExport({ batchKey: batch.batchKey })"
                    >{{ exporting ? '生成中…' : '导出本批 PNG' }}</button>
                  </div>
                </header>
                <div
                  class="winner-list"
                  :class="{ 'winner-list-many': batch.items.length > 12 }"
                  :style="{ '--winner-columns': String(getWinnerGridColumns(batch.items.length)) }"
                >
                  <article
                    v-for="(item, index) in batch.items"
                    :key="item.recordKey"
                    class="winner-card"
                    :style="{ '--entry-delay': `${Math.min(index * 28, 280)}ms` }"
                  >
                    <div class="winner-number" :aria-label="`本批次第 ${item.drawNumber} 位 Happy`">
                      <strong>{{ item.drawNumber }}</strong>
                    </div>

                    <div class="winner-avatar">
                      <span>{{ getInitial(item.winner.nickname) }}</span>
                      <img
                        v-if="item.winner.avatar"
                        :src="item.winner.avatar"
                        alt=""
                        loading="lazy"
                        decoding="async"
                        @error="handleAvatarError"
                      />
                    </div>

                    <div class="winner-info">
                      <div class="winner-heading">
                        <strong :title="item.winner.nickname">{{ item.winner.nickname || '神秘观众' }}</strong>
                      </div>
                      <p :title="item.winner.content || '未留下弹幕内容'">
                        <InlineEmojiText :content="item.winner.content || '未留下弹幕内容'" :emoji-url="item.winner.emojiUrl" />
                      </p>
                      <div class="winner-meta">
                        <time :datetime="new Date(item.wonAt).toISOString()">
                          HAPPY TIME · {{ formatCardTimestamp(item.wonAt) }}
                        </time>
                      </div>
                    </div>

                    <button
                      class="delete-button"
                      type="button"
                      :aria-label="`删除 ${item.winner.nickname} 的 Happy 记录`"
                      title="删除此条记录"
                      @click="emit('delete', item.deleteKey)"
                    >
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M4.5 7h15M9 4h6l1 3H8l1-3ZM7 7l.7 13h8.6L17 7M10 10.5v6M14 10.5v6" />
                      </svg>
                    </button>
                  </article>
                </div>
              </section>
              <button v-if="hasMoreFilteredWinners" class="load-more-button" type="button" @click="showMoreWinners">
                再显示 {{ Math.min(WINNER_PAGE_SIZE, filteredWinners.length - visibleWinnerLimit) }} 条
              </button>
            </div>

            <div v-else-if="winners.length === 0" class="empty-state">
              <div class="empty-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M8 4h8v3.5c0 3.2-1.7 5.5-4 5.5s-4-2.3-4-5.5V4Z" />
                  <path d="M8 6H5.5v1.3c0 2.2 1.1 3.7 3.2 4.2M16 6h2.5v1.3c0 2.2-1.1 3.7-3.2 4.2M12 13v3.5M8.5 20h7M10 16.5h4V20h-4v-3.5Z" />
                </svg>
              </div>
              <strong>Happy 正在路上</strong>
              <span>完成 Happy 后，记录会按批次保存在这里</span>
            </div>

            <div v-else class="empty-state empty-search">
              <div class="empty-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <circle cx="10.8" cy="10.8" r="6.3" />
                  <path d="m15.5 15.5 4 4" />
                </svg>
              </div>
              <strong>没有找到相关记录</strong>
              <span>换个昵称或弹幕关键词试试</span>
              <button type="button" @click="keyword = ''">清除搜索</button>
            </div>
          </main>

        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch, ref } from 'vue';
import type { Danmu } from '@/danmu/types';
import InlineEmojiText from '@/components/InlineEmojiText.vue';
import { parseDouyinEmojiContent } from '@/utils/emojiUtil';
import { getCachedNumericUserId, userIdCacheReady } from '@/danmu/store';
import { getCurrentAnchorBadgeLevel } from '@/danmu/lottery';
import { createExportTimestamp, exportExcel } from '@/utils/excelExportUtil';
import { lockBodyScroll } from '@/utils/bodyScrollLock';

interface WinnerItem {
  winner: Danmu;
  recordKey: string;
  deleteKey: string;
  drawNumber: number;
  wonAt: number;
}

interface HappyBatch {
  batchKey: string;
  drawNo: number;
  wonAt: number;
  items: WinnerItem[];
}

const props = withDefaults(
  defineProps<{
    visible: boolean;
    winners: Danmu[];
    drawNo?: number;
  }>(),
  { drawNo: 0 }
);

const emit = defineEmits<{
  close: [];
  clear: [];
  delete: [recordKey: string];
}>();

const keyword = ref('');
const isNewestFirst = ref(false);
const exporting = ref(false);
const exportingExcel = ref(false);
const exportTip = ref('');
const exportTipType = ref<'success' | 'error'>('success');
const WINNER_PAGE_SIZE = 120;
const visibleWinnerLimit = ref(WINNER_PAGE_SIZE);
const AUTO_EXPORT_EVENT = 'dycast-auto-export-winner-png';
const PNG_READY_EVENT = 'dycast-winner-png-ready';

interface WinnerExportOptions {
  batchId?: string;
  batchKey?: string;
  showPreview?: boolean;
}

let exportQueue = Promise.resolve();

const winnerItems = computed<WinnerItem[]>(() => {
  return props.winners.map((winner, index) => ({
    winner,
    recordKey: winner.winRecordId || `${winner.id}-${index}`,
    deleteKey: winner.winRecordId || winner.id,
    drawNumber: winner.batchPosition || 1,
    wonAt: winner.wonAt || winner.timestamp || Date.now()
  }));
});

const winnerBatches = computed<HappyBatch[]>(() => {
  const groups = new Map<string, HappyBatch>();
  winnerItems.value.forEach(item => {
    const winner = item.winner;
    const batchKey = winner.batchId || (winner.drawNo ? `draw:${winner.drawNo}` : `legacy:${item.recordKey}`);
    const existing = groups.get(batchKey) || {
      batchKey,
      drawNo: winner.drawNo || 0,
      wonAt: item.wonAt,
      items: []
    };
    existing.items.push(item);
    existing.wonAt = Math.min(existing.wonAt, item.wonAt);
    groups.set(batchKey, existing);
  });

  return Array.from(groups.values())
    .map(batch => ({
      ...batch,
      items: batch.items
        .sort((a, b) => ((a.winner.batchPosition || 0) - (b.winner.batchPosition || 0)) || (a.wonAt - b.wonAt))
        .map((item, index) => ({ ...item, drawNumber: index + 1 }))
    }))
    .sort((a, b) => (b.drawNo - a.drawNo) || (b.wonAt - a.wonAt));
});

const filteredBatches = computed<HappyBatch[]>(() => {
  const query = keyword.value.toLocaleLowerCase('zh-CN');
  const direction = isNewestFirst.value ? -1 : 1;
  return winnerBatches.value
    .map(batch => ({
      ...batch,
      items: batch.items
        .filter(({ winner }) => !query || `${winner.nickname} ${winner.content}`.toLocaleLowerCase('zh-CN').includes(query))
        .sort((a, b) => (a.drawNumber - b.drawNumber) * direction)
    }))
    .filter(batch => batch.items.length > 0);
});

const filteredWinners = computed(() => filteredBatches.value.flatMap(batch => batch.items));
const visibleFilteredBatches = computed(() => {
  let remaining = visibleWinnerLimit.value;
  return filteredBatches.value.flatMap(batch => {
    if (remaining <= 0) return [];
    const items = batch.items.slice(0, remaining);
    remaining -= items.length;
    return items.length ? [{ ...batch, items }] : [];
  });
});
const hasMoreFilteredWinners = computed(() => filteredWinners.value.length > visibleWinnerLimit.value);

function showMoreWinners(): void {
  visibleWinnerLimit.value += WINNER_PAGE_SIZE;
}

function getWinnerGridColumns(count: number): number {
  if (count > 12) return 4;
  return Math.min(Math.max(count, 1), 3);
}

const latestWinner = computed(() => {
  return winnerItems.value.reduce<WinnerItem | null>((latest, item) => {
    return !latest || item.wonAt > latest.wonAt ? item : latest;
  }, null);
});

const latestTime = computed(() => latestWinner.value ? formatCardTime(latestWinner.value.wonAt) : '--:--');
const latestDate = computed(() => latestWinner.value ? formatCardDate(latestWinner.value.wonAt) : '暂无记录');

let releaseBodyScroll: (() => void) | null = null;
watch(() => props.visible, (visible) => {
  if (visible) {
    releaseBodyScroll ??= lockBodyScroll();
    visibleWinnerLimit.value = WINNER_PAGE_SIZE;
  } else {
    releaseBodyScroll?.();
    releaseBodyScroll = null;
    keyword.value = '';
  }
});

watch([keyword, isNewestFirst], () => { visibleWinnerLimit.value = WINNER_PAGE_SIZE; });

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && props.visible) emit('close');
}

window.addEventListener('keydown', handleKeydown);
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener(AUTO_EXPORT_EVENT, handleAutoExport as EventListener);
  releaseBodyScroll?.();
  releaseBodyScroll = null;
});

function handleAutoExport(event: CustomEvent<{ batchId?: string }>): void {
  queueWinnerExport({ batchId: event.detail?.batchId, showPreview: true });
}

onMounted(() => {
  window.addEventListener(AUTO_EXPORT_EVENT, handleAutoExport as EventListener);
});

function getInitial(nickname: string): string {
  return nickname?.trim().slice(0, 1).toUpperCase() || '?';
}

function formatCardTime(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(new Date(timestamp));
}

function formatCardTimestamp(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).format(new Date(timestamp)).replace(/\//g, '.');
}

function formatCardDate(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit'
  }).format(new Date(timestamp)).replace(/\//g, '.');
}

function handleAvatarError(event: Event): void {
  (event.target as HTMLImageElement).style.display = 'none';
}

function getNumericUserId(winner: Danmu): string {
  // 仅接受新版本从协议 display_id 保存的纯数字抖音号；旧数据字段来源不明，不能继续导出。
  const value = winner.userIdVerified && winner.userIdSource === 'displayId'
    ? winner.userId?.trim()
    : getCachedNumericUserId(winner.secUid);
  return value && /^\d+$/.test(value) ? value : '未记录';
}

async function exportWinnersExcel(): Promise<void> {
  if (!filteredWinners.value.length || exportingExcel.value) return;
  exportingExcel.value = true;
  exportTip.value = '正在整理中奖记录…';
  exportTipType.value = 'success';
  try {
    await userIdCacheReady;
    let sequence = 0;
    const rows = filteredBatches.value.flatMap(batch => batch.items.map(item => {
      sequence += 1;
      const winner = item.winner;
      const badgeLevel = getCurrentAnchorBadgeLevel(winner);
      return [
        sequence,
        batch.drawNo || '旧记录',
        item.drawNumber,
        winner.batchSize || batch.items.length,
        winner.nickname || '神秘观众',
        getNumericUserId(winner),
        badgeLevel > 0 ? badgeLevel : '无灯牌',
        winner.content || '未留下弹幕内容',
        formatCardTimestamp(item.wonAt)
      ];
    }));
    const result = await exportExcel({
      fileName: `中奖记录_${createExportTimestamp()}_${rows.length}人`,
      sheetName: '中奖记录',
      dialogTitle: '导出中奖记录 Excel',
      columns: [
        { header: '序号', width: 9 },
        { header: '抽奖批次', width: 12 },
        { header: '批次内序号', width: 12 },
        { header: '本批人数', width: 10 },
        { header: '昵称', width: 22 },
        { header: '抖音号', width: 20 },
        { header: '灯牌等级', width: 12 },
        { header: '中奖弹幕', width: 42 },
        { header: '中奖时间', width: 22 }
      ],
      rows
    });
    exportTip.value = result.success ? `已导出 ${rows.length} 条中奖记录` : result.canceled ? '已取消导出' : '导出失败';
    exportTipType.value = result.success || result.canceled ? 'success' : 'error';
  } catch (error) {
    exportTip.value = `Excel 导出失败：${(error as Error).message}`;
    exportTipType.value = 'error';
  } finally {
    exportingExcel.value = false;
  }
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

interface ExportContentToken {
  type: 'text' | 'emoji';
  text: string;
  width: number;
  image?: HTMLImageElement;
}

type ExportContentLine = ExportContentToken[];

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('头像解码失败'));
    image.src = source;
  });
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('头像读取失败'));
    reader.readAsDataURL(blob);
  });
}

async function loadAvatarForExport(url: string): Promise<HTMLImageElement | null> {
  if (!url) return null;
  try {
    const source = window.electronAPI?.fetchImageDataUrl
      ? await window.electronAPI.fetchImageDataUrl(url)
      : await fetch(url, { mode: 'cors' }).then(async response => {
          if (!response.ok) throw new Error(`头像读取失败：${response.status}`);
          return blobToDataUrl(await response.blob());
        });
    return await loadImage(source);
  } catch {
    return null;
  }
}

async function loadAllAvatars(items: WinnerItem[]): Promise<Array<HTMLImageElement | null>> {
  const results: Array<HTMLImageElement | null> = new Array(items.length).fill(null);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await loadAvatarForExport(items[index].winner.avatar);
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, items.length) }, worker));
  return results;
}

function getWinnerEmojiSegments(winner: Danmu) {
  if (winner.emojiUrl) {
    return [{ type: 'emoji' as const, text: winner.content || '会员表情', url: winner.emojiUrl }];
  }
  const content = winner.content?.trim() || '未留下弹幕内容';
  return parseDouyinEmojiContent(content);
}

async function loadAllWinnerEmojis(items: WinnerItem[]): Promise<Map<string, HTMLImageElement>> {
  const urls = Array.from(new Set(items.flatMap(item =>
    getWinnerEmojiSegments(item.winner)
      .filter(segment => segment.type === 'emoji' && segment.url)
      .map(segment => segment.url!)
  )));
  const images = new Map<string, HTMLImageElement>();
  let cursor = 0;
  const worker = async () => {
    while (cursor < urls.length) {
      const url = urls[cursor++];
      const image = await loadAvatarForExport(url);
      if (image) images.set(url, image);
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, urls.length) }, worker));
  return images;
}

function wrapExportContent(
  context: CanvasRenderingContext2D,
  winner: Danmu,
  emojiImages: Map<string, HTMLImageElement>,
  maxWidth: number
): ExportContentLine[] {
  const tokens: ExportContentToken[] = [];
  for (const segment of getWinnerEmojiSegments(winner)) {
    if (segment.type === 'emoji' && segment.url && emojiImages.has(segment.url)) {
      tokens.push({ type: 'emoji', text: segment.text, image: emojiImages.get(segment.url), width: 28 });
      continue;
    }
    for (const character of Array.from(segment.text)) {
      tokens.push({ type: 'text', text: character, width: context.measureText(character).width });
    }
  }

  const lines: ExportContentLine[] = [];
  let line: ExportContentLine = [];
  let lineWidth = 0;
  for (const token of tokens) {
    if (line.length && lineWidth + token.width > maxWidth) {
      lines.push(line);
      line = [];
      lineWidth = 0;
    }
    line.push(token);
    lineWidth += token.width;
  }
  if (line.length) lines.push(line);
  return lines.length ? lines : [[{ type: 'text', text: '未留下弹幕内容', width: context.measureText('未留下弹幕内容').width }]];
}

function drawAvatar(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  nickname: string,
  centerX: number,
  centerY: number,
  size: number
): void {
  const radius = size / 2;
  context.save();
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.clip();
  if (image) {
    const scale = Math.max(size / image.naturalWidth, size / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.drawImage(image, centerX - width / 2, centerY - height / 2, width, height);
  } else {
    const fallback = context.createLinearGradient(centerX - radius, centerY - radius, centerX + radius, centerY + radius);
    fallback.addColorStop(0, '#2d9ad5');
    fallback.addColorStop(1, '#6856c8');
    context.fillStyle = fallback;
    context.fillRect(centerX - radius, centerY - radius, size, size);
    context.fillStyle = '#ffffff';
    context.font = '800 30px Arial, "Microsoft YaHei", sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(getInitial(nickname), centerX, centerY + 1);
  }
  context.restore();
  context.beginPath();
  context.arc(centerX, centerY, radius + 2, 0, Math.PI * 2);
  context.strokeStyle = 'rgba(88, 220, 255, 0.72)';
  context.lineWidth = 4;
  context.stroke();
}

function drawExportCard(
  context: CanvasRenderingContext2D,
  item: WinnerItem,
  avatar: HTMLImageElement | null,
  lines: ExportContentLine[],
  x: number,
  y: number,
  width: number,
  height: number
): void {
  roundedRect(context, x, y, width, height, 20);
  context.fillStyle = 'rgba(23, 34, 74, 0.96)';
  context.fill();
  context.strokeStyle = 'rgba(104, 133, 218, 0.32)';
  context.lineWidth = 2;
  context.stroke();

  const numberX = x + 50;
  const numberY = y + 70;
  context.save();
  context.shadowColor = 'rgba(255, 185, 35, 0.55)';
  context.shadowBlur = 16;
  context.fillStyle = '#ffc94a';
  context.font = '108px "PangMenZhengDaoCuShuTi", Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(String(item.drawNumber), numberX, numberY + 2);
  context.restore();

  drawAvatar(context, avatar, item.winner.nickname, x + 154, y + 70, 76);

  const textX = x + 212;
  context.textAlign = 'left';
  context.fillStyle = '#ffffff';
  context.font = '800 29px Arial, "Microsoft YaHei", sans-serif';
  context.fillText(item.winner.nickname || '神秘观众', textX, y + 42, width - 236);

  context.fillStyle = 'rgba(174, 190, 232, 0.78)';
  context.font = '500 19px Arial, "Microsoft YaHei", sans-serif';
  context.fillText(getNumericUserId(item.winner), textX, y + 72, width - 236);

  context.fillStyle = '#dfe7ff';
  context.font = '500 23px "Segoe UI Emoji", "Microsoft YaHei", Arial, sans-serif';
  lines.forEach((line, index) => {
    let cursorX = textX;
    const baselineY = y + 108 + index * 30;
    line.forEach(token => {
      if (token.type === 'emoji' && token.image) {
        context.drawImage(token.image, cursorX, baselineY - 23, 26, 26);
      } else {
        context.fillText(token.text, cursorX, baselineY);
      }
      cursorX += token.width;
    });
  });

  context.textAlign = 'right';
  context.fillStyle = 'rgba(255, 205, 88, 0.72)';
  context.font = '600 15px Arial, "Microsoft YaHei", sans-serif';
  context.fillText(`HAPPY TIME · ${formatCardTimestamp(item.wonAt)}`, x + width - 18, y + height - 14);
}

async function copyCanvasPng(canvas: HTMLCanvasElement): Promise<void> {
  if (window.electronAPI?.copyImageToClipboard) {
    await window.electronAPI.copyImageToClipboard(canvas.toDataURL('image/png'));
    return;
  }
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(result => result ? resolve(result) : reject(new Error('PNG 生成失败')), 'image/png');
  });
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('当前环境不支持复制图片');
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

function queueWinnerExport(options: WinnerExportOptions = {}): void {
  exportQueue = exportQueue.then(() => exportWinnersPng(options));
}

async function exportWinnersPng(options: WinnerExportOptions = {}): Promise<void> {
  const selectedWinners = options.batchId
    ? props.winners.filter(winner => winner.batchId === options.batchId)
    : options.batchKey
      ? winnerBatches.value.find(batch => batch.batchKey === options.batchKey)?.items.map(item => item.winner) || []
      : props.winners;
  if (selectedWinners.length === 0) return;
  exporting.value = true;
  exportTip.value = '正在读取头像并生成 Happy PNG…';
  exportTipType.value = 'success';
  try {
    await userIdCacheReady;
    await document.fonts.load('108px "PangMenZhengDaoCuShuTi"', '0123456789');
    await document.fonts.ready;
    const items = selectedWinners
      .slice()
      .sort((a, b) => {
        return ((a.batchPosition || 0) - (b.batchPosition || 0)) ||
          ((a.wonAt || a.timestamp) - (b.wonAt || b.timestamp));
      })
      .map<WinnerItem>((winner, index) => ({
        winner,
        recordKey: winner.winRecordId || `${winner.id}-${index}`,
        deleteKey: winner.winRecordId || winner.id,
        drawNumber: index + 1,
        wonAt: winner.wonAt || winner.timestamp || Date.now()
      }));
    const [avatars, emojiImages] = await Promise.all([
      loadAllAvatars(items),
      loadAllWinnerEmojis(items)
    ]);
    // 多人 Happy PNG 使用更窄的纵向版式，弹出时能铺满窗口高度且不占满横向空间。
    const canvasWidth = items.length === 1 ? 1100 : 1280;
    const exportScale = 2;
    const sidePadding = 64;
    const columnGap = 24;
    const columns = items.length > 12 ? 2 : 1;
    const cardWidth = (canvasWidth - sidePadding * 2 - columnGap * (columns - 1)) / columns;
    const textWidth = cardWidth - 236;
    const measureCanvas = document.createElement('canvas');
    const measureContext = measureCanvas.getContext('2d');
    if (!measureContext) throw new Error('无法创建 PNG 画布');
    measureContext.font = '500 23px "Segoe UI Emoji", "Microsoft YaHei", Arial, sans-serif';
    const prepared = items.map(item => {
      const lines = wrapExportContent(measureContext, item.winner, emojiImages, textWidth);
      return { item, lines, height: Math.max(142, 126 + lines.length * 30) };
    });

    const layouts: Array<{ x: number; y: number; width: number; height: number; lines: ExportContentLine[] }> = [];
    const rowsPerColumn = Math.ceil(prepared.length / columns);
    const columnY = Array.from({ length: columns }, () => 230);
    prepared.forEach((entry, index) => {
      // 先从上往下填满第一列，再填第二列：1、2、3……纵向连续。
      const column = Math.min(columns - 1, Math.floor(index / rowsPerColumn));
      layouts.push({
        x: sidePadding + column * (cardWidth + columnGap),
        y: columnY[column],
        width: cardWidth,
        height: entry.height,
        lines: entry.lines
      });
      columnY[column] += entry.height + 18;
    });

    const canvasHeight = Math.max(...columnY) + 64;
    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth * exportScale;
    canvas.height = canvasHeight * exportScale;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法创建 PNG 画布');
    context.scale(exportScale, exportScale);
    const background = context.createLinearGradient(0, 0, canvasWidth, canvasHeight);
    background.addColorStop(0, '#101837');
    background.addColorStop(0.56, '#0a1029');
    background.addColorStop(1, '#080d22');
    context.fillStyle = background;
    context.fillRect(0, 0, canvasWidth, canvasHeight);

    context.fillStyle = '#ffffff';
    context.font = '900 54px Arial, "Microsoft YaHei", sans-serif';
    context.textAlign = 'left';
    context.fillText('HAPPY MOMENT', sidePadding, 86);
    context.fillStyle = '#ffc94a';
    context.font = '800 26px Arial, "Microsoft YaHei", sans-serif';
    context.fillText(`HAPPY × ${items.length}`, sidePadding, 130);
    context.fillStyle = 'rgba(183, 197, 235, 0.74)';
    context.font = '500 20px Arial, "Microsoft YaHei", sans-serif';
    context.fillText(`生成时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`, sidePadding, 166);
    context.textAlign = 'right';
    context.fillStyle = 'rgba(88, 220, 255, 0.78)';
    context.font = '800 22px Arial, "Microsoft YaHei", sans-serif';
    context.fillText('DYCAST · HAPPY DRAW', canvasWidth - sidePadding, 86);

    prepared.forEach((entry, index) => {
      const layout = layouts[index];
      drawExportCard(context, entry.item, avatars[index], layout.lines, layout.x, layout.y, layout.width, layout.height);
    });

    context.textAlign = 'center';
    context.fillStyle = 'rgba(143, 160, 205, 0.55)';
    context.font = '500 17px Arial, "Microsoft YaHei", sans-serif';
    context.fillText('本图片包含本轮全部 HAPPY 信息', canvasWidth / 2, canvasHeight - 34);
    const dataUrl = canvas.toDataURL('image/png');
    await copyCanvasPng(canvas);
    if (options.showPreview) {
      window.dispatchEvent(new CustomEvent(PNG_READY_EVENT, {
        detail: { dataUrl, count: items.length }
      }));
    }
    exportTip.value = `已复制本批 ${items.length} 位 Happy PNG 到剪贴板`;
    exportTipType.value = 'success';
  } catch (error) {
    exportTip.value = `导出失败：${(error as Error).message}`;
    exportTipType.value = 'error';
  } finally {
    exporting.value = false;
  }
}
</script>

<style scoped>
.winner-host {
  --gold: #ffc94a;
  --gold-soft: #ffdd86;
  --cyan: #58dcff;
  --text: #f7f8ff;
  --text-secondary: #aeb7d6;

  position: fixed;
  inset: 0;
  z-index: 99999;
  display: grid;
  place-items: center;
  box-sizing: border-box;
  padding: clamp(10px, 2vw, 28px);
  background:
    radial-gradient(circle at 50% 8%, rgba(69, 95, 224, 0.2), transparent 34%),
    rgba(2, 4, 16, 0.78);
  backdrop-filter: blur(16px);
  font-family: Inter, "PingFang SC", "Microsoft YaHei", sans-serif;
}

.winner-shell {
  position: relative;
  width: min(1320px, 100%);
  height: min(820px, calc(100dvh - clamp(20px, 4vw, 56px)));
  min-height: 520px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--text);
  border: 1px solid rgba(130, 153, 235, 0.2);
  border-radius: 24px;
  background:
    radial-gradient(circle at 12% 0%, rgba(56, 104, 222, 0.16), transparent 30%),
    linear-gradient(145deg, rgba(15, 21, 51, 0.99), rgba(7, 10, 29, 0.995));
  box-shadow: 0 32px 100px rgba(0, 0, 0, 0.52), inset 0 1px rgba(255, 255, 255, 0.04);
  isolation: isolate;
}

.shell-decoration {
  position: absolute;
  z-index: -1;
  inset: 0;
  pointer-events: none;
  opacity: 0.35;
  background-image:
    linear-gradient(rgba(111, 137, 220, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(111, 137, 220, 0.05) 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: linear-gradient(to bottom, #000, transparent 70%);
}

.shell-header {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 24px 12px;
}

.header-brand { display: flex; align-items: center; gap: 14px; min-width: 0; }
.brand-icon {
  width: 44px;
  height: 44px;
  flex: none;
  display: grid;
  place-items: center;
  color: var(--gold);
  border: 1px solid rgba(255, 201, 74, 0.26);
  border-radius: 15px;
  background: linear-gradient(145deg, rgba(255, 202, 74, 0.16), rgba(255, 151, 35, 0.05));
  box-shadow: 0 0 26px rgba(255, 187, 57, 0.08), inset 0 1px rgba(255, 248, 203, 0.08);
}
.brand-icon svg { width: 27px; height: 27px; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.title-group { min-width: 0; }
.title-line { display: flex; align-items: center; gap: 10px; }
.title-line h2 { margin: 0; font-size: 24px; line-height: 1.2; font-weight: 850; letter-spacing: 0.04em; }
.title-line span { padding: 3px 8px; color: var(--gold-soft); font-size: 11px; font-weight: 700; border: 1px solid rgba(255, 202, 74, 0.2); border-radius: 999px; background: rgba(255, 196, 54, 0.08); }
.title-group p { margin: 5px 0 0; color: rgba(174, 183, 214, 0.58); font-size: 12px; }

.close-button {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  flex: none;
  cursor: pointer;
  color: rgba(218, 224, 244, 0.58);
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  transition: 160ms ease;
}
.close-button:hover { color: #fff; border-color: rgba(136, 153, 207, 0.16); background: rgba(255, 255, 255, 0.06); transform: rotate(90deg); }
.close-button svg { width: 23px; height: 23px; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; }

.summary-strip {
  flex: none;
  display: grid;
  grid-template-columns: 1fr 1fr 1.35fr;
  gap: 10px;
  padding: 0 24px 12px;
}
.summary-card {
  position: relative;
  box-sizing: border-box;
  min-height: 56px;
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-rows: auto auto;
  align-items: end;
  padding: 9px 14px;
  overflow: hidden;
  border: 1px solid rgba(116, 139, 213, 0.13);
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(31, 42, 82, 0.72), rgba(18, 26, 57, 0.6));
}
.summary-card span { color: var(--text-secondary); font-size: 11px; }
.summary-card strong { grid-row: 1 / 3; grid-column: 2; align-self: center; color: #fff; font-size: 30px; font-weight: 850; line-height: 1; }
.summary-card small { margin-top: 7px; color: rgba(123, 147, 209, 0.4); font-size: 8px; font-weight: 800; letter-spacing: 0.16em; }
.summary-primary { border-color: rgba(255, 200, 69, 0.16); background: linear-gradient(135deg, rgba(92, 68, 27, 0.42), rgba(44, 35, 36, 0.42)); }
.summary-primary strong { color: var(--gold); }
.summary-latest strong { font-size: 22px; }

.toolbar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 9px 24px;
  border-top: 1px solid rgba(115, 136, 198, 0.09);
  border-bottom: 1px solid rgba(115, 136, 198, 0.09);
  background: rgba(7, 12, 34, 0.4);
}
.search-field {
  width: min(330px, 42%);
  height: 38px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 12px;
  box-sizing: border-box;
  color: rgba(161, 176, 218, 0.56);
  border: 1px solid rgba(119, 142, 210, 0.15);
  border-radius: 10px;
  background: rgba(22, 30, 64, 0.7);
  transition: 160ms ease;
}
.search-field:focus-within { color: var(--cyan); border-color: rgba(79, 213, 255, 0.34); box-shadow: 0 0 0 3px rgba(60, 193, 255, 0.06); }
.search-field svg { width: 17px; height: 17px; flex: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; }
.search-field input { min-width: 0; flex: 1; color: #f5f7ff; font: inherit; font-size: 12px; border: 0; outline: 0; background: transparent; }
.search-field input::placeholder { color: rgba(164, 175, 211, 0.38); }
.search-field input::-webkit-search-cancel-button { display: none; }
.search-field button { width: 20px; height: 20px; padding: 0; cursor: pointer; color: rgba(198, 207, 235, 0.52); font-size: 18px; line-height: 18px; border: 0; background: transparent; }
.toolbar-actions { min-width: 0; display: flex; align-items: center; gap: 8px; }
.result-count, .export-tip { margin-right: 3px; color: rgba(177, 188, 220, 0.5); font-size: 11px; white-space: nowrap; }
.export-tip.success { color: rgba(106, 232, 192, 0.78); }
.export-tip.error { color: rgba(255, 143, 155, 0.86); }
.sort-button, .export-button, .clear-button {
  height: 36px;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 12px;
  cursor: pointer;
  color: rgba(218, 224, 242, 0.72);
  font-size: 11px;
  border: 1px solid rgba(124, 145, 207, 0.14);
  border-radius: 9px;
  background: rgba(34, 43, 79, 0.55);
  transition: 160ms ease;
  white-space: nowrap;
}
.sort-button:hover { color: #fff; border-color: rgba(93, 208, 255, 0.26); background: rgba(42, 58, 105, 0.75); }
.sort-button svg, .export-button svg { width: 16px; height: 16px; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.export-button { color: var(--gold-soft); border-color: rgba(255, 204, 80, 0.2); background: rgba(115, 79, 18, 0.2); }
.export-button:hover:not(:disabled) { color: #fff4c3; border-color: rgba(255, 214, 103, 0.42); background: rgba(147, 100, 20, 0.3); }
.export-button:disabled { cursor: default; opacity: 0.38; }
.clear-button:hover:not(:disabled) { color: #ffb6bc; border-color: rgba(255, 102, 118, 0.24); background: rgba(126, 37, 52, 0.15); }
.clear-button:disabled { cursor: default; opacity: 0.3; }

.history-content {
  position: relative;
  flex: 1;
  min-height: 0;
  padding: 16px 20px 16px 28px;
  overflow: hidden auto;
  overscroll-behavior: contain;
  touch-action: pan-y;
  scrollbar-gutter: stable;
}
.history-content::-webkit-scrollbar { width: 7px; }
.history-content::-webkit-scrollbar-thumb { border: 2px solid transparent; border-radius: 99px; background: rgba(120, 143, 207, 0.28); background-clip: padding-box; }
.happy-batches { display: flex; flex-direction: column; gap: 18px; }
.load-more-button {
  align-self: center;
  min-width: 220px;
  min-height: 42px;
  padding: 0 22px;
  color: #dce7ff;
  border: 1px solid rgba(97, 180, 255, .4);
  border-radius: 999px;
  background: rgba(43, 76, 143, .5);
  font-weight: 700;
  cursor: pointer;
}
.load-more-button:hover { background: rgba(52, 103, 190, .72); }
.happy-batch {
  padding: 12px;
  border: 1px solid rgba(99, 128, 211, 0.13);
  border-radius: 16px;
  background: rgba(12, 20, 50, 0.42);
  content-visibility: auto;
  contain-intrinsic-size: auto 180px;
}
.batch-header { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 0 4px 10px; }
.batch-header div { display: flex; align-items: center; gap: 9px; }
.batch-header strong { color: var(--gold-soft); font-size: 13px; letter-spacing: 0.08em; }
.batch-header span { padding: 2px 7px; color: rgba(207, 218, 246, 0.66); font-size: 10px; border: 1px solid rgba(120, 148, 220, 0.16); border-radius: 99px; }
.batch-header time { color: rgba(158, 177, 222, 0.68); font-size: 10px; font-variant-numeric: tabular-nums; }
.batch-actions { justify-content: flex-end; }
.batch-export-button { height: 28px; padding: 0 10px; cursor: pointer; color: var(--gold-soft); font-size: 9px; border: 1px solid rgba(255, 204, 80, 0.2); border-radius: 7px; background: rgba(115, 79, 18, 0.2); }
.batch-export-button:hover:not(:disabled) { color: #fff4c3; border-color: rgba(255, 214, 103, 0.42); background: rgba(147, 100, 20, 0.3); }
.batch-export-button:disabled { cursor: default; opacity: 0.4; }
.winner-list {
  display: grid;
  grid-template-columns: repeat(var(--winner-columns, 4), minmax(0, 1fr));
  gap: 12px;
}
.winner-card {
  position: relative;
  box-sizing: border-box;
  min-width: 0;
  min-height: 88px;
  display: grid;
  grid-template-columns: 58px 48px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  padding: 10px 14px 10px 10px;
  overflow: hidden;
  border: 1px solid rgba(109, 134, 209, 0.12);
  border-radius: 14px;
  background: linear-gradient(100deg, rgba(28, 39, 80, 0.76), rgba(17, 25, 57, 0.62));
  box-shadow: inset 0 1px rgba(255, 255, 255, 0.025);
  animation: card-enter 320ms var(--entry-delay) both;
  transition: 160ms ease;
}
.winner-card::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 2px; opacity: 0; background: linear-gradient(var(--cyan), #5b7cff); transition: opacity 160ms ease; }
.winner-card:hover { border-color: rgba(81, 199, 255, 0.22); background: linear-gradient(100deg, rgba(34, 49, 96, 0.9), rgba(21, 31, 68, 0.78)); transform: translateY(-1px); }
.winner-card:hover::before { opacity: 1; }
.winner-number {
  width: 54px;
  height: 58px;
  align-self: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(111, 139, 224, 0.16);
  border-radius: 13px;
  background: linear-gradient(145deg, rgba(69, 89, 163, 0.22), rgba(21, 31, 67, 0.16));
  box-shadow: inset 0 1px rgba(255, 255, 255, 0.035);
}
.winner-number strong {
  color: var(--gold);
  font-family: "PangMenZhengDaoCuShuTi", Arial, sans-serif;
  font-size: 40px;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
  line-height: 0.95;
  letter-spacing: 0.01em;
  text-shadow: 0 0 18px rgba(255, 184, 38, 0.22);
}
.winner-avatar { position: relative; width: 46px; height: 46px; display: grid; place-items: center; border: 2px solid rgba(84, 206, 255, 0.25); border-radius: 50%; box-shadow: 0 0 14px rgba(60, 176, 255, 0.08); }
.winner-avatar span, .winner-avatar img { position: absolute; inset: 2px; width: calc(100% - 4px); height: calc(100% - 4px); border-radius: inherit; }
.winner-avatar span { display: grid; place-items: center; color: #fff; font-size: 18px; font-weight: 800; background: linear-gradient(135deg, #287fc4, #6657cd); }
.winner-avatar img { object-fit: cover; }
.winner-info { min-width: 0; }
.winner-heading { display: flex; align-items: center; gap: 8px; min-width: 0; }
.winner-heading strong { min-width: 0; color: #f6f7ff; font-family: 'LXGW WenKai', 'Microsoft YaHei UI', sans-serif; font-size: 15px; font-weight: 700; line-height: 1.3; overflow-wrap: anywhere; }
.winner-info p { display: -webkit-box; margin: 5px 0 0; overflow: hidden; color: rgba(205, 214, 239, 0.72); font-size: 12px; line-height: 1.4; overflow-wrap: anywhere; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.winner-meta { min-width: 0; display: flex; align-items: center; gap: 6px; margin-top: 6px; }
.winner-meta time { min-width: 0; overflow: hidden; color: rgba(159, 190, 238, 0.74); font-size: 10px; font-variant-numeric: tabular-nums; text-overflow: ellipsis; white-space: nowrap; }
.delete-button { position: absolute; top: 4px; right: 4px; width: 26px; height: 26px; display: grid; place-items: center; cursor: pointer; opacity: 0; color: rgba(215, 221, 241, 0.46); border: 1px solid transparent; border-radius: 7px; background: rgba(13, 19, 45, 0.92); transition: 150ms ease; }
.winner-card:hover .delete-button, .delete-button:focus-visible { opacity: 1; }
.delete-button:hover { color: #ff9ea8; border-color: rgba(255, 103, 119, 0.18); background: rgba(171, 47, 63, 0.12); }
.delete-button svg { width: 16px; height: 16px; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }

.winner-list-many { gap: 5px; }
.winner-list-many .winner-card {
  min-height: 84px;
  grid-template-columns: 50px 42px minmax(0, 1fr);
  gap: 8px;
  padding: 7px 10px 7px 7px;
}
.winner-list-many .winner-number { width: 47px; height: 52px; border-radius: 11px; }
.winner-list-many .winner-number strong { font-size: 25px; }
.winner-list-many .winner-avatar { width: 40px; height: 40px; }
.winner-list-many .winner-heading strong { font-size: 13px; }
.winner-list-many .winner-info p { margin-top: 3px; font-size: 11px; line-height: 1.28; -webkit-line-clamp: 3; }
.winner-list-many .winner-meta { margin-top: 3px; }
.winner-list-many .winner-meta time { display: block; font-size: 8px; }

.winner-list-dense { gap: 4px; }
.winner-list-dense .winner-card {
  box-sizing: border-box;
  height: 48px;
  min-height: 48px;
  grid-template-columns: 38px 30px minmax(0, 1fr);
  gap: 6px;
  padding: 3px 7px 3px 4px;
  border-radius: 10px;
}
.winner-list-dense .winner-number strong { font-size: 22px; }
.winner-list-dense .winner-avatar { width: 27px; height: 27px; border-width: 1px; }
.winner-list-dense .winner-avatar span { font-size: 11px; }
.winner-list-dense .winner-heading strong { font-size: 11px; }
.winner-list-dense .winner-info p { display: none; }
.winner-list-dense .winner-meta { margin-top: 2px; }
.winner-list-dense .winner-meta time { font-size: 7px; }
.winner-list-dense .delete-button { width: 22px; height: 22px; }

.empty-state { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 30px; text-align: center; }
.empty-icon { width: 72px; height: 72px; display: grid; place-items: center; margin-bottom: 18px; color: rgba(255, 201, 74, 0.66); border: 1px solid rgba(255, 205, 80, 0.14); border-radius: 22px; background: linear-gradient(145deg, rgba(255, 199, 61, 0.1), rgba(255, 160, 46, 0.025)); box-shadow: 0 0 40px rgba(255, 190, 52, 0.05); }
.empty-icon svg { width: 34px; height: 34px; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.empty-state strong { color: rgba(242, 244, 252, 0.86); font-size: 16px; }
.empty-state span { margin-top: 7px; color: rgba(166, 179, 215, 0.48); font-size: 11px; }
.empty-state button { margin-top: 18px; padding: 7px 14px; cursor: pointer; color: var(--cyan); font-size: 11px; border: 1px solid rgba(81, 209, 255, 0.2); border-radius: 8px; background: rgba(56, 179, 229, 0.07); }
.empty-search .empty-icon { color: rgba(89, 214, 255, 0.6); border-color: rgba(81, 209, 255, 0.12); background: rgba(62, 177, 232, 0.05); }

.shell-footer { flex: none; display: flex; justify-content: space-between; padding: 10px 28px 14px; color: rgba(129, 145, 189, 0.38); font-size: 9px; border-top: 1px solid rgba(111, 132, 194, 0.07); }

@keyframes card-enter { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.winner-panel-enter-active, .winner-panel-leave-active { transition: opacity 220ms ease; }
.winner-panel-enter-active .winner-shell { animation: shell-enter 330ms cubic-bezier(0.2, 1, 0.3, 1); }
.winner-panel-enter-from, .winner-panel-leave-to { opacity: 0; }
@keyframes shell-enter { from { opacity: 0; transform: translateY(14px) scale(0.985); } to { opacity: 1; transform: translateY(0) scale(1); } }

@media (max-width: 720px) {
  .winner-host { padding: 0; }
  .winner-shell { width: 100%; height: 100dvh; min-height: 0; border: 0; border-radius: 0; }
  .shell-header { padding: 18px 16px 14px; }
  .brand-icon { width: 42px; height: 42px; border-radius: 13px; }
  .title-line h2 { font-size: 19px; }
  .summary-strip { grid-template-columns: 1fr 1fr; padding: 0 16px 14px; }
  .summary-latest { display: none; }
  .toolbar { align-items: stretch; padding: 12px 16px; }
  .search-field { width: 100%; }
  .result-count, .export-tip, .clear-button { display: none; }
  .history-content { padding: 12px 10px 12px 16px; }
  .winner-list { grid-template-columns: 1fr !important; }
  .winner-card { grid-template-columns: 54px 42px minmax(0, 1fr); gap: 10px; padding: 9px; }
  .winner-number { width: 50px; height: 54px; }
  .winner-avatar { width: 40px; height: 40px; }
  .delete-button { display: none; }
  .winner-info p { max-width: 100%; }
  .shell-footer { padding-inline: 16px; }
}

@media (min-width: 721px) and (max-width: 960px) {
  .winner-list { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
}

@media (max-height: 650px) and (min-width: 721px) {
  .winner-shell { min-height: 0; }
  .shell-header { padding-top: 14px; padding-bottom: 12px; }
  .summary-strip { padding-bottom: 12px; }
  .summary-card { min-height: 52px; padding-block: 9px; }
  .summary-card strong { font-size: 24px; }
  .summary-latest strong { font-size: 18px; }
  .toolbar { padding-block: 9px; }
  .history-content { padding-top: 10px; padding-bottom: 10px; }
  .winner-card { min-height: 78px; padding-block: 7px; }
  .winner-number { height: 52px; }
  .winner-number strong { font-size: 25px; }
}

@media (prefers-reduced-motion: reduce) {
  .winner-host *, .winner-host *::before, .winner-host *::after { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; }
}
</style>
