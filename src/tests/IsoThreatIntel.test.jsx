import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { RoleContext } from '../context/RoleContext';
import IsoThreatIntel from '../pages/IsoThreatIntel';
import Overview from '../pages/Overview';
import Reports from '../pages/Reports';
import { monthStatus, previousPeriod, rocMonthLabel, signerLineParts } from '../utils/isoThreatIntel';

/**
 * ISO 27001 S-413-02 威脅情資自我檢核表
 *
 * 任何帳號都能上傳 Word 檔、都能簽；檢核人簽一次就算當月結案；下載的 Word 檔有簽名。
 * 本月狀態：2 日起沒上傳紅色、已上傳沒簽黃色、簽了結案（檢核頁與營運總覽）。
 */
const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const ME = { id: 7, username: 'tom', full_name: '王小明', role: 'IT' };

const ROWS = [
  { no: 1, checkDate: '115/11/01', source: '國家資通安全研究院', item: '【Windows 11】\n微軟釋出115年10月份安全性更新', applicable: '適用', update: '更新' },
  { no: 2, checkDate: '115/11/01', source: '國家資通安全研究院', item: '【ERP 管理系統】\nNode.js 高風險漏洞', applicable: '適用', update: '更新' },
  { no: 3, checkDate: '115/11/01', source: '國家資通安全研究院', item: '【不適用】其餘 23 則公告均不適用', applicable: '不適用', update: '不更新' },
];
const UNSIGNED = {
  id: 5, period: '2026-11', checkDate: '2026-11-01', fileName: 'S-413-02威脅情資自我檢核表_115年10月.docx', fileSize: 98000, rowCount: 3,
  uploadedByName: '楊資安', uploadedAt: '2026-11-01T01:00:00Z', signedByName: null, signedAt: null, signaturePng: null, rows: ROWS, canDelete: false, canRevoke: false,
};
const SIGNED = { ...UNSIGNED, signedByName: '王小明', signedAt: '2026-11-02T02:00:00Z', signaturePng: PNG, canRevoke: true };
const run = (text, extra = {}) => ({ text, bold: false, color: null, size: 24, ...extra });
const cellOf = (...lines) => ({ span: 1, vMerge: null, fill: null, vAlign: 'center', paras: lines.map((l) => ({ align: 'left', runs: [run(l)], pageBreak: false })) });
/** 伺服器讀出的版面（server/threatIntelDocx.js 的 previewChecklistDocx） */
const LAYOUT = {
  page: { width: 16838, height: 11906, margin: { top: 1134, right: 993, bottom: 1134, left: 1440 } },
  header: { docNo: 'S-413-02', docName: '威脅情資自我檢核表', publishDate: '115/06/01', version: 'v1.0', title: '威脅情資自我檢核表', logo: { dataUrl: PNG, widthIn: 1.3, heightIn: 0.55, crop: { l: 0.1, t: 0.2, r: 0.3, b: 0.4 } } },
  footer: ['機密等級：內部使用'],
  hasSignerLine: true,
  blocks: [
    { type: 'table', widths: [1781, 2777, 6626, 1701, 1701], rows: [
      ['檢核日期', '情資來源', '檢核項目', '適用/不適用', '更新/不更新'].map((t) => ({ ...cellOf(t), fill: '#d9d9d9' })),
      [cellOf('115/11/01'), cellOf('國家資通安全研究院'), { ...cellOf('微軟釋出115年10月份安全性更新'), paras: [{ align: 'left', pageBreak: false, runs: [run('【Windows 11】', { bold: true })] }, { align: 'left', pageBreak: false, runs: [run('危險等級：超高風險', { color: '#7a0019' })] }] }, cellOf('■適用', '□不適用'), cellOf('■更新', '□不更新')],
    ] },
    { type: 'p', align: 'right', pageBreak: false, signer: true, runs: [run('檢核人（簽章）：＿＿＿＿＿＿　　　日期：＿＿＿年＿＿月＿＿日')] },
    { type: 'p', align: 'both', pageBreak: true, signer: false, runs: [] },
    { type: 'p', align: 'left', pageBreak: false, signer: false, runs: [run('附件、威脅情資來源')] },
    { type: 'table', widths: [1828, 3827, 8653], rows: [
      [cellOf('類型'), cellOf('情資來源'), cellOf('連結')],
      [{ ...cellOf('系統漏洞'), vMerge: 'restart' }, cellOf('NICS'), cellOf('https://www.nics.nat.gov.tw/')],
      [{ ...cellOf(''), vMerge: 'continue' }, cellOf('Cisco Talos'), cellOf('https://www.talosintelligence.com/')],
    ] },
  ],
};
const latestOf = (c) => (c ? { period: c.period, uploadedAt: c.uploadedAt, uploadedByName: c.uploadedByName, signedByName: c.signedByName, signedAt: c.signedAt } : null);

