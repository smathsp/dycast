const { EventEmitter } = require('node:events');
const http = require('node:http');
const { after, test } = require('node:test');
const assert = require('node:assert/strict');

// server.cjs is intentionally self-starting when required by Electron. Port 0 keeps
// this isolated test instance from competing with a running application.
process.env.DYCAST_PORT = '0';
const server = require('../server.cjs');
const proxy = server.__test;

after(() => new Promise(resolve => server.shutdown(() => resolve())));

class FakeRequest extends EventEmitter {
  destroyed = false;
  ended = false;

  end() {
    this.ended = true;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    queueMicrotask(() => this.emit('close'));
  }

  setTimeout(delay, callback) {
    this.timeout = { delay, callback };
  }
}

class FakeSocket extends EventEmitter {
  destroyed = false;
  writes = [];
  unshifted = [];
  pipedTo = null;

  write(value) {
    this.writes.push(String(value));
    return true;
  }

  unshift(value) {
    this.unshifted.push(value);
  }

  pipe(destination) {
    this.pipedTo = destination;
    return destination;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.emit('close');
  }
}

class FakeResponse extends EventEmitter {
  constructor(statusCode) {
    super();
    this.statusCode = statusCode;
    this.destroyed = false;
  }

  destroy() {
    this.destroyed = true;
  }
}

class FakeIncomingRequest extends EventEmitter {
  constructor(method = 'GET') {
    super();
    this.method = method;
    this.headers = {};
    this.aborted = false;
    this.resumed = false;
  }

  resume() {
    this.resumed = true;
  }

  pipe(destination) {
    destination.end();
    return destination;
  }
}

class FakeServerResponse extends EventEmitter {
  constructor() {
    super();
    this.destroyed = false;
    this.headersSent = false;
    this.statusCode = 0;
  }

  setHeader() {}

  writeHead(statusCode) {
    this.statusCode = statusCode;
    this.headersSent = true;
  }

  end(body = '') {
    this.body = String(body);
    this.emit('finish');
  }

  destroy(error) {
    this.destroyed = true;
    this.error = error;
  }
}

class FakeUpstreamResponse extends EventEmitter {
  constructor() {
    super();
    this.statusCode = 200;
    this.headers = {};
    this.destroyed = false;
  }

  pipe(destination) {
    this.pipedTo = destination;
    return destination;
  }

  destroy() {
    this.destroyed = true;
  }
}

function createClientRequest() {
  return {
    url: '/socket/webcast/im/push/v2/?room_id=123&cursor=a%7Cb',
    headers: {
      connection: 'Upgrade',
      upgrade: 'websocket',
      origin: 'http://127.0.0.1:15173',
      'user-agent': 'Renderer-UA',
      'sec-websocket-key': 'test-key',
      'sec-websocket-version': '13',
      'sec-websocket-extensions': 'permessage-deflate; client_max_window_bits'
    }
  };
}

function createRuntime(capture, handshakeTimeoutMs = 1000) {
  return {
    request(options) {
      capture.options = options;
      capture.request = new FakeRequest();
      return capture.request;
    },
    handshakeTimeoutMs,
    logError() {}
  };
}

function createHttpProxyRuntime(capture) {
  return {
    request(options, callback) {
      capture.options = options;
      capture.callback = callback;
      capture.request = new FakeRequest();
      return capture.request;
    },
    logError() {}
  };
}

