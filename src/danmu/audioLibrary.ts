import { reactive } from 'vue';
import chargingSrc from '@/audio/充能-难得真兄弟.mp3';
import lotterySrc from '@/audio/抽奖.mp3';
import winnerSrc from '@/audio/中奖-得吃小曲.mp3';
import { enqueuePersistentSettingsSection } from '@/utils/persistentSettingsQueue';

export type AudioCategory = 'charging' | 'lottery' | 'winner';
export type AudioPlaybackMode = 'random' | 'single' | 'list';

export interface AudioTrack {
  id: string;
  category: AudioCategory;
  name: string;
  mimeType: string;
  size: number;
  url: string;
  builtin: boolean;
  createdAt: number;
}

export interface AudioCategoryConfig {
  mode: AudioPlaybackMode;
  selectedTrackId: string;
  disabledTrackIds: string[];
}

interface StoredAudioTrack {
  id: string;
  category: AudioCategory;
  name: string;
  mimeType: string;
  size: number;
  blob: Blob;
  createdAt: number;
}

const DB_NAME = 'dycast_audio_library';
const DB_VERSION = 1;
const STORE_NAME = 'tracks';
const SETTINGS_KEY = 'dycast_audio_settings';
const NORMALIZATION_KEY = 'dycast_audio_volume_normalization';
const MASTER_VOLUME_KEY = 'dycast_audio_master_volume';
const MAX_AUDIO_SIZE = 100 * 1024 * 1024;

export const AUDIO_CATEGORY_META: Record<AudioCategory, { label: string; hint: string }> = {
  charging: { label: '充能', hint: '开始充能后持续播放' },
  lottery: { label: '揭晓', hint: '揭晓阶段最多播放 5 秒' },
  winner: { label: 'Happy', hint: 'Happy 揭晓后持续播放' }
};

export const AUDIO_MODE_META: Record<AudioPlaybackMode, string> = {
  random: '随机播放',
  single: '单曲循环',
  list: '列表循环'
};

const builtinTracks: AudioTrack[] = [
  {
    id: 'builtin:charging',
    category: 'charging',
    name: '内置 · 充能-难得真兄弟',
    mimeType: 'audio/mpeg',
    size: 0,
    url: chargingSrc,
    builtin: true,
    createdAt: 0
  },
  {
    id: 'builtin:lottery',
    category: 'lottery',
    name: '内置 · 揭晓',
    mimeType: 'audio/mpeg',
    size: 0,
    url: lotterySrc,
    builtin: true,
    createdAt: 0
  },
  {
    id: 'builtin:winner',
    category: 'winner',
    name: '内置 · Happy 背景乐',
    mimeType: 'audio/mpeg',
    size: 0,
    url: winnerSrc,
    builtin: true,
    createdAt: 0
  }
];

const defaultConfigs: Record<AudioCategory, AudioCategoryConfig> = {
  charging: { mode: 'single', selectedTrackId: 'builtin:charging', disabledTrackIds: [] },
  lottery: { mode: 'single', selectedTrackId: 'builtin:lottery', disabledTrackIds: [] },
  winner: { mode: 'single', selectedTrackId: 'builtin:winner', disabledTrackIds: [] }
};

function loadConfigs(): Record<AudioCategory, AudioCategoryConfig> {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const saved = raw ? JSON.parse(raw) as Partial<Record<AudioCategory, Partial<AudioCategoryConfig>>> : {};
    return Object.fromEntries(
      (Object.keys(defaultConfigs) as AudioCategory[]).map(category => [
        category,
        { ...defaultConfigs[category], ...saved[category] }
      ])
    ) as Record<AudioCategory, AudioCategoryConfig>;
  } catch {
    return structuredClone(defaultConfigs);
  }
}

function loadVolumeNormalization(): boolean {
  try {
    return localStorage.getItem(NORMALIZATION_KEY) !== 'false';
  } catch {
    return true;
  }
}

function loadMasterVolume(): number {
  try {
    const raw = localStorage.getItem(MASTER_VOLUME_KEY);
    if (raw === null) return 70;
    const saved = Number(raw);
    return Number.isFinite(saved) && saved >= 0 && saved <= 100 ? Math.round(saved) : 70;
  } catch {
    return 70;
  }
}

export const audioLibraryState = reactive({
  ready: false,
  loading: false,
  volumeNormalization: loadVolumeNormalization(),
  masterVolume: loadMasterVolume(),
  tracks: [...builtinTracks] as AudioTrack[],
  configs: loadConfigs()
});

export const usesLocalAudioFiles = Boolean(window.electronAPI?.listAudioFiles);

let databasePromise: Promise<IDBDatabase> | null = null;
const objectUrls = new Set<string>();

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('category', 'category', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('音频数据库打开失败'));
  });
  return databasePromise;
}

