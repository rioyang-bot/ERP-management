import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import IsoEquipmentForm from '../pages/IsoEquipmentForm';
import IsoEquipmentSheet from '../components/IsoEquipmentSheet';
import { toFormRows, monthRange, formatRocDate, formFileName, paginate, ROWS_PER_PAGE, FORM_META } from '../utils/isoEquipmentForm';
import { buildImagePdf, dataUrlToBytes } from '../utils/imagePdf';
import { queries } from '../../database/queries';

/**
 * ISO 27001「S-408-02 設備攜出入單」依月份預覽並下載 PDF
 *
 * 版面照公司範本（欄位：日期、設備名稱、序號、用途、原因、供應商/客戶），每頁 10 列。只列設備，一台一列；
 * 進貨＝攜入／進貨／供應商、出貨＝攜出／出貨／客戶、借出＝攜出／借出／客戶、歸還＝攜入／歸還／客戶。
 * 機房管理員、權責主管在每頁頁尾，線上簽核過的放簽名圖。
 */
const MOVES = [
  { move_date: '2026-09-10', direction: 'OUT', reason: '借出', vendor: '元大證券', brand: 'SECRETHFT', model: 'SECRETHFT-ARL', specification: '8C-Gen1', sn: 'STG10003Y26' },
  { move_date: '2026-09-12', direction: 'IN', reason: '進貨', vendor: '利得數位', brand: 'CISCO', model: 'NEXUS 3548-XL', specification: '', sn: 'FOC3035R181' },
  { move_date: '2026-09-23', direction: 'OUT', reason: '出貨', vendor: 'Saccade & Co <TW>', brand: 'BLACKCORE', model: '3122-SM', specification: '26C', sn: '' },
  { move_date: '2026-09-30', direction: 'IN', reason: '歸還', vendor: '元大證券', brand: 'SECRETHFT', model: 'SECRETHFT-ARL', specification: '8C-Gen1', sn: 'STG10003Y26' },
];

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/** 表格每列的文字（每格一個字串）；用途欄改成勾選的那一個 */
const tableRows = (sheet) => [...sheet.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => {
  const purpose = td.querySelector('[data-purpose]');
  return purpose ? `用途:${purpose.dataset.purpose}` : td.textContent;
}));

describe('查詢', () => {
  /** 進貨、出貨、借出、歸還以外：換貨換回、維修取回／送修原廠／原廠返還／完工交回 */
  it('換貨與維修的設備進出', () => {
    const q = queries.fetchEquipmentMovements;
    // 換貨單、維修以庫存換貨產生的出貨單標出原因
    expect(q).toContain("WHEN EXISTS (SELECT 1 FROM exchange_orders e WHERE e.outbound_request_id = r.id) THEN '換貨'");
    expect(q).toContain("WHEN EXISTS (SELECT 1 FROM repair_orders ro WHERE ro.swap_dn_no = r.request_no) THEN '維修換貨'");
    expect(q).toContain("e.exchange_date, 'IN', '換貨'");
    expect(q).toContain("WHERE x.direction = 'IN' AND c.name = '設備'");
    // 維修：客戶送修才有取回與完工交回；送修原廠、原廠返還內部維修也算
    expect(q).toContain("on_site_date, 'IN', '維修取回'");
    expect(q).toContain("send_oem_date, 'OUT', '送修原廠', 7, COALESCE(NULLIF(TRIM(supplier_name), ''), '原廠')");
    expect(q).toContain("oem_return_date, 'IN', '原廠返還'");
    expect(q).toContain("completion_date, 'OUT', '維修完工'");
    // 以庫存換貨的單，故障機留在公司，完工不算交回
    expect(q).toContain("AND COALESCE(TRIM(swap_dn_no), '') = ''");
    expect(q.match(/NOT COALESCE\(is_internal, FALSE\)/g)).toHaveLength(2);
  });

  it('只算設備；進貨、出貨、借出、歸還與日期欄位', () => {
    const q = queries.fetchEquipmentMovements;
    // 進貨、出貨、借出、歸還、換貨換回各一處，維修單的設備一處
    expect(q.match(/c\.name = '設備'/g)).toHaveLength(6);
    expect(q).toContain("io.status = 'COMPLETED'");
    expect(q).toContain("'IN' AS direction, '進貨'");
    expect(q).toContain("ELSE '出貨' END");
    expect(q).toContain("'OUT', '借出'");
    expect(q).toContain("r.actual_return_date, 'IN', '歸還'");
  });

  it('一台設備一列帶序號，不再加總；沒有序號的依數量展開', () => {
    const q = queries.fetchEquipmentMovements;
    expect(q).not.toContain('GROUP BY');
    expect(q).not.toContain('SUM(');
    expect(q).toContain("NULLIF(TRIM(ii.sn), '') AS sn");
    for (const col of ['NULLIF(TRIM(oi.sn), \'\')', 'NULLIF(TRIM(x.sn), \'\')']) expect(q).toContain(col);
    // 維修單的設備：明細記的序號，沒有就用資產的
    expect(q).toContain("COALESCE(NULLIF(TRIM(ri.sn), ''), NULLIF(TRIM(a.sn), '')) AS dev_sn");
    expect(q.match(/dev_sn, 1/g)).toHaveLength(4);
    expect(q).toContain('generate_series(1, CASE WHEN mv.sn IS NULL THEN GREATEST(COALESCE(mv.qty, 1), 1) ELSE 1 END)');
    expect(q).toContain("COALESCE(sn, '') AS sn");
  });

  it('月份區間：起日含、下個月 1 號不含；12 月跨年', () => {
    expect(monthRange(2026, 9)).toEqual(['2026-09-01', '2026-10-01']);
    expect(monthRange(2026, 12)).toEqual(['2026-12-01', '2027-01-01']);
  });
});

