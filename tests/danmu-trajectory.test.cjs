const test = require('node:test');
const assert = require('node:assert/strict');

const trajectoryModule = import('../src/danmu/trajectory.ts');

function snapshot(overrides = {}) {
  return {
    spawnedAtMs: 0,
    durationSeconds: 10,
    widthPx: 300,
    velocityPxPerSecond: 132.4,
    ...overrides
  };
}

test('a new danmu waits until the previous tail has entered with a safe gap', async () => {
  const { mayMovingDanmuMeet } = await trajectoryModule;
  assert.equal(mayMovingDanmuMeet({
    existing: snapshot(),
    nowMs: 2000,
    viewportWidthPx: 1000,
    newDurationSeconds: 10,
    newWidthPx: 260
  }), true);
});

test('a slower danmu cannot catch a fully entered faster danmu', async () => {
  const { mayMovingDanmuMeet } = await trajectoryModule;
  assert.equal(mayMovingDanmuMeet({
    existing: snapshot({ velocityPxPerSecond: 180 }),
    nowMs: 3000,
    viewportWidthPx: 1000,
    newDurationSeconds: 14,
    newWidthPx: 200
  }), false);
});

test('long, fast danmu is blocked when it would catch the prior item', async () => {
  const { mayMovingDanmuMeet } = await trajectoryModule;
  assert.equal(mayMovingDanmuMeet({
    existing: snapshot({ widthPx: 500, velocityPxPerSecond: 152.4 }),
    nowMs: 5000,
    viewportWidthPx: 1000,
    newDurationSeconds: 5,
    newWidthPx: 1800
  }), true);
});

test('completed stale danmu never blocks a new trajectory', async () => {
  const { mayMovingDanmuMeet } = await trajectoryModule;
  assert.equal(mayMovingDanmuMeet({
    existing: snapshot(),
    nowMs: 10001,
    viewportWidthPx: 1000,
    newDurationSeconds: 5,
    newWidthPx: 1800
  }), false);
});
