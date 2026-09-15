const assert = require('node:assert/strict');
const test = require('node:test');
const { createRendererRecoveryPolicy } = require('../renderer-recovery-policy.cjs');

test('renderer recovery backs off and stops a crash loop', () => {
  const policy = createRendererRecoveryPolicy({ windowMs: 60_000, maximumAttempts: 3, baseDelayMs: 500 });
  assert.deepEqual(policy.register('danmu', 1_000), { allowed: true, attempt: 1, delayMs: 500 });
  assert.deepEqual(policy.register('danmu', 2_000), { allowed: true, attempt: 2, delayMs: 1000 });
  assert.deepEqual(policy.register('danmu', 3_000), { allowed: true, attempt: 3, delayMs: 2000 });
  assert.deepEqual(policy.register('danmu', 4_000), { allowed: false, attempt: 4, delayMs: 0 });
});

test('renderer recovery budget renews after the stability window and is isolated by role', () => {
  const policy = createRendererRecoveryPolicy({ windowMs: 10_000, maximumAttempts: 2, baseDelayMs: 100 });
  assert.equal(policy.register('sidebar', 0).allowed, true);
  assert.equal(policy.register('sidebar', 1_000).allowed, true);
  assert.equal(policy.register('sidebar', 2_000).allowed, false);
  assert.equal(policy.register('overlay', 2_000).allowed, true);
  assert.deepEqual(policy.register('sidebar', 20_000), { allowed: true, attempt: 1, delayMs: 100 });
});
