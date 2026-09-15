const assert = require('node:assert/strict');
const test = require('node:test');
const { readResponseBuffer, readResponseText } = require('../response-body.cjs');

test('reads a normal streamed response as bytes and UTF-8 text', async () => {
  const buffer = await readResponseBuffer(new Response('猫猫'), 32, '头像');
  assert.equal(buffer.toString('utf8'), '猫猫');
  assert.equal(await readResponseText(new Response('ok'), 8, '接口响应'), 'ok');
});

test('rejects an oversized declared Content-Length before reading the stream', async () => {
  let canceled = false;
  const response = {
    headers: { get: () => '999' },
    body: { cancel: async () => { canceled = true; } }
  };
  await assert.rejects(readResponseBuffer(response, 8, '头像'), { code: 'RESPONSE_BODY_TOO_LARGE' });
  assert.equal(canceled, true);
});

test('cancels a streamed response whose real bytes exceed the limit', async () => {
  let canceled = false;
  let released = false;
  const chunks = [Buffer.alloc(5), Buffer.alloc(5)];
  const reader = {
    async read() {
      return chunks.length ? { done: false, value: chunks.shift() } : { done: true };
    },
    async cancel() { canceled = true; },
    releaseLock() { released = true; }
  };
  const response = {
    headers: { get: () => null },
    body: { getReader: () => reader }
  };
  await assert.rejects(readResponseBuffer(response, 8), { code: 'RESPONSE_BODY_TOO_LARGE' });
  assert.equal(canceled, true);
  assert.equal(released, true);
});
