<template>
  <Teleport to="body">
    <Transition name="lottery-fade">
      <div
        v-if="visible"
        class="lottery-overlay"
        :class="[`phase-${phase}`]"
      >
        <div class="screen-flash"></div>
        <div class="scan-lines"></div>

        <div class="energy-beams">
          <span v-for="item in 8" :key="item"></span>
        </div>

        <div class="background-particles">
          <i
            v-for="particle in particles"
            :key="particle.id"
            :style="particle.style"
          ></i>
        </div>

        <div v-if="phase === 'reveal'" class="confetti-layer">
          <i
            v-for="item in confetti"
            :key="item.id"
            :style="item.style"
          ></i>
        </div>

        <main class="lottery-arena">
          <div class="energy-ring ring-outer"></div>
          <div class="energy-ring ring-middle"></div>
          <div class="energy-ring ring-inner"></div>

          <div class="shockwave shockwave-one"></div>
          <div class="shockwave shockwave-two"></div>

          <header class="lottery-header">
            <div class="header-wing left"></div>
            <div class="lottery-title">
              <div class="title-bolt">
                <svg viewBox="0 0 40 48">
                  <path d="M25.6 1.5 4.8 27.4h13.5l-4.1 19.1L35.5 19.8H21.4z" fill="currentColor" />
                </svg>
              </div>
              <div class="title-content">
                <span class="title-main">弹幕能量抽奖</span>
                <span class="title-sub">DANMAKU ULTIMATE DRAW</span>
              </div>
            </div>
            <div class="header-wing right"></div>
          </header>

          <div class="phase-label">
            <span class="phase-dot"></span>
            {{ phaseText }}
            <span class="phase-dot"></span>
          </div>

          <!-- 轮播阶段 -->
          <section v-if="phase !== 'reveal'" class="roulette-stage">
            <div class="ghost-card ghost-card-left"></div>
            <div class="ghost-card ghost-card-right"></div>

            <Transition name="candidate-change" mode="out-in">
              <article
                v-if="displayDanmu"
                :key="rollingKey"
                class="candidate-card"
                :class="{}"
              >
                <div class="card-energy-border"></div>
                <div class="card-grid"></div>
                <div class="card-scan"></div>

                <div class="candidate-avatar">
                  <span class="avatar-fallback">{{ getInitial(displayDanmu.nickname) }}</span>
                  <img
                    v-if="displayDanmu.avatar"
                    :src="displayDanmu.avatar"
                    alt=""
                    @error="handleAvatarError"
                  />
                  <div class="avatar-ring"></div>
                </div>

                <div class="candidate-information">
                  <div class="candidate-label">
                    SCANNING DANMAKU
                  </div>
                  <h2>{{ displayDanmu.nickname }}</h2>
                  <p>{{ displayDanmu.content }}</p>
                </div>

                <div class="candidate-code">{{ formatCandidateCode(displayDanmu.id) }}</div>

              </article>
            </Transition>

            <div class="roulette-speed">
              <span class="speed-label">DRAW SPEED</span>
              <div class="speed-track">
                <i v-for="item in 20" :key="item"></i>
              </div>
              <span class="speed-value">MAX</span>
            </div>
          </section>

          <!-- 中奖揭晓 -->
          <Transition name="winner-reveal">
            <section v-if="phase === 'reveal' && winner" class="winner-stage">
              <div class="winner-rays"></div>

              <div class="winner-crown">
                <span></span>
                <strong>WINNER</strong>
                <span></span>
              </div>

              <article class="winner-card">
                <div class="winner-border"></div>
                <div class="winner-glow"></div>
                <div class="winner-shine"></div>

                <div class="winner-avatar">
                  <span class="avatar-fallback">{{ getInitial(winner.nickname) }}</span>
                  <img
                    v-if="winner.avatar"
                    :src="winner.avatar"
                    alt=""
                    @error="handleAvatarError"
                  />
                  <div class="winner-avatar-ring ring-a"></div>
                  <div class="winner-avatar-ring ring-b"></div>
                  <div class="winner-badge">
                    <svg viewBox="0 0 40 48">
                      <path d="M25.6 1.5 4.8 27.4h13.5l-4.1 19.1L35.5 19.8H21.4z" fill="currentColor" />
                    </svg>
                  </div>
                </div>

                <div class="winner-information">
                  <span class="winner-label">第 {{ drawNo }} 次能量抽奖</span>
                  <h1>{{ winner.nickname }}</h1>
                  <div class="winner-message">
                    <span class="quote quote-left">"</span>
                    <p>{{ winner.content }}</p>
                    <span class="quote quote-right">"</span>
                  </div>
                </div>

                <div class="winner-number">
                  <small>DRAW</small>
                  <strong>#{{ String(drawNo).padStart(3, '0') }}</strong>
                </div>
              </article>

              <div class="winner-result-text">
                <span>CONGRATULATIONS</span>
                <strong>恭喜中奖</strong>
              </div>

              <button class="close-button" type="button" @click="handleClose">
                <span>完成</span>
                <small>DONE</small>
              </button>
            </section>
          </Transition>
        </main>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { useDanmuState, settings, drawLottery, closeLottery, stopCollecting } from '@/danmu/store';
