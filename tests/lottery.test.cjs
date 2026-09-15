const test = require('node:test');
const assert = require('node:assert/strict');

const lotteryModule = import('../src/danmu/lottery.ts');
const lotteryPolicyModule = import('../src/danmu/lotteryPolicy.ts');

function danmu(overrides = {}) {
  return {
    id: overrides.id || crypto.randomUUID(),
    secUid: 'same-viewer',
    avatar: '',
    nickname: '观众',
    content: '参与',
    timestamp: Date.now(),
    targetAnchorId: 'anchor-large',
    fansClub: [{ anchorId: 'anchor-large', level: 10 }],
    ...overrides
  };
}

test('a historical winner remains eligible in a later lottery round', async () => {
  const { getEligibleLotteryPool } = await lotteryModule;
  const candidate = danmu();

  assert.deepEqual(getEligibleLotteryPool([candidate], 5), [candidate]);
});

test('participant keys match stable identities only within the current batch', async () => {
  const { getParticipantKeys } = await lotteryModule;

  assert.deepEqual(
    getParticipantKeys(danmu({ userId: '123456' })),
    ['secuid:same-viewer', 'uid:123456']
  );
});

test('keyword and current-anchor badge filters still protect lottery eligibility', async () => {
  const { getEligibleLotteryPool } = await lotteryModule;
  const eligible = danmu({ content: '我要Happy' });
  const lowBadge = danmu({ id: 'low', content: '我要Happy', fansClub: [{ anchorId: 'anchor-large', level: 3 }] });
  const wrongKeyword = danmu({ id: 'wrong', content: '路过看看' });

  assert.deepEqual(
    getEligibleLotteryPool([eligible, lowBadge, wrongKeyword], 5, { keyword: 'happy' }),
    [eligible]
  );
});

test('lottery threshold accepts 10 and clamps lower legacy values to 10', async () => {
  const { normalizeLotteryThreshold } = await lotteryPolicyModule;

  assert.equal(normalizeLotteryThreshold(10), 10);
  assert.equal(normalizeLotteryThreshold(9), 10);
  assert.equal(normalizeLotteryThreshold('25'), 25);
  assert.equal(normalizeLotteryThreshold('invalid'), 100);
});

test('automatic lottery attempts exactly at the minimum threshold', async () => {
  const { shouldAttemptAutomaticLottery } = await lotteryPolicyModule;
  const base = {
    isCollecting: true,
    isLotteryActive: false,
    lotteryThreshold: 10,
    remainingWinnerCount: 1,
    lotteryPoolSize: 10
  };

  assert.equal(shouldAttemptAutomaticLottery({ ...base, totalDanmuCount: 9 }), false);
  assert.equal(shouldAttemptAutomaticLottery({ ...base, totalDanmuCount: 10 }), true);
  assert.equal(shouldAttemptAutomaticLottery({ ...base, totalDanmuCount: 10, remainingWinnerCount: 0 }), false);
  assert.equal(shouldAttemptAutomaticLottery({ ...base, totalDanmuCount: 10, isLotteryActive: true }), false);
});
