<template>
  <div class="danmu-counter">
    <span class="counter-icon">🔥</span>
    <div class="counter-info">
      <span class="counter-label">累计弹幕</span>
      <span class="counter-value">{{ formattedCount }}</span>
      <span class="counter-unit">条</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useDanmuState } from '@/danmu/store';

const state = useDanmuState();

const formattedCount = computed(() => {
  return state.totalDanmuCount.toLocaleString('zh-CN');
});
</script>

<style lang="scss" scoped>
.danmu-counter {
  display: flex;
  align-items: center;
  gap: 10px;

  .counter-icon {
    font-size: 28px;
  }

  .counter-info {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }

  .counter-label {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.6);
  }

  .counter-value {
    font-size: 32px;
    font-weight: bold;
    color: #ff6b35;
    font-family: 'mkwxy', monospace;
    text-shadow: 0 0 10px rgba(255, 107, 53, 0.5);
    min-width: 80px;
  }

  .counter-unit {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.5);
  }
}
</style>
