import { CLog } from '@/utils/logUtil';
import { Emitter, type EventMap } from './emitter';
import {
  decodeChatMessage,
  decodeControlMessage,
  decodeEmojiChatMessage,
  decodeFansclubMessage,
  decodeGiftMessage,
  decodeLikeMessage,
  decodeMemberMessage,
  decodePushFrame,
  decodeResponse,
  decodeRoomRankMessage,
  decodeRoomStatsMessage,
  decodeRoomUserSeqMessage,
  decodeSocialMessage,
  encodePushFrame
} from './model';
import type {
  GiftStruct,
  Message,
  RoomRankMessage_RoomRank,
  RoomUserSeqMessage_Contributor,
  Text,
  User,
  User_FansClub_FansClubData
} from './model';
import { fetchUser, getImInfo, getLiveInfo, HttpRequestError } from './request';
import { getSignature } from './signature';
import { makeUrlParams } from './util';
import {
  MAX_DECODED_PAYLOAD_BYTES,
  MAX_WEBSOCKET_FRAME_BYTES,
  assertFramePayloadSize,
  inflateGzipBounded,
  isFramePayloadLimitError
} from './framePayloadLimit';
import { DYCAST_WS_HOST_PARAM, getDouyinPushServerHost } from './wsEndpoint';
// import { logUserCast } from '@/utils/debugUtil';

/**
 * 连接状态
 *  - 0 - 未连接
 *  - 1 - 已连接
 *  - 2 - 连接失败
 *  - 3 - 已断开
 *  - 4 - 连接中
 */
export type ConnectStatus = 0 | 1 | 2 | 3 | 4;

/** 直播间信息 */
export interface LiveRoom {
  /**
   * 在线观众数
   */
  audienceCount?: number | string;
  /**
   * 本场点赞数
   */
  likeCount?: number | string;
  /**
   * 主播粉丝数
   */
  followCount?: number | string;
  /**
   * 累计观看人数
   */
  totalUserCount?: number | string;
  /** 房间状态 */
  status?: number;
}

/** 直播间信息-连接信息 */
export interface DyLiveInfo {
  roomNum?: string;
  roomId: string;
  uniqueId: string;
  avatar: string;
  cover: string;
  nickname: string;
  title: string;
  status: number;
  /** 主播 sec_uid */
  anchorId?: string;
}
/** 直播间信息-初次连接信息 */
export interface DyImInfo {
  cursor?: string;
  fetchInterval?: string;
  now?: string;
  internalExt?: string;
  fetchType?: number;
  pushServer?: string;
  liveCursor?: string;
}

/**
 * 送礼点赞榜
 */
export interface LiveRankItem {
  nickname: string;
  avatar: string;
  rank: number | string;
}

/** 粉丝团/灯牌信息 */
export interface CastUserFansClub {
  /** 灯牌所属主播 UID */
  anchorId?: string;
  /** 粉丝团名称 */
  clubName?: string;
  /** 粉丝团等级 1-30 */
  level?: number;
  /** 灯牌图标 URL */
  badgeIcon?: string;
}

export interface CastUser {
  // user.sec_uid | user.id_str
  id?: string;
  // 用户资料页展示、可用于搜索的纯数字抖音号（display_id）
  douyinId?: string;
  // 抖音号的协议字段来源
  douyinIdSource?: 'displayId';
  // user.short_id
  shortId?: string;
  // user.display_id
  displayId?: string;
  // user.nickname
  name?: string;
  // user.avatar_thumb.url_list.0
  avatar?: string;
  // 性别 0 | 1 | 2 => 未知 | 男 | 女
  gender?: number;
  /** 粉丝团/灯牌信息（可能多个） */
  fansClub?: CastUserFansClub[];
  /** 当前直播间主播 ID；用于隔离不同房间的灯牌缓存。 */
  currentTargetAnchorId?: string;
}

export interface CastGift {
  id?: string;
  name?: string;
  // 抖音币 diamond_count
  price?: number;
  type?: number;
  // 描述
  desc?: string;
  // 图片
  icon?: string;
  // 数量 repeat_count | combo_count
  count?: number | string;
  // 礼物消息可能重复发送，0 表示第一次，未重复
  repeatEnd?: number;
}

/**
 * 富文本类型
 *  1 - 普通文本
 *  2 - 合并表情
 */
export enum CastRtfContentType {
  TEXT = 1,
  EMOJI = 2,
  USER = 3
}

// 富文本
export interface CastRtfContent {
  type?: CastRtfContentType;
  text?: string;
  url?: string;
  user?: CastUser;
}

export interface DyMessage {
  id?: string;
  method?: CastMethod;
  user?: CastUser;
  toUser?: CastUser;
  gift?: CastGift;
  content?: string;
  /** 会员表情的可读名称 */
  emojiText?: string;
  rtfContent?: CastRtfContent[];
  room?: LiveRoom;
  rank?: LiveRankItem[];
  /** 消息时间戳 */
  time?: number;
}

export enum CastMethod {
  CHAT = 'WebcastChatMessage',
  GIFT = 'WebcastGiftMessage',
  LIKE = 'WebcastLikeMessage',
  MEMBER = 'WebcastMemberMessage',
  SOCIAL = 'WebcastSocialMessage',
  ROOM_USER_SEQ = 'WebcastRoomUserSeqMessage',
  CONTROL = 'WebcastControlMessage',
  ROOM_RANK = 'WebcastRoomRankMessage',
  ROOM_STATS = 'WebcastRoomStatsMessage',
  EMOJI_CHAT = 'WebcastEmojiChatMessage',
  FANSCLUB = 'WebcastFansclubMessage',
  ROOM_DATA_SYNC = 'WebcastRoomDataSyncMessage',
  /** 自定义消息 */
  CUSTOM = 'CustomMessage'
}

