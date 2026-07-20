<template>
  <div class="danmu-wall">
    <div
      v-for="item in displayDanmu"
      :key="item.id"
      class="danmu-item"
      :style="{
        top: `${item._y}%`,
        left: '100%',
        fontSize: `${settings.fontSize}px`,
        animation: `danmuScroll ${item._speed}s linear forwards`
      }"
      @animationend="onDanmuEnd(item.id)">
      <img v-if="item.avatar" class="danmu-avatar" :src="item.avatar" alt="" />
      <span v-if="item.fansClub?.level" class="danmu-fans-level">{{ item.fansClub.level }}</span>
      <span class="danmu-nickname">{{ item.nickname || '匿名' }}：</span>
      <span class="danmu-content" v-html="item._parsedContent"></span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watchEffect } from 'vue';
import { useDanmuState, settings, removeActiveDanmu } from '@/danmu/store';
import { emojis } from '@/core/emoji';
import type { Danmu } from '@/danmu/types';

/** 轨道数量 */
const TRACK_COUNT = 8;
let trackPointer = 0;

interface DisplayDanmu extends Danmu {
  _y: number;
  _speed: number;
  _parsedContent: string;
}

const state = useDanmuState();
const displayDanmu = ref<DisplayDanmu[]>([]);

function nextTrack(): number {
  const track = trackPointer;
  trackPointer = (track + 1) % TRACK_COUNT;
  return track;
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
function parseContent(content?: string): string {
  if (!content) return '';
  const safe = escapeHtml(content);
  return safe.replace(/\[([^\]]+)\]/g, (match) => {
    const url = emojis[match];
    if (url) {
      return `<img class="danmu-emoji" src="${url}" alt="${match}" />`;
    }
    return match;
  });
}

/** 持久化的已显示弹幕 ID 集合，避免每次 watcher 重建 */
const displayedIds = new Set<string>();

watchEffect(() => {
  const arr = state.activeDanmu;
  const newcomers = arr.filter(d => !displayedIds.has(d.id));

  for (const danmu of newcomers) {
    displayedIds.add(danmu.id);
    const track = nextTrack();
    const y = (track / TRACK_COUNT) * 80 + 5 + Math.random() * 4;
    const speed = settings.speedBase + Math.random() * settings.speedRange;
    displayDanmu.value.push({
      ...danmu,
      _y: y,
      _speed: speed,
      _parsedContent: parseContent(danmu.content)
    });
  }
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
  pointer-events: none;
  will-change: left;

  .danmu-avatar {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
  }

  .danmu-nickname {
    color: #64d8ff;
    font-weight: 800;
    font-size: 1em;
    flex-shrink: 0;
  }

  .danmu-fans-level {
    color: #ffb84d;
    font-size: 0.85em;
    font-weight: 600;
    flex-shrink: 0;
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
</style>

<style>
@keyframes danmuScroll {
  from {
    left: 100%;
  }
  to {
    left: -100%;
  }
}
</style>
