<template>
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div class="settings-dialog-overlay" v-if="modelValue" @click.self="close">
        <div class="settings-dialog">
          <div class="dialog-header">
            <span class="dialog-title">高级设置</span>
            <span class="dialog-close" @click="close">×</span>
          </div>
          <div class="dialog-body">
            <div class="setting-group">
              <div class="setting-row">
                <div class="setting-text">
                  <div class="setting-label">礼物价值</div>
                  <div class="setting-desc">显示礼物单价</div>
                </div>
                <label class="switch">
                  <input type="checkbox" v-model="settings.showGiftPrice" />
                  <span class="slider"></span>
                </label>
              </div>
            </div>
            <div class="setting-group">
              <div class="setting-row">
                <div class="setting-text">
                  <div class="setting-label">总计价值</div>
                  <div class="setting-desc">显示礼物总价</div>
                </div>
                <label class="switch">
                  <input type="checkbox" v-model="settings.showGiftTotal" />
                  <span class="slider"></span>
                </label>
              </div>
            </div>
            <div class="setting-divider"></div>
            <div class="setting-group">
              <div class="setting-label">礼物置顶阈值</div>
              <div class="setting-desc">送礼价值超过此数值将置顶显示</div>
              <div class="setting-input-row">
                <input
                  type="number"
                  class="setting-input"
                  v-model.number="settings.giftHighlightThreshold"
                  min="0"
                  placeholder="100" />
                <span class="setting-unit">抖币</span>
              </div>
            </div>
            <div class="setting-group">
              <div class="setting-label">置顶显示时长</div>
              <div class="setting-desc">置顶礼物显示多少秒后消失</div>
              <div class="setting-input-row">
                <input
                  type="number"
                  class="setting-input"
                  v-model.number="settings.giftHighlightDuration"
                  min="1"
                  max="60"
                  placeholder="5" />
                <span class="setting-unit">秒</span>
              </div>
            </div>
          </div>
          <div class="dialog-footer">
            <button class="dialog-btn" @click="close">确定</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { useSettings } from '@/utils/settingUtil';

const modelValue = defineModel<boolean>({ default: false });
const settings = useSettings();

const close = () => {
  modelValue.value = false;
};
</script>

<style lang="scss" scoped>
$theme: #68be8d;
$text: #576470;
$desc: #9aa7b1;
$bd: #b2bfc3;
$bg: #f7f6f5;
$activeColor: #68be8d;
$inactiveColor: #ccc;

.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 0.25s ease;
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
}

.settings-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.settings-dialog {
  width: 360px;
  background: $bg;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid $bd;

  .dialog-title {
    font-size: 16px;
    font-weight: bold;
    color: $text;
    font-family: 'mkwxy';
  }

  .dialog-close {
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    color: $desc;
    cursor: pointer;
    border-radius: 50%;
    transition: all 0.2s;

    &:hover {
      color: #e95464;
      background: rgba(233, 84, 100, 0.1);
    }
  }
}

.dialog-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.setting-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.setting-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.setting-label {
  font-size: 14px;
  font-weight: 500;
  color: $text;
  font-family: 'mkwxy';
}

.setting-desc {
  font-size: 12px;
  color: $desc;
  font-family: 'mkwxy';
}

.setting-divider {
  height: 0;
  border: 0;
  border-top: 1px solid $bd;
  margin: 4px 0;
}

/* 开关样式 */
.switch {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 22px;
  flex-shrink: 0;

  input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: $inactiveColor;
    transition: 0.3s;
    border-radius: 22px;

    &::before {
      position: absolute;
      content: '';
      height: 16px;
      width: 16px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      transition: 0.3s;
      border-radius: 50%;
    }
  }

  input:checked + .slider {
    background-color: $activeColor;
  }

  input:checked + .slider::before {
    transform: translateX(18px);
  }
}

.setting-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.setting-input {
  width: 120px;
  height: 36px;
  padding: 0 12px;
  border: 1px solid $bd;
  border-radius: 8px;
  background: #fff;
  font-size: 14px;
  color: $text;
  font-family: 'mkwxy';
  outline: none;
  transition: border-color 0.2s;

  &:focus {
    border-color: $theme;
  }

  &::-webkit-inner-spin-button,
  &::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  -moz-appearance: textfield;
}

.setting-unit {
  font-size: 13px;
  color: $desc;
  font-family: 'mkwxy';
}

.dialog-footer {
  padding: 16px 20px;
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid $bd;
}

.dialog-btn {
  padding: 8px 24px;
  background: $theme;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-family: 'mkwxy';
  cursor: pointer;
  transition: opacity 0.2s;

  &:hover {
    opacity: 0.9;
  }

  &:active {
    opacity: 0.8;
  }
}
</style>