/**
 * 直播间直播状态
 */
export enum RoomStatus {
  PREPARE = 1,
  LIVING = 2,
  PAUSE = 3,
  END = 4
}
/** 客户端状态 */
enum WSRoomStatus {
  /** 未连接 */
  UNCONNECTED = 1,
  /** 正在连接 */
  CONNECTING = 2,
  /** 连接中|已连接 */
  CONNECTED = 3,
  /** 重连中 */
  RECONNECTING = 4,
  /** 已关闭 */
  CLOSED = 5
}

/**
 * DyCast Event
 */
interface DyCastEvent extends EventMap {
  /**
   * 监听ws打开
   * @param ev
   * @returns
   */
  open: (ev?: Event, info?: DyLiveInfo) => void;
  /**
   * 监听关闭
   * @param code
   * @param reason
   * @returns
   */
  close: (code: number, reason: string) => void;
  /**
   * 监听错误
   * @param e
   * @returns
   */
  error: (e: Error) => void;
  /**
   * 监听弹幕
   * @param messages
   * @returns
   */
  message: (messages: DyMessage[]) => void;
  /** 重连中 */
  reconnecting: (count?: number, code?: DyCastCloseCode, reason?: string) => void;
  /** 重连完成 */
  reconnect: (ev?: Event) => void;
}

/**
 * 自定义关闭码
 */
export enum DyCastCloseCode {
  /** 正常关闭 */
  NORMAL = 1000,
  /** 终端离开，可能因为服务端错误，也可能因为浏览器正从打开连接的页面跳转离开 */
  GOING_AWAY = 1001,
  /** 由于协议错误而中断连接 */
  PROTOCOL_ERROR = 1002,
  /** 接收到不允许的数据类型而断开连接 */
  UNSUPPORTED = 1003,
  /** 没有收到预期的状态码 */
  NO_STATUS = 1005,
  /** 没有处理关闭帧 */
  ABNORMAL = 1006,
  /** 应用自定义状态码 */
  /** 主播未开播 */
  LIVE_END = 4001,
  /** 连接过程错误 */
  CONNECTING_ERROR = 4002,
  /** 无法正常接收信息 */
  CANNOT_RECEIVE = 4003,
  /** 因重连关闭 */
  RECONNECTING = 4004
}

// 配置
interface DyCastOptions {
  aid?: string;
  app_name?: string;
  browser_language?: string;
  browser_name?: string;
  browser_online?: boolean;
  browser_platform?: string;
  browser_version?: string;
  compress?: string;
  cookie_enabled?: boolean;
  cursor: string;
  device_platform?: string;
  did_rule?: number;
  endpoint?: string;
  heartbeatDuration?: string;
  host?: string;
  identity?: string;
  im_path?: string;
  insert_task_id?: string;
  internal_ext: string;
  live_id?: number;
  live_reason?: string;
  need_persist_msg_count?: string;
  room_id: string;
  screen_height?: number;
  screen_width?: number;
  signature: string;
  support_wrds?: number;
  tz_name?: string;
  update_version_code?: string;
  user_unique_id: string;
  version_code?: string;
  webcast_sdk_version?: string;
}

interface DyCastCursor {
  cursor?: string;
  firstCursor?: string;
  internalExt?: string;
}

/**
 * dycast 自定义关闭信息
 */
interface DyCastCloseEvent {
  code: number;
  msg: string;
}

// 消息体类型
enum PayloadType {
  Ack = 'ack',
  Close = 'close',
  Hb = 'hb',
  Msg = 'msg'
}

/** API */
// wss://webcast5-ws-web-lf.douyin.com/webcast/im/push/v2/  => version: 1.0.14-beta.0
// wss://webcast100-ws-web-lq.douyin.com/webcast/im/push/v2/  => version: 1.0.15
const BASE_URL = `${location.origin.replace(/^http/, 'ws')}/socket/webcast/im/push/v2/`;

/** SDK 版本 */
export const VERSION = '1.0.15';

/**
 * 默认配置
 */
const defaultOpts: Partial<DyCastOptions> = {
  aid: '6383',
  app_name: 'douyin_web',
  browser_language: 'zh-CN',
  browser_name: 'Mozilla',
  browser_online: true,
  browser_platform: 'Win32',
  browser_version:
    '5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
  compress: 'gzip',
  cookie_enabled: true,
  device_platform: 'web',
  did_rule: 3,
  endpoint: 'live_pc',
  heartbeatDuration: '0',
  host: 'https://live.douyin.com',
  identity: 'audience',
  im_path: '/webcast/im/fetch/',
  insert_task_id: '',
  live_id: 1,
  live_reason: '',
  need_persist_msg_count: '15',
  screen_height: 1080,
  screen_width: 1920,
  support_wrds: 1,
  tz_name: 'Asia/Shanghai',
  update_version_code: VERSION,
  version_code: '180800',
  webcast_sdk_version: VERSION
};

export class DyCast {
  /** 房间号 */
  private roomNum: string;

  /** 房间信息 */
  private info: DyLiveInfo;

  // 初次连接信息
  private imInfo: DyImInfo;

  /** WS客户端 */
  private ws: WebSocket | undefined;

  /** 连接 url */
  private url: string | undefined;

  // 连接状态
  private state: boolean;

  /** 客户端状态 */
  private wsRoomStatus: WSRoomStatus;

  /** 直播间直播状态 */
  private status: RoomStatus;

  /** 连接配置 */
  private options: DyCastOptions | undefined;