function requestLocal(options, body) {
  return new Promise((resolve, reject) => {
    const request = http.request(options, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({
        statusCode: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });
    request.once('error', reject);
    request.end(body);
  });
}

test('HTTP and WebSocket forwarding share one upstream user agent and WS compression is disabled', () => {
  const clientReq = createClientRequest();
  const httpHeaders = proxy.getForwardHeaders(clientReq, 'live.douyin.com');
  const wsOptions = proxy.createWebSocketProxyOptions(clientReq, 'webcast.example.douyin.com');

  assert.equal(httpHeaders['user-agent'], proxy.UPSTREAM_USER_AGENT);
  assert.equal(wsOptions.headers['user-agent'], proxy.UPSTREAM_USER_AGENT);
  assert.equal(wsOptions.headers['sec-websocket-extensions'], undefined);
  assert.equal(wsOptions.headers.origin, undefined);
  assert.equal(wsOptions.headers.connection, 'Upgrade');
  assert.equal(wsOptions.headers.upgrade, 'websocket');
  assert.equal(wsOptions.path, '/webcast/im/push/v2/?room_id=123&cursor=a%7Cb');
});

test('official pushServer hosts are forwarded without leaking the private proxy hint upstream', () => {
  const clientReq = createClientRequest();
  clientReq.url += '&__dycast_ws_host=webcast3-ws-web-lf.douyin.com';
  const target = proxy.getWebSocketProxyTarget(clientReq);
  const options = proxy.createWebSocketProxyOptions(clientReq, target.targetHost, target.targetPath);

  assert.equal(target.targetHost, 'webcast3-ws-web-lf.douyin.com');
  assert.doesNotMatch(options.path, /__dycast_ws_host/);
  assert.match(options.path, /room_id=123/);
});

test('untrusted pushServer hints fall back to the fixed Douyin node', () => {
  const clientReq = createClientRequest();
  clientReq.url += '&__dycast_ws_host=127.0.0.1';
  const target = proxy.getWebSocketProxyTarget(clientReq);

  assert.equal(target.targetHost, 'webcast100-ws-web-lq.douyin.com');
  assert.doesNotMatch(target.targetPath, /__dycast_ws_host/);
});

test('closing the downstream socket cancels an unfinished upstream handshake', async () => {
  const capture = {};
  const clientSocket = new FakeSocket();

  proxy.proxyWs(
    createClientRequest(),
    clientSocket,
    Buffer.alloc(0),
    'webcast.example.douyin.com',
    createRuntime(capture)
  );
  assert.equal(capture.request.ended, true);

  clientSocket.destroy();
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(capture.request.destroyed, true);
});

test('an upstream non-101 response immediately rejects the browser handshake', () => {
  const capture = {};
  const clientSocket = new FakeSocket();
  proxy.proxyWs(
    createClientRequest(),
    clientSocket,
    Buffer.alloc(0),
    'webcast.example.douyin.com',
    createRuntime(capture)
  );

  const response = new FakeResponse(403);
  capture.request.emit('response', response);

  assert.equal(response.destroyed, true);
  assert.equal(clientSocket.destroyed, true);
  assert.match(clientSocket.writes.join(''), /^HTTP\/1\.1 502 Bad Gateway\r\n/);
});

test('a stalled upstream handshake is terminated at the configured deadline', async () => {
  const capture = {};
  const clientSocket = new FakeSocket();
  proxy.proxyWs(
    createClientRequest(),
    clientSocket,
    Buffer.alloc(0),
    'webcast.example.douyin.com',
    createRuntime(capture, 5)
  );

  await new Promise(resolve => setTimeout(resolve, 20));

  assert.equal(capture.request.destroyed, true);
  assert.equal(clientSocket.destroyed, true);
});

test('a successful tunnel never advertises an upstream compression extension', () => {
  const capture = {};
  const clientSocket = new FakeSocket();
  const proxySocket = new FakeSocket();
  const clientHead = Buffer.from('client-head');
  const proxyHead = Buffer.from('proxy-head');
  proxy.proxyWs(
    createClientRequest(),
    clientSocket,
    clientHead,
    'webcast.example.douyin.com',
    createRuntime(capture)
  );

  capture.request.emit('upgrade', {
    headers: {
      'sec-websocket-accept': 'accepted-key',
      'sec-websocket-protocol': 'dycast-test',
      'sec-websocket-extensions': 'permessage-deflate'
    }
  }, proxySocket, proxyHead);

  const handshake = clientSocket.writes.join('');
  assert.match(handshake, /^HTTP\/1\.1 101 Switching Protocols\r\n/);
  assert.match(handshake, /Sec-WebSocket-Protocol: dycast-test\r\n/);
  assert.doesNotMatch(handshake, /Sec-WebSocket-Extensions/i);
  assert.deepEqual(proxySocket.unshifted, [proxyHead]);
  assert.deepEqual(clientSocket.unshifted, [clientHead]);
  assert.equal(proxySocket.pipedTo, clientSocket);
  assert.equal(clientSocket.pipedTo, proxySocket);

  clientSocket.destroy();
  assert.equal(proxySocket.destroyed, true);
});

test('/dylive rejects upload methods before opening an upstream proxy', async () => {
  await server.startup;
  const address = server.address();
  const response = await requestLocal({
    host: '127.0.0.1',
    port: address.port,
    path: '/dylive/webcast/im/fetch/',
    method: 'POST',
    headers: { 'content-length': '4' }
  }, 'test');

  assert.equal(response.statusCode, 405);
  assert.equal(response.headers.allow, 'GET, HEAD');
  assert.equal(response.body, 'Method Not Allowed');
});

test('closing a downstream HTTP response cancels the Node https fallback request', () => {
  const capture = {};
  const clientReq = new FakeIncomingRequest();
  const clientRes = new FakeServerResponse();
  proxy.proxyHttpWithNodeHttps(
    clientReq,
    clientRes,
    'live.douyin.com',
    '/123',
    Buffer.alloc(0),
    createHttpProxyRuntime(capture)
  );

  clientRes.emit('close');
  assert.equal(capture.request.destroyed, true);
});

test('an upstream HTTP response error destroys a partially-started downstream response', () => {
  const capture = {};
  const clientReq = new FakeIncomingRequest();
  const clientRes = new FakeServerResponse();
  proxy.proxyHttpWithNodeHttps(
    clientReq,
    clientRes,
    'live.douyin.com',
    '/123',
    Buffer.alloc(0),
    createHttpProxyRuntime(capture)
  );
  const upstreamResponse = new FakeUpstreamResponse();
  capture.callback(upstreamResponse);

  upstreamResponse.emit('error', new Error('response failed'));
  assert.equal(upstreamResponse.destroyed, true);
  assert.equal(capture.request.destroyed, true);
  assert.equal(clientRes.destroyed, true);
});

test('an aborted upstream HTTP response cannot leave the downstream request hanging', () => {
  const capture = {};
  const clientReq = new FakeIncomingRequest();
  const clientRes = new FakeServerResponse();
  proxy.proxyHttpWithNodeHttps(
    clientReq,
    clientRes,
    'live.douyin.com',
    '/123',
    Buffer.alloc(0),
    createHttpProxyRuntime(capture)
  );
  const upstreamResponse = new FakeUpstreamResponse();
  capture.callback(upstreamResponse);

  upstreamResponse.emit('aborted');
  assert.equal(clientRes.destroyed, true);
  assert.equal(capture.request.destroyed, true);
});

test('listenServer rejects EADDRINUSE instead of emitting an uncaught server error', async () => {
  const blocker = http.createServer((_req, res) => res.end('occupied'));
  await new Promise((resolve, reject) => {
    blocker.once('error', reject);
    blocker.listen(0, '127.0.0.1', resolve);
  });
  const occupiedPort = blocker.address().port;
  const competingServer = http.createServer();

  try {
    await assert.rejects(
      proxy.listenServer(competingServer, occupiedPort, '127.0.0.1'),
      error => error?.code === 'EADDRINUSE'
    );
  } finally {
    await new Promise(resolve => blocker.close(resolve));
  }
});