describe('表單的列與分頁', () => {
  it('民國日期、設備名稱（廠牌 型號 規格）、序號；沒有數量', () => {
    expect(formatRocDate('2026-09-10')).toBe('115/09/10');
    expect(toFormRows(MOVES)[0]).toEqual({ date: '115/09/10', name: 'SECRETHFT SECRETHFT-ARL 8C-Gen1', sn: 'STG10003Y26', direction: 'OUT', reason: '借出', vendor: '元大證券' });
    expect(toFormRows(MOVES)[1].name).toBe('CISCO NEXUS 3548-XL');
    expect(toFormRows(MOVES)[2].sn).toBe('');
  });

  it('每頁 10 列，最後一頁補空白列；沒有資料也有一頁空白表單', () => {
    expect(ROWS_PER_PAGE).toBe(10);
    expect(paginate([])).toEqual([Array(10).fill(null)]);
    const pages = paginate(Array.from({ length: 23 }, (_, i) => ({ i })));
    expect(pages).toHaveLength(3);
    expect(pages.map((p) => p.length)).toEqual([10, 10, 10]);
    expect(pages[2].filter(Boolean)).toHaveLength(3);
    expect(paginate(Array.from({ length: 10 }, () => ({})))).toHaveLength(1);
  });

  it('檔名是 PDF', () => expect(formFileName(2026, 9)).toBe('S-408-02設備攜出入單_115年09月.pdf'));
});

describe('表單頁面（照範本）', () => {
  const renderSheet = (props = {}) => render(
    <IsoEquipmentSheet year={2026} month={9} rows={paginate(toFormRows(MOVES))[0]} page={1} pageCount={2} {...props} />
  ).container.querySelector('.iso-equipment-sheet');

  it('頁首、標題、月份、欄位照範本；逐列填入，不足補空白列', () => {
    const sheet = renderSheet();
    for (const text of [`文件編號：${FORM_META.docNo}`, `文件名稱：${FORM_META.docName}`, `發布日期：${FORM_META.publishDate}`, `版次：${FORM_META.version}`, '115 年 09 月份', '機密等級：內部使用', '1 / 2']) {
      expect(sheet.textContent).toContain(text);
    }
    expect(within(sheet).getByAltText('LOGO')).toBeInTheDocument();
    expect([...sheet.querySelectorAll('th')].map((th) => th.textContent)).toEqual(['日期', '設備名稱', '序號', '用途', '原因', '供應商/客戶']);
    const rows = tableRows(sheet);
    expect(rows).toHaveLength(ROWS_PER_PAGE);
    expect(rows[0]).toEqual(['115/09/10', 'SECRETHFT SECRETHFT-ARL 8C-Gen1', 'STG10003Y26', '用途:OUT', '借出', '元大證券']);
    expect(rows[1]).toEqual(['115/09/12', 'CISCO NEXUS 3548-XL', 'FOC3035R181', '用途:IN', '進貨', '利得數位']);
    expect(rows[2][5]).toBe('Saccade & Co <TW>');
    expect(rows[9]).toEqual(['', '', '', '用途:', '', '']);
  });

  it('頁尾：簽過的角色放簽名圖與簽核日期，沒簽的留白', () => {
    const sheet = renderSheet({ signatures: { ROOM_ADMIN: { png: PNG, signedAt: new Date(2026, 9, 31, 17, 30).toISOString() } } });
    expect(within(sheet).getByAltText('機房管理員簽名')).toHaveAttribute('src', PNG);
    expect(within(sheet).queryByAltText('權責主管簽名')).toBeNull();
    expect(sheet.textContent).toContain('機房管理員：');
    expect(sheet.textContent).toContain('權責主管：');
    expect(sheet.textContent).toContain('115/10/31');
  });
});

