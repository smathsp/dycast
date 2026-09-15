<template>
  <section class="charging-start" :class="{ 'is-starting': starting }">
    <!-- 背景 -->
    <div class="background-layer" aria-hidden="true">
      <div class="background-glow"></div>
      <div class="background-grid"></div>
      <div class="background-vignette"></div>
      <div class="scan-line"></div>
    </div>

    <!-- 漂浮粒子 -->
    <div class="particle-layer" aria-hidden="true">
      <i v-for="particle in particles" :key="particle.id" :style="particle.style"></i>
    </div>

    <!-- 两侧装饰线 -->
    <div class="side-decoration side-decoration-left">
      <span></span><span></span><span></span>
    </div>
    <div class="side-decoration side-decoration-right">
      <span></span><span></span><span></span>
    </div>

    <!-- 主内容 -->
    <main class="energy-panel">
      <!-- 顶部状态 -->
      <div class="system-status">
        <span class="status-line"></span>
        <div class="status-content">
          <span class="status-dot"></span>
          <span>ENERGY SYSTEM ONLINE</span>
        </div>
        <span class="status-line"></span>
      </div>

      <!-- 能量核心 -->
      <div class="energy-core">
        <div class="core-aura"></div>
        <div class="energy-ring ring-outer">
          <span></span><span></span><span></span><span></span>
        </div>
        <div class="energy-ring ring-middle"></div>
        <div class="energy-ring ring-inner"></div>
        <div class="core-lightning">
          <svg viewBox="0 0 100 120" aria-hidden="true">
            <path d="M63 4 12 68h34l-10 48 53-68H55z" fill="currentColor" />
          </svg>
          <div class="lightning-flare"></div>
        </div>
        <div class="core-pulse pulse-one"></div>
        <div class="core-pulse pulse-two"></div>
      </div>

      <!-- 标题 -->
      <div class="title-block">
        <div class="title-eyebrow">DANMAKU ENERGY CORE</div>
        <h1>弹幕充能</h1>
        <p>收集弹幕，点燃能量核心</p>
      </div>

      <!-- 累计数据 -->
      <div class="counter-panel">
        <div class="counter-decoration left"></div>
        <div class="counter-content">
          <span class="counter-label">本场直播弹幕</span>
          <div class="counter-value">{{ formattedTotal }}</div>
          <span class="counter-unit">DANMAKU COLLECTED</span>
        </div>
        <div class="counter-decoration right"></div>
      </div>

      <!-- 展示与抽奖分别开启：展示不会进入奖池。 -->
      <div class="start-control-row">
      <div class="winner-count-control" aria-label="本轮 Happy 人数">
        <div class="winner-count-heading">
          <span class="winner-count-label">本轮抽取</span>
          <label class="winner-count-input-wrap">
            <input
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              autocomplete="off"
              aria-label="手动输入本轮 Happy 人数"
              v-model="winnerCountInput"
              @input.stop="handleWinnerCountInput"
              @focus="handleWinnerCountFocus"
              @click.stop="handleWinnerCountFocus"
              @mouseup.prevent
              @keydown.stop
              @blur="commitWinnerCount"
              @keydown.enter="($event.currentTarget as HTMLInputElement).blur()" />
            <span>人</span>
          </label>
        </div>
        <div class="winner-count-options" role="group" aria-label="选择本轮 Happy 人数">
          <button
            v-for="count in winnerCountOptions"
            :key="count"
            type="button"
            :disabled="starting"
            :class="{ active: settings.lotteryWinnerCount === count }"
            @click="setWinnerCount(count)">
            <strong>{{ count }}</strong><small>人</small>
          </button>
        </div>
        <small class="winner-count-hint">支持 1–24 人 · 主播逐位揭晓 Happy</small>
      </div>
      <button class="display-button" type="button" :disabled="starting" @click="handleStartDisplaying">
        <span class="display-icon">💬</span>
        <span>
          <strong>开始展示弹幕</strong>
          <small>DISPLAY ONLY · 不参与抽奖</small>
        </span>
      </button>
      <button class="start-button" type="button" :disabled="starting" @click="handleStartCollecting">
        <span class="button-border"></span>
        <span class="button-glow"></span>
        <span class="button-scan"></span>
        <span class="button-icon">
          <svg viewBox="0 0 100 120" aria-hidden="true">
            <path d="M63 4 12 68h34l-10 48 53-68H55z" fill="currentColor" />
          </svg>
        </span>
        <span class="button-text">
          <strong>{{ starting ? '能量核心启动中' : '开始攒能量' }}</strong>
          <small>{{ starting ? 'INITIALIZING' : 'START CHARGING' }}</small>
        </span>
        <span class="button-arrow">
          <i></i><i></i><i></i>
        </span>
      </button>
      </div>

      <!-- 底部信息 -->
      <div class="footer-status">
        <div class="footer-item">
          <span class="footer-icon connected"></span>
          <div>
            <small>弹幕收集</small>
            <strong>持续运行中</strong>
          </div>
        </div>
      </div>
    </main>

    <!-- 启动闪光 -->
    <Transition name="ignition">
      <div v-if="starting" class="ignition-overlay" aria-hidden="true">
        <div class="ignition-flash"></div>
        <div class="ignition-wave wave-one"></div>
        <div class="ignition-wave wave-two"></div>
      </div>
    </Transition>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useDanmuState, startCollecting, startDisplaying, settings, updateSettings } from '@/danmu/store';
