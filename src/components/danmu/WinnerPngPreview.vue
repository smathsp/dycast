<template>
  <Teleport to="body">
    <Transition name="png-preview">
      <figure
        v-if="visible"
        ref="previewRef"
        class="png-preview-float"
        :style="previewStyle"
        aria-label="Happy PNG 预览"
        @pointerdown.prevent="startDragging"
      >
        <img
          :src="imageUrl"
          alt="Happy PNG"
          draggable="false"
          @load="fitImageToViewport"
        />
        <button
          class="resize-handle"
          type="button"
          aria-label="调整 Happy PNG 预览大小"
          title="拖动调整大小"
          @pointerdown.stop.prevent="startResizing"
        ></button>
      </figure>
    </Transition>
    <button
      v-if="visible"
      class="close-button"
      type="button"
      aria-label="关闭 Happy PNG 预览"
      title="关闭图片"
      :style="closeButtonStyle"
      @pointerdown.stop.prevent
      @pointerup.stop.prevent="close"
      @mousedown.stop.prevent
      @click.stop.prevent="close"
    >×</button>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';

const PNG_READY_EVENT = 'dycast-winner-png-ready';
const visible = ref(false);
const imageUrl = ref('');
const previewRef = ref<HTMLElement | null>(null);
const position = reactive({ x: 14, y: 14 });
const size = reactive({ width: 0, height: 0 });
let imageAspectRatio = 1;
let dragOffsetX = 0;
let dragOffsetY = 0;
let dragging = false;
let resizing = false;
let resizeStartX = 0;
let resizeStartWidth = 0;

const previewStyle = computed(() => ({
  left: `${position.x}px`,
  top: `${position.y}px`,
  width: `${size.width}px`,
  height: `${size.height}px`
}));

// 关闭按钮脱离图片拖拽层，避免 Electron 标题栏和指针捕获吞掉点击事件。
const closeButtonStyle = computed(() => ({
  left: `${Math.max(8, Math.min(window.innerWidth - 50, position.x + size.width - 50))}px`,
  top: `${Math.max(56, position.y + 10)}px`
}));

function handlePngReady(event: CustomEvent<{ dataUrl: string }>): void {
  if (!event.detail?.dataUrl) return;
  imageUrl.value = event.detail.dataUrl;
  visible.value = true;
}

function fitImageToViewport(event: Event): void {
  const image = event.currentTarget as HTMLImageElement;
  if (!image.naturalWidth || !image.naturalHeight) return;
  imageAspectRatio = image.naturalWidth / image.naturalHeight;
  const maxWidth = Math.max(260, window.innerWidth * 0.5);
  const maxHeight = window.innerHeight;
  // 纵向 Happy PNG 优先与窗口等高；极端横向图片才限制在左半侧。
  const scale = Math.min(maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
  size.width = Math.round(image.naturalWidth * scale);
  size.height = Math.round(image.naturalHeight * scale);
  position.x = 0;
  position.y = Math.max(0, Math.round((window.innerHeight - size.height) / 2));
}

function startDragging(event: PointerEvent): void {
  if (event.button !== 0 || !previewRef.value) return;
  const rect = previewRef.value.getBoundingClientRect();
  dragOffsetX = event.clientX - rect.left;
  dragOffsetY = event.clientY - rect.top;
  dragging = true;
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  window.addEventListener('pointermove', handlePointerMove);
  window.addEventListener('pointerup', stopDragging, { once: true });
}

function handlePointerMove(event: PointerEvent): void {
  if (!dragging || !previewRef.value) return;
  const rect = previewRef.value.getBoundingClientRect();
  position.x = Math.max(0, Math.min(window.innerWidth - rect.width, event.clientX - dragOffsetX));
  position.y = Math.max(0, Math.min(window.innerHeight - rect.height, event.clientY - dragOffsetY));
}

function stopDragging(): void {
  dragging = false;
  window.removeEventListener('pointermove', handlePointerMove);
}

function startResizing(event: PointerEvent): void {
  if (event.button !== 0 || !previewRef.value) return;
  resizing = true;
  resizeStartX = event.clientX;
  resizeStartWidth = previewRef.value.getBoundingClientRect().width;
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  window.addEventListener('pointermove', handleResizeMove);
  window.addEventListener('pointerup', stopResizing, { once: true });
}

function handleResizeMove(event: PointerEvent): void {
  if (!resizing) return;
  const maxWidthByHeight = (window.innerHeight - position.y) * imageAspectRatio;
  const maxWidth = Math.min(window.innerWidth - position.x, maxWidthByHeight);
  const minWidth = Math.min(240, maxWidth);
  size.width = Math.max(minWidth, Math.min(maxWidth, resizeStartWidth + event.clientX - resizeStartX));
  size.height = size.width / imageAspectRatio;
}

function stopResizing(): void {
  resizing = false;
  window.removeEventListener('pointermove', handleResizeMove);
}

function handleWindowResize(): void {
  const maxWidth = Math.min(window.innerWidth - position.x, (window.innerHeight - position.y) * imageAspectRatio);
  if (size.width > maxWidth) {
    size.width = maxWidth;
    size.height = size.width / imageAspectRatio;
  }
  position.x = Math.max(0, Math.min(position.x, window.innerWidth - size.width));
  position.y = Math.max(0, Math.min(position.y, window.innerHeight - size.height));
}

function close(): void {
  stopDragging();
  stopResizing();
  visible.value = false;
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && visible.value) close();
}