  // 心跳
  // 主要用于检查消息接收是否正常
  private heartbeatDuration: number = 10000;
  // 心跳次数
  private pingCount: number = 0;
  // 心跳阈值
  // 如果 heartbeatDuration ms 内心跳次数大于等于该值，证明消息接收出错
  // 即 如果 10000 ms 内都没接收到新消息，证明消息接收出错
  private downgradePingCount: number = 2;

  private pingTimer: number | undefined = void 0;
  private reconnectTimer: number | undefined = void 0;
  /** 用户是否仍希望保持连接。自动重连不能通过关闭码猜测这个意图。 */
  private desiredConnected: boolean = false;
  /** 贯穿“解析房间 → 建立 WS → 重连”的单调代次，用于淘汰所有旧异步回调。 */
  private lifecycleEpoch: number = 0;
  private connectAbortController: AbortController | undefined;
  private connectionGeneration: number = 0;
  /** 首个 WebSocket 打开后，后续打开才应报告为重连。 */
  private hasOpenedSocket: boolean = false;
  private lastConnectInfoRefreshTime: number = 0;

  // 上次接收时间
  private lastReceiveTime: number;

  private cursor: DyCastCursor;

  /**
   * 自定义实现的 错误信息提示
   *  - 由于 dycast 的服务端并不会正确处理关闭帧
   *  - 调用 websocket close 后，关闭监听返回 1006
   */
  private closeEvent: DyCastCloseEvent;

  /** 当前重连次数 */
  private reconnectCount: number;
  /** 最大重连尝试次数 */
  private maxReconnectCount: number;
  // 订阅者
  private emitter: Emitter<DyCastEvent>;

  constructor(roomNum: string) {
    // 初始化
    this.roomNum = roomNum;
    this.state = !1;
    // 10秒心跳
    this.heartbeatDuration = 10000;
    this.pingCount = 0;
    // 打开连接后会立即发送一次心跳，因此 4 次约等于 30 秒无有效帧。
    this.downgradePingCount = 4;
    this.cursor = {
      cursor: '',
      firstCursor: '',
      internalExt: ''
    };
    // 当前重连次数
    this.reconnectCount = 0;
    // 最大重连次数
    this.maxReconnectCount = 3;
    // 上一次接收消息时间
    this.lastReceiveTime = Date.now();
    // 当前客户端状态
    this.wsRoomStatus = WSRoomStatus.UNCONNECTED;
    /**
     * 默认情况
     *  - 即未收到预期的状态码
     */
    this.closeEvent = { code: 1005, msg: 'CLOSE_NO_STATUS' };
    this.info = {
      roomId: '',
      uniqueId: '',
      avatar: '',
      cover: '',
      nickname: '',
      title: '',
      status: 4
    };
    this.imInfo = {};
    this.status = RoomStatus.END;
    this.emitter = new Emitter<DyCastEvent>();
  }

  /**
   * 监听
   * @param event
   * @param listener
   */
  public on<K extends keyof DyCastEvent>(event: K, listener: DyCastEvent[K]) {
    this.emitter.on(event, listener);
  }

  /**
   * 取消监听
   * @param event
   * @param listener
   */
  public off<K extends keyof DyCastEvent>(event: K, listener: DyCastEvent[K]) {
    this.emitter.off(event, listener);
  }

  /**
   * 一次性监听
   *  - 如监听打开关闭
   * @param event
   * @param listener
   */
  public once<K extends keyof DyCastEvent>(event: K, listener: DyCastEvent[K]) {
    this.emitter.once(event, listener);
  }

  /**
   * 连接
   * @returns
   */
  public async connect() {
    if (
      this.desiredConnected ||
      this.wsRoomStatus === WSRoomStatus.CONNECTING ||
      this.wsRoomStatus === WSRoomStatus.CONNECTED ||
      this.wsRoomStatus === WSRoomStatus.RECONNECTING
    ) {
      this.emitter.emit('error', Error('连接正在进行，请勿重复连接'));
      return;
    }

    this.desiredConnected = true;
    const epoch = ++this.lifecycleEpoch;
    this.connectAbortController?.abort();
    const abortController = new AbortController();
    this.connectAbortController = abortController;
    this.wsRoomStatus = WSRoomStatus.CONNECTING;
    this.reconnectCount = 0;
    this.options = void 0;
    this.hasOpenedSocket = false;
    this.cursor = { cursor: '', firstCursor: '', internalExt: '' };
    try {
      await this.fetchConnectInfo(this.roomNum, abortController.signal);
      if (!this.isCurrentLifecycle(epoch)) return;
      const params = this.getWssParam();
      if (this.isLiving()) {
        this._connect(params, epoch);
      } else {
        // 主播未开播
        const liveStatus = this.getLiveStatus();
        this.desiredConnected = false;
        this._afterClose();
        this.emitter.emit('close', DyCastCloseCode.LIVE_END, liveStatus.msg);
      }
    } catch (err) {
      if (!this.isCurrentLifecycle(epoch)) return;
      if (this.isPermanentLookupError(err)) {
        this.stopForPermanentLookupError(err);
        return;
      }
      // 临时查询错误仍保留连接意图，由同一退避队列重试房间信息。
      CLog.error('房间连接前错误 =>', err);
      this.emitter.emit('error', err as Error);
      this.reconnect(DyCastCloseCode.CONNECTING_ERROR, '房间连接前出错');
    } finally {
      if (this.connectAbortController === abortController) {
        this.connectAbortController = void 0;
      }
    }
  }

  private isCurrentLifecycle(epoch: number): boolean {
    return this.desiredConnected && epoch === this.lifecycleEpoch;
  }

