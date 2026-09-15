<template>
  <section class="live-overlay-controls" aria-label="直播绿幕快捷控制">
    <label class="control-row">
      <span>倒计时</span>
      <input
        v-model="countdownInput"
        type="text"
        inputmode="numeric"
        maxlength="8"
        aria-label="直播倒计时"
        placeholder="HH:MM:SS"
        @focus="editingCountdown = true"
        @blur="commitCountdown"
        @keydown.enter="($event.currentTarget as HTMLInputElement).blur()" />
    </label>

    <label class="control-row">
      <span>剩余中奖名额</span>
      <input
        v-model="winnerCountInput"
        class="winner-count-input"
        type="number"
        inputmode="numeric"
        min="0"
        max="9999"
        step="1"
        aria-label="剩余中奖名额"
        @focus="editingWinnerCount = true"
        @blur="commitWinnerCount"
        @keydown.enter="($event.currentTarget as HTMLInputElement).blur()" />
    </label>

    <div class="control-actions">
      <button type="button" :disabled="isRunning || remainingSeconds <= 0" @click="handleStart">开始</button>
      <button type="button" :disabled="!isRunning" @click="handlePause">暂停</button>
      <button type="button" @click="handleReset">重置</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useSettings } from '@/utils/settingUtil';
import {
  formatCountdown,
  getRemainingCountdownSeconds,
  parseCountdown,
  pauseCountdown,
  resetCountdown,
  setCountdownDuration,
  setRemainingWinnerCount,
  startCountdown
} from '@/utils/liveOverlayUtil';

const settings = useSettings();
const now = ref(Date.now());
const countdownInput = ref(formatCountdown(getRemainingCountdownSeconds(settings.value)));
const winnerCountInput = ref(String(settings.value.remainingWinnerCount));
const editingCountdown = ref(false);
const editingWinnerCount = ref(false);
let tickTimer: ReturnType<typeof setInterval> | null = null;

const remainingSeconds = computed(() => getRemainingCountdownSeconds(settings.value, now.value));
const isRunning = computed(() => settings.value.liveCountdownRunning && remainingSeconds.value > 0);

function refreshInputs(): void {
  now.value = Date.now();
  if (!editingCountdown.value) countdownInput.value = formatCountdown(remainingSeconds.value);
  if (!editingWinnerCount.value) winnerCountInput.value = String(settings.value.remainingWinnerCount);
}

function commitCountdown(): void {
  editingCountdown.value = false;
  const parsed = parseCountdown(countdownInput.value);
  if (parsed === null) {
    countdownInput.value = formatCountdown(remainingSeconds.value);
    return;
  }
  setCountdownDuration(parsed);
  refreshInputs();
}

function commitWinnerCount(): void {
  editingWinnerCount.value = false;
  setRemainingWinnerCount(winnerCountInput.value);
  refreshInputs();
}

function handleStart(): void {
  if (editingCountdown.value) commitCountdown();
  startCountdown();
  refreshInputs();
}

function handlePause(): void {
  pauseCountdown();
  refreshInputs();
}

function handleReset(): void {
  resetCountdown();
  refreshInputs();
}

watch(
  () => [
    settings.value.liveCountdownRunning,
    settings.value.liveCountdownEndAt,
    settings.value.liveCountdownPausedSeconds,
    settings.value.remainingWinnerCount
  ],
  refreshInputs
);

onMounted(() => {
  refreshInputs();
  tickTimer = setInterval(refreshInputs, 250);
});

onBeforeUnmount(() => {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
});
</script>

<style scoped lang="scss">
.live-overlay-controls {
  flex: 0 0 auto;
  display: grid;
  gap: 8px;
  margin: 0 18px 10px;
  padding: 12px;
  box-sizing: border-box;
  border: 1px solid rgba(104, 190, 141, 0.28);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 7px 22px rgba(60, 83, 72, 0.08);
}

.control-row {
  display: grid;
  grid-template-columns: minmax(90px, 1fr) minmax(100px, 1.12fr);
  align-items: center;
  gap: 8px;
  color: #66736e;
  font-size: 12px;
  font-weight: 700;
}

.control-row input {
  width: 100%;
  min-width: 0;
  height: 30px;
  box-sizing: border-box;
  padding: 0 9px;
  color: #34453e;
  border: 1px solid rgba(139, 150, 141, 0.4);
  border-radius: 7px;
  outline: none;
  background: #fff;
  font: 700 14px/1 Consolas, "Microsoft YaHei UI", sans-serif;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.control-row input:focus {
  border-color: #68be8d;
  box-shadow: 0 0 0 3px rgba(104, 190, 141, 0.13);
}

.winner-count-input {
  appearance: textfield;
}

.winner-count-input::-webkit-inner-spin-button,
.winner-count-input::-webkit-outer-spin-button {
  margin: 0;
  appearance: none;
}

.control-actions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 7px;
}

.control-actions button {
  height: 29px;
  color: #557066;
  border: 1px solid rgba(104, 190, 141, 0.34);
  border-radius: 7px;
  background: rgba(104, 190, 141, 0.1);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease, opacity 0.15s ease;
}

.control-actions button:hover:not(:disabled) {
  color: #fff;
  background: #68be8d;
}

.control-actions button:disabled {
  cursor: default;
  opacity: 0.42;
}
</style>