import { stopCharging, playLottery, playWinner, stopAll } from '@/danmu/audio';
import type { Danmu } from '@/danmu/types';

type LotteryPhase = 'ignition' | 'rolling' | 'reveal';

const state = useDanmuState();

const visible = ref(false);
const phase = ref<LotteryPhase>('ignition');
const winner = ref<Danmu | null>(null);
const rollingDanmu = ref<Danmu | null>(null);
const rollingKey = ref(0);
const drawNo = ref(0);

let timers: number[] = [];
let rollingTimer: number | null = null;
let animationToken = 0;

const displayDanmu = computed(() => {
  return rollingDanmu.value ?? winner.value;
});

const phaseText = computed(() => {
  const labels: Record<LotteryPhase, string> = {
    ignition: '能量解放',
    rolling: '正在扫描全部弹幕',
    reveal: '抽奖完成'
  };
  return labels[phase.value];
});

const particles = Array.from({ length: 36 }, (_, i) => ({
  id: i,
  style: {
    left: `${(i * 37) % 100}%`,
    top: `${18 + ((i * 29) % 72)}%`,
    width: `${2 + (i % 4)}px`,
    height: `${2 + (i % 4)}px`,
    animationDuration: `${2.2 + (i % 7) * 0.35}s`,
    animationDelay: `${-(i % 10) * 0.31}s`
  }
}));

const confetti = Array.from({ length: 60 }, (_, i) => ({
  id: i,
  style: {
    left: `${(i * 43) % 100}%`,
    '--confetti-delay': `${(i % 15) * -0.12}s`,
    '--confetti-duration': `${2.2 + (i % 8) * 0.18}s`,
    '--confetti-rotation': `${(i * 71) % 360}deg`,
    '--confetti-offset': `${-80 + ((i * 47) % 160)}px`
  }
}));

// 监听抽奖触发
watch(() => state.isLotteryActive, (active) => {
  if (active) startLotteryAnimation();
});

function schedule(callback: () => void, delay: number) {
  timers.push(window.setTimeout(callback, delay));
}

function clearAnimation() {
  animationToken++;
  timers.forEach(t => clearTimeout(t));
  timers = [];
  if (rollingTimer !== null) {
    clearTimeout(rollingTimer);
    rollingTimer = null;
  }
}

function getRandomCandidate(): Danmu | null {
  const pool = state.lotteryPool;
  if (pool.length === 0) return winner.value;
  return pool[Math.floor(Math.random() * pool.length)];
}

function runRoulette(token: number) {
  const startedAt = performance.now();
  const nextFrame = () => {
    if (token !== animationToken || !visible.value) return;
    const elapsed = performance.now() - startedAt;
    rollingDanmu.value = getRandomCandidate();
    rollingKey.value++;
    let delay = 55;
    if (elapsed > 1500) delay = 80;
    if (elapsed > 2200) delay = 120;
    if (elapsed > 2700) delay = 190;
    if (elapsed < 3000) {
      rollingTimer = window.setTimeout(nextFrame, delay);
    }
  };
  nextFrame();
}

function startLotteryAnimation() {
  clearAnimation();
  // 先确定中奖者
  const result = drawLottery();
  winner.value = result;
  drawNo.value = state.lotteryCount;

  const token = animationToken;
  phase.value = 'ignition';
  rollingDanmu.value = getRandomCandidate();
  rollingKey.value++;
  visible.value = true;
  document.body.style.overflow = 'hidden';

  // 停止充能音乐，播放抽奖音效（5s）
  stopCharging();
  playLottery();

  // 0~500ms：能量爆发
  schedule(() => {
    if (token !== animationToken) return;
    phase.value = 'rolling';
    runRoulette(token);
  }, 500);

  // 3500ms：直接揭晓中奖弹幕 + 播放中奖循环音乐
  schedule(() => {
    if (token !== animationToken) return;
    rollingDanmu.value = winner.value;
    rollingKey.value++;
    phase.value = 'reveal';
    playWinner();
  }, 3500);
}

function handleClose() {
  clearAnimation();
  document.body.style.overflow = '';
  visible.value = false;
  phase.value = 'ignition';
  closeLottery();
  stopCollecting();
  stopAll();
}

