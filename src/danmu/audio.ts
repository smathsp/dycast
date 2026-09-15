/**
 * 三类场景音频播放器。
 * 播放列表和模式来自本机音频库，调用接口保持与原组件兼容。
 */

import {
  audioLibraryReady,
  audioLibraryState,
  getCategoryTracks,
  type AudioCategory,
  type AudioTrack
} from './audioLibrary';

interface CategoryPlayer {
  audio: HTMLAudioElement | null;
  disconnectAudio: (() => void) | null;
  detachAudioEvents: (() => void) | null;
  stopTimer: number | null;
  nextTimer: number | null;
  startTimer: number | null;
  token: number;
  listCursor: number;
  lastRandomId: string;
}

const players: Record<AudioCategory, CategoryPlayer> = {
  charging: { audio: null, disconnectAudio: null, detachAudioEvents: null, stopTimer: null, nextTimer: null, startTimer: null, token: 0, listCursor: 0, lastRandomId: '' },
  lottery: { audio: null, disconnectAudio: null, detachAudioEvents: null, stopTimer: null, nextTimer: null, startTimer: null, token: 0, listCursor: 0, lastRandomId: '' },
  winner: { audio: null, disconnectAudio: null, detachAudioEvents: null, stopTimer: null, nextTimer: null, startTimer: null, token: 0, listCursor: 0, lastRandomId: '' }
};

const NORMALIZATION_CACHE_KEY = 'dycast_audio_normalization_cache_v1';
const normalizationPromises = new Map<string, Promise<number>>();
const normalizationAbortControllers = new Set<AbortController>();
const managedAudioDisconnectors = new Set<() => void>();
const FAILED_TRACK_RETRY_DELAY = 150;
const AUDIO_START_TIMEOUT = 12_000;
const NORMALIZATION_TIMEOUT = 15_000;
// 音量归一化需要把压缩音频完整解码成 PCM。只分析常规歌曲大小与时长，
// 超出上限的自定义音频仍可原样播放，但不再为了分析额外占用大量内存。
const MAX_NORMALIZATION_BYTES = 16 * 1024 * 1024;
const MAX_NORMALIZATION_DURATION_SECONDS = 8 * 60;
const AUDIO_CONTEXT_IDLE_DELAY = 30_000;
let audioContext: AudioContext | null = null;
let activeAudioGraphs = 0;
let audioContextIdleTimer: number | null = null;

interface CachedNormalization {
  signature: string;
  gain: number;
}

interface BalancedAudio {
  audio: HTMLAudioElement;
  disconnect: () => void;
}

interface ManagedBalancedAudio extends BalancedAudio {
  isActive: () => boolean;
}

class AudioNormalizationLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AudioNormalizationLimitError';
  }
}

function getAbortReason(signal: AbortSignal): unknown {
  return signal.reason || new DOMException('响度分析已取消', 'AbortError');
}

function inspectKnownAudioDuration(audio: HTMLAudioElement): number | null {
  const duration = Number(audio.duration);
  if (duration === Infinity) {
    throw new AudioNormalizationLimitError('无法分析没有固定时长的音频');
  }
  if (audio.readyState < 1 || !Number.isFinite(duration)) return null;
  if (duration > MAX_NORMALIZATION_DURATION_SECONDS) {
    throw new AudioNormalizationLimitError(`音频时长超过 ${MAX_NORMALIZATION_DURATION_SECONDS / 60} 分钟`);
  }
  return Math.max(0, duration);
}

function waitForAudioMetadata(audio: HTMLAudioElement, signal: AbortSignal): Promise<number> {
  const knownDuration = inspectKnownAudioDuration(audio);
  if (knownDuration !== null) return Promise.resolve(knownDuration);

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      audio.removeEventListener('loadedmetadata', handleMetadata);
      audio.removeEventListener('durationchange', handleMetadata);
      audio.removeEventListener('error', handleError);
      signal.removeEventListener('abort', handleAbort);
    };
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const handleMetadata = () => {
      try {
        const duration = inspectKnownAudioDuration(audio);
        if (duration !== null) settle(() => resolve(duration));
      } catch (error) {
        settle(() => reject(error));
      }
    };
    const handleError = () => settle(() => reject(audio.error || new Error('无法读取音频时长')));
    const handleAbort = () => settle(() => reject(getAbortReason(signal)));

    audio.addEventListener('loadedmetadata', handleMetadata);
    audio.addEventListener('durationchange', handleMetadata);
    audio.addEventListener('error', handleError);
    signal.addEventListener('abort', handleAbort, { once: true });
    if (signal.aborted) handleAbort();
  });
}

