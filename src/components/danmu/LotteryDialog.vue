<template>
  <Transition name="dialog">
    <div v-if="state.lotteryResult" class="lottery-dialog-mask" @click.self="onClose">
      <div class="lottery-dialog">
        <!-- 装饰 -->
        <div class="dialog-confetti">
          <span v-for="i in 12" :key="i" class="confetti" :style="confettiStyle(i)">🎊</span>
        </div>

        <!-- 标题 -->
        <div class="dialog-header">
          <span class="header-emoji">🎉</span>
          <h2 class="header-title">HAPPY！</h2>
          <span class="header-emoji">🎉</span>
        </div>

        <!-- Happy 信息 -->
        <div class="dialog-body">
          <div class="winner-avatar-wrap">
            <img
              v-if="state.lotteryResult.avatar"
              class="winner-avatar"
              :src="state.lotteryResult.avatar"
              alt="" />
            <div class="avatar-ring"></div>
          </div>
          <div class="winner-info">
            <span class="winner-label">昵称</span>
            <span class="winner-nickname">{{ state.lotteryResult.nickname }}</span>
          </div>
          <div class="winner-danmu">
            <span class="danmu-label">Happy 弹幕</span>
            <span class="danmu-text">“<InlineEmojiText :content="state.lotteryResult.content" :emoji-url="state.lotteryResult.emojiUrl" />”</span>
          </div>
        </div>

        <!-- 底部 -->
        <div class="dialog-footer">
          <span class="lottery-count">第 {{ state.lotteryCount }} 次 Happy</span>
          <button class="dialog-btn" @click="onClose">继续</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { useDanmuState, closeLottery } from '@/danmu/store';
import InlineEmojiText from '@/components/InlineEmojiText.vue';

const state = useDanmuState();

function onClose() {
  closeLottery();
}

function confettiStyle(i: number) {
  const angle = (i / 12) * 360;
  const delay = Math.random() * 0.5;
  return {
    '--angle': `${angle}deg`,
    animationDelay: `${delay}s`
  };
}
</script>

<style lang="scss" scoped>
$gold: #ffd700;

.lottery-dialog-mask {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
}

.lottery-dialog {
  position: relative;
  width: 380px;
  background: linear-gradient(145deg, #1a1a2e, #16213e);
  border: 2px solid $gold;
  border-radius: 16px;
  padding: 32px 28px;
  box-shadow: 0 0 40px rgba(255, 215, 0, 0.3), 0 20px 60px rgba(0, 0, 0, 0.5);
}

.dialog-confetti {
  position: absolute;
  top: 50%;
  left: 50%;
  pointer-events: none;

  .confetti {
    position: absolute;
    font-size: 20px;
    animation: confettiBurst 1s ease-out forwards;
    opacity: 0;
  }
}

@keyframes confettiBurst {
  0% {
    transform: rotate(var(--angle)) translateY(0) scale(0);
    opacity: 1;
  }
  50% {
    opacity: 1;
  }
  100% {
    transform: rotate(var(--angle)) translateY(-120px) scale(1);
    opacity: 0;
  }
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-bottom: 24px;

  .header-emoji {
    font-size: 28px;
  }

  .header-title {
    font-size: 26px;
    color: $gold;
    margin: 0;
    text-shadow: 0 0 15px rgba(255, 215, 0, 0.5);
  }
}

.dialog-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.winner-avatar-wrap {
  position: relative;

  .winner-avatar {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    object-fit: cover;
    border: 3px solid $gold;
  }

  .avatar-ring {
    position: absolute;
    inset: -6px;
    border-radius: 50%;
    border: 2px solid transparent;
    border-top-color: $gold;
    animation: ringSpin 1.5s linear infinite;
  }
}

@keyframes ringSpin {
  to { transform: rotate(360deg); }
}

.winner-info,
.winner-danmu {
  text-align: center;

  .winner-label,
  .danmu-label {
    display: block;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.4);
    margin-bottom: 4px;
  }

  .winner-nickname {
    font-size: 22px;
    font-weight: bold;
    color: #fff;
  }

  .danmu-text {
    font-size: 16px;
    color: rgba(255, 255, 255, 0.85);
    font-style: italic;
  }
}

.dialog-footer {
  margin-top: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;

  .lottery-count {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.3);
  }

  .dialog-btn {
    padding: 8px 32px;
    background: linear-gradient(135deg, $gold, #ffab00);
    color: #1a1a2e;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: bold;
    cursor: pointer;
    transition: transform 0.15s;

    &:hover {
      transform: scale(1.05);
    }
    &:active {
      transform: scale(0.98);
    }
  }
}

// 过渡
.dialog-enter-active {
  transition: opacity 0.3s ease;
  .lottery-dialog {
    transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
}
.dialog-leave-active {
  transition: opacity 0.2s ease;
}
.dialog-enter-from {
  opacity: 0;
  .lottery-dialog {
    transform: scale(0.7);
  }
}
.dialog-leave-to {
  opacity: 0;
}
</style>