import { playCharging } from '@/danmu/audio';

const state = useDanmuState();
const starting = ref(false);
const winnerCountOptions = [1, 10, 24] as const;
const winnerCountInput = ref(String(settings.lotteryWinnerCount));

const formattedTotal = computed(() => state.totalPoolCount.toLocaleString('zh-CN'));

const particles = Array.from({ length: 28 }, (_, i) => ({
  id: i,
  style: {
    left: `${(i * 37) % 100}%`,
    top: `${12 + ((i * 29) % 78)}%`,
    width: `${2 + (i % 4)}px`,
    height: `${2 + (i % 4)}px`,
    animationDuration: `${3.2 + (i % 6) * 0.7}s`,
    animationDelay: `${-(i % 10) * 0.45}s`
  }
}));

function setWinnerCount(count: number) {
  if (starting.value) return;
  const normalized = Math.min(24, Math.max(1, Math.round(count)));
  winnerCountInput.value = String(normalized);
  updateSettings({ lotteryWinnerCount: normalized });
}

function handleWinnerCountInput() {
  winnerCountInput.value = winnerCountInput.value.replace(/\D/g, '').slice(0, 3);
  if (!winnerCountInput.value) return;
  const value = Number(winnerCountInput.value);
  if (value >= 1 && value <= 24) {
    updateSettings({ lotteryWinnerCount: value });
  }
}

function handleWinnerCountFocus(event: FocusEvent | MouseEvent) {
  (event.currentTarget as HTMLInputElement).select();
}

function commitWinnerCount() {
  if (!winnerCountInput.value) {
    winnerCountInput.value = String(settings.lotteryWinnerCount);
    return;
  }
  setWinnerCount(Number(winnerCountInput.value));
}

watch(() => settings.lotteryWinnerCount, value => {
  winnerCountInput.value = String(value);
});

function handleStartDisplaying() {
  if (starting.value) return;
  startDisplaying();
}

async function handleStartCollecting() {
  if (starting.value) return;
  starting.value = true;
  playCharging();
  // 点击即建立本轮奖池边界，避免启动动画期间的弹幕被漏掉。
  startCollecting();
  starting.value = false;
}
</script>