async function cancelResponseBody(response: Response, reason: unknown): Promise<void> {
  try {
    await response.body?.cancel(reason);
  } catch {
    // 取消只负责尽快释放网络/Blob 流；流已经关闭或锁定时无需再次报错。
  }
}

async function readNormalizationBody(response: Response, signal: AbortSignal): Promise<ArrayBuffer> {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength && /^\d+$/.test(declaredLength.trim())) {
    const declaredBytes = Number(declaredLength);
    if (Number.isSafeInteger(declaredBytes) && declaredBytes > MAX_NORMALIZATION_BYTES) {
      const error = new AudioNormalizationLimitError('音频文件过大，已跳过响度分析');
      await cancelResponseBody(response, error);
      throw error;
    }
  }

  if (!response.body) throw new Error('音频响应没有可读取的数据');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let finished = false;
  let readerCancelled = false;
  const cancelReader = async (reason: unknown) => {
    if (readerCancelled || finished) return;
    readerCancelled = true;
    try { await reader.cancel(reason); } catch {}
  };
  const handleAbort = () => { void cancelReader(getAbortReason(signal)); };
  signal.addEventListener('abort', handleAbort, { once: true });

  try {
    while (true) {
      if (signal.aborted) throw getAbortReason(signal);
      const { done, value } = await reader.read();
      if (signal.aborted) throw getAbortReason(signal);
      if (done) {
        finished = true;
        break;
      }
      if (!value?.byteLength) continue;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_NORMALIZATION_BYTES) {
        const error = new AudioNormalizationLimitError('音频实际数据过大，已跳过响度分析');
        await cancelReader(error);
        throw error;
      }
      // 流读取器可能复用底层缓冲区，保留独立副本后再读取下一块。
      chunks.push(value.slice());
    }
  } finally {
    signal.removeEventListener('abort', handleAbort);
    if (!finished) await cancelReader(getAbortReason(signal));
    try { reader.releaseLock(); } catch {}
  }

  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged.buffer;
}

function getAudioContext(): AudioContext | null {
  if (audioContext?.state === 'closed') audioContext = null;
  if (audioContextIdleTimer !== null) {
    window.clearTimeout(audioContextIdleTimer);
    audioContextIdleTimer = null;
  }
  if (audioContext) return audioContext;
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  try {
    audioContext = new AudioContextClass();
  } catch (error) {
    console.warn('[audio] 无法初始化音频增强，使用原始音量:', error);
    audioContext = null;
  }
  return audioContext;
}

function scheduleAudioContextSuspend(): void {
  if (activeAudioGraphs > 0 || !audioContext || audioContext.state === 'closed' || audioContextIdleTimer !== null) return;
  const context = audioContext;
  audioContextIdleTimer = window.setTimeout(() => {
    audioContextIdleTimer = null;
    if (activeAudioGraphs > 0 || audioContext !== context || context.state !== 'running') return;
    try {
      void context.suspend().catch(error => console.warn('[audio] 暂停空闲音频引擎失败:', error));
    } catch (error) {
      console.warn('[audio] 暂停空闲音频引擎失败:', error);
    }
  }, AUDIO_CONTEXT_IDLE_DELAY);
}

function releaseMediaElement(audio: HTMLAudioElement): void {
  try { audio.pause(); } catch {}
  // `blob:` 地址由 audioLibrary 统一持有和撤销；这里只解除媒体元素的引用，
  // 避免连续切歌时旧元素继续占用解码器和对象 URL 数据。
  try { audio.removeAttribute('src'); } catch {}
  try { audio.load(); } catch {}
}

