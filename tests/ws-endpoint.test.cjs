const test = require('node:test');
const assert = require('node:assert/strict');

const endpointModule = import('../src/core/wsEndpoint.ts');

test('accepts official secure Douyin push servers', async () => {
  const { getDouyinPushServerHost } = await endpointModule;
  assert.equal(
    getDouyinPushServerHost('wss://webcast3-ws-web-lf.douyin.com/webcast/im/push/v2/'),
    'webcast3-ws-web-lf.douyin.com'
  );
});

test('rejects lookalike, insecure and local push servers', async () => {
  const { getDouyinPushServerHost } = await endpointModule;
  assert.equal(getDouyinPushServerHost('wss://webcast3-ws-web-lf.douyin.com.evil.test/path'), '');
  assert.equal(getDouyinPushServerHost('https://webcast3-ws-web-lf.douyin.com/path'), '');
  assert.equal(getDouyinPushServerHost('wss://127.0.0.1/path'), '');
});
