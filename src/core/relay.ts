import { CLog } from '@/utils/logUtil';
import { Emitter, type EventMap } from './emitter';

interface RelayCastEvent extends EventMap {
  open: (ev: Event) => void;
  close: (code?: number, msg?: string) => void;
  error: (ev: Error) => void;
  message: (data: any) => void;
  /** 重连中 */
  reconnecting: (count?: number) => void;
  /** 重连完成 */
  reconnect: (ev?: Event) => void;
}

/** 连接状态 */
export type RelayStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'closed';

/**
 * 弹幕转发器
 *  - 支持断线重连、心跳保活、状态管理
 */
export class RelayCast {
  private url: string;

  private ws: WebSocket | undefined;

  private emitter: Emitter<RelayCastEvent>;

  /** 当前状态 */
  private status: RelayStatus = 'disconnected';

  /** 心跳定时器 */
  private pingTimer: ReturnType<typeof setTimeout> | undefined;
  /** 心跳间隔 (ms) */
  private pingInterval: number = 30000;
  /** 心跳计数 — 超过阈值说明连接假死 */
  private pingCount: number = 0;
  private pingThreshold: number = 2;

  /** 重连次数 */
  private reconnectCount: number = 0;
  private maxReconnectCount: number = 5;
  /** 是否需要重连（由外部触发的关闭不重连） */
  private shouldReconnect: boolean = false;
  /** 重连延迟定时器 */
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  /** 消息缓冲区（用于节流发送） */
  private msgBuffer: string[] = [];
  /** 节流定时器 */
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  /** 节流间隔 (ms) */
  private flushInterval: number = 100;

  constructor(url: string) {
    this.url = url;
    this.emitter = new Emitter();
  }

  /**
   * 监听
   */
  public on<K extends keyof RelayCastEvent>(event: K, listener: RelayCastEvent[K]) {
    this.emitter.on(event, listener);
  }

  /**
   * 取消监听
   */
  public off<K extends keyof RelayCastEvent>(event: K, listener: RelayCastEvent[K]) {
    this.emitter.off(event, listener);
  }

  /**
   * 一次性监听
   */
  public once<K extends keyof RelayCastEvent>(event: K, listener: RelayCastEvent[K]) {
    this.emitter.once(event, listener);
  }

  /**
   * 连接
   */
  connect() {
    if (this.status === 'connected' || this.status === 'connecting') {
      CLog.warn('RelayCast 已连接，请勿重复连接');
      return;
    }
    this.status = 'connecting';
    this._doConnect();
  }

  /**
   * 实际连接逻辑
   */
  private _doConnect() {
    try {
      this.ws = new WebSocket(this.url);

      this.ws.addEventListener('open', ev => {
        this.status = 'connected';
        this.pingCount = 0;
        this.shouldReconnect = true;
        // 重连成功
        if (this.reconnectCount > 0) {
          CLog.info(`RelayCast 重连成功 (第${this.reconnectCount}次)`);
          this.reconnectCount = 0;
          this.emitter.emit('reconnect', ev);
        }
        this.emitter.emit('open', ev);
        this._startPing();
      });

      this.ws.addEventListener('close', ev => {
        this._cleanup();
        this.emitter.emit('close', ev.code, ev.type);
        if (this.shouldReconnect) {
          this._reconnect();
        }
      });

      this.ws.addEventListener('error', ev => {
        CLog.error('RelayCast 连接错误:', ev.type);
        this.emitter.emit('error', Error(ev.type || 'Unknown Error'));
      });

      this.ws.addEventListener('message', ev => {
        this.pingCount = 0;
        this.emitter.emit('message', ev.data);
      });
    } catch (err) {
      this.status = 'closed';
      CLog.error('RelayCast 连接失败:', err);
      this.emitter.emit('error', Error('转发服务器连接出错'));
      this.emitter.emit('close', 4002, '连接出错');
    }
  }

  /**
   * 是否已连接
   */
  isConnected(): boolean {
    return this.status === 'connected' && !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * 获取当前状态
   */
  getStatus(): RelayStatus {
    return this.status;
  }

  /**
   * 发送消息（支持节流缓冲）
   * @param data
   */
  send(data: string | ArrayBuffer) {
    if (!this.isConnected()) return;
    if (typeof data === 'string') {
      // 字符串消息进入缓冲区，合并后批量发送
      this.msgBuffer.push(data);
      this._scheduleFlush();
    } else {
      // 二进制消息直接发送
      this.ws!.send(data);
    }
  }

  /**
   * 节流：合并高频消息批量发送
   */
  private _scheduleFlush() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      this._flush();
    }, this.flushInterval);
  }

  /**
   * 刷新缓冲区 — 合并为一个 JSON 数组发送
   */
  private _flush() {
    if (this.msgBuffer.length === 0 || !this.isConnected()) {
      this.msgBuffer.length = 0;
      return;
    }
    try {
      if (this.msgBuffer.length === 1) {
        // 单条消息直接发送，避免额外包装
        this.ws!.send(this.msgBuffer[0]);
      } else {
        // 多条消息合并为 JSON 数组
        // 每条消息本身是 JSON 数组 '[...]'，需要提取内部元素合并
        const items: string[] = [];
        for (const msg of this.msgBuffer) {
          // 去掉外层 [ ] 后拼接
          const inner = msg.replace(/^\[/, '').replace(/\]$/, '');
          if (inner) items.push(inner);
        }
        this.ws!.send('[' + items.join(',') + ']');
      }
    } catch (err) {
      CLog.error('RelayCast 发送失败:', err);
    }
    this.msgBuffer.length = 0;
  }

  /**
   * 关闭转发（手动关闭，不触发重连）
   */
  close(code: number = 1000, msg: string = 'close') {
    this.shouldReconnect = false;
    this._cleanup();
    if (this.ws) {
      try {
        this.ws.close(code, msg);
      } catch {}
      this.ws = undefined;
    }
    this.status = 'closed';
  }

  /**
   * 启动心跳
   */
  private _startPing() {
    this._stopPing();
    this.pingTimer = setInterval(() => {
      if (!this.isConnected()) {
        this._stopPing();
        return;
      }
      this.pingCount++;
      if (this.pingCount >= this.pingThreshold) {
        CLog.warn('RelayCast 心跳超时，连接可能已断开');
        this._stopPing();
        // 主动关闭触发重连
        this.ws?.close();
      }
    }, this.pingInterval);
  }

  /**
   * 停止心跳
   */
  private _stopPing() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = undefined;
    }
  }

  /**
   * 重连
   */
  private _reconnect() {
    this.reconnectCount++;
    if (this.reconnectCount > this.maxReconnectCount) {
      CLog.error('RelayCast 已超过最大重连次数');
      this.status = 'closed';
      this.emitter.emit('error', Error('已超过最大重连次数'));
      return;
    }
    this.status = 'reconnecting';
    this.emitter.emit('reconnecting', this.reconnectCount);
    // 指数退避：1s, 2s, 4s, 8s, 16s
    const delay = Math.min(1000 * Math.pow(2, this.reconnectCount - 1), 16000);
    CLog.info(`RelayCast 将在 ${delay}ms 后重连 (第${this.reconnectCount}次)`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this._doConnect();
    }, delay);
  }

  /**
   * 清理定时器和缓冲区
   */
  private _cleanup() {
    this._stopPing();
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    this.msgBuffer.length = 0;
  }
}
