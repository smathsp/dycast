const assert = require('node:assert/strict');
const test = require('node:test');
const { getTrustedRendererMode } = require('../trusted-renderer-url.cjs');

const ORIGIN = 'http://127.0.0.1:15173';

test('recognizes only the five exact built-in renderer entry URLs', () => {
  assert.equal(getTrustedRendererMode(`${ORIGIN}/`, ORIGIN), 'main');
  assert.equal(getTrustedRendererMode(`${ORIGIN}/?danmu`, ORIGIN), 'danmu');
  assert.equal(getTrustedRendererMode(`${ORIGIN}/?display`, ORIGIN), 'display');
  assert.equal(getTrustedRendererMode(`${ORIGIN}/?highlight`, ORIGIN), 'highlight');
  assert.equal(getTrustedRendererMode(`${ORIGIN}/?live-info`, ORIGIN), 'live-info');
});

test('rejects same-origin proxy, storage and malformed mode documents', () => {
  for (const url of [
    `${ORIGIN}/dylive/`,
    `${ORIGIN}/socket`,
    `${ORIGIN}/storage.html`,
    `${ORIGIN}/?danmu&display`,
    `${ORIGIN}/?danmu=1`,
    `${ORIGIN}/?unknown`,
    'https://live.douyin.com/'
  ]) {
    assert.equal(getTrustedRendererMode(url, ORIGIN), '', url);
  }
});
