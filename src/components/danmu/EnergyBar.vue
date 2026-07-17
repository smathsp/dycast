<template>
  <section
    class="ultimate-meter"
    :class="{
      'is-near-full': percent >= 75 && percent < 100,
      'is-critical': percent >= 90 && percent < 100,
      'is-full': isFull
    }"
    :style="meterStyle"
  >
    <!-- 背景粒子 -->
    <div class="ambient-particles" aria-hidden="true">
      <i v-for="item in 12" :key="item" :style="{ '--i': item }"></i>
    </div>

    <!-- 顶部标题 -->
    <header class="meter-header">
      <span class="header-line left"></span>

      <div class="meter-title">
        <span class="title-icon">
          <svg viewBox="0 0 36 42" aria-hidden="true">
            <path d="M22.8 1.5 4.5 24.2h12.1l-3.5 16.3L31.5 17H19.2z" fill="currentColor" />
          </svg>
        </span>

        <div class="title-text">
          <strong>弹幕能量</strong>
          <small>DANMAKU DRIVE</small>
        </div>
      </div>

      <span class="header-line right"></span>
    </header>

    <!-- 主体外框 -->
    <div class="meter-shell">
      <div class="corner corner-left"></div>
      <div class="corner corner-right"></div>

      <div class="shell-top-light"></div>
      <div class="shell-bottom-light"></div>

      <!-- 轨道 -->
      <div
        class="meter-track"
        role="progressbar"
        :aria-valuenow="state.energy"
        aria-valuemin="0"
        :aria-valuemax="settings.lotteryThreshold"
      >
        <div class="track-grid"></div>

        <!-- 能量填充 -->
        <div class="energy-fill">
          <!-- 蓝紫基础能量 -->
          <div class="energy-base"></div>

          <!-- 接近满能量时逐渐显示 -->
          <div class="energy-gold"></div>

          <div class="energy-plasma"></div>
          <div class="energy-lines"></div>
          <div class="energy-scan"></div>

          <!-- 高能量金色电弧 -->
          <div v-if="percent >= 75" class="gold-electric"></div>

          <!-- 能量头部 -->
          <div v-if="percent > 0" class="charge-head">
            <span class="head-core"></span>
            <span class="head-ring"></span>
            <span class="head-flare"></span>
          </div>
        </div>

        <!-- 分段覆盖层 -->
        <div class="segment-overlay" aria-hidden="true">
          <span v-for="item in 24" :key="item"></span>
        </div>

        <!-- 数值 -->
        <div class="meter-value">
          <span class="current-value">{{ formattedCurrent }}</span>
          <span class="value-divider">/</span>
          <span class="max-value">{{ formattedMax }}</span>
        </div>

        <!-- 左侧状态 -->
        <div class="meter-status">
          <span class="status-dot"></span>
          <span>{{ isFull ? 'ULTIMATE READY' : 'ENERGY CHARGING' }}</span>
        </div>

        <!-- 满能量提示 -->
        <transition name="ready">
          <div v-if="isFull" class="ultimate-ready">
            <span>READY</span>
          </div>
        </transition>
      </div>

      <!-- 两端装饰 -->
      <div class="side-module side-left">
        <span></span>
        <span></span>
        <span></span>
      </div>

      <div class="side-module side-right">
        <svg viewBox="0 0 36 42" aria-hidden="true">
          <path d="M22.8 1.5 4.5 24.2h12.1l-3.5 16.3L31.5 17H19.2z" fill="currentColor" />
        </svg>
      </div>
    </div>

    <!-- 底部数据 -->
    <footer class="meter-footer">
      <span>
        当前进度
        <strong>{{ percent.toFixed(1) }}%</strong>
      </span>

      <span class="footer-center">
        {{ remaining > 0 ? `还差 ${remaining.toLocaleString()} 条触发抽奖` : '能量已充满' }}
      </span>

      <span>
        累计弹幕
        <strong>{{ state.totalDanmuCount.toLocaleString() }}</strong>
      </span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useDanmuState, settings } from '@/danmu/store';

const state = useDanmuState();

const percent = computed(() => {
  if (settings.lotteryThreshold <= 0) return 0;
  return Math.min((state.energy / settings.lotteryThreshold) * 100, 100);
});

const isFull = computed(() => state.isLotteryActive || (state.energy === 0 && state.totalDanmuCount > 0));

