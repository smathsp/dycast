<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="visible"
        class="winner-overlay"
        @click.self="emit('close')"
      >
        <section
          class="winner-panel"
          :class="layout.className"
          :style="panelStyle"
        >
          <div class="panel-light"></div>
          <div class="panel-grid"></div>

          <header class="panel-header">
            <div class="header-brand">
              <div class="trophy"><span>🏆</span></div>
              <div class="brand-text">
                <h2>中奖记录</h2>
                <p>LOTTERY WINNERS</p>
              </div>
            </div>

            <div class="header-actions">
              <div class="winner-total">
                共 <strong>{{ displayWinners.length }}</strong> 人
              </div>
              <button
                class="clear-button"
                type="button"
                :disabled="displayWinners.length === 0"
                @click="emit('clear')"
              >清空</button>
              <button
                class="close-button"
                type="button"
                aria-label="关闭"
                @click="emit('close')"
              >
                <i></i><i></i>
              </button>
            </div>
          </header>

          <div class="round-bar">
            <div class="round-info">
              <span>本轮中奖名单</span>
              <strong>DRAW #{{ String(drawNo).padStart(3, "0") }}</strong>
            </div>
            <div class="round-line"></div>
            <time>{{ formattedTime }}</time>
          </div>

          <main class="winner-grid">
            <article
              v-for="(winner, index) in displayWinners"
              :key="winner.id || `${winner.nickname}-${index}`"
              class="winner-card"
              :style="{ '--delay': `${Math.min(index * 25, 300)}ms` }"
            >
              <div class="winner-order">
                <span>#</span>
                <strong>{{ String(index + 1).padStart(2, "0") }}</strong>
              </div>

              <div class="winner-avatar">
                <span class="avatar-fallback">{{ getInitial(winner.nickname) }}</span>
                <img
                  v-if="winner.avatar"
                  :src="winner.avatar"
                  alt=""
                  @error="handleAvatarError"
                />
              </div>

              <div class="winner-info">
                <div class="winner-name" :title="winner.nickname">{{ winner.nickname }}</div>
                <div class="winner-message" :title="winner.content">{{ winner.content }}</div>
              </div>

              <div class="card-chevron">
                <i></i><i></i>
              </div>
            </article>

            <div v-if="displayWinners.length === 0" class="empty-state">
              <div>🏆</div>
              <strong>暂无中奖记录</strong>
              <span>抽奖完成后，中奖名单会显示在这里</span>
            </div>
          </main>

          <footer class="panel-footer">
            <span></span>
            <p>DANMAKU ENERGY LOTTERY SYSTEM</p>
            <span></span>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Danmu } from '@/danmu/types';

interface LayoutConfig {
  columns: number;
  className: string;
  panelWidth: string;
  cardHeight: string;
}

const props = withDefaults(
  defineProps<{
    visible: boolean;
    winners: Danmu[];
    drawNo?: number;
  }>(),
  {
    drawNo: 1
  }
);

const emit = defineEmits<{
  close: [];
  clear: [];
}>();

const displayWinners = computed(() => props.winners.slice(0, 24));

const layout = computed<LayoutConfig>(() => {
  const count = displayWinners.value.length;

  if (count <= 1) return { columns: 1, className: 'layout-single', panelWidth: '680px', cardHeight: '180px' };
  if (count <= 3) return { columns: count, className: 'layout-hero', panelWidth: '1120px', cardHeight: '180px' };
  if (count <= 4) return { columns: 2, className: 'layout-showcase', panelWidth: '900px', cardHeight: '140px' };
  if (count <= 6) return { columns: 3, className: 'layout-showcase', panelWidth: '1180px', cardHeight: '140px' };
  if (count <= 8) return { columns: 4, className: 'layout-medium', panelWidth: '1400px', cardHeight: '126px' };
  if (count <= 10) return { columns: 5, className: 'layout-ten', panelWidth: '1580px', cardHeight: '120px' };
  if (count <= 12) return { columns: 4, className: 'layout-compact', panelWidth: '1420px', cardHeight: '112px' };
  if (count <= 15) return { columns: 5, className: 'layout-compact', panelWidth: '1580px', cardHeight: '110px' };
  if (count <= 16) return { columns: 4, className: 'layout-dense', panelWidth: '1420px', cardHeight: '102px' };
  if (count <= 20) return { columns: 5, className: 'layout-dense', panelWidth: '1600px', cardHeight: '100px' };
  return { columns: 6, className: 'layout-wall', panelWidth: '1740px', cardHeight: '104px' };
});

