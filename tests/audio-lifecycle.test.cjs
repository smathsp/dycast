const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

class ManualClock {
  constructor() {
    this.nextId = 1;
    this.timeouts = new Map();
  }

  setTimeout(callback, delay = 0) {
    const id = this.nextId++;
    this.timeouts.set(id, { id, callback, delay });
    return id;
  }

  clearTimeout(id) {
    this.timeouts.delete(id);
  }

  runNextTimeout() {
    const task = [...this.timeouts.values()].sort((a, b) => a.delay - b.delay || a.id - b.id)[0];
    if (!task) return null;
    this.timeouts.delete(task.id);
    task.callback();
    return task;
  }
}

class TestEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener, options) {
    let listeners = this.listeners.get(type);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(type, listeners);
    }
    listeners.add({ listener, once: Boolean(options && typeof options === 'object' && options.once) });
  }

  removeEventListener(type, listener) {
    const listeners = this.listeners.get(type);
    if (!listeners) return;
    for (const entry of listeners) {
      if (entry.listener === listener) listeners.delete(entry);
    }
    if (listeners.size === 0) this.listeners.delete(type);
  }

  dispatch(type, event = {}) {
    const listeners = [...(this.listeners.get(type) || [])];
    for (const entry of listeners) {
      if (entry.once) this.removeEventListener(type, entry.listener);
      entry.listener({ type, target: this, ...event });
    }
  }

  listenerCount(type) {
    return this.listeners.get(type)?.size || 0;
  }
}

function createFakeAudioClass(behaviors) {
  return class FakeAudio extends TestEventTarget {
    static instances = [];
    static constructorAttempts = [];

    constructor(url) {
      super();
      this.src = String(url);
      FakeAudio.constructorAttempts.push(this.src);
      const behavior = behaviors.get(this.src);
      if (behavior?.constructError) throw new Error('audio constructor failed');
      this.preload = '';
      this.volume = 1;
      this.error = null;
      this.duration = behavior?.duration ?? 180;
      this.readyState = behavior?.readyState ?? 1;
      this.pauseCalls = 0;
      this.loadCalls = 0;
      this.playCalls = 0;
      this.removedSource = false;
      FakeAudio.instances.push(this);
    }

    play() {
      this.playCalls++;
      const behavior = behaviors.get(this.src);
      if (behavior?.throwError) throw new Error('play threw');
      if (behavior?.dispatchError) {
        this.error = new Error('media error');
        this.dispatch('error');
      }
      if (behavior?.playPromise) return behavior.playPromise();
      if (behavior?.reject) return Promise.reject(new Error('play rejected'));
      return Promise.resolve();
    }

    pause() {
      this.pauseCalls++;
    }

    removeAttribute(name) {
      if (name !== 'src') return;
      this.removedSource = true;
      this.src = '';
    }

    load() {
      this.loadCalls++;
    }
  };
}

class FakeAudioNode {
  constructor() {
    this.connections = [];
    this.disconnectCalls = 0;
  }

  connect(target) {
    this.connections.push(target);
    return target;
  }

  disconnect() {
    this.disconnectCalls++;
    this.connections.length = 0;
  }
}

function createFakeAudioContextClass(configuration = {}) {
  return class FakeAudioContext {
    static instances = [];

    constructor() {
      this.state = 'suspended';
      this.currentTime = 0;
      this.destination = new FakeAudioNode();
      this.sources = [];
      this.gains = [];
      this.compressors = [];
      this.resumeCalls = 0;
      this.suspendCalls = 0;
      this.closeCalls = 0;
      FakeAudioContext.instances.push(this);
    }

    createMediaElementSource() {
      if (configuration.throwOnSource) throw new Error('source failed');
      const node = new FakeAudioNode();
      this.sources.push(node);
      return node;
    }

    createGain() {
      if (configuration.throwOnGain) throw new Error('gain failed');
      const node = new FakeAudioNode();
      node.gain = {
        value: 1,
        targets: [],
        setTargetAtTime(value, startTime, timeConstant) {
          this.targets.push({ value, startTime, timeConstant });
        }
      };
      this.gains.push(node);
      return node;
    }

    createDynamicsCompressor() {
      if (configuration.throwOnCompressor) throw new Error('compressor failed');
      const node = new FakeAudioNode();
      node.threshold = { value: 0 };
      node.knee = { value: 0 };
      node.ratio = { value: 0 };
      node.attack = { value: 0 };
      node.release = { value: 0 };
      this.compressors.push(node);
      return node;
    }

    resume() {
      this.resumeCalls++;
      this.state = 'running';
      return Promise.resolve();
    }

    suspend() {
      this.suspendCalls++;
      this.state = 'suspended';
      return Promise.resolve();
    }

    close() {
      this.closeCalls++;
      this.state = 'closed';
      return Promise.resolve();
    }

    decodeAudioData() {
      this.decodeCalls = (this.decodeCalls || 0) + 1;
      return Promise.resolve({
        sampleRate: 48_000,
        length: 1,
        numberOfChannels: 1,
        getChannelData: () => new Float32Array([0.1])
      });
    }
  };
}

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); }
  };
}