describe('組 PDF', () => {
  it('每張圖一頁、A4 橫式滿版；交叉參照表的位置正確', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
    const pdf = buildImagePdf([{ jpeg, width: 2246, height: 1588 }, { jpeg, width: 2246, height: 1588 }]);
    const text = new TextDecoder('latin1').decode(pdf);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('/Type /Pages /Kids [3 0 R 6 0 R] /Count 2');
    expect(text).toContain('/MediaBox [0 0 841.89 595.28]');
    expect(text.match(/\/Filter \/DCTDecode/g)).toHaveLength(2);
    expect(text).toContain('/Width 2246 /Height 1588');
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    // startxref 指到 xref；xref 裡每個物件的位置都指到「n 0 obj」
    const xref = Number(text.match(/startxref\n(\d+)/)[1]);
    expect(text.slice(xref, xref + 4)).toBe('xref');
    const entries = text.slice(xref).match(/(\d{10}) 00000 n/g).map((e) => Number(e.slice(0, 10)));
    // 目錄、頁面樹，加上每頁三個（頁面、內容、圖）
    expect(entries).toHaveLength(2 + 2 * 3);
    entries.forEach((offset, i) => expect(text.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
    // JPEG 原封不動放進去
    const at = text.indexOf('stream\n', text.indexOf('/DCTDecode')) + 'stream\n'.length;
    expect([...pdf.slice(at, at + jpeg.length)]).toEqual([...jpeg]);
  });

  it('沒有頁面時不產生', () => expect(() => buildImagePdf([])).toThrow());

  it('data: 網址轉成位元組', () => {
    expect([...dataUrlToBytes('data:image/jpeg;base64,/9j/4A==')]).toEqual([0xff, 0xd8, 0xff, 0xe0]);
  });
});

describe('報表頁', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.electronAPI = {
      namedQuery: vi.fn(async (q) => (q === 'fetchEquipmentMovements' ? { success: true, rows: MOVES } : { success: true, rows: [] })),
      isoSignature: vi.fn(async () => ({ success: true, signatures: {}, permissions: {} })),
    };
  });

  it('預設本月；預覽成 A4 表單，攜出／攜入算台數；換月份重新查', async () => {
    const { container } = render(<MemoryRouter><IsoEquipmentForm /></MemoryRouter>);
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    expect(screen.getByLabelText('月份')).toHaveValue(ym);
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const nextYm = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
    expect(window.electronAPI.namedQuery).toHaveBeenCalledWith('fetchEquipmentMovements', [`${ym}-01`, `${nextYm}-01`]);

    await waitFor(() => expect(container.querySelectorAll('.iso-equipment-sheet')).toHaveLength(1));
    expect(screen.getByText('預覽：共 1 頁')).toBeInTheDocument();
    // 借出與歸還各一列，序號一樣
    expect(screen.getAllByText('STG10003Y26', { selector: 'td' })).toHaveLength(2);
    expect(screen.getByText('攜出 2')).toBeInTheDocument();
    expect(screen.getByText('攜入 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /下載 PDF/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Word/ })).toBeNull();

    fireEvent.change(screen.getByLabelText('月份'), { target: { value: '2026-12' } });
    await waitFor(() => expect(window.electronAPI.namedQuery).toHaveBeenLastCalledWith('fetchEquipmentMovements', ['2026-12-01', '2027-01-01']));
    expect(screen.getByText('115年12月份')).toBeInTheDocument();
    await waitFor(() => expect(window.electronAPI.isoSignature).toHaveBeenLastCalledWith('GET', 'S-408-02', '2026-12'));
  });

  it('超過 10 台分成多頁，每頁都有頁碼', async () => {
    window.electronAPI.namedQuery = vi.fn(async () => ({ success: true, rows: Array.from({ length: 12 }, (_, i) => ({ ...MOVES[1], sn: `SN${i}` })) }));
    const { container } = render(<MemoryRouter><IsoEquipmentForm /></MemoryRouter>);
    await waitFor(() => expect(container.querySelectorAll('.iso-equipment-sheet')).toHaveLength(2));
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });
});
