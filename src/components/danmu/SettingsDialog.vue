<template>
  <Transition name="dialog">
    <div v-if="visible" class="settings-mask" @click.self="$emit('close')">
      <div class="settings-dialog">
        <div class="dialog-header">
          <span class="header-icon">⚙</span>
          <h2 class="header-title">设置</h2>
          <button class="close-btn" @click="$emit('close')">✕</button>
        </div>

        <div class="dialog-body">
          <!-- 抽奖设置 -->
          <div class="section">
            <h3 class="section-title">🎰 抽奖设置</h3>
            <div class="form-row">
              <label class="form-label">每累计多少条弹幕抽一次</label>
              <div class="form-input-group">
                <input
                  class="form-input"
                  type="number"
                  :value="settings.lotteryThreshold"
                  @input="onThresholdChange"
                  min="100"
                  step="100" />
                <span class="form-unit">条</span>
              </div>
            </div>
            <div class="preset-btns">
              <button
                v-for="v in [1000, 5000, 10000, 50000]"
                :key="v"
                class="preset-btn"
                :class="{ active: settings.lotteryThreshold === v }"
                @click="updateSettings({ lotteryThreshold: v })">
                {{ formatNum(v) }}
              </button>
            </div>
          </div>

          <!-- 弹幕显示 -->
          <div class="section">
            <h3 class="section-title">💬 弹幕显示</h3>
            <div class="form-row">
              <label class="form-label">弹幕字号</label>
              <div class="form-input-group">
                <input
                  class="form-range"
                  type="range"
                  :value="settings.fontSize"
                  @input="onFontSizeChange"
                  min="12"
                  max="28"
                  step="1" />
                <span class="form-value">{{ settings.fontSize }}px</span>
              </div>
            </div>
            <div class="form-row">
              <label class="form-label">飘动速度</label>
              <div class="form-input-group">
                <input
                  class="form-range"
                  type="range"
                  :value="settings.speedBase"
                  @input="onSpeedChange"
                  min="6"
                  max="20"
                  step="1" />
                <span class="form-value">{{ settings.speedBase }}~{{ settings.speedBase + settings.speedRange }}秒</span>
              </div>
            </div>
          </div>

          <!-- 中奖记录 -->
          <div class="section">
            <h3 class="section-title">
              🏆 中奖记录
              <span class="record-count">共 {{ state.lotteryCount }} 次</span>
              <button v-if="state.lotteryHistory.length" class="clear-btn" @click="clearLotteryHistory">清空</button>
            </h3>
            <div class="history-list" v-if="state.lotteryHistory.length">
              <div
                class="history-item"
                v-for="(item, idx) in reversedHistory"
                :key="idx">
                <span class="history-rank">#{{ state.lotteryHistory.length - idx }}</span>
                <img v-if="item.avatar" class="history-avatar" :src="item.avatar" alt="" />
                <div class="history-info">
                  <span class="history-nickname">{{ item.nickname }}</span>
                  <span class="history-content">"{{ item.content }}"</span>
                </div>
              </div>
            </div>
            <div class="history-empty" v-else>暂无中奖记录</div>
          </div>

          <!-- 重置 -->
          <div class="section">
            <h3 class="section-title">⚠️ 数据重置</h3>
            <div class="reset-row">
              <div class="reset-info">
                <span class="reset-label">清零累计弹幕和能量</span>
                <span class="reset-desc">当前累计 {{ state.totalDanmuCount.toLocaleString() }} 条</span>
              </div>
              <button class="reset-btn" @click="handleReset">重置</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useDanmuState, settings, updateSettings, clearLotteryHistory, resetDanmuState } from '@/danmu/store';

defineProps<{ visible: boolean }>();
defineEmits<{ (e: 'close'): void }>();

const state = useDanmuState();

const reversedHistory = computed(() => [...state.lotteryHistory].reverse());

function formatNum(n: number) {
  if (n >= 10000) return `${n / 10000}万`;
  if (n >= 1000) return `${n / 1000}千`;
  return `${n}`;
}

