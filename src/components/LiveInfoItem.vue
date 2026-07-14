<template>
  <div class="live-info-item">
    <label class="title">{{ title }}：</label>
    <div class="live-info-item-main">
      <img v-if="cover" :src="cover" alt="avatar" class="avatar" />
      <span class="text" :title="String(text)">{{ text }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
interface LiveInfoItemProps {
  title?: string;
  text?: string | number;
  cover?: string;
}

const props = withDefaults(defineProps<LiveInfoItemProps>(), {
  text: '*****'
});
</script>

<style lang="scss" scoped>
$titleColor: #1e2732;
$textColor: #6b798e;

.live-info-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  .title {
    flex-shrink: 0;
    font-family: 'mkwxy';
    font-size: 0.85rem;
    font-weight: bold;
    color: $titleColor;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.live-info-item-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 5px;
  overflow: hidden;
  .text {
    user-select: none;
    font-size: 0.85rem;
    color: $textColor;
    font-family: 'dymht';
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .avatar {
    width: 1.8rem;
    height: 1.8rem;
    object-fit: cover;
    border-radius: 0.5rem;
    flex-shrink: 0;
  }
}
</style>
