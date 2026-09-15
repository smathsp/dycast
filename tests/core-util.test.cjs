const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadCoreUtil() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'util.ts'), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  Function('exports', 'require', 'module', '__filename', '__dirname', code)(
    module.exports,
    require,
    module,
    path.join(__dirname, '..', 'src', 'core', 'util.ts'),
    path.join(__dirname, '..', 'src', 'core')
  );
  return module.exports;
}

const { makeUrlParams, parseLiveHtml } = loadCoreUtil();

test('makeUrlParams 对游标和扩展字段进行安全编码', () => {
  assert.equal(
    makeUrlParams({ cursor: 'a+b&c=d#e', internal_ext: '房间 1', empty: null }),
    'cursor=a%2Bb%26c%3Dd%23e&internal_ext=%E6%88%BF%E9%97%B4%201&empty='
  );
});

test('parseLiveHtml 在抖音脚本外壳变化时仍能读取必要房间字段', () => {
  const state = {
    state: {
      roomStore: {
        roomInfo: {
          roomId: '7499001122334455667',
          anchor: {
            id_str: '99887766',
            nickname: '阿橘\\"直播间',
            avatar_thumb: { url_list: ['https://img.example/avatar?a=1\\u0026b=2'] }
          },
          room: {
            title: '今晚测试',
            status: 2,
            cover: { url_list: ['https:\\/\\/img.example\\/cover.jpg'] }
          }
        }
      },
      userStore: { odin: { user_unique_id: '1234567890123456789' } }
    }
  };
  const escaped = JSON.stringify(state).replace(/"/g, '\\"');
  const html = `<script data-next-fragment="changed">self.__pace_f.push([1,"${escaped}"])</script>`;
  const result = parseLiveHtml(html);
  assert.equal(result.roomId, '7499001122334455667');
  assert.equal(result.uniqueId, '1234567890123456789');
  assert.equal(result.anchorId, '99887766');
  assert.equal(result.status, 2);
  assert.equal(result.cover, 'https://img.example/cover.jpg');
});

test('parseLiveHtml 缺少连接主键时明确失败而不是返回假在线对象', () => {
  const html = '<script>"roomInfo":{"roomId":"7499001122334455667","room":{"status":2}}</script>';
  assert.equal(parseLiveHtml(html), null);
});
