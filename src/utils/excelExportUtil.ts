import FileSaver from '@/utils/fileUtil';

export interface ExcelColumn {
  header: string;
  width?: number;
}

export interface ExcelExportOptions {
  fileName: string;
  sheetName: string;
  dialogTitle?: string;
  columns: ExcelColumn[];
  rows: Array<Array<string | number | boolean | null | undefined>>;
}

export interface ExcelExportResult {
  success: boolean;
  canceled: boolean;
  filePath?: string;
}

function escapeXml(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildSpreadsheetXml(options: ExcelExportOptions): string {
  const columns = options.columns.map(column => (
    `<Column ss:Width="${Math.min(420, Math.max(56, Number(column.width || 16) * 7))}"/>`
  )).join('');
  const makeRow = (values: unknown[], styleId = 'Body') => `<Row>${options.columns.map((_column, index) => {
    const value = values[index];
    const isNumber = typeof value === 'number' && Number.isFinite(value);
    return `<Cell ss:StyleID="${styleId}"><Data ss:Type="${isNumber ? 'Number' : 'String'}">${escapeXml(value)}</Data></Cell>`;
  }).join('')}</Row>`;
  const rows = options.rows.map(row => makeRow(row)).join('');
  const sheetName = String(options.sheetName || '记录').replace(/[\[\]:*?/\\]/g, ' ').trim().slice(0, 31) || '记录';
  return `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles><Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#1E3A5F" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/></Borders></Style><Style ss:ID="Body"><Alignment ss:Vertical="Top" ss:WrapText="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9E2F3"/></Borders></Style></Styles>
  <Worksheet ss:Name="${escapeXml(sheetName)}"><Table>${columns}${makeRow(options.columns.map(column => column.header), 'Header')}${rows}</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane></WorksheetOptions></Worksheet>
</Workbook>`;
}

export async function exportExcel(options: ExcelExportOptions): Promise<ExcelExportResult> {
  if (window.electronAPI?.saveExcelWorkbook) {
    const result = await window.electronAPI.saveExcelWorkbook(options);
    return { success: !result.canceled, canceled: result.canceled, filePath: result.filePath };
  }

  // 网页预览环境没有 Electron 主进程，降级为 Excel 可直接打开的 SpreadsheetML。
  const result = await FileSaver.save(buildSpreadsheetXml(options), {
    name: options.fileName,
    ext: '.xls',
    mimeType: 'application/vnd.ms-excel;charset=utf-8',
    description: 'Excel 工作簿',
    existStrategy: 'new'
  });
  return {
    success: result.success,
    canceled: result.message === '用户取消操作'
  };
}

export function createExportTimestamp(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}_${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}${String(date.getSeconds()).padStart(2, '0')}`;
}