function createStreamingResponse(chunks = [new Uint8Array(8)], contentLength = null) {
  const state = {
    bodyCancelCalls: 0,
    readerCancelCalls: 0,
    readCalls: 0,
    released: false
  };
  let cursor = 0;
  const reader = {
    async read() {
      state.readCalls++;
      if (cursor >= chunks.length) return { done: true, value: undefined };
      return { done: false, value: chunks[cursor++] };
    },
    async cancel() {
      state.readerCancelCalls++;
      cursor = chunks.length;
    },
    releaseLock() {
      state.released = true;
    }
  };
  return {
    ok: true,
    status: 200,
    headers: {
      get(name) {
        return String(name).toLowerCase() === 'content-length' ? contentLength : null;
      }
    },
    body: {
      getReader() { return reader; },
      async cancel() {
        state.bodyCancelCalls++;
        cursor = chunks.length;
      }
    },
    state
  };
}

function loadAudioHarness({
  tracks,
  mode = 'list',
  selectedTrackId = tracks[0]?.id || '',
  volumeNormalization = true,
  behaviors = new Map(),
  contextConfiguration = {},
  fetchImplementation = async () => createStreamingResponse()
}) {
  const clock = new ManualClock();
  const windowEvents = new TestEventTarget();
  const FakeAudio = createFakeAudioClass(behaviors);
  const FakeAudioContext = createFakeAudioContextClass(contextConfiguration);
  const state = {
    masterVolume: 75,
    volumeNormalization,
    configs: {
      charging: { mode, selectedTrackId, disabledTrackIds: [] },
      lottery: { mode, selectedTrackId, disabledTrackIds: [] },
      winner: { mode, selectedTrackId, disabledTrackIds: [] }
    }
  };
  const warnings = [];
  const testConsole = {
    info() {},
    log() {},
    error() {},
    warn(...args) { warnings.push(args); }
  };
  const window = {
    AudioContext: FakeAudioContext,
    addEventListener: windowEvents.addEventListener.bind(windowEvents),
    removeEventListener: windowEvents.removeEventListener.bind(windowEvents),
    clearTimeout: clock.clearTimeout.bind(clock),
    setTimeout: clock.setTimeout.bind(clock)
  };
  const sourcePath = path.resolve(__dirname, '../src/danmu/audio.ts');
  const source = fs.readFileSync(sourcePath, 'utf8');
  const output = ts.transpileModule(source, {
    fileName: sourcePath,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true
    }
  }).outputText;
  const module = { exports: {} };
  const context = vm.createContext({
    AbortController,
    Audio: FakeAudio,
    console: testConsole,
    fetch: fetchImplementation,
    Float32Array,
    DOMException,
    localStorage: createMemoryStorage(),
    module,
    exports: module.exports,
    Promise,
    require(specifier) {
      if (specifier === './audioLibrary') {
        return {
          audioLibraryReady: Promise.resolve(),
          audioLibraryState: state,
          getCategoryTracks: category => tracks.filter(track => track.category === category)
        };
      }
      throw new Error(`Unexpected dependency: ${specifier}`);
    },
    setTimeout: clock.setTimeout.bind(clock),
    clearTimeout: clock.clearTimeout.bind(clock),
    window
  });
  new vm.Script(output, { filename: sourcePath }).runInContext(context);
  return { audio: module.exports, clock, FakeAudio, FakeAudioContext, state, warnings, windowEvents };
}