let state;
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 12, 9, 5, 0));
  state = { checklist: UNSIGNED };
  window.alert = vi.fn();
  window.confirm = vi.fn(() => true);
  window.electronAPI = {
    namedQuery: vi.fn(async () => ({ success: true, rows: [] })),
    isoCheck: vi.fn(async () => ({ success: false })),
    isoRoomCheck: vi.fn(async () => ({ success: false })),
    isoSignature: vi.fn(async (method, form, period) => {
      if (form === 'me') return { success: true, signaturePng: PNG };
      if (period === 'pending') return { success: true, months: [] };
      return { success: true, signatures: {}, permissions: {} };
    }),
    isoThreatIntel: vi.fn(async (method, target) => {
      if (method === 'GET' && Array.isArray(target) && target[1] === 'preview') return { success: true, layout: LAYOUT };
      if (method === 'GET' && target === 'latest') return { success: true, latest: state.latest !== undefined ? state.latest : latestOf(state.checklist) };
      if (method === 'GET') return { success: true, checklist: target === state.checklist?.period ? state.checklist : null };
      return { success: true };
    }),
    isoThreatIntelDownload: vi.fn(async () => ({ success: true, blob: new Blob(['docx']) })),
  };
});
afterEach(() => { vi.useRealTimers(); });

const Where = () => {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname}{loc.search}</div>;
};

const renderPage = (entry = '/iso-threat-intel') => render(
  <RoleContext.Provider value={{ authUser: ME }}>
    <MemoryRouter initialEntries={[entry]}>
      <Routes><Route path="/iso-threat-intel" element={<IsoThreatIntel />} /></Routes>
    </MemoryRouter>
  </RoleContext.Provider>
);

const apiCalls = (method) => window.electronAPI.isoThreatIntel.mock.calls.filter(([m]) => m === method);

describe('工具函式', () => {
  it('本月狀態：2 日起沒上傳紅色、1 日當天一般、已上傳沒簽黃色、簽了結案', () => {
    const nov = { period: '2026-11', signedByName: null };
    expect(monthStatus({ period: '2026-10' }, new Date(2026, 10, 1, 23, 0))).toEqual({ period: '2026-11', state: 'WAITING', level: 'none' });
    expect(monthStatus({ period: '2026-10' }, new Date(2026, 10, 2, 0, 1))).toEqual({ period: '2026-11', state: 'MISSING', level: 'red' });
    expect(monthStatus(null, new Date(2026, 10, 20))).toMatchObject({ state: 'MISSING', level: 'red' });
    expect(monthStatus(nov, new Date(2026, 10, 20))).toEqual({ period: '2026-11', state: 'UNSIGNED', level: 'yellow' });
    expect(monthStatus({ ...nov, signedByName: '王小明' }, new Date(2026, 10, 20))).toEqual({ period: '2026-11', state: 'CLOSED', level: 'green' });
    // 1 日就上傳了但還沒簽：黃色
    expect(monthStatus(nov, new Date(2026, 10, 1))).toMatchObject({ level: 'yellow' });
  });

  it('簽章那一行：簽名放在底線的位置、日期填簽核日期；沒有底線就照原文字', () => {
    const at = new Date(2026, 10, 12, 17, 9).toISOString();
    expect(signerLineParts('檢核人（簽章）：＿＿＿＿＿　　　日期：＿＿＿年＿＿月＿＿日', at)).toEqual({ label: '檢核人（簽章）：', after: '　　　日期：115年11月12日' });
    expect(signerLineParts('檢核人：____ 備註', at)).toEqual({ label: '檢核人：', after: ' 備註' });
    expect(signerLineParts('檢核人', at)).toEqual({ label: '檢核人', after: '' });
  });

  it('月份', () => {
    expect(previousPeriod('2026-11')).toBe('2026-10');
    expect(previousPeriod('2027-01')).toBe('2026-12');
    expect(rocMonthLabel('2026-11')).toBe('115年11月');
  });
});

