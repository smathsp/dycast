const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('winner overlay stays above a continuously mounted floating danmu wall', () => {
  const danmuView = read('src/views/DanmuView.vue');
  const lotteryAnimation = read('src/components/danmu/LotteryAnimation.vue');
  const store = read('src/danmu/store.ts');

  assert.match(danmuView, /<div class="danmu-main" v-if="state\.isDisplaying">\s*<DanmuWall/);
  assert.match(danmuView, /\.danmu-main \{[\s\S]*?position: relative;[\s\S]*?z-index: 1;/);
  assert.match(lotteryAnimation, /\.lottery-overlay \{[\s\S]*?position: fixed;[\s\S]*?z-index: 100100;/);
  assert.match(store, /if \(state\.isDisplaying\) \{\s*state\.activeDanmu\.push\(immutableDanmu\)/);

  const startLotteryBody = store.match(/export function startLottery\(\): boolean \{[\s\S]*?\n\}/)?.[0] || '';
  const closeLotteryBody = store.match(/export function closeLottery\(\) \{[\s\S]*?\n\}/)?.[0] || '';
  assert.doesNotMatch(startLotteryBody, /activeDanmu\.splice/);
  assert.doesNotMatch(closeLotteryBody, /activeDanmu\.splice/);
});
