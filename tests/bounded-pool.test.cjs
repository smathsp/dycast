const assert = require('node:assert/strict');
const test = require('node:test');

const boundedPoolModule = import('../src/danmu/boundedPool.ts');

test('large pools evict in batches instead of shifting the whole array for every message', async () => {
  const { appendWithBatchedHeadEviction } = await boundedPoolModule;
  const pool = [];
  const removedIds = [];
  let evictionCount = 0;

  for (let id = 0; id < 120_000; id += 1) {
    appendWithBatchedHeadEviction(pool, id, 50_000, 1_000, removed => {
      evictionCount += 1;
      removedIds.push(...removed);
    });
  }

  assert.equal(pool.length, 50_000);
  assert.equal(pool[0], 70_000);
  assert.equal(pool.at(-1), 119_999);
  assert.equal(removedIds.length, 70_000);
  assert.ok(evictionCount <= 71, `expected batched eviction, got ${evictionCount} array shifts`);
});

test('an oversized append reports every evicted item to the derived-index callback', async () => {
  const { appendWithBatchedHeadEviction } = await boundedPoolModule;
  const pool = [1, 2, 3, 4];
  let callbackValue = null;
  const removed = appendWithBatchedHeadEviction(pool, 5, 4, 2, value => { callbackValue = value; });

  assert.deepEqual(removed, [1, 2]);
  assert.deepEqual(callbackValue, [1, 2]);
  assert.deepEqual(pool, [3, 4, 5]);
});
