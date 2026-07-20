/**
 * 音频管理器
 *  - 充能循环 / 抽奖音效 / 中奖循环
 *  - 所有方法需在用户交互（click）后调用以符合浏览器自动播放策略
 */

import chargingSrc from '@/audio/充能-难得真兄弟.mp3';
import lotterySrc from '@/audio/抽奖.mp3';
import winnerSrc from '@/audio/中奖-得吃小曲.mp3';

let chargingAudio: HTMLAudioElement | null = null;
let lotteryAudio: HTMLAudioElement | null = null;
let winnerAudio: HTMLAudioElement | null = null;

function createAudio(src: string, loop: boolean): HTMLAudioElement {
  const audio = new Audio(src);
  audio.loop = loop;
  audio.preload = 'auto';
  audio.addEventListener('error', (e) => {
    console.warn('[audio] 加载失败:', src, (e.target as HTMLAudioElement)?.error);
  });
  return audio;
}

/** 充能循环播放 */
export function playCharging() {
  try {
    stopCharging();
    chargingAudio = createAudio(chargingSrc, true);
    chargingAudio.volume = 0.6;
    const p = chargingAudio.play();
    if (p) p.catch(e => console.warn('[audio] 充能播放失败:', e));
  } catch (e) {
    console.warn('[audio] 充能初始化失败:', e);
  }
}

/** 停止充能 */
export function stopCharging() {
  if (chargingAudio) {
    chargingAudio.pause();
    chargingAudio.currentTime = 0;
    chargingAudio.removeAttribute('src');
    chargingAudio.load();
    chargingAudio = null;
  }
}

/** 抽奖音效（播放一次） */
export function playLottery() {
  try {
    stopLottery();
    lotteryAudio = createAudio(lotterySrc, false);
    lotteryAudio.volume = 0.8;
    const p = lotteryAudio.play();
    if (p) p.catch(e => console.warn('[audio] 抽奖播放失败:', e));
  } catch (e) {
    console.warn('[audio] 抽奖初始化失败:', e);
  }
}

/** 停止抽奖音效 */
export function stopLottery() {
  if (lotteryAudio) {
    lotteryAudio.pause();
    lotteryAudio.currentTime = 0;
    lotteryAudio.removeAttribute('src');
    lotteryAudio.load();
    lotteryAudio = null;
  }
}

/** 中奖循环播放 */
export function playWinner() {
  try {
    stopWinner();
    winnerAudio = createAudio(winnerSrc, true);
    winnerAudio.volume = 0.7;
    const p = winnerAudio.play();
    if (p) p.catch(e => console.warn('[audio] 中奖播放失败:', e));
  } catch (e) {
    console.warn('[audio] 中奖初始化失败:', e);
  }
}

/** 停止中奖 */
export function stopWinner() {
  if (winnerAudio) {
    winnerAudio.pause();
    winnerAudio.currentTime = 0;
    winnerAudio.removeAttribute('src');
    winnerAudio.load();
    winnerAudio = null;
  }
}

/** 停止全部音频 */
export function stopAll() {
  stopCharging();
  stopLottery();
  stopWinner();
}
