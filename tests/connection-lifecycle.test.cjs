const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

class TestEmitter {
  constructor() {
    this.listeners = new Map();
  }

  on(event, listener) {
    let listeners = this.listeners.get(event);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(event, listeners);
    }
    listeners.add(listener);
  }

  off(event, listener) {
    this.listeners.get(event)?.delete(listener);
  }

  once(event, listener) {
    const wrapped = (...args) => {
      this.off(event, wrapped);
      listener(...args);
    };
    this.on(event, wrapped);
  }

  emit(event, ...args) {
    for (const listener of [...(this.listeners.get(event) || [])]) listener(...args);
  }

  clear() {
    this.listeners.clear();
  }
}

class TestHttpRequestError extends Error {
  constructor(status) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

class ManualClock {
  constructor() {
    this.nextId = 1;
    this.timeouts = new Map();
    this.intervals = new Map();
  }

  setTimeout(callback, delay = 0) {
    const id = this.nextId++;
    this.timeouts.set(id, { id, callback, delay });
    return id;
  }

  clearTimeout(id) {
    this.timeouts.delete(id);
  }

  setInterval(callback, delay = 0) {
    const id = this.nextId++;
    this.intervals.set(id, { id, callback, delay });
    return id;
  }

  clearInterval(id) {
    this.intervals.delete(id);
  }

  firstTimeout() {
    return [...this.timeouts.values()].sort((a, b) => a.id - b.id)[0];
  }

  runTimeout(id) {
    const task = this.timeouts.get(id);
    if (!task) return false;
    this.timeouts.delete(id);
    task.callback();
    return true;
  }

  runAllTimeouts() {
    for (const task of [...this.timeouts.values()].sort((a, b) => a.id - b.id)) {
      this.runTimeout(task.id);
    }
  }

  runIntervalsOnce() {
    for (const task of [...this.intervals.values()]) task.callback();
  }
}

function createFakeWebSocketClass() {
  return class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    static instances = [];

    constructor(url) {
      this.url = String(url);
      this.readyState = FakeWebSocket.CONNECTING;
      this.binaryType = '';
      this.sent = [];
      this.closeCalls = [];
      this.listeners = new Map();
      FakeWebSocket.instances.push(this);
    }

    addEventListener(type, listener) {
      let listeners = this.listeners.get(type);
      if (!listeners) {
        listeners = new Set();
        this.listeners.set(type, listeners);
      }
      listeners.add(listener);
    }

    dispatch(type, event = {}) {
      const payload = { type, ...event };
      for (const listener of [...(this.listeners.get(type) || [])]) listener(payload);
    }

    open() {
      this.readyState = FakeWebSocket.OPEN;
      this.dispatch('open');
    }

    send(data) {
      if (this.readyState !== FakeWebSocket.OPEN) throw new Error('socket is not open');
      this.sent.push(data);
    }

    close(code = 1000, reason = '') {
      this.closeCalls.push({ code, reason });
      if (this.readyState === FakeWebSocket.CLOSED) return;
      this.readyState = FakeWebSocket.CLOSED;
      this.dispatch('close', { code, reason });
    }

    remoteClose(code = 1000, reason = '') {
      this.readyState = FakeWebSocket.CLOSED;
      this.dispatch('close', { code, reason });
    }

    message(data = new ArrayBuffer(0)) {
      this.dispatch('message', { data });
    }

    error(type = 'error') {
      this.dispatch('error', { type });
    }
  };
}

function compileTypescriptModule(filePath, dependencies, globals) {
  const source = fs.readFileSync(filePath, 'utf8');
  const output = ts.transpileModule(source, {
    fileName: filePath,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true
    }
  }).outputText;
  const module = { exports: {} };
  const context = vm.createContext({
    ...globals,
    module,
    exports: module.exports,
    require(specifier) {
      if (Object.prototype.hasOwnProperty.call(dependencies, specifier)) {
        return dependencies[specifier];
      }
      throw new Error(`Unexpected dependency in ${path.basename(filePath)}: ${specifier}`);
    }
  });
  new vm.Script(output, { filename: filePath }).runInContext(context);
  return module.exports;
}