describe('威脅情資自我檢核表頁面', () => {
  it('已上傳未簽核：黃色提醒；列出各列；任何人都能上傳（替換）與簽核；不是上傳者看不到刪除', async () => {
    renderPage();
    const status = await screen.findByTestId('threat-intel-status');
    expect(status).toHaveAttribute('data-level', 'yellow');
    expect(status).toHaveTextContent('本月（115年11月）的檢核表已上傳');
    expect(status).toHaveTextContent('尚未簽核，請檢核人簽名');
    expect(screen.getByTestId('threat-row-1')).toHaveTextContent('【Windows 11】');
    expect(screen.getByTestId('threat-row-3')).toHaveTextContent('不適用');
    expect(screen.getByTestId('threat-intel-signer')).toHaveTextContent('尚未簽核');
    expect(screen.getByRole('button', { name: /替換檢核表/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /簽核（檢核人）/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /刪除/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^下載 Word$/ })).toBeInTheDocument();
  });

  it('簽核：用自己的簽名檔送出；簽完重新讀', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /簽核（檢核人）/ }));
    fireEvent.click(await screen.findByRole('button', { name: '使用我的簽名檔簽核' }));
    await waitFor(() => expect(apiCalls('POST')).toHaveLength(1));
    expect(apiCalls('POST')[0]).toEqual(['POST', [5, 'sign'], { useSaved: true }]);
    await waitFor(() => expect(apiCalls('GET').filter(([, t]) => t === '2026-11').length).toBe(2));
  });

  it('已簽核：綠色結案、顯示檢核人簽名；簽的人可以撤銷', async () => {
    state.checklist = SIGNED;
    renderPage();
    const status = await screen.findByTestId('threat-intel-status');
    expect(status).toHaveAttribute('data-level', 'green');
    expect(status).toHaveTextContent('本月（115年11月）已結案：檢核人 王小明');
    const signer = screen.getByTestId('threat-intel-signer');
    expect(within(signer).getByAltText('檢核人簽名')).toBeInTheDocument();
    expect(signer).toHaveTextContent('已簽核・當月結案');
    expect(screen.queryByRole('button', { name: /簽核（檢核人）/ })).toBeNull();
    expect(screen.getByRole('button', { name: /下載 Word（含簽名）/ })).toBeInTheDocument();
    fireEvent.click(within(signer).getByRole('button', { name: /撤銷簽核/ }));
    await waitFor(() => expect(apiCalls('DELETE')[0]).toEqual(['DELETE', [5, 'sign']]));
    expect(window.confirm.mock.calls[0][0]).toContain('撤銷後這個月會變回未結案');
  });

  it('上傳的人：可以刪除', async () => {
    state.checklist = { ...SIGNED, canDelete: true };
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /刪除/ }));
    await waitFor(() => expect(apiCalls('DELETE')[0]).toEqual(['DELETE', 5]));
    expect(window.confirm.mock.calls[0][0]).toContain('王小明 的檢核人簽核會一併刪除');
  });

  it('上傳：選 Word 檔送出；同月份已有 → 問要不要替換（會清掉簽核），確定後帶 replace 再送一次', async () => {
    window.electronAPI.isoThreatIntel.mockImplementation(async (method, target, body) => {
      if (method === 'POST') {
        return body.replace
          ? { success: true, checklist: { period: '2026-11' }, clearedSignature: true }
          : { success: false, exists: true, period: '2026-11', fileName: '舊檔.docx', signedByName: '王小明', error: '已經有檢核表' };
      }
      if (method === 'GET' && target === 'latest') return { success: true, latest: latestOf(SIGNED) };
      return { success: true, checklist: SIGNED };
    });
    renderPage();
    await screen.findByTestId('threat-row-1');
    const file = new File(['PK-docx'], 'S-413-02威脅情資自我檢核表_115年10月.docx');
    fireEvent.change(screen.getByTestId('threat-intel-file'), { target: { files: [file] } });
    await waitFor(() => expect(apiCalls('POST')).toHaveLength(2));
    const [first, second] = apiCalls('POST');
    expect(first[2]).toMatchObject({ fileName: 'S-413-02威脅情資自我檢核表_115年10月.docx', replace: false });
    expect(first[2].fileBase64).toBe(btoa('PK-docx'));
    expect(second[2]).toMatchObject({ replace: true });
    expect(window.confirm.mock.calls[0][0]).toContain('115年11月已經有檢核表（舊檔.docx）');
    expect(window.confirm.mock.calls[0][0]).toContain('王小明 的檢核人簽核會清除，替換後要重新簽核');
  });

  it('上傳：不是 .docx 直接擋下，不送出', async () => {
    renderPage();
    await screen.findByTestId('threat-row-1');
    fireEvent.change(screen.getByTestId('threat-intel-file'), { target: { files: [new File(['x'], 'a.pdf')] } });
    expect(window.alert).toHaveBeenCalledWith('只能上傳 Word（.docx）檔。');
    expect(apiCalls('POST')).toHaveLength(0);
  });

  it('下載 Word：檔名照上傳的', async () => {
    state.checklist = SIGNED;
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const clicked = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /下載 Word（含簽名）/ }));
    await waitFor(() => expect(window.electronAPI.isoThreatIntelDownload).toHaveBeenCalledWith(5));
    await waitFor(() => expect(clicked).toHaveBeenCalled());
    expect(clicked.mock.contexts[0].download).toBe('S-413-02威脅情資自我檢核表_115年10月.docx');
    clicked.mockRestore();
  });

  it('本月還沒上傳（12 日）：紅色醒目提醒；這個月份顯示還沒上傳', async () => {
    state.checklist = { ...SIGNED, period: '2026-10' };
    renderPage();
    const status = await screen.findByTestId('threat-intel-status');
    expect(status).toHaveAttribute('data-level', 'red');
    expect(status).toHaveTextContent('本月（115年11月）的檢核表尚未上傳；最近一份是 115年10月');
    expect(status).toHaveTextContent('請盡快上傳');
    expect(screen.getByTestId('threat-intel-empty')).toHaveTextContent('115年11月的威脅情資自我檢核表還沒上傳');
    expect(screen.getByRole('button', { name: /上傳檢核表/ })).toBeInTheDocument();
  });

  it('檢視表單：照 Word 版面畫出頁首、檢核表、簽章那一行、附件；簽了就放簽名與日期', async () => {
    state.checklist = SIGNED;
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: /檢視表單/ }));
    const page1 = await screen.findByTestId('threat-sheet-page-1');
    expect(apiCalls('GET').some(([, t]) => Array.isArray(t) && t[0] === 5 && t[1] === 'preview')).toBe(true);
    expect(page1).toHaveTextContent('文件編號：S-413-02');
    expect(page1).toHaveTextContent('發布日期：115/06/01');
    expect(within(page1).getByAltText('LOGO')).toBeInTheDocument();
    expect(page1).toHaveTextContent('【Windows 11】');
    expect(page1).toHaveTextContent('機密等級：內部使用');
    const line = page1.querySelector('[data-signer-line]');
    expect(line).toHaveAttribute('data-signer-line', 'signed');
    expect(within(line).getByAltText('檢核人簽名')).toHaveAttribute('src', PNG);
    expect(line).toHaveTextContent('檢核人（簽章）：');
    expect(line).toHaveTextContent('日期：115年11月02日');
    expect(line).not.toHaveTextContent('＿');
    // 分頁後的附件在第 2 頁
    expect(screen.getByTestId('threat-sheet-page-2')).toHaveTextContent('附件、威脅情資來源');
    // 逐列內容收起來
    expect(screen.getByLabelText('檢核項目')).not.toBeVisible();
  });

  it('檢視表單：還沒簽就照原檔的底線', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: /檢視表單/ }));
    const page1 = await screen.findByTestId('threat-sheet-page-1');
    const line = page1.querySelector('[data-signer-line]');
    expect(line).toHaveAttribute('data-signer-line', 'unsigned');
    expect(line).toHaveTextContent('日期：＿＿＿年＿＿月＿＿日');
    expect(within(page1).queryByAltText('檢核人簽名')).toBeNull();
  });

  it('網址帶 ?month= 直接開那個月', async () => {
    state.checklist = { ...SIGNED, period: '2026-10' };
    renderPage('/iso-threat-intel?month=2026-10');
    expect(await screen.findByTestId('threat-row-1')).toBeInTheDocument();
    expect(screen.getByText('115年10月檢核（115年09月份情資）')).toBeInTheDocument();
  });
});

