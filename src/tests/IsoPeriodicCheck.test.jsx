import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { RoleContext } from '../context/RoleContext';

// jsdom 畫不出來：拍照的部分換成回傳一張固定大小的假圖
vi.mock('html2canvas', () => ({
  default: vi.fn(async () => ({ width: 2246, height: 1588, toDataURL: () => 'data:image/jpeg;base64,/9j/4A==' })),
}));
import html2canvas from 'html2canvas';
import IsoPeriodicCheck from '../pages/IsoPeriodicCheck';
import Overview from '../pages/Overview';
import Reports from '../pages/Reports';
import {
  ISO_CHECK_FORMS, reviewStatus, daysBetween, paginateRecords, recordsOfYear, validateCheck, formFileName, daysAgoText, toPayload,
} from '../utils/isoPeriodicCheck';

/**
 * ISO 27001 定期檢查紀錄（S-409-01 備份檢查紀錄表、S-409-02 日誌審查紀錄表）
 *
 * 報表中心新增一筆：日期預設今天可改、正常／異常勾選（異常要寫說明；備份檢查正常要填最後備份日）、
 * 人員是目前登入帳號；依年度照範本格式預覽、下載 PDF。
 * 營運總覽一律顯示兩張表最後一次的日期，超過兩週沒做就醒目提醒。
 */
const LOG = ISO_CHECK_FORMS['S-409-02'];
const BACKUP = ISO_CHECK_FORMS['S-409-01'];
const NORMAL = [{ key: 'FIREWALL', status: 'NORMAL', note: '' }, { key: 'CORE_SWITCH', status: 'NORMAL', note: '' }];
const LOG_RECORDS = [
  { id: 3, formCode: 'S-409-02', checkDate: '2026-11-05', results: [{ key: 'FIREWALL', status: 'ABNORMAL', note: 'WAN 異常登入 3 次' }, NORMAL[1]], reviewerId: 7, reviewerName: '王機房', canManage: true },
  { id: 2, formCode: 'S-409-02', checkDate: '2026-10-22', results: NORMAL, reviewerId: 8, reviewerName: '李主管', canManage: false },
  { id: 1, formCode: 'S-409-02', checkDate: '2025-12-30', results: NORMAL, reviewerId: 8, reviewerName: '李主管', canManage: false },
];
const BACKUP_RECORDS = [
  { id: 11, formCode: 'S-409-01', checkDate: '2026-10-20', reviewerId: 7, reviewerName: '王機房', canManage: true,
    results: [{ key: 'FIREWALL', status: 'NORMAL', note: '', lastBackup: '115/10/18' }, { key: 'CORE_SWITCH', status: 'ABNORMAL', note: 'TFTP 逾時', lastBackup: '' }] },
];

const ME = { id: 7, username: 'tom', full_name: '王機房', role: 'IT' };

let store;
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 11, 10, 0, 0));
  store = { 'S-409-01': [...BACKUP_RECORDS], 'S-409-02': [...LOG_RECORDS] };
  window.alert = vi.fn();
  window.electronAPI = {
    namedQuery: vi.fn(async () => ({ success: true, rows: [] })),
    isoCheck: vi.fn(async (method, form, id, body) => {
      if (method === 'GET' && form === 'latest') {
        return { success: true, forms: Object.fromEntries(Object.entries(store).map(([k, rows]) => [k, { lastDate: rows[0]?.checkDate || null, reviewerName: rows[0]?.reviewerName || null }])) };
      }
      if (method === 'GET') return { success: true, rows: store[form] };
      if (method === 'POST') {
        const row = { id: 99, formCode: form, ...body, reviewerId: ME.id, reviewerName: ME.full_name, canManage: true };
        store[form] = [row, ...store[form]];
        return { success: true, row };
      }
      if (method === 'DELETE') { store[form] = store[form].filter((r) => r.id !== id); return { success: true }; }
      return { success: true, row: { ...store[form].find((r) => r.id === id), ...body } };
    }),
  };
});
afterEach(() => { vi.useRealTimers(); });

const renderPage = (formCode) => render(
  <RoleContext.Provider value={{ authUser: ME }}>
    <MemoryRouter><IsoPeriodicCheck formCode={formCode} /></MemoryRouter>
  </RoleContext.Provider>
);

const calls = (method) => window.electronAPI.isoCheck.mock.calls.filter(([m]) => m === method);

