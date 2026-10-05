import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import LentList from '../pages/LentList';
import { RoleContext } from '../context/RoleContext';
import { queries } from '../../database/queries';
import {
  toLocalYmd, addDays, daysBetween, extensionBase, minExtensionDate, validateExtension,
} from '../utils/lentReturnDate';

/**
 * 借用列表：借出中的單可以延長預計歸還日
 *
 * 原本只有待借出的單能編輯，一出庫預計歸還日就改不了，只能看著它變成逾期。
 * 只改單頭的日期，設備仍維持借出中；原因記在事件紀錄。
 */
beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-05T10:00:00')); });
afterAll(() => { vi.useRealTimers(); });

describe('日期規則', () => {
  it('資料庫的日期轉成本地年月日，不會少一天', () => {
    // 台灣的 DATE 送到前端是當地午夜，換成 UTC 會是前一天 16:00
    expect(toLocalYmd(new Date(2026, 9, 20))).toBe('2026-10-20');
    expect(toLocalYmd('2026-10-20')).toBe('2026-10-20');
    expect(toLocalYmd(null)).toBeNull();
  });

  it('加天數、算差幾天', () => {
    expect(addDays('2026-10-28', 7)).toBe('2026-11-04');
    expect(daysBetween('2026-09-30', '2026-10-05')).toBe(5);
  });

  it('還沒到期從原本的日期起算，已逾期從今天起算', () => {
    expect(extensionBase('2026-10-20', '2026-10-05')).toBe('2026-10-20');
    expect(extensionBase('2026-09-30', '2026-10-05')).toBe('2026-10-05');
    expect(extensionBase(null, '2026-10-05')).toBe('2026-10-05');
  });

  it('最早只能選原本的隔天，也不能早於今天', () => {
    expect(minExtensionDate('2026-10-20', '2026-10-05')).toBe('2026-10-21');
    expect(minExtensionDate('2026-09-30', '2026-10-05')).toBe('2026-10-05');
  });

  it('是延長：必須晚於原本的日期，也不能早於今天', () => {
    expect(validateExtension('2026-10-20', '2026-10-20', '2026-10-05')).toContain('必須晚於');
    expect(validateExtension('2026-09-20', '2026-10-01', '2026-10-05')).toContain('不能早於今天');
    expect(validateExtension('2026-10-20', '', '2026-10-05')).toContain('請選擇');
    expect(validateExtension('2026-10-20', '2026-10-27', '2026-10-05')).toBeNull();
  });
});

describe('查詢', () => {
  it('只改借出中的借用單', () => {
    expect(queries.extendLentExpectedReturnDate).toContain("request_type = 'LEND'");
    expect(queries.extendLentExpectedReturnDate).toContain("status = 'SHIPPED'");
    expect(queries.extendLentExpectedReturnDate).toContain('RETURNING');
  });
});

const lend = (id, no, status, expected) => ({
  id, request_no: no, customer: '台積電', location: '新竹', shipping_date: '2026-09-14',
  expected_return_date: expected, status, request_type: 'LEND', creator_name: 'Admin',
});
const ONTIME = lend(1, 'LN-ONTIME', 'SHIPPED', '2026-10-20');
const LATE = lend(2, 'LN-LATE', 'SHIPPED', '2026-09-30');
const PENDING = lend(3, 'LN-PENDING', 'PENDING', '2026-11-01');