function handleAvatarError(e: Event) {
  (e.target as HTMLImageElement).style.display = 'none';
}

function getInitial(name: string) {
  return name?.trim().slice(0, 1).toUpperCase() || '?';
}

function formatCandidateCode(id: string) {
  const v = id || 'UNKNOWN';
  return v.length > 12 ? `${v.slice(0, 5)}...${v.slice(-4)}` : v;
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && visible.value && phase.value === 'reveal') {
    handleClose();
  }
}

onBeforeUnmount(() => {
  clearAnimation();
  document.body.style.overflow = '';
  window.removeEventListener('keydown', handleKeydown);
});

// 键盘监听
window.addEventListener('keydown', handleKeydown);
</script>

<style scoped>
.lottery-overlay {
  --cyan: #2df5ff;
  --blue: #2677ff;
  --violet: #8752ff;
  --purple: #d142ff;
  --gold: #ffd83d;
  --orange: #ff8a16;

  position: fixed;
  inset: 0;
  z-index: 99999;
  display: grid;
  place-items: center;
  overflow: hidden;
  color: #fff;
  isolation: isolate;
  font-family: Inter, "Microsoft YaHei", "PingFang SC", sans-serif;
  background:
    radial-gradient(circle at 50% 48%, rgba(54, 61, 179, 0.34), transparent 30%),
    radial-gradient(circle at 50% 50%, rgba(120, 46, 255, 0.2), transparent 55%),
    linear-gradient(145deg, rgba(4, 6, 24, 0.97), rgba(12, 8, 45, 0.98) 55%, rgba(4, 6, 25, 0.99));
  backdrop-filter: blur(16px);
}

.screen-flash { position: absolute; inset: 0; z-index: 50; opacity: 0; pointer-events: none; }

.scan-lines {
  position: absolute; inset: 0; z-index: -1; pointer-events: none; opacity: 0.28;
  background: repeating-linear-gradient(0deg, transparent 0 4px, rgba(91, 127, 255, 0.07) 5px);
}

.scan-lines::after {
  content: ""; position: absolute; left: 0; right: 0; top: -30%; height: 22%;
  background: linear-gradient(180deg, transparent, rgba(59, 220, 255, 0.08), transparent);
  animation: globalScan 4s linear infinite;
}

.energy-beams { position: absolute; inset: 0; z-index: -2; overflow: hidden; pointer-events: none; }

.energy-beams span {
  position: absolute; top: 50%; left: 50%; width: 110vw; height: 2px; transform-origin: center left;
  background: linear-gradient(90deg, rgba(45, 245, 255, 0), rgba(45, 245, 255, 0.7), rgba(135, 82, 255, 0));
  box-shadow: 0 0 14px rgba(45, 245, 255, 0.65); opacity: 0.2;
}

.energy-beams span:nth-child(1) { transform: rotate(0deg); }
.energy-beams span:nth-child(2) { transform: rotate(45deg); }
.energy-beams span:nth-child(3) { transform: rotate(90deg); }
.energy-beams span:nth-child(4) { transform: rotate(135deg); }
.energy-beams span:nth-child(5) { transform: rotate(180deg); }
.energy-beams span:nth-child(6) { transform: rotate(225deg); }
.energy-beams span:nth-child(7) { transform: rotate(270deg); }
.energy-beams span:nth-child(8) { transform: rotate(315deg); }

.lottery-arena {
  position: relative; width: min(1040px, calc(100vw - 40px)); min-height: 680px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; perspective: 1200px;
}

/* 能量环 */
.energy-ring { position: absolute; left: 50%; top: 51%; border-radius: 50%; pointer-events: none; }

.ring-outer {
  width: 730px; height: 730px; border: 1px solid rgba(86, 124, 255, 0.2);
  transform: translate(-50%, -50%); animation: ringRotate 18s linear infinite;
}

.ring-outer::before, .ring-outer::after {
  content: ""; position: absolute; inset: -2px; border-radius: inherit;
  border-top: 3px solid var(--cyan); border-right: 3px solid transparent;
  filter: drop-shadow(0 0 10px var(--cyan));
}

.ring-outer::after { transform: rotate(180deg); border-top-color: var(--violet); filter: drop-shadow(0 0 10px var(--violet)); }

.ring-middle {
  width: 580px; height: 580px; border: 2px dashed rgba(110, 100, 255, 0.28);
  transform: translate(-50%, -50%); animation: ringReverse 12s linear infinite;
}

