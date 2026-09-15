<template>
  <div class="index-view">
    <div class="view-left">
      <LiveInfo
        :cover="cover"
        :title="title"
        :avatar="avatar"
        :nickname="nickname"
        :follow-count="followCount"
        :member-count="memberCount"
        :user-count="userCount"
        :like-count="likeCount" />
      <div class="view-left-highlight">
        <hr class="hr" />
        <LiveOverlayQuickControls />
        <!-- 礼物置顶 -->
        <GiftHighlight ref="giftHighlightRef" />
      </div>
      <div class="view-left-bottom">
        <SidTool />
        <div class="view-left-tools">
          <div class="view-left-tool feed-btn" title="项目仓库" @click.stop="openFeedDialog">
            <span class="repo-tool-icon">&lt;/&gt;</span>
          </div>
          <div class="view-left-tool cm-btn" title="保存弹幕" @click.stop="saveCastToFile">
            <i class="ice-save icon"></i>
          </div>
          <div class="view-left-tool cm-btn" title="设置" @click.stop="settingsVisible = true">
            <i class="ice-setting icon"></i>
          </div>
          <div class="view-left-tool cm-btn" title="弹幕充能" @click.stop="openDanmuPage">
            <span class="danmu-icon">⚡</span>
          </div>
          <div
            class="view-left-tool cm-btn live-overlay-btn"
            :class="{ active: liveOverlayOpen }"
            :title="liveOverlayOpen ? '关闭直播信息绿幕' : '打开直播信息绿幕'"
            @click.stop="toggleLiveOverlayWindow">
            <span class="live-overlay-icon">⏱</span>
          </div>
          <div class="view-left-tool cm-btn display-page-btn" title="观众弹幕展示" @click.stop="openDanmuDisplayPage">
            <span class="display-page-icon">💬</span>
          </div>
        </div>
        <hr class="hr" />
        <LiveStatusPanel ref="panel" :status="connectStatus" />
      </div>
    </div>
    <div class="view-center">
      <!-- 主要弹幕：聊天、礼物 -->
      <CastList :types="['chat', 'gift']" ref="castEl" />
    </div>
    <div class="view-right">
      <div class="view-input">
        <ConnectInput
          ref="roomInput"
          label="房间号"
          placeholder="输入房间号或直播链接"
          v-model:value="roomNum"
          :test="verifyRoomNumber"
          :history-list="roomHistory"
          @confirm="connectLive"
          @cancel="disconnectLive"
          @select-history="handleSelectHistory"
          @delete-history="handleDeleteHistory" />
        <ConnectInput
          ref="relayInput"
          label="WS地址"
          placeholder="请输入转发地址"
          confirm-text="转发"
          cancel-text="停止"
          v-model:value="relayUrl"
          :test="verifyWssUrl"
          @confirm="relayCast"
          @cancel="stopRelayCast" />
      </div>
      <div class="view-other">
        <!-- 其它弹幕：关注、点赞、进入、控制台等 -->
        <CastList ref="otherEl" :types="['social', 'like', 'member']" pos="left" no-prefix theme="dark" />
      </div>
    </div>
    <!-- 投喂弹窗 -->
    <FeedDialog v-model="fdVisible" />
    <!-- 设置弹窗 -->
    <SettingsDialog v-model="settingsVisible" />
  </div>
</template>