const remaining = computed(() => Math.max(settings.lotteryThreshold - state.energy, 0));

const formattedCurrent = computed(() => state.energy.toLocaleString());
const formattedMax = computed(() => settings.lotteryThreshold.toLocaleString());

const meterStyle = computed(() => {
  // 75% 开始变金色：75%→0, 87.5%→0.5, 100%→1
  const goldIntensity = Math.max(0, Math.min((percent.value - 75) / 25, 1));
  return {
    '--energy-progress': `${percent.value}%`,
    '--gold-intensity': goldIntensity.toString(),
    '--charge-speed': `${Math.max(0.35, 1.5 - percent.value / 100)}s`
  };
});
</script>

<style scoped>
.ultimate-meter {
  --cyan: #2df5ff;
  --blue: #2979ff;
  --violet: #8857ff;
  --purple: #cf43ff;
  --gold: #ffd84a;
  --energy-progress: 0%;
  --gold-intensity: 0;
  --charge-speed: 1.5s;

  position: relative;
  width: 100%;
  margin: 0 auto;
  padding: 10px 16px 6px;
  color: #fff;
  isolation: isolate;
  font-family: Inter, "Microsoft YaHei", "PingFang SC", sans-serif;
}

/* 顶部标题 */
.meter-header {
  position: relative;
  z-index: 5;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  height: 58px;
  margin-bottom: -10px;
}

.meter-title {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 240px;
  padding: 6px 28px 12px;
  justify-content: center;
  clip-path: polygon(10% 0, 90% 0, 100% 65%, 88% 100%, 12% 100%, 0 65%);
  background:
    linear-gradient(180deg, rgba(45, 245, 255, 0.12), rgba(72, 57, 160, 0.2)),
    rgba(8, 10, 35, 0.94);
  border-top: 1px solid rgba(119, 235, 255, 0.65);
}

.meter-title::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  opacity: 0.55;
  background:
    radial-gradient(circle at 50% 90%, rgba(36, 201, 255, 0.48), transparent 52%),
    repeating-linear-gradient(90deg, transparent 0 9px, rgba(87, 207, 255, 0.09) 10px);
}

.title-icon {
  width: 28px;
  height: 36px;
  color: var(--gold);
  filter:
    drop-shadow(0 0 5px rgba(255, 216, 74, 0.9))
    drop-shadow(0 0 12px rgba(255, 149, 0, 0.7));
  animation: iconPulse 1.6s ease-in-out infinite;
}

.title-icon svg { width: 100%; height: 100%; }

.title-text {
  display: flex;
  flex-direction: column;
  line-height: 1;
}