function track(id, url = `blob:${id}`) {
  return {
    id,
    category: 'charging',
    name: id,
    mimeType: 'audio/mpeg',
    size: 1024,
    url,
    builtin: false,
    createdAt: 1
  };
}

async function flushMicrotasks() {
  // Streamed response reading and decode/fallback each cross several promise boundaries.
  for (let index = 0; index < 24; index++) await Promise.resolve();
}

test('continuous playback releases every old element, listener, and Web Audio node', async () => {
  const harness = loadAudioHarness({ tracks: [track('a'), track('b'), track('c')] });
  harness.audio.playCharging();
  await flushMicrotasks();

  assert.equal(harness.FakeAudio.instances.length, 1);
  assert.equal(harness.windowEvents.listenerCount('dycast-audio-volume-change'), 1);
  const context = harness.FakeAudioContext.instances[0];

  for (let index = 0; index < 8; index++) {
    const previous = harness.FakeAudio.instances.at(-1);
    previous.dispatch('ended');
    assert.equal(previous.listenerCount('playing'), 0);
    assert.equal(previous.listenerCount('ended'), 0);
    assert.equal(previous.listenerCount('error'), 0);
    assert.equal(previous.removedSource, true);
    assert.equal(previous.pauseCalls, 1);
    assert.equal(previous.loadCalls, 1);

    const nextTrackTask = harness.clock.runNextTimeout();
    assert.equal(nextTrackTask.delay, 0);
    await flushMicrotasks();
    assert.equal(harness.windowEvents.listenerCount('dycast-audio-volume-change'), 1);
  }

  assert.equal(harness.FakeAudio.instances.length, 9);
  assert.equal(context.sources.slice(0, -1).every(node => node.disconnectCalls === 1), true);
  assert.equal(context.gains.slice(0, -1).every(node => node.disconnectCalls === 1), true);
  assert.equal(context.compressors.slice(0, -1).every(node => node.disconnectCalls === 1), true);

  harness.audio.stopCharging();
  assert.equal(harness.windowEvents.listenerCount('dycast-audio-volume-change'), 0);
  assert.equal(context.sources.every(node => node.disconnectCalls === 1), true);
  const idleTask = harness.clock.runNextTimeout();
  assert.equal(idleTask.delay, 30_000);
  await flushMicrotasks();
  assert.equal(context.suspendCalls, 1);

  harness.audio.playCharging();
  await flushMicrotasks();
  assert.equal(harness.FakeAudioContext.instances.length, 1);
  assert.equal(context.resumeCalls, 10);
  harness.audio.disposeAudio();
  await flushMicrotasks();
  assert.equal(context.closeCalls, 1);
  assert.equal(harness.clock.timeouts.size, 0);
});

test('a playlist containing only broken or stalled tracks stops after one attempt per track', async () => {
  const tracks = [track('constructor-bad'), track('event-bad'), track('promise-bad'), track('stalled')];
  const behaviors = new Map([
    ['blob:constructor-bad', { constructError: true }],
    ['blob:event-bad', { dispatchError: true, reject: true }],
    ['blob:promise-bad', { reject: true }],
    ['blob:stalled', { playPromise: () => new Promise(() => {}) }]
  ]);
  const harness = loadAudioHarness({ tracks, behaviors, volumeNormalization: false });

  harness.audio.playCharging();
  await flushMicrotasks();
  for (let index = 0; index < 10 && harness.clock.timeouts.size; index++) {
    harness.clock.runNextTimeout();
    await flushMicrotasks();
  }

  assert.deepEqual(harness.FakeAudio.constructorAttempts, tracks.map(item => item.url));
  assert.equal(harness.FakeAudio.instances.length, 3);
  assert.equal(harness.clock.timeouts.size, 0);
  assert.equal(harness.windowEvents.listenerCount('dycast-audio-volume-change'), 0);
  for (const audio of harness.FakeAudio.instances) {
    assert.equal(audio.listenerCount('playing'), 0);
    assert.equal(audio.listenerCount('ended'), 0);
    assert.equal(audio.listenerCount('error'), 0);
    assert.equal(audio.removedSource, true);
  }
  assert.equal(harness.warnings.some(args => String(args[0]).includes('可用曲目均播放失败')), true);
});

