const assert = require('node:assert/strict');
const test = require('node:test');
const {
  fetchAllowedRemoteImage,
  isAllowedImageHost,
  normalizeAllowedRemoteImageUrl
} = require('../remote-image-url.cjs');

test('accepts only exact or subdomain matches for known Douyin image CDNs', () => {
  assert.equal(isAllowedImageHost('p3-webcast-sign.douyinpic.com'), true);
  assert.equal(isAllowedImageHost('douyinpic.com'), true);
  assert.equal(isAllowedImageHost('douyinpic.com.example.org'), false);
  assert.equal(isAllowedImageHost('evildouyinpic.com'), false);
});

test('normalizes trusted HTTPS image URLs and removes fragments', () => {
  assert.equal(
    normalizeAllowedRemoteImageUrl('https://p3-webcast-sign.douyinpic.com/avatar.webp?x=1#ignored'),
    'https://p3-webcast-sign.douyinpic.com/avatar.webp?x=1'
  );
});

test('rejects local, credentialed, insecure and unrelated image URLs', () => {
  for (const url of [
    'http://p3-webcast-sign.douyinpic.com/a.jpg',
    'https://127.0.0.1/a.jpg',
    'https://localhost/a.jpg',
    'https://user:secret@douyinpic.com/a.jpg',
    'https://douyinpic.com.example.org/a.jpg'
  ]) {
    assert.throws(() => normalizeAllowedRemoteImageUrl(url), { code: 'REMOTE_IMAGE_URL_NOT_ALLOWED' });
  }
});

test('validates every redirect instead of following a redirect into the local machine', async () => {
  let calls = 0;
  const fetchImplementation = async () => {
    calls += 1;
    return new Response(null, {
      status: 302,
      headers: { location: 'https://127.0.0.1/private' }
    });
  };

  await assert.rejects(
    fetchAllowedRemoteImage(fetchImplementation, 'https://p3.douyinpic.com/avatar.jpg'),
    { code: 'REMOTE_IMAGE_URL_NOT_ALLOWED' }
  );
  assert.equal(calls, 1);
});

test('follows a bounded trusted redirect chain', async () => {
  const calls = [];
  const fetchImplementation = async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 1) {
      return new Response(null, { status: 302, headers: { location: '/final.webp' } });
    }
    return new Response('image', { status: 200, headers: { 'content-type': 'image/webp' } });
  };

  const response = await fetchAllowedRemoteImage(
    fetchImplementation,
    'https://p3.douyinpic.com/start.webp'
  );
  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, 'https://p3.douyinpic.com/final.webp');
  assert.equal(calls[0].options.redirect, 'manual');
});