async function getStoredTracks(): Promise<StoredAudioTrack[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as StoredAudioTrack[]);
    request.onerror = () => reject(request.error || new Error('读取音频失败'));
  });
}

async function putStoredTrack(track: StoredAudioTrack): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(track);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error('保存音频失败'));
  });
}

async function removeStoredTrack(id: string): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error('删除音频失败'));
  });
}

function saveConfigs(categories: AudioCategory[] = Object.keys(defaultConfigs) as AudioCategory[]): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(audioLibraryState.configs));
  savePersistentAudioSettings({
    configs: Object.fromEntries(categories.map(category => [
      category,
      JSON.parse(JSON.stringify(audioLibraryState.configs[category])) as AudioCategoryConfig
    ]))
  });
}

function savePersistentAudioSettings(patch: Record<string, unknown>): void {
  void enqueuePersistentSettingsSection('audio', patch);
}

let libraryChannel: BroadcastChannel | null = null;
try {
  libraryChannel = new BroadcastChannel('dycast-audio-library');
  libraryChannel.onmessage = event => {
    if (event.data?.type === 'library-change') void refreshAudioLibrary();
  };
} catch {}

function notifyLibraryChange(): void {
  try { libraryChannel?.postMessage({ type: 'library-change' }); } catch {}
}

export async function refreshAudioLibrary(): Promise<void> {
  if (audioLibraryState.loading) return;
  audioLibraryState.loading = true;
  try {
    if (window.electronAPI?.listAudioFiles) {
      const localTracks = await window.electronAPI.listAudioFiles();
      audioLibraryState.tracks = [
        ...builtinTracks,
        ...localTracks.map<AudioTrack>(track => ({ ...track, builtin: false }))
      ];
      audioLibraryState.ready = true;
      return;
    }
    const stored = await getStoredTracks();
    objectUrls.forEach(url => URL.revokeObjectURL(url));
    objectUrls.clear();
    const uploaded = stored
      .sort((a, b) => a.createdAt - b.createdAt)
      .map<AudioTrack>(track => {
        const url = URL.createObjectURL(track.blob);
        objectUrls.add(url);
        return { ...track, url, builtin: false };
      });
    audioLibraryState.tracks = [...builtinTracks, ...uploaded];
    audioLibraryState.ready = true;
  } catch (error) {
    console.warn('[audio-library] 读取失败:', error);
    audioLibraryState.tracks = [...builtinTracks];
    audioLibraryState.ready = true;
  } finally {
    audioLibraryState.loading = false;
  }
}

export const audioLibraryReady = refreshAudioLibrary();

export function getCategoryTracks(category: AudioCategory, enabledOnly = false): AudioTrack[] {
  const disabled = new Set(audioLibraryState.configs[category].disabledTrackIds);
  return audioLibraryState.tracks.filter(track => {
    return track.category === category && (!enabledOnly || !disabled.has(track.id));
  });
}

export function setAudioPlaybackMode(category: AudioCategory, mode: AudioPlaybackMode): void {
  audioLibraryState.configs[category].mode = mode;
  saveConfigs([category]);
}

export function setAudioVolumeNormalization(enabled: boolean): void {
  audioLibraryState.volumeNormalization = enabled;
  try { localStorage.setItem(NORMALIZATION_KEY, String(enabled)); } catch {}
  savePersistentAudioSettings({ volumeNormalization: enabled });
}

export function setAudioMasterVolume(volume: number): void {
  const normalized = Math.min(100, Math.max(0, Math.round(volume)));
  audioLibraryState.masterVolume = normalized;
  try { localStorage.setItem(MASTER_VOLUME_KEY, String(normalized)); } catch {}
  savePersistentAudioSettings({ masterVolume: normalized });
  window.dispatchEvent(new CustomEvent('dycast-audio-volume-change', { detail: normalized / 100 }));
}

export function setSelectedAudioTrack(category: AudioCategory, trackId: string): void {
  audioLibraryState.configs[category].selectedTrackId = trackId;
  const disabled = audioLibraryState.configs[category].disabledTrackIds;
  audioLibraryState.configs[category].disabledTrackIds = disabled.filter(id => id !== trackId);
  saveConfigs([category]);
}

export function setAudioTrackEnabled(category: AudioCategory, trackId: string, enabled: boolean): void {
  const disabled = new Set(audioLibraryState.configs[category].disabledTrackIds);
  if (enabled) disabled.delete(trackId);
  else disabled.add(trackId);
  audioLibraryState.configs[category].disabledTrackIds = Array.from(disabled);
  saveConfigs([category]);
}

function isSupportedAudio(file: File): boolean {
  return file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac|webm)$/i.test(file.name);
}