test('a late play rejection after stop cannot restart playback', async () => {
  let rejectPlayback;
  const pendingPlayback = new Promise((_resolve, reject) => { rejectPlayback = reject; });
  const item = track('slow');
  const harness = loadAudioHarness({
    tracks: [item],
    volumeNormalization: false,
    behaviors: new Map([[item.url, { playPromise: () => pendingPlayback }]])
  });

  harness.audio.playCharging();
  await flushMicrotasks();
  const oldAudio = harness.FakeAudio.instances[0];
  harness.audio.stopCharging();
  rejectPlayback(new Error('late rejection'));
  await flushMicrotasks();

  assert.equal(harness.FakeAudio.instances.length, 1);
  assert.equal(harness.clock.timeouts.size, 0);
  assert.equal(harness.windowEvents.listenerCount('dycast-audio-volume-change'), 0);
  assert.equal(oldAudio.removedSource, true);
  assert.equal(oldAudio.listenerCount('playing'), 0);
  assert.equal(oldAudio.listenerCount('ended'), 0);
  assert.equal(oldAudio.listenerCount('error'), 0);
});

test('partial Web Audio setup failure disconnects created nodes and falls back cleanly', async () => {
  const item = track('fallback');
  const harness = loadAudioHarness({
    tracks: [item],
    contextConfiguration: { throwOnGain: true }
  });

  const balanced = harness.audio.createBalancedAudio(item);
  const context = harness.FakeAudioContext.instances[0];
  const abandonedAudio = harness.FakeAudio.instances[0];

  assert.equal(harness.FakeAudio.instances.length, 2);
  assert.equal(context.sources[0].disconnectCalls, 1);
  assert.equal(abandonedAudio.removedSource, true);
  assert.equal(abandonedAudio.loadCalls, 1);
  assert.equal(balanced.audio, harness.FakeAudio.instances[1]);
  assert.equal(harness.windowEvents.listenerCount('dycast-audio-volume-change'), 1);

  balanced.disconnect();
  balanced.disconnect();
  assert.equal(harness.windowEvents.listenerCount('dycast-audio-volume-change'), 0);
  assert.equal(balanced.audio.listenerCount('ended'), 0);
  assert.equal(balanced.audio.listenerCount('error'), 0);
  harness.audio.disposeAudio();
  await flushMicrotasks();
  assert.equal(context.closeCalls, 1);
});

test('stalled normalization jobs time out and are aborted during disposal', async () => {
  const item = track('analysis-timeout');
  const signals = [];
  let fetchCalls = 0;
  const harness = loadAudioHarness({
    tracks: [item],
    fetchImplementation: (_url, options) => {
      fetchCalls++;
      signals.push(options.signal);
      return new Promise(() => {});
    }
  });

  const first = harness.audio.createBalancedAudio(item);
  assert.equal(fetchCalls, 1);
  const timeoutTask = harness.clock.runNextTimeout();
  assert.equal(timeoutTask.delay, 15_000);
  await flushMicrotasks();
  assert.equal(signals[0].aborted, true);

  first.disconnect();
  const second = harness.audio.createBalancedAudio(item);
  assert.equal(fetchCalls, 2);
  assert.equal(harness.windowEvents.listenerCount('dycast-audio-volume-change'), 1);

  harness.audio.disposeAudio();
  await flushMicrotasks();
  assert.equal(signals[1].aborted, true);
  assert.equal(harness.windowEvents.listenerCount('dycast-audio-volume-change'), 0);
  assert.equal(second.audio.listenerCount('ended'), 0);
  assert.equal(second.audio.listenerCount('error'), 0);
  assert.equal(harness.clock.timeouts.size, 0);
});

