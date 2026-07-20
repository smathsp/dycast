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
              <label class="form-label">抽奖阈值</label>
              <div class="form-input-group">
                <button class="step-btn" @click="updateSettings({ lotteryThreshold: Math.max(100, settings.lotteryThreshold - 100) })">−</button>
                <input
                  class="form-input threshold-input"
                  type="number"
                  :value="thresholdDisplay"
                  @input="thresholdDisplay = Number(($event.target as HTMLInputElement).value)"
                  @blur="onThresholdBlur"
                  @keyup.enter="($event.target as HTMLInputElement).blur()"
                  min="100"
                  step="100" />
                <button class="step-btn" @click="updateSettings({ lotteryThreshold: settings.lotteryThreshold + 100 })">+</button>
                <span class="form-unit">条</span>
              </div>
            </div>
            <div class="preset-btns">
              <button
                v-for="v in [100, 200, 500, 1000, 2000]"
                :key="v"
                class="preset-btn"
                :class="{ active: settings.lotteryThreshold === v }"
                @click="updateSettings({ lotteryThreshold: v })">
                {{ formatNum(v) }}
              </button>
            </div>
            <div class="form-row" style="margin-top: 14px;">
              <label class="form-label">最低灯牌等级</label>
              <div class="form-input-group">
                <button class="step-btn" @click="updateSettings({ minFansLevel: Math.max(0, settings.minFansLevel - 1) })">−</button>
                <input
                  class="form-input threshold-input"
                  type="number"
                  :value="fansLevelDisplay"
                  @input="fansLevelDisplay = Number(($event.target as HTMLInputElement).value)"
                  @blur="onFansLevelBlur"
                  @keyup.enter="($event.target as HTMLInputElement).blur()"
                  min="0"
                  max="50"
                  step="1" />
                <button class="step-btn" @click="updateSettings({ minFansLevel: settings.minFansLevel + 1 })">+</button>
                <span class="form-unit">级</span>
              </div>
            </div>
            <div class="preset-btns">
              <button
                v-for="v in [0, 1, 3, 5, 10]"
                :key="v"
                class="preset-btn"
                :class="{ active: settings.minFansLevel === v }"
                @click="updateSettings({ minFansLevel: v })">
                {{ v === 0 ? '不限' : `Lv${v}+` }}
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

          <!-- 重置 -->
          <div class="section">
            <h3 class="section-title">⚠️ 数据重置</h3>
            <div class="reset-row">
              <div class="reset-info">
                <span class="reset-label">清零累计弹幕和能量</span>
                <span class="reset-desc">当前累计 {{ state.totalPoolCount.toLocaleString() }} 条</span>
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
import { ref, watch } from 'vue';
import { useDanmuState, settings, updateSettings, resetDanmuState } from '@/danmu/store';

const props = defineProps<{ visible: boolean }>();
defineEmits<{ (e: 'close'): void }>();

const state = useDanmuState();

// 输入框临时值（失焦时才提交）
const thresholdDisplay = ref(settings.lotteryThreshold);
const fansLevelDisplay = ref(settings.minFansLevel);

// 设置弹窗打开时同步显示值
watch(() => props.visible, (v) => {
  if (v) {
    thresholdDisplay.value = settings.lotteryThreshold;
    fansLevelDisplay.value = settings.minFansLevel;
  }
});

// 预设按钮点击时也同步显示值
watch(() => settings.lotteryThreshold, (v) => { thresholdDisplay.value = v; });
watch(() => settings.minFansLevel, (v) => { fansLevelDisplay.value = v; });

function onThresholdBlur() {
  const v = Math.max(1, Math.round(thresholdDisplay.value));
  updateSettings({ lotteryThreshold: v });
}

function onFansLevelBlur() {
  const v = Math.max(0, Math.round(fansLevelDisplay.value));
  updateSettings({ minFansLevel: v });
}

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
  transition: border-color 0.15s;

  &:focus {
    border-color: $accent;
    box-shadow: 0 0 0 2px rgba(0, 229, 255, 0.15);
  }

  &::-webkit-inner-spin-button,
  &::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  -moz-appearance: textfield;
}

.threshold-input {
  width: 80px;
}

.step-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 16px;
  cursor: pointer;
  transition: all 0.15s;
  line-height: 1;

  &:hover {
    background: rgba(0, 229, 255, 0.15);
    border-color: $accent;
    color: $accent;
  }

  &:active {
    transform: scale(0.92);
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
