<template>
  <div class="danmu-view">
    <!-- 右上角隐藏设置按钮 -->
    <div class="settings-zone">
      <button class="settings-btn" @click.stop="showSettings = true" title="设置">
        <span class="gear-icon">⚙</span>
      </button>
    </div>

    <!-- 弹幕墙（攒能量时才显示） -->
    <div class="danmu-main" v-if="state.isCollecting">
      <DanmuWall />
    </div>

    <!-- 待机画面（未开始攒能量时） -->
    <div class="standby-screen" v-if="!state.isCollecting">
      <div class="standby-info">
        <div class="standby-icon">⚡</div>
        <div class="standby-title">弹幕充能</div>
        <div class="standby-desc">总计 {{ state.totalPoolCount.toLocaleString() }} 条弹幕</div>
        <button class="start-btn" @click="handleStart">
          <span class="btn-bolt">⚡</span>
          <span>开始攒能量</span>
        </button>
      </div>
    </div>

    <!-- 底部能量条（攒能量时才显示） -->
    <div class="danmu-hud" v-if="state.isCollecting">
      <div class="hud-center">
        <EnergyBar />
      </div>
      <button class="stop-btn" @click="handleStop">停止</button>
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
import { useDanmuState, startListening, stopListening, startCollecting, stopCollecting } from '@/danmu/store';

const state = useDanmuState();
const showSettings = ref(false);

function handleStart() {
  startCollecting();
}

function handleStop() {
  stopCollecting();
}

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

// ===== 待机画面 =====
.standby-screen {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.standby-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.standby-icon {
  font-size: 64px;
  animation: standbyPulse 2s ease-in-out infinite;
}

@keyframes standbyPulse {
  0%, 100% { transform: scale(1); opacity: 0.6; }
  50% { transform: scale(1.1); opacity: 1; }
}

.standby-title {
  font-size: 28px;
  font-weight: 900;
  color: #fff;
  letter-spacing: 4px;
  text-shadow: 0 0 15px rgba(0, 229, 255, 0.5);
}

.standby-desc {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.4);
}

.start-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  padding: 14px 36px;
  background: linear-gradient(135deg, rgba(0, 229, 255, 0.2), rgba(41, 121, 255, 0.3));
  border: 1px solid rgba(0, 229, 255, 0.5);
  border-radius: 12px;
  color: #fff;
  font-size: 18px;
  font-weight: 800;
  letter-spacing: 3px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 0 20px rgba(0, 229, 255, 0.2);

  &:hover {
    background: linear-gradient(135deg, rgba(0, 229, 255, 0.3), rgba(41, 121, 255, 0.45));
    box-shadow: 0 0 30px rgba(0, 229, 255, 0.4);
    transform: translateY(-2px);
  }

  .btn-bolt {
    font-size: 22px;
  }
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
    width: 80%;
    max-width: 900px;
    margin: 0 auto;
    pointer-events: auto;
  }

  .stop-btn {
    position: absolute;
    right: 20px;
    bottom: 16px;
    pointer-events: auto;
    padding: 6px 18px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.5);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;

    &:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
      border-color: rgba(255, 255, 255, 0.3);
    }
  }
}
</style>
