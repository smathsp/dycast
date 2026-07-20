<template>
  <div class="danmu-view">
    <!-- 左上角隐藏历史按钮 -->
    <div class="history-zone">
      <button class="history-btn" @click.stop="showHistory = true" title="中奖记录">
        <span class="trophy-icon">🏆</span>
      </button>
    </div>

    <!-- 右上角隐藏设置按钮 -->
    <div class="settings-zone">
      <button class="settings-btn" @click.stop="showSettings = true" title="设置">
        <span class="gear-icon">⚙</span>
      </button>
    </div>

    <!-- 待机画面 -->
    <ChargingStart v-if="!state.isCollecting" />

    <!-- 弹幕墙 -->
    <div class="danmu-main" v-if="state.isCollecting">
      <DanmuWall />
    </div>

    <!-- 底部能量条 -->
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
    <!-- 中奖记录 -->
    <WinnerHistoryModal
      :visible="showHistory"
      :winners="state.lotteryHistory"
      :draw-no="state.lotteryCount"
      @close="showHistory = false"
      @clear="handleClearHistory"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import ChargingStart from '@/components/danmu/ChargingStart.vue';
import DanmuWall from '@/components/danmu/DanmuWall.vue';
import EnergyBar from '@/components/danmu/EnergyBar.vue';
import LotteryAnimation from '@/components/danmu/LotteryAnimation.vue';
import SettingsDialog from '@/components/danmu/SettingsDialog.vue';
import WinnerHistoryModal from '@/components/danmu/WinnerHistoryModal.vue';
import { useDanmuState, startListening, stopListening, stopCollecting, clearLotteryHistory } from '@/danmu/store';
import { stopAll } from '@/danmu/audio';

const state = useDanmuState();
const showSettings = ref(false);
const showHistory = ref(false);

function handleStop() {
  stopAll();
  stopCollecting();
}

function handleClearHistory() {
  if (confirm('确定清空全部中奖记录吗？该操作无法撤销。')) {
    clearLotteryHistory();
  }
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

.history-zone {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 100;
  padding: 12px;

  .history-btn {
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
    font-size: 16px;

    &:hover {
      background: rgba(255, 215, 0, 0.15);
      border-color: rgba(255, 215, 0, 0.3);
    }
  }

  &:hover .history-btn {
    opacity: 1;
  }
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
