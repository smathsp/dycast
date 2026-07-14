<template>
  <TransitionGroup name="highlight-item" tag="div" class="gift-highlight">
    <div class="highlight-card" v-for="item in highlights" :key="item.id">
      <div class="highlight-left">
        <img class="highlight-avatar" v-if="item.avatar" :src="item.avatar" alt="头像" />
        <span class="highlight-user">{{ item.userName }}</span>
      </div>
      <div class="highlight-right">
        <div class="highlight-detail">
          <img class="highlight-gift-icon" v-if="item.giftIcon" :src="item.giftIcon" alt="礼物" />
          <span class="highlight-gift-name">{{ item.giftName }}</span>
          <span class="highlight-count">×{{ item.count }}</span>
        </div>
        <div class="highlight-value">
          <span class="highlight-total">{{ item.totalValue }}</span>
          <span class="highlight-unit">抖币</span>
        </div>
      </div>
    </div>
  </TransitionGroup>
</template>

<script setup lang="ts">
import { ref, onUnmounted } from 'vue';
import { useSettings } from '@/utils/settingUtil';
import type { DyMessage } from '@/core/dycast';
import { CastMethod } from '@/core/dycast';

interface HighlightItem {
  id: string;
  userName: string;
  avatar?: string;
  giftName: string;
  giftIcon?: string;
  count: number;
  totalValue: number;
  timer: ReturnType<typeof setTimeout>;
}

const settings = useSettings();
const highlights = ref<HighlightItem[]>([]);

/**
 * 处理消息，筛选高价值礼物
 */
const handleMessage = function (msg: DyMessage) {
  if (msg.method !== CastMethod.GIFT) return;
  if (!msg.gift?.price || !msg.gift?.count) return;

  const totalValue = msg.gift.price * Number(msg.gift.count);
  if (totalValue < settings.value.giftHighlightThreshold) return;

  const id = msg.id || `${Date.now()}-${Math.random()}`;

  // 清除同一条消息的旧定时器（如果有的话）
  const existingIndex = highlights.value.findIndex(h => h.id === id);
  if (existingIndex !== -1) {
    clearTimeout(highlights.value[existingIndex].timer);
    highlights.value.splice(existingIndex, 1);
  }

  const duration = settings.value.giftHighlightDuration * 1000;
  const timer = setTimeout(() => {
    const idx = highlights.value.findIndex(h => h.id === id);
    if (idx !== -1) {
      highlights.value.splice(idx, 1);
    }
  }, duration);

  const item: HighlightItem = {
    id,
    userName: msg.user?.name || '未知用户',
    avatar: msg.user?.avatar,
    giftName: msg.gift.name || '礼物',
    giftIcon: msg.gift.icon,
    count: Number(msg.gift.count),
    totalValue,
    timer
  };

  // 插入到列表开头（最新的在最上面）
  highlights.value.unshift(item);

  // 最多显示 5 条
  if (highlights.value.length > 5) {
    const removed = highlights.value.pop();
    if (removed) clearTimeout(removed.timer);
  }
};

/**
 * 清空置顶列表
 */
const clearHighlights = function () {
  highlights.value.forEach(item => clearTimeout(item.timer));
  highlights.value = [];
};

defineExpose({
  handleMessage,
  clearHighlights
});

onUnmounted(() => {
  highlights.value.forEach(item => clearTimeout(item.timer));
});
</script>

<style lang="scss" scoped>
.gift-highlight {
  width: 100%;
  box-sizing: border-box;
  padding: 0 18px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.highlight-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: linear-gradient(135deg, rgba(255, 215, 0, 0.95), rgba(255, 165, 0, 0.9));
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(255, 165, 0, 0.3);
  width: 100%;
  box-sizing: border-box;
}

.highlight-left {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  max-width: 45%;
  overflow: hidden;
}

.highlight-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid rgba(255, 255, 255, 0.6);
  flex-shrink: 0;
}

.highlight-user {
  font-size: 13px;
  font-weight: bold;
  color: #fff;
  font-family: 'mkwxy';
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.highlight-right {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  overflow: hidden;
}

.highlight-detail {
  display: flex;
  align-items: center;
  gap: 4px;
  overflow: hidden;
}

.highlight-gift-icon {
  width: 18px;
  height: 18px;
  object-fit: cover;
  flex-shrink: 0;
}

.highlight-gift-name {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.9);
  font-family: 'mkwxy';
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.highlight-count {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.9);
  font-family: 'mkwxy';
  flex-shrink: 0;
}

.highlight-value {
  display: flex;
  align-items: baseline;
  gap: 2px;
  flex-shrink: 0;
}

.highlight-total {
  font-size: 15px;
  font-weight: bold;
  color: #fff;
  font-family: 'mkwxy';
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
}

.highlight-unit {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.8);
  font-family: 'mkwxy';
}

/* 动画 */
.highlight-item-enter-active {
  transition: all 0.3s ease-out;
}

.highlight-item-leave-active {
  transition: all 0.3s ease-in;
}

.highlight-item-enter-from {
  opacity: 0;
  transform: translateY(-20px) scale(0.9);
}

.highlight-item-leave-to {
  opacity: 0;
  transform: translateY(-20px) scale(0.9);
}
</style>
