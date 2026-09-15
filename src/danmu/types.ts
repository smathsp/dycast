/** 单条弹幕 */
export interface Danmu {
  id: string;
  /** 用户资料页公开、可搜索的纯数字抖音号（display_id） */
  userId?: string;
  /** 标记 userId 已从协议 display_id 读取，旧版错误字段不展示 */
  userIdVerified?: boolean;
  /** ID 的协议字段来源，用于排除旧版本误存的 user.id、short_id 或 secUid */
  userIdSource?: 'displayId';
  /** 内部去重使用的 secUid，不用于名单展示 */
  secUid?: string;
  avatar: string;
  nickname: string;
  content: string;
  /** 会员表情的原始图片地址 */
  emojiUrl?: string;
  timestamp: number;
  /** 中奖记录的唯一标识（普通弹幕没有） */
  winRecordId?: string;
  /** 中奖时对应的抽奖轮次 */
  drawNo?: number;
  /** 实际开奖时间 */
  wonAt?: number;
  /** 当前直播连接的会话标识，仅用于同步本场弹幕计数 */
  liveSessionId?: string;
  /** 这条弹幕在本场直播中的累计序号，不参与奖池或充能判断 */
  liveSessionCount?: number;
  /** 一次多抽中的第几位中奖者 */
  batchPosition?: number;
  /** 本轮实际中奖人数 */
  batchSize?: number;
  /** 同一批次中奖者的稳定标识 */
  batchId?: string;
  /** 1 表示该批次由主进程幂等预留账本管理。 */
  lotteryReservationVersion?: 1;
  /** 粉丝团/灯牌信息（可能多个） */
  fansClub?: {
    /** 灯牌所属主播 UID */
    anchorId?: string;
    clubName?: string;
    level?: number;
    badgeIcon?: string;
  }[];
  /** 当前直播间主播 ID。 */
  targetAnchorId?: string;
}

/** 弹幕全局状态 */
export interface DanmuState {
  /** WS 连接状态 */
  connected: boolean;
  /** 当前 WS 地址 */
  wsUrl: string;
  /** 是否正在攒能量（手动控制） */
  isCollecting: boolean;
  /** 是否将直播弹幕显示在充能大屏；可独立于抽奖开启。 */
  isDisplaying: boolean;
  /** 累计弹幕数量（当前轮） */
  totalDanmuCount: number;
  /** 本场直播收到的弹幕总数（独立展示，不参与奖池） */
  totalPoolCount: number;
  /** 当前能量（0 到本轮抽奖阈值） */
  energy: number;
  /** 本轮抽奖池（仅在开始攒能量后收集） */
  lotteryPool: Danmu[];
  /** 当前屏幕显示的弹幕 */
  activeDanmu: Danmu[];
  /** 直播间观众展示页使用的最近弹幕；不受充能开关影响 */
  displayDanmu: Danmu[];
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
  /** 抽奖阈值（每 N 条弹幕抽一次，最小 10） */
  lotteryThreshold: number;
  /** 每轮抽取人数 */
  lotteryWinnerCount: number;
  /** 中奖资格关键词；留空表示不限。 */
  lotteryKeyword: string;
  /** 是否将同一用户 20 秒内的多条弹幕合并为一张票。 */
  lotteryUserCooldownEnabled: boolean;
  /** 昵称包含任一关键词时，使用红色弹幕视觉；多个关键词用逗号或换行分隔。 */
  redDanmuNicknameKeywords: string;
  /** 0–4 级弹幕的字号基数 (px)，更高灯牌阶段会按比例放大。 */
  fontSize: number;
  /** 弹幕速度基数 (秒) */
  speedBase: number;
  /** 弹幕速度浮动范围 (秒) */
  speedRange: number;
}