function createAudioElement(track: AudioTrack): {
  audio: HTMLAudioElement;
  disconnectVolume: () => void;
} {
  const audio = new Audio(track.url);
  audio.preload = 'auto';
  audio.volume = audioLibraryState.masterVolume / 100;
  const handleVolumeChange = (event: Event) => {
    const volume = Number((event as CustomEvent<number>).detail);
    if (Number.isFinite(volume)) audio.volume = Math.min(1, Math.max(0, volume));
  };
  window.addEventListener('dycast-audio-volume-change', handleVolumeChange);
  let connected = true;
  return {
    audio,
    disconnectVolume: () => {
      if (!connected) return;
      connected = false;
      window.removeEventListener('dycast-audio-volume-change', handleVolumeChange);
    }
  };
}

function manageBalancedAudio(
  audio: HTMLAudioElement,
  disconnectResources: () => void
): ManagedBalancedAudio {
  let active = true;
  let disconnect: () => void;
  const disconnectOnFinish = () => disconnect();
  disconnect = () => {
    if (!active) return;
    active = false;
    managedAudioDisconnectors.delete(disconnect);
    audio.removeEventListener('ended', disconnectOnFinish);
    audio.removeEventListener('error', disconnectOnFinish);
    disconnectResources();
  };
  // Direct callers (for example settings preview) also get deterministic cleanup
  // if they forget to disconnect after a natural end or media error.
  audio.addEventListener('ended', disconnectOnFinish, { once: true });
  audio.addEventListener('error', disconnectOnFinish, { once: true });
  managedAudioDisconnectors.add(disconnect);
  return { audio, disconnect, isActive: () => active };
}

function readNormalizationCache(): Record<string, CachedNormalization> {
  try {
    return JSON.parse(localStorage.getItem(NORMALIZATION_CACHE_KEY) || '{}');
  } catch {
    return {};
  }
}

function trackSignature(track: AudioTrack): string {
  // Blob URLs are recreated after every launch, so only use stable metadata.
  return `${track.id}|${track.size}|${track.createdAt}`;
}

async function analyzeTrackGain(track: AudioTrack, mediaElement: HTMLAudioElement): Promise<number> {
  const cache = readNormalizationCache();
  const signature = trackSignature(track);
  const cached = cache[track.id];
  if (cached?.signature === signature && Number.isFinite(cached.gain)) return cached.gain;

  if (Number.isFinite(track.size) && track.size > MAX_NORMALIZATION_BYTES) {
    throw new AudioNormalizationLimitError('音频文件过大，已跳过响度分析');
  }

  const context = getAudioContext();
  if (!context) return 1;
  const abortController = new AbortController();
  normalizationAbortControllers.add(abortController);
  let timeoutId: number | null = null;
  let rejectOnAbort: ((reason?: unknown) => void) | null = null;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectOnAbort = reject;
  });
  const handleAbort = () => rejectOnAbort?.(abortController.signal.reason || new DOMException('响度分析已取消', 'AbortError'));
  abortController.signal.addEventListener('abort', handleAbort, { once: true });
  timeoutId = window.setTimeout(() => {
    abortController.abort(new DOMException('响度分析超时', 'TimeoutError'));
  }, NORMALIZATION_TIMEOUT);
  let buffer: AudioBuffer;
  try {
    const knownDuration = inspectKnownAudioDuration(mediaElement);
    if (knownDuration === null) {
      await Promise.race([waitForAudioMetadata(mediaElement, abortController.signal), aborted]);
    }
    const response = await Promise.race([fetch(track.url, { signal: abortController.signal }), aborted]);
    if (!response.ok) throw new Error(`音频读取失败：${response.status}`);
    const rawAudio = await Promise.race([readNormalizationBody(response, abortController.signal), aborted]);
    buffer = await Promise.race([context.decodeAudioData(rawAudio), aborted]);
    const decodedDuration = buffer.length / Math.max(1, buffer.sampleRate);
    if (!Number.isFinite(decodedDuration) || decodedDuration > MAX_NORMALIZATION_DURATION_SECONDS) {
      throw new AudioNormalizationLimitError('解码后的音频时长超过分析上限');
    }
  } finally {
    if (timeoutId !== null) window.clearTimeout(timeoutId);
    abortController.signal.removeEventListener('abort', handleAbort);
    normalizationAbortControllers.delete(abortController);
    rejectOnAbort = null;
  }
  const blockSize = Math.max(1024, Math.round(buffer.sampleRate * 0.1));
  const sampleStep = Math.max(1, Math.floor(buffer.length / 250_000));
  let gatedSquareSum = 0;
  let gatedSampleCount = 0;
  let peak = 0;

  for (let blockStart = 0; blockStart < buffer.length; blockStart += blockSize) {
    const blockEnd = Math.min(blockStart + blockSize, buffer.length);
    let blockSquareSum = 0;
    let blockSampleCount = 0;
    for (let channelIndex = 0; channelIndex < buffer.numberOfChannels; channelIndex++) {
      const samples = buffer.getChannelData(channelIndex);
      for (let index = blockStart; index < blockEnd; index += sampleStep) {
        const value = samples[index];
        const absolute = Math.abs(value);
        if (absolute > peak) peak = absolute;
        blockSquareSum += value * value;
        blockSampleCount++;
      }
    }
    if (!blockSampleCount) continue;
    const blockRms = Math.sqrt(blockSquareSum / blockSampleCount);
    // 忽略长静音，避免前后留白把音乐误判为过小。
    if (blockRms >= 0.008) {
      gatedSquareSum += blockSquareSum;
      gatedSampleCount += blockSampleCount;
    }
  }

  if (!gatedSampleCount) return 1;
  const rms = Math.sqrt(gatedSquareSum / gatedSampleCount);
  const targetRms = 0.1;
  let gain = Math.min(2.2, Math.max(0.55, targetRms / Math.max(rms, 0.0001)));
  if (peak > 0) gain = Math.min(gain, Math.max(0.55, 1.2 / peak));
  gain = Number(gain.toFixed(3));

  cache[track.id] = { signature, gain };
  try { localStorage.setItem(NORMALIZATION_CACHE_KEY, JSON.stringify(cache)); } catch {}
  return gain;
}