<style scoped>
.charging-start {
  --cyan: #35e6ff;
  --blue: #3683ff;
  --violet: #7655ff;
  --purple: #c14cff;
  --gold: #ffd43d;
  --orange: #ff9a1f;

  position: relative;
  width: 100%;
  min-height: 100vh;
  display: grid;
  place-items: center;
  overflow: hidden;
  isolation: isolate;
  color: #fff;
  font-family: Inter, "Microsoft YaHei", "PingFang SC", sans-serif;
  background:
    radial-gradient(circle at 50% 45%, rgba(64, 90, 190, 0.22), transparent 30%),
    linear-gradient(145deg, #18163d, #2f2a68);
}

/* 背景 */
.background-layer { position: absolute; inset: 0; z-index: -5; pointer-events: none; }

.background-glow {
  position: absolute; left: 50%; top: 46%; width: 680px; height: 680px;
  transform: translate(-50%, -50%); border-radius: 50%;
  background: radial-gradient(circle, rgba(44, 181, 255, 0.13) 0%, rgba(90, 72, 255, 0.08) 34%, transparent 68%);
  filter: blur(5px);
  animation: backgroundGlow 3.5s ease-in-out infinite alternate;
}

.background-grid {
  position: absolute; inset: 0; opacity: 0.16;
  background-image:
    linear-gradient(rgba(88, 132, 255, 0.24) 1px, transparent 1px),
    linear-gradient(90deg, rgba(88, 132, 255, 0.24) 1px, transparent 1px);
  background-size: 72px 72px;
  mask-image: radial-gradient(circle at 50% 50%, #000 0%, rgba(0, 0, 0, 0.85) 38%, transparent 80%);
  transform: perspective(650px) rotateX(58deg) scale(1.55) translateY(20%);
  transform-origin: center bottom;
}

.background-vignette {
  position: absolute; inset: 0;
  background: radial-gradient(circle at center, transparent 35%, rgba(7, 5, 29, 0.35) 72%, rgba(4, 3, 19, 0.68) 100%);
}

.scan-line {
  position: absolute; left: 0; right: 0; top: -25%; height: 18%;
  background: linear-gradient(180deg, transparent, rgba(71, 216, 255, 0.055), transparent);
  animation: globalScan 5s linear infinite;
}

/* 粒子 */
.particle-layer { position: absolute; inset: 0; z-index: -2; overflow: hidden; pointer-events: none; }

.particle-layer i {
  position: absolute; border-radius: 50%; background: var(--cyan);
  box-shadow: 0 0 7px var(--cyan), 0 0 16px var(--violet);
  opacity: 0; animation: particleFloat linear infinite;
}

/* 两侧装饰 */
.side-decoration {
  position: absolute; top: 50%; display: flex; align-items: center; gap: 8px;
  opacity: 0.45; pointer-events: none;
}

.side-decoration-left { left: 6%; }
.side-decoration-right { right: 6%; transform: scaleX(-1); }

.side-decoration span {
  display: block; width: 55px; height: 2px;
  background: linear-gradient(90deg, transparent, var(--cyan));
  box-shadow: 0 0 8px var(--cyan); transform: skewX(-30deg);
}

.side-decoration span:nth-child(2) { width: 30px; opacity: 0.65; }
.side-decoration span:nth-child(3) { width: 15px; opacity: 0.35; }

/* 主面板 */
.energy-panel {
  position: relative; z-index: 3; display: flex; flex-direction: column; align-items: center;
  width: min(720px, calc(100vw - 40px)); padding: 26px 36px 30px;
}

/* 顶部状态 */
.system-status {
  display: flex; align-items: center; gap: 18px; width: 100%; max-width: 470px; margin-bottom: 19px;
}

.status-line {
  flex: 1; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(76, 205, 255, 0.65));
}

.status-line:last-child { transform: scaleX(-1); }

.status-content {
  display: flex; align-items: center; gap: 9px;
  color: rgba(138, 205, 255, 0.58); font-size: 9px; font-weight: 900; letter-spacing: 3px; white-space: nowrap;
}

.status-dot {
  width: 6px; height: 6px; border-radius: 50%; background: var(--cyan);
  box-shadow: 0 0 6px var(--cyan), 0 0 14px var(--blue);
  animation: statusBlink 1.2s steps(2) infinite;
}

/* 能量核心 */
.energy-core {
  position: relative; display: grid; place-items: center;
  width: 210px; height: 210px; margin-bottom: 10px;
}

.core-aura {
  position: absolute; inset: 10px; border-radius: 50%;
  background: radial-gradient(circle, rgba(31, 226, 255, 0.21), rgba(67, 104, 255, 0.1) 40%, transparent 72%);
  filter: blur(7px); animation: auraPulse 1.7s ease-in-out infinite alternate;
}

.energy-ring { position: absolute; border-radius: 50%; }

.ring-outer {
  inset: 0; border: 1px solid rgba(69, 193, 255, 0.22);
  animation: rotateRing 13s linear infinite;
}

.ring-outer::before, .ring-outer::after {
  content: ""; position: absolute; inset: -2px; border-radius: inherit;
  border-top: 3px solid var(--cyan); border-right: 3px solid transparent;
  filter: drop-shadow(0 0 9px var(--cyan));
}

.ring-outer::after { transform: rotate(180deg); border-top-color: var(--violet); filter: drop-shadow(0 0 9px var(--violet)); }

.ring-outer span {
  position: absolute; left: 50%; top: -5px; width: 6px; height: 13px;
  background: var(--cyan); box-shadow: 0 0 8px var(--cyan);
  transform-origin: 0 110px;
}

.ring-outer span:nth-child(2) { transform: rotate(90deg); }
.ring-outer span:nth-child(3) { transform: rotate(180deg); }
.ring-outer span:nth-child(4) { transform: rotate(270deg); }

.ring-middle {
  inset: 24px; border: 2px dashed rgba(105, 92, 255, 0.42);
  animation: rotateRingReverse 8s linear infinite;
}

.ring-inner {
  inset: 48px; border: 1px solid rgba(63, 222, 255, 0.42);
  box-shadow: inset 0 0 24px rgba(50, 141, 255, 0.2), 0 0 30px rgba(61, 100, 255, 0.18);
  animation: innerRingPulse 1.4s ease-in-out infinite;
}

.core-lightning {
  position: relative; z-index: 5; width: 78px; height: 94px; color: var(--gold);
  filter: drop-shadow(0 0 3px #fff) drop-shadow(0 0 11px var(--gold)) drop-shadow(0 0 24px var(--orange));
  animation: lightningFloat 1.45s ease-in-out infinite;
}

.core-lightning svg { width: 100%; height: 100%; stroke: #080718; stroke-width: 8px; stroke-linejoin: round; }

.lightning-flare {
  position: absolute; left: 50%; top: 52%; z-index: -1; width: 145px; height: 55px;
  transform: translate(-50%, -50%);
  background: radial-gradient(ellipse, rgba(255, 243, 145, 0.65), rgba(255, 186, 32, 0.2) 32%, transparent 70%);
  filter: blur(8px); animation: lightningFlare 0.9s ease-in-out infinite alternate;
}

.core-pulse {
  position: absolute; inset: 45px; border: 2px solid rgba(64, 224, 255, 0.75);
  border-radius: 50%; opacity: 0;
}

.pulse-one { animation: coreShockwave 2.2s ease-out infinite; }
.pulse-two { animation: coreShockwave 2.2s 1.1s ease-out infinite; }

/* 标题 */
.title-block { text-align: center; }

.title-eyebrow {
  margin-bottom: 8px; color: rgba(92, 202, 255, 0.5);
  font-size: 9px; font-weight: 900; letter-spacing: 6px;
}

.title-block h1 {
  margin: 0; font-size: clamp(39px, 5vw, 56px); font-weight: 950;
  font-style: italic; letter-spacing: 7px;
  background: linear-gradient(180deg, #fff 0%, #ecfbff 37%, #73dcff 66%, #5977ff 100%);
  -webkit-background-clip: text; color: transparent;
  filter: drop-shadow(0 4px 0 rgba(12, 25, 83, 0.92)) drop-shadow(0 0 12px rgba(49, 218, 255, 0.75));
}

.title-block p {
  margin: 10px 0 0; color: rgba(190, 210, 255, 0.52);
  font-size: 14px; letter-spacing: 3px;
}

/* 累计数据 */
.counter-panel {
  display: flex; align-items: center; justify-content: center; gap: 17px;
  width: 100%; margin: 28px 0 30px;
}

.counter-decoration {
  width: 75px; height: 17px;
  border-bottom: 1px solid rgba(76, 176, 255, 0.5);
  clip-path: polygon(0 65%, 75% 65%, 84% 100%, 100% 100%, 89% 46%, 0 46%);
  filter: drop-shadow(0 0 5px rgba(38, 202, 255, 0.5));
}

.counter-decoration.right { transform: scaleX(-1); }

.counter-content {
  display: flex; flex-direction: column; align-items: center; min-width: 215px;
}

.counter-label {
  color: rgba(164, 192, 242, 0.62); font-size: 12px; letter-spacing: 4px;
}

.counter-value {
  margin-top: 2px; color: #fff;
  font-family: Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif;
  font-size: 36px; font-style: italic; letter-spacing: 3px;
  text-shadow: 0 3px 0 rgba(22, 27, 85, 0.9), 0 0 9px rgba(46, 219, 255, 0.8);
}

.counter-unit {
  margin-top: 2px; color: rgba(93, 167, 232, 0.34);
  font-size: 7px; letter-spacing: 4px;
}

/* 开始按钮 */
.start-control-row {
  width: min(920px, 94vw);
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr) minmax(0, 1fr);
  align-items: stretch;
  gap: 14px;
}

.winner-count-control {
  min-height: 96px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 12px 13px;
  border: 1px solid rgba(71, 204, 255, 0.35);
  border-radius: 15px;
  background: linear-gradient(145deg, rgba(19, 54, 117, 0.84), rgba(42, 34, 111, 0.82));
  box-shadow: inset 0 1px rgba(255, 255, 255, 0.05), 0 0 24px rgba(43, 139, 255, 0.12);
}

.winner-count-label {
  color: rgba(194, 220, 255, 0.72);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 2px;
}

.winner-count-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.winner-count-input-wrap {
  height: 27px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  color: rgba(194, 220, 255, 0.68);
  border: 1px solid rgba(93, 199, 255, 0.38);
  border-radius: 7px;
  background: rgba(5, 17, 52, 0.5);
  font-size: 9px;
}

.winner-count-input-wrap input {
  width: 38px;
  padding: 0;
  color: #fff;
  border: 0;
  outline: 0;
  background: transparent;
  font: 800 15px/1 Arial, "Microsoft YaHei", sans-serif;
  text-align: right;
  font-variant-numeric: tabular-nums;
  pointer-events: auto;
  user-select: text;
  -webkit-app-region: no-drag;
}

.winner-count-options {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 5px;
  margin-top: 7px;
}

.winner-count-options button {
  height: 31px;
  padding: 0;
  cursor: pointer;
  color: rgba(196, 216, 255, 0.65);
  border: 1px solid rgba(101, 157, 238, 0.3);
  border-radius: 7px;
  background: rgba(8, 18, 55, 0.45);
  transition: 160ms ease;
}

.winner-count-options button strong { font-size: 14px; font-weight: 850; }
.winner-count-options button small { margin-left: 1px; font-size: 8px; }
.winner-count-options button:hover,
.winner-count-options button.active {
  color: #08152d;
  border-color: var(--cyan);
  background: linear-gradient(135deg, #dffbff, var(--cyan));
  box-shadow: 0 0 12px rgba(53, 230, 255, 0.3);
}
.winner-count-options button:disabled { cursor: wait; opacity: 0.68; }
.winner-count-hint { margin-top: 6px; color: rgba(137, 177, 232, 0.48); font-size: 9px; }

.display-button {
  min-height: 96px;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 20px;
  cursor: pointer;
  color: #e6fbff;
  border: 1px solid rgba(74, 224, 255, 0.5);
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(29, 126, 177, 0.72), rgba(45, 59, 143, 0.82));
  box-shadow: 0 0 22px rgba(47, 194, 255, 0.18), inset 0 1px rgba(255, 255, 255, 0.14);
  transition: transform 180ms ease, filter 180ms ease, box-shadow 180ms ease;
}
.display-button:hover:not(:disabled) {
  transform: translateY(-4px);
  filter: brightness(1.15);
  box-shadow: 0 0 28px rgba(53, 230, 255, 0.4), inset 0 1px rgba(255, 255, 255, 0.2);
}
.display-button:disabled { cursor: wait; opacity: 0.72; }
.display-button strong { display: block; font-size: 20px; font-weight: 900; letter-spacing: 1px; }
.display-button small { display: block; margin-top: 7px; color: rgba(193, 239, 255, 0.62); font-size: 8px; font-weight: 800; letter-spacing: 1.5px; }
.display-icon { font-size: 34px; filter: drop-shadow(0 0 9px rgba(98, 230, 255, 0.7)); }

.start-button {
  position: relative; display: grid; grid-template-columns: 48px 1fr 44px;
  align-items: center; gap: 14px; width: 100%; min-height: 96px;
  padding: 14px 24px; overflow: hidden; cursor: pointer; color: #fff; border: 0;
  clip-path: polygon(22px 0, calc(100% - 22px) 0, 100% 50%, calc(100% - 22px) 100%, 22px 100%, 0 50%);
  background: linear-gradient(110deg, rgba(16, 54, 118, 0.98), rgba(29, 96, 185, 0.96) 50%, rgba(55, 52, 157, 0.98));
  box-shadow: 0 0 23px rgba(44, 150, 255, 0.34), 0 0 55px rgba(61, 73, 255, 0.18);
  transition: transform 180ms ease, filter 180ms ease, box-shadow 180ms ease;
}

.start-button:not(:disabled):hover {
  transform: translateY(-4px) scale(1.025); filter: brightness(1.17);
  box-shadow: 0 0 28px rgba(44, 203, 255, 0.62), 0 0 70px rgba(61, 73, 255, 0.35);
}

.start-button:not(:disabled):active { transform: translateY(0) scale(0.985); }
.start-button:disabled { cursor: wait; }

.button-border {
  position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(90deg, var(--cyan), var(--blue), var(--violet), var(--cyan));
  clip-path: polygon(22px 0, calc(100% - 22px) 0, 100% 50%, calc(100% - 22px) 100%, 22px 100%, 0 50%, 23px 3px, 3px 50%, 23px calc(100% - 3px), calc(100% - 23px) calc(100% - 3px), calc(100% - 3px) 50%, calc(100% - 23px) 3px);
  filter: drop-shadow(0 0 5px var(--cyan));
}

.button-glow {
  position: absolute; left: 13%; right: 13%; bottom: -28px; height: 42px;
  background: radial-gradient(ellipse, rgba(39, 206, 255, 0.52), transparent 72%);
  filter: blur(9px);
}

.button-scan {
  position: absolute; top: -25%; bottom: -25%; left: -150px; width: 90px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.12), rgba(119, 235, 255, 0.65), transparent);
  transform: skewX(-18deg); animation: buttonScan 2.6s ease-in-out infinite;
}

.button-icon {
  position: relative; z-index: 3; width: 37px; height: 45px; color: var(--gold);
  filter: drop-shadow(0 0 4px #fff) drop-shadow(0 0 9px var(--gold));
  animation: buttonIconPulse 1.3s ease-in-out infinite;
}

.button-icon svg { width: 100%; height: 100%; stroke: #080718; stroke-width: 8px; stroke-linejoin: round; }

.button-text {
  position: relative; z-index: 3; display: flex; flex-direction: column; align-items: flex-start;
}

.button-text strong {
  font-size: 24px; font-weight: 950; font-style: italic; letter-spacing: 4px;
  text-shadow: 0 3px 0 rgba(12, 25, 76, 0.9), 0 0 9px rgba(62, 218, 255, 0.65);
}

.button-text small {
  margin-top: 6px; color: rgba(159, 222, 255, 0.47);
  font-size: 8px; font-weight: 900; letter-spacing: 4px;
}

.button-arrow {
  position: relative; z-index: 3; display: flex; gap: 3px; justify-self: end;
}

.button-arrow i {
  display: block; width: 8px; height: 17px;
  border-top: 2px solid var(--cyan); border-right: 2px solid var(--cyan);
  transform: rotate(45deg) skew(-8deg, -8deg);
  filter: drop-shadow(0 0 5px var(--cyan));
  animation: arrowFlow 1s ease-in-out infinite;
}

.button-arrow i:nth-child(2) { animation-delay: 0.13s; }
.button-arrow i:nth-child(3) { animation-delay: 0.26s; }

/* 底部状态 */
.footer-status {
  display: flex; align-items: center; gap: 24px;
  margin-top: 23px; padding: 10px 22px;
  border-top: 1px solid rgba(93, 145, 225, 0.15);
}

.footer-item { display: flex; align-items: center; gap: 9px; }
.footer-item div { display: flex; flex-direction: column; }
.footer-item small { color: rgba(127, 157, 211, 0.48); font-size: 8px; letter-spacing: 2px; }
.footer-item strong { margin-top: 3px; color: rgba(201, 233, 255, 0.72); font-size: 11px; font-weight: 800; }

.footer-divider {
  width: 1px; height: 28px;
  background: linear-gradient(transparent, rgba(77, 186, 255, 0.4), transparent);
}

.footer-icon { width: 8px; height: 8px; border-radius: 50%; }

.footer-icon.connected {
  background: #4af3b6; box-shadow: 0 0 6px #4af3b6, 0 0 13px rgba(74, 243, 182, 0.58);
}

.footer-icon.pool {
  background: var(--cyan); box-shadow: 0 0 6px var(--cyan), 0 0 13px rgba(53, 230, 255, 0.55);
}

/* 启动特效 */
.ignition-overlay {
  position: absolute; inset: 0; z-index: 50; display: grid; place-items: center; pointer-events: none;
}

.ignition-flash {
  position: absolute; inset: 0;
  background: radial-gradient(circle at 50% 48%, rgba(255, 255, 255, 0.85), rgba(65, 221, 255, 0.35) 17%, transparent 48%);
  animation: ignitionFlash 1.15s ease-out infinite;
}

.ignition-wave {
  position: absolute; left: 50%; top: 47%; width: 160px; height: 160px;
  border-radius: 50%; border: 4px solid var(--cyan); transform: translate(-50%, -50%); opacity: 0;
}

.wave-one { animation: ignitionWave 1.35s ease-out infinite; }
.wave-two { animation: ignitionWave 1.35s 0.43s ease-out infinite; }

.is-starting .energy-panel { animation: panelStarting 0.45s ease-in-out infinite alternate; }
.is-starting .core-lightning { animation: startingLightning 0.25s ease-in-out infinite alternate; }

/* 动画 */
@keyframes backgroundGlow { from { opacity: 0.65; transform: translate(-50%, -50%) scale(0.96); } to { opacity: 1; transform: translate(-50%, -50%) scale(1.08); } }
@keyframes globalScan { from { transform: translateY(0); } to { transform: translateY(700%); } }
@keyframes particleFloat { 0% { opacity: 0; transform: translateY(24px) scale(0.45); } 28% { opacity: 0.8; } 100% { opacity: 0; transform: translateY(-125px) translateX(22px) scale(1.2); } }
@keyframes statusBlink { 50% { opacity: 0.28; } }
@keyframes auraPulse { from { opacity: 0.6; transform: scale(0.92); } to { opacity: 1; transform: scale(1.08); } }
@keyframes rotateRing { to { transform: rotate(360deg); } }
@keyframes rotateRingReverse { to { transform: rotate(-360deg); } }
@keyframes innerRingPulse { 50% { opacity: 0.55; transform: scale(0.9); } }
@keyframes lightningFloat { 0%, 100% { transform: translateY(0) rotate(-2deg) scale(1); } 50% { transform: translateY(-5px) rotate(2deg) scale(1.07); } }
@keyframes lightningFlare { from { opacity: 0.45; transform: translate(-50%, -50%) scaleX(0.82); } to { opacity: 1; transform: translate(-50%, -50%) scaleX(1.25); } }
@keyframes coreShockwave { 0% { opacity: 0.72; transform: scale(0.35); } 100% { opacity: 0; transform: scale(2.2); } }
@keyframes buttonScan { 0%, 28% { left: -150px; opacity: 0; } 42% { opacity: 1; } 75%, 100% { left: calc(100% + 100px); opacity: 0; } }
@keyframes buttonIconPulse { 50% { transform: scale(1.1); filter: drop-shadow(0 0 5px #fff) drop-shadow(0 0 15px var(--gold)); } }
@keyframes arrowFlow { 0%, 100% { opacity: 0.18; transform: translateX(-4px) rotate(45deg) skew(-8deg, -8deg); } 50% { opacity: 1; transform: translateX(3px) rotate(45deg) skew(-8deg, -8deg); } }
@keyframes ignitionFlash { 0% { opacity: 0; transform: scale(0.65); } 28% { opacity: 1; } 100% { opacity: 0; transform: scale(1.45); } }
@keyframes ignitionWave { 0% { opacity: 0.9; transform: translate(-50%, -50%) scale(0.2); } 100% { opacity: 0; transform: translate(-50%, -50%) scale(7); } }
@keyframes panelStarting { from { filter: brightness(1) drop-shadow(0 0 5px rgba(52, 216, 255, 0.3)); } to { filter: brightness(1.25) drop-shadow(0 0 24px rgba(52, 216, 255, 0.78)); } }
@keyframes startingLightning { from { transform: scale(0.95) rotate(-2deg); filter: brightness(1.1) drop-shadow(0 0 10px var(--gold)); } to { transform: scale(1.14) rotate(2deg); filter: brightness(2) drop-shadow(0 0 25px var(--gold)); } }

.ignition-enter-active, .ignition-leave-active { transition: opacity 0.3s ease; }
.ignition-enter-from, .ignition-leave-to { opacity: 0; }

@media (max-width: 720px) {
  .energy-panel { width: calc(100vw - 20px); padding-inline: 12px; }
  .energy-core { width: 175px; height: 175px; }
  .ring-middle { inset: 20px; }
  .ring-inner { inset: 41px; }
  .core-lightning { width: 63px; height: 77px; }
  .title-block h1 { font-size: 39px; letter-spacing: 5px; }
  .title-block p { font-size: 12px; }
  .counter-decoration, .side-decoration { display: none; }
  .start-control-row { width: min(390px, 94vw); grid-template-columns: 1fr; gap: 9px; }
  .winner-count-control { min-height: 82px; }
  .display-button { min-height: 78px; }
  .start-button { width: 100%; min-height: 86px; grid-template-columns: 40px 1fr 35px; padding-inline: 20px; }
  .button-text strong { font-size: 20px; letter-spacing: 3px; }
  .footer-status { gap: 14px; padding-inline: 8px; }
}

@media (prefers-reduced-motion: reduce) {
  .charging-start *, .charging-start *::before, .charging-start *::after {
    animation-duration: 0.001ms !important; animation-iteration-count: 1 !important;
  }
}
</style>
