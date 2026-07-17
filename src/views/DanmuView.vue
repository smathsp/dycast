<template>
  <div class="danmu-view">
    <!-- 右上角隐藏设置按钮 -->
    <div class="settings-zone">
      <button class="settings-btn" @click.stop="showSettings = true" title="设置">
        <span class="gear-icon">⚙</span>
      </button>
    </div>

    <!-- 弹幕墙（主体区域） -->
    <div class="danmu-main">
      <DanmuWall />
    </div>

    <!-- 底部浮动信息 -->
    <div class="danmu-hud">
      <div class="hud-center">
        <EnergyBar />
      </div>
    </div>

    <!-- 抽奖动画叠加层 -->
    <LotteryAnimation />
    <!-- 设置弹窗 -->
    <SettingsDialog :visible="showSettings" @close="showSettings = false" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import DanmuWall from '@/components/danmu/DanmuWall.vue';
import EnergyBar from '@/components/danmu/EnergyBar.vue';
import LotteryAnimation from '@/components/danmu/LotteryAnimation.vue';
import SettingsDialog from '@/components/danmu/SettingsDialog.vue';
import { startListening, stopListening } from '@/danmu/store';

const showSettings = ref(false);

onMounted(() => {
  startListening();
});

onUnmounted(() => {
  stopListening();
});
</script>

<style lang="scss" scoped>
.danmu-view {
  position: relative;
  width: 100%;
  height: 100vh;
  background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  user-select: none;
}

.settings-zone {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 100;
  padding: 12px;

  .settings-btn {
    opacity: 0;
    transition: opacity 0.3s;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: rgba(255, 255, 255, 0.6);
    font-size: 18px;

    &:hover {
      background: rgba(255, 255, 255, 0.15);
      color: #fff;
    }
  }

  &:hover .settings-btn {
    opacity: 1;
  }
}

.danmu-main {
  flex: 1;
  min-height: 0;
  position: relative;
}

// ===== 底部 HUD =====
.danmu-hud {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 50;
  pointer-events: none;
  padding-bottom: 10px;

  .hud-center {
    width: min(70vw, 1100px);
    min-width: 760px;
    margin: 0 auto;
    pointer-events: auto;
    transform: translateY(-18px);
  }
}
</style>