<script setup lang="ts">
import ConnectInput from '@/components/ConnectInput.vue';
import LiveInfo from '@/components/LiveInfo.vue';
import LiveStatusPanel from '@/components/LiveStatusPanel.vue';
import CastList from '@/components/CastList.vue';
import SidTool from '@/components/SidTool/SidTool.vue';
import FeedDialog from '@/components/FeedDialog.vue';
import SettingsDialog from '@/components/SettingsDialog.vue';
import GiftHighlight from '@/components/GiftHighlight.vue';
import LiveOverlayQuickControls from '@/components/LiveOverlayQuickControls.vue';
import {
  CastMethod,
  DyCast,
  DyCastCloseCode,
  RoomStatus,
  type ConnectStatus,
  type DyLiveInfo,
  type DyMessage,
  type LiveRoom
} from '@/core/dycast';
import { extractRoomNum, verifyRoomNum, verifyWsUrl } from '@/utils/verifyUtil';
import { markRaw, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue';
import { getHistory, addHistory, removeHistory, type HistoryItem } from '@/utils/historyUtil';
import { CLog } from '@/utils/logUtil';
import { getId } from '@/utils/idUtil';
import { beginLiveSession, pushDanmu } from '@/danmu/store';
import type { Danmu } from '@/danmu/types';
import { RelayCast } from '@/core/relay';
import SkMessage from '@/components/Message';
import { formatDate } from '@/utils/commonUtil';
import FileSaver from '@/utils/fileUtil';

// 连接状态
const connectStatus = ref<ConnectStatus>(0);
// 转发状态
const relayStatus = ref<ConnectStatus>(0);
// 房间号
const roomNum = ref<string>('');
// 历史记录
const roomHistory = ref<HistoryItem[]>(getHistory());
// 房间号输入框状态
const roomInputRef = useTemplateRef('roomInput');
// 转发地址
const relayUrl = ref<string>('');
const relayInputRef = useTemplateRef('relayInput');
// 状态面板
const statusPanelRef = useTemplateRef('panel');

// 投喂弹窗可见性
const fdVisible = ref(false);
// 设置弹窗可见性
const settingsVisible = ref(false);
const liveOverlayOpen = ref(false);
let stopLiveOverlayStateListener: (() => void) | null = null;

/** 直播间信息 */
const cover = ref<string>('');
const title = ref<string>('*****');
const avatar = ref<string>('');
const nickname = ref<string>('***');
const followCount = ref<string | number>('*****');
const memberCount = ref<string | number>('*****');
const userCount = ref<string | number>('*****');
const likeCount = ref<string | number>('*****');

// 主要弹幕
const castRef = useTemplateRef('castEl');
// 其它弹幕
const otherRef = useTemplateRef('otherEl');
// 礼物置顶
const giftHighlightRef = useTemplateRef('giftHighlightRef');
// 所有弹幕（用于保存文件）
const MAX_CASTS = 10000;
const allCasts: DyMessage[] = [];
// 去重集合（滑动窗口）
const MAX_SET_SIZE = 5000;
const castSet = new Set<string>();
let liveSessionId = '';
let liveSessionDanmuCount = 0;
// 弹幕客户端
let castWs: DyCast | undefined;
// 转发客户端
let relayWs: RelayCast | undefined;

/**
 * 验证房间号
 * @param value
 * @returns
 */
function verifyRoomNumber(value: string) {
  const flag = verifyRoomNum(value);
  if (flag) return { flag, message: '' };
  else {
    return { flag, message: '房间号错误' };
  }
}

/**
 * 验证转发地址 WsUrl
 * @param value
 * @returns
 */
function verifyWssUrl(value: string) {
  const flag = verifyWsUrl(value);
  if (flag) return { flag, message: '' };
  else {
    return { flag, message: '转发地址错误' };
  }
}

/** 设置房间号输入框状态 */
const setRoomInputStatus = function (flag?: boolean) {
  if (roomInputRef.value) roomInputRef.value.setStatus(flag);
};

/** 设置转发地址输入框状态 */
const setRelayInputStatus = function (flag?: boolean) {
  if (relayInputRef.value) relayInputRef.value.setStatus(flag);
};

/**
 * 设置房间统计信息
 * @param room
 * @returns
 */
const setRoomCount = function (room?: LiveRoom) {
  if (!room) return;
  if (room.audienceCount) memberCount.value = `${room.audienceCount}`;
  if (room.followCount) followCount.value = `${room.followCount}`;
  if (room.likeCount) likeCount.value = `${room.likeCount}`;
  if (room.totalUserCount) userCount.value = `${room.totalUserCount}`;
};
/**
 * 设置直播间信息
 * @param info
 */
const setRoomInfo = function (info?: DyLiveInfo) {
  if (!info) return;
  if (info.cover) cover.value = info.cover;
  if (info.title) title.value = info.title;
  if (info.avatar) avatar.value = info.avatar;
  if (info.nickname) nickname.value = info.nickname;
};

/**
 * 处理消息列表
 */
const handleMessages = function (msgs: DyMessage[]) {
  const newCasts: DyMessage[] = [];
  const mainCasts: DyMessage[] = [];
  const otherCasts: DyMessage[] = [];
  try {
    for (const msg of msgs) {
      if (!msg.id) continue;
      const msgId = `${msg.method}-${msg.id}`;
      if (castSet.has(msgId)) continue;
      castSet.add(msgId);
      // 消息对象创建后不再修改，跳过响应式代理减少开销
      markRaw(msg);
      // 同步到弹幕抽奖 store（聊天和表情弹幕）
      if (msg.method === CastMethod.CHAT || msg.method === CastMethod.EMOJI_CHAT) {
        const numericUserId = msg.user?.douyinIdSource === 'displayId' && /^\d+$/.test(msg.user.douyinId || '')
          ? msg.user.douyinId
          : undefined;
        const danmu = {
          id: msg.id!,
          liveSessionId,
          liveSessionCount: ++liveSessionDanmuCount,
          userId: numericUserId,
          userIdVerified: Boolean(numericUserId),
          userIdSource: numericUserId ? 'displayId' as const : undefined,
          secUid: msg.user?.id,
          avatar: msg.user?.avatar || '',
          nickname: msg.user?.name || '匿名',
          content: msg.method === CastMethod.EMOJI_CHAT
            ? (msg.emojiText || '会员表情')
            : (msg.content || ''),
          emojiUrl: msg.method === CastMethod.EMOJI_CHAT ? msg.content : undefined,
          timestamp: msg.time || Date.now(),
          fansClub: msg.user?.fansClub,
          targetAnchorId: msg.user?.currentTargetAnchorId
        };
        pushDanmu(danmu);
        // pushDanmu 会补全该用户当前主播的灯牌缓存，
        // 同步回主页消息，确保显示与抽奖判断使用同一份最新数据。
        if (msg.user && danmu.fansClub) msg.user.fansClub = danmu.fansClub;
      }
      switch (msg.method) {
        case CastMethod.CHAT:
          newCasts.push(msg);
          mainCasts.push(msg);
          break;
        case CastMethod.GIFT:
          if (!msg?.gift?.repeatEnd) {
            newCasts.push(msg);
            mainCasts.push(msg);
            // 传递给置顶组件
            if (giftHighlightRef.value) giftHighlightRef.value.handleMessage(msg);
          }
          break;
        case CastMethod.LIKE:
          newCasts.push(msg);
          otherCasts.push(msg);
          setRoomCount(msg.room);
          break;
        case CastMethod.MEMBER:
          newCasts.push(msg);
          otherCasts.push(msg);
          setRoomCount(msg.room);
          break;
        case CastMethod.SOCIAL:
          newCasts.push(msg);
          otherCasts.push(msg);
          setRoomCount(msg.room);
          break;
        case CastMethod.EMOJI_CHAT:
          newCasts.push(msg);
          mainCasts.push(msg);
          break;
        case CastMethod.FANSCLUB:
          newCasts.push(msg);
          otherCasts.push(msg);
          break;
        case CastMethod.ROOM_USER_SEQ:
          setRoomCount(msg.room);
          break;
        case CastMethod.ROOM_STATS:
          setRoomCount(msg.room);
          break;
        case CastMethod.CONTROL:
          if (msg?.room?.status !== RoomStatus.LIVING) {
            // 已经下播
            newCasts.push(msg);
            otherCasts.push(msg);
            disconnectLive();
          }
          break;
      }
    }
  } catch (err) { console.warn('[handleMessages] 消息处理出错:', err); }
  // 记录（限制上限）—— 避免大数组展开导致栈溢出
  for (let i = 0; i < newCasts.length; i++) {
    allCasts.push(newCasts[i]);
  }
  if (allCasts.length > MAX_CASTS) {
    allCasts.splice(0, allCasts.length - MAX_CASTS);
  }
  // 清理过期的去重 ID（滑动窗口）
  if (castSet.size > MAX_SET_SIZE) {
    const iter = castSet.values();
    const toDelete = castSet.size - MAX_SET_SIZE;
    for (let i = 0; i < toDelete; i++) {
      const next = iter.next();
      if (!next.done && next.value) {
        castSet.delete(next.value);
      }
    }
  }
  if (castRef.value) castRef.value.appendCasts(mainCasts);
  if (otherRef.value) otherRef.value.appendCasts(otherCasts);
  // 只转发过滤后的新消息，减少序列化开销
  if (relayWs && relayWs.isConnected() && newCasts.length > 0) {
    relayWs.send(JSON.stringify(newCasts));
  }
};

/**
 * 添加控制台消息
 * @param msg
 */
const addConsoleMessage = function (content: string) {
  if (otherRef.value)
    otherRef.value.appendCasts([
      {
        id: getId(),
        method: CastMethod.CUSTOM,
        content,
        user: { name: '控制台' },
        time: Date.now()
      }
    ]);
};

/**
 * 清理列表
 */
function clearMessageList() {
  castSet.clear();
  allCasts.length = 0;
  if (castRef.value) castRef.value.clearCasts();
  if (otherRef.value) otherRef.value.clearCasts();
  if (giftHighlightRef.value) giftHighlightRef.value.clearHighlights();
}

/**
 * 连接房间
 */
const LAST_ROOM_KEY = 'dycast_last_room';

const connectLive = function () {
  try {
    const normalizedRoomNum = extractRoomNum(roomNum.value);
    if (!normalizedRoomNum) {
      SkMessage.error('请输入正确的房间号或抖音直播链接');
      setRoomInputStatus(false);
      return;
    }
    // 新连接必须先静默淘汰旧实例；否则旧实例的重连计时器仍会继续投递消息、
    // 重复充能，并与新实例争抢界面状态。
    castWs?.dispose();
    castWs = void 0;
    if (relayWs) {
      relayWs.dispose();
      relayWs = void 0;
      relayStatus.value = 0;
      setRelayInputStatus(false);
    }
    roomNum.value = normalizedRoomNum;
    const connectingRoomNum = normalizedRoomNum;
    connectStatus.value = 4;
    // 解析房间和建立连接期间也允许用户立即取消。
    setRoomInputStatus(true);
    // 清空上一次连接的消息
    clearMessageList();
    liveSessionId = typeof crypto?.randomUUID === 'function'
      ? crypto.randomUUID()
      : `live-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    liveSessionDanmuCount = 0;
    beginLiveSession(liveSessionId);
    CLog.debug('正在连接:', roomNum.value);
    SkMessage.info(`正在连接：${roomNum.value}`);
    // 保存房间号用于刷新后自动重连
    localStorage.setItem(LAST_ROOM_KEY, roomNum.value);
    const cast = new DyCast(connectingRoomNum);
    castWs = cast;
    cast.on('open', (ev, info) => {
      if (castWs !== cast) return;
      CLog.info('DyCast 房间连接成功');
      SkMessage.success(`房间连接成功[${connectingRoomNum}]`);
      setRoomInputStatus(true);
      connectStatus.value = 1;
      setRoomInfo(info);
      addConsoleMessage('直播间已连接');
      // 保存到历史记录（包含主播信息）
      roomHistory.value = addHistory(connectingRoomNum, info?.nickname, info?.avatar);
    });
    cast.on('error', err => {
      if (castWs !== cast) return;
      CLog.error('DyCast 连接出错 =>', err);
      const message = describeLiveConnectionError(err);
      if (isPermanentRoomConnectionError(err)) {
        SkMessage.error(`房间号/链接无效或访问被拒绝，检查后重试：${message}`);
        connectStatus.value = 2;
        setRoomInputStatus(false);
        return;
      }
      SkMessage.warning(`连接出现波动，正在恢复：${message}`);
      addConsoleMessage(`连接波动：${message}`);
      connectStatus.value = 4;
      setRoomInputStatus(true);
    });
    cast.on('close', (code, reason) => {
      if (castWs !== cast) return;
      castWs = void 0;
      CLog.info(`DyCast 房间已关闭[${code}] => ${reason}`);
      connectStatus.value = 3;
      setRoomInputStatus(false);
      // 主房间关闭时联动停止转发
      if (relayWs) {
        relayWs.close(1000, '主房间已断开');
        relayWs = undefined;
      }
      switch (code) {
        case DyCastCloseCode.NORMAL:
          SkMessage.success('断开成功');
          break;
        case DyCastCloseCode.LIVE_END:
          SkMessage.info('主播已下播');
          break;
        case DyCastCloseCode.CANNOT_RECEIVE:
          SkMessage.error('无法正常接收信息，已关闭');
          break;
        case DyCastCloseCode.CONNECTING_ERROR:
          if (!isPermanentRoomConnectionError(reason)) SkMessage.info('房间已关闭');
          break;
        default:
          SkMessage.info('房间已关闭');
      }
      if (isPermanentRoomConnectionError(reason)) {
        addConsoleMessage(`连接失败：${reason}`);
      } else if (code === DyCastCloseCode.LIVE_END) {
        addConsoleMessage(reason || '主播尚未开播或已下播');
      } else {
        if (statusPanelRef.value) addConsoleMessage(`连接已关闭，共持续: ${statusPanelRef.value.getDuration()}`);
        else addConsoleMessage('连接已关闭');
      }
    });
    cast.on('message', msgs => {
      if (castWs !== cast) return;
      handleMessages(msgs);
    });
    cast.on('reconnecting', (count, code, reason) => {
      if (castWs !== cast) return;
      connectStatus.value = 4;
      setRoomInputStatus(true);
      switch (code) {
        case DyCastCloseCode.CANNOT_RECEIVE:
          // 无法正常接收信息
          SkMessage.warning('无法正常接收弹幕，准备重连中');
          break;
        default:
          CLog.warn('DyCast 重连中 =>', count);
          SkMessage.warning(`正在重连中: ${count}`);
      }
    });
    cast.on('reconnect', ev => {
      if (castWs !== cast) return;
      CLog.info('DyCast 重连成功');
      SkMessage.success('房间重连完成');
      connectStatus.value = 1;
    });
    void cast.connect();
  } catch (err) {
    CLog.error('房间连接过程出错:', err);
    SkMessage.error('房间连接过程出错');
    setRoomInputStatus(false);
    castWs?.dispose();
    castWs = void 0;
  }
};
/** 断开连接 */
const disconnectLive = function () {
  if (castWs) castWs.close(DyCastCloseCode.NORMAL, '断开连接');
  else {
    connectStatus.value = 3;
    setRoomInputStatus(false);
  }
  // 主房间断开时，联动停止转发
  if (relayWs) {
    relayWs.close(1000, '主房间已断开');
    relayWs = undefined;
  }
};

/** 连接转发房间 */
const relayCast = function () {
  try {
    relayWs?.dispose();
    relayWs = void 0;
    relayStatus.value = 4;
    setRelayInputStatus(true);
    CLog.info('正在连接转发中 =>', relayUrl.value);
    SkMessage.info(`转发连接中: ${relayUrl.value}`);
    const cast = new RelayCast(relayUrl.value);
    relayWs = cast;
    cast.on('open', () => {
      if (relayWs !== cast) return;
      CLog.info(`DyCast 转发连接成功`);
      SkMessage.success(`已开始转发`);
      setRelayInputStatus(true);
      relayStatus.value = 1;
      addConsoleMessage('转发客户端已连接');
      if (castWs) {
        // 发送直播间信息给转发地址
        cast.send(JSON.stringify(castWs.getLiveInfo()));
      }
    });
    cast.on('close', (code, msg) => {
      if (relayWs !== cast) return;
      relayWs = void 0;
      CLog.info(`(${code})dycast 转发已关闭: ${msg || '未知原因'}`);
      if (code === 1000) SkMessage.info(`已停止转发`);
      else SkMessage.warning(`转发已停止: ${msg || '未知原因'}`);
      setRelayInputStatus(false);
      relayStatus.value = 0;
      addConsoleMessage('转发已关闭');
    });
    cast.on('error', ev => {
      if (relayWs !== cast) return;
      CLog.warn(`dycast 转发出错: ${ev.message}`);
      SkMessage.warning(`转发连接波动，正在恢复: ${ev.message}`);
      setRelayInputStatus(true);
      relayStatus.value = 4;
    });
    cast.on('reconnecting', count => {
      if (relayWs !== cast) return;
      CLog.warn(`RelayCast 重连中 => 第${count}次`);
      SkMessage.warning(`转发重连中: ${count}`);
      relayStatus.value = 4;
    });
    cast.on('reconnect', () => {
      if (relayWs !== cast) return;
      CLog.info('RelayCast 重连成功');
      SkMessage.success('转发重连完成');
      setRelayInputStatus(true);
      relayStatus.value = 1;
      // 重连后重新发送直播间信息
      if (castWs) {
        cast.send(JSON.stringify(castWs.getLiveInfo()));
      }
    });
    cast.connect();
  } catch (err) {
    CLog.error('弹幕转发出错:', err);
    SkMessage.error(`转发出错: ${(err as Error).message}`);
    setRelayInputStatus(false);
    relayStatus.value = 2;
    relayWs = void 0;
  }
};
/** 暂停转发 */
const stopRelayCast = function () {
  if (relayWs) relayWs.close(1000, '用户停止转发');
  else {
    relayStatus.value = 0;
    setRelayInputStatus(false);
  }
};

/** 将弹幕保存到本地文件 */
const saveCastToFile = function () {
  if (connectStatus.value === 1) {
    SkMessage.warning('请断开连接后再保存');
    return;
  }
  const len = allCasts.length;
  if (len <= 0) {
    SkMessage.warning('暂无弹幕需要保存');
    return;
  }
  const date = formatDate(new Date(), 'yyyy-MM-dd_HHmmss');
  const fileName = `[${roomNum.value}]${date}(${len})`;
  const data = JSON.stringify(allCasts, null, 2);
  FileSaver.save(data, {
    name: fileName,
    ext: '.json',
    mimeType: 'application/json',
    description: '弹幕数据',
    existStrategy: 'new'
  })
    .then(res => {
      if (res.success) {
        SkMessage.success('弹幕保存成功');
      } else {
        SkMessage.error('弹幕保存失败');
        CLog.error('弹幕保存失败 =>', res.message);
      }
    })
    .catch(err => {
      SkMessage.error('弹幕保存出错了');
      CLog.error('弹幕保存出错了 =>', err);
    });
};

/**
 * 打开投喂弹窗
 */
const openFeedDialog = function () {
  fdVisible.value = true;
};

/**
 * 打开弹幕充能页面
 */
const openDanmuPage = function () {
  if (window.electronAPI?.openDanmuPage) {
    window.electronAPI.openDanmuPage();
    return;
  }
  window.open(`${location.pathname}?danmu`, '_blank');
};

/** 打开或关闭给直播软件采集的绿幕信息窗口。 */
const toggleLiveOverlayWindow = async function () {
  if (window.electronAPI?.toggleLiveOverlayWindow) {
    liveOverlayOpen.value = await window.electronAPI.toggleLiveOverlayWindow();
    return;
  }
  window.open(`${location.pathname}?live-info`, '_blank');
  liveOverlayOpen.value = true;
};

function describeLiveConnectionError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || '未知错误');
  if (/get live info|fetch live info|failed to fetch|networkerror/i.test(message)) {
    return '无法读取直播间信息，请检查房间地址、网络或系统代理后重试';
  }
  if (/fetch webcast user/i.test(message)) {
    return '抖音连接初始化失败，请稍后重试';
  }
  if (/^(error|unknown error)$/i.test(message.trim())) {
    return '弹幕 WebSocket 连接失败，请检查网络或系统代理';
  }
  return message;
}

function isPermanentRoomConnectionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  const status = Number(message.match(/HTTP\s+(4\d\d)/i)?.[1]);
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

/**
 * 打开给主播和观众共同观看的弹幕互动页面
 */
const openDanmuDisplayPage = function () {
  window.open(`${location.pathname}?display`, '_blank');
};

/**
 * 选择历史记录
 */
const handleSelectHistory = function (value: string) {
  roomNum.value = value;
  connectLive();
};

/**
 * 删除历史记录
 */
const handleDeleteHistory = function (value: string) {
  roomHistory.value = removeHistory(value);
};

// 刷新后自动重连上次的房间
onMounted(() => {
  if (window.electronAPI?.getLiveOverlayWindowOpen) {
    void window.electronAPI.getLiveOverlayWindowOpen().then(open => { liveOverlayOpen.value = open; });
    stopLiveOverlayStateListener = window.electronAPI.onLiveOverlayWindowState?.(open => {
      liveOverlayOpen.value = open;
    }) || null;
  }
  const lastRoom = localStorage.getItem(LAST_ROOM_KEY);
  if (lastRoom) {
    roomNum.value = lastRoom;
    connectLive();
  }
});

onBeforeUnmount(() => {
  castWs?.dispose();
  castWs = void 0;
  relayWs?.dispose();
  relayWs = void 0;
  stopLiveOverlayStateListener?.();
  stopLiveOverlayStateListener = null;
});
</script>

<style lang="scss" scoped>
$bg: #f7f6f5;
$bd: #b2bfc3;
$theme: #68be8d;
$tool: #8b968d;
$gold: #e6b422;

.index-view {
  position: relative;
  background-color: $bg;
  display: flex;
  width: 100%;
  height: 100%;
  .view-left,
  .view-center,
  .view-right {
    display: flex;
    flex-direction: column;
    height: 100%;
    box-sizing: border-box;
    width: 0;
    flex-shrink: 0;
  }
  .view-left {
    flex-grow: 2.5;
    border-right: 1px solid $bd;
    justify-content: space-between;
  }
  .view-left-highlight {
    width: 100%;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    flex: 1;
    min-height: 0;
    .hr {
      height: 0;
      border: 0;
      border-top: 1px solid $bd;
      margin: 8px 12px;
    }
  }
  .view-left-bottom {
    width: 100%;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    padding: 12px 0;
    .hr {
      height: 0;
      border: 0;
      border-top: 1px solid $bd;
      margin: 5px 0;
    }
  }
  .view-left-tools {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    box-sizing: border-box;
    padding: 0 12px;
  }
  .view-left-tool {
    font-size: 21px;
    width: 1.2em;
    height: 1.2em;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: $tool;
    &.cm-btn {
      transition:
        color 0.2s ease-in-out,
        background-color 0.3s ease-in-out,
        opacity 0.2s ease;
      background-color: transparent;
      border-radius: 0.4em;
      &:hover {
        color: #fff;
        background-color: $theme;
      }
      &:active {
        opacity: 0.8;
      }
    }
    &.feed-btn {
      animation: coinAni 1s ease-in-out;
      transition: color 0.2s ease-in-out;
      &:hover {
        color: $gold;
      }
      &:active {
        animation: none;
      }
    }
    .icon {
      font-size: 1em;
    }
    .danmu-icon {
      font-size: 0.9em;
      line-height: 1;
    }
    .display-page-icon {
      font-size: 0.76em;
      line-height: 1;
      filter: saturate(0.8);
    }
    .live-overlay-icon {
      font-size: 0.72em;
      line-height: 1;
    }
    .repo-tool-icon {
      font: 800 0.52em/1 Consolas, monospace;
      letter-spacing: -1px;
    }
    &.live-overlay-btn.active {
      color: #fff;
      background-color: $theme;
    }
  }
  .view-center {
    flex-grow: 4.5;
    padding: 18px 12px;
  }
  .view-right {
    flex-grow: 3;
    border-left: 1px solid $bd;
    padding: 18px 12px;
    gap: 12px;
  }
  .view-input {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .view-other {
    display: flex;
    width: 100%;
    height: 0;
    flex-grow: 1;
    box-sizing: border-box;
  }
}

@media (max-width: 768px) {
  .index-view {
    flex-direction: column;
    height: auto;
    .view-left,
    .view-center,
    .view-right {
      width: 100%;
      flex-grow: 0;
      border: none;
    }
    .view-left {
      margin-top: 250px;
      justify-content: flex-start;
    }
    .view-center {
      height: 100vh;
    }
    .view-right {
      height: 80vh;
    }
    .view-input {
      position: absolute;
      top: 0;
      left: 0;
      box-sizing: border-box;
      padding: 18px 12px;
    }
    .view-left-bottom {
      position: absolute;
      top: 150px;
      left: 0;
    }
  }
}

@keyframes coinAni {
  0% {
    color: $gold;
    transform: translateY(0%);
  }
  50% {
    color: $gold;
    transform: translateY(-120%) rotateY(360deg) scale(1.2);
  }
  100% {
    color: $gold;
    transform: translateY(0%);
  }
}
</style>
