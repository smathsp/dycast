class ResponseBodyTooLargeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ResponseBodyTooLargeError';
    this.code = 'RESPONSE_BODY_TOO_LARGE';
  }
}

function normalizeLimit(value) {
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new TypeError('响应大小限制必须是正整数');
  }
  return limit;
}

function declaredContentLength(response) {
  const raw = response?.headers?.get?.('content-length');
  if (raw == null || !/^\d+$/.test(String(raw).trim())) return null;
  const length = Number(raw);
  return Number.isSafeInteger(length) ? length : null;
}

/**
 * 有界读取 fetch Response。先检查 Content-Length，再逐块检查真实字节数，
 * 防止远端省略或伪造长度时 arrayBuffer()/text() 把主进程内存耗尽。
 */
async function readResponseBuffer(response, maxBytes, label = '远程响应') {
  const limit = normalizeLimit(maxBytes);
  const declared = declaredContentLength(response);
  if (declared !== null && declared > limit) {
    try { await response?.body?.cancel?.(); } catch {}
    throw new ResponseBodyTooLargeError(`${label}超过大小限制`);
  }

  const reader = response?.body?.getReader?.();
  if (!reader) {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > limit) throw new ResponseBodyTooLargeError(`${label}超过大小限制`);
    return bytes;
  }

  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      total += chunk.length;
      if (!Number.isSafeInteger(total) || total > limit) {
        try { await reader.cancel(); } catch {}
        throw new ResponseBodyTooLargeError(`${label}超过大小限制`);
      }
      chunks.push(chunk);
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }
  return Buffer.concat(chunks, total);
}

async function readResponseText(response, maxBytes, label = '远程响应') {
  return (await readResponseBuffer(response, maxBytes, label)).toString('utf8');
}

module.exports = {
  ResponseBodyTooLargeError,
  readResponseBuffer,
  readResponseText
};
