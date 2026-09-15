<template>
  <div
    class="window-display-picker"
    :class="`variant-${variant}`"
    @mouseenter="refreshDisplayState">
    <div class="window-drag-handle" title="按住拖动窗口">
      <i></i>
      <span>拖动窗口 · 悬停选屏</span>
      <i></i>
    </div>

    <div class="display-popover" role="dialog" aria-label="选择抽奖窗口所在屏幕">
      <div class="popover-heading">
        <div>
          <strong>选择展示屏幕</strong>
          <small>点击后窗口立即移动</small>
        </div>
        <span>{{ displays.length }} 屏</span>
      </div>

      <div class="display-options">
        <button
          type="button"
          :class="{ active: config.danmuDisplayId === 'auto' }"
          :disabled="loading"
          @click="selectDisplay('auto')">
          <span class="screen-icon auto-icon"><b></b></span>
          <span class="option-copy">
            <strong>跟随主窗口</strong>
            <small>主窗口移到哪块屏幕，就从哪块屏幕打开</small>
          </span>
          <span class="selected-mark">✓</span>
        </button>

        <button
          v-for="(display, index) in displays"
          :key="display.id"
          type="button"
          :class="{ active: config.danmuDisplayId === display.id }"
          :disabled="loading"
          @click="selectDisplay(display.id)">
          <span class="screen-icon"><b>{{ index + 1 }}</b></span>
          <span class="option-copy">
            <strong>屏幕 {{ index + 1 }}<em v-if="display.primary">主屏</em></strong>
            <small>{{ display.bounds.width }} × {{ display.bounds.height }} · {{ display.label }}</small>
          </span>
          <span class="selected-mark">✓</span>
        </button>
      </div>

      <div v-if="errorMessage" class="display-error">{{ errorMessage }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

withDefaults(defineProps<{ variant?: 'default' | 'lottery' }>(), {
  variant: 'default'
});

const displays = ref<WindowDisplayInfo[]>([]);
const config = ref<WindowDisplayConfig>({
  danmuDisplayId: 'auto',
  sidebarDisplayId: 'auto',
  sidebarAlwaysOnTop: true
});
const loading = ref(false);
const errorMessage = ref('');
let stopDisplayListener: (() => void) | null = null;

function applyDisplayState(state?: WindowDisplayState): void {
  if (!state) return;
  displays.value = state.displays;
  config.value = { ...state.config };
}

async function refreshDisplayState(): Promise<void> {
  if (!window.electronAPI?.getWindowDisplayState || loading.value) return;
  try {
    applyDisplayState(await window.electronAPI.getWindowDisplayState());
    errorMessage.value = '';
  } catch (error) {
    console.warn('[WindowDisplayPicker] 读取屏幕失败:', error);
    errorMessage.value = '读取屏幕失败，请在设置中重试';
  }
}

async function selectDisplay(displayId: string): Promise<void> {
  if (!window.electronAPI?.setWindowDisplayConfig || loading.value) return;
  loading.value = true;
  errorMessage.value = '';
  try {
    applyDisplayState(await window.electronAPI.setWindowDisplayConfig({ danmuDisplayId: displayId }));
  } catch (error) {
    console.warn('[WindowDisplayPicker] 切换屏幕失败:', error);
    errorMessage.value = '切换失败，请重试';
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void refreshDisplayState();
  stopDisplayListener = window.electronAPI?.onWindowDisplaysChanged?.(applyDisplayState) || null;
});

onBeforeUnmount(() => stopDisplayListener?.());
</script>

<style scoped lang="scss">
.window-display-picker {
  -webkit-app-region: no-drag;
  position: absolute;
  z-index: 100100;
  top: 12px;
  left: 50%;
  width: 190px;
  transform: translateX(-50%);
  color: #e8f9ff;
  font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
}

.window-display-picker::after {
  content: "";
  position: absolute;
  top: 29px;
  left: 0;
  width: 100%;
  height: 11px;
}

.window-drag-handle {
  -webkit-app-region: drag;
  width: 100%;
  height: 30px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: rgba(220, 247, 255, 0.72);
  border: 1px solid rgba(154, 226, 255, 0.22);
  border-radius: 999px;
  background: rgba(7, 14, 31, 0.56);
  box-shadow: 0 0 18px rgba(74, 219, 255, 0.08);
  backdrop-filter: blur(9px);
  cursor: move;
  font: 10px/1 "Microsoft YaHei", sans-serif;
  letter-spacing: 0.1em;
  opacity: 0.7;
  transition: opacity 0.18s, border-color 0.18s, box-shadow 0.18s;
}

.window-drag-handle i {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #70eaff;
  box-shadow: 0 0 8px #70eaff;
}

.window-display-picker:hover .window-drag-handle,
.window-display-picker:focus-within .window-drag-handle {
  opacity: 1;
  border-color: rgba(112, 234, 255, 0.52);
  box-shadow: 0 0 24px rgba(74, 219, 255, 0.18);
}

.display-popover {
  -webkit-app-region: no-drag;
  position: absolute;
  top: 38px;
  left: 50%;
  width: 350px;
  box-sizing: border-box;
  padding: 13px;
  transform: translate(-50%, -7px) scale(0.98);
  transform-origin: top center;
  visibility: hidden;
  opacity: 0;
  pointer-events: none;
  border: 1px solid rgba(112, 234, 255, 0.28);
  border-radius: 14px;
  background: linear-gradient(145deg, rgba(8, 16, 38, 0.96), rgba(15, 18, 50, 0.96));
  box-shadow: 0 18px 55px rgba(0, 0, 0, 0.46), 0 0 30px rgba(67, 197, 255, 0.1);
  backdrop-filter: blur(18px);
  transition: opacity 0.16s, transform 0.16s, visibility 0.16s;
}

.window-display-picker:hover .display-popover,
.window-display-picker:focus-within .display-popover {
  visibility: visible;
  opacity: 1;
  pointer-events: auto;
  transform: translate(-50%, 0) scale(1);
}

.popover-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 1px 3px 10px;
}

