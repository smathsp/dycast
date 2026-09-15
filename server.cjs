/**
 * dycast 生产服务器
 *  - 静态文件服务（build/renderer/）
 *  - HTTP 代理：/dylive → https://live.douyin.com
 *  - WS 代理：/socket → wss://webcast100-ws-web-lq.douyin.com
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { Readable } = require('stream');

const configuredPort = Number(process.env.DYCAST_PORT || process.env.PORT || 5173);
const PORT = Number.isInteger(configuredPort) && configuredPort >= 0 && configuredPort <= 65535
  ? configuredPort
  : 5173;
const HOST = '127.0.0.1';

// ===== MIME 类型 =====
const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.webm': 'audio/webm',
  '.m4s': 'audio/mp4',
  '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4'
};

// ===== 前端构建目录 =====
// Electron 打包后通过环境变量传入；保留 DYCAST_DIST 兼容旧的外部启动方式。
const RENDERER_DIR = process.env.DYCAST_RENDERER ||
  process.env.DYCAST_DIST ||
  path.join(__dirname, 'build', 'renderer');
const AUDIO_DIR = process.env.DYCAST_AUDIO_DIR || path.join(__dirname, 'audio');
const STATIC_ROOT = path.resolve(RENDERER_DIR);

// ===== 代理目标 =====
const DOUYIN_HOST = 'live.douyin.com';
const WS_HOST = 'webcast100-ws-web-lq.douyin.com';
const WS_PATH = '/webcast/im/push/v2/';
const DYCAST_WS_HOST_PARAM = '__dycast_ws_host';
const DOUYIN_PUSH_HOST_PATTERN = /^webcast[\w-]*-ws-web-[\w-]+\.douyin\.com$/i;

// ===== 上游客户端标识 =====
// HTTP 初始化请求和 WebSocket 握手必须使用同一个 UA，避免抖音把同一会话
// 识别成两个不同的客户端。签名侧也应与该值保持一致。
const UPSTREAM_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';

// Electron 注入其 Chromium 网络栈后，生产版会自动遵循系统代理/TUN。
let electronNet = null;
const PROXY_TIMEOUT_MS = 30000;
const WS_HANDSHAKE_TIMEOUT_MS = 15000;
const PROXY_REQUEST_BODY_LIMIT_BYTES = 64 * 1024;

function normalizeCookie(cookie) {
  return cookie
    .replace(/; Domain=[^;]+/i, '')
    .replace(/; SameSite=None/gi, '')
    .replace(/; Secure=true/gi, '');
}

function getForwardHeaders(clientReq, targetHost) {
  const headers = {
    ...clientReq.headers,
    host: targetHost,
    'user-agent': UPSTREAM_USER_AGENT,
    referer: `https://${targetHost}/`
  };

  delete headers.origin;
  delete headers['accept-encoding'];
  delete headers.connection;
  delete headers['content-length'];
  return headers;
}

function setCorsHeader(clientReq, clientRes) {
  const origin = clientReq.headers.origin || '';
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    clientRes.setHeader('Access-Control-Allow-Origin', origin);
  }
}

async function readRequestBody(clientReq, maximumBytes = PROXY_REQUEST_BODY_LIMIT_BYTES) {
  const declaredLength = Number(clientReq.headers?.['content-length']);
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    const error = new Error(`Proxy request body exceeds ${maximumBytes} bytes`);
    error.code = 'REQUEST_BODY_TOO_LARGE';
    throw error;
  }
  const chunks = [];
  let receivedBytes = 0;
  for await (const chunk of clientReq) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    receivedBytes += value.byteLength;
    if (receivedBytes > maximumBytes) {
      const error = new Error(`Proxy request body exceeds ${maximumBytes} bytes`);
      error.code = 'REQUEST_BODY_TOO_LARGE';
      throw error;
    }
    chunks.push(value);
  }
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

async function proxyHttpWithElectronNet(clientReq, clientRes, targetHost, targetPath) {
  const targetUrl = `https://${targetHost}${targetPath}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
  const abortOnClientDisconnect = () => controller.abort();
  clientReq.once('aborted', abortOnClientDisconnect);
  clientRes.once('close', abortOnClientDisconnect);
  let requestBody;
  try {
    const method = clientReq.method || 'GET';
    requestBody = method === 'GET' || method === 'HEAD'
      ? undefined
      : (await readRequestBody(clientReq)) || Buffer.alloc(0);
    const requestHeaders = getForwardHeaders(clientReq, targetHost);
    // Chromium 会根据目标 URL 自动设置 Host，不允许 fetch 手工覆盖。
    delete requestHeaders.host;
    // electronNet.fetch (Chromium) 对 headers 校验比 Node.js 严格，
    // 需要移除 Chromium 认为无效或禁止的头。
    const forbiddenHeaders = [
      'cookie', 'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform',
      'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest', 'sec-fetch-user',
      'upgrade-insecure-requests', 'accept-encoding', 'connection',
      'content-length', 'host', 'origin'
    ];
    for (const h of forbiddenHeaders) {
      delete requestHeaders[h];
    }
    const response = await electronNet.fetch(targetUrl, {
      method,
      headers: requestHeaders,
      body: requestBody,
      redirect: 'follow',
      signal: controller.signal
    });

    const responseHeaders = {};
    const skippedHeaders = new Set([
      'connection',
      'content-encoding',
      'content-length',
      'keep-alive',
      'proxy-authenticate',
      'proxy-authorization',
      'te',
      'trailer',
      'transfer-encoding',
      'upgrade'
    ]);
    response.headers.forEach((value, name) => {
      if (!skippedHeaders.has(name.toLowerCase()) && name.toLowerCase() !== 'set-cookie') {
        responseHeaders[name] = value;
      }
    });

    const setCookies = response.headers.getSetCookie?.() || [];
    if (setCookies.length) responseHeaders['set-cookie'] = setCookies.map(normalizeCookie);

    setCorsHeader(clientReq, clientRes);
    clientRes.writeHead(response.status, responseHeaders);
    if (!response.body || method === 'HEAD') {
      clientRes.end();
      return;
    }
    // fetch 在响应头到达时就完成，正文可能仍会停滞；等待整条管道完成后再解除
    // 超时保护，避免连接页面永远卡在“连接中”。
    await new Promise((resolve, reject) => {
      const body = Readable.fromWeb(response.body);
      body.once('error', reject);
      clientRes.once('finish', resolve);
      body.pipe(clientRes);
    });
  } catch (err) {
    if (clientReq.aborted || clientRes.destroyed) return;
    console.error('[electron proxy error]', targetUrl, err.stack || err.message);
    if (clientRes.headersSent) {
      clientRes.destroy(err);
      return;
    }
    if (err?.code === 'REQUEST_BODY_TOO_LARGE') {
      clientRes.writeHead(413);
      clientRes.end('Request Body Too Large');
      return;
    }
    if (err?.name === 'AbortError') {
      clientRes.writeHead(504);
      clientRes.end('Proxy Timeout');
      return;
    }
    // electronNet.fetch 失败时回退到 Node.js 原生 https
    console.warn('[proxy] falling back to Node.js https.request');
    proxyHttpWithNodeHttps(clientReq, clientRes, targetHost, targetPath, requestBody);
  } finally {
    clearTimeout(timeout);
    clientReq.removeListener('aborted', abortOnClientDisconnect);
    clientRes.removeListener('close', abortOnClientDisconnect);
  }
}

// ===== HTTP 代理（Node.js 原生 https） =====
function proxyHttpWithNodeHttps(clientReq, clientRes, targetHost, targetPath, requestBody, runtime = {}) {
  const options = {
    hostname: targetHost,
    port: 443,
    path: targetPath,
    method: clientReq.method,
    headers: {
      ...getForwardHeaders(clientReq, targetHost)
    }
  };

  // 移除可能导致问题的头
  delete options.headers['origin'];
  delete options.headers['accept-encoding'];

  const request = runtime.request || https.request;
  const logError = runtime.logError || ((...args) => console.error(...args));
  let proxyReq;
  let proxyRes;
  let terminal = false;

  const destroyQuietly = value => {
    if (!value || value.destroyed) return;
    try { value.destroy(); } catch {}
  };
  const removeLifecycleListeners = () => {
    clientReq.removeListener?.('aborted', handleDownstreamAbort);
    clientRes.removeListener?.('close', handleDownstreamAbort);
    clientRes.removeListener?.('finish', handleDownstreamFinish);
  };
  const handleDownstreamAbort = () => {
    if (terminal) return;
    terminal = true;
    removeLifecycleListeners();
    destroyQuietly(proxyRes);
    destroyQuietly(proxyReq);
  };
  const handleDownstreamFinish = () => {
    if (terminal) return;
    terminal = true;
    removeLifecycleListeners();
  };
  const failProxy = (error, statusCode = 502, responseText = 'Proxy Error') => {
    if (terminal) return;
    terminal = true;
    removeLifecycleListeners();
    destroyQuietly(proxyRes);
    destroyQuietly(proxyReq);
    logError('[proxy error]', error?.message || error);
    if (clientRes.destroyed) return;
    if (clientRes.headersSent) {
      try { clientRes.destroy(error); } catch {}
      return;
    }
    clientRes.writeHead(statusCode);
    clientRes.end(responseText);
  };

  clientReq.once('aborted', handleDownstreamAbort);
  clientRes.once('close', handleDownstreamAbort);
  clientRes.once('finish', handleDownstreamFinish);

  try {
    proxyReq = request(options, incomingResponse => {
      if (terminal) {
        destroyQuietly(incomingResponse);
        return;
      }
      proxyRes = incomingResponse;
      const handleProxyResponseError = error => {
        failProxy(error instanceof Error ? error : new Error('Upstream response failed'));
      };
      proxyRes.once('error', handleProxyResponseError);
      proxyRes.once('aborted', () => handleProxyResponseError(new Error('Upstream response aborted')));

      // 处理 set-cookie：移除 domain 限制
      if (proxyRes.headers['set-cookie']) {
        proxyRes.headers['set-cookie'] = proxyRes.headers['set-cookie'].map(cookie =>
          cookie
            .replace(/; Domain=[^;]+/i, '')
            .replace(/; SameSite=None/gi, '')
            .replace(/; Secure=true/gi, '')
        );
      }

      try {
        // CORS — 仅允许本地访问
        setCorsHeader(clientReq, clientRes);
        clientRes.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
        proxyRes.pipe(clientRes, { end: true });
      } catch (error) {
        failProxy(error);
      }
    });
  } catch (error) {
    failProxy(error);
    return;
  }

  proxyReq.once('error', err => failProxy(err));
  proxyReq.setTimeout(PROXY_TIMEOUT_MS, () => {
    if (!terminal) proxyReq.destroy(new Error('Proxy request timed out'));
  });
  if (Buffer.isBuffer(requestBody)) {
    proxyReq.end(requestBody);
  } else if (clientReq.method === 'GET' || clientReq.method === 'HEAD') {
    // GET/HEAD are the only public proxy methods and never need an upload body.
    // Drain any unexpected bytes locally without forwarding or buffering them.
    clientReq.resume?.();
    proxyReq.end();
  } else {
    clientReq.pipe(proxyReq, { end: true });
  }
}

// ===== HTTP 代理 =====
function proxyHttp(clientReq, clientRes, targetHost, targetPath) {
  if (electronNet) {
    proxyHttpWithElectronNet(clientReq, clientRes, targetHost, targetPath);
    return;
  }
  proxyHttpWithNodeHttps(clientReq, clientRes, targetHost, targetPath);
}

// ===== WS 代理 =====
function getWebSocketProxyTarget(clientReq) {
  const requestUrl = new URL(String(clientReq.url || '/socket'), 'http://127.0.0.1');
  const requestedHost = String(requestUrl.searchParams.get(DYCAST_WS_HOST_PARAM) || '').toLowerCase();
  requestUrl.searchParams.delete(DYCAST_WS_HOST_PARAM);
  return {
    targetHost: DOUYIN_PUSH_HOST_PATTERN.test(requestedHost) ? requestedHost : WS_HOST,
    targetPath: `${WS_PATH}${requestUrl.search}`
  };
}

function createWebSocketProxyOptions(clientReq, targetHost, targetPath) {
  const requestUrl = String(clientReq.url || '');
  const queryIndex = requestUrl.indexOf('?');
  const query = queryIndex >= 0 ? requestUrl.slice(queryIndex) : '';
  const headers = {
    ...clientReq.headers,
    host: targetHost,
    'user-agent': UPSTREAM_USER_AGENT,
    connection: 'Upgrade',
    upgrade: 'websocket'
  };

  // 本代理只做字节透传，无法安全地重新协商 permessage-deflate。若把浏览器的
  // 扩展请求发给上游、却没有把协商结果完整返回浏览器，上游的压缩帧会被浏览器
  // 当成协议错误。禁用扩展可确保两端始终传输未压缩 WebSocket 帧。
  delete headers['sec-websocket-extensions'];
  delete headers.origin;
  delete headers['proxy-connection'];

  return {
    hostname: targetHost,
    port: 443,
    path: targetPath || WS_PATH + query,
    method: 'GET',
    headers
  };
}

function proxyWs(clientReq, clientSocket, clientHead, targetHost, runtime = {}) {
  const resolvedTarget = getWebSocketProxyTarget(clientReq);
  const effectiveTargetHost = targetHost || resolvedTarget.targetHost;
  const targetPath = targetHost ? undefined : resolvedTarget.targetPath;
  const options = createWebSocketProxyOptions(clientReq, effectiveTargetHost, targetPath);
  const request = runtime.request || https.request;
  const handshakeTimeoutMs = Number.isFinite(runtime.handshakeTimeoutMs)
    ? Math.max(1, runtime.handshakeTimeoutMs)
    : WS_HANDSHAKE_TIMEOUT_MS;
  const logError = runtime.logError || ((...args) => console.error(...args));

  let proxyReq;
  let proxySocket;
  let handshakeFinished = false;
  let downstreamClosed = false;
  let handshakeTimer;

  const clearHandshakeTimer = () => {
    if (!handshakeTimer) return;
    clearTimeout(handshakeTimer);
    handshakeTimer = undefined;
  };

  const destroySocket = socket => {
    if (!socket || socket.destroyed) return;
    try { socket.destroy(); } catch {}
  };

  const cancelPendingUpstream = () => {
    if (!proxyReq || handshakeFinished || proxyReq.destroyed) return;
    try { proxyReq.destroy(); } catch {}
  };

  const handleDownstreamTermination = () => {
    if (downstreamClosed) return;
    downstreamClosed = true;
    clearHandshakeTimer();
    cancelPendingUpstream();
    destroySocket(proxySocket);
  };

  const rejectClientHandshake = () => {
    if (downstreamClosed || clientSocket.destroyed) return;
    const response = [
      'HTTP/1.1 502 Bad Gateway',
      'Connection: close',
      'Content-Length: 0',
      '',
      ''
    ].join('\r\n');
    try {
      if (typeof clientSocket.end === 'function') {
        clientSocket.end(response);
        return;
      }
      clientSocket.write(response);
    } catch {}
    destroySocket(clientSocket);
  };

  clientSocket.once('close', handleDownstreamTermination);
  clientSocket.once('error', handleDownstreamTermination);

  try {
    proxyReq = request(options);
  } catch (error) {
    handshakeFinished = true;
    logError('[ws proxy error]', error?.message || error);
    rejectClientHandshake();
    return;
  }

  handshakeTimer = setTimeout(() => {
    if (handshakeFinished || downstreamClosed) return;
    handshakeFinished = true;
    logError(`[ws proxy timeout] upstream handshake exceeded ${handshakeTimeoutMs}ms`);
    if (!proxyReq.destroyed) {
      try { proxyReq.destroy(); } catch {}
    }
    destroySocket(clientSocket);
  }, handshakeTimeoutMs);

  proxyReq.once('upgrade', (proxyRes, connectedProxySocket, proxyHead) => {
    if (handshakeFinished || downstreamClosed) {
      destroySocket(connectedProxySocket);
      return;
    }
    handshakeFinished = true;
    clearHandshakeTimer();
    proxySocket = connectedProxySocket;
    proxySocket.once('error', () => destroySocket(clientSocket));
    proxySocket.once('close', () => destroySocket(clientSocket));

    const accept = proxyRes.headers['sec-websocket-accept'];
    if (!accept || /[\r\n]/.test(String(accept))) {
      logError('[ws proxy error] upstream returned an invalid WebSocket accept header');
      destroySocket(proxySocket);
      rejectClientHandshake();
      return;
    }

    const headers = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`
    ];
    const selectedProtocol = proxyRes.headers['sec-websocket-protocol'];
    if (selectedProtocol && !/[\r\n]/.test(String(selectedProtocol))) {
      headers.push(`Sec-WebSocket-Protocol: ${selectedProtocol}`);
    }
    headers.push('', '');

    try {
      clientSocket.write(headers.join('\r\n'));

      // 转发握手后已预读的数据。
      if (proxyHead.length > 0) proxySocket.unshift(proxyHead);
      if (clientHead.length > 0) clientSocket.unshift(clientHead);

      proxySocket.pipe(clientSocket);
      clientSocket.pipe(proxySocket);
    } catch (error) {
      logError('[ws proxy tunnel error]', error?.message || error);
      destroySocket(proxySocket);
      destroySocket(clientSocket);
      return;
    }

  });

  // 上游没有接受升级时，https.ClientRequest 会触发 response 而不是 upgrade。
  // 必须结束两端，否则浏览器会一直停留在 CONNECTING。
  proxyReq.once('response', proxyRes => {
    if (handshakeFinished) {
      proxyRes.destroy?.();
      return;
    }
    handshakeFinished = true;
    clearHandshakeTimer();
    logError(`[ws proxy rejected] upstream returned HTTP ${proxyRes.statusCode || 'unknown'}`);
    proxyRes.destroy?.();
    rejectClientHandshake();
  });

  proxyReq.once('error', err => {
    clearHandshakeTimer();
    if (downstreamClosed || (handshakeFinished && proxySocket)) return;
    handshakeFinished = true;
    logError('[ws proxy error]', err.message);
    destroySocket(proxySocket);
    rejectClientHandshake();
  });

  proxyReq.once('close', () => {
    if (handshakeFinished || downstreamClosed) return;
    handshakeFinished = true;
    clearHandshakeTimer();
    destroySocket(clientSocket);
  });

  proxyReq.end();
}

// ===== 静态文件服务 =====
function setSecurityHeaders(res) {
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https: http:",
    "media-src 'self' data: blob: https: http:",
    "font-src 'self' data:",
    "connect-src 'self' https: http: wss: ws:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'"
  ].join('; '));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

function isPathInside(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function serveStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end('Method Not Allowed');
    return;
  }

  let urlPath;
  try {
    const rawPath = (req.url || '/').split('?')[0];
    urlPath = rawPath === '/' ? 'index.html' : decodeURIComponent(rawPath).replace(/^[/\\]+/, '');
  } catch {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  let filePath = path.resolve(STATIC_ROOT, urlPath);
  if (!isPathInside(STATIC_ROOT, filePath)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  // 如果文件不存在，返回 index.html（SPA 路由）
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(STATIC_ROOT, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';

  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': mime,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'max-age=31536000'
    });
    if (req.method === 'HEAD') res.end();
    else res.end(content);
  } catch (err) {
    res.writeHead(404);
    res.end('Not Found');
  }
}

// ===== Electron 本地音频文件 =====
function serveLocalAudio(req, res) {
  try {
    const parsed = new URL(req.url, 'http://localhost');
    const parts = parsed.pathname.replace(/^\/local-audio\//, '').split('/').map(decodeURIComponent);
    if (parts.length !== 2 || !['charging', 'lottery', 'winner'].includes(parts[0])) {
      res.writeHead(400);
      res.end('Bad Request');
      return;
    }
    const [category, fileName] = parts;
    if (path.basename(fileName) !== fileName) {
      res.writeHead(400);
      res.end('Bad Request');
      return;
    }
    const categoryDirNames = { charging: '充能', lottery: '揭晓', winner: 'Happy' };
    const categoryRoot = path.resolve(AUDIO_DIR, categoryDirNames[category]);
    const filePath = path.resolve(categoryRoot, fileName);
    if (!filePath.startsWith(`${categoryRoot}${path.sep}`) || !fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    const stat = fs.statSync(filePath);
    const mime = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
        res.end();
        return;
      }
      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
      if (start > end || start >= stat.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
        res.end();
        return;
      }
      res.writeHead(206, {
        'Content-Type': mime,
        'Content-Length': end - start + 1,
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache'
      });
      if (req.method === 'HEAD') res.end();
      else fs.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }

    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache'
    });
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error('[audio file error]', error.message);
    res.writeHead(500);
    res.end('Audio Error');
  }
}

// ===== 创建服务器 =====
const server = http.createServer((req, res) => {
  setSecurityHeaders(res);
  const url = req.url || '/';

  if (url.startsWith('/local-audio/')) {
    serveLocalAudio(req, res);
    return;
  }

  // 代理：抖音直播间信息
  if (url.startsWith('/dylive/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      // This endpoint never needs an upload body. Rejecting before proxying also
      // prevents an untrusted local page from making the process buffer one.
      req.resume();
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end('Method Not Allowed');
      return;
    }
    const targetPath = url.replace(/^\/dylive/, '');
    proxyHttp(req, res, DOUYIN_HOST, targetPath);
    return;
  }

  // 静态文件
  serveStatic(req, res);
});

// 主进程退出时需要主动销毁升级后的 WebSocket 和 keep-alive 连接；仅 server.close
// 会继续等待这些连接，表现为窗口消失但 Electron 进程仍残留。
const activeSockets = new Set();
server.on('connection', socket => {
  activeSockets.add(socket);
  socket.once('close', () => activeSockets.delete(socket));
});

// ===== WebSocket 代理 =====
server.on('upgrade', (req, socket, head) => {
  if (String(req.url || '').startsWith('/socket')) {
    proxyWs(req, socket, head);
    return;
  }
  socket.destroy();
});

function listenServer(targetServer, port = PORT, host = HOST) {
  if (targetServer.listening) return Promise.resolve(targetServer);
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      targetServer.removeListener('error', handleStartupError);
      targetServer.removeListener('listening', handleListening);
    };
    const handleStartupError = error => {
      cleanup();
      reject(error);
    };
    const handleListening = () => {
      cleanup();
      resolve(targetServer);
    };
    targetServer.once('error', handleStartupError);
    targetServer.once('listening', handleListening);
    try {
      targetServer.listen(port, host);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

// Keep a permanent listener so a later asynchronous server error cannot become
// an uncaught EventEmitter error. Startup failures are also surfaced through the
// exported startup Promise for callers that want the exact failure immediately.
server.on('error', error => {
  console.error('[dycast server error]', error?.stack || error?.message || error);
});
server.startup = listenServer(server, PORT, HOST);

if (require.main === module) {
  server.startup.then(() => {
    console.log('');
    console.log('  ╔══════════════════════════════════════╗');
    console.log('  ║       抖音弹幕姬 dycast v1.1.0       ║');
    console.log('  ╠══════════════════════════════════════╣');
    console.log(`  ║  主页面:  http://${HOST}:${PORT}/       ║`);
    console.log(`  ║  弹幕页:  http://${HOST}:${PORT}/?danmu  ║`);
    console.log('  ╚══════════════════════════════════════╝');
    console.log('');
  }, error => {
    console.error('[dycast] 代理服务器启动失败:', error?.message || error);
    process.exitCode = 1;
  });
} else {
  // 被 Electron require 时仍自动启动，保持现有调用方式兼容；main 也可以
  // await server.startup 直接捕获 EADDRINUSE 等异步 listen 失败。
  server.startup.then(() => {
    console.log(`[dycast] 代理服务器已启动: http://${HOST}:${PORT}`);
  }, error => {
    console.error('[dycast] 代理服务器启动失败:', error?.message || error);
  });
}

module.exports = server;
server.setElectronNet = value => {
  electronNet = value;
};
server.shutdown = callback => {
  for (const socket of activeSockets) socket.destroy();
  activeSockets.clear();
  if (!server.listening) {
    callback?.();
    return;
  }
  server.close(error => callback?.(error));
  server.closeAllConnections?.();
};

// 只暴露无状态构造器与可注入传输的代理入口，便于对握手边界做本地回归测试。
// Electron 生产代码仍直接使用上面的 server 接口。
server.__test = Object.freeze({
  UPSTREAM_USER_AGENT,
  WS_HANDSHAKE_TIMEOUT_MS,
  PROXY_REQUEST_BODY_LIMIT_BYTES,
  getWebSocketProxyTarget,
  getForwardHeaders,
  createWebSocketProxyOptions,
  readRequestBody,
  proxyHttpWithNodeHttps,
  proxyWs,
  listenServer
});