test('oversized imported audio skips normalization without blocking direct playback', async () => {
  const item = track('large-import');
  item.size = 17 * 1024 * 1024;
  let fetchCalls = 0;
  const harness = loadAudioHarness({
    tracks: [item],
    fetchImplementation: async () => {
      fetchCalls++;
      return createStreamingResponse();
    }
  });

  const balanced = harness.audio.createBalancedAudio(item);
  await flushMicrotasks();

  const context = harness.FakeAudioContext.instances[0];
  assert.equal(fetchCalls, 0);
  assert.equal(context.decodeCalls || 0, 0);
  assert.equal(context.gains[0].gain.targets.at(-1).value, 1);
  await balanced.audio.play();
  assert.equal(balanced.audio.playCalls, 1);

  balanced.disconnect();
  harness.audio.disposeAudio();
  await flushMicrotasks();
});

test('declared oversized normalization response is cancelled before reading or decoding', async () => {
  const item = track('large-header');
  const response = createStreamingResponse([], String(17 * 1024 * 1024));
  const harness = loadAudioHarness({ tracks: [item], fetchImplementation: async () => response });

  const balanced = harness.audio.createBalancedAudio(item);
  await flushMicrotasks();

  const context = harness.FakeAudioContext.instances[0];
  assert.equal(response.state.bodyCancelCalls, 1);
  assert.equal(response.state.readCalls, 0);
  assert.equal(context.decodeCalls || 0, 0);
  assert.equal(context.gains[0].gain.targets.at(-1).value, 1);

  balanced.disconnect();
  harness.audio.disposeAudio();
  await flushMicrotasks();
});

test('streamed normalization response is cancelled when actual bytes exceed the limit', async () => {
  const item = track('large-stream');
  const response = createStreamingResponse([
    new Uint8Array(15 * 1024 * 1024),
    new Uint8Array(2 * 1024 * 1024)
  ]);
  const harness = loadAudioHarness({ tracks: [item], fetchImplementation: async () => response });

  const balanced = harness.audio.createBalancedAudio(item);
  await flushMicrotasks();

  const context = harness.FakeAudioContext.instances[0];
  assert.equal(response.state.readerCancelCalls, 1);
  assert.equal(response.state.released, true);
  assert.equal(context.decodeCalls || 0, 0);
  assert.equal(context.gains[0].gain.targets.at(-1).value, 1);

  balanced.disconnect();
  harness.audio.disposeAudio();
  await flushMicrotasks();
});

test('very long audio skips decoding while remaining playable', async () => {
  const item = track('long-import');
  let fetchCalls = 0;
  const harness = loadAudioHarness({
    tracks: [item],
    behaviors: new Map([[item.url, { duration: 481, readyState: 1 }]]),
    fetchImplementation: async () => {
      fetchCalls++;
      return createStreamingResponse();
    }
  });

  const balanced = harness.audio.createBalancedAudio(item);
  await flushMicrotasks();

  const context = harness.FakeAudioContext.instances[0];
  assert.equal(fetchCalls, 0);
  assert.equal(context.decodeCalls || 0, 0);
  assert.equal(context.gains[0].gain.targets.at(-1).value, 1);
  await balanced.audio.play();
  assert.equal(balanced.audio.playCalls, 1);

  balanced.disconnect();
  harness.audio.disposeAudio();
  await flushMicrotasks();
});

test('pending metadata inspection removes its listeners when the audio engine is disposed', async () => {
  const item = track('metadata-pending');
  let fetchCalls = 0;
  const harness = loadAudioHarness({
    tracks: [item],
    behaviors: new Map([[item.url, { duration: Number.NaN, readyState: 0 }]]),
    fetchImplementation: async () => {
      fetchCalls++;
      return createStreamingResponse();
    }
  });

  const balanced = harness.audio.createBalancedAudio(item);
  assert.equal(balanced.audio.listenerCount('loadedmetadata'), 1);
  assert.equal(balanced.audio.listenerCount('durationchange'), 1);
  assert.equal(fetchCalls, 0);

  harness.audio.disposeAudio();
  await flushMicrotasks();

  assert.equal(balanced.audio.listenerCount('loadedmetadata'), 0);
  assert.equal(balanced.audio.listenerCount('durationchange'), 0);
  assert.equal(balanced.audio.listenerCount('error'), 0);
  assert.equal(harness.windowEvents.listenerCount('dycast-audio-volume-change'), 0);
  assert.equal(fetchCalls, 0);
  assert.equal(harness.clock.timeouts.size, 0);
});
