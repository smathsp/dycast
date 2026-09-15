<template>
  <div
    class="danmu-item"
    :style="itemStyle"
    @animationend="$emit('end', danmu.id)">
    <img v-if="danmu.avatar" class="danmu-avatar" :src="danmu.avatar" alt="" />
    <span class="danmu-nickname">{{ danmu.nickname || '匿名' }}：</span>
    <span class="danmu-content"><InlineEmojiText :content="danmu.content" :emoji-url="danmu.emojiUrl" /></span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Danmu } from '@/danmu/types';
import InlineEmojiText from '@/components/InlineEmojiText.vue';

const props = defineProps<{
  danmu: Danmu;
  y: number;    // 轨道 Y 位置 (0-100)
  speed: number; // 飘动秒数
  fontSize: number; // 字号 px
}>();

defineEmits<{
  (e: 'end', id: string): void;
}>();

const itemStyle = computed(() => ({
  top: `${props.y}%`,
  left: '100%',
  fontSize: `${props.fontSize}px`,
  animation: `danmuScroll ${props.speed}s linear forwards`
}));
</script>

<style lang="scss" scoped>
.danmu-item {
  position: absolute;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 14px 4px 6px;
  background: rgba(0, 0, 0, 0.55);
  border-radius: 20px;
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
    color: #7ec8e3;
    font-weight: bold;
    font-size: 0.9em;
    flex-shrink: 0;
  }

  .danmu-content {
    color: #fff;
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