function getTrackNormalizationGain(track: AudioTrack, mediaElement: HTMLAudioElement): Promise<number> {
  const promiseKey = trackSignature(track);
  const existing = normalizationPromises.get(promiseKey);
  if (existing) return existing;
  const promise = analyzeTrackGain(track, mediaElement)
    .catch(error => {
      if ((error as Error)?.name !== 'AbortError') {
        console.warn('[audio] 响度分析失败，使用原始音量:', track.name, error);
      }
      return 1;
    })
    .finally(() => {
      if (normalizationPromises.get(promiseKey) === promise) {
        normalizationPromises.delete(promiseKey);
      }
    });
  normalizationPromises.set(promiseKey, promise);
  return promise;
}

/** 创建带响度分析和峰值压缩的音频，供正式播放与设置页试听共用。 */
export function createBalancedAudio(track: AudioTrack): BalancedAudio {
  let element = createAudioElement(track);
  if (!audioLibraryState.volumeNormalization) {
    return manageBalancedAudio(element.audio, element.disconnectVolume);
  }

  const context = getAudioContext();
  if (!context) {
    return manageBalancedAudio(element.audio, element.disconnectVolume);
  }
  let source: MediaElementAudioSourceNode | null = null;
  let gainNode: GainNode | null = null;
  let compressor: DynamicsCompressorNode | null = null;
  try {
    source = context.createMediaElementSource(element.audio);
    gainNode = context.createGain();
    compressor = context.createDynamicsCompressor();
    gainNode.gain.value = 0.78;
    compressor.threshold.value = -20;
    compressor.knee.value = 24;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.28;
    source.connect(gainNode).connect(compressor).connect(context.destination);
  } catch (error) {
    try { source?.disconnect(); } catch {}
    try { gainNode?.disconnect(); } catch {}
    try { compressor?.disconnect(); } catch {}
    element.disconnectVolume();
    releaseMediaElement(element.audio);
    console.warn('[audio] 音频增强节点初始化失败，使用原始音量:', error);
    // A media element already associated with createMediaElementSource cannot be
    // routed back to the speakers reliably, so use a fresh direct-play element.
    element = createAudioElement(track);
    return manageBalancedAudio(element.audio, element.disconnectVolume);
  }

  activeAudioGraphs++;
  const connectedSource = source;
  const connectedGain = gainNode;
  const connectedCompressor = compressor;
  const balancedAudio = manageBalancedAudio(element.audio, () => {
    element.disconnectVolume();
    try { connectedSource.disconnect(); } catch {}
    try { connectedGain.disconnect(); } catch {}
    try { connectedCompressor.disconnect(); } catch {}
    activeAudioGraphs = Math.max(0, activeAudioGraphs - 1);
    scheduleAudioContextSuspend();
  });

  try {
    void context.resume().catch(error => console.warn('[audio] 恢复音频引擎失败:', error));
  } catch (error) {
    console.warn('[audio] 恢复音频引擎失败:', error);
  }
  void getTrackNormalizationGain(track, element.audio).then(gain => {
    if (!balancedAudio.isActive() || !audioLibraryState.volumeNormalization || context.state === 'closed') return;
    connectedGain.gain.setTargetAtTime(gain, context.currentTime, 0.22);
  });

  return balancedAudio;
}