describe('營運總覽與報表中心', () => {
  const showOverview = () => render(
    <RoleContext.Provider value={{ authUser: ME }}>
      <MemoryRouter initialEntries={['/overview']}>
        <Routes>
          <Route path="/overview" element={<Overview />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </RoleContext.Provider>
  );

  it('2 日起本月還沒上傳：紅色醒目提醒；點了進檢核頁', async () => {
    state.checklist = { ...SIGNED, period: '2026-10' };
    showOverview();
    const box = await screen.findByTestId('overview-iso-check-S-413-02');
    expect(box).toHaveAttribute('data-overdue', 'true');
    expect(box).toHaveClass('overview-iso-check-overdue');
    expect(box).toHaveTextContent('威脅情資自我檢核表 (ISO 27001 S-413-02)');
    expect(box).toHaveTextContent('本月尚未上傳（最近一份：115年10月）');
    expect(box).toHaveTextContent('本月（115年11月）的檢核表尚未上傳，請盡快上傳');
    fireEvent.click(box);
    expect(await screen.findByTestId('where')).toHaveTextContent('/iso-threat-intel');
  });

  it('已上傳未簽核：黃色提醒', async () => {
    showOverview();
    const box = await screen.findByTestId('overview-iso-check-S-413-02');
    expect(box).toHaveAttribute('data-overdue', 'false');
    expect(box).toHaveAttribute('data-warning', 'true');
    expect(box).toHaveClass('overview-iso-check-warning');
    expect(box).toHaveTextContent('本月已上傳：');
    expect(box).toHaveTextContent('・楊資安');
    expect(box).toHaveTextContent('已上傳，尚未簽核，請檢核人簽名');
  });

  it('有人簽核：當月結案，不提醒', async () => {
    state.checklist = SIGNED;
    showOverview();
    const box = await screen.findByTestId('overview-iso-check-S-413-02');
    expect(box).toHaveAttribute('data-overdue', 'false');
    expect(box).toHaveAttribute('data-warning', 'false');
    expect(box).toHaveTextContent('本月已結案：檢核人 王小明');
  });

  it('1 日當天還沒上傳：不算逾期', async () => {
    vi.setSystemTime(new Date(2026, 10, 1, 9, 0, 0));
    state.checklist = null;
    state.latest = null;
    showOverview();
    const box = await screen.findByTestId('overview-iso-check-S-413-02');
    expect(box).toHaveAttribute('data-overdue', 'false');
    expect(box).toHaveAttribute('data-warning', 'false');
    expect(box).toHaveTextContent('本月（115年11月）的檢核表今天要上傳');
  });

  it('報表中心有威脅情資自我檢核表的卡片', () => {
    render(<MemoryRouter><Reports /></MemoryRouter>);
    expect(screen.getByText('威脅情資自我檢核表 (ISO 27001 S-413-02)')).toBeInTheDocument();
  });
});
