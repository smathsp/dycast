const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const wall = fs.readFileSync(path.resolve(__dirname, '../src/components/danmu/DanmuWall.vue'), 'utf8');

test('floating danmu wall clears its own queue on session and manual state resets', () => {
  const clearBody = wall.match(/function clearFlyingDanmu\(\): void \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(clearBody, /clearTimeout\(pendingRetryTimer\)/);
  assert.match(clearBody, /clearInterval\(staleDanmuTimer\)/);
  assert.match(clearBody, /displayDanmu\.value\.splice\(0\)/);
  assert.match(clearBody, /displayedIds\.clear\(\)/);

  assert.match(wall, /subscribeDisplayDanmu\(danmu => \{\s*if \(danmu === null\) clearFlyingDanmu\(\);/);
  assert.match(wall, /watch\(\(\) => state\.activeDanmu\.length, length => \{\s*[^}]*if \(length === 0 && displayDanmu\.value\.length > 0\) clearFlyingDanmu\(\);/);
  assert.match(wall, /onBeforeUnmount\(\(\) => \{\s*stopSessionResetSubscription\?\.\(\);/);
});