function releaseAudio(player: CategoryPlayer): void {
  const audio = player.audio;
  player.audio = null;
  if (player.startTimer !== null) {
    window.clearTimeout(player.startTimer);
    player.startTimer = null;
  }
  player.detachAudioEvents?.();
  player.detachAudioEvents = null;
  try { player.disconnectAudio?.(); } catch {}
  player.disconnectAudio = null;
  if (audio) releaseMediaElement(audio);
}

function stopCategory(category: AudioCategory): void {
  const player = players[category];
  player.token++;
  if (player.stopTimer !== null) {
    window.clearTimeout(player.stopTimer);
    player.stopTimer = null;
  }
  if (player.nextTimer !== null) {
    window.clearTimeout(player.nextTimer);
    player.nextTimer = null;
  }
  releaseAudio(player);
}

function chooseTrack(
  category: AudioCategory,
  tracks: AudioTrack[],
  isNext: boolean,
  failedTrackIds: ReadonlySet<string>
): AudioTrack | null {
  const player = players[category];
  const config = audioLibraryState.configs[category];

  if (config.mode === 'single') {
    const selected = tracks.find(track => track.id === config.selectedTrackId) || tracks[0];
    return selected && !failedTrackIds.has(selected.id) ? selected : null;
  }

  if (config.mode === 'list') {
    let startIndex: number;
    if (!isNext) {
      const selectedIndex = tracks.findIndex(track => track.id === config.selectedTrackId);
      startIndex = selectedIndex >= 0 ? selectedIndex : player.listCursor % tracks.length;
    } else {
      startIndex = (player.listCursor + 1) % tracks.length;
    }
    for (let offset = 0; offset < tracks.length; offset++) {
      const index = (startIndex + offset) % tracks.length;
      const candidate = tracks[index];
      if (failedTrackIds.has(candidate.id)) continue;
      player.listCursor = index;
      return candidate;
    }
    return null;
  }

  const available = tracks.filter(track => !failedTrackIds.has(track.id));
  if (!available.length) return null;
  const candidates = available.length > 1
    ? available.filter(track => track.id !== player.lastRandomId)
    : available;
  const selected = candidates[Math.floor(Math.random() * candidates.length)];
  player.lastRandomId = selected.id;
  return selected;
}