function createHarness() {
  const clock = new ManualClock();
  const FakeWebSocket = createFakeWebSocketClass();
  const silentLog = { info() {}, warn() {}, error() {}, log() {} };
  const globals = {
    AbortController,
    ArrayBuffer,
    clearInterval: clock.clearInterval.bind(clock),
    clearTimeout: clock.clearTimeout.bind(clock),
    console,
    Date,
    DOMException,
    Error,
    location: { origin: 'http://127.0.0.1:15173' },
    Math,
    Promise,
    setInterval: clock.setInterval.bind(clock),
    setTimeout: clock.setTimeout.bind(clock),
    Uint8Array,
    URLSearchParams,
    WebSocket: FakeWebSocket,
    window: {
      setTimeout: clock.setTimeout.bind(clock),
      clearTimeout: clock.clearTimeout.bind(clock)
    }
  };
  const sharedDependencies = {
    '@/utils/logUtil': { CLog: silentLog },
    './emitter': { Emitter: TestEmitter }
  };
  const dycastPath = path.resolve(__dirname, '../src/core/dycast.ts');
  const relayPath = path.resolve(__dirname, '../src/core/relay.ts');
  const modelStub = {
    decodeChatMessage() {},
    decodeControlMessage() {},
    decodeEmojiChatMessage() {},
    decodeFansclubMessage() {},
    decodeGiftMessage() {},
    decodeLikeMessage() {},
    decodeMemberMessage() {},
    decodePushFrame() {},
    decodeResponse() {},
    decodeRoomRankMessage() {},
    decodeRoomStatsMessage() {},
    decodeRoomUserSeqMessage() {},
    decodeSocialMessage() {},
    encodePushFrame() { return new Uint8Array([1]); }
  };
  const dycast = compileTypescriptModule(dycastPath, {
    ...sharedDependencies,
    './framePayloadLimit': {
      MAX_DECODED_PAYLOAD_BYTES: 8 * 1024 * 1024,
      MAX_WEBSOCKET_FRAME_BYTES: 4 * 1024 * 1024,
      assertFramePayloadSize(value, maximumBytes, kind) {
        if (value.byteLength <= maximumBytes) return;
        const error = new Error(`${kind} is too large`);
        error.code = 'FRAME_PAYLOAD_TOO_LARGE';
        throw error;
      },
      inflateGzipBounded(value) { return value; },
      isFramePayloadLimitError(error) { return error?.code === 'FRAME_PAYLOAD_TOO_LARGE'; }
    },
    './model': modelStub,
    './request': {
      fetchUser: async () => {},
      getImInfo: async () => ({}),
      getLiveInfo: async () => ({}),
      HttpRequestError: TestHttpRequestError
    },
    './signature': { getSignature: () => 'signature' },
    './wsEndpoint': {
      DYCAST_WS_HOST_PARAM: '__dycast_ws_host',
      getDouyinPushServerHost: () => ''
    },
    './util': {
      makeUrlParams(options) {
        return Object.entries(options)
          .filter(([, value]) => value !== undefined && value !== null)
          .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
          .join('&');
      }
    }
  }, globals);
  const relay = compileTypescriptModule(relayPath, sharedDependencies, globals);
  return { ...dycast, ...relay, clock, FakeWebSocket, HttpRequestError: TestHttpRequestError };
}

const baseSocketOptions = {
  room_id: 'room-id',
  user_unique_id: 'viewer-id',
  cursor: 'cursor-initial',
  internal_ext: 'ext-initial',
  signature: 'signature'
};

async function createConnectedDyCast(harness, options = baseSocketOptions) {
  const cast = new harness.DyCast('732146168843');
  cast.fetchConnectInfo = async () => {};
  cast.getWssParam = () => ({ ...options });
  cast.isLiving = () => true;
  await cast.connect();
  assert.equal(harness.FakeWebSocket.instances.length, 1);
  return cast;
}

async function flushMicrotasks() {
  for (let index = 0; index < 4; index++) await Promise.resolve();
}

test('manual disconnect while room lookup is pending aborts lookup and never creates a WebSocket', async () => {
  const harness = createHarness();
  const cast = new harness.DyCast('732146168843');
  let finishLookup;
  let lookupSignal;
  cast.fetchConnectInfo = (_room, signal) => {
    lookupSignal = signal;
    return new Promise(resolve => { finishLookup = resolve; });
  };
  cast.getWssParam = () => ({ ...baseSocketOptions });
  cast.isLiving = () => true;

  const connecting = cast.connect();
  assert.equal(lookupSignal.aborted, false);
  cast.close(1000, 'manual stop');
  assert.equal(lookupSignal.aborted, true);
  finishLookup();
  await connecting;

  assert.equal(harness.FakeWebSocket.instances.length, 0);
  assert.equal(harness.clock.timeouts.size, 0);
});

