const test = require('node:test');
const assert = require('node:assert/strict');

const queueModule = import('../src/utils/persistentSettingsQueue.ts');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test('merges pending values by section without dropping unknown nested fields', async () => {
  const { createPersistentSettingsSaveQueue } = await queueModule;
  const calls = [];
  const queue = createPersistentSettingsSaveQueue({
    async persist(section, value) {
      calls.push({ section, value });
    }
  });

  const first = queue.enqueue('app', {
    showGiftPrice: true,
    futureOptions: { glow: true, palette: { primary: '#00ffaa' } }
  });
  const second = queue.enqueue('app', {
    showGiftPrice: false,
    futureOptions: { palette: { accent: '#ffcc00' } }
  });

  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.deepEqual(calls, [{
    section: 'app',
    value: {
      showGiftPrice: false,
      futureOptions: {
        glow: true,
        palette: { primary: '#00ffaa', accent: '#ffcc00' }
      }
    }
  }]);
});

test('waits for each acknowledgement before writing the next section', async () => {
  const { createPersistentSettingsSaveQueue } = await queueModule;
  const firstAck = deferred();
  const calls = [];
  let activeWrites = 0;
  let maximumActiveWrites = 0;
  const queue = createPersistentSettingsSaveQueue({
    async persist(section, value) {
      calls.push({ section, value });
      activeWrites++;
      maximumActiveWrites = Math.max(maximumActiveWrites, activeWrites);
      if (section === 'app') await firstAck.promise;
      activeWrites--;
    }
  });

  const appSaved = queue.enqueue('app', { theme: 'dark' });
  const audioSaved = queue.enqueue('audio', { masterVolume: 42 });
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(calls.map(call => call.section), ['app']);
  firstAck.resolve();
  assert.deepEqual(await Promise.all([appSaved, audioSaved]), [true, true]);
  assert.deepEqual(calls.map(call => call.section), ['app', 'audio']);
  assert.equal(maximumActiveWrites, 1);
});

test('retries a bounded number of times and continues with later writes', async () => {
  const { createPersistentSettingsSaveQueue } = await queueModule;
  const attempts = [];
  const delays = [];
  const errors = [];
  const queue = createPersistentSettingsSaveQueue({
    maxAttempts: 3,
    retryDelayMs: 10,
    wait: async delayMs => { delays.push(delayMs); },
    onError: (error, section, count) => errors.push({ error, section, count }),
    async persist(section) {
      attempts.push(section);
      if (section === 'danmu') throw new Error('disk busy');
    }
  });

  const failed = queue.enqueue('danmu', { lotteryThreshold: 10 });
  const saved = queue.enqueue('audio', { masterVolume: 70 });

  assert.deepEqual(await Promise.all([failed, saved]), [false, true]);
  assert.deepEqual(attempts, ['danmu', 'danmu', 'danmu', 'audio']);
  assert.deepEqual(delays, [10, 20]);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].section, 'danmu');
  assert.equal(errors[0].count, 3);
});

test('coalesces updates queued behind an in-flight write and snapshots mutable input', async () => {
  const { createPersistentSettingsSaveQueue } = await queueModule;
  const firstAck = deferred();
  const calls = [];
  const queue = createPersistentSettingsSaveQueue({
    async persist(section, value) {
      calls.push({ section, value });
      if (calls.length === 1) await firstAck.promise;
    }
  });

  const initial = { liveCountdownRunning: true };
  const first = queue.enqueue('app', initial);
  await Promise.resolve();
  await Promise.resolve();
  initial.liveCountdownRunning = false;
  const second = queue.enqueue('app', { remainingWinnerCount: 9, future: { left: true } });
  const third = queue.enqueue('app', { remainingWinnerCount: 8, future: { right: true } });

  assert.equal(calls.length, 1);
  firstAck.resolve();
  assert.deepEqual(await Promise.all([first, second, third]), [true, true, true]);
  assert.deepEqual(calls, [
    { section: 'app', value: { liveCountdownRunning: true } },
    {
      section: 'app',
      value: { remainingWinnerCount: 8, future: { left: true, right: true } }
    }
  ]);
});

