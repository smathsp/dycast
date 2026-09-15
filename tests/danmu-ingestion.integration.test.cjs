const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); }
  };
}

class TestBroadcastChannel {
  onmessage = null;
  postMessage() {}
}

test('Electron ingests each comment in one owner and display-only windows never run lottery logic', async () => {
  const originalGlobals = {
    window: globalThis.window,
    localStorage: globalThis.localStorage,
    indexedDB: globalThis.indexedDB,
    BroadcastChannel: globalThis.BroadcastChannel
  };
  let incomingHandler = null;
  let sessionBindHandler = null;
  let stateResetHandler = null;
  let forwarded = null;
  let resetStateRequests = 0;
  let remainingWinnerCount = 9;
  const electronAPI = {
    sendDanmu(danmu) { forwarded = danmu; },
    resetDanmuSession() {},
    requestDanmuStateReset() {
      resetStateRequests += 1;
      return Promise.resolve(true);
    },
    restoreRemainingWinnerCount(value) {
      const restored = Math.min(9999 - remainingWinnerCount, Math.max(0, Math.round(Number(value) || 0)));
      remainingWinnerCount += restored;
      return { restored, remainingWinnerCount, settings: { remainingWinnerCount } };
    },
    onDanmu(handler) {
      incomingHandler = handler;
      return () => { incomingHandler = null; };
    },
    onDanmuSessionReset() { return () => {}; },
    onDanmuSessionBind(handler) {
      sessionBindHandler = handler;
      return () => { sessionBindHandler = null; };
    },
    onDanmuStateReset(handler) {
      stateResetHandler = handler;
      return () => { stateResetHandler = null; };
    },
    requestBuffer() {}
  };
  const memoryStorage = createMemoryStorage();
  const ownerPendingBatch = JSON.stringify([{
    id: 'owner-pending',
    winRecordId: 'owner-pending-win',
    nickname: '正在揭晓的观众',
    content: '不能被侧边栏清掉'
  }]);
  memoryStorage.setItem('dycast_danmu_pending_lottery', ownerPendingBatch);
  memoryStorage.setItem('dycast_danmu_state', JSON.stringify({
    totalDanmuCount: 10,
    energy: 10,
    lotteryCount: 1,
    liveSessionId: 'live-1'
  }));
  memoryStorage.setItem('dycast_settings', JSON.stringify({ remainingWinnerCount }));
  globalThis.localStorage = memoryStorage;
  globalThis.window = {
    electronAPI,
    addEventListener() {},
    removeEventListener() {},
    setTimeout,
    clearTimeout
  };
  globalThis.indexedDB = { open() { throw new Error('IndexedDB is disabled in this test'); } };
  globalThis.BroadcastChannel = TestBroadcastChannel;

  let server;
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
    const state = store.useDanmuState();
    const sourceMessage = {
      id: 'source-1',
      secUid: 'source-user',
      avatar: '',
      nickname: '消息源',
      content: '只转发一次',
      timestamp: 1,
      liveSessionId: 'live-1',
      liveSessionCount: 1
    };
    store.pushDanmu(sourceMessage);
    assert.equal(forwarded, sourceMessage);
    assert.equal(state.totalPoolCount, 0, '主页不应本地累计后再交给展示窗口累计');

    state.isCollecting = true;
    store.startListening({ displayOnly: true });
    assert.equal(typeof incomingHandler, 'function');
    assert.equal(typeof sessionBindHandler, 'function');
    sessionBindHandler('live-1');
    for (let index = 1; index <= 10; index += 1) {
      incomingHandler({
        ...sourceMessage,
        id: `display-${index}`,
        liveSessionCount: index,
        timestamp: index
      });
    }
    assert.equal(state.totalPoolCount, 10);
    assert.equal(state.totalDanmuCount, 10, '展示窗口不得改写抽奖所有者恢复的充能快照');
    assert.equal(state.lotteryPool.length, 0);
    assert.equal(state.isLotteryActive, true, '同一会话回放不得清掉崩溃前已锁定的批次');
    assert.equal(
      memoryStorage.getItem('dycast_danmu_pending_lottery'),
      ownerPendingBatch,
      'display-only window must not overwrite the lottery owner pending batch'
    );
    store.stopListening();

    store.startListening();
    sessionBindHandler('live-1');
    const recoveredBatch = store.prepareLotteryBatch(1);
    assert.equal(recoveredBatch[0]?.winRecordId, 'owner-pending-win');

    store.resetDanmuState();
    await Promise.resolve();
    assert.equal(resetStateRequests, 1, '主窗口重置必须请求唯一状态所有者执行');
    assert.equal(typeof stateResetHandler, 'function');
    stateResetHandler();
    assert.equal(state.isCollecting, false);
    assert.equal(state.totalDanmuCount, 0);
    assert.equal(state.energy, 0);
    assert.equal(state.lotteryPool.length, 0);
    assert.equal(state.isLotteryActive, false);
    assert.equal(remainingWinnerCount, 10, '取消未揭晓批次应返还预留名额');
    store.stopListening();
  } finally {
    await server?.close();
    globalThis.window = originalGlobals.window;
    globalThis.localStorage = originalGlobals.localStorage;
    globalThis.indexedDB = originalGlobals.indexedDB;
    globalThis.BroadcastChannel = originalGlobals.BroadcastChannel;
  }
});

