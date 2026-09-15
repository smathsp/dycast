const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const requestPath = path.resolve(__dirname, '../src/core/request.ts');
const source = fs.readFileSync(requestPath, 'utf8');

function loadRequest(status) {
  const compiled = ts.transpileModule(source, {
    fileName: requestPath,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  }).outputText;
  const module = { exports: {} };
  const dependencies = {
    './abogus': { getAbogus: () => '' },
    './model': { decodeResponse: () => ({}) },
    './signature': { getMsToken: () => '' },
    './util': { makeUrlParams: () => '', parseLiveHtml: () => undefined },
    './boundedResponse': { readResponseBytesBounded() {}, readResponseTextBounded() {} }
  };
  const context = vm.createContext({
    module,
    exports: module.exports,
    navigator: { appCodeName: 'Mozilla' },
    fetch: async () => ({ ok: false, status }),
    require(specifier) {
      assert.ok(Object.hasOwn(dependencies, specifier), `unexpected dependency: ${specifier}`);
      return dependencies[specifier];
    }
  });
  new vm.Script(compiled, { filename: requestPath }).runInContext(context);
  return module.exports;
}

for (const status of [404, 503]) {
  test(`room and IM requests preserve HTTP ${status} across their error wrappers`, async () => {
    const request = loadRequest(status);
    const hasStatus = error => error instanceof request.HttpRequestError && error.status === status;
    await assert.rejects(request.getLiveInfo('732146168843'), hasStatus);
    await assert.rejects(request.getImInfo('room-id', 'viewer-id'), hasStatus);
  });
}
