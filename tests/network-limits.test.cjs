const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const pako = require('pako');

function compileTypescriptModule(filePath, dependencies = {}) {
  const source = fs.readFileSync(filePath, 'utf8');
  const output = ts.transpileModule(source, {
    fileName: filePath,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true
    }
  }).outputText;
  const module = { exports: {} };
  const context = vm.createContext({
    AbortController,
    ArrayBuffer,
    DOMException,
    Error,
    Headers,
    module,
    exports: module.exports,
    Number,
    RangeError,
    ReadableStream,
    Response,
    TextDecoder,
    TextEncoder,
    Uint8Array,
    require(specifier) {
      if (Object.prototype.hasOwnProperty.call(dependencies, specifier)) {
        return dependencies[specifier];
      }
      throw new Error(`Unexpected dependency in ${path.basename(filePath)}: ${specifier}`);
    }
  });
  new vm.Script(output, { filename: filePath }).runInContext(context);
  return module.exports;
}

const boundedResponse = compileTypescriptModule(
  path.resolve(__dirname, '../src/core/boundedResponse.ts')
);
const framePayload = compileTypescriptModule(
  path.resolve(__dirname, '../src/core/framePayloadLimit.ts'),
  { pako }
);

test('declared oversized HTTP responses are cancelled before their body is read', async () => {
  let cancelReason;
  const stream = new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array([1]));
    },
    cancel(reason) {
      cancelReason = reason;
    }
  });
  const response = new Response(stream, { headers: { 'content-length': '9' } });

  await assert.rejects(
    boundedResponse.readResponseBytesBounded(response, 8),
    error => error?.code === 'RESPONSE_BODY_TOO_LARGE' && error.receivedBytes === 9
  );
  assert.equal(cancelReason?.code, 'RESPONSE_BODY_TOO_LARGE');
});

test('chunked HTTP responses are cancelled as soon as their running size crosses the limit', async () => {
  let pullCount = 0;
  let cancelReason;
  const stream = new ReadableStream({
    pull(controller) {
      pullCount += 1;
      controller.enqueue(new Uint8Array(5).fill(pullCount));
    },
    cancel(reason) {
      cancelReason = reason;
    }
  });
  const response = new Response(stream);

  await assert.rejects(
    boundedResponse.readResponseBytesBounded(response, 8),
    error => error?.code === 'RESPONSE_BODY_TOO_LARGE' && error.receivedBytes === 10
  );
  assert.equal(cancelReason?.code, 'RESPONSE_BODY_TOO_LARGE');
  // A ReadableStream may prefetch one chunk, but cancellation prevents further pulls.
  assert.ok(pullCount <= 3);
});

test('bounded text reading preserves UTF-8 characters split across stream chunks', async () => {
  const bytes = new TextEncoder().encode('直播弹幕');
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes.slice(0, 2));
      controller.enqueue(bytes.slice(2, 7));
      controller.enqueue(bytes.slice(7));
      controller.close();
    }
  });

  const text = await boundedResponse.readResponseTextBounded(new Response(stream), 64);
  assert.equal(text, '直播弹幕');
});

test('compressed WebSocket payloads have an input ceiling before inflate starts', () => {
  const oversized = new Uint8Array(framePayload.MAX_COMPRESSED_PAYLOAD_BYTES + 1);
  assert.throws(
    () => framePayload.inflateGzipBounded(oversized),
    error => error?.code === 'FRAME_PAYLOAD_TOO_LARGE' && error.kind === 'compressed-payload'
  );
});

test('gzip expansion stops when decoded output crosses its independent ceiling', () => {
  const compressed = pako.gzip(new Uint8Array(1024 * 1024));
  assert.throws(
    () => framePayload.inflateGzipBounded(compressed, 128 * 1024),
    error => error?.code === 'FRAME_PAYLOAD_TOO_LARGE' && error.kind === 'decoded-payload'
  );
});

test('normal gzip payloads still round-trip through the bounded inflater', () => {
  const expected = new TextEncoder().encode('normal live chat payload');
  const actual = framePayload.inflateGzipBounded(pako.gzip(expected), 1024);
  assert.deepEqual([...actual], [...expected]);
});