test('storage event guard suppresses synchronous echo writes and always resets', async () => {
  const { createStorageEventWriteGuard } = await queueModule;
  const guard = createStorageEventWriteGuard();
  let writes = 0;

  guard.runWithoutWrite(() => {
    if (guard.shouldWrite()) writes++;
    guard.runWithoutWrite(() => {
      if (guard.shouldWrite()) writes++;
    });
  });
  assert.equal(writes, 0);
  assert.equal(guard.shouldWrite(), true);

  assert.throws(() => guard.runWithoutWrite(() => { throw new Error('bad storage value'); }));
  assert.equal(guard.shouldWrite(), true);
});

test('two renderer snapshots become independent patches instead of rolling back each other', async () => {
  const {
    diffPersistentSettingsValues,
    mergePersistentSettingsValues
  } = await queueModule;
  const baseline = {
    showGiftPrice: true,
    liveCountdownRunning: false,
    remainingWinnerCount: 10
  };
  const mainWindowSnapshot = { ...baseline, liveCountdownRunning: true };
  const danmuWindowSnapshot = { ...baseline, remainingWinnerCount: 9 };

  const mainPatch = diffPersistentSettingsValues(baseline, mainWindowSnapshot);
  const danmuPatch = diffPersistentSettingsValues(baseline, danmuWindowSnapshot);
  const canonical = mergePersistentSettingsValues(
    mergePersistentSettingsValues(baseline, mainPatch),
    danmuPatch
  );

  assert.deepEqual(mainPatch, { liveCountdownRunning: true });
  assert.deepEqual(danmuPatch, { remainingWinnerCount: 9 });
  assert.deepEqual(canonical, {
    showGiftPrice: true,
    liveCountdownRunning: true,
    remainingWinnerCount: 9
  });
});

test('flush waits for registered pre-flush hooks before resolving', async () => {
  const {
    flushPersistentSettingsSaves,
    registerPersistentSettingsFlushHook
  } = await queueModule;
  const hookFinished = deferred();
  let hookStarted = false;
  const unregister = registerPersistentSettingsFlushHook(async () => {
    hookStarted = true;
    await hookFinished.promise;
  });

  const flushing = flushPersistentSettingsSaves();
  await Promise.resolve();
  assert.equal(hookStarted, true);
  let resolved = false;
  void flushing.then(() => { resolved = true; });
  await Promise.resolve();
  assert.equal(resolved, false);

  hookFinished.resolve();
  assert.equal(await flushing, true);
  unregister();
});

test('retains failed danmu and audio writes and retries them during flush', async () => {
  const { createPersistentSettingsSaveQueue } = await queueModule;
  let diskAvailable = false;
  const calls = [];
  const queue = createPersistentSettingsSaveQueue({
    maxAttempts: 1,
    retainFailedSections: ['danmu', 'audio'],
    async persist(section, value) {
      calls.push({ section, value });
      if (!diskAvailable) throw new Error('disk busy');
    }
  });

  assert.equal(await queue.enqueue('danmu', { fontSize: 20 }), false);
  assert.equal(await queue.enqueue('audio', { masterVolume: 62 }), false);
  assert.equal(queue.hasPending(), true);

  diskAvailable = true;
  assert.equal(await queue.flush(), true);
  assert.equal(queue.hasPending(), false);
  assert.deepEqual(calls, [
    { section: 'danmu', value: { fontSize: 20 } },
    { section: 'audio', value: { masterVolume: 62 } },
    { section: 'danmu', value: { fontSize: 20 } },
    { section: 'audio', value: { masterVolume: 62 } }
  ]);
});

test('flush reports failure while a retained write is still unsaved', async () => {
  const { createPersistentSettingsSaveQueue } = await queueModule;
  const queue = createPersistentSettingsSaveQueue({
    maxAttempts: 1,
    retainFailedSections: ['danmu'],
    async persist() { throw new Error('read only'); }
  });

  assert.equal(await queue.enqueue('danmu', { speedBase: 10 }), false);
  assert.equal(await queue.flush(), false);
  assert.equal(queue.hasPending(), true);
});

