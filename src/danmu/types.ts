/** 单条弹幕 */
export interface Danmu {
  id: string;
  avatar: string;
  nickname: string;
  content: string;
  timestamp: number;
}

/** 弹幕全局状态 */
export interface DanmuState {
  /** WS 连接状态 */
  connected: boolean;
  /** 当前 WS 地址 */
  wsUrl: string;
  /** 累计弹幕数量 */
  totalDanmuCount: number;
  /** 当前能量 (0-9999) */
  energy: number;
  /** 抽奖池（全部历史弹幕） */
  lotteryPool: Danmu[];
  /** 当前屏幕显示的弹幕 */
  activeDanmu: Danmu[];
  /** 是否正在抽奖 */
  isLotteryActive: boolean;
  /** 中奖弹幕 */
  lotteryResult: Danmu | null;
  /** 历史抽奖记录 */
  lotteryHistory: Danmu[];
  /** 抽奖次数 */
  lotteryCount: number;
}

/** 弹幕飘屏轨道信息 */
export interface DanmuTrack {
  id: number;
  y: number;       // 轨道 Y 位置 (%)
  speed: number;   // 飘动速度 (秒)
  danmuId: string; // 当前轨道上的弹幕 ID
}

/** WS 消息格式（兼容 dycast 转发） */
export interface WsDanmuMessage {
  type: 'danmu';
  id?: string;
  avatar?: string;
  nickname?: string;
  content?: string;
  timestamp?: number;
}

/** 弹幕显示设置 */
export interface DanmuSettings {
  /** 抽奖阈值（每 N 条弹幕抽一次） */
  lotteryThreshold: number;
  /** 弹幕字号 (px) */
  fontSize: number;
  /** 弹幕速度基数 (秒) */
  speedBase: number;
  /** 弹幕速度浮动范围 (秒) */
  speedRange: number;
}