describe('借用列表上延長', () => {
  let txSteps;
  beforeEach(() => {
    vi.clearAllMocks();
    txSteps = [];
    window.alert = vi.fn();
    window.electronAPI = {
      namedQuery: vi.fn(async (query) => (query === 'fetchLentRequests'
        ? { success: true, rows: [ONTIME, LATE, PENDING] }
        : { success: true, rows: [] })),
      runTransaction: vi.fn(async (steps) => { txSteps.push(steps); return { success: true, results: {} }; }),
      saveFile: vi.fn(),
      getDashboardStats: vi.fn(),
    };
  });

  const renderList = async () => {
    render(
      <MemoryRouter>
        <RoleContext.Provider value={{ role: 'ADMIN', authUser: { id: 1 }, setAuthUser: vi.fn() }}>
          <LentList />
        </RoleContext.Provider>
      </MemoryRouter>
    );
    await screen.findByText('LN-PENDING');
    await userEvent.click(screen.getByRole('button', { name: /借出中 \(待歸還\)/ }));
    await screen.findByText('LN-ONTIME');
  };
  const dialog = () => screen.getByRole('dialog', { name: '延長預計歸還日' });

  it('借出中的單有「延長」按鈕，待借出的沒有', async () => {
    await renderList();
    expect(screen.getByLabelText('延長預計歸還日 LN-ONTIME')).toBeInTheDocument();
    expect(screen.queryByLabelText('延長預計歸還日 LN-PENDING')).not.toBeInTheDocument();
  });

  it('預設往後延 7 天，可一鍵改成 +14／+30 天', async () => {
    await renderList();
    await userEvent.click(screen.getByLabelText('延長預計歸還日 LN-ONTIME'));
    expect(within(dialog()).getByTestId('extend-current')).toHaveTextContent('2026-10-20');
    const input = within(dialog()).getByLabelText('新的預計歸還日');
    expect(input).toHaveValue('2026-10-27');
    expect(input).toHaveAttribute('min', '2026-10-21');
    await userEvent.click(within(dialog()).getByRole('button', { name: '+30 天' }));
    expect(input).toHaveValue('2026-11-19');
  });

  it('已逾期的顯示逾期天數，並從今天起算', async () => {
    await renderList();
    await userEvent.click(screen.getByLabelText('延長預計歸還日 LN-LATE'));
    expect(within(dialog()).getByTestId('extend-current')).toHaveTextContent('已逾期 5 天');
    expect(within(dialog()).getByLabelText('新的預計歸還日')).toHaveValue('2026-10-12');
  });

  it('確定延長：只改這張單的預計歸還日，原因記在事件紀錄', async () => {
    await renderList();
    await userEvent.click(screen.getByLabelText('延長預計歸還日 LN-ONTIME'));
    await userEvent.type(within(dialog()).getByLabelText(/延長原因/), '客戶測試延長');
    await userEvent.click(within(dialog()).getByRole('button', { name: '確定延長' }));

    await waitFor(() => expect(txSteps).toHaveLength(1));
    expect(txSteps[0]).toEqual([expect.objectContaining({
      queryName: 'extendLentExpectedReturnDate', params: ['2026-10-27', 1], expectRows: 1,
    })]);
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('已延長至 2026-10-27')));
    const log = window.electronAPI.namedQuery.mock.calls.find(([q, p]) => q === 'insertAuditLog' || (Array.isArray(p) && p.some((x) => String(x).includes('延長借用單'))));
    expect(log).toBeTruthy();
    expect(JSON.stringify(log)).toContain('客戶測試延長');
    expect(screen.queryByRole('dialog', { name: '延長預計歸還日' })).not.toBeInTheDocument();
  });

  it('日期沒有比原本晚就不送出', async () => {
    await renderList();
    await userEvent.click(screen.getByLabelText('延長預計歸還日 LN-ONTIME'));
    const input = within(dialog()).getByLabelText('新的預計歸還日');
    await userEvent.clear(input);
    await userEvent.type(input, '2026-10-15');
    await userEvent.click(within(dialog()).getByRole('button', { name: '確定延長' }));
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('必須晚於'));
    expect(txSteps).toHaveLength(0);
  });

  it('取消就什麼都不改', async () => {
    await renderList();
    await userEvent.click(screen.getByLabelText('延長預計歸還日 LN-ONTIME'));
    await userEvent.click(within(dialog()).getByRole('button', { name: '取消' }));
    expect(txSteps).toHaveLength(0);
    expect(screen.queryByRole('dialog', { name: '延長預計歸還日' })).not.toBeInTheDocument();
  });
});