const panelStyle = computed(() => ({
  '--winner-columns': String(layout.value.columns),
  '--panel-width': layout.value.panelWidth,
  '--card-height': layout.value.cardHeight
}));

const formattedTime = computed(() => {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  }).format(new Date());
});

function getInitial(nickname: string): string {
  return nickname?.trim().slice(0, 1).toUpperCase() || '?';
}

function handleAvatarError(event: Event): void {
  (event.target as HTMLImageElement).style.display = 'none';
}
</script>

<style scoped>
.winner-overlay {
  --gold: #ffd83d;
  --gold-light: #fff2a0;
  --cyan: #39e3ff;
  --blue: #4783ff;
  --panel: #0e1533;
  --card: #1a2853;

  position: fixed;
  inset: 0;
  z-index: 99999;
  display: grid;
  place-items: center;
  padding: 16px;
  color: #fff;
  background:
    radial-gradient(circle at 50% 45%, rgba(50, 80, 190, 0.23), transparent 42%),
    rgba(2, 5, 20, 0.9);
  backdrop-filter: blur(14px);
  font-family: Inter, "Microsoft YaHei", "PingFang SC", sans-serif;
}

.winner-panel {
  position: relative;
  width: min(var(--panel-width), calc(100vw - 32px));
  max-height: calc(100vh - 28px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  isolation: isolate;
  border: 1px solid rgba(255, 216, 67, 0.23);
  border-radius: 22px;
  background:
    radial-gradient(circle at 13% 0%, rgba(48, 106, 221, 0.15), transparent 28%),
    linear-gradient(145deg, rgba(15, 21, 52, 0.99), rgba(7, 11, 31, 0.995));
  box-shadow:
    0 30px 100px rgba(0, 0, 0, 0.56),
    0 0 55px rgba(48, 83, 255, 0.13),
    inset 0 1px rgba(255, 255, 255, 0.045);
}

.panel-light {
  position: absolute; left: 50%; top: -180px; z-index: -1;
  width: 700px; height: 320px;
  transform: translateX(-50%);
  background: radial-gradient(ellipse, rgba(255, 197, 38, 0.13), transparent 70%);
  filter: blur(20px);
}

.panel-grid {
  position: absolute; inset: 0; z-index: -2;
  opacity: 0.07; pointer-events: none;
  background-image:
    linear-gradient(rgba(100, 128, 205, 0.15) 1px, transparent 1px),
    linear-gradient(90deg, rgba(100, 128, 205, 0.15) 1px, transparent 1px);
  background-size: 52px 52px;
  mask-image: radial-gradient(circle, #000, transparent 82%);
}

/* 头部 */
.panel-header {
  flex: none; min-height: 82px; padding: 15px 22px;
  display: flex; align-items: center; justify-content: space-between;
  border-bottom: 1px solid rgba(100, 119, 181, 0.14);
}
.header-brand { display: flex; align-items: center; gap: 13px; }
.trophy {
  width: 48px; height: 48px; display: grid; place-items: center;
  border: 1px solid rgba(255, 213, 56, 0.28); border-radius: 13px;
  background: linear-gradient(145deg, rgba(255, 213, 55, 0.13), rgba(255, 167, 26, 0.045));
  box-shadow: inset 0 0 14px rgba(255, 202, 37, 0.08), 0 0 18px rgba(255, 198, 30, 0.05);
  font-size: 27px;
}
.brand-text h2 { margin: 0; font-size: 25px; font-weight: 950; letter-spacing: 2px; }
.brand-text p { margin: 4px 0 0; color: rgba(129, 181, 235, 0.43); font-size: 7px; font-weight: 900; letter-spacing: 5px; }
.header-actions { display: flex; align-items: center; gap: 13px; }
.winner-total { color: rgba(197, 205, 230, 0.56); font-size: 15px; }
.winner-total strong { margin: 0 4px; color: var(--gold); font-size: 25px; }
.clear-button {
  padding: 8px 14px; cursor: pointer;
  color: rgba(224, 229, 246, 0.72); background: rgba(33, 40, 72, 0.66);
  border: 1px solid rgba(125, 141, 194, 0.2); border-radius: 9px;
  transition: color 160ms, background 160ms, border-color 160ms;
}
.clear-button:hover:not(:disabled) { color: #fff; background: rgba(128, 39, 54, 0.22); border-color: rgba(255, 110, 110, 0.45); }
.clear-button:disabled { cursor: default; opacity: 0.35; }
.close-button {
  position: relative; width: 36px; height: 36px; cursor: pointer;
  border: 0; background: transparent; opacity: 0.56;
  transition: transform 160ms, opacity 160ms;
}
.close-button:hover { opacity: 1; transform: rotate(90deg); }
.close-button i { position: absolute; left: 7px; top: 17px; width: 22px; height: 2px; background: #fff; font-style: normal; }
.close-button i:first-child { transform: rotate(45deg); }
.close-button i:last-child { transform: rotate(-45deg); }

/* 轮次 */
.round-bar {
  flex: none; padding: 10px 21px; display: flex; align-items: center; gap: 14px;
  border-bottom: 1px solid rgba(99, 116, 181, 0.1);
  background: linear-gradient(90deg, rgba(51, 84, 194, 0.08), transparent);
}
.round-info { display: flex; align-items: center; gap: 12px; white-space: nowrap; }
.round-info span { color: rgba(202, 212, 239, 0.57); font-size: 13px; }
.round-info strong { color: var(--cyan); font-size: 10px; font-weight: 900; letter-spacing: 2px; }
.round-line { flex: 1; height: 1px; background: linear-gradient(90deg, rgba(61, 212, 255, 0.27), transparent); }
.round-bar time { color: rgba(151, 163, 201, 0.39); font-size: 11px; white-space: nowrap; }

/* 网格 */
.winner-grid {
  position: relative;
  display: grid;
  grid-template-columns: repeat(var(--winner-columns), minmax(0, 1fr));
  grid-auto-rows: var(--card-height);
  gap: 10px;
  padding: 16px 18px 19px;
  overflow: hidden;
}

/* 卡片 */
.winner-card {
  --order-width: 72px;
  --avatar-size: 50px;
  position: relative; min-width: 0; min-height: 0;
  display: grid;
  grid-template-columns: var(--order-width) var(--avatar-size) minmax(0, 1fr) 14px;
  align-items: center;
  gap: 11px; padding: 7px 10px 7px 7px; overflow: hidden;
  border: 1px solid rgba(98, 132, 219, 0.17); border-radius: 13px;
  background:
    radial-gradient(circle at 10% 50%, rgba(46, 146, 255, 0.09), transparent 34%),
    linear-gradient(120deg, rgba(31, 44, 89, 0.96), rgba(20, 29, 63, 0.94));
  box-shadow: inset 0 1px rgba(255, 255, 255, 0.025), 0 5px 15px rgba(0, 0, 0, 0.12);
  animation: card-enter 350ms var(--delay) both;
  transition: transform 160ms, border-color 160ms, box-shadow 160ms, background 160ms;
}
.winner-card::after {
  content: ""; position: absolute; left: -80px; top: -40%; bottom: -40%; width: 42px;
  opacity: 0;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.11), transparent);
  transform: rotate(15deg); transition: left 420ms, opacity 160ms;
}
.winner-card:hover {
  z-index: 2; transform: translateY(-2px);
  border-color: rgba(61, 209, 255, 0.31);
  background:
    radial-gradient(circle at 10% 50%, rgba(53, 169, 255, 0.14), transparent 36%),
    linear-gradient(120deg, rgba(38, 54, 106, 0.98), rgba(25, 36, 78, 0.97));
  box-shadow: 0 9px 23px rgba(0, 0, 0, 0.2), 0 0 20px rgba(52, 152, 255, 0.09);
}
.winner-card:hover::after { left: calc(100% + 50px); opacity: 1; }

/* 序号 */
.winner-order {
  align-self: stretch; min-width: 0;
  display: flex; align-items: center; justify-content: center; gap: 1px;
  border: 1px solid rgba(255, 214, 51, 0.21); border-radius: 10px;
  background: linear-gradient(145deg, rgba(255, 216, 50, 0.17), rgba(255, 172, 26, 0.055));
  box-shadow: inset 0 1px rgba(255, 250, 196, 0.06), 0 0 12px rgba(255, 196, 25, 0.035);
}
.winner-order span { color: rgba(255, 232, 117, 0.9); font-size: 14px; font-weight: 950; font-style: italic; }
.winner-order strong {
  color: var(--gold);
  font-family: Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif;
  font-size: 37px; font-style: italic; font-weight: 900; letter-spacing: 1px; line-height: 1;
  text-shadow: 0 2px 0 rgba(94, 56, 0, 0.62), 0 0 10px rgba(255, 211, 42, 0.17);
}

/* 头像 */
.winner-avatar { position: relative; width: var(--avatar-size); height: var(--avatar-size); display: grid; place-items: center; }
.winner-avatar::before {
  content: ""; position: absolute; inset: -3px; border-radius: 50%;
  border: 1px solid rgba(56, 214, 255, 0.28);
  box-shadow: 0 0 9px rgba(52, 188, 255, 0.13), inset 0 0 7px rgba(56, 139, 255, 0.09);
}
.winner-avatar img, .avatar-fallback { position: absolute; inset: 0; width: 100%; height: 100%; border-radius: 50%; }
.winner-avatar img { z-index: 2; object-fit: cover; }
.avatar-fallback { display: grid; place-items: center; color: #fff; background: linear-gradient(135deg, #2d7de3, #7755d8); font-size: 17px; font-weight: 900; }

/* 信息 */
.winner-info { min-width: 0; }
.winner-name { overflow: hidden; color: var(--gold); font-size: 16px; font-weight: 950; letter-spacing: 0.3px; text-overflow: ellipsis; white-space: nowrap; text-shadow: 0 0 10px rgba(255, 204, 37, 0.14); }
.winner-message { margin-top: 5px; overflow: hidden; color: rgba(218, 226, 248, 0.55); font-size: 11px; line-height: 1.4; text-overflow: ellipsis; white-space: nowrap; }

/* 箭头 */
.card-chevron { display: flex; gap: 2px; opacity: 0.3; }
.card-chevron i { display: block; width: 6px; height: 6px; border-top: 1px solid var(--cyan); border-right: 1px solid var(--cyan); transform: rotate(45deg); font-style: normal; }
.card-chevron i:last-child { opacity: 0.45; }

/* 底部 */
.panel-footer { flex: none; padding: 6px 21px 11px; display: flex; align-items: center; gap: 13px; color: rgba(92, 124, 188, 0.24); font-size: 7px; font-weight: 900; letter-spacing: 4px; }
.panel-footer span { flex: 1; height: 1px; background: linear-gradient(90deg, transparent, rgba(61, 173, 255, 0.15)); }
.panel-footer span:last-child { transform: scaleX(-1); }
.panel-footer p { margin: 0; }

/* 空状态 */
.empty-state { grid-column: 1 / -1; min-height: 250px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: rgba(179, 191, 226, 0.44); }
.empty-state div { margin-bottom: 12px; font-size: 44px; opacity: 0.58; }
.empty-state strong { color: rgba(229, 235, 252, 0.7); font-size: 18px; }
.empty-state span { margin-top: 7px; font-size: 12px; }

/* 1人 */
.layout-single .winner-grid { padding: 25px; }
.layout-single .winner-card { --order-width: 105px; --avatar-size: 82px; grid-template-columns: var(--order-width) var(--avatar-size) minmax(0, 1fr); padding: 20px; }
.layout-single .card-chevron { display: none; }
.layout-single .winner-order strong { font-size: 55px; }
.layout-single .winner-name { font-size: 25px; }
.layout-single .winner-message { font-size: 15px; }

/* 2～3人 */
.layout-hero .winner-grid { gap: 17px; padding: 24px; }
.layout-hero .winner-card { --order-width: 82px; --avatar-size: 66px; }
.layout-hero .winner-order strong { font-size: 44px; }
.layout-hero .winner-name { font-size: 20px; }
.layout-hero .winner-message { font-size: 13px; }

/* 4～6人 */
.layout-showcase .winner-grid { gap: 14px; padding: 21px 25px 24px; }
.layout-showcase .winner-card { --order-width: 85px; --avatar-size: 61px; padding: 12px 14px 12px 10px; }
.layout-showcase .winner-order strong { font-size: 45px; }
.layout-showcase .winner-name { font-size: 19px; }
.layout-showcase .winner-message { font-size: 13px; }

/* 7～8人 */
.layout-medium .winner-card { --order-width: 76px; --avatar-size: 53px; }

/* 9～10人 */
.layout-ten .winner-grid { gap: 11px; padding: 18px 20px 21px; }
.layout-ten .winner-card { --order-width: 68px; --avatar-size: 47px; gap: 9px; padding: 8px 8px 8px 6px; }
.layout-ten .winner-order strong { font-size: 33px; }
.layout-ten .winner-order span { font-size: 12px; }
.layout-ten .winner-name { font-size: 14px; }
.layout-ten .winner-message { margin-top: 4px; font-size: 10px; }

/* 11～15人 */
.layout-compact .winner-grid { gap: 9px; padding: 15px 17px 18px; }
.layout-compact .winner-card { --order-width: 64px; --avatar-size: 43px; gap: 8px; padding: 7px 7px 7px 5px; border-radius: 11px; }
.layout-compact .winner-order { border-radius: 8px; }
.layout-compact .winner-order strong { font-size: 30px; }
.layout-compact .winner-order span { font-size: 10px; }
.layout-compact .winner-name { font-size: 13px; }
.layout-compact .winner-message { margin-top: 3px; font-size: 9px; }

/* 16～20人 */
.layout-dense .panel-header { min-height: 72px; padding-block: 12px; }
.layout-dense .winner-grid { gap: 8px; padding: 12px 15px 16px; }
.layout-dense .winner-card { --order-width: 58px; --avatar-size: 39px; gap: 7px; padding: 5px 6px 5px 4px; border-radius: 10px; }
.layout-dense .winner-order { border-radius: 7px; }
.layout-dense .winner-order strong { font-size: 27px; }
.layout-dense .winner-order span { font-size: 9px; }
.layout-dense .winner-name { font-size: 12px; }
.layout-dense .winner-message { margin-top: 2px; font-size: 8px; }

/* 21～24人 */
.layout-wall .panel-header { min-height: 68px; padding: 10px 17px; }
.layout-wall .trophy { width: 39px; height: 39px; font-size: 21px; }
.layout-wall .brand-text h2 { font-size: 19px; }
.layout-wall .brand-text p { display: none; }
.layout-wall .round-bar { padding: 8px 16px; }
.layout-wall .winner-grid { gap: 8px; padding: 10px 13px 14px; }
.layout-wall .winner-card { --order-width: 59px; --avatar-size: 39px; grid-template-columns: var(--order-width) var(--avatar-size) minmax(0, 1fr); gap: 7px; padding: 5px 7px 5px 5px; border-radius: 10px; }
.layout-wall .winner-order { border-radius: 8px; }
.layout-wall .winner-order span { font-size: 9px; }
.layout-wall .winner-order strong { font-size: 27px; }
.layout-wall .winner-name { font-size: 12px; }
.layout-wall .winner-message { margin-top: 2px; font-size: 8px; }
.layout-wall .card-chevron, .layout-wall .panel-footer { display: none; }

/* 动画 */
@keyframes card-enter { from { opacity: 0; transform: translateY(8px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
.modal-enter-active, .modal-leave-active { transition: opacity 220ms ease; }
.modal-enter-active .winner-panel { animation: panel-enter 340ms cubic-bezier(0.18, 1.2, 0.34, 1); }
.modal-enter-from, .modal-leave-to { opacity: 0; }
@keyframes panel-enter { from { opacity: 0; transform: scale(0.94) translateY(18px); filter: blur(7px); } to { opacity: 1; transform: scale(1) translateY(0); filter: blur(0); } }

@media (max-width: 1200px) {
  .winner-overlay { padding: 6px; }
  .winner-panel { width: calc(100vw - 12px) !important; max-height: calc(100vh - 12px); border-radius: 14px; }
  .panel-header { min-height: 62px; padding: 9px 13px; }
  .trophy { width: 36px; height: 36px; font-size: 19px; }
  .brand-text h2 { font-size: 17px; }
  .brand-text p, .round-bar time, .panel-footer { display: none; }
  .winner-grid { gap: 5px; padding: 7px; }
}

@media (prefers-reduced-motion: reduce) {
  .winner-overlay *, .winner-overlay *::before, .winner-overlay *::after {
    animation-duration: 0.001ms !important; transition-duration: 0.001ms !important;
  }
}
</style>
