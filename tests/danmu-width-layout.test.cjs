const assert = require('node:assert/strict');
const test = require('node:test');

const widthLayoutModule = import('../src/danmu/widthLayout.ts');
const measure = (text, fontSize) => Array.from(text).length * fontSize;

test('nickname and content hit boxes keep only small glyph-safety margins', async () => {
  const { calculateFlyingDanmuWidth } = await widthLayoutModule;
  const layout = calculateFlyingDanmuWidth({
    nickname: '猫猫',
    content: '晚上好',
    hasEmoji: false,
    badgeLevel: 8,
    fontSize: 20,
    visualLevel: 8,
    height: 64,
    viewportWidth: 1080
  }, measure);

  assert.equal(layout.nicknameWidth, measure('猫猫：', 20) + 2);
  assert.equal(layout.contentWidth, measure('晚上好', 20) + 3.2);
});

test('a typical 500-character long comment is allocated its complete measured width', async () => {
  const { calculateFlyingDanmuWidth, MAX_FLYING_DANMU_WIDTH_PX } = await widthLayoutModule;
  const content = '长'.repeat(500);
  const layout = calculateFlyingDanmuWidth({
    nickname: '长弹幕测试',
    content,
    hasEmoji: false,
    badgeLevel: 16,
    fontSize: 22,
    visualLevel: 16,
    height: 150,
    viewportWidth: 1920
  }, measure);

  assert.ok(layout.contentWidth > measure(content, 22));
  assert.ok(layout.width < MAX_FLYING_DANMU_WIDTH_PX);
});

test('pathological text remains capped to a bounded compositor layer', async () => {
  const { calculateFlyingDanmuWidth, MAX_FLYING_DANMU_WIDTH_PX } = await widthLayoutModule;
  const layout = calculateFlyingDanmuWidth({
    nickname: '超长昵称'.repeat(300),
    content: '异常内容'.repeat(2_000),
    hasEmoji: false,
    badgeLevel: 20,
    fontSize: 36,
    visualLevel: 20,
    height: 294,
    viewportWidth: 3840
  }, measure);

  assert.equal(layout.width, MAX_FLYING_DANMU_WIDTH_PX);
  assert.ok(layout.nicknameWidth + layout.contentWidth < MAX_FLYING_DANMU_WIDTH_PX);
});
