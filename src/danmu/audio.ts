/**
 * 音频管理器
 *  - 充能循环 / 抽奖音效 / 中奖循环
 *  - 所有方法需在用户交互（click）后调用以符合浏览器自动播放策略
 */

import chargingSrc from '@/audio/充能-难得真兄弟.m4s';
import lotterySrc from '@/audio/抽奖.mp3';
import winnerSrc from '@/audio/中奖-得吃小曲.mp3';

let chargingAudio: HTMLAudioElement | null = null;
let lotteryAudio: HTMLAudioElement | null = null;
let winnerAudio: HTMLAudioElement | null = null;

function createAudio(src: string, loop: boolean): HTMLAudioElement {
  const audio = new Audio(src);
  audio.loop = loop;
  audio.preload = 'auto';
  return audio;
}

/** 充能循环播放 */
export function playCharging() {
  stopCharging();
  chargingAudio = createAudio(chargingSrc, true);
  chargingAudio.volume = 0.6;
  chargingAudio.play().catch(() => {});
}

/** 停止充能 */
export function stopCharging() {
  if (chargingAudio) {
    chargingAudio.pause();
    chargingAudio.currentTime = 0;
    chargingAudio = null;
  }
}

/** 抽奖音效（播放一次） */
export function playLottery() {
  stopLottery();
  lotteryAudio = createAudio(lotterySrc, false);
  lotteryAudio.volume = 0.8;
  lotteryAudio.play().catch(() => {});
}

/** 停止抽奖音效 */
export function stopLottery() {
  if (lotteryAudio) {
    lotteryAudio.pause();
    lotteryAudio.currentTime = 0;
    lotteryAudio = null;
  }
}

/** 中奖循环播放 */
export function playWinner() {
  stopWinner();
  winnerAudio = createAudio(winnerSrc, true);
  winnerAudio.volume = 0.7;
  winnerAudio.play().catch(() => {});
}

/** 停止中奖 */
export function stopWinner() {
  if (winnerAudio) {
    winnerAudio.pause();
    winnerAudio.currentTime = 0;
    winnerAudio = null;
  }
}

/** 停止全部音频 */
export function stopAll() {
  stopCharging();
  stopLottery();
  stopWinner();
}