async function playCategory(category: AudioCategory, maxDuration?: number): Promise<void> {
  stopCategory(category);
  const player = players[category];
  const token = player.token;

  try {
    await audioLibraryReady;
    if (token !== player.token) return;
    const tracks = getCategoryTracks(category, true);
    if (!tracks.length) {
      console.info(`[audio] ${category} 没有启用的曲目`);
      return;
    }

    const failedTrackIds = new Set<string>();
    const finishPlayback = () => {
      if (token !== player.token) return;
      player.token++;
      if (player.nextTimer !== null) {
        window.clearTimeout(player.nextTimer);
        player.nextTimer = null;
      }
      if (player.stopTimer !== null) {
        window.clearTimeout(player.stopTimer);
        player.stopTimer = null;
      }
      releaseAudio(player);
    };
    let playTrack: (isNext: boolean) => void;
    const scheduleTrack = (isNext: boolean, delay: number) => {
      if (token !== player.token || player.nextTimer !== null) return;
      player.nextTimer = window.setTimeout(() => {
        player.nextTimer = null;
        playTrack(isNext);
      }, delay);
    };

    playTrack = (isNext: boolean) => {
      if (token !== player.token) return;
      releaseAudio(player);
      const track = chooseTrack(category, tracks, isNext, failedTrackIds);
      if (!track) {
        console.warn(`[audio] ${category} 可用曲目均播放失败，本轮已停止`);
        finishPlayback();
        return;
      }
      let balancedAudio: BalancedAudio;
      try {
        balancedAudio = createBalancedAudio(track);
      } catch (error) {
        console.warn(`[audio] ${category} 无法创建曲目:`, track.name, error);
        failedTrackIds.add(track.id);
        scheduleTrack(true, FAILED_TRACK_RETRY_DELAY);
        return;
      }
      const audio = balancedAudio.audio;
      player.audio = audio;
      player.disconnectAudio = balancedAudio.disconnect;

      let settled = false;
      const detachEvents = () => {
        audio.removeEventListener('playing', handlePlaying);
        audio.removeEventListener('ended', handleEnded);
        audio.removeEventListener('error', handleError);
        if (player.detachAudioEvents === detachEvents) player.detachAudioEvents = null;
      };
      const markStarted = () => {
        if (settled || token !== player.token || player.audio !== audio) return;
        if (player.startTimer !== null) {
          window.clearTimeout(player.startTimer);
          player.startTimer = null;
        }
      };
      const settle = (failed: boolean, error?: unknown) => {
        if (settled) return;
        settled = true;
        detachEvents();
        if (token !== player.token || player.audio !== audio) return;
        if (failed) {
          failedTrackIds.add(track.id);
          console.warn(`[audio] ${category} 播放失败:`, track.name, error || audio.error);
        }
        releaseAudio(player);
        scheduleTrack(true, failed ? FAILED_TRACK_RETRY_DELAY : 0);
      };
      const handlePlaying = () => markStarted();
      const handleEnded = () => settle(false);
      const handleError = () => settle(true, audio.error);
      player.detachAudioEvents = detachEvents;
      audio.addEventListener('playing', handlePlaying, { once: true });
      audio.addEventListener('ended', handleEnded, { once: true });
      audio.addEventListener('error', handleError, { once: true });
      player.startTimer = window.setTimeout(() => {
        settle(true, new Error('音频加载超时'));
      }, AUDIO_START_TIMEOUT);

      try {
        const promise = audio.play();
        if (promise) void promise.then(markStarted, error => settle(true, error));
      } catch (error) {
        settle(true, error);
      }
    };

    if (maxDuration && maxDuration > 0) {
      player.stopTimer = window.setTimeout(() => stopCategory(category), maxDuration);
    }
    playTrack(false);
  } catch (error) {
    console.warn(`[audio] ${category} 初始化失败:`, error);
    if (token === player.token) stopCategory(category);
  }
}

/** 充能播放，直到调用 stopCharging。 */
export function playCharging(): void {
  void playCategory('charging');
}

export function stopCharging(): void {
  stopCategory('charging');
}

/** 抽奖播放，最多 5 秒。 */
export function playLottery(): void {
  void playCategory('lottery', 5000);
}

export function stopLottery(): void {
  stopCategory('lottery');
}

/** 中奖播放，直到关闭中奖界面。 */
export function playWinner(): void {
  void playCategory('winner');
}

export function stopWinner(): void {
  stopCategory('winner');
}

export function stopAll(): void {
  stopCharging();
  stopLottery();
  stopWinner();
}

/** 完整释放当前渲染进程的音频引擎，供窗口销毁或测试环境清理使用。 */
export function disposeAudio(): void {
  stopAll();
  for (const disconnect of [...managedAudioDisconnectors]) disconnect();
  managedAudioDisconnectors.clear();
  if (audioContextIdleTimer !== null) {
    window.clearTimeout(audioContextIdleTimer);
    audioContextIdleTimer = null;
  }
  for (const controller of normalizationAbortControllers) {
    controller.abort(new DOMException('音频引擎已释放', 'AbortError'));
  }
  normalizationAbortControllers.clear();
  normalizationPromises.clear();
  activeAudioGraphs = 0;
  const context = audioContext;
  audioContext = null;
  if (!context || context.state === 'closed') return;
  try {
    void context.close().catch(error => console.warn('[audio] 关闭音频引擎失败:', error));
  } catch (error) {
    console.warn('[audio] 关闭音频引擎失败:', error);
  }
}
