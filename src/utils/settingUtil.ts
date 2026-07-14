import { ref, watch } from 'vue';

const STORAGE_KEY = 'dycast_settings';

export interface Settings {
  /** 显示礼物价值 */
  showGiftPrice: boolean;
  /** 显示总计价值 */
  showGiftTotal: boolean;
  /** 置顶礼物价值阈值（抖币） */
  giftHighlightThreshold: number;
  /** 置顶显示时长（秒） */
  giftHighlightDuration: number;
}

const defaultSettings: Settings = {
  showGiftPrice: true,
  showGiftTotal: true,
  giftHighlightThreshold: 100,
  giftHighlightDuration: 5
};

/**
 * 从 localStorage 加载设置
 */
function loadSettings(): Settings {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      return { ...defaultSettings, ...JSON.parse(data) };
    }
  } catch {}
  return { ...defaultSettings };
}

/**
 * 保存设置到 localStorage
 */
function saveSettings(settings: Settings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

/** 全局设置状态 */
const settings = ref<Settings>(loadSettings());

// 监听变化自动保存
watch(settings, (val) => {
  saveSettings(val);
}, { deep: true });

/**
 * 使用设置
 */
export function useSettings() {
  return settings;
}
