/**
 * dycast 生产服务器
 *  - 静态文件服务（dist/）
 *  - HTTP 代理：/dylive → https://live.douyin.com
 *  - WS 代理：/socket → wss://webcast100-ws-web-lq.douyin.com
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.DYCAST_PORT || process.env.PORT || 5173;

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
  '.m4s': 'audio/mp4',
  '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4'
};

// ===== dist 目录 =====
// Electron 打包后通过环境变量传入，否则用 __dirname
const DIST = process.env.DYCAST_DIST || path.join(__dirname, 'dist');

// ===== 代理目标 =====
const DOUYIN_HOST = 'live.douyin.com';
const WS_HOST = 'webcast100-ws-web-lq.douyin.com';
const WS_PATH = '/webcast/im/push/v2/';

// ===== UA =====
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';

// ===== HTTP 代理 =====
function proxyHttp(clientReq, clientRes, targetHost, targetPath) {
  const options = {
    hostname: targetHost,
    port: 443,
    path: targetPath,
    method: clientReq.method,
    headers: {
      ...clientReq.headers,
      host: targetHost,
      'user-agent': UA,
      referer: `https://${targetHost}/`
    }
  };

  // 移除可能导致问题的头
  delete options.headers['origin'];
  delete options.headers['accept-encoding'];

  const proxyReq = https.request(options, (proxyRes) => {
    // 处理 set-cookie：移除 domain 限制
    if (proxyRes.headers['set-cookie']) {
      proxyRes.headers['set-cookie'] = proxyRes.headers['set-cookie'].map(cookie =>
        cookie
          .replace(/; Domain=[^;]+/i, '')
          .replace(/; SameSite=None/gi, '')
          .replace(/; Secure=true/gi, '')
      );
    }

    // CORS — 仅允许本地访问
    const origin = clientReq.headers['origin'] || '';
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      clientRes.setHeader('Access-Control-Allow-Origin', origin);
    }
    clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(clientRes, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.error('[proxy error]', err.message);
    if (!clientRes.headersSent) {
      clientRes.writeHead(502);
      clientRes.end('Proxy Error');
    }
  });

  clientReq.pipe(proxyReq, { end: true });
}

// ===== WS 代理 =====
function proxyWs(clientReq, clientSocket, clientHead, targetHost) {
  const targetUrl = `wss://${targetHost}${WS_PATH}${clientReq.url.split('?')[1] ? '?' + clientReq.url.split('?')[1] : ''}`;

  const options = {
    hostname: targetHost,
    port: 443,
    path: WS_PATH + (clientReq.url.includes('?') ? '?' + clientReq.url.split('?')[1] : ''),
    method: 'GET',
    headers: {
      ...clientReq.headers,
      host: targetHost,
      'user-agent': UA
    }
  };

  delete options.headers['origin'];

  const proxyReq = https.request(options);

  proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    // 发送 HTTP 101 到客户端
    const headers = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${proxyRes.headers['sec-websocket-accept']}`,
      ''
    ].join('\r\n') + '\r\n';

    clientSocket.write(headers);

    // 转发数据
    if (proxyHead.length > 0) proxySocket.unshift(proxyHead);
    if (clientHead.length > 0) clientSocket.unshift(clientHead);

    proxySocket.pipe(clientSocket);
    clientSocket.pipe(proxySocket);

    proxySocket.on('error', () => clientSocket.destroy());
    clientSocket.on('error', () => proxySocket.destroy());
    proxySocket.on('close', () => clientSocket.destroy());
    clientSocket.on('close', () => proxySocket.destroy());
  });

  proxyReq.on('error', (err) => {
    console.error('[ws proxy error]', err.message);
    clientSocket.destroy();
  });

  proxyReq.end();
}

// ===== 静态文件服务 =====
function serveStatic(req, res) {
  // 解码 URL 编码的中文路径
  const urlPath = req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]);
  let filePath = path.join(DIST, urlPath);

  // 如果文件不存在，返回 index.html（SPA 路由）
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';

  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': mime,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'max-age=31536000'
    });
    res.end(content);
  } catch (err) {
    res.writeHead(404);
    res.end('Not Found');
  }
}

// ===== 创建服务器 =====
const server = http.createServer((req, res) => {
  const url = req.url;

  // 代理：抖音直播间信息
  if (url.startsWith('/dylive/')) {
    const targetPath = url.replace(/^\/dylive/, '');
    proxyHttp(req, res, DOUYIN_HOST, targetPath);
    return;
  }

  // 静态文件
  serveStatic(req, res);
});

// ===== WebSocket 代理 =====
server.on('upgrade', (req, socket, head) => {
  if (req.url.startsWith('/socket')) {
    proxyWs(req, socket, head, WS_HOST);
  }
});

// ===== 启动 =====
// 当直接运行时启动服务器，当被 require 时不自动启动（由 Electron 控制）
if (require.main === module) {
  server.listen(PORT, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════╗');
    console.log('  ║       抖音弹幕姬 dycast v1.1.0       ║');
    console.log('  ╠══════════════════════════════════════╣');
    console.log(`  ║  主页面:  http://localhost:${PORT}/       ║`);
    console.log(`  ║  弹幕页:  http://localhost:${PORT}/?danmu  ║`);
    console.log('  ╚══════════════════════════════════════╝');
    console.log('');
  });
} else {
  // 被 Electron require 时自动启动
  server.listen(PORT, () => {
    console.log(`[dycast] 代理服务器已启动: http://localhost:${PORT}`);
  });
}

module.exports = server;
