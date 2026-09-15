const assert = require('node:assert/strict');
const test = require('node:test');

const trackerModule = import('../src/utils/settingsPatchVersion.ts');

test('a failed old settings patch cannot overwrite a newer value for the same field', async () => {
  const { createSettingsPatchVersionTracker } = await trackerModule;
  const tracker = createSettingsPatchVersionTracker();
  const oldVersion = tracker.record({ display: { size: 16, speed: 10 }, theme: 'dark' });

  tracker.record({ display: { size: 22 } });
  const retry = tracker.filterForRetry(
    { display: { size: 16, speed: 10 }, theme: 'dark' },
    oldVersion
  );

  assert.deepEqual(retry, { display: { speed: 10 }, theme: 'dark' });
});

test('a structural replacement supersedes an older nested retry without dropping siblings', async () => {
  const { createSettingsPatchVersionTracker } = await trackerModule;
  const tracker = createSettingsPatchVersionTracker();
  const oldVersion = tracker.record({ future: { nested: { enabled: true } }, unrelated: 1 });

  tracker.record({ future: false });
  assert.deepEqual(
    tracker.filterForRetry({ future: { nested: { enabled: true } }, unrelated: 1 }, oldVersion),
    { unrelated: 1 }
  );
});

test('a newer field version supersedes an older local retry only on matching fields', async () => {
  const { createSettingsPatchVersionTracker } = await trackerModule;
  const tracker = createSettingsPatchVersionTracker();
  const localVersion = tracker.record({
    liveCountdownRunning: true,
    giftHighlightDuration: 8
  });

  tracker.record({ liveCountdownRunning: false });
  assert.deepEqual(
    tracker.filterForRetry({
      liveCountdownRunning: true,
      giftHighlightDuration: 8
    }, localVersion),
    { giftHighlightDuration: 8 }
  );
});