describe('工具函式', () => {
  it('超過 14 天才算逾期；沒有紀錄也算', () => {
    const now = new Date(2026, 10, 11, 7, 30); // 台灣早上 7 點半：toISOString 還是前一天，這裡要用本地日期
    expect(reviewStatus('2026-10-28', now)).toEqual({ lastDate: '2026-10-28', days: 14, overdue: false });
    expect(reviewStatus('2026-10-27', now)).toEqual({ lastDate: '2026-10-27', days: 15, overdue: true });
    expect(reviewStatus(null, now)).toEqual({ lastDate: null, days: null, overdue: true });
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysAgoText(0)).toBe('今天');
    expect(daysAgoText(-1)).toBe('今天');
    expect(daysAgoText(6)).toBe('6 天前');
  });

  it('分頁照各自範本：日誌審查一頁三次、備份檢查一頁四次；年度由舊到新', () => {
    const year = recordsOfYear(LOG_RECORDS, 2026);
    expect(year.map((r) => r.id)).toEqual([2, 3]);
    expect(paginateRecords(year, LOG.perPage)).toEqual([[year[0], year[1], null]]);
    expect(paginateRecords([], BACKUP.perPage)).toEqual([[null, null, null, null]]);
    expect(paginateRecords([1, 2, 3, 4, 5], BACKUP.perPage).map((p) => p.length)).toEqual([4, 4]);
    expect(formFileName(LOG, 2026)).toBe('S-409-02日誌審查紀錄表_115年.pdf');
    expect(formFileName(BACKUP, 2026)).toBe('S-409-01備份檢查紀錄表_115年.pdf');
  });

  it('送出前檢查與送出內容', () => {
    expect(validateCheck(LOG, { checkDate: '2026-11-11', results: NORMAL }, '2026-11-11')).toBe('');
    expect(validateCheck(LOG, { checkDate: '2026-11-12', results: NORMAL }, '2026-11-11')).toBe('審查日期不能是未來的日期。');
    expect(validateCheck(LOG, { checkDate: '2026-11-11', results: [NORMAL[0]] }, '2026-11-11')).toContain('Core Switch');
    expect(validateCheck(BACKUP, { checkDate: '2026-11-11', results: NORMAL }, '2026-11-11')).toBe('「防火牆」勾了正常，請填寫最後備份日。');
    expect(toPayload(BACKUP, '2026-11-11', [
      { key: 'FIREWALL', status: 'NORMAL', note: '殘留', lastBackup: ' 115/11/10 ' },
      { key: 'CORE_SWITCH', status: 'ABNORMAL', note: ' 失敗 ', lastBackup: '殘留' },
    ])).toEqual({ checkDate: '2026-11-11', results: [
      { key: 'FIREWALL', status: 'NORMAL', note: '', lastBackup: '115/11/10' },
      { key: 'CORE_SWITCH', status: 'ABNORMAL', note: '失敗', lastBackup: '' },
    ] });
    // 日誌審查沒有最後備份日
    expect(toPayload(LOG, '2026-11-11', NORMAL).results[0]).not.toHaveProperty('lastBackup');
  });
});

