<template>
  <main class="live-overlay-view">
    <section class="overlay-stat winner-stat" aria-label="剩余中奖名额">
      <div class="stat-identity">
        <span class="stat-mark" aria-hidden="true">
          <svg viewBox="0 0 48 48" role="presentation">
            <path d="M15 8h18v5h7v5c0 8-4 13-11 14-1 2-2 3-3 4v3h8v4H14v-4h8v-3c-2-1-3-2-3-4-7-1-11-6-11-14v-5h7V8Zm0 9h-3v1c0 5 2 8 6 9-2-3-3-6-3-10Zm18 0c0 4-1 7-3 10 4-1 6-4 6-9v-1h-3Z" />
          </svg>
        </span>
        <span class="stat-copy">
          <small>LUCKY SLOTS</small>
          <span class="stat-label">剩余中奖名额</span>
        </span>
      </div>
      <strong class="stat-value"><b>{{ remainingWinnerCount }}</b><small>人</small></strong>
    </section>

    <section class="overlay-stat countdown-stat" :class="{ expired: remainingSeconds <= 0 }" aria-label="直播倒计时">
      <div class="stat-identity">
        <span class="stat-mark" aria-hidden="true">
          <svg viewBox="0 0 48 48" role="presentation">
            <path d="M19 5h10v4H19V5Zm3 12h4v9l7 4-2 4-9-6V17Zm2-5c10 0 18 8 18 18s-8 18-18 18S6 40 6 30s8-18 18-18Zm0 5c-7 0-13 6-13 13s6 13 13 13 13-6 13-13-6-13-13-13Z" />
          </svg>
        </span>
        <span class="stat-copy">
          <small>LIVE COUNTDOWN</small>
          <span class="stat-label">直播倒计时</span>
        </span>
      </div>
      <strong class="stat-value"><b>{{ formattedCountdown }}</b></strong>
    </section>
    <div
      class="window-resize-handle"
      aria-hidden="true"
      @pointerdown="startCurrentWindowResize"></div>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useSettings } from '@/utils/settingUtil';
import { formatCountdown, getRemainingCountdownSeconds } from '@/utils/liveOverlayUtil';
import { startCurrentWindowResize } from '@/utils/windowResizeUtil';

const settings = useSettings();
const now = ref(Date.now());
let tickTimer: ReturnType<typeof setInterval> | null = null;

const remainingSeconds = computed(() => getRemainingCountdownSeconds(settings.value, now.value));
const formattedCountdown = computed(() => formatCountdown(remainingSeconds.value));
const remainingWinnerCount = computed(() => Math.max(0, Math.round(settings.value.remainingWinnerCount || 0)));

onMounted(() => {
  tickTimer = setInterval(() => { now.value = Date.now(); }, 250);
});

onBeforeUnmount(() => {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
});
</script>

<style scoped>
.live-overlay-view {
  position: relative;
  -webkit-app-region: drag;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: clamp(14px, 1.8vw, 26px);
  width: 100%;
  height: 100%;
  overflow: hidden;
  box-sizing: border-box;
  padding: clamp(10px, 1.5vh, 16px) clamp(16px, 2.4vw, 32px);
  background: #00ff00;
  user-select: none;
}

.window-resize-handle {
  position: absolute;
  z-index: 50;
  right: 0;
  bottom: 0;
  width: 30px;
  height: 30px;
  cursor: nwse-resize;
  touch-action: none;
  -webkit-app-region: no-drag;
}

.window-resize-handle::after {
  content: '';
  position: absolute;
  right: 6px;
  bottom: 6px;
  width: 9px;
  height: 9px;
  opacity: 0;
  border-right: 2px solid rgba(0, 112, 0, .78);
  border-bottom: 2px solid rgba(0, 112, 0, .78);
  transition: opacity .12s ease;
}

.window-resize-handle:hover::after {
  opacity: 1;
}

.overlay-stat {
  --accent: #57e6ff;
  --accent-rgb: 87, 230, 255;
  --accent-secondary: #7971ff;
  flex: 1 1 0;
  position: relative;
  isolation: isolate;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: clamp(16px, 2vw, 30px);
  min-width: 0;
  height: 100%;
  overflow: hidden;
  box-sizing: border-box;
  padding: clamp(14px, 2vh, 22px) clamp(18px, 2.5vw, 34px);
  color: #fff;
  border: 1px solid rgba(var(--accent-rgb), .76);
  border-radius: clamp(14px, 1.4vw, 22px);
  background:
    linear-gradient(115deg, rgba(var(--accent-rgb), .12), transparent 40%),
    linear-gradient(160deg, #151a38 0%, #0b0e22 52%, #070918 100%);
  box-shadow:
    0 clamp(5px, .7vh, 8px) 0 #03050e,
    0 0 22px rgba(var(--accent-rgb), .26),
    inset 0 0 0 1px rgba(255, 255, 255, .1),
    inset 0 0 26px rgba(var(--accent-rgb), .05);
  font-family: "DouyinSansBold", "Microsoft YaHei UI", sans-serif;
}

.overlay-stat::before {
  content: "";
  position: absolute;
  z-index: -1;
  top: 0;
  left: 24px;
  width: 56%;
  height: 4px;
  border-radius: 0 0 6px 6px;
  background: linear-gradient(90deg, transparent, var(--accent), var(--accent-secondary), transparent);
  filter: drop-shadow(0 0 6px var(--accent));
  animation: accentFlow 3.6s ease-in-out infinite;
}

.overlay-stat::after {
  content: "";
  position: absolute;
  z-index: -1;
  right: -70px;
  bottom: -120px;
  width: 280px;
  height: 280px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(var(--accent-rgb), .18), rgba(var(--accent-rgb), 0) 68%);
  animation: glowPulse 3.6s ease-in-out infinite;
}