.popover-heading > div { display: grid; gap: 3px; }
.popover-heading strong { color: #fff; font-size: 13px; }
.popover-heading small { color: rgba(205, 229, 243, 0.54); font-size: 10px; }
.popover-heading > span {
  padding: 4px 7px;
  color: #84efff;
  border: 1px solid rgba(112, 234, 255, 0.22);
  border-radius: 999px;
  background: rgba(75, 206, 255, 0.08);
  font-size: 9px;
}

.display-options { display: grid; gap: 6px; }

.display-options button {
  -webkit-app-region: no-drag;
  width: 100%;
  min-width: 0;
  padding: 8px 9px;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) 18px;
  align-items: center;
  gap: 9px;
  color: rgba(225, 239, 248, 0.78);
  text-align: left;
  cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.035);
  transition: 0.15s;
}

.display-options button:hover,
.display-options button.active {
  color: #fff;
  border-color: rgba(112, 234, 255, 0.36);
  background: linear-gradient(90deg, rgba(37, 167, 214, 0.18), rgba(98, 79, 222, 0.12));
}

.display-options button:disabled { cursor: wait; opacity: 0.62; }

.screen-icon {
  position: relative;
  width: 34px;
  height: 23px;
  display: grid;
  place-items: center;
  color: #9cf3ff;
  border: 1px solid rgba(137, 235, 255, 0.58);
  border-radius: 4px;
  background: rgba(63, 196, 255, 0.08);
  font: 700 10px/1 Arial, sans-serif;
}

.screen-icon::after {
  content: "";
  position: absolute;
  left: 11px;
  right: 11px;
  bottom: -4px;
  height: 3px;
  border-bottom: 1px solid rgba(137, 235, 255, 0.58);
}

.auto-icon b {
  width: 12px;
  height: 8px;
  border: 1px solid currentColor;
  border-radius: 2px;
  box-shadow: 7px 4px 0 -1px #101a37, 7px 4px 0 0 currentColor;
}

.option-copy { min-width: 0; display: grid; gap: 3px; }
.option-copy strong { overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.option-copy strong em {
  margin-left: 6px;
  padding: 2px 5px;
  color: #ffdf74;
  border-radius: 999px;
  background: rgba(255, 198, 43, 0.1);
  font-size: 8px;
  font-style: normal;
  font-weight: 500;
}
.option-copy small { overflow: hidden; color: rgba(205, 229, 243, 0.48); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.selected-mark { color: #75f1ff; font-size: 13px; opacity: 0; }
.display-options button.active .selected-mark { opacity: 1; }

.display-error {
  margin-top: 8px;
  padding: 7px 9px;
  color: #ffb2ba;
  border-radius: 7px;
  background: rgba(255, 74, 91, 0.1);
  font-size: 9px;
}

.variant-lottery .window-drag-handle {
  color: rgba(201, 247, 255, 0.78);
  border-color: rgba(45, 245, 255, 0.28);
  background: rgba(6, 11, 35, 0.62);
  box-shadow: 0 0 22px rgba(45, 245, 255, 0.12), inset 0 0 16px rgba(39, 92, 190, 0.12);
}
</style>
