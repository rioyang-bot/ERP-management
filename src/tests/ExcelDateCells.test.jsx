import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  preserveDisplayedDateText,
  excelSerialToDate,
  isDateFormat,
  parseSpreadsheetFile,
} from '../utils/encoding';

// 回歸測試：Excel 會把使用者輸入的「Jan-26」自動判讀成日期，
// 以序號 46023 儲存、再依 mmm-yy 格式顯示為 Jan-26。
// 匯入時若取原始值，純文字的「訂單來源」欄位就會變成 46023。
describe('Excel 日期格式儲存格', () => {
  /** 產生工作表：一格是被誤判為日期的文字，一格是真正的日期 */
  const makeSheet = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['SN', 'Order Source', 'Installed Date'],
      ['A-001', null, null],
    ]);
    ws['B2'] = { t: 'n', v: 46023, z: 'mmm-yy' };     // 顯示 Jan-26
    ws['C2'] = { t: 'n', v: 45658, z: 'yyyy-mm-dd' }; // 顯示 2025-01-01
    return ws;
  };

  /** 寫出再讀回，重現實際匯入時的儲存格狀態 */
  const roundTrip = (ws) => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'S');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const back = XLSX.read(new Uint8Array(buf), {
      type: 'array', cellDates: false, codepage: 65001, cellNF: true,
    });
    return back.Sheets[back.SheetNames[0]];
  };

  it('文字性質的欄位應保留 Excel 顯示的文字，而非日期序號', () => {
    const sheet = roundTrip(makeSheet());

    // 修正前的行為：取到原始序號
    const before = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true })[0];
    expect(before['Order Source']).toBe(46023);

    preserveDisplayedDateText(sheet);

    const after = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true })[0];
    expect(after['Order Source']).toBe('Jan-26');
  });

  it('真正的日期欄位仍應得到可解析的日期字串', () => {
    const sheet = preserveDisplayedDateText(roundTrip(makeSheet()));
    const row = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true })[0];
    expect(row['Installed Date']).toBe('2025-01-01');
  });

  it('非日期欄位不受影響', () => {
    const sheet = preserveDisplayedDateText(roundTrip(makeSheet()));
    const row = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true })[0];
    expect(row.SN).toBe('A-001');
  });

  it('一般數字不應被誤認為日期', () => {
    const ws = XLSX.utils.aoa_to_sheet([['Qty'], [null]]);
    ws['A2'] = { t: 'n', v: 1500, z: '#,##0' };
    const sheet = preserveDisplayedDateText(roundTrip(ws));
    expect(XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true })[0].Qty).toBe(1500);
  });

  it('透過 parseSpreadsheetFile 完整流程亦成立', async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, makeSheet(), 'S');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const file = new File([buf], 'order_source.xlsx',
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    const rows = await parseSpreadsheetFile(file);
    expect(rows[0]['Order Source']).toBe('Jan-26');
    expect(rows[0]['Installed Date']).toBe('2025-01-01');
  });
});

describe('excelSerialToDate', () => {
  it('應正確轉換 Excel 日期序號', () => {
    expect(excelSerialToDate(46023)).toBe('2026-01-01');
    expect(excelSerialToDate(45658)).toBe('2025-01-01');
    expect(excelSerialToDate(1)).toBe('1899-12-31');
  });

  it('超出範圍或非數值應回傳 null', () => {
    expect(excelSerialToDate(0)).toBeNull();
    expect(excelSerialToDate(-5)).toBeNull();
    expect(excelSerialToDate('abc')).toBeNull();
    expect(excelSerialToDate(null)).toBeNull();
  });

  it('數值字串亦應可轉換', () => {
    expect(excelSerialToDate('45658')).toBe('2025-01-01');
  });
});

describe('isDateFormat', () => {
  it('日期格式應判定為真', () => {
    ['mmm-yy', 'yyyy-mm-dd', 'dd/mm/yyyy', 'm/d/yy h:mm'].forEach((f) => {
      expect(isDateFormat(f)).toBe(true);
    });
  });

  it('數字與一般格式應判定為否', () => {
    ['#,##0.00', 'General', '0', '@', ''].forEach((f) => {
      expect(isDateFormat(f)).toBe(false);
    });
  });

  it('引號內的字面文字不應造成誤判', () => {
    expect(isDateFormat('"Day"0')).toBe(false);
    expect(isDateFormat('[Red]#,##0')).toBe(false);
  });
});
