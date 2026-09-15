const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { buildExcelWorkbook, normalizeExcelFileName } = require('../xlsx.cjs');
const { openSafeZip } = require('../safe-zip.cjs');

test('builds a valid bounded XLSX archive without the legacy ZIP dependency', async t => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dycast-xlsx-'));
  t.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'records.xlsx');
  const workbook = await buildExcelWorkbook({
    sheetName: '中奖记录',
    columns: [{ header: '昵称' }, { header: '弹幕' }],
    rows: [['猫猫', '测试 & <安全>']]
  });
  await fs.promises.writeFile(filePath, workbook);
  const archive = await openSafeZip(filePath, { maxArchiveSize: 2 * 1024 * 1024 });
  t.after(() => archive.close());
  const worksheet = await archive.readBuffer('xl/worksheets/sheet1.xml');
  assert.match(worksheet.toString('utf8'), /猫猫/);
  assert.match(worksheet.toString('utf8'), /测试 &amp; &lt;安全&gt;/);
  assert.ok(archive.getEntry('[Content_Types].xml'));
});

test('normalizes unsafe workbook file names', () => {
  assert.equal(normalizeExcelFileName('  <>中奖:记录  '), '__中奖_记录.xlsx');
  assert.equal(normalizeExcelFileName('records.XLSX'), 'records.XLSX');
});
