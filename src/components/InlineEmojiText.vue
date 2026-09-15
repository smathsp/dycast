<template>
  <span class="inline-emoji-text">
    <img
      v-if="emojiUrl"
      class="inline-emoji"
      :src="emojiUrl"
      :alt="content || '会员表情'"
    />
    <template v-else v-for="(segment, index) in segments" :key="`${index}-${segment.text}`">
      <span v-if="segment.type === 'text'">{{ segment.text }}</span>
      <img
        v-else
        class="inline-emoji"
        :src="segment.url"
        :alt="segment.text"
        :title="segment.text"
      />
    </template>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { parseDouyinEmojiContent } from '@/utils/emojiUtil';

const props = withDefaults(defineProps<{
  content?: string;
  emojiUrl?: string;
}>(), {
  content: '',
  emojiUrl: ''
});

const segments = computed(() => parseDouyinEmojiContent(props.content));
</script>

<style scoped>
.inline-emoji-text {
  display: inline;
  white-space: inherit;
  font-family: 'LXGW WenKai', 'Microsoft YaHei UI', sans-serif;
  font-weight: 700;
  line-height: 1.35;
}
.inline-emoji {
  width: 1.28em;
  height: 1.28em;
  margin: 0 0.08em;
  object-fit: contain;
  vertical-align: -0.25em;
}
</style>
