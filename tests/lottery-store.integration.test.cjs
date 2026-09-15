const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
    clear() { values.clear(); }
  };
}

class TestBroadcastChannel {
  onmessage = null;
  postMessage() {}
  close() {}
}

test('the tenth eligible comment auto-locks a batch and a previous winner can win a later round', async () => {
  const originalGlobals = {
    window: globalThis.window,
    localStorage: globalThis.localStorage,
    indexedDB: globalThis.indexedDB,
    BroadcastChannel: globalThis.BroadcastChannel
  };
  const originalWarn = console.warn;
  const memoryStorage = createMemoryStorage();
  globalThis.localStorage = memoryStorage;
  globalThis.window = {
    electronAPI: undefined,
    addEventListener() {},
    removeEventListener() {},
    setTimeout,
    clearTimeout
  };
  globalThis.indexedDB = { open() { throw new Error('IndexedDB is disabled in this test'); } };
  globalThis.BroadcastChannel = TestBroadcastChannel;
  console.warn = (message, ...details) => {
    if (String(message).startsWith('[store] 完整') && String(message).includes('缓存加载失败')) return;
    originalWarn(message, ...details);
  };

  let server;
  let appSettings;
  try {
    const [{ createServer }, { default: vue }] = await Promise.all([
      import('vite'),
      import('@vitejs/plugin-vue')
    ]);
    server = await createServer({
      configFile: false,
      appType: 'custom',
      logLevel: 'silent',
      plugins: [vue()],
      resolve: { alias: { '@': path.resolve(__dirname, '../src') } },
      server: { middlewareMode: true }
    });

    const store = await server.ssrLoadModule('/src/danmu/store.ts');
    appSettings = await server.ssrLoadModule('/src/utils/settingUtil.ts');
    appSettings.useSettings().value.remainingWinnerCount = 2;
    appSettings.useSettings().value.lotteryBadgeLevel = 0;
    store.updateSettings({
      lotteryThreshold: 10,
      lotteryWinnerCount: 1,
      lotteryKeyword: '',
      lotteryUserCooldownEnabled: false
    });

    const state = store.useDanmuState();
    store.beginLiveSession('room-a');
    store.startCollecting();
    for (let index = 1; index <= 5; index++) {
      store.pushDanmu({
        id: `room-a-${index}`,
        secUid: `room-a-user-${index}`,
        avatar: '',
        nickname: `旧房间观众${index}`,
        content: '参与旧房间抽奖',
        timestamp: index,
        liveSessionId: 'room-a',
        liveSessionCount: index
      });
    }
    assert.equal(state.totalDanmuCount, 5);
    assert.equal(state.energy, 5);
    assert.equal(state.lotteryPool.length, 5);

    let sessionResetSignals = 0;
    const stopSessionResetSubscription = store.subscribeDisplayDanmu(danmu => {
      if (danmu === null) sessionResetSignals += 1;
    });
    store.beginLiveSession('room-b');
    assert.equal(sessionResetSignals, 1, '切换会话须通知飘屏清除已飞出的旧弹幕');
    stopSessionResetSubscription();
    assert.equal(state.isCollecting, false, '切换直播间必须停止上一轮充能');
    assert.equal(state.totalDanmuCount, 0);
    assert.equal(state.energy, 0);
    assert.equal(state.lotteryPool.length, 0, '新房间不得继承旧房间奖池');
    assert.equal(state.activeDanmu.length, 0);
    assert.equal(state.displayDanmu.length, 0);

    store.startCollecting();
    store.pushDanmu({
      id: 'late-room-a-message',
      secUid: 'late-room-a-user',
      avatar: '',
      nickname: '旧连接迟到消息',
      content: '不应进入新房间',
      timestamp: 99,
      liveSessionId: 'room-a',
      liveSessionCount: 6
    });
    assert.equal(state.totalDanmuCount, 0, '旧会话迟到消息不得让状态切回旧房间');
    assert.equal(state.lotteryPool.length, 0);
    store.stopCollecting();

    store.updateSettings({ lotteryWinnerCount: 2 });
    let canonicalRemainingWinnerCount = 1;
    globalThis.window.electronAPI = {
      consumeRemainingWinnerCount(requested) {
        const consumed = Math.min(canonicalRemainingWinnerCount, requested);
        canonicalRemainingWinnerCount -= consumed;
        return {
          consumed,
          remainingWinnerCount: canonicalRemainingWinnerCount,
          settings: { remainingWinnerCount: canonicalRemainingWinnerCount }
        };
      },
      restoreRemainingWinnerCount(requested) {
        const restored = Math.min(9999 - canonicalRemainingWinnerCount, requested);
        canonicalRemainingWinnerCount += restored;
        return {
          restored,
          remainingWinnerCount: canonicalRemainingWinnerCount,
          settings: { remainingWinnerCount: canonicalRemainingWinnerCount }
        };
      }
    };
    store.startCollecting();
    for (let index = 1; index <= 10; index++) {
      store.pushDanmu({
        id: `cancelled-${index}`,
        secUid: `cancelled-user-${index}`,
        avatar: '',
        nickname: `待取消观众${index}`,
        content: '切房前待揭晓',
        timestamp: 50_000 + index
      });
    }
    const cancelledBatch = store.prepareLotteryBatch(1);
    assert.equal(cancelledBatch.length, 1);
    assert.equal(canonicalRemainingWinnerCount, 0, '批次人数必须服从主进程实际预留结果');

    store.beginLiveSession('room-c');
    assert.equal(state.isLotteryActive, false);
    assert.equal(canonicalRemainingWinnerCount, 1, '切房应返还尚未揭晓的名额');
    store.revealLotteryWinner(cancelledBatch[0]);
    assert.equal(state.lotteryHistory.length, 0, '旧动画迟到回调不得写回已取消的中奖者');
    globalThis.window.electronAPI = undefined;
    appSettings.useSettings().value.remainingWinnerCount = 2;
    store.updateSettings({ lotteryWinnerCount: 1 });

    const pushRound = (round) => {
      store.startCollecting();
      for (let index = 1; index <= 10; index++) {
        store.pushDanmu({
          id: `round-${round}-${index}`,
          secUid: 'repeat-viewer',
          avatar: '',
          nickname: '可重复中奖观众',
          content: '参与抽奖',
          timestamp: round * 100_000 + index
        });
        if (index === 9) assert.equal(state.isLotteryActive, false);
      }
      assert.equal(state.isLotteryActive, true);
      assert.equal(state.activeDanmu.length, 10, '开奖时不得清空已经在飘动的弹幕');
      store.pushDanmu({
        id: `round-${round}-during-lottery`,
        secUid: `during-lottery-user-${round}`,
        avatar: '',
        nickname: '开奖期间新观众',
        content: '中奖展示时也要继续飘动',
        timestamp: round * 100_000 + 11
      });
      assert.equal(state.activeDanmu.length, 11, '中奖展示期间的新弹幕仍应进入飘屏');
      const batch = store.prepareLotteryBatch(1);
      assert.equal(batch.length, 1);
      store.revealLotteryWinner(batch[0]);
      store.closeLottery();
      assert.equal(state.activeDanmu.length, 11, '关闭中奖展示后不得清空仍在飞行的弹幕');
      store.stopCollecting();
    };

    pushRound(1);
    assert.equal(state.lotteryCount, 1);
    assert.equal(appSettings.useSettings().value.remainingWinnerCount, 1);

    store.beginLiveSession('room-d');
    assert.equal(state.lotteryHistory.length, 1, '切换直播间应保留已经揭晓的中奖历史');
    assert.equal(state.lotteryCount, 1);
    assert.equal(appSettings.useSettings().value.remainingWinnerCount, 1);

    pushRound(2);
    assert.equal(state.lotteryCount, 2);
    assert.equal(state.lotteryHistory.length, 2);
    assert.equal(appSettings.useSettings().value.remainingWinnerCount, 0);
  } finally {
    await Promise.resolve();
    appSettings?.flushSettings();
    await server?.close();
    globalThis.window = originalGlobals.window;
    globalThis.localStorage = originalGlobals.localStorage;
    globalThis.indexedDB = originalGlobals.indexedDB;
    globalThis.BroadcastChannel = originalGlobals.BroadcastChannel;
    console.warn = originalWarn;
  }
});
