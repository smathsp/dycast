<template>
  <Transition name="repo-fade" :duration="240">
    <div v-show="visible" class="repo-dialog" @click.self="hideFeedDialog">
      <section class="repo-panel" role="dialog" aria-modal="true" aria-labelledby="repo-title">
        <button class="repo-close" type="button" aria-label="关闭" @click="hideFeedDialog">×</button>

        <div class="repo-eyebrow">OPEN SOURCE</div>
        <h2 id="repo-title">项目与仓库</h2>
        <p class="repo-intro">本应用基于开源项目 DyCast 继续开发，感谢原作者提供核心弹幕连接能力。</p>

        <div class="repo-list">
          <a
            class="repo-card original"
            href="https://github.com/skmcj/dycast"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span class="repo-icon">源</span>
            <span class="repo-copy">
              <small>原作者仓库</small>
              <strong>skmcj / dycast</strong>
              <em>项目原始版本与核心实现</em>
            </span>
            <span class="repo-arrow">↗</span>
          </a>

          <a
            class="repo-card maintained"
            href="https://github.com/smathsp/dycast"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span class="repo-icon">新</span>
            <span class="repo-copy">
              <small>当前维护仓库</small>
              <strong>smathsp / dycast</strong>
              <em>Happy、灯牌、音频与界面增强版本</em>
            </span>
            <span class="repo-arrow">↗</span>
          </a>
        </div>

        <footer>点击仓库卡片会使用系统浏览器打开 GitHub</footer>
      </section>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { isBoolean } from '@/utils/typeUtil';

interface FeedDialogProps {
  modelValue?: boolean;
}

const props = withDefaults(defineProps<FeedDialogProps>(), {
  modelValue: false
});

const visible = ref(false);
const emits = defineEmits({ 'update:modelValue': (value: boolean) => isBoolean(value) });

function hideFeedDialog() {
  visible.value = false;
  emits('update:modelValue', false);
}

watch(
  () => props.modelValue,
  value => { visible.value = value; }
);
</script>

<style lang="scss" scoped>
.repo-fade-enter-active,
.repo-fade-leave-active { transition: opacity 0.24s ease; }
.repo-fade-enter-from,
.repo-fade-leave-to { opacity: 0; }

.repo-dialog {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: grid;
  place-items: center;
  padding: 28px;
  background: rgba(3, 7, 20, 0.78);
  backdrop-filter: blur(14px);
}

.repo-panel {
  position: relative;
  width: min(620px, calc(100vw - 44px));
  box-sizing: border-box;
  padding: 38px;
  color: #f5f8ff;
  border: 1px solid rgba(102, 165, 255, 0.26);
  border-radius: 24px;
  background: linear-gradient(145deg, #121c3d, #0a1026 70%);
  box-shadow: 0 28px 90px rgba(0, 0, 0, 0.48), inset 0 1px rgba(255, 255, 255, 0.06);
}

.repo-close {
  position: absolute;
  top: 18px;
  right: 20px;
  width: 34px;
  height: 34px;
  cursor: pointer;
  color: rgba(213, 224, 255, 0.68);
  border: 1px solid rgba(130, 159, 225, 0.22);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  font: 300 25px/1 Arial, sans-serif;
}
.repo-close:hover { color: #fff; background: rgba(255, 255, 255, 0.1); }

.repo-eyebrow { color: #55d9ff; font-size: 11px; font-weight: 800; letter-spacing: 3px; }
h2 { margin: 8px 0 8px; font-size: 30px; letter-spacing: 1px; }
.repo-intro { max-width: 500px; margin: 0; color: rgba(197, 210, 242, 0.7); font-size: 14px; line-height: 1.7; }

.repo-list { display: grid; gap: 12px; margin-top: 26px; }
.repo-card {
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr) 24px;
  align-items: center;
  gap: 14px;
  padding: 16px;
  color: inherit;
  text-decoration: none;
  border: 1px solid rgba(116, 147, 218, 0.2);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.035);
  transition: 160ms ease;
}
.repo-card:hover { transform: translateY(-2px); border-color: rgba(87, 212, 255, 0.58); background: rgba(51, 133, 215, 0.11); }
.repo-card.maintained { border-color: rgba(255, 192, 67, 0.3); }
.repo-card.maintained:hover { border-color: rgba(255, 202, 77, 0.7); background: rgba(255, 181, 42, 0.08); }

.repo-icon {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  color: #071224;
  border-radius: 13px;
  background: linear-gradient(135deg, #bdf4ff, #4dcfff);
  font-size: 14px;
  font-weight: 900;
}
.maintained .repo-icon { background: linear-gradient(135deg, #ffe39b, #ffbd3d); }
.repo-copy { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.repo-copy small { color: rgba(180, 199, 240, 0.58); font-size: 10px; letter-spacing: 1.2px; }
.repo-copy strong { overflow: hidden; font-size: 17px; text-overflow: ellipsis; white-space: nowrap; }
.repo-copy em { color: rgba(196, 209, 239, 0.64); font-size: 12px; font-style: normal; }
.repo-arrow { color: rgba(172, 202, 255, 0.58); font-size: 20px; }
footer { margin-top: 20px; color: rgba(152, 171, 214, 0.46); font-size: 11px; text-align: center; }

@media (max-width: 600px) {
  .repo-dialog { padding: 14px; }
  .repo-panel { width: 100%; padding: 30px 18px 22px; border-radius: 19px; }
  h2 { font-size: 25px; }
  .repo-card { grid-template-columns: 42px minmax(0, 1fr) 18px; gap: 10px; padding: 13px; }
  .repo-copy em { display: none; }
}
</style>