  private isPermanentLookupError(error: unknown): error is HttpRequestError {
    return error instanceof HttpRequestError
      && error.status >= 400
      && error.status < 500
      && error.status !== 408
      && error.status !== 429;
  }

  private stopForPermanentLookupError(error: HttpRequestError): void {
    const message = error.status === 404
      ? '直播间不存在或无法访问（HTTP 404），请检查房间号'
      : error.status === 400
        ? '直播间请求无效（HTTP 400），请检查房间号'
        : `直播间连接请求被拒绝（HTTP ${error.status}），请检查房间号或登录状态`;
    this.desiredConnected = false;
    this._afterClose();
    this.emitter.emit('error', new Error(message));
    this.emitter.emit('close', DyCastCloseCode.CONNECTING_ERROR, message);
  }

  /**
   * 获取当前连接状态
   */
  public getRoomStatus() {
    return this.wsRoomStatus;
  }

  /**
   * 实际连接逻辑
   * @param opts
   */
  private _connect(opts: DyCastOptions, epoch: number = this.lifecycleEpoch) {
    if (!this.isCurrentLifecycle(epoch)) return;
    // 连接前的初始化
    this.options = opts;
    this.url = this._getSocketUrl(opts);
    // 同一直播会话的重连必须保留最后 ACK 游标；只有一次全新 connect 才会清空。
    this.cursor.cursor ||= opts.cursor;
    this.cursor.firstCursor ||= opts.cursor;
    this.cursor.internalExt ||= opts.internal_ext;
    this.lastReceiveTime = Date.now();
    this.pingCount = 0;
    const generation = ++this.connectionGeneration;
    try {
      const socket = new WebSocket(this.url);
      this.ws = socket;
      socket.binaryType = 'arraybuffer';
      socket.addEventListener('open', (ev: Event) => {
        if (generation !== this.connectionGeneration || !this.isCurrentLifecycle(epoch)) return;
        // 可能初次打开，也可能是重连打开
        if (this.hasOpenedSocket) {
          // 重连成功
          this.emitter.emit('reconnect', ev);
        } else {
          // 初次连接
          this.hasOpenedSocket = true;
          this.emitter.emit('open', ev, this.info);
        }
        this.ping();
        this._afterOpen();
      });
      socket.addEventListener('close', (ev: CloseEvent) => {
        if (generation !== this.connectionGeneration || !this.isCurrentLifecycle(epoch)) return;
        this.handleClose(ev);
      });
      socket.addEventListener('error', (ev: Event) => {
        if (generation !== this.connectionGeneration || !this.isCurrentLifecycle(epoch)) return;
        this.emitter.emit('error', Error(ev.type || 'Unknown Error'));
      });
      socket.addEventListener('message', (ev: MessageEvent) => {
        if (generation !== this.connectionGeneration || !this.isCurrentLifecycle(epoch)) return;
        void this.handleMessage(ev.data, socket, generation);
      });
    } catch (err) {
      if (!this.isCurrentLifecycle(epoch)) return;
      CLog.error('房间连接过程错误 =>', err);
      this.emitter.emit('error', err as Error);
      this.requestReconnect(DyCastCloseCode.CONNECTING_ERROR, '房间连接过程出错');
    }
  }

  /** 处理关闭 */
  private handleClose(ev: CloseEvent) {
    let { code, reason } = ev;
    let msg: string = reason.toString();
    switch (code) {
      case DyCastCloseCode.NO_STATUS:
      case DyCastCloseCode.ABNORMAL:
        code = this.closeEvent.code || code;
        msg = this.closeEvent.msg || msg || 'closed';
        break;
    }
    // 当前代次收到的远端关闭都按可恢复断线处理；人工停止会先递增 generation，
    // 因而永远不会进入这里。
    const retryRequested = this.desiredConnected && code !== DyCastCloseCode.LIVE_END;
    this.connectionGeneration++;
    this._afterClose();
    if (retryRequested) {
      this.reconnect(code as DyCastCloseCode, msg);
    } else {
      this.emitter.emit('close', code, msg);
    }
  }