function handleReset() {
  if (confirm('确认清零累计弹幕和能量？此操作不可撤销。')) {
    resetDanmuState();
  }
}

function onThresholdChange(e: Event) {
  const v = Math.max(100, Number((e.target as HTMLInputElement).value));
  updateSettings({ lotteryThreshold: v });
}
function onFontSizeChange(e: Event) {
  updateSettings({ fontSize: Number((e.target as HTMLInputElement).value) });
}
function onSpeedChange(e: Event) {
  updateSettings({ speedBase: Number((e.target as HTMLInputElement).value) });
}
</script>

<style lang="scss" scoped>
$gold: #ffd700;
$accent: #00e5ff;

.settings-mask {
  position: fixed;
  inset: 0;
  z-index: 10001;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
}

.settings-dialog {
  width: 440px;
  max-height: 80vh;
  background: linear-gradient(145deg, #1a1a2e, #16213e);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.dialog-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);

  .header-icon {
    font-size: 22px;
  }

  .header-title {
    flex: 1;
    margin: 0;
    font-size: 18px;
    color: #fff;
  }

  .close-btn {
    background: none;
    border: none;
    color: rgba(255, 255, 255, 0.4);
    font-size: 18px;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    transition: all 0.15s;

    &:hover {
      color: #fff;
      background: rgba(255, 255, 255, 0.1);
    }
  }
}

.dialog-body {
  padding: 16px 20px;
  overflow-y: auto;
  flex: 1;
}

.section {
  margin-bottom: 24px;

  &:last-child {
    margin-bottom: 0;
  }
}

.section-title {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.6);
  margin: 0 0 12px 0;
  display: flex;
  align-items: center;
  gap: 6px;

  .record-count {
    font-weight: normal;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.3);
  }

  .clear-btn {
    margin-left: auto;
    background: none;
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: rgba(255, 255, 255, 0.5);
    font-size: 12px;
    padding: 2px 10px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s;

    &:hover {
      border-color: #e95464;
      color: #e95464;
    }
  }
}

.form-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.form-label {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.8);
}

.form-input-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.form-input {
  width: 100px;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  text-align: center;
  outline: none;

  &:focus {
    border-color: $accent;
  }
}

.form-unit {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.4);
}

.form-value {
  font-size: 13px;
  color: $accent;
  min-width: 60px;
  text-align: right;
}

.form-range {
  width: 140px;
  accent-color: $accent;
}

.preset-btns {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.preset-btn {
  flex: 1;
  padding: 6px 0;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: $accent;
    color: $accent;
  }

  &.active {
    background: rgba(0, 229, 255, 0.1);
    border-color: $accent;
    color: $accent;
  }
}

// ===== 中奖记录 =====
.history-list {
  max-height: 240px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;

  &::-webkit-scrollbar {
    width: 4px;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.15);
    border-radius: 2px;
  }
}

.history-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;

  .history-rank {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.25);
    min-width: 28px;
  }

  .history-avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
  }

  .history-info {
    flex: 1;
    min-width: 0;
  }

  .history-nickname {
    display: block;
    font-size: 13px;
    color: $gold;
    font-weight: bold;
  }

  .history-content {
    display: block;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.history-empty {
  text-align: center;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.2);
  padding: 16px 0;
}

// ===== 重置 =====
.reset-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.reset-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.reset-label {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.8);
}

.reset-desc {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.3);
}

.reset-btn {
  padding: 6px 20px;
  background: rgba(233, 84, 100, 0.15);
  border: 1px solid rgba(233, 84, 100, 0.4);
  border-radius: 6px;
  color: #e95464;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: rgba(233, 84, 100, 0.25);
    border-color: #e95464;
  }
}

// ===== 动画 =====
.dialog-enter-active {
  transition: opacity 0.25s ease;
  .settings-dialog {
    transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
}
.dialog-leave-active {
  transition: opacity 0.2s ease;
}
.dialog-enter-from {
  opacity: 0;
  .settings-dialog {
    transform: scale(0.9) translateY(10px);
  }
}
.dialog-leave-to {
  opacity: 0;
}
</style>
