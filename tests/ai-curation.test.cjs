const test = require('node:test');
const assert = require('node:assert/strict');
const {
  filterCurationCandidates,
  isAllowedAICurationEndpoint,
  normalizeAICurationEndpoint,
  parseCurationSelectedIds,
} = require('../ai-curation.cjs');

test('normalizes API roots to the chat completions endpoint', () => {
  assert.equal(
    normalizeAICurationEndpoint('https://api.example.com/v1').toString(),
    'https://api.example.com/v1/chat/completions',
  );
  assert.equal(
    normalizeAICurationEndpoint('https://api.example.com/custom/chat').toString(),
    'https://api.example.com/custom/chat',
  );
});

test('only permits HTTPS and local HTTP endpoints', () => {
  assert.equal(isAllowedAICurationEndpoint(new URL('https://api.example.com/v1')), true);
  assert.equal(isAllowedAICurationEndpoint(new URL('http://127.0.0.1:11434/v1')), true);
  assert.equal(isAllowedAICurationEndpoint(new URL('http://localhost:11434/v1')), true);
  assert.equal(isAllowedAICurationEndpoint(new URL('http://api.example.com/v1')), false);
  assert.equal(isAllowedAICurationEndpoint(new URL('file:///tmp/model')), false);
});

test('filters unsafe, repetitive, promotional, and duplicate messages', () => {
  const candidates = filterCurationCandidates([
    { id: '1', nickname: '甲', content: '请问这个功能怎么使用？' },
    { id: '2', nickname: '乙', content: '请问这个功能怎么使用？' },
    { id: '3', nickname: '丙', content: '加微信领红包' },
    { id: '4', nickname: '丁', content: '哈哈哈哈哈哈' },
    { id: '5', nickname: '戊', content: '123456!!!' },
    { id: '6', nickname: '己', content: '能不能分享一下你的经验？' },
  ]);

  assert.deepEqual(candidates.map((item) => item.id), ['1', '6']);
});

test('parses fenced JSON and only returns unique allowed IDs', () => {
  const selected = parseCurationSelectedIds(
    '```json\n{"selectedIds":["2","missing","2",3,"4"]}\n```',
    new Set(['1', '2', '3', '4']),
    3,
  );

  assert.deepEqual(selected, ['2', '3', '4']);
});

test('supports array-form model content', () => {
  const selected = parseCurationSelectedIds(
    [{ text: '{"selectedIds":' }, { text: '["a"]}' }],
    ['a'],
  );

  assert.deepEqual(selected, ['a']);
});