.title-text strong {
  font-size: 24px;
  font-weight: 950;
  letter-spacing: 5px;
  background: linear-gradient(180deg, #fff 0%, #e5f8ff 45%, #6ad9ff 100%);
  -webkit-background-clip: text;
  color: transparent;
  filter: drop-shadow(0 2px 0 rgba(13, 28, 93, 0.9));
}

.title-text small {
  margin-top: 5px;
  color: rgba(138, 210, 255, 0.58);
  font-size: 7px;
  letter-spacing: 4px;
}

.header-line {
  position: relative;
  width: min(220px, 22vw);
  height: 14px;
  border-bottom: 2px solid rgba(98, 131, 255, 0.68);
  filter: drop-shadow(0 0 5px rgba(89, 113, 255, 0.8));
}

.header-line.left { clip-path: polygon(0 78%, 82% 78%, 90% 100%, 100% 100%, 91% 55%, 0 55%); }

.header-line.right {
  transform: scaleX(-1);
  clip-path: polygon(0 78%, 82% 78%, 90% 100%, 100% 100%, 91% 55%, 0 55%);
}

/* 主体外壳 */
.meter-shell {
  position: relative;
  z-index: 2;
  height: 110px;
  padding: 12px 56px;
  clip-path: polygon(3% 0, 97% 0, 100% 50%, 97% 100%, 3% 100%, 0 50%);
  background:
    linear-gradient(
      180deg,
      rgba(153, 213, 255, 0.85) 0,
      rgba(69, 93, 189, 0.7) 8%,
      rgba(20, 22, 55, 0.98) 18%,
      rgba(5, 8, 27, 1) 82%,
      rgba(95, 72, 211, 0.74) 94%,
      rgba(86, 220, 255, 0.84) 100%
    );
  box-shadow:
    0 0 18px rgba(56, 111, 255, 0.7),
    0 0 45px rgba(111, 53, 255, 0.35);
}

/* 底座光 */
.meter-shell::after {
  content: "";
  position: absolute;
  left: 12%;
  right: 12%;
  bottom: -24px;
  height: 42px;
  background: radial-gradient(
    ellipse,
    rgba(60, 130, 255, 0.32),
    transparent 70%
  );
  filter: blur(10px);
  pointer-events: none;
}

.meter-shell::before {
  content: "";
  position: absolute;
  inset: 3px;
  z-index: -1;
  clip-path: inherit;
  background:
    linear-gradient(100deg, rgba(39, 239, 255, 0.18), transparent 18%, transparent 82%, rgba(190, 73, 255, 0.22)),
    #080b21;
}

.shell-top-light,
.shell-bottom-light {
  position: absolute;
  left: 12%;
  right: 12%;
  height: 2px;
  pointer-events: none;
}

.shell-top-light {
  top: 6px;
  background: linear-gradient(90deg, transparent, var(--cyan), var(--violet), var(--cyan), transparent);
  box-shadow: 0 0 10px var(--cyan);
}

.shell-bottom-light {
  bottom: 6px;
  background: linear-gradient(90deg, transparent, var(--violet), var(--cyan), var(--violet), transparent);
  box-shadow: 0 0 10px var(--violet);
}

/* 轨道 */
.meter-track {
  position: relative;
  height: 100%;
  overflow: hidden;
  clip-path: polygon(2% 0, 98% 0, 100% 50%, 98% 100%, 2% 100%, 0 50%);
  background: linear-gradient(180deg, rgba(25, 39, 83, 0.94), rgba(5, 8, 29, 0.98));
  box-shadow:
    inset 0 0 22px rgba(0, 0, 0, 0.95),
    inset 0 0 5px rgba(75, 218, 255, 0.4);
}

.track-grid {
  position: absolute;
  inset: 0;
  opacity: 0.34;
  background:
    repeating-linear-gradient(0deg, transparent 0 6px, rgba(100, 141, 255, 0.11) 7px),
    repeating-linear-gradient(90deg, transparent 0 46px, rgba(80, 111, 220, 0.08) 47px);
}

/* ===== 能量区域 ===== */
.energy-fill {
  position: absolute;
  inset: 0 auto 0 0;
  width: var(--energy-progress);
  min-width: 0;
  overflow: visible;
  transition: width 650ms cubic-bezier(0.22, 1, 0.36, 1), filter 300ms ease;
}

.energy-base,
.energy-gold,
.energy-plasma,
.energy-lines,
.energy-scan,
.gold-electric {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

/* 普通阶段：蓝紫能量 */
.energy-base {
  background: linear-gradient(90deg, #00c8d7 0%, #00dcff 28%, #168cff 64%, #7453ff 100%);
  box-shadow:
    inset 0 8px 16px rgba(255, 255, 255, 0.25),
    inset 0 -10px 20px rgba(22, 16, 115, 0.4),
    0 0 18px rgba(0, 228, 255, 0.9),
    0 0 42px rgba(44, 108, 255, 0.7);
  transition: filter 500ms ease, opacity 500ms ease;
}

/* 75% 后逐渐覆盖金色 */
.energy-gold {
  z-index: 1;
  opacity: var(--gold-intensity);
  background:
    radial-gradient(ellipse at 75% 45%, rgba(255, 255, 255, 0.95), transparent 16%),
    linear-gradient(90deg, #ff9d00 0%, #ffc400 24%, #ffe45c 55%, #fff5ad 82%, #ffffff 100%);
  box-shadow:
    inset 0 8px 18px rgba(255, 255, 255, 0.55),
    inset 0 -10px 18px rgba(255, 107, 0, 0.38),
    0 0 18px rgba(255, 196, 0, 0.9),
    0 0 42px rgba(255, 154, 0, 0.75),
    0 0 75px rgba(255, 205, 49, 0.5);
  transition: opacity 500ms ease;
}

.energy-plasma {
  opacity: 0.62;
  background:
    radial-gradient(ellipse at 22% 35%, rgba(255, 255, 255, 0.85), transparent 14%),
    radial-gradient(ellipse at 66% 76%, rgba(143, 66, 255, 0.65), transparent 22%),
    repeating-radial-gradient(ellipse at 40% 50%, rgba(255, 255, 255, 0.18) 0 2px, transparent 4px 14px);
  background-size: 220px 100%, 280px 100%, 180px 100%;
  animation: plasmaShift 1.8s linear infinite;
}

.energy-lines {
  opacity: 0.55;
  background: repeating-linear-gradient(
    115deg,
    transparent 0 22px,
    rgba(255, 255, 255, 0.32) 24px,
    transparent 27px 50px
  );
  animation: energyFlow 1.1s linear infinite;
}

.energy-scan {
  width: 140px;
  left: -160px;
  background: linear-gradient(
    90deg, transparent, rgba(255, 255, 255, 0.09),
    rgba(255, 255, 255, 0.82), rgba(75, 225, 255, 0.12), transparent
  );
  transform: skewX(-18deg);
  filter: blur(1px);
  animation: scanMove 2.2s ease-in-out infinite;
}

/* 金色电流特效 */
.gold-electric {
  z-index: 4;
  opacity: calc(var(--gold-intensity) * 0.9);
  overflow: hidden;
  pointer-events: none;
  background: repeating-linear-gradient(
    112deg,
    transparent 0 18px,
    rgba(255, 255, 255, 0.15) 20px,
    rgba(255, 246, 163, 0.85) 22px,
    transparent 25px 48px
  );
  background-size: 130px 100%;
  filter: brightness(1.35) drop-shadow(0 0 5px #fff4a3) drop-shadow(0 0 12px #ffc400);
  animation: goldElectricFlow var(--charge-speed) linear infinite;
}

/* 分段效果 */
.segment-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(24, 1fr);
  pointer-events: none;
}

.segment-overlay span {
  border-right: 3px solid rgba(3, 6, 25, 0.72);
  box-shadow: 1px 0 0 rgba(105, 225, 255, 0.11), inset -1px 0 0 rgba(0, 0, 0, 0.5);
  transform: skewX(-7deg);
}

/* 能量头部特效 */
.charge-head {
  position: absolute;
  top: 0;
  right: -15px;
  width: 30px;
  height: 100%;
  z-index: 5;
}

.head-core {
  position: absolute;
  top: -10%;
  left: 12px;
  width: 5px;
  height: 120%;
  background: #fff;
  box-shadow:
    0 0 5px #fff,
    0 0 14px var(--cyan),
    0 0 28px var(--blue),
    0 0 50px var(--violet);
}

.head-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 34px;
  height: 110px;
  border: 2px solid rgba(130, 238, 255, 0.74);
  border-radius: 50%;
  transform: translate(-50%, -50%) scaleX(0.38);
  box-shadow: 0 0 10px var(--cyan), inset 0 0 10px var(--blue);
  animation: headRing 1s ease-in-out infinite;
}

.head-flare {
  position: absolute;
  top: 50%;
  left: 12px;
  width: 95px;
  height: 18px;
  transform: translate(-50%, -50%);
  background: radial-gradient(
    ellipse, rgba(255, 255, 255, 1),
    rgba(50, 225, 255, 0.85) 16%,
    rgba(89, 74, 255, 0.42) 38%,
    transparent 72%
  );
  filter: blur(1px);
  animation: flarePulse 0.9s ease-in-out infinite alternate;
}

/* 数值 */
.meter-value {
  position: absolute;
  inset: 0;
  z-index: 8;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.current-value {
  font-family: Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif;
  font-size: clamp(34px, 4vw, 52px);
  letter-spacing: 1px;
  line-height: 1;
  background: linear-gradient(180deg, #fff 0%, #ddfaff 38%, #45d9ff 68%, #2677ff 100%);
  -webkit-background-clip: text;
  color: transparent;
  filter:
    drop-shadow(0 3px 0 rgba(10, 29, 93, 0.95))
    drop-shadow(0 0 9px rgba(34, 221, 255, 0.88));
}

.value-divider {
  margin: 0 10px;
  color: rgba(255, 255, 255, 0.45);
  font-size: 30px;
  font-weight: 300;
  transform: skewX(-10deg);
}

.max-value {
  color: rgba(224, 233, 255, 0.62);
  font-size: clamp(18px, 2vw, 30px);
  font-weight: 900;
  letter-spacing: 1px;
  text-shadow: 0 2px 0 #07102c;
}

/* 左下状态 */
.meter-status {
  position: absolute;
  z-index: 8;
  left: 38px;
  bottom: 8px;
  display: flex;
  align-items: center;
  gap: 7px;
  color: rgba(164, 218, 255, 0.58);
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 2px;
}

.status-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--cyan);
  box-shadow: 0 0 8px var(--cyan);
  animation: statusBlink 1s steps(2) infinite;
}

/* 侧边模块 */
.side-module {
  position: absolute;
  z-index: 9;
  top: 50%;
  transform: translateY(-50%);
}

.side-left {
  left: 22px;
  display: flex;
  gap: 4px;
}

.side-left span {
  display: block;
  width: 6px;
  height: 34px;
  transform: skewX(-20deg);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.9), var(--cyan), var(--blue));
  box-shadow: 0 0 9px var(--cyan);
}

.side-left span:nth-child(2) { opacity: 0.64; height: 26px; }
.side-left span:nth-child(3) { opacity: 0.36; height: 18px; }

.side-right {
  right: 16px;
  width: 30px;
  height: 40px;
  color: #eafcff;
  filter:
    drop-shadow(0 0 4px #fff)
    drop-shadow(0 0 11px var(--violet))
    drop-shadow(0 0 23px var(--blue));
  animation: rightBolt 1.4s ease-in-out infinite;
}

.side-right svg { width: 100%; height: 100%; }

/* 底部数据 */
.meter-footer {
  position: relative;
  z-index: 4;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 8px 70px 0;
  color: rgba(142, 181, 228, 0.62);
  font-size: 10px;
  letter-spacing: 1px;
}

.meter-footer span:last-child { text-align: right; }

.meter-footer strong {
  margin-left: 6px;
  color: #c8f5ff;
  font-size: 12px;
}

.footer-center {
  color: rgba(161, 126, 255, 0.68);
}

/* 背景粒子 */
.ambient-particles {
  position: absolute;
  inset: 20px 0 0;
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
}

.ambient-particles i {
  --size: calc(2px + (var(--i) % 3) * 1px);
  position: absolute;
  left: calc((var(--i) * 8.1%) - 2%);
  top: calc(35% + (var(--i) % 5) * 9%);
  width: var(--size);
  height: var(--size);
  border-radius: 50%;
  background: var(--cyan);
  box-shadow: 0 0 6px var(--cyan), 0 0 13px var(--violet);
  opacity: 0;
  animation: particleRise calc(1.8s + (var(--i) % 4) * 0.5s) calc(var(--i) * -0.17s) linear infinite;
}

/* ===== 90% 高危充能状态 ===== */
.is-critical .meter-shell {
  animation: criticalShell 0.65s ease-in-out infinite alternate;
}

.is-critical .energy-fill {
  filter: brightness(1.15);
}

.is-critical .charge-head {
  animation: criticalHead 0.45s ease-in-out infinite alternate;
}

.is-critical .meter-title {
  box-shadow: 0 0 12px rgba(255, 205, 55, 0.45), inset 0 0 14px rgba(255, 188, 0, 0.16);
}

.is-critical .title-icon {
  color: #fff1a1;
  filter:
    drop-shadow(0 0 5px #fff)
    drop-shadow(0 0 13px #ffd32a)
    drop-shadow(0 0 25px #ff8a00);
}

/* ===== 满能量：白金爆发 ===== */
.ultimate-meter.is-full {
  --cyan: #fffbd1;
  --blue: #ffd636;
  --violet: #ff9d00;
  --purple: #fff2a3;
}

.is-full .energy-base {
  opacity: 0;
}

.is-full .energy-gold {
  opacity: 1;
  background:
    radial-gradient(ellipse at 50% 50%, #ffffff 0%, #fffbd2 15%, #ffe259 42%, #ffb300 72%, #ff8a00 100%);
  animation: fullGoldEnergy 0.38s ease-in-out infinite alternate;
}

.is-full .meter-shell {
  animation: fullGoldShell 0.45s ease-in-out infinite alternate, fullShake 2.5s ease-in-out infinite;
}

.is-full .energy-lines {
  opacity: 0.9;
  animation-duration: 0.32s;
}

.is-full .gold-electric {
  opacity: 1;
  animation-duration: 0.24s;
}

.is-full .charge-head {
  filter: brightness(2) drop-shadow(0 0 12px #ffffff) drop-shadow(0 0 28px #ffd42a);
}

.is-full .current-value {
  background: linear-gradient(180deg, #ffffff, #fffbd0 40%, #ffd52d 75%, #ff9d00);
  -webkit-background-clip: text;
  color: transparent;
  filter:
    drop-shadow(0 3px 0 rgba(121, 55, 0, 0.9))
    drop-shadow(0 0 8px #ffffff)
    drop-shadow(0 0 19px #ffc400);
}

.ultimate-ready {
  position: absolute;
  z-index: 12;
  right: 50px;
  top: 50%;
  transform: translateY(-50%) skewX(-10deg);
  color: #fff;
  font-family: Impact, sans-serif;
  font-size: 24px;
  letter-spacing: 4px;
  text-shadow:
    0 0 4px #fff,
    0 0 12px #ffdf3c,
    0 0 25px #ff3e54;
  animation: readyFlash 0.55s steps(2) infinite;
}

/* ===== 动画 ===== */
@keyframes iconPulse {
  0%, 100% { transform: scale(1) rotate(-2deg); }
  50% { transform: scale(1.12) rotate(2deg); }
}

@keyframes plasmaShift {
  from { background-position: 0 0, 0 0, 0 0; }
  to { background-position: 220px 0, -280px 0, 180px 0; }
}

@keyframes energyFlow {
  from { background-position: 0 0; }
  to { background-position: 90px 0; }
}

@keyframes scanMove {
  0% { left: -180px; opacity: 0; }
  18% { opacity: 1; }
  75% { opacity: 0.9; }
  100% { left: calc(100% + 80px); opacity: 0; }
}

@keyframes goldElectricFlow {
  from { background-position: 0 0; }
  to { background-position: 130px 0; }
}

@keyframes headRing {
  0%, 100% { opacity: 0.45; transform: translate(-50%, -50%) scaleX(0.3) scaleY(0.85); }
  50% { opacity: 1; transform: translate(-50%, -50%) scaleX(0.48) scaleY(1.12); }
}

@keyframes flarePulse {
  from { opacity: 0.6; transform: translate(-50%, -50%) scaleX(0.8); }
  to { opacity: 1; transform: translate(-50%, -50%) scaleX(1.25); }
}

@keyframes rightBolt {
  0%, 100% { opacity: 0.72; transform: translateY(-50%) scale(0.96); }
  50% { opacity: 1; transform: translateY(-50%) scale(1.08); }
}

@keyframes statusBlink { 50% { opacity: 0.25; } }

@keyframes particleRise {
  0% { opacity: 0; transform: translateY(25px) scale(0.4); }
  25% { opacity: 0.8; }
  100% { opacity: 0; transform: translateY(-95px) translateX(18px) scale(1.2); }
}

@keyframes criticalShell {
  from { filter: brightness(1) drop-shadow(0 0 4px rgba(255, 197, 32, 0.2)); }
  to { filter: brightness(1.18) drop-shadow(0 0 18px rgba(255, 197, 32, 0.75)); }
}

@keyframes criticalHead {
  from { transform: scaleY(0.92); filter: brightness(1); }
  to { transform: scaleY(1.1); filter: brightness(1.8); }
}

@keyframes fullGoldEnergy {
  from { filter: brightness(1.1); }
  to { filter: brightness(1.65); }
}

@keyframes fullGoldShell {
  from { filter: brightness(1.05) drop-shadow(0 0 8px rgba(255, 200, 30, 0.7)); }
  to { filter: brightness(1.38) drop-shadow(0 0 28px rgba(255, 205, 37, 1)); }
}

@keyframes fullShake {
  0%, 92%, 100% { transform: translateX(0); }
  94% { transform: translateX(-2px); }
  96% { transform: translateX(2px); }
  98% { transform: translateX(-1px); }
}

@keyframes readyFlash { 50% { opacity: 0.45; } }

.ready-enter-active, .ready-leave-active { transition: opacity 0.25s, transform 0.25s; }
.ready-enter-from, .ready-leave-to { opacity: 0; transform: translateY(-50%) scale(1.5) skewX(-10deg); }

@media (prefers-reduced-motion: reduce) {
  .ultimate-meter *, .ultimate-meter *::before, .ultimate-meter *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
  }
  .energy-fill { transition: none; }
}
</style>
