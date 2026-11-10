import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RepairActionModal from '../components/RepairActionModal';

/**
 * 維修單動作視窗：內容多時不會被切掉
 *
 * 「原廠修復寄回並結案」勾了「原廠提供新品／良品更換」後，每台設備多一列新序號，
 * 視窗變得比畫面高，又是置中顯示，上下兩端（含確認按鈕）都被切掉，只能把視窗拉很大。
 * 改成視窗最高不超過畫面，標題與底部按鈕固定，中間內容自己捲動。
 */
const ORDER = {
  id: 7, repair_no: 'RMA-20261102-01', customer_name: '', status: 'SENT_TO_OEM',
  items: [1, 2, 3].map((i) => ({ id: i, sn: `2637357${i}`, brand: 'V-COLOR', model: 'DDR5-5800' })),
};

beforeEach(() => {
  window.alert = vi.fn();
  window.electronAPI = { namedQuery: vi.fn(async () => ({ success: true, rows: [] })), runTransaction: vi.fn(), saveFile: vi.fn() };
});

describe('維修單動作視窗的高度', () => {
  it('視窗最高為畫面高度；中間內容捲動，標題與底部按鈕固定', async () => {
    render(<RepairActionModal isOpen onClose={() => {}} repairOrder={ORDER} actionType="OEM_RETURN" onSuccess={() => {}} />);
    const body = await screen.findByTestId('repair-action-body');
    const footer = screen.getByTestId('repair-action-footer');
    const dialog = body.closest('form').parentElement;

    expect(dialog.style.maxHeight).toBe('calc(100vh - 40px)');
    expect(body.style.overflowY).toBe('auto');
    expect(body.style.minHeight).toBe('0px');
    // 底部按鈕不在捲動區裡，永遠看得到
    expect(body.contains(footer)).toBe(false);
    expect(footer.style.flexShrink).toBe('0');
    expect(footer).toContainElement(screen.getByRole('button', { name: '取消' }));
  });
});