test('a late-open owner keeps charging when its first buffered session message arrives', async () => {
  const originalGlobals = {
    window: globalThis.window,
    localStorage: globalThis.localStorage,
    indexedDB: globalThis.indexedDB,
    BroadcastChannel: globalThis.BroadcastChannel
  };
  let incomingHandler = null;
  const settingsListeners = [];
  const persistedSections = [];
  let resolveDanmuSettingsSave = null;
  const memoryStorage = createMemoryStorage();
  globalThis.localStorage = memoryStorage;
  globalThis.window = {
    electronAPI: {
      sendDanmu() {},
      resetDanmuSession() {},
      onDanmu(handler) {
        incomingHandler = handler;
        return () => { incomingHandler = null; };
      },
      onDanmuSessionReset() { return () => {}; },
      onDanmuSessionBind() { return () => {}; },
      onDanmuStateReset() { return () => {}; },
      onPersistentSettingsSectionUpdated(callback) {
        settingsListeners.push(callback);
        return () => {};
      },
      savePersistentSettingsSection(section, value) {
        persistedSections.push({ section, value });
        if (section !== 'danmu') return Promise.resolve({ section, value });
        return new Promise(resolve => { resolveDanmuSettingsSave = () => resolve({ section, value }); });
      },
      requestBuffer() {}
    },
    addEventListener() {},
    removeEventListener() {},
    setTimeout,
    clearTimeout
  };
  globalThis.indexedDB = { open() { throw new Error('IndexedDB is disabled in this test'); } };
  globalThis.BroadcastChannel = TestBroadcastChannel;

  let server;
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

    const store = await server.ssrLoadModule('/src/danmu/store.ts?late-open-owner');
    const state = store.useDanmuState();
    store.startListening();
    store.startCollecting();
    incomingHandler({
      id: 'first-after-late-open',
      secUid: 'late-user',
      avatar: '',
      nickname: '晚开窗口观众',
      content: '第一条也必须计入',
      timestamp: 1,
      liveSessionId: 'current-live-session',
      liveSessionCount: 1
    });

    assert.equal(state.isCollecting, true, '首次绑定当前会话不能停止刚开始的充能');
    assert.equal(state.totalDanmuCount, 1);
    assert.equal(state.energy, 1);
    assert.equal(state.lotteryPool.length, 1);

    store.updateSettings({ fontSize: 20 });
    await new Promise(resolve => setImmediate(resolve));
    const danmuSave = persistedSections.find(item => item.section === 'danmu');
    assert.deepEqual(danmuSave?.value, { fontSize: 20 }, '弹幕设置必须只提交真正修改的字段');

    settingsListeners.forEach(listener => listener('danmu', {
      lotteryThreshold: 200,
      lotteryWinnerCount: 1,
      lotteryKeyword: '',
      lotteryUserCooldownEnabled: false,
      redDanmuNicknameKeywords: '',
      fontSize: 15,
      speedBase: 12,
      speedRange: 3
    }));
    assert.equal(store.settings.lotteryThreshold, 200, '应应用其它窗口的权威字段');
    assert.equal(store.settings.fontSize, 20, '未落盘的本窗口字段不能被旧广播回滚');
    assert.equal(typeof resolveDanmuSettingsSave, 'function');
    resolveDanmuSettingsSave();
    await new Promise(resolve => setImmediate(resolve));
    store.resetDanmuState();
    store.stopListening();
  } finally {
    await server?.close();
    globalThis.window = originalGlobals.window;
    globalThis.localStorage = originalGlobals.localStorage;
    globalThis.indexedDB = originalGlobals.indexedDB;
    globalThis.BroadcastChannel = originalGlobals.BroadcastChannel;
  }
});
