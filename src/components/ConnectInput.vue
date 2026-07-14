<template>
  <div class="connect-input" ref="containerRef">
    <div class="connect-input-main">
      <label v-if="label" class="label">{{ `${label}:` }}</label>
      <input
        class="input-inner"
        :disabled="inputDisabled"
        :placeholder="placeholder"
        v-model="inputValue"
        @blur="handleBlur"
        @focus="handleFocus"
        @change="handleChange" />
      <div
        :class="{
          btns: true,
          active: connectStatus,
          disabled: btnDisabled
        }"
        @click.stop="handleClick">
        <span className="confirm-text">{{ confirmText }}</span>
        <span className="cancel-text">{{ cancelText }}</span>
      </div>
    </div>
    <div class="connect-input-test" v-if="test">
      <span v-if="testTip">{{ testTip }}</span>
    </div>
    <!-- 历史记录下拉列表 -->
    <div class="history-dropdown" v-if="showHistory && historyList.length > 0">
      <div class="history-item" v-for="item in historyList" :key="item.roomNum" @mousedown.prevent="selectHistory(item.roomNum)">
        <img v-if="item.avatar" class="history-avatar" :src="item.avatar" alt="头像" />
        <div class="history-info">
          <span class="history-nickname" v-if="item.nickname">{{ item.nickname }}</span>
          <span class="history-room">{{ item.roomNum }}</span>
        </div>
        <span class="history-delete" @mousedown.prevent.stop="deleteHistory(item.roomNum)" title="删除">×</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { debounce } from '@/utils/loashUtil';
import { onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue';
import type { HistoryItem } from '@/utils/historyUtil';

interface TestRV {
  flag: boolean;
  message?: string;
}

interface ConnectInputProps {
  label?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
  testTime?: 'blur' | 'change'; // 验证时机
  test?: (value: string) => TestRV; // 验证函数
  historyList?: HistoryItem[]; // 历史记录列表
}

const props = withDefaults(defineProps<ConnectInputProps>(), {
  confirmText: '连接',
  cancelText: '断开',
  testTime: 'blur',
  historyList: () => []
});
/** 输入框是否禁用 */
const inputDisabled = ref<boolean>(false);
/** 按钮状态 */
const btnDisabled = ref<boolean>(false);
/** 连接状态 */
const connectStatus = ref<boolean>(false);
/** 验证提示 */
const testTip = ref<string | undefined>(void 0);
/** 历史记录下拉框显示状态 */
const showHistory = ref<boolean>(false);
/** 容器引用 */
const containerRef = useTemplateRef('containerRef');
/** event */
const emits = defineEmits<{
  (e: 'confirm', value?: string): void;
  (e: 'cancel', value?: string): void;
  (e: 'blur', event: FocusEvent): void;
  (e: 'focus', event: FocusEvent): void;
  (e: 'change', event: Event): void;
  (e: 'select-history', value: string): void;
  (e: 'delete-history', value: string): void;
}>();

/** 输入框值 */
const inputValue = defineModel<string>('value');
/**
 * 按钮点击
 */
const handleClick = () => {
  // 锁定输入
  inputDisabled.value = true;
  btnDisabled.value = true;
  if (connectStatus.value) {
    // 取消
    emits('cancel', inputValue.value);
  } else {
    // 确认
    emits('confirm', inputValue.value);
  }
};
// 处理验证
const handleTest = debounce((value?: string) => {
  if (props.test) {
    const valid = props.test(value || '');
    if (valid.flag) {
      // 验证通过
      btnDisabled.value = false;
      testTip.value = void 0;
    } else {
      btnDisabled.value = true;
      testTip.value = valid.message;
    }
  }
}, 200);

const handleBlur = (e: FocusEvent) => {
  props.testTime === 'blur' && handleTest(inputValue.value);
  emits('blur', e);
};
const handleFocus = (e: FocusEvent) => {
  showHistory.value = true;
  emits('focus', e);
};
const handleChange = (e: Event) => {
  props.testTime === 'change' && handleTest(inputValue.value);
  emits('change', e);
};

/**
 * 选择历史记录
 */
const selectHistory = (value: string) => {
  inputValue.value = value;
  showHistory.value = false;
  emits('select-history', value);
};

/**
 * 删除历史记录
 */
const deleteHistory = (value: string) => {
  emits('delete-history', value);
};

/**
 * 点击外部关闭历史记录下拉框
 */
const handleClickOutside = (e: MouseEvent) => {
  if (containerRef.value && !containerRef.value.contains(e.target as Node)) {
    showHistory.value = false;
  }
};

/**
 * 设置连接状态
 * @param flag
 */
const setStatus = function (flag?: boolean) {
  if (flag) {
    // 连接成功
    // 锁定输入框，防止再次输入
    inputDisabled.value = true;
    connectStatus.value = true;
  } else {
    // 连接失败
    // 解锁输入框
    inputDisabled.value = false;
    connectStatus.value = false;
  }
  // 还原按钮状态
  btnDisabled.value = false;
};

/** 初始化数据 */
const initData = function () {
  if (props.test) btnDisabled.value = true;
};

onMounted(() => {
  initData();
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});

defineExpose({
  setStatus
});
</script>

<style lang="scss" scoped>
$bg: #f5f3f2;
$bd: #9aa7b1;
$focusBdColor: #81a380;
$labelColor: #81a380;
$inputColor: #576470;
$placeholder: #b4b5af;
$confirmColor: #68be8d;
$cancelColor: #e95464;
$testColor: $cancelColor;

.connect-input {
  position: relative;
  display: inline-flex;
  flex-direction: column;
  width: 100%;
  box-sizing: border-box;
}
.connect-input-main {
  position: relative;
  width: 100%;
  height: 36px;
  box-sizing: border-box;
  padding: 4px 12px;
  display: inline-flex;
  align-items: center;
  transition: all 0.2s;
  gap: 5px;
  border-radius: 18px;
  border: 1px solid $bd;
  background-color: $bg;
  font-family: 'mkwxy';
  overflow: hidden;
  &:has(.input-inner:focus) {
    border-color: $focusBdColor;
  }
  .label {
    flex-shrink: 0;
    font-size: 16px;
    color: $labelColor;
    user-select: none;
  }
  .input-inner {
    outline: none;
    background: none;
    border: none;
    width: 0;
    flex-grow: 1;
    height: 100%;
    font-size: 16px;
    font-family: 'mkwxy';
    letter-spacing: 1px;
    color: $inputColor;
    transition: opacity 0.2s;
    &:focus {
      background: none;
      border: none;
    }
    &:placeholder-shown {
      text-overflow: ellipsis;
    }
    &::placeholder {
      color: $placeholder;
      font-size: 14px;
    }
    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }
  .btns {
    flex-shrink: 0;
    align-self: flex-start;
    box-sizing: border-box;
    user-select: none;
    font-size: 16px;
    cursor: pointer;
    color: $confirmColor;
    transition: opacity 0.2s, transform cubic-bezier(0.175, 0.885, 0.32, 1.275) 0.3s;
    display: flex;
    flex-direction: column;
    align-items: center;
    height: 200%;
    span {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      box-sizing: border-box;
      padding: 0 5px;
    }
    &:hover {
      opacity: 0.9;
    }
    &:active {
      opacity: 0.8;
    }
    &.active {
      transform: translateY(-50%);
    }
    &.disabled {
      opacity: 0.7;
      pointer-events: none;
      cursor: not-allowed;
    }
    .cancel-text {
      color: $cancelColor;
    }
  }
}
.connect-input-test {
  user-select: none;
  display: inline-flex;
  align-items: center;
  box-sizing: border-box;
  padding: 0 12px;
  width: 100%;
  height: 18px;
  font-size: 12px;
  color: $testColor;
  span {
    animation: slide-top 0.3s cubic-bezier(0.165, 0.84, 0.44, 1);
  }
}

@keyframes slide-top {
  0% {
    opacity: 0;
    transform: translate3d(0, -24%, 0);
  }

  100% {
    opacity: 1;
    transform: translate3d(0, 0%, 0);
  }
}

.history-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: #fff;
  border: 1px solid $bd;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  max-height: 200px;
  overflow-y: auto;
  z-index: 100;
  animation: slide-top 0.2s ease;
}

.history-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  cursor: pointer;
  transition: background-color 0.15s;
  gap: 10px;

  &:hover {
    background-color: $bg;
  }

  .history-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
  }

  .history-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .history-nickname {
    font-size: 14px;
    color: $inputColor;
    font-family: 'mkwxy';
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .history-room {
    font-size: 12px;
    color: $placeholder;
    font-family: 'mkwxy';
  }

  .history-delete {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    color: $placeholder;
    border-radius: 50%;
    transition: color 0.15s, background-color 0.15s;

    &:hover {
      color: $cancelColor;
      background-color: rgba(233, 84, 100, 0.1);
    }
  }
}
</style>