.ring-inner {
  width: 430px; height: 430px; transform: translate(-50%, -50%);
  background: radial-gradient(circle, rgba(35, 220, 255, 0.12), transparent 62%);
  border: 1px solid rgba(45, 245, 255, 0.18);
  box-shadow: inset 0 0 50px rgba(44, 99, 255, 0.16), 0 0 90px rgba(118, 66, 255, 0.13);
  animation: innerPulse 1.8s ease-in-out infinite;
}

/* 冲击波 */
.shockwave {
  position: absolute; left: 50%; top: 51%; width: 150px; height: 150px;
  border-radius: 50%; border: 3px solid var(--cyan); transform: translate(-50%, -50%);
  opacity: 0; pointer-events: none;
}

.phase-ignition .shockwave-one { animation: shockwave 1.1s ease-out; }
.phase-ignition .shockwave-two { animation: shockwave 1.1s 0.22s ease-out; }

/* 标题 */
.lottery-header {
  position: relative; z-index: 10; display: flex; align-items: center;
  width: min(850px, 88vw); margin-bottom: 14px;
}

.header-wing { flex: 1; height: 18px; border-bottom: 2px solid rgba(92, 128, 255, 0.7); filter: drop-shadow(0 0 7px rgba(70, 121, 255, 0.8)); }

.header-wing.left { clip-path: polygon(0 65%, 78% 65%, 86% 100%, 100% 100%, 91% 42%, 0 42%); }
.header-wing.right { transform: scaleX(-1); clip-path: polygon(0 65%, 78% 65%, 86% 100%, 100% 100%, 91% 42%, 0 42%); }

.lottery-title { display: flex; align-items: center; gap: 14px; padding: 12px 30px; }

.title-bolt {
  width: 33px; height: 41px; color: var(--gold);
  filter: drop-shadow(0 0 4px #fff) drop-shadow(0 0 12px var(--gold)) drop-shadow(0 0 24px var(--orange));
  animation: titleBolt 1.1s ease-in-out infinite;
}

.title-bolt svg { width: 100%; height: 100%; }
.title-content { display: flex; flex-direction: column; }

.title-main {
  font-size: 29px; font-weight: 950; font-style: italic; letter-spacing: 6px;
  background: linear-gradient(180deg, #fff, #dff9ff 42%, #56d9ff 76%, #7563ff);
  -webkit-background-clip: text; color: transparent;
  filter: drop-shadow(0 3px 0 rgba(8, 20, 80, 0.9)) drop-shadow(0 0 8px rgba(45, 245, 255, 0.55));
}

.title-sub { margin-top: 7px; color: rgba(144, 195, 255, 0.5); font-size: 8px; letter-spacing: 5px; }

/* 阶段文字 */
.phase-label {
  position: relative; z-index: 10; display: flex; align-items: center; gap: 12px;
  min-width: 280px; justify-content: center; margin-bottom: 28px;
  color: rgba(181, 222, 255, 0.75); font-size: 11px; font-weight: 800; letter-spacing: 4px;
}

.phase-dot {
  width: 5px; height: 5px; border-radius: 50%; background: var(--cyan);
  box-shadow: 0 0 6px var(--cyan), 0 0 14px var(--blue);
  animation: phaseBlink 0.7s steps(2) infinite;
}

/* 轮播舞台 */
.roulette-stage {
  position: relative; z-index: 12; width: min(820px, calc(100vw - 50px));
  height: 350px; display: flex; flex-direction: column; align-items: center;
}

.ghost-card {
  position: absolute; top: 32px; width: 78%; height: 200px;
  clip-path: polygon(5% 0, 95% 0, 100% 50%, 95% 100%, 5% 100%, 0 50%);
  border: 1px solid rgba(82, 122, 255, 0.17); background: rgba(24, 27, 70, 0.2);
}

.ghost-card-left { left: -90px; transform: rotateY(48deg) scale(0.82); }
.ghost-card-right { right: -90px; transform: rotateY(-48deg) scale(0.82); }

/* 候选卡片 */
.candidate-card {
  position: relative; display: grid; grid-template-columns: 135px 1fr auto;
  align-items: center; gap: 26px; width: 100%; min-height: 214px; padding: 34px 48px;
  overflow: hidden;
  clip-path: polygon(5% 0, 95% 0, 100% 50%, 95% 100%, 5% 100%, 0 50%);
  background: linear-gradient(115deg, rgba(9, 18, 57, 0.98), rgba(20, 24, 78, 0.96) 50%, rgba(30, 15, 74, 0.97));
  box-shadow: 0 0 25px rgba(40, 126, 255, 0.35), 0 0 75px rgba(97, 58, 255, 0.2);
  transform: translateZ(30px);
}

.card-energy-border {
  position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(90deg, var(--cyan), var(--blue), var(--violet), var(--purple));
  clip-path: polygon(5% 0, 95% 0, 100% 50%, 95% 100%, 5% 100%, 0 50%, 5% 3px, 5.2% calc(100% - 3px), 94.8% calc(100% - 3px), calc(100% - 4px) 50%, 94.8% 3px);
  filter: drop-shadow(0 0 5px var(--cyan)) drop-shadow(0 0 13px var(--blue));
}

.card-grid {
  position: absolute; inset: 0; pointer-events: none; opacity: 0.28;
  background: repeating-linear-gradient(0deg, transparent 0 8px, rgba(75, 154, 255, 0.11) 9px),
    repeating-linear-gradient(90deg, transparent 0 52px, rgba(91, 97, 255, 0.09) 53px);
}

.card-scan {
  position: absolute; top: 0; bottom: 0; left: -180px; width: 130px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.08), rgba(84, 232, 255, 0.4), transparent);
  transform: skewX(-17deg); animation: cardScan 1.4s linear infinite;
}

