const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const view = fs.readFileSync(path.resolve(__dirname, '../src/views/DanmuView.vue'), 'utf8');
const script = view.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'DanmuView must have a TypeScript script setup block');

// Execute the component's own logic, without mounting unrelated child components.
// The only source transformation is exposing the private functions to this test VM.
const exposed = `${script}\n(globalThis as any).__danmuTest = {
  syncMousePassthrough,
  syncMousePassthroughFromCursor,
  startCursorPolling,
  stopCursorPolling,
  handleCloseWindow,
  showHistory,
  PASSTHROUGH_MIN_GAP_MS
};`;
const compiled = ts.transpileModule(exposed, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

function createClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  const schedule = (kind, fn, delay) => {
    const id = nextId++;
    const duration = Math.max(1, Number(delay) || 0);
    timers.set(id, { kind, fn, duration, due: now + duration });
    return id;
  };
  return {
    get now() { return now; },
    setTimeout: (fn, delay) => schedule('timeout', fn, delay),
    clearTimeout: id => timers.delete(id),
    setInterval: (fn, delay) => schedule('interval', fn, delay),
    clearInterval: id => timers.delete(id),
    timeoutCount: () => [...timers.values()].filter(timer => timer.kind === 'timeout').length,
    intervalCount: () => [...timers.values()].filter(timer => timer.kind === 'interval').length,
    // Cursor polling is deliberately not fired here: each test controls IPC replies.
    advanceTimeouts(ms) {
      const end = now + ms;
      let steps = 0;
      while (true) {
        const due = [...timers.entries()]
          .filter(([, timer]) => timer.kind === 'timeout' && timer.due <= end)
          .sort((a, b) => a[1].due - b[1].due)[0];
        if (!due) break;
        if (++steps > 100) throw new Error('passthrough timer did not settle');
        const [id, timer] = due;
        now = timer.due;
        timers.delete(id);
        timer.fn();
      }
      now = end;
    }
  };
}

function createHarness() {
  const clock = createClock();
  const calls = [];
  const watchers = [];
  const mounted = [];
  const unmounted = [];
  const state = {
    isDisplaying: true,
    isLotteryActive: false,
    isCollecting: false,
    activeDanmu: [],
    lotteryHistory: [],
    lotteryCount: 0
  };
  class FakeElement {
    constructor(interactive) { this.interactive = interactive; }
    closest() { return this.interactive ? this : null; }
  }
  const interactive = new FakeElement(true);
  const decoration = new FakeElement(false);
  const document = {
    hidden: false,
    elementFromPoint: () => decoration,
    addEventListener() {},
    removeEventListener() {}
  };
  let getCursorPosition = () => Promise.resolve({ inside: true, x: 1, y: 1 });
  let cursorQueryCount = 0;
  const electronAPI = {
    setDanmuMousePassthrough: ignore => calls.push(ignore),
    getDanmuCursorPosition: () => {
      cursorQueryCount++;
      return getCursorPosition();
    },
    setLotteryOverlayActive() {},
    closeDanmuPage() {}
  };
  const readWatch = source => typeof source === 'function' ? source() : source.value;
  const watch = (source, callback, options = {}) => {
    const watcher = { source, callback, previous: readWatch(source) };
    watchers.push(watcher);
    if (options.immediate) callback(watcher.previous, undefined);
  };
  const vue = {
    ref: value => ({ value }),
    computed: getter => ({ get value() { return getter(); } }),
    watch,
    onMounted: callback => mounted.push(callback),
    onUnmounted: callback => unmounted.push(callback)
  };
  const store = {
    useDanmuState: () => state,
    canStartLottery: () => true,
    startListening() {}, stopListening() {}, startCollecting() {},
    stopCollecting() {}, stopDisplaying() {}, startLottery() {},
    clearLotteryHistory() {}, deleteLotteryItems() {}
  };
  const clockDate = class extends Date { static now() { return clock.now; } };
  const context = {
    exports: {},
    require(id) {
      if (id === 'vue') return vue;
      if (id === '@/danmu/store') return store;
      if (id === '@/danmu/audio') return { playCharging() {}, stopAll() {} };
      if (id === '@/utils/settingUtil') return { useSettings: () => ({ value: { commentHighlightDuration: 10 } }) };
      if (id === '@/danmu/lottery') return { getCurrentAnchorBadgeLevel: () => 1 };
      return {};
    },
    URLSearchParams,
    location: { search: '' },
    window: {
      electronAPI,
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout
    },
    document,
    Element: FakeElement,
    Date: clockDate,
    performance: { now: () => clock.now },
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
    console
  };
  vm.runInNewContext(compiled, context, { filename: 'DanmuView.script-setup.js' });
  const internals = context.__danmuTest;
  assert.ok(internals, 'test functions should be exposed from script setup');
  // The immediate lottery watcher enables passthrough and starts polling.
  assert.equal(calls.at(-1), true);
  calls.length = 0;
  return {
    clock, calls, state, document, interactive, decoration, internals,
    get cursorQueryCount() { return cursorQueryCount; },
    setCursorQuery(fn) { getCursorPosition = fn; },
    flushWatchers() {
      for (let pass = 0; pass < 3; pass++) {
        let changed = false;
        for (const watcher of watchers) {
          const value = readWatch(watcher.source);
          if (value === watcher.previous) continue;
          const previous = watcher.previous;
          watcher.previous = value;
          watcher.callback(value, previous);
          changed = true;
        }
        if (!changed) return;
      }
    },
    unmount() { unmounted.forEach(callback => callback()); }
  };
}

