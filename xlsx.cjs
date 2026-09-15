const { writeSafeZipBuffer } = require('./safe-zip.cjs');

const MAX_ROWS = 10000;
const MAX_COLUMNS = 30;
const MAX_CELL_LENGTH = 32767;
const MAX_WORKBOOK_TEXT_SIZE = 32 * 1024 * 1024;

function escapeXml(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function columnName(index) {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function normalizeCell(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value;
  return String(value ?? '').slice(0, MAX_CELL_LENGTH);
}

function makeCell(value, columnIndex, rowIndex, styleId) {
  const reference = `${columnName(columnIndex)}${rowIndex}`;
  const normalized = normalizeCell(value);
  if (typeof normalized === 'number') {
    return `<c r="${reference}" s="${styleId}"><v>${normalized}</v></c>`;
  }
  if (typeof normalized === 'boolean') {
    return `<c r="${reference}" s="${styleId}" t="b"><v>${normalized ? 1 : 0}</v></c>`;
  }
  return `<c r="${reference}" s="${styleId}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(normalized)}</t></is></c>`;
}

function normalizeWorkbook(config = {}) {
  if (!Array.isArray(config.columns) || config.columns.length === 0) {
    throw new Error('Excel 表格至少需要一列');
  }
  const columns = config.columns.slice(0, MAX_COLUMNS).map((column, index) => ({
    header: String(column?.header || `第 ${index + 1} 列`).slice(0, 200),
    width: Math.min(60, Math.max(8, Number(column?.width) || 16))
  }));
  const rows = (Array.isArray(config.rows) ? config.rows : [])
    .slice(0, MAX_ROWS)
    .map(row => Array.isArray(row) ? row.slice(0, columns.length) : []);
  let textSize = columns.reduce((total, column) => total + column.header.length, 0);
  for (const row of rows) {
    for (const value of row) {
      if (typeof value === 'string') textSize += Math.min(value.length, MAX_CELL_LENGTH);
      if (textSize > MAX_WORKBOOK_TEXT_SIZE) throw new Error('Excel 表格内容过大');
    }
  }
  const sheetName = String(config.sheetName || '记录')
    .replace(/[\[\]:*?/\\]/g, ' ')
    .trim()
    .slice(0, 31) || '记录';
  return { columns, rows, sheetName };
}

function normalizeExcelFileName(rawName) {
  const safeName = String(rawName || 'DyCast记录')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/^[. ]+/g, '')
    .replace(/[. ]+$/g, '')
    .slice(0, 160) || 'DyCast记录';
  return safeName.toLowerCase().endsWith('.xlsx') ? safeName : `${safeName}.xlsx`;
}

async function buildExcelWorkbook(config) {
  const { columns, rows, sheetName } = normalizeWorkbook(config);
  const lastColumn = columnName(columns.length - 1);
  const lastRow = rows.length + 1;
  const dimension = `A1:${lastColumn}${lastRow}`;
  const columnXml = columns.map((column, index) => (
    `<col min="${index + 1}" max="${index + 1}" width="${column.width}" customWidth="1"/>`
  )).join('');
  const headerXml = columns.map((column, index) => makeCell(column.header, index, 1, 1)).join('');
  const rowXml = rows.map((row, rowIndex) => {
    const excelRow = rowIndex + 2;
    const cells = columns.map((_column, columnIndex) => makeCell(row[columnIndex], columnIndex, excelRow, 2)).join('');
    return `<row r="${excelRow}" ht="30" customHeight="1">${cells}</row>`;
  }).join('');
  const now = new Date().toISOString();

  const entries = [];
  const addXml = (archivePath, xml) => entries.push({ archivePath, data: Buffer.from(xml, 'utf8') });

  addXml('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`);
  addXml('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`);
  addXml('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>DyCast</dc:creator><cp:lastModifiedBy>DyCast</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`);
  addXml('docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>DyCast</Application></Properties>`);
  addXml('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews><workbookView/></bookViews><sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`);
  addXml('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
  addXml('xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2"><font><sz val="11"/><name val="Microsoft YaHei"/><family val="2"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Microsoft YaHei"/><family val="2"/></font></fonts>
  <fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1E3A5F"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD9E2F3"/></left><right style="thin"><color rgb="FFD9E2F3"/></right><top style="thin"><color rgb="FFD9E2F3"/></top><bottom style="thin"><color rgb="FFD9E2F3"/></bottom><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`);
  addXml('xl/worksheets/sheet1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="${dimension}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="20"/><cols>${columnXml}</cols><sheetData><row r="1" ht="25" customHeight="1">${headerXml}</row>${rowXml}</sheetData>
  <autoFilter ref="${dimension}"/>
</worksheet>`);

  return writeSafeZipBuffer(entries, {
    maxEntries: 16,
    maxEntrySize: 64 * 1024 * 1024,
    maxTotalSize: 96 * 1024 * 1024,
    maxArchiveSize: 96 * 1024 * 1024
  });
}

module.exports = { buildExcelWorkbook, normalizeExcelFileName };