test('a transient first room lookup failure retries and still emits the initial open event', async () => {
  const harness = createHarness();
  const cast = new harness.DyCast('732146168843');
  let lookupAttempts = 0;
  const events = { open: 0, reconnect: 0, reconnecting: 0, close: 0 };
  for (const event of Object.keys(events)) cast.on(event, () => { events[event] += 1; });
  cast.fetchConnectInfo = async () => {
    lookupAttempts += 1;
    if (lookupAttempts === 1) throw new Error('temporary network failure');
  };
  cast.getWssParam = () => ({ ...baseSocketOptions });
  cast.isLiving = () => true;

  await cast.connect();
  assert.equal(lookupAttempts, 1);
  assert.equal(harness.FakeWebSocket.instances.length, 0);
  assert.equal(harness.clock.timeouts.size, 1);
  assert.deepEqual(events, { open: 0, reconnect: 0, reconnecting: 1, close: 0 });

  harness.clock.runTimeout(harness.clock.firstTimeout().id);
  await flushMicrotasks();
  assert.equal(lookupAttempts, 2);
  assert.equal(harness.FakeWebSocket.instances.length, 1);
  harness.FakeWebSocket.instances[0].open();
  assert.deepEqual(events, { open: 1, reconnect: 0, reconnecting: 1, close: 0 });
  cast.dispose();
});

for (const status of [400, 403, 404]) {
  test(`a permanent HTTP ${status} room lookup failure stops without retrying`, async () => {
    const harness = createHarness();
    const cast = new harness.DyCast('732146168843');
    const errors = [];
    const closes = [];
    cast.on('error', error => errors.push(error));
    cast.on('close', (code, reason) => closes.push({ code, reason }));
    cast.fetchConnectInfo = async () => { throw new harness.HttpRequestError(status); };

    await cast.connect();
    assert.equal(harness.clock.timeouts.size, 0);
    assert.equal(harness.FakeWebSocket.instances.length, 0);
    assert.equal(closes.length, 1);
    assert.match(String(closes[0].reason), new RegExp(`HTTP ${status}`));
    assert.match(String(errors[0]?.message), new RegExp(`HTTP ${status}`));
    if (status === 400 || status === 404) {
      assert.match(String(errors[0]?.message), /请检查房间号/);
    }
  });
}

for (const status of [408, 429, 503]) {
  test(`HTTP ${status} during first room lookup remains recoverable`, async () => {
    const harness = createHarness();
    const cast = new harness.DyCast('732146168843');
    let attempts = 0;
    cast.fetchConnectInfo = async () => {
      attempts += 1;
      if (attempts === 1) throw new harness.HttpRequestError(status);
    };
    cast.getWssParam = () => ({ ...baseSocketOptions });
    cast.isLiving = () => true;

    await cast.connect();
    assert.equal(harness.clock.timeouts.size, 1);
    harness.clock.runTimeout(harness.clock.firstTimeout().id);
    await flushMicrotasks();
    assert.equal(attempts, 2);
    assert.equal(harness.FakeWebSocket.instances.length, 1);
    cast.dispose();
  });
}

test('a permanent HTTP failure during a lookup retry cancels further attempts', async () => {
  const harness = createHarness();
  const cast = new harness.DyCast('732146168843');
  let attempts = 0;
  const closes = [];
  cast.on('close', (_code, reason) => closes.push(reason));
  cast.fetchConnectInfo = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('temporary network failure');
    throw new harness.HttpRequestError(404);
  };

  await cast.connect();
  harness.clock.runTimeout(harness.clock.firstTimeout().id);
  await flushMicrotasks();
  assert.equal(attempts, 2);
  assert.equal(harness.clock.timeouts.size, 0);
  assert.equal(harness.FakeWebSocket.instances.length, 0);
  assert.match(String(closes[0]), /HTTP 404/);
});