.winner-stat {
  --accent: #ffd34d;
  --accent-rgb: 255, 211, 77;
  --accent-secondary: #ff4d9b;
}

.countdown-stat { text-align: right; }

.stat-identity {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: clamp(10px, 1.2vw, 18px);
  min-width: 0;
  text-align: left;
}

.stat-mark {
  flex: 0 0 auto;
  position: relative;
  display: grid;
  place-items: center;
  width: clamp(40px, 4.2vw, 58px);
  height: clamp(40px, 4.2vw, 58px);
  color: #fff;
  clip-path: polygon(22% 0, 78% 0, 100% 22%, 100% 78%, 78% 100%, 22% 100%, 0 78%, 0 22%);
  background: linear-gradient(145deg, var(--accent), var(--accent-secondary));
  box-shadow: 0 0 18px rgba(var(--accent-rgb), .38);
}

.stat-mark::before {
  content: "";
  position: absolute;
  inset: 3px;
  z-index: -1;
  clip-path: inherit;
  background: #11162f;
}

.stat-mark svg {
  width: 62%;
  height: 62%;
  fill: currentColor;
  filter: drop-shadow(0 2px 2px rgba(0, 0, 0, .5));
}

.stat-copy {
  display: flex;
  flex-direction: column;
  gap: clamp(3px, .5vh, 7px);
  min-width: 0;
}

.stat-copy > small {
  color: var(--accent);
  font-size: clamp(8px, .8vw, 12px);
  font-weight: 800;
  line-height: 1;
  letter-spacing: .22em;
  text-shadow: 0 0 10px rgba(var(--accent-rgb), .5);
  white-space: nowrap;
}

.stat-label {
  flex: 0 1 auto;
  color: #fff;
  font-size: clamp(16px, 1.65vw, 26px);
  font-weight: 800;
  line-height: 1.05;
  letter-spacing: .06em;
  text-shadow: 0 2px 0 #000, 0 0 12px rgba(255, 255, 255, .12);
  white-space: nowrap;
}

.stat-value {
  flex: 0 0 auto;
  position: relative;
  z-index: 1;
  display: flex;
  align-items: baseline;
  gap: .22em;
  font-size: clamp(40px, 5.4vw, 78px);
  font-weight: 900;
  line-height: .92;
  letter-spacing: .015em;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.stat-value b {
  color: #fff;
  background: linear-gradient(180deg, #fff 8%, #dce9ff 48%, var(--accent) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  filter: drop-shadow(0 4px 0 #02040c) drop-shadow(0 0 8px rgba(var(--accent-rgb), .28));
}

.winner-stat .stat-value b {
  background-image: linear-gradient(180deg, #fff9d6 0%, #ffd84d 46%, #ff9d2e 100%);
}

.stat-value small {
  font-size: .38em;
  color: var(--accent);
  text-shadow: 0 2px 0 #000, 0 0 8px rgba(var(--accent-rgb), .5);
}

.countdown-stat.expired {
  --accent: #ff5278;
  --accent-rgb: 255, 82, 120;
  --accent-secondary: #ffb347;
  background:
    linear-gradient(115deg, rgba(var(--accent-rgb), .16), transparent 40%),
    linear-gradient(160deg, #351226, #160b1c 60%, #090713);
}

@keyframes accentFlow {
  0%, 100% { opacity: .62; transform: translateX(-8%); }
  50% { opacity: 1; transform: translateX(44%); }
}

@keyframes glowPulse {
  0%, 100% { opacity: .55; transform: scale(.92); }
  50% { opacity: 1; transform: scale(1.08); }
}

@media (max-width: 760px) {
  .live-overlay-view { gap: 8px; padding-inline: 10px; }
  .overlay-stat { gap: 8px; padding-inline: 12px; }
  .stat-mark { display: none; }
  .stat-copy > small { font-size: 7px; }
  .stat-label { font-size: 12px; }
  .stat-value { font-size: 29px; }
}

@media (prefers-reduced-motion: reduce) {
  .overlay-stat::before,
  .overlay-stat::after { animation: none; }
}
</style>