/* 头像 */
.candidate-avatar, .winner-avatar { position: relative; display: grid; place-items: center; flex-shrink: 0; }
.candidate-avatar { width: 112px; height: 112px; }

.candidate-avatar img, .winner-avatar img {
  position: absolute; inset: 7px; z-index: 2; width: calc(100% - 14px); height: calc(100% - 14px);
  object-fit: cover; border-radius: 50%;
}

.avatar-fallback {
  position: absolute; inset: 7px; display: grid; place-items: center; border-radius: 50%;
  background: linear-gradient(135deg, #165de8, #7c46ff); color: #fff; font-size: 40px; font-weight: 950;
}

.avatar-ring {
  position: absolute; inset: 0; border-radius: 50%; border: 3px solid var(--cyan);
  box-shadow: 0 0 12px var(--cyan), inset 0 0 15px rgba(33, 195, 255, 0.4);
  animation: avatarRing 1.4s linear infinite;
}

.avatar-ring::before {
  content: ""; position: absolute; inset: -9px; border-radius: inherit;
  border: 1px dashed rgba(130, 111, 255, 0.65); animation: ringReverse 5s linear infinite;
}

/* 候选信息 */
.candidate-information { position: relative; z-index: 3; min-width: 0; }

.candidate-label {
  margin-bottom: 10px; color: var(--cyan); font-size: 9px; font-weight: 900;
  letter-spacing: 4px; text-shadow: 0 0 8px var(--cyan);
}

.candidate-information h2 {
  margin: 0 0 12px; overflow: hidden; color: #fff; font-size: 30px; font-weight: 950;
  letter-spacing: 2px; text-overflow: ellipsis; white-space: nowrap;
  text-shadow: 0 3px 0 rgba(13, 20, 68, 0.9), 0 0 12px rgba(79, 210, 255, 0.5);
}

.candidate-information p {
  display: -webkit-box; max-width: 500px; margin: 0; overflow: hidden;
  color: rgba(226, 239, 255, 0.82); font-size: 17px; line-height: 1.65;
  -webkit-line-clamp: 2; -webkit-box-orient: vertical;
}

.candidate-code {
  align-self: start; margin-top: 4px; color: rgba(137, 170, 230, 0.32);
  font-size: 8px; letter-spacing: 2px; writing-mode: vertical-rl;
}


/* 速度条 */
.roulette-speed {
  display: grid; grid-template-columns: auto 1fr auto; align-items: center;
  gap: 14px; width: 82%; margin-top: 27px;
}

.speed-label, .speed-value { color: rgba(146, 200, 255, 0.54); font-size: 8px; font-weight: 900; letter-spacing: 2px; }
.speed-value { color: var(--cyan); }

.speed-track { display: grid; grid-template-columns: repeat(20, 1fr); gap: 3px; height: 7px; }

.speed-track i {
  background: linear-gradient(90deg, var(--cyan), var(--blue)); transform: skewX(-20deg);
  box-shadow: 0 0 6px var(--cyan); animation: speedPulse 0.5s ease-in-out infinite alternate;
}

.speed-track i:nth-child(3n) { animation-delay: -0.2s; }
.speed-track i:nth-child(4n) { animation-delay: -0.35s; }

/* 中奖舞台 */
.winner-stage { position: relative; z-index: 20; width: min(890px, calc(100vw - 40px)); display: flex; flex-direction: column; align-items: center; }

.winner-rays {
  position: absolute; left: 50%; top: 38%; width: 850px; height: 850px; pointer-events: none;
  transform: translate(-50%, -50%);
  background: repeating-conic-gradient(from 0deg, rgba(255, 215, 55, 0.32) 0deg 2deg, transparent 2deg 13deg);
  mask-image: radial-gradient(circle, #000, transparent 67%);
  animation: winnerRays 13s linear infinite;
}

.winner-crown { position: relative; z-index: 4; display: flex; align-items: center; gap: 20px; margin-bottom: 16px; }

.winner-crown span {
  width: 120px; height: 2px;
  background: linear-gradient(90deg, transparent, #ffd83d); box-shadow: 0 0 10px #ffd83d;
}

.winner-crown span:last-child { transform: scaleX(-1); }

.winner-crown strong {
  color: #fff8bd; font-size: 16px; font-style: italic; letter-spacing: 8px;
  text-shadow: 0 0 5px #fff, 0 0 14px #ffd83d, 0 0 30px #ff8a00;
}

/* 中奖卡片 */
.winner-card {
  position: relative; display: grid; grid-template-columns: 185px 1fr auto;
  align-items: center; gap: 32px; width: 100%; min-height: 270px; padding: 42px 55px;
  overflow: hidden;
  clip-path: polygon(4% 0, 96% 0, 100% 50%, 96% 100%, 4% 100%, 0 50%);
  background: radial-gradient(circle at 22% 50%, rgba(255, 196, 26, 0.18), transparent 30%),
    linear-gradient(115deg, rgba(36, 23, 6, 0.98), rgba(25, 17, 30, 0.98) 48%, rgba(54, 19, 20, 0.98));
  box-shadow: 0 0 25px rgba(255, 211, 50, 0.55), 0 0 80px rgba(255, 117, 20, 0.3);
  animation: winnerCardFloat 2.6s ease-in-out infinite;
}

.winner-border {
  position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(90deg, #ff9500, #fff4a1, #ffd52f, #ff8200);
  clip-path: polygon(4% 0, 96% 0, 100% 50%, 96% 100%, 4% 100%, 0 50%, 4% 4px, 4.3% calc(100% - 4px), 95.7% calc(100% - 4px), calc(100% - 5px) 50%, 95.7% 4px);
  filter: drop-shadow(0 0 6px #fff4ad) drop-shadow(0 0 17px #ffb300);
}

.winner-glow {
  position: absolute; left: -18%; top: -50%; width: 55%; height: 200%;
  background: radial-gradient(ellipse, rgba(255, 241, 163, 0.28), transparent 65%);
  animation: winnerGlow 1.2s ease-in-out infinite alternate;
}

.winner-shine {
  position: absolute; top: -40%; bottom: -40%; left: -250px; width: 150px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.6), transparent);
  transform: rotate(17deg); animation: winnerShine 2.5s ease-in-out infinite;
}

/* 中奖头像 */
.winner-avatar { width: 160px; height: 160px; }
.winner-avatar .avatar-fallback { inset: 11px; font-size: 56px; background: linear-gradient(135deg, #ff9400, #ffd941); }
.winner-avatar img { inset: 11px; width: calc(100% - 22px); height: calc(100% - 22px); }

.winner-avatar-ring { position: absolute; border-radius: 50%; }

.winner-avatar-ring.ring-a {
  inset: 0; border: 4px solid #ffd83d;
  box-shadow: 0 0 13px #ffd83d, 0 0 30px rgba(255, 138, 0, 0.75);
  animation: spin 4s linear infinite;
}

.winner-avatar-ring.ring-b {
  inset: -12px; border: 2px dashed rgba(255, 244, 170, 0.7); animation: spinReverse 6s linear infinite;
}

.winner-badge {
  position: absolute; z-index: 5; right: -3px; bottom: -3px;
  display: grid; place-items: center; width: 48px; height: 48px; border-radius: 50%;
  color: #fff8b3; background: linear-gradient(135deg, #ffb000, #ff6a00);
  border: 3px solid #fff2a0; box-shadow: 0 0 9px #fff, 0 0 21px #ffae00;
}

.winner-badge svg { width: 23px; height: 28px; }

/* 中奖信息 */
.winner-information { position: relative; z-index: 3; min-width: 0; }

.winner-label { color: #ffd83d; font-size: 11px; font-weight: 900; letter-spacing: 4px; text-shadow: 0 0 10px #ff9d00; }

.winner-information h1 {
  margin: 10px 0 17px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 42px; font-weight: 950; font-style: italic; letter-spacing: 3px;
  background: linear-gradient(180deg, #fff, #fff8c7 43%, #ffd943 78%, #ff8a00);
  -webkit-background-clip: text; color: transparent;
  filter: drop-shadow(0 3px 0 rgba(95, 39, 0, 0.85)) drop-shadow(0 0 12px rgba(255, 196, 24, 0.62));
}

.winner-message {
  position: relative; max-width: 480px; padding: 15px 32px;
  color: rgba(255, 249, 220, 0.88); background: rgba(255, 200, 72, 0.07);
  border-left: 2px solid rgba(255, 213, 64, 0.7); font-size: 18px; line-height: 1.6;
}

.winner-message p { display: -webkit-box; margin: 0; overflow: hidden; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }

.quote { position: absolute; color: rgba(255, 221, 103, 0.35); font-family: Georgia, serif; font-size: 45px; line-height: 1; }
.quote-left { left: 8px; top: 3px; }
.quote-right { right: 8px; bottom: -12px; }

.winner-number {
  display: flex; flex-direction: column; align-items: flex-end; align-self: start;
  color: rgba(255, 221, 109, 0.42); font-style: italic;
}

.winner-number small { font-size: 8px; letter-spacing: 3px; }
.winner-number strong { margin-top: 3px; font-size: 21px; }

.winner-result-text { position: relative; z-index: 4; display: flex; flex-direction: column; align-items: center; margin-top: 22px; }

.winner-result-text span { color: rgba(255, 214, 70, 0.55); font-size: 9px; font-weight: 900; letter-spacing: 9px; }

.winner-result-text strong {
  margin-top: 6px; color: #fff; font-size: 25px; font-style: italic; letter-spacing: 8px;
  text-shadow: 0 0 5px #fff, 0 0 13px #ffd83d, 0 0 28px #ff8500;
}

/* 关闭按钮 */
.close-button {
  position: relative; z-index: 6; display: flex; align-items: center; gap: 15px;
  margin-top: 25px; padding: 12px 32px; cursor: pointer; color: #fff;
  background: linear-gradient(100deg, rgba(255, 165, 0, 0.22), rgba(255, 214, 61, 0.34), rgba(255, 116, 0, 0.22));
  border: 1px solid rgba(255, 222, 103, 0.8);
  clip-path: polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%);
  box-shadow: inset 0 0 12px rgba(255, 223, 89, 0.1), 0 0 16px rgba(255, 171, 0, 0.2);
  transition: transform 180ms ease, box-shadow 180ms ease, filter 180ms ease;
}

.close-button:hover {
  transform: translateY(-2px) scale(1.03); filter: brightness(1.2);
  box-shadow: inset 0 0 18px rgba(255, 233, 142, 0.22), 0 0 25px rgba(255, 180, 0, 0.5);
}

.close-button span { font-size: 14px; font-weight: 900; letter-spacing: 3px; }
.close-button small { color: rgba(255, 244, 191, 0.55); font-size: 7px; letter-spacing: 2px; }

/* 粒子 */
.background-particles { position: absolute; inset: 0; z-index: -1; pointer-events: none; }

.background-particles i {
  position: absolute; border-radius: 50%; background: var(--cyan);
  box-shadow: 0 0 6px var(--cyan), 0 0 14px var(--violet);
  animation: particleFloat linear infinite;
}

/* 彩纸 */
.confetti-layer { position: absolute; inset: 0; z-index: 30; overflow: hidden; pointer-events: none; }

.confetti-layer i {
  position: absolute; top: -30px; width: 7px; height: 18px;
  background: linear-gradient(180deg, #fff7b0, #ffc400, #ff7300);
  box-shadow: 0 0 8px rgba(255, 199, 41, 0.7);
  animation: confettiFall var(--confetti-duration) var(--confetti-delay) linear infinite;
}

/* 阶段特效 */
.phase-ignition .lottery-arena { animation: ignitionShake 0.65s ease-out; }

.phase-reveal {
  background:
    radial-gradient(circle at 50% 48%, rgba(255, 170, 20, 0.27), transparent 32%),
    radial-gradient(circle at 50% 50%, rgba(255, 211, 55, 0.12), transparent 62%),
    linear-gradient(145deg, rgba(20, 10, 4, 0.98), rgba(39, 13, 21, 0.98) 55%, rgba(13, 7, 25, 0.99));
}

.phase-reveal .screen-flash { animation: revealFlash 1.1s ease-out forwards; }

/* 转场 */
.candidate-change-enter-active { animation: candidateEnter 0.14s ease-out; }
.candidate-change-leave-active { animation: candidateLeave 0.1s ease-in; }
.winner-reveal-enter-active { animation: winnerStageReveal 0.85s cubic-bezier(0.18, 1.25, 0.32, 1); }
.lottery-fade-enter-active { transition: opacity 0.35s ease; }
.lottery-fade-leave-active { transition: opacity 0.3s ease; }
.lottery-fade-enter-from, .lottery-fade-leave-to { opacity: 0; }

/* 动画 */
@keyframes globalScan { from { transform: translateY(0); } to { transform: translateY(650%); } }
@keyframes ringRotate { to { transform: translate(-50%, -50%) rotate(360deg); } }
@keyframes ringReverse { to { transform: translate(-50%, -50%) rotate(-360deg); } }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes spinReverse { to { transform: rotate(-360deg); } }
@keyframes innerPulse { 50% { opacity: 0.72; transform: translate(-50%, -50%) scale(1.07); } }
@keyframes shockwave { 0% { opacity: 1; transform: translate(-50%, -50%) scale(0.2); } 100% { opacity: 0; transform: translate(-50%, -50%) scale(6); } }
@keyframes titleBolt { 50% { transform: scale(1.12) rotate(3deg); filter: drop-shadow(0 0 5px #fff) drop-shadow(0 0 17px var(--gold)) drop-shadow(0 0 31px var(--orange)); } }
@keyframes phaseBlink { 50% { opacity: 0.3; } }
@keyframes cardScan { to { left: calc(100% + 100px); } }
@keyframes avatarRing { 50% { box-shadow: 0 0 22px var(--cyan), inset 0 0 24px rgba(33, 195, 255, 0.56); } }
@keyframes speedPulse { from { opacity: 0.35; } to { opacity: 1; } }
@keyframes winnerRays { to { transform: translate(-50%, -50%) rotate(360deg); } }
@keyframes winnerCardFloat { 50% { transform: translateY(-7px); } }
@keyframes winnerGlow { to { opacity: 1.5; transform: scale(1.18); } }
@keyframes winnerShine { 0%, 35% { left: -250px; } 75%, 100% { left: calc(100% + 180px); } }
@keyframes particleFloat { 0% { opacity: 0; transform: translateY(25px) scale(0.4); } 25% { opacity: 0.9; } 100% { opacity: 0; transform: translateY(-130px) translateX(35px) scale(1.3); } }
@keyframes confettiFall { 0% { opacity: 1; transform: translate3d(0, -30px, 0) rotate(var(--confetti-rotation)); } 100% { opacity: 0.25; transform: translate3d(var(--confetti-offset), 110vh, 0) rotate(calc(var(--confetti-rotation) + 720deg)); } }
@keyframes ignitionShake { 0% { transform: scale(0.86); filter: brightness(3); } 35% { transform: scale(1.04) translateX(-5px); } 55% { transform: scale(0.99) translateX(5px); } 100% { transform: scale(1) translateX(0); filter: brightness(1); } }
@keyframes revealFlash { 0% { position: absolute; inset: 0; z-index: 50; opacity: 1; background: #fff; } 20% { opacity: 0.9; } 100% { opacity: 0; background: #ffd83d; pointer-events: none; } }
@keyframes candidateEnter { from { opacity: 0; filter: blur(8px); transform: translateX(75px) scaleX(0.9); } to { opacity: 1; filter: blur(0); transform: translateX(0) scaleX(1); } }
@keyframes candidateLeave { to { opacity: 0; filter: blur(8px); transform: translateX(-70px) scaleX(0.92); } }
@keyframes winnerStageReveal { 0% { opacity: 0; filter: brightness(3) blur(10px); transform: scale(1.45) translateZ(200px); } 55% { opacity: 1; filter: brightness(1.5) blur(0); transform: scale(0.96) translateZ(0); } 100% { filter: brightness(1); transform: scale(1); } }

@media (max-width: 720px) {
  .lottery-arena { width: calc(100vw - 18px); min-height: 600px; }
  .energy-ring { transform: translate(-50%, -50%) scale(0.75); }
  .lottery-header { width: 96%; }
  .header-wing { display: none; }
  .lottery-title { margin: auto; }
  .title-main { font-size: 22px; letter-spacing: 3px; }
  .roulette-stage { width: calc(100vw - 24px); }
  .candidate-card { grid-template-columns: 86px 1fr; gap: 18px; min-height: 185px; padding: 28px 30px; }
  .candidate-avatar { width: 80px; height: 80px; }
  .candidate-information h2 { font-size: 23px; }
  .candidate-information p { font-size: 14px; }
  .candidate-code { display: none; }
  .winner-card { grid-template-columns: 110px 1fr; gap: 19px; min-height: 235px; padding: 32px 30px; }
  .winner-avatar { width: 105px; height: 105px; }
  .winner-information h1 { font-size: 28px; }
  .winner-message { padding: 11px 20px; font-size: 14px; }
  .winner-number { display: none; }
  .winner-crown span { width: 55px; }
}

@media (prefers-reduced-motion: reduce) {
  .lottery-overlay *, .lottery-overlay *::before, .lottery-overlay *::after {
    animation-duration: 0.001ms !important; animation-iteration-count: 1 !important;
  }
}
</style>
