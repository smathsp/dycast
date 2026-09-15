<template>
  <div class="app-shell" :class="{ 'is-electron': isElectron, 'is-danmu': isDanmuMode, 'is-display': isDisplayMode || isHighlightMode, 'is-live-overlay': isLiveOverlayMode }">
    <div v-if="isElectron && !isDanmuMode && !isDisplayMode && !isHighlightMode && !isLiveOverlayMode" class="electron-titlebar">
      <div class="electron-brand">
        <span class="electron-brand-mark">D</span>
        <strong>{{ pageTitle }}</strong>
        <small>{{ pageSubtitle }}</small>
      </div>
    </div>
    <main class="app-content">
      <LiveOverlayView v-if="isLiveOverlayMode" />
      <CommentHighlightView v-else-if="isHighlightMode" />
      <DanmuDisplayView v-else-if="isDisplayMode" />
      <DanmuView v-else-if="isDanmuMode" />
      <IndexView v-else />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue';
import { printInfo, printSKMCJ } from './utils/logUtil';

// 每个 Electron 窗口只加载自己需要的界面，避免四个窗口重复加载整套业务代码和样式。
const IndexView = defineAsyncComponent(() => import('./views/IndexView.vue'));
const DanmuView = defineAsyncComponent(() => import('./views/DanmuView.vue'));
const DanmuDisplayView = defineAsyncComponent(() => import('./views/DanmuDisplayView.vue'));
const CommentHighlightView = defineAsyncComponent(() => import('./views/CommentHighlightView.vue'));
const LiveOverlayView = defineAsyncComponent(() => import('./views/LiveOverlayView.vue'));

const isDanmuMode = computed(() => {
  return new URLSearchParams(location.search).has('danmu');
});
const isDisplayMode = computed(() => {
  return new URLSearchParams(location.search).has('display');
});
const isHighlightMode = computed(() => {
  return new URLSearchParams(location.search).has('highlight');
});
const isLiveOverlayMode = computed(() => {
  return new URLSearchParams(location.search).has('live-info');
});
const pageTitle = computed(() => {
  if (isLiveOverlayMode.value) return '直播顶部信息条（绿幕采集） - 抖音弹幕姬';
  if (isDisplayMode.value) return '直播弹幕互动';
  return isDanmuMode.value ? '弹幕充能大屏' : '抖音弹幕姬';
});
const pageSubtitle = computed(() => {
  if (isDisplayMode.value) return 'LIVE COMMENTS';
  return isDanmuMode.value ? 'LIVE WALL' : 'LIVE CONTROL';
});
const isElectron = Boolean(window.electronAPI?.isElectron);

// 非弹幕模式才显示启动信息
if (!isDanmuMode.value && !isDisplayMode.value && !isHighlightMode.value && !isLiveOverlayMode.value) {
  setTimeout(() => {
    console.clear();
    printSKMCJ();
    printInfo();
  }, 1500);
}
</script>

<style lang="scss">
::selection {
  background-color: #8b968d;
  color: #fff;
}

html,
body,
#app {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
}

.app-shell,
.app-content {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.app-content {
  overflow: hidden;
}

.electron-titlebar {
  height: 40px;
  padding: 0 150px 0 14px;
  display: flex;
  align-items: center;
  color: #5d696f;
  background: rgba(247, 246, 245, 0.98);
  border-bottom: 1px solid rgba(178, 191, 195, 0.42);
  box-sizing: border-box;
  -webkit-app-region: drag;
  user-select: none;
}

.electron-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: 'mkwxy', sans-serif;

  strong { font-size: 12px; font-weight: 700; }
  small { color: #a2adb3; font-size: 8px; letter-spacing: 0.12em; }
}

.electron-brand-mark {
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  color: #fff;
  border-radius: 7px;
  background: linear-gradient(135deg, #68be8d, #83ceb0);
  box-shadow: 0 4px 10px rgba(104, 190, 141, 0.25);
  font: 700 11px/1 sans-serif;
}

.app-shell.is-electron .app-content {
  height: calc(100% - 40px);
}

.app-shell.is-electron.is-danmu .app-content,
.app-shell.is-electron.is-display .app-content,
.app-shell.is-electron.is-live-overlay .app-content {
  height: 100%;
}

.app-shell.is-live-overlay,
.app-shell.is-live-overlay .app-content {
  background: #00ff00;
}

.app-shell.is-danmu .electron-titlebar,
.app-shell.is-display .electron-titlebar {
  color: #edf1ff;
  border-bottom-color: rgba(124, 143, 198, 0.16);
  background: #0b1028;
}

.app-shell.is-danmu .electron-brand-mark,
.app-shell.is-display .electron-brand-mark {
  background: linear-gradient(135deg, #667de8, #8b6dde);
  box-shadow: 0 4px 12px rgba(102, 125, 232, 0.28);
}

.app-shell.is-danmu .electron-brand small,
.app-shell.is-display .electron-brand small { color: #6d789d; }
</style>