onMounted(() => {
  window.addEventListener(PNG_READY_EVENT, handlePngReady as EventListener);
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('resize', handleWindowResize);
});

onBeforeUnmount(() => {
  window.removeEventListener(PNG_READY_EVENT, handlePngReady as EventListener);
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('resize', handleWindowResize);
  window.removeEventListener('pointermove', handlePointerMove);
  window.removeEventListener('pointermove', handleResizeMove);
  window.removeEventListener('pointerup', stopDragging);
  window.removeEventListener('pointerup', stopResizing);
});
</script>

<style scoped>
.png-preview-float {
  position: fixed;
  z-index: 100020;
  box-sizing: border-box;
  margin: 0;
  cursor: move;
  touch-action: none;
  user-select: none;
  filter: drop-shadow(0 22px 35px rgba(0, 0, 0, 0.58));
}

.png-preview-float > img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 8px;
  pointer-events: none;
}

.close-button {
  position: fixed;
  z-index: 100040;
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  padding: 0 0 2px;
  cursor: pointer;
  opacity: 0.92;
  color: #fff;
  font-size: 30px;
  line-height: 1;
  border: 1px solid rgba(255, 255, 255, 0.24);
  border-radius: 50%;
  background: rgba(3, 6, 20, 0.72);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  transition: 150ms ease;
  pointer-events: auto;
  -webkit-app-region: no-drag !important;
}
.close-button:hover { opacity: 1; background: rgba(203, 51, 70, 0.88); transform: scale(1.06); }

.resize-handle {
  position: absolute;
  right: 5px;
  bottom: 5px;
  width: 25px;
  height: 25px;
  padding: 0;
  cursor: nwse-resize;
  opacity: 0.58;
  touch-action: none;
  border: 0;
  border-radius: 5px;
  background:
    linear-gradient(135deg, transparent 46%, rgba(255, 255, 255, 0.7) 47%, rgba(255, 255, 255, 0.7) 52%, transparent 53%) 7px 7px / 10px 10px no-repeat,
    linear-gradient(135deg, transparent 46%, #ffc94a 47%, #ffc94a 52%, transparent 53%) 12px 12px / 8px 8px no-repeat,
    rgba(3, 6, 20, 0.48);
}
.resize-handle:hover { opacity: 1; }

.png-preview-enter-active, .png-preview-leave-active { transition: opacity 180ms ease, transform 180ms ease; }
.png-preview-enter-from, .png-preview-leave-to { opacity: 0; transform: translateX(-20px) scale(0.97); }
</style>