describe('日誌審查紀錄表頁面 (S-409-02)', () => {
  it('列出今年的紀錄（新的在上），異常帶說明；只有能改的才有修改、刪除', async () => {
    renderPage('S-409-02');
    expect(await screen.findByRole('heading', { name: /日誌審查紀錄表 \(ISO 27001 S-409-02\)/ })).toBeInTheDocument();
    const first = await screen.findByTestId('iso-check-row-3');
    expect(window.electronAPI.isoCheck).toHaveBeenCalledWith('GET', 'S-409-02');
    expect(first).toHaveTextContent('115/11/05');
    expect(first).toHaveTextContent('WAN 異常登入 3 次');
    expect(within(first).getByRole('button', { name: /修改/ })).toBeInTheDocument();
    const second = screen.getByTestId('iso-check-row-2');
    expect(within(second).queryByRole('button', { name: /修改/ })).toBeNull();
    expect(second).toHaveTextContent('審查人員本人或管理員可修改');
    expect(screen.queryByTestId('iso-check-row-1')).toBeNull();
    const status = screen.getByTestId('iso-check-status');
    expect(status).toHaveAttribute('data-overdue', 'false');
    expect(status).toHaveTextContent('最後審查日期：115/11/05（6 天前）');
  });

  it('新增：日期帶今天、審查人員是登入帳號；正常異常擇一，異常要寫說明；送出不帶審查人員', async () => {
    renderPage('S-409-02');
    await screen.findByTestId('iso-check-row-3');
    fireEvent.click(screen.getByRole('button', { name: /新增審查紀錄/ }));
    const dialog = screen.getByRole('dialog', { name: '新增日誌審查紀錄表' });
    const date = within(dialog).getByLabelText('審查日期');
    expect(date).toHaveValue('2026-11-11');
    expect(date).toHaveAttribute('max', '2026-11-11');
    expect(within(dialog).getByTestId('iso-check-reviewer')).toHaveTextContent('王機房');
    // 日誌審查沒有最後備份日
    fireEvent.click(within(dialog).getByLabelText('防火牆 正常'));
    expect(within(dialog).queryByLabelText('防火牆 最後備份日')).toBeNull();

    fireEvent.click(within(dialog).getByRole('button', { name: '新增' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('請勾選「Core Switch」的審查結果');
    expect(calls('POST')).toHaveLength(0);

    // 勾選互斥
    fireEvent.click(within(dialog).getByLabelText('防火牆 異常'));
    expect(within(dialog).getByLabelText('防火牆 正常')).not.toBeChecked();
    expect(within(dialog).getByLabelText('防火牆 異常')).toBeChecked();
    fireEvent.click(within(dialog).getByLabelText('Core Switch 正常'));

    fireEvent.click(within(dialog).getByRole('button', { name: '新增' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('「防火牆」勾了異常，請填寫異常說明');

    fireEvent.change(within(dialog).getByLabelText('防火牆 異常說明'), { target: { value: '  Policy 被改過  ' } });
    fireEvent.change(date, { target: { value: '2026-11-10' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '新增' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(calls('POST')).toEqual([['POST', 'S-409-02', null, {
      checkDate: '2026-11-10',
      results: [{ key: 'FIREWALL', status: 'ABNORMAL', note: 'Policy 被改過' }, { key: 'CORE_SWITCH', status: 'NORMAL', note: '' }],
    }]]);
    expect(await screen.findByTestId('iso-check-row-99')).toHaveTextContent('115/11/10');
  });

  it('修改：帶出原本內容，維持原審查人員', async () => {
    renderPage('S-409-02');
    const row = await screen.findByTestId('iso-check-row-3');
    fireEvent.click(within(row).getByRole('button', { name: /修改/ }));
    const dialog = screen.getByRole('dialog', { name: '修改日誌審查紀錄表' });
    expect(within(dialog).getByLabelText('審查日期')).toHaveValue('2026-11-05');
    expect(within(dialog).getByLabelText('防火牆 異常')).toBeChecked();
    expect(within(dialog).getByLabelText('防火牆 異常說明')).toHaveValue('WAN 異常登入 3 次');
    expect(within(dialog).getByTestId('iso-check-reviewer')).toHaveTextContent('王機房');
    fireEvent.click(within(dialog).getByLabelText('防火牆 正常'));
    fireEvent.click(within(dialog).getByRole('button', { name: '儲存修改' }));
    await waitFor(() => expect(calls('PUT')).toHaveLength(1));
    expect(calls('PUT')[0]).toEqual(['PUT', 'S-409-02', 3, { checkDate: '2026-11-05', results: NORMAL }]);
  });

  it('刪除要確認', async () => {
    window.confirm = vi.fn(() => true);
    renderPage('S-409-02');
    const row = await screen.findByTestId('iso-check-row-3');
    fireEvent.click(within(row).getByRole('button', { name: /刪除/ }));
    expect(window.confirm.mock.calls[0][0]).toContain('115/11/05 的日誌審查紀錄表');
    await waitFor(() => expect(screen.queryByTestId('iso-check-row-3')).toBeNull());
    expect(calls('DELETE')).toEqual([['DELETE', 'S-409-02', 3]]);
  });

  it('表單預覽照範本：一頁三次、日期合併兩列、勾選結果與異常說明', async () => {
    const { container } = renderPage('S-409-02');
    await screen.findByTestId('iso-check-row-3');
    const sheets = container.querySelectorAll('.iso-periodic-check-sheet');
    expect(sheets).toHaveLength(1);
    const sheet = sheets[0];
    expect(sheet).toHaveTextContent('文件編號：S-409-02');
    expect(sheet).toHaveTextContent('文件名稱：日誌審查紀錄表');
    expect(sheet).toHaveTextContent('備註：雙周檢視一次');
    expect(sheet).toHaveTextContent('機密等級：內部使用');
    expect([...sheet.querySelectorAll('thead th')].map((t) => t.textContent)).toEqual(['審查日期', '審查內容', '審查結果', '審查人員']);
    const trs = sheet.querySelectorAll('tbody tr');
    expect(trs).toHaveLength(6);
    expect(trs[0].querySelector('td[rowspan="2"]')).toHaveTextContent('115/10/22');
    expect(trs[2].querySelector('td[rowspan="2"]')).toHaveTextContent('115/11/05');
    expect(trs[2].querySelector('[data-result]').dataset.result).toBe('ABNORMAL');
    expect(trs[2]).toHaveTextContent('WAN 異常登入 3 次');
    expect(trs[2]).toHaveTextContent('防火牆System Log、Event Log');
    expect(trs[3].querySelector('[data-result]').dataset.result).toBe('NORMAL');
    expect(trs[3]).toHaveTextContent('王機房');
    expect(trs[3]).not.toHaveTextContent('最後備份日');
    expect(trs[4]).toHaveAttribute('data-blank', 'true');
  });

  it('下載 PDF：每頁拍照組成 PDF', async () => {
    // 拍照前等兩個畫面更新（requestAnimationFrame），固定住的假時間會讓它停住；這裡跟日期無關，用真的時間
    vi.useRealTimers();
    let pdfBlob;
    URL.createObjectURL = vi.fn((b) => { pdfBlob = b; return 'blob:x'; });
    URL.revokeObjectURL = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    // jsdom 不會真的載入 LOGO，拍照前會等到逾時（5 秒）；當成已載入
    const completeSpy = vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
    renderPage('S-409-02');
    await screen.findByTestId('iso-check-row-3');
    fireEvent.click(screen.getByRole('button', { name: /下載 PDF/ }));
    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect(html2canvas).toHaveBeenCalledTimes(1);
    expect(html2canvas.mock.calls[0][0]).toHaveClass('iso-periodic-check-sheet');
    expect(html2canvas.mock.calls[0][1]).toMatchObject({ scale: 2, width: 1123, height: 794 });
    expect(pdfBlob.type).toBe('application/pdf');
    expect(clickSpy.mock.contexts[0].download).toBe('S-409-02日誌審查紀錄表_115年.pdf');
    clickSpy.mockRestore();
    completeSpy.mockRestore();
  });
});

describe('備份檢查紀錄表頁面 (S-409-01)', () => {
  it('超過兩週：醒目提醒；列表帶最後備份日', async () => {
    renderPage('S-409-01');
    const row = await screen.findByTestId('iso-check-row-11');
    expect(window.electronAPI.isoCheck).toHaveBeenCalledWith('GET', 'S-409-01');
    expect(row).toHaveTextContent('最後備份日：115/10/18');
    expect(row).toHaveTextContent('TFTP 逾時');
    const status = screen.getByTestId('iso-check-status');
    expect(status).toHaveAttribute('data-overdue', 'true');
    expect(status).toHaveTextContent('最後檢查日期：115/10/20（22 天前）');
    expect(status).toHaveTextContent('已超過 14 天（雙周）未檢查');
  });

  it('新增：勾正常要填最後備份日（文字），用語是檢查', async () => {
    renderPage('S-409-01');
    await screen.findByTestId('iso-check-row-11');
    fireEvent.click(screen.getByRole('button', { name: /新增檢查紀錄/ }));
    const dialog = screen.getByRole('dialog', { name: '新增備份檢查紀錄表' });
    expect(within(dialog).getByLabelText('檢查日期')).toHaveValue('2026-11-11');
    expect(dialog).toHaveTextContent('檢查人員');
    expect(dialog).toHaveTextContent('組態檔案(雙周備份)');

    fireEvent.click(within(dialog).getByLabelText('防火牆 正常'));
    fireEvent.click(within(dialog).getByLabelText('Core Switch 正常'));
    fireEvent.click(within(dialog).getByRole('button', { name: '新增' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('「防火牆」勾了正常，請填寫最後備份日');

    fireEvent.change(within(dialog).getByLabelText('防火牆 最後備份日'), { target: { value: '115/11/10' } });
    fireEvent.change(within(dialog).getByLabelText('Core Switch 最後備份日'), { target: { value: ' 115/11/09 ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '新增' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(calls('POST')).toEqual([['POST', 'S-409-01', null, {
      checkDate: '2026-11-11',
      results: [
        { key: 'FIREWALL', status: 'NORMAL', note: '', lastBackup: '115/11/10' },
        { key: 'CORE_SWITCH', status: 'NORMAL', note: '', lastBackup: '115/11/09' },
      ],
    }]]);
    // 新增後狀態變成今天、不再提醒
    await waitFor(() => expect(screen.getByTestId('iso-check-status')).toHaveAttribute('data-overdue', 'false'));
  });

  it('表單預覽照範本：五個欄位、一頁四次、正常印最後備份日', async () => {
    const { container } = renderPage('S-409-01');
    await screen.findByTestId('iso-check-row-11');
    const sheet = container.querySelector('.iso-periodic-check-sheet');
    expect(sheet).toHaveTextContent('文件編號：S-409-01');
    expect(sheet).toHaveTextContent('文件名稱：備份檢查紀錄表');
    expect([...sheet.querySelectorAll('thead th')].map((t) => t.textContent)).toEqual(['檢查日期', '備份項目', '備份內容', '檢查結果', '檢查人員']);
    const trs = sheet.querySelectorAll('tbody tr');
    expect(trs).toHaveLength(8);
    expect(trs[0].querySelector('td[rowspan="2"]')).toHaveTextContent('115/10/20');
    expect(trs[0]).toHaveTextContent('防火牆');
    expect(trs[0]).toHaveTextContent('組態檔案(雙周備份)');
    expect(trs[0]).toHaveTextContent('正常，最後備份日115/10/18');
    expect(trs[1]).toHaveTextContent('Core Switch組態檔案');
    expect(trs[1].querySelector('[data-result]').dataset.result).toBe('ABNORMAL');
    expect(trs[1]).toHaveTextContent('TFTP 逾時');
    expect(trs[2]).toHaveAttribute('data-blank', 'true');
    expect(trs[2]).toHaveTextContent('正常，最後備份日');
  });
});

describe('營運總覽：兩張表的最後日期', () => {
  const Where = () => <div data-testid="where">{useLocation().pathname}</div>;
  const show = () => render(
    <RoleContext.Provider value={{ authUser: ME }}>
      <MemoryRouter initialEntries={['/overview']}>
        <Routes>
          <Route path="/overview" element={<Overview />} />
          <Route path="/iso-log-review" element={<Where />} />
          <Route path="/iso-backup-check" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </RoleContext.Provider>
  );

  it('兩週內一般顯示；超過兩週醒目提醒；點了前往那張表', async () => {
    show();
    const log = await screen.findByTestId('overview-iso-check-S-409-02');
    expect(window.electronAPI.isoCheck).toHaveBeenCalledWith('GET', 'latest');
    expect(log).toHaveAttribute('data-overdue', 'false');
    expect(log).toHaveTextContent('最後審查：115/11/05（6 天前）・王機房');
    expect(log).not.toHaveClass('overview-iso-check-overdue');

    const backup = screen.getByTestId('overview-iso-check-S-409-01');
    expect(backup).toHaveAttribute('data-overdue', 'true');
    expect(backup).toHaveClass('overview-iso-check-overdue');
    expect(backup).toHaveTextContent('最後檢查：115/10/20（22 天前）');
    expect(backup).toHaveTextContent('已超過 14 天未檢查，請盡快檢查');

    fireEvent.click(backup);
    expect(await screen.findByTestId('where')).toHaveTextContent('/iso-backup-check');
  });

  it('從沒做過：也提醒', async () => {
    store['S-409-01'] = [];
    show();
    const bar = await screen.findByTestId('overview-iso-check-S-409-01');
    expect(bar).toHaveAttribute('data-overdue', 'true');
    expect(bar).toHaveTextContent('還沒有任何檢查紀錄');
    expect(bar).toHaveTextContent('請進行第一次檢查');
  });

  it('讀不到就不顯示，不影響總覽', async () => {
    window.electronAPI.isoCheck = vi.fn(async () => ({ success: false, error: 'x' }));
    show();
    await waitFor(() => expect(window.electronAPI.isoCheck).toHaveBeenCalled());
    expect(screen.queryByTestId('overview-iso-check-S-409-01')).toBeNull();
    expect(screen.queryByTestId('overview-iso-check-S-409-02')).toBeNull();
  });
});

describe('報表中心', () => {
  it('有兩張表的卡片', () => {
    render(<MemoryRouter><Reports /></MemoryRouter>);
    expect(screen.getByText('備份檢查紀錄表 (ISO 27001 S-409-01)')).toBeInTheDocument();
    expect(screen.getByText('日誌審查紀錄表 (ISO 27001 S-409-02)')).toBeInTheDocument();
  });
});