  /**
   * 处理消息
   */
  private async handleMessage(data: ArrayBuffer, socket: WebSocket, generation: number) {
    let res;
    try {
      assertFramePayloadSize(data, MAX_WEBSOCKET_FRAME_BYTES, 'websocket-frame');
      res = await this._decodeFrame(new Uint8Array(data));
    } catch (err) {
      if (generation !== this.connectionGeneration) return;
      if (isFramePayloadLimitError(err)) {
        CLog.warn('弹幕数据超过安全上限，正在自动恢复连接 =>', err);
        this.requestReconnect(DyCastCloseCode.RECONNECTING, '弹幕数据异常，正在重新连接');
        return;
      }
      CLog.warn('弹幕帧解析失败，等待健康检查自动恢复 =>', err);
      res = null;
    }
    if (generation !== this.connectionGeneration) return;
    if (!res) return;
    const { response, frame, cursor, needAck, internalExt } = res;
    // 只有成功解码的有效帧才能证明连接健康。Payload close 不清零失败次数，
    // 避免“刚打开就关闭”的连接形成 500ms 快速重试环。
    if (frame?.payloadType !== PayloadType.Close) {
      this.pingCount = 0;
      this.lastReceiveTime = Date.now();
      this.reconnectCount = 0;
    }
    if (needAck) {
      // 发送 ack
      const ack = this._ack(internalExt, frame?.logId);
      this.setCursor(cursor, internalExt);
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(ack);
      } else {
        CLog.error(`ACK发送异常 => 直播间[${this.roomNum}]已关闭`);
        this.requestReconnect(DyCastCloseCode.RECONNECTING, 'ACK 发送失败');
        return;
      }
    }
    // 处理消息体
    if (frame) {
      // 判断消息体类型
      if (frame.payloadType === PayloadType.Msg) {
        this._dealMessages(response.messages);
      }
      if (frame.payloadType === PayloadType.Close) {
        // 服务端 close payload 通常用于连接轮换，不代表用户停止或主播下播。
        this.requestReconnect(DyCastCloseCode.RECONNECTING, '服务端要求更新弹幕连接');
      }
    }
  }

  /**
   * 重连
   */
  private requestReconnect(code: DyCastCloseCode, reason: string) {
    if (!this.desiredConnected) return;
    if (this.wsRoomStatus === WSRoomStatus.RECONNECTING && this.reconnectTimer) return;

    const socket = this.ws;
    // 先淘汰当前 socket 的所有迟到回调，再做本地清理和单一重连调度。
    this.connectionGeneration++;
    this._afterClose();
    if (socket && socket.readyState !== WebSocket.CLOSED) {
      try {
        socket.close();
      } catch {}
    }
    this.reconnect(code, reason);
  }

  private reconnect(code?: DyCastCloseCode, reason?: string) {
    if (!this.desiredConnected || this.reconnectTimer) return;
    const opts: DyCastOptions = Object.assign({}, this.options, {
      cursor: this.cursor.cursor || this.cursor.firstCursor || this.options?.cursor || '',
      internal_ext: this.cursor.internalExt || this.options?.internal_ext || ''
    });
    this.reconnectCount += 1;
    this.wsRoomStatus = WSRoomStatus.RECONNECTING;
    this.emitter.emit('reconnecting', this.reconnectCount, code, reason);
    // 0.5s → 1s → 2s → 4s → 8s → 15s，并加入少量抖动，断网时避免请求风暴。
    const baseDelay = Math.min(15000, 500 * 2 ** Math.max(0, this.reconnectCount - 1));
    const delay = Math.round(baseDelay * (0.9 + Math.random() * 0.2));
    const epoch = this.lifecycleEpoch;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = void 0;
      void this.continueReconnect(opts, epoch);
    }, delay);
  }

  /** 多次失败后刷新房间签名，避免拿过期连接参数无限重试。 */
  private async continueReconnect(fallbackOptions: DyCastOptions, epoch: number) {
    if (!this.isCurrentLifecycle(epoch)) return;
    if (!this.options) {
      // 首次房间查询失败时还没有可用 WS 参数，必须重试完整的三段初始化。
      const abortController = new AbortController();
      this.connectAbortController = abortController;
      try {
        await this.fetchConnectInfo(this.roomNum, abortController.signal);
        if (!this.isCurrentLifecycle(epoch)) return;
        if (!this.isLiving()) {
          const liveStatus = this.getLiveStatus();
          this.desiredConnected = false;
          this._afterClose();
          this.emitter.emit('close', DyCastCloseCode.LIVE_END, liveStatus.msg);
          return;
        }
        this._connect(this.getWssParam(), epoch);
      } catch (error) {
        if (!this.isCurrentLifecycle(epoch)) return;
        if (this.isPermanentLookupError(error)) {
          this.stopForPermanentLookupError(error);
          return;
        }
        CLog.warn('重试直播连接信息失败，稍后继续尝试 =>', error);
        this.reconnect(DyCastCloseCode.CONNECTING_ERROR, '重试直播连接信息失败');
      } finally {
        if (this.connectAbortController === abortController) {
          this.connectAbortController = void 0;
        }
      }
      return;
    }
    let nextOptions = fallbackOptions;
    const now = Date.now();
    if (this.reconnectCount >= this.maxReconnectCount && now - this.lastConnectInfoRefreshTime >= 30000) {
      this.lastConnectInfoRefreshTime = now;
      const abortController = new AbortController();
      this.connectAbortController?.abort();
      this.connectAbortController = abortController;
      try {
        await this.fetchConnectInfo(this.roomNum, abortController.signal);
        if (!this.isCurrentLifecycle(epoch)) return;
        if (!this.isLiving()) {
          const liveStatus = this.getLiveStatus();
          this.desiredConnected = false;
          this._afterClose();
          this.emitter.emit('close', DyCastCloseCode.LIVE_END, liveStatus.msg);
          return;
        }
        const refreshedOptions = this.getWssParam();
        nextOptions = {
          ...refreshedOptions,
          cursor: this.cursor.cursor || this.cursor.firstCursor || refreshedOptions.cursor,
          internal_ext: this.cursor.internalExt || refreshedOptions.internal_ext
        };
      } catch (error) {
        if (!this.isCurrentLifecycle(epoch)) return;
        CLog.warn('刷新直播连接参数失败，稍后继续重试 =>', error);
        this.reconnect(DyCastCloseCode.CONNECTING_ERROR, '刷新直播连接参数失败');
        return;
      } finally {
        if (this.connectAbortController === abortController) {
          this.connectAbortController = void 0;
        }
      }
    }
    if (!this.isCurrentLifecycle(epoch)) return;
    this._connect(nextOptions, epoch);
  }

  /**
   * 关闭
   */
  public close(code: number = 1005, reason: string = 'close') {
    const wasActive = this.desiredConnected || Boolean(this.ws) ||
      this.wsRoomStatus === WSRoomStatus.CONNECTING ||
      this.wsRoomStatus === WSRoomStatus.CONNECTED ||
      this.wsRoomStatus === WSRoomStatus.RECONNECTING;
    this.stopConnection();
    if (wasActive) this.emitter.emit('close', code, reason);
  }

  /** 页面卸载或替换客户端时静默释放全部资源。 */
  public dispose() {
    this.stopConnection();
    this.emitter.clear();
  }

  private stopConnection() {
    this.desiredConnected = false;
    this.lifecycleEpoch++;
    this.connectionGeneration++;
    this.connectAbortController?.abort();
    this.connectAbortController = void 0;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = void 0;
    }
    const socket = this.ws;
    this._afterClose();
    this.reconnectCount = 0;
    if (socket && socket.readyState !== WebSocket.CLOSED) {
      try {
        // 无需传 code，因为抖音弹幕服务端不会可靠处理关闭帧。
        socket.close();
      } catch {}
    }
  }

  /**
   * 发送心跳帧
   */
  private ping() {
    try {
      // 清除之前的定时器，防止泄漏
      if (this.pingTimer) {
        clearTimeout(this.pingTimer);
        this.pingTimer = void 0;
      }
      let dur = Math.max(10000, Number(this.heartbeatDuration));
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // 连接正常
        // 发送心跳 => hb
        this.ws.send(this._ping());
        this.pingCount++;
        if (this.pingCount >= this.downgradePingCount) {
          return this.cannotReceiveMessage();
        }
      }
      // 心跳：大概每 10 秒发送一次
      this.pingTimer = setTimeout(() => {
        this.state && this.ping();
      }, dur);
    } catch (err) {
      // 发送过程出错
      CLog.error('DyCast Ping Error =>', err);
    }
  }

  /**
   * 无法正常接收消息
   *  - 长时间未接收到消息
   */
  private cannotReceiveMessage() {
    const tmp = Date.now() - this.lastReceiveTime;
    CLog.error(`DyCast Cannot Receive Message => after ${tmp} ms`);
    this.requestReconnect(DyCastCloseCode.CANNOT_RECEIVE, '客户端无法正常接收信息');
  }

  /**
   * 设置 cursor
   * @param cur
   * @param ext
   */
  private setCursor(cur: string, ext: string) {
    this.cursor.cursor = cur;
    this.cursor.internalExt = ext;
    if (!this.cursor.firstCursor) {
      this.cursor.firstCursor = cur;
    }
  }

  /**
   * 处理一次接收的消息集
   */
  private _dealMessages(msgs?: Message[]) {
    if (!msgs || msgs.length < 1) return;
    const messages: DyMessage[] = [];
    try {
      for (const msg of msgs) {
        const message = this._dealMessage(msg);
        if (message) messages.push(message);
      }
    } catch (err) {}
    if (!messages.length) return;
    this.emitter.emit('message', messages);
  }

  /**
   * 处理一条消息
   * @param msg
   */
  private _dealMessage(msg: Message) {
    const method = msg.method;
    const data: DyMessage = {};
    data.id = msg.msgId;
    let message = null;
    let payload = msg.payload;
    if (!payload) return null;
    try {
      // 处理消息
      switch (method) {
        case CastMethod.CHAT:
          message = decodeChatMessage(payload);
          data.method = CastMethod.CHAT;
          data.user = this._getCastUser(message.user);
          data.content = message.content;
          // 获取富文本：包含合并表情
          data.rtfContent = this._getCastRtfContent(message.rtfContentV2);
          break;
        case CastMethod.GIFT:
          message = decodeGiftMessage(payload);
          data.method = CastMethod.GIFT;
          data.user = this._getCastUser(message.user);
          data.toUser = this._getCastUser(message.toUser);
          data.gift = this._getCastGift(message.gift, message.repeatCount || message.comboCount, message.repeatEnd);
          break;
        case CastMethod.LIKE:
          message = decodeLikeMessage(payload);
          data.method = CastMethod.LIKE;
          data.user = this._getCastUser(message.user);
          data.content = `为主播点赞了(${message.count})`;
          data.room = { likeCount: message.total };
          break;
        case CastMethod.MEMBER:
          message = decodeMemberMessage(payload);
          data.method = CastMethod.MEMBER;
          data.user = this._getCastUser(message.user);
          data.content = '进入直播间';
          data.room = { audienceCount: message.memberCount };
          break;
        case CastMethod.SOCIAL:
          message = decodeSocialMessage(payload);
          data.method = CastMethod.SOCIAL;
          data.user = this._getCastUser(message.user);
          data.content = '关注了主播';
          data.room = { followCount: message.followCount };
          break;
        case CastMethod.EMOJI_CHAT:
          message = decodeEmojiChatMessage(payload);
          data.method = CastMethod.EMOJI_CHAT;
          data.user = this._getCastUser(message.user);
          data.content = this._getCastEmoji(message.emojiContent);
          data.emojiText = this._getCastEmojiText(message.emojiContent);
          break;
        case CastMethod.ROOM_USER_SEQ:
          message = decodeRoomUserSeqMessage(payload);
          data.method = CastMethod.ROOM_USER_SEQ;
          data.rank = this._getCastRanksA(message.ranks);
          data.room = { audienceCount: message.total, totalUserCount: message.totalUser };
          break;
        case CastMethod.CONTROL:
          message = decodeControlMessage(payload);
          data.method = CastMethod.CONTROL;
          data.content = message.common?.describe;
          data.room = { status: parseInt(message.action || '') || void 0 };
          break;
        case CastMethod.ROOM_RANK:
          message = decodeRoomRankMessage(payload);
          data.method = CastMethod.ROOM_RANK;
          data.rank = this._getCastRanksB(message.ranks);
          break;
        case CastMethod.ROOM_STATS:
          message = decodeRoomStatsMessage(payload);
          data.method = CastMethod.ROOM_STATS;
          data.room = { audienceCount: message.displayMiddle };
          break;
        case CastMethod.FANSCLUB:
          message = decodeFansclubMessage(payload);
          data.method = CastMethod.FANSCLUB;
          data.user = this._getCastUser(message.user);
          data.content = message.content || '加入粉丝团';
          break;
      }
      if (!data.method) return null;
    } catch (err) {
      // MLog.error('DyCast Message Decode Error =>', method);
      return null;
    }
    data.time = Date.now();
    return data;
  }

  /**
   * 获取当前的送礼榜单
   * @param data
   */
  private _getCastRanksA(data?: RoomUserSeqMessage_Contributor[]): LiveRankItem[] | undefined {
    if (!data || !data.length) return void 0;
    const list: LiveRankItem[] = [];
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      list.push({
        avatar: item.user?.avatarThumb?.urlList?.[0] || '',
        nickname: item.user?.nickname || '',
        rank: item.rank || i + 1
      });
    }
    return list;
  }

  /**
   * 获取当前的送礼榜单
   * @param data
   */
  private _getCastRanksB(data?: RoomRankMessage_RoomRank[]): LiveRankItem[] | undefined {
    if (!data || !data.length) return void 0;
    const list: LiveRankItem[] = [];
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      list.push({
        avatar: item.user?.avatarThumb?.urlList?.[0] || '',
        nickname: item.user?.nickname || '',
        rank: item.scoreStr || i + 1
      });
    }
    return list;
  }

  /**
   * 获取弹幕用户
   * @param data
   * @returns
   */
  private _getCastUser(data?: User): CastUser | undefined {
    if (!data) return void 0;
    const displayId = data.displayId?.trim();
    const shortId = data.shortId?.trim();
    // 名单只导出资料页可直接搜索的纯数字 display_id。
    // data.id、short_id 和 sec_uid 都是不同类型的标识，不能用于顶替。
    const douyinId = displayId && /^\d+$/.test(displayId) ? displayId : undefined;
    const douyinIdSource = douyinId ? 'displayId' as const : undefined;
    const user: CastUser = {
      id: data.secUid,
      douyinId,
      douyinIdSource,
      shortId,
      displayId,
      name: data.nickname,
      gender: data.gender,
      avatar: data.avatarThumb?.urlList?.[0]
    };
    // 房间号和主播 UID 不是同一种标识，不能互相兜底，否则会串灯牌。
    const currentAnchorUid = String(this.info.anchorId || '').trim() || undefined;
    user.currentTargetAnchorId = currentAnchorUid;

    // 严格只提取当前直播间主播的灯牌，不依赖预设主播账号。
    const fansClub = data.fansClub;
    if (fansClub && currentAnchorUid) {
      // data 是当前佩戴/历史灯牌；preferData 可能补充同一主播的完整信息。
      const entries: Array<{ entry?: User_FansClub_FansClubData; isCurrent: boolean }> = [
        ...Object.values(fansClub.preferData || {}).map(entry => ({ entry, isCurrent: false })),
        { entry: fansClub.data, isCurrent: true }
      ];
      const results = new Map<string, CastUserFansClub>();
      for (const { entry, isCurrent } of entries) {
        if (!entry || entry.level === undefined) continue;
        // 有归属 ID 时必须精确匹配当前主播；只有协议缺失 ID 才按当前房间补全。
        const anchorUid: string | undefined = String(entry.anchorId || '').trim() ||
          (isCurrent ? currentAnchorUid : undefined);
        if (!anchorUid || anchorUid !== currentAnchorUid) continue;
        const level = Math.max(0, entry.level);
        results.set(anchorUid, {
          anchorId: anchorUid,
          clubName: entry.clubName,
          level,
          badgeIcon: entry.badge?.icons?.[level]?.urlList?.[0]
        });
      }
      if (results.size > 0) {
        user.fansClub = Array.from(results.values());
      }
    }
    return user;
  }

  /**
   * 获取弹幕礼物
   * @param data
   * @returns
   */
  private _getCastGift(data?: GiftStruct, count?: string, end?: number): CastGift | undefined {
    if (!data) return void 0;
    return {
      id: data.id,
      name: data.name,
      price: data.diamondCount,
      type: data.type,
      desc: data.describe,
      icon: data.image?.urlList?.[0],
      count: count,
      repeatEnd: end
    };
  }

  /**
   * 获取会员表情
   * @param data
   * @returns
   */
  private _getCastEmoji(data?: Text): string | undefined {
    if (!data) return void 0;
    return data.pieces?.[0]?.imageValue?.image?.urlList?.[0];
  }

  private _getCastEmojiText(data?: Text): string | undefined {
    const content = data?.pieces?.[0]?.imageValue?.image?.content;
    return content?.alternativeText || content?.name || '会员表情';
  }

  /**
   * 获取弹幕富文本内容
   * @param data
   * @returns
   */
  private _getCastRtfContent(data?: Text): CastRtfContent[] | undefined {
    if (!data) return void 0;
    if (!data.pieces) return void 0;
    const pieces = data.pieces;
    const list: CastRtfContent[] = [];
    /**
     * pieces 类型
     *  - type = 1  : 普通的聊天文本 : 关键字段(stringValue)
     *  - type = 11 : @ 用户 : 关键字段(userValue.user)
     *  - type = 15 : 合成表情 : 关键字段(imageValue)
     */
    for (let i = 0; i < pieces.length; i++) {
      if (pieces[i].imageValue) {
        // 合成表情
        let url = pieces[i].imageValue?.image?.urlList?.[0];
        let name = pieces[i].imageValue?.image?.content?.name;
        list.push({
          type: CastRtfContentType.EMOJI,
          text: name,
          url
        });
      } else if (pieces[i].userValue) {
        // 艾特用户
        let atUser = pieces[i].userValue?.user;
        list.push({
          type: CastRtfContentType.USER,
          text: `@${atUser?.nickname}`,
          user: this._getCastUser(atUser)
        });
      } else {
        // 假定为普通文本类型
        // 实际还可能是 giftValue 之类的
        list.push({
          type: CastRtfContentType.TEXT,
          text: pieces[i].stringValue || ''
        });
      }
    }
    return list;
  }

  /**
   * 处理接收的二进制消息
   * @param data
   */
  private async _decodeFrame(data: Uint8Array) {
    const frame = decodePushFrame(data);
    let payload = frame.payload;
    const headers = frame.headersList;
    let cursor = '';
    let internalExt = '';
    let needAck = !1;
    if (!payload) return null;
    if (headers) {
      if (headers['compress_type'] && headers['compress_type'] === 'gzip') {
        payload = inflateGzipBounded(payload);
      } else {
        assertFramePayloadSize(payload, MAX_DECODED_PAYLOAD_BYTES, 'decoded-payload');
      }
      if (headers['im-cursor']) {
        cursor = headers['im-cursor'];
      }
      if (headers['im-internal_ext']) {
        internalExt = headers['im-internal_ext'];
      }
    }
    const res = decodeResponse(payload);
    if (!cursor && res.cursor) cursor = res.cursor;
    if (!internalExt && res.internalExt) internalExt = res.internalExt;
    if (res.needAck) needAck = res.needAck;
    return {
      response: res,
      frame,
      cursor,
      needAck,
      internalExt
    };
  }

  /** 心跳数据 */
  private _ping() {
    return encodePushFrame({
      payloadType: PayloadType.Hb
    }) as Uint8Array<ArrayBuffer>;
  }

  /**
   * Ack 数据
   * @param ext Frame im-internal_ext | Response internalExt
   * @param logId
   */
  private _ack(ext: string = '', logId?: string) {
    const payload = new TextEncoder().encode(ext);
    return encodePushFrame({
      payloadType: PayloadType.Ack,
      payload,
      logId
    }) as Uint8Array<ArrayBuffer>;
  }

  /** 关闭后 */
  private _afterClose() {
    this.state = !1;
    if (this.pingTimer) {
      clearTimeout(this.pingTimer);
      this.pingTimer = void 0;
    }
    // 保留最后一次 ACK 游标，短暂断线重连时从断点继续，减少漏弹幕和重复回放。
    this.wsRoomStatus = WSRoomStatus.CLOSED;
    this.closeEvent = { code: DyCastCloseCode.NO_STATUS, msg: 'CLOSE_NO_STATUS' };
    this.ws = void 0;
  }

  /** 打开后 */
  private _afterOpen() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = void 0;
    }
    this.state = !0;
    this.wsRoomStatus = WSRoomStatus.CONNECTED;
  }

  /**
   * 获取完整的 wss 地址
   * @param opts
   * @returns
   */
  private _getSocketUrl(opts: DyCastOptions) {
    const fullOpt = Object.assign({}, defaultOpts, opts);
    const query = new URLSearchParams(this._mergeOptions(fullOpt));
    const pushHost = getDouyinPushServerHost(this.imInfo.pushServer);
    if (pushHost) query.set(DYCAST_WS_HOST_PARAM, pushHost);
    return `${BASE_URL}?${query.toString()}`;
  }

  /**
   * 将配置转换为 url 参数字符串
   *  - 如：item1=value1&item2=value2&...
   * @param opts
   * @returns
   */
  private _mergeOptions(opts: any): string {
    return makeUrlParams(opts);
  }

  /**
   * 获取连接信息
   * @param roomNum
   * @returns
   */
  private async fetchConnectInfo(roomNum: string, signal?: AbortSignal) {
    try {
      const info = await getLiveInfo(roomNum, signal);
      await fetchUser(signal);
      const imInfo = await getImInfo(info.roomId, info.uniqueId, signal);
      if (signal?.aborted) throw new DOMException('连接已取消', 'AbortError');
      // 三段初始化全部成功后再一次性提交，避免失败请求留下半套连接参数。
      this.info = info;
      this.status = info.status;
      this.imInfo = imInfo;
    } catch (err) {
      // CLog.error('DyCast LiveInfo Request Error =>', err);
      return Promise.reject(err);
    }
  }

  /**
   * 整理连接参数对象
   */
  private getWssParam(): DyCastOptions {
    const { roomId, uniqueId } = this.info;
    const sign = getSignature(roomId, uniqueId);
    return {
      room_id: roomId,
      user_unique_id: uniqueId,
      cursor: this.imInfo.cursor || '',
      internal_ext: this.imInfo.internalExt || '',
      signature: sign
    };
  }

  /**
   * 是否已经直播
   */
  private isLiving() {
    return this.status === RoomStatus.LIVING;
  }

  /** 获取直播状态 */
  private getLiveStatus() {
    let type = 'Unknown';
    let code = 0;
    let msg = '未知状态';
    switch (this.status) {
      case RoomStatus.PREPARE:
        type = 'PREPARE';
        code = RoomStatus.PREPARE;
        msg = '主播正在准备中';
        break;
      case RoomStatus.LIVING:
        type = 'LIVING';
        code = RoomStatus.LIVING;
        msg = '主播正在直播中';
        break;
      case RoomStatus.PAUSE:
        type = 'PAUSE';
        code = RoomStatus.PAUSE;
        msg = '主播暂时离开了';
        break;
      case RoomStatus.END:
        type = 'END';
        code = RoomStatus.END;
        msg = '主播已下播';
        break;
    }
    return {
      type,
      code,
      msg
    };
  }

  /**
   * 获取直播间信息
   */
  public getLiveInfo(): DyLiveInfo {
    return {
      ...this.info,
      roomNum: this.roomNum
    };
  }
}
