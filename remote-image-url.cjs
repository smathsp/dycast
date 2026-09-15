const ALLOWED_IMAGE_HOST_SUFFIXES = Object.freeze([
  'douyinpic.com',
  'byteimg.com',
  'ibyteimg.com',
  'toutiaoimg.com',
  'douyinstatic.com',
  'iesdouyin.com',
  'snssdk.com',
  'amemv.com'
]);

const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

function imageUrlError(message, code = 'REMOTE_IMAGE_URL_NOT_ALLOWED') {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isAllowedImageHost(hostname) {
  const normalized = String(hostname || '').toLowerCase().replace(/\.$/, '');
  return ALLOWED_IMAGE_HOST_SUFFIXES.some(suffix =>
    normalized === suffix || normalized.endsWith(`.${suffix}`)
  );
}

function normalizeAllowedRemoteImageUrl(rawUrl) {
  const serialized = String(rawUrl || '').trim();
  if (!serialized || serialized.length > 8192) {
    throw imageUrlError('头像地址为空或过长');
  }

  let url;
  try {
    url = new URL(serialized);
  } catch {
    throw imageUrlError('头像地址无效');
  }

  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
    throw imageUrlError('头像必须来自受信任的 HTTPS 图片服务');
  }
  if (!isAllowedImageHost(url.hostname)) {
    throw imageUrlError('头像地址不属于受信任的抖音图片服务');
  }

  url.hash = '';
  return url.toString();
}

async function cancelResponseBody(response) {
  try {
    await response?.body?.cancel?.();
  } catch {}
}

async function fetchAllowedRemoteImage(fetchImplementation, rawUrl, signal, maximumRedirects = 4) {
  if (typeof fetchImplementation !== 'function') throw new TypeError('fetchImplementation 必须是函数');
  const redirectLimit = Math.max(0, Math.min(8, Math.floor(Number(maximumRedirects) || 0)));
  let currentUrl = normalizeAllowedRemoteImageUrl(rawUrl);

  for (let redirectCount = 0; ; redirectCount += 1) {
    const response = await fetchImplementation(currentUrl, { redirect: 'manual', signal });
    if (!REDIRECT_STATUS_CODES.has(response.status)) {
      // 某些运行时可能无视 manual；即使发生隐式跳转，也必须重新校验最终地址。
      if (response.url) normalizeAllowedRemoteImageUrl(response.url);
      return response;
    }

    const location = response.headers?.get?.('location');
    await cancelResponseBody(response);
    if (!location) throw imageUrlError('头像跳转缺少目标地址', 'REMOTE_IMAGE_REDIRECT_INVALID');
    if (redirectCount >= redirectLimit) {
      throw imageUrlError('头像跳转次数过多', 'REMOTE_IMAGE_TOO_MANY_REDIRECTS');
    }

    let redirectedUrl;
    try {
      redirectedUrl = new URL(location, currentUrl).toString();
    } catch {
      throw imageUrlError('头像跳转地址无效', 'REMOTE_IMAGE_REDIRECT_INVALID');
    }
    currentUrl = normalizeAllowedRemoteImageUrl(redirectedUrl);
  }
}

module.exports = {
  ALLOWED_IMAGE_HOST_SUFFIXES,
  fetchAllowedRemoteImage,
  isAllowedImageHost,
  normalizeAllowedRemoteImageUrl
};
