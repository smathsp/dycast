<template>
  <div class="settings-panel">
    <div class="settings-title">
      <i class="ice-setting icon"></i>
      <span>显示设置</span>
      <span class="settings-advanced" @click="dialogVisible = true" title="高级设置">
        <i class="ice-setting icon"></i>
      </span>
    </div>
    <SettingsDialog v-model="dialogVisible" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import SettingsDialog from './SettingsDialog.vue';

const dialogVisible = ref(false);
</script>

<style lang="scss" scoped>
$textColor: #576470;
$iconColor: #9aa7b1;
$iconHoverColor: #e6a23c;

.settings-panel {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 12px;
}

.settings-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: $textColor;
  font-family: 'mkwxy';

  .icon {
    font-size: 16px;
  }
}

.settings-advanced {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  color: $iconColor;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.2s;

  .icon {
    font-size: 14px;
  }

  &:hover {
    color: $iconHoverColor;
    background: rgba(230, 162, 60, 0.1);
  }
}
</style>
