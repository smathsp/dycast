const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const view = fs.readFileSync(path.resolve(__dirname, '../src/views/IndexView.vue'), 'utf8');
const helperSource = view.match(/function isPermanentRoomConnectionError\(error: unknown\): boolean \{[\s\S]*?\n\}/)?.[0];

test('connection UI distinguishes permanent 4xx from recoverable failures', () => {
  assert.ok(helperSource, 'permanent-error classifier is present');
  const compiled = ts.transpileModule(helperSource, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
  }).outputText;
  const classify = vm.runInNewContext(`${compiled}\nisPermanentRoomConnectionError`, { Error, Number, String });
  for (const status of [400, 403, 404]) assert.equal(classify(`HTTP ${status}`), true);
  for (const status of [408, 429, 500, 503]) assert.equal(classify(`HTTP ${status}`), false);
  assert.equal(classify('temporary network failure'), false);

  assert.match(view, /if \(isPermanentRoomConnectionError\(err\)\) \{\s*SkMessage\.error\(`房间号\/链接无效或访问被拒绝，检查后重试：\$\{message\}`\);[\s\S]*?return;\s*\}\s*SkMessage\.warning\(`连接出现波动，正在恢复：\$\{message\}`\)/);
  assert.match(view, /case DyCastCloseCode\.CONNECTING_ERROR:\s*if \(!isPermanentRoomConnectionError\(reason\)\) SkMessage\.info\('房间已关闭'\);/);
});