test('interactive mouse target disables passthrough synchronously and cancels pending decoration enable', () => {
  const h = createHarness();
  h.internals.syncMousePassthrough({ target: h.interactive });
  assert.deepEqual(h.calls, [false], 'the interactive target must not wait for a timer');

  h.internals.syncMousePassthrough({ target: h.decoration });
  assert.deepEqual(h.calls, [false], 'returning to decoration may be deferred');
  h.internals.syncMousePassthrough({ target: h.interactive });
  assert.equal(h.clock.timeoutCount(), 0, 're-entering controls cancels pending enable');
  h.clock.advanceTimeouts(h.internals.PASSTHROUGH_MIN_GAP_MS + 1);
  assert.deepEqual(h.calls, [false], 'a stale enable must not run after re-entering controls');
});

test('repeated decoration mouse moves coalesce into one passthrough enable', () => {
  const h = createHarness();
  h.internals.syncMousePassthrough({ target: h.interactive });
  h.calls.length = 0;

  for (let index = 0; index < 20; index++) {
    h.internals.syncMousePassthrough({ target: h.decoration });
  }
  assert.deepEqual(h.calls, [], 'enabling passthrough is not immediate after controls');
  assert.ok(h.clock.timeoutCount() <= 1, 'rapid moves should share one pending timer');
  h.clock.advanceTimeouts(h.internals.PASSTHROUGH_MIN_GAP_MS - 1);
  assert.deepEqual(h.calls, [], 'minimum gap should suppress a premature enable');
  h.clock.advanceTimeouts(1);
  assert.deepEqual(h.calls, [true], 'the merged request should change Electron state once');
});

for (const transition of ['lottery', 'history', 'close', 'stop display', 'stop polling', 'unmount']) {
  test(`late cursor query cannot override immediate ${transition} state`, async () => {
    const h = createHarness();
    const query = deferred();
    h.setCursorQuery(() => query.promise);
    const pending = h.internals.syncMousePassthroughFromCursor();
    assert.equal(h.cursorQueryCount, 1, 'the cursor IPC query must be in flight');

    // Query began while the renderer could pass mouse input through.
    if (transition === 'lottery') {
      h.state.isLotteryActive = true;
      h.flushWatchers();
    } else if (transition === 'history') {
      h.internals.showHistory.value = true;
      h.flushWatchers();
    } else if (transition === 'close') {
      h.internals.handleCloseWindow();
    } else if (transition === 'stop display') {
      h.state.isDisplaying = false;
      h.flushWatchers();
    } else if (transition === 'stop polling') {
      h.internals.syncMousePassthrough({ target: h.interactive });
      h.internals.stopCursorPolling();
    } else {
      h.unmount();
    }
    assert.equal(h.calls.at(-1), false, `${transition} must disable passthrough before IPC resolves`);
    const callCount = h.calls.length;

    query.resolve({ inside: false, x: 1, y: 1 });
    await pending;
    h.clock.advanceTimeouts(h.internals.PASSTHROUGH_MIN_GAP_MS + 1);
    assert.equal(h.calls.length, callCount, `stale query must not change state after ${transition}`);
    assert.equal(h.calls.at(-1), false);
  });
}

test('old polling generation cannot override a newer generation after restart', async () => {
  const h = createHarness();
  const query = deferred();
  h.setCursorQuery(() => query.promise);
  const pending = h.internals.syncMousePassthroughFromCursor();
  assert.equal(h.cursorQueryCount, 1);

  h.internals.syncMousePassthrough({ target: h.interactive });
  h.internals.stopCursorPolling();
  h.internals.startCursorPolling();
  assert.equal(h.clock.intervalCount(), 1);
  assert.equal(h.calls.at(-1), false);
  const callCount = h.calls.length;

  query.resolve({ inside: false, x: 1, y: 1 });
  await pending;
  h.clock.advanceTimeouts(h.internals.PASSTHROUGH_MIN_GAP_MS + 1);
  assert.equal(h.calls.length, callCount, 'old cursor result must not apply in a new polling generation');
  assert.equal(h.calls.at(-1), false);
});

for (const transition of ['close', 'stop polling']) {
  test(`already queued polling callback does not query cursor after ${transition}`, async () => {
    const h = createHarness();
    if (transition === 'close') {
      h.internals.handleCloseWindow();
    } else {
      h.internals.syncMousePassthrough({ target: h.interactive });
      h.internals.stopCursorPolling();
    }
    assert.equal(h.clock.intervalCount(), 0);
    assert.equal(h.calls.at(-1), false);

    // Models an interval callback queued before clearInterval, then invoked late.
    await h.internals.syncMousePassthroughFromCursor();
    assert.equal(h.cursorQueryCount, 0, 'a stopped poll must not start a new IPC request');
    assert.equal(h.calls.at(-1), false);
  });
}
