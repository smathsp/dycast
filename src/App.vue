<template>
  <DanmuView v-if="isDanmuMode" />
  <IndexView v-else />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import IndexView from './views/IndexView.vue';
import DanmuView from './views/DanmuView.vue';
import { printInfo, printSKMCJ } from './utils/logUtil';

const isDanmuMode = computed(() => {
  return location.search.includes('danmu');
});

// 非弹幕模式才显示启动信息
if (!isDanmuMode.value) {
  setTimeout(() => {
    console.clear();
    printSKMCJ();
    printInfo();
  }, 1500);
}
</script>

<style lang="scss">
::selection {
  background-color: #8b968d;
  color: #fff;
}

html,
body {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
}
</style>