test('exposes an immutable snapshot of a retained failure until flush succeeds', async () => {
  const { createPersistentSettingsSaveQueue } = await queueModule;
  let diskAvailable = false;
  const queue = createPersistentSettingsSaveQueue({
    maxAttempts: 1,
    retainFailedSections: ['app'],
    async persist() {
      if (!diskAvailable) throw new Error('disk busy');
    }
  });

  assert.equal(await queue.enqueue('app', {
    theme: 'dark',
    display: { size: 20 }
  }), false);
  const retained = queue.getRetainedValue('app');
  retained.display.size = 99;
  assert.deepEqual(queue.getRetainedValue('app'), {
    theme: 'dark',
    display: { size: 20 }
  });

  diskAvailable = true;
  assert.equal(await queue.flush(), true);
  assert.deepEqual(queue.getRetainedValue('app'), {});
});

test('a newer canonical field removes only the overlapping part of an old retry', async () => {
  const { createPersistentSettingsSaveQueue } = await queueModule;
  const calls = [];
  let queue;
  queue = createPersistentSettingsSaveQueue({
    maxAttempts: 2,
    retryDelayMs: 1,
    wait: async () => {
      queue.markCanonicalPatch('app', { liveCountdownRunning: false });
    },
    async persist(_section, value) {
      calls.push(value);
      if (calls.length === 1) throw new Error('temporary failure');
    }
  });

  assert.equal(await queue.enqueue('app', {
    liveCountdownRunning: true,
    giftHighlightDuration: 8
  }), true);
  assert.deepEqual(calls, [
    { liveCountdownRunning: true, giftHighlightDuration: 8 },
    { giftHighlightDuration: 8 }
  ]);
});

test('a canonical update prunes a matching field from an already retained failure', async () => {
  const { createPersistentSettingsSaveQueue } = await queueModule;
  const calls = [];
  let diskAvailable = false;
  const queue = createPersistentSettingsSaveQueue({
    maxAttempts: 1,
    retainFailedSections: ['app'],
    async persist(_section, value) {
      calls.push(value);
      if (!diskAvailable) throw new Error('temporary failure');
    }
  });

  assert.equal(await queue.enqueue('app', {
    liveCountdownRunning: true,
    giftHighlightDuration: 8
  }), false);
  queue.markCanonicalPatch('app', { liveCountdownRunning: false });
  assert.deepEqual(queue.getRetainedValue('app'), { giftHighlightDuration: 8 });

  diskAvailable = true;
  assert.equal(await queue.flush(), true);
  assert.deepEqual(calls, [
    { liveCountdownRunning: true, giftHighlightDuration: 8 },
    { giftHighlightDuration: 8 }
  ]);
});

test('an acknowledgement for an active write never deletes a newer queued value', async () => {
  const { createPersistentSettingsSaveQueue } = await queueModule;
  const firstAck = deferred();
  const calls = [];
  const queue = createPersistentSettingsSaveQueue({
    async persist(_section, value) {
      calls.push(value);
      if (calls.length === 1) await firstAck.promise;
    }
  });

  const first = queue.enqueue('app', { liveCountdownPausedSeconds: 120 });
  await Promise.resolve();
  await Promise.resolve();
  const second = queue.enqueue('app', { liveCountdownPausedSeconds: 60 });
  queue.markCanonicalPatch('app', { liveCountdownPausedSeconds: 120 });
  firstAck.resolve();

  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.deepEqual(calls, [
    { liveCountdownPausedSeconds: 120 },
    { liveCountdownPausedSeconds: 60 }
  ]);
});

test('new values win when merged with an older retained failure', async () => {
  const { createPersistentSettingsSaveQueue } = await queueModule;
  const calls = [];
  let fail = true;
  const queue = createPersistentSettingsSaveQueue({
    maxAttempts: 1,
    retainFailedSections: ['danmu'],
    async persist(_section, value) {
      calls.push(value);
      if (fail) throw new Error('temporary failure');
    }
  });

  assert.equal(await queue.enqueue('danmu', { fontSize: 18, speedBase: 8 }), false);
  fail = false;
  assert.equal(await queue.enqueue('danmu', { fontSize: 22 }), true);
  assert.deepEqual(calls.at(-1), { fontSize: 22, speedBase: 8 });
  assert.equal(await queue.flush(), true);
});