test('manual disconnect cancels a pending room lookup retry', async () => {
  const harness = createHarness();
  const cast = new harness.DyCast('732146168843');
  let finishRetryLookup;
  let retrySignal;
  let lookupAttempts = 0;
  cast.fetchConnectInfo = (_room, signal) => {
    lookupAttempts += 1;
    if (lookupAttempts === 1) return Promise.reject(new Error('temporary network failure'));
    retrySignal = signal;
    return new Promise(resolve => { finishRetryLookup = resolve; });
  };
  cast.getWssParam = () => ({ ...baseSocketOptions });
  cast.isLiving = () => true;

  await cast.connect();
  harness.clock.runTimeout(harness.clock.firstTimeout().id);
  assert.equal(lookupAttempts, 2);
  assert.equal(retrySignal.aborted, false);
  cast.close(1000, 'manual stop');
  assert.equal(retrySignal.aborted, true);
  finishRetryLookup();
  await flushMicrotasks();

  assert.equal(harness.FakeWebSocket.instances.length, 0);
  assert.equal(harness.clock.timeouts.size, 0);
});

test('a cancelled room lookup retry timer cannot start a stale lookup', async () => {
  const harness = createHarness();
  const cast = new harness.DyCast('732146168843');
  let lookupAttempts = 0;
  cast.fetchConnectInfo = async () => {
    lookupAttempts += 1;
    throw new Error('temporary network failure');
  };

  await cast.connect();
  const queuedRetry = harness.clock.firstTimeout();
  assert.ok(queuedRetry);
  cast.close(1000, 'manual stop');
  queuedRetry.callback();
  await flushMicrotasks();

  assert.equal(lookupAttempts, 1);
  assert.equal(harness.FakeWebSocket.instances.length, 0);
  assert.equal(harness.clock.timeouts.size, 0);
});

test('manual disconnect during reconnect backoff cannot resurrect a WebSocket', async () => {
  const harness = createHarness();
  const cast = await createConnectedDyCast(harness);
  const firstSocket = harness.FakeWebSocket.instances[0];

  firstSocket.remoteClose(1006, 'network lost');
  const delayedReconnect = harness.clock.firstTimeout();
  assert.ok(delayedReconnect);

  cast.close(1000, 'manual stop');
  assert.equal(harness.clock.timeouts.size, 0);
  // Model the tight race where a timer callback was already queued when clearTimeout ran.
  delayedReconnect.callback();
  await flushMicrotasks();

  assert.equal(harness.FakeWebSocket.instances.length, 1);
  assert.equal(cast.ws, undefined);
});

test('a payload-close followed by its native close event schedules exactly one reconnect', async () => {
  const harness = createHarness();
  const cast = await createConnectedDyCast(harness);
  const socket = harness.FakeWebSocket.instances[0];
  let reconnectingEvents = 0;
  cast.on('reconnecting', () => { reconnectingEvents += 1; });
  cast._decodeFrame = async () => ({
    response: { messages: [] },
    frame: { payloadType: 'close' },
    cursor: '',
    internalExt: '',
    needAck: false
  });

  socket.message();
  socket.message();
  await flushMicrotasks();
  socket.dispatch('close', { code: 1000, reason: 'late native close' });

  assert.equal(reconnectingEvents, 1);
  assert.equal(harness.clock.timeouts.size, 1);
  assert.equal(socket.closeCalls.length, 1);
});

test('duplicate remote code-1000 close callbacks schedule exactly one reconnect', async () => {
  const harness = createHarness();
  const cast = await createConnectedDyCast(harness);
  const socket = harness.FakeWebSocket.instances[0];
  let reconnectingEvents = 0;
  cast.on('reconnecting', () => { reconnectingEvents += 1; });

  socket.remoteClose(1000, 'upstream rotation');
  socket.dispatch('close', { code: 1000, reason: 'duplicate callback' });

  assert.equal(reconnectingEvents, 1);
  assert.equal(harness.clock.timeouts.size, 1);
});

test('callbacks from a superseded DyCast socket are ignored', async () => {
  const harness = createHarness();
  const cast = await createConnectedDyCast(harness);
  const firstSocket = harness.FakeWebSocket.instances[0];
  const counts = { open: 0, error: 0, message: 0, reconnecting: 0 };
  for (const event of Object.keys(counts)) cast.on(event, () => { counts[event] += 1; });
  let decodeCalls = 0;
  cast._decodeFrame = async () => {
    decodeCalls += 1;
    return null;
  };

  firstSocket.remoteClose(1006, 'network lost');
  const reconnectTask = harness.clock.firstTimeout();
  harness.clock.runTimeout(reconnectTask.id);
  const secondSocket = harness.FakeWebSocket.instances[1];
  assert.ok(secondSocket);

  firstSocket.open();
  firstSocket.error('late error');
  firstSocket.message();
  firstSocket.remoteClose(1000, 'late close');
  await flushMicrotasks();

  assert.equal(cast.ws, secondSocket);
  assert.equal(decodeCalls, 0);
  assert.deepEqual(counts, { open: 0, error: 0, message: 0, reconnecting: 1 });
  assert.equal(harness.clock.timeouts.size, 0);
  cast.dispose();
});