export async function uploadAudioTracks(category: AudioCategory, files: File[]): Promise<string[]> {
  const errors: string[] = [];
  for (const file of files) {
    if (!isSupportedAudio(file)) {
      errors.push(`${file.name}：不是支持的音频格式`);
      continue;
    }
    if (file.size > MAX_AUDIO_SIZE) {
      errors.push(`${file.name}：文件超过 100MB`);
      continue;
    }
    const createdAt = Date.now();
    const id = `upload:${category}:${crypto.randomUUID?.() || `${createdAt}-${Math.random().toString(36).slice(2)}`}`;
    await putStoredTrack({
      id,
      category,
      name: file.name.replace(/\.[^.]+$/, ''),
      mimeType: file.type || 'audio/mpeg',
      size: file.size,
      blob: file,
      createdAt
    });
  }
  await refreshAudioLibrary();
  notifyLibraryChange();
  return errors;
}

/** Electron 中弹出系统文件选择器，并把音频复制到应用本地目录。 */
export async function importLocalAudioTracks(category: AudioCategory): Promise<string[]> {
  if (!window.electronAPI?.importAudioFiles) return [];
  const result = await window.electronAPI.importAudioFiles(category);
  if (!result.canceled) {
    await refreshAudioLibrary();
    notifyLibraryChange();
  }
  return result.files;
}

/** 拖拽添加音频；Electron 保存到应用目录，浏览器环境保存到 IndexedDB。 */
export async function importDroppedAudioTracks(category: AudioCategory, files: File[]): Promise<string[]> {
  if (window.electronAPI) {
    const paths = files.map(file => window.electronAPI!.getPathForFile(file)).filter(Boolean);
    const imported = await window.electronAPI.importAudioPaths(category, paths);
    await refreshAudioLibrary();
    notifyLibraryChange();
    return imported;
  }
  const errors = await uploadAudioTracks(category, files);
  if (errors.length) throw new Error(errors.join('；'));
  return files.map(file => file.name);
}

export async function exportAudioPack(): Promise<{ canceled: boolean; filePath: string; count?: number }> {
  if (!window.electronAPI?.exportAudioPack) throw new Error('当前环境不支持分享音频包');
  const plainConfigs = JSON.parse(JSON.stringify(audioLibraryState.configs)) as Record<AudioCategory, AudioCategoryConfig>;
  return window.electronAPI.exportAudioPack({
    configs: plainConfigs,
    masterVolume: audioLibraryState.masterVolume,
    volumeNormalization: audioLibraryState.volumeNormalization
  });
}

export async function importAudioPack(filePath?: string): Promise<{ canceled: boolean; count: number }> {
  if (!window.electronAPI?.importAudioPack) throw new Error('当前环境不支持导入音频包');
  const result = await window.electronAPI.importAudioPack(filePath);
  if (result.canceled) return result;
  if (result.settings) {
    for (const category of Object.keys(defaultConfigs) as AudioCategory[]) {
      Object.assign(audioLibraryState.configs[category], result.settings.configs[category]);
    }
    saveConfigs();
    setAudioMasterVolume(result.settings.masterVolume);
    setAudioVolumeNormalization(result.settings.volumeNormalization);
  }
  await refreshAudioLibrary();
  notifyLibraryChange();
  return result;
}

export async function deleteAudioTrack(id: string): Promise<void> {
  const track = audioLibraryState.tracks.find(item => item.id === id);
  if (!track || track.builtin) return;
  if (id.startsWith('local:') && window.electronAPI?.deleteAudioFile) {
    await window.electronAPI.deleteAudioFile(id);
  } else {
    await removeStoredTrack(id);
  }
  const config = audioLibraryState.configs[track.category];
  config.disabledTrackIds = config.disabledTrackIds.filter(trackId => trackId !== id);
  if (config.selectedTrackId === id) {
    config.selectedTrackId = `builtin:${track.category}`;
  }
  saveConfigs([track.category]);
  await refreshAudioLibrary();
  notifyLibraryChange();
}

window.addEventListener('storage', event => {
  if (event.key === MASTER_VOLUME_KEY) {
    const volume = Number(event.newValue);
    audioLibraryState.masterVolume = Number.isFinite(volume) ? Math.min(100, Math.max(0, Math.round(volume))) : 70;
    window.dispatchEvent(new CustomEvent('dycast-audio-volume-change', { detail: audioLibraryState.masterVolume / 100 }));
    return;
  }
  if (event.key === NORMALIZATION_KEY) {
    audioLibraryState.volumeNormalization = event.newValue !== 'false';
    return;
  }
  if (event.key !== SETTINGS_KEY) return;
  Object.assign(audioLibraryState.configs, loadConfigs());
});
