import React from 'react';
import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import IsoEquipmentForm from '../pages/IsoEquipmentForm';
import { toFormRows, monthRange, formatRocDate, fillEquipmentForm, formFileName, MIN_ROWS } from '../utils/isoEquipmentForm';
import { queries } from '../../database/queries';

/**
 * ISO 27001「S-408-02 設備攜出入單」依月份匯出
 *
 * 用公司的範本檔填：頁首頁尾不動，只填表格。只列設備；同廠牌／型號／規格加總數量；
 * 進貨＝攜入／進貨／供應商、出貨＝攜出／出貨／客戶、借出＝攜出／借出／客戶、歸還＝攜入／歸還／客戶。
 */
const TEMPLATE = fs.readFileSync(path.resolve(__dirname, '../assets/templates/S-408-02-equipment-in-out-v1.0.docx'));

const MOVES = [
  { move_date: '2026-09-10', direction: 'OUT', reason: '借出', vendor: '元大證券', brand: 'SECRETHFT', model: 'SECRETHFT-ARL', specification: '8C-Gen1', qty: 1 },
  { move_date: '2026-09-12', direction: 'IN', reason: '進貨', vendor: '利得數位', brand: 'CISCO', model: 'NEXUS 3548-XL', specification: '', qty: 1 },
  { move_date: '2026-09-23', direction: 'OUT', reason: '出貨', vendor: 'Saccade & Co <TW>', brand: 'BLACKCORE', model: '3122-SM', specification: '26C', qty: 5 },
  { move_date: '2026-09-30', direction: 'IN', reason: '歸還', vendor: '元大證券', brand: 'SECRETHFT', model: 'SECRETHFT-ARL', specification: '8C-Gen1', qty: 1 },
];

/** 產生的 .docx 解開：表格每列的文字（每格以 | 分隔） */
const unpack = async (blob) => {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = await zip.file('word/document.xml').async('string');
  const rows = (xml.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || []).map((tr) => (tr.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || [])
    .map((tc) => tc.replace(/<\/w:p>/g, ' ').replace(/<[^>]+>/g, '').trim().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')));
  const title = xml.slice(xml.indexOf('<w:body>'), xml.indexOf('<w:tbl>')).replace(/<[^>]+>/g, '').trim();
  return { zip, xml, rows, title };
};

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
    expect(q).toContain('GROUP BY move_date, direction, reason, src, vendor, brand, model, specification');
  });
  it('月份區間：起日含、下個月 1 號不含；12 月跨年', () => {
    expect(monthRange(2026, 9)).toEqual(['2026-09-01', '2026-10-01']);
    expect(monthRange(2026, 12)).toEqual(['2026-12-01', '2027-01-01']);
  });
});

describe('表單的列', () => {
  it('民國日期、設備名稱（廠牌 型號 規格）、數量', () => {
    expect(formatRocDate('2026-09-10')).toBe('115/09/10');
    expect(toFormRows(MOVES)[0]).toEqual({ date: '115/09/10', name: 'SECRETHFT SECRETHFT-ARL 8C-Gen1', qty: 1, direction: 'OUT', reason: '借出', vendor: '元大證券' });
    expect(toFormRows(MOVES)[1].name).toBe('CISCO NEXUS 3548-XL');
  });
  it('檔名', () => expect(formFileName(2026, 9)).toBe('S-408-02設備攜出入單_115年09月.docx'));
});

describe('填範本', () => {
  it('標題換成年月；設備名稱、數量拆成兩欄；逐列填入', async () => {
    const { rows, title } = await unpack(await fillEquipmentForm(TEMPLATE, { year: 2026, month: 9, rows: toFormRows(MOVES) }));
    expect(title).toBe('115年09月份');
    expect(rows[0]).toEqual(['日期', '設備名稱', '數量', '用途', '原因', '廠商', '機房管理員', '權責主管']);
    expect(rows[1]).toEqual(['115/09/10', 'SECRETHFT SECRETHFT-ARL 8C-Gen1', '1', '☑攜出 □攜入', '借出', '元大證券', '', '']);
    expect(rows[2]).toEqual(['115/09/12', 'CISCO NEXUS 3548-XL', '1', '□攜出 ☑攜入', '進貨', '利得數位', '', '']);
    // 特殊字元要逸出，Word 才打得開
    expect(rows[3][5]).toBe('Saccade & Co <TW>');
    expect(rows[4].slice(3, 6)).toEqual(['□攜出 ☑攜入', '歸還', '元大證券']);
  });

  it('不足 10 列補空白列；超過就往下加', async () => {
    const few = await unpack(await fillEquipmentForm(TEMPLATE, { year: 2026, month: 9, rows: toFormRows(MOVES) }));
    expect(few.rows).toHaveLength(1 + MIN_ROWS);
    expect(few.rows[MIN_ROWS]).toEqual(['', '', '', '□攜出 □攜入', '', '', '', '']);
    const many = Array.from({ length: 23 }, () => MOVES[0]);
    const lots = await unpack(await fillEquipmentForm(TEMPLATE, { year: 2026, month: 9, rows: toFormRows(many) }));
    expect(lots.rows).toHaveLength(24);
  });

  it('欄寬：總寬不變；表頭每頁重複；複製的列沒有重複的段落編號', async () => {
    const { xml } = await unpack(await fillEquipmentForm(TEMPLATE, { year: 2026, month: 9, rows: toFormRows(MOVES) }));
    const grid = [...xml.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map((x) => Number(x[1]));
    expect(grid).toEqual([1560, 2885, 800, 1559, 2410, 2268, 1985, 1842]);
    expect(xml).toContain('<w:tblHeader/>');
    const tableXml = xml.slice(xml.indexOf('<w:tbl>'), xml.indexOf('</w:tbl>'));
    const ids = [...tableXml.matchAll(/w14:paraId="([^"]+)"/g)].map((x) => x[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('頁首、頁尾、樣式原封不動', async () => {
    const { zip } = await unpack(await fillEquipmentForm(TEMPLATE, { year: 2026, month: 9, rows: [] }));
    const orig = await JSZip.loadAsync(TEMPLATE);
    for (const f of Object.keys(orig.files).filter((n) => /header|footer|styles|media/.test(n))) {
      expect(await zip.file(f).async('base64')).toBe(await orig.file(f).async('base64'));
    }
  });
});

describe('報表頁', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.electronAPI = {
      namedQuery: vi.fn(async (q) => (q === 'fetchEquipmentMovements' ? { success: true, rows: MOVES } : { success: true, rows: [] })),
    };
  });

  it('預設上個月；預覽列出設備進出與攜出／攜入數量；換月份重新查', async () => {
    render(<MemoryRouter><IsoEquipmentForm /></MemoryRouter>);
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const ym = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
    expect(screen.getByLabelText('月份')).toHaveValue(ym);
    // 借出與歸還各一列
    await waitFor(() => expect(screen.getAllByText('SECRETHFT SECRETHFT-ARL 8C-Gen1', { selector: 'td' })).toHaveLength(2));
    expect(screen.getByText('攜出 6')).toBeInTheDocument();
    expect(screen.getByText('攜入 2')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('月份'), { target: { value: '2026-12' } });
    await waitFor(() => expect(window.electronAPI.namedQuery).toHaveBeenLastCalledWith('fetchEquipmentMovements', ['2026-12-01', '2027-01-01']));
    expect(screen.getByText('115年12月份')).toBeInTheDocument();
  });
});