test('an oversized WebSocket frame is discarded and schedules one recoverable reconnect', async () => {
  const harness = createHarness();
  const cast = await createConnectedDyCast(harness);
  const socket = harness.FakeWebSocket.instances[0];
  let decodeCalls = 0;
  let reconnectingEvents = 0;
  cast._decodeFrame = async () => {
    decodeCalls += 1;
    return null;
  };
  cast.on('reconnecting', () => { reconnectingEvents += 1; });

  socket.message(new ArrayBuffer(4 * 1024 * 1024 + 1));
  await flushMicrotasks();

  assert.equal(decodeCalls, 0);
  assert.equal(reconnectingEvents, 1);
  assert.equal(harness.clock.timeouts.size, 1);
  assert.equal(socket.closeCalls.length, 1);
  cast.dispose();
});

test('the latest acknowledged cursor is retained in the next WebSocket URL', async () => {
  const harness = createHarness();
  const cast = await createConnectedDyCast(harness);
  const firstSocket = harness.FakeWebSocket.instances[0];
  firstSocket.readyState = harness.FakeWebSocket.OPEN;
  cast._ack = () => new Uint8Array([9]);
  cast._decodeFrame = async () => ({
    response: { messages: [] },
    frame: { payloadType: 'hb', logId: 'log-id' },
    cursor: 'cursor-latest',
    internalExt: 'ext-latest',
    needAck: true
  });

  firstSocket.message();
  await flushMicrotasks();
  assert.equal(firstSocket.sent.length, 1);

  firstSocket.remoteClose(1000, 'upstream rotation');
  const reconnectTask = harness.clock.firstTimeout();
  harness.clock.runTimeout(reconnectTask.id);
  const secondSocket = harness.FakeWebSocket.instances[1];
  const query = new URL(secondSocket.url).searchParams;

  assert.equal(query.get('cursor'), 'cursor-latest');
  assert.equal(query.get('internal_ext'), 'ext-latest');
  cast.dispose();
});

test('a quiet but open RelayCast connection is not treated as dead', () => {
  const harness = createHarness();
  const relay = new harness.RelayCast('ws://127.0.0.1:9000');
  relay.connect();
  const socket = harness.FakeWebSocket.instances[0];
  socket.open();

  for (let index = 0; index < 5; index++) harness.clock.runIntervalsOnce();

  assert.equal(relay.getStatus(), 'connected');
  assert.equal(socket.closeCalls.length, 0);
  assert.equal(harness.FakeWebSocket.instances.length, 1);
  assert.equal(harness.clock.timeouts.size, 0);
  relay.dispose();
});

test('RelayCast isolates all events from a superseded socket', () => {
  const harness = createHarness();
  const relay = new harness.RelayCast('ws://127.0.0.1:9000');
  const counts = { open: 0, error: 0, message: 0, reconnecting: 0, reconnect: 0 };
  for (const event of Object.keys(counts)) relay.on(event, () => { counts[event] += 1; });

  relay.connect();
  const firstSocket = harness.FakeWebSocket.instances[0];
  firstSocket.remoteClose(1006, 'network lost');
  const reconnectTask = harness.clock.firstTimeout();
  harness.clock.runTimeout(reconnectTask.id);
  const secondSocket = harness.FakeWebSocket.instances[1];
  assert.ok(secondSocket);

  firstSocket.open();
  firstSocket.message('stale data');
  firstSocket.error('stale error');
  firstSocket.remoteClose(1000, 'stale close');
  assert.deepEqual(counts, { open: 0, error: 0, message: 0, reconnecting: 1, reconnect: 0 });
  assert.equal(relay.ws, secondSocket);
  assert.equal(harness.clock.timeouts.size, 0);

  secondSocket.open();
  assert.equal(relay.getStatus(), 'connected');
  assert.equal(counts.reconnect, 1);
  relay.dispose();
});
