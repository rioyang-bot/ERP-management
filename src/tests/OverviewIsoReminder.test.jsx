import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import Overview from '../pages/Overview';
import IsoEquipmentForm from '../pages/IsoEquipmentForm';

/**
 * 營運總覽：設備攜出入單 (S-408-02) 待簽提醒
 *
 * 哪些月份要提醒由伺服器判定（見 IsoSignaturePending.test.js）；這裡測畫面：
 * 有待簽月份才出現提醒、每個月份標出缺誰／誰要重簽、點了直接開那個月的表單。
 */
const PENDING = [
  {
    period: '2026-10', label: '115年10月', rowCount: 22,
    roles: [
      { role: 'ROOM_ADMIN', label: '機房管理員', status: 'MISSING', userName: null },
      { role: 'SUPERVISOR', label: '權責主管', status: 'MISSING', userName: null },
    ],
  },
  {
    period: '2026-09', label: '115年09月', rowCount: 27,
    roles: [
      { role: 'ROOM_ADMIN', label: '機房管理員', status: 'SIGNED', userName: '王機房' },
      { role: 'SUPERVISOR', label: '權責主管', status: 'STALE', userName: '李主管' },
    ],
  },
];

let pendingResult;
beforeEach(() => {
  vi.clearAllMocks();
  pendingResult = { success: true, months: PENDING };
  window.electronAPI = {
    namedQuery: vi.fn(() => Promise.resolve({ success: true, rows: [] })),
    isoSignature: vi.fn((method, form, period) => {
      if (period === 'pending') return Promise.resolve(pendingResult);
      return Promise.resolve({ success: true, signatures: {}, permissions: {}, rowCount: 0 });
    }),
  };
});

const Where = () => {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname}{loc.search}</div>;
};

const show = () => render(
  <MemoryRouter initialEntries={['/overview']}>
    <Routes>
      <Route path="/overview" element={<Overview />} />
      <Route path="/iso-equipment-form" element={<><Where /><IsoEquipmentForm /></>} />
    </Routes>
  </MemoryRouter>
);

describe('營運總覽：設備攜出入單待簽提醒', () => {
  it('向伺服器要 S-408-02 的待簽月份', async () => {
    show();
    await waitFor(() => expect(window.electronAPI.isoSignature).toHaveBeenCalledWith('GET', 'S-408-02', 'pending'));
  });

  it('列出每個待簽月份：進出筆數、缺誰簽、誰要重簽；已簽的角色不列', async () => {
    show();
    const box = await screen.findByRole('region', { name: '設備攜出入單待簽提醒' });
    expect(box).toHaveTextContent('設備攜出入單 (ISO 27001 S-408-02) 尚未完成簽核');
    expect(box).toHaveTextContent('2 個月份');

    const oct = within(box).getByTestId('iso-pending-2026-10');
    expect(oct).toHaveTextContent('115年10月');
    expect(oct).toHaveTextContent('22 筆進出');
    expect(oct).toHaveTextContent('待機房管理員簽核');
    expect(oct).toHaveTextContent('待權責主管簽核');

    const sep = within(box).getByTestId('iso-pending-2026-09');
    expect(sep).toHaveTextContent('權責主管需重簽');
    expect(sep).not.toHaveTextContent('機房管理員');

    // 最近的月份在前
    expect(oct.compareDocumentPosition(sep) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('點月份直接開那個月的設備攜出入單', async () => {
    show();
    fireEvent.click(await screen.findByTestId('iso-pending-2026-09'));
    expect(await screen.findByTestId('where')).toHaveTextContent('/iso-equipment-form?month=2026-09');
    await waitFor(() => expect(window.electronAPI.namedQuery).toHaveBeenCalledWith('fetchEquipmentMovements', ['2026-09-01', '2026-10-01']));
    await waitFor(() => expect(window.electronAPI.isoSignature).toHaveBeenCalledWith('GET', 'S-408-02', '2026-09'));
  });

  it('沒有待簽月份就不出現提醒', async () => {
    pendingResult = { success: true, months: [] };
    show();
    await waitFor(() => expect(window.electronAPI.isoSignature).toHaveBeenCalled());
    await screen.findByText('營運總覽 (Operations Overview)');
    expect(screen.queryByRole('region', { name: '設備攜出入單待簽提醒' })).toBeNull();
  });

  it('讀取失敗也不影響總覽，只是不出現提醒', async () => {
    window.electronAPI.isoSignature = vi.fn(() => Promise.reject(new Error('down')));
    show();
    await screen.findByText('營運總覽 (Operations Overview)');
    await waitFor(() => expect(window.electronAPI.namedQuery).toHaveBeenCalledWith('fetchOverviewStats'));
    expect(screen.queryByRole('region', { name: '設備攜出入單待簽提醒' })).toBeNull();
  });

  it('沒有 isoSignature（例如桌面版）也不出錯', async () => {
    delete window.electronAPI.isoSignature;
    show();
    await screen.findByText('營運總覽 (Operations Overview)');
    expect(screen.queryByRole('region', { name: '設備攜出入單待簽提醒' })).toBeNull();
  });
});

describe('設備攜出入單：網址帶月份', () => {
  it.each([
    ['?month=2026-08', ['2026-08-01', '2026-09-01']],
    ['?month=2026-13', null],
    ['?month=abc', null],
  ])('%s', async (search, expected) => {
    render(<MemoryRouter initialEntries={[`/iso-equipment-form${search}`]}><Routes><Route path="/iso-equipment-form" element={<IsoEquipmentForm />} /></Routes></MemoryRouter>);
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const ny = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
    const thisMonth = [`${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`, `${ny}-${pad((now.getMonth() + 1) % 12 + 1)}-01`];
    await waitFor(() => expect(window.electronAPI.namedQuery).toHaveBeenCalledWith('fetchEquipmentMovements', expected || thisMonth));
  });
});
