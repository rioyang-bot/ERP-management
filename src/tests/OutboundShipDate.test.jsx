import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import Outbound from '../pages/Outbound';
import OutboundRegistrationModal from '../components/OutboundRegistrationModal';
import { RoleContext } from '../context/RoleContext';

/**
 * 新增出貨單：出貨日期預設是當天
 *
 * - 每次打開都是今天；草稿的其他欄位照樣帶回，只有日期不沿用（草稿可能是好幾天前存的）
 * - 今天取本地日期：toISOString() 是世界標準時間，台灣早上 8 點前會變成前一天
 * - 仍可手動改；修改既有的待出貨單時維持原本的日期
 */
// 本地 11/6 凌晨 0:30：在台灣（UTC+8）這時世界標準時間還是 11/5
const NOW = new Date(2026, 10, 6, 0, 30);

describe('新增出貨單：出貨日期', () => {
  let calls;

  beforeEach(() => {
    // 只假造 Date，計時器照常跑，畫面的非同步更新不受影響
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    localStorage.clear();
    calls = [];
    window.alert = vi.fn();
    window.electronAPI = {
      namedQuery: vi.fn(async (query, params) => {
        calls.push({ query, params });
        if (query === 'countOutboundRequests') return { success: true, rows: [{ count: '3' }] };
        return { success: true, rows: [] };
      }),
      runTransaction: vi.fn(),
    };
  });
  afterEach(() => { vi.useRealTimers(); });

  const renderOutbound = (props = {}) => render(
    <RoleContext.Provider value={{ authUser: { id: 1, full_name: '測試管理員', role: 'ADMIN' } }}>
      <BrowserRouter><Outbound {...props} /></BrowserRouter>
    </RoleContext.Provider>
  );
  const dateInput = () => document.querySelector('input[type="date"]');
  const prefixes = () => calls.filter((c) => c.query === 'countOutboundRequests').map((c) => c.params[0]);

  it('預設是本地的今天，不是世界標準時間的日期；單號也照今天編', async () => {
    // 在台灣時區跑時，NOW.toISOString() 是 2026-11-05：舊寫法會顯示前一天
    renderOutbound();
    expect(dateInput().value).toBe('2026-11-06');
    await waitFor(() => expect(prefixes()).toContain('DN-20261106-'));
    expect(prefixes().every((p) => p === 'DN-20261106-')).toBe(true);
  });

  it('草稿是前幾天存的：其他欄位帶回來，日期改成今天', async () => {
    localStorage.setItem('dn_draft_header', JSON.stringify({
      customer: '元大證券', contact_info: '王大明', location: '台北', date: '2026-11-01', project_name: '', end_user: '元大期貨',
    }));
    renderOutbound();
    expect(dateInput().value).toBe('2026-11-06');
    expect(screen.getByDisplayValue('元大期貨')).toBeInTheDocument();
    await waitFor(() => expect(prefixes()).toContain('DN-20261106-'));
    expect(prefixes()).not.toContain('DN-20261101-');
    // 草稿也跟著存成今天
    await waitFor(() => expect(JSON.parse(localStorage.getItem('dn_draft_header')).date).toBe('2026-11-06'));
  });

  it('仍可手動改日期，單號跟著改', async () => {
    renderOutbound();
    fireEvent.change(dateInput(), { target: { value: '2026-11-04' } });
    expect(dateInput().value).toBe('2026-11-04');
    await waitFor(() => expect(prefixes()).toContain('DN-20261104-'));
  });

  it('修改既有的待出貨單：維持原本的出貨日期', async () => {
    renderOutbound({ editingDn: { id: 5, request_no: 'DN-20261102-01', customer: '元大證券', shipping_date: '2026-11-02' } });
    expect(dateInput().value).toBe('2026-11-02');
    expect(prefixes()).toEqual([]);
  });

  it('新增出貨單視窗標題的預覽單號也照本地的今天', async () => {
    render(
      <RoleContext.Provider value={{ authUser: { id: 1, full_name: '測試管理員', role: 'ADMIN' } }}>
        <BrowserRouter><OutboundRegistrationModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} /></BrowserRouter>
      </RoleContext.Provider>
    );
    await waitFor(() => expect(screen.getAllByText(/DN-20261106-03/).length).toBeGreaterThan(0));
    expect(prefixes().every((p) => p === 'DN-20261106-')).toBe(true);
  });
});
