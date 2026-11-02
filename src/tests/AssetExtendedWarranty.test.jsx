import React, { useState } from 'react';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { queries } from '../../database/queries';
import { isFullyOutOfWarranty, warrantyInfoParams, diffWarrantyFields, describeWarrantyChanges } from '../utils/warranty';
import WarrantyFields from '../components/common/WarrantyFields';
import WarrantyInfoCell from '../components/common/WarrantyInfoCell';

/**
 * 設備／硬體：一次延保 (1st EWS)、二次延保 (2nd EWS)
 *
 * 兩個選填的延保到期日，只在設備／硬體列表與編輯視窗。
 * 各自有自己的保固標記；判斷完全過保時也算一種保固。
 */

const TODAY = new Date(2026, 10, 2);

describe('過保判定把延保也算進去', () => {
  it('原廠、客戶都過期，但一次延保還在：不算過保', () => {
    expect(isFullyOutOfWarranty({ warranty_expire: '2026-01-01', customer_warranty_expire: '2026-02-01', ews1_expire: '2027-01-01' }, TODAY)).toBe(false);
  });

  it('二次延保還在也不算過保', () => {
    expect(isFullyOutOfWarranty({ warranty_expire: '2026-01-01', ews1_expire: '2026-06-01', ews2_expire: '2028-01-01' }, TODAY)).toBe(false);
  });

  it('有填的全部過期才算過保', () => {
    expect(isFullyOutOfWarranty({ warranty_expire: '2026-01-01', ews1_expire: '2026-06-01', ews2_expire: '2026-10-01' }, TODAY)).toBe(true);
  });

  it('只填了延保：照延保判定', () => {
    expect(isFullyOutOfWarranty({ ews1_expire: '2026-10-31' }, TODAY)).toBe(true);
    expect(isFullyOutOfWarranty({ ews2_expire: '2026-11-30' }, TODAY)).toBe(false);
  });
});

describe('存檔與事件紀錄', () => {
  it('updateAssetWarrantyInfo 多了 $8 一次延保、$9 二次延保', () => {
    expect(queries.updateAssetWarrantyInfo).toContain('ews1_expire = $8::date');
    expect(queries.updateAssetWarrantyInfo).toContain('ews2_expire = $9::date');
    expect(warrantyInfoParams({ ews1_expire: '2028-01-01', ews2_expire: '' }, 5).slice(6)).toEqual([5, '2028-01-01', null]);
  });

  it('異動寫進敘述（全形括號，伺服器過濾不會刪掉）', () => {
    const changes = diffWarrantyFields({}, { ews1_expire: '2028-01-01' });
    expect(describeWarrantyChanges(changes)).toBe('一次延保（1st EWS）「--」→「2028-01-01」');
  });
});

describe('編輯欄位', () => {
  const Harness = ({ showExtended }) => {
    const [v, setV] = useState({ ews1_expire: '2028-01-01' });
    return <WarrantyFields value={v} onChange={(p) => setV((prev) => ({ ...prev, ...p }))} showExtended={showExtended} />;
  };

  it('編輯視窗（showExtended）有兩個選填日期，可以改', () => {
    render(<Harness showExtended />);
    expect(screen.getByLabelText('一次延保 (1st EWS)').value).toBe('2028-01-01');
    fireEvent.change(screen.getByLabelText('二次延保 (2nd EWS)'), { target: { value: '2030-06-30' } });
    expect(screen.getByLabelText('二次延保 (2nd EWS)').value).toBe('2030-06-30');
  });

  it('新增畫面不顯示延保', () => {
    render(<Harness />);
    expect(screen.queryByLabelText('一次延保 (1st EWS)')).toBeNull();
  });
});

describe('列表保固資訊', () => {
  it('有填延保才顯示 1st／2nd，各自有標記', () => {
    render(<WarrantyInfoCell item={{ warranty_expire: '2025-01-01', ews1_expire: '2099-01-01' }} />);
    expect(screen.getByText('1st:')).toBeInTheDocument();
    expect(screen.getByText('2nd:')).toBeInTheDocument();
    expect(screen.getByTitle(/一次延保/)).toBeInTheDocument();
    expect(screen.queryByTitle(/二次延保/)).toBeNull();
  });

  it('沒填延保：不多出這一列', () => {
    render(<WarrantyInfoCell item={{ warranty_expire: '2025-01-01' }} />);
    expect(screen.queryByText('1st:')).toBeNull();
  });
});

describe('設備／硬體列表的編輯視窗', () => {
  const calls = (name) => window.electronAPI.namedQuery.mock.calls.filter(([q]) => q === name);
  const logs = () => calls('insertAuditLog').map(([, p]) => ({ module: p[4], targetId: p[6], summary: p[8] }));

  const setup = (rows) => {
    window.electronAPI = {
      namedQuery: vi.fn((query) => {
        if (['fetchAssetsList', 'fetchAssetsListByBrand', 'fetchNicList', 'fetchNicListByType'].includes(query)) return Promise.resolve({ success: true, rows });
        return Promise.resolve({ success: true, rows: [{ id: 1 }] });
      }),
      runTransaction: vi.fn(), saveFile: vi.fn(), getDashboardStats: vi.fn(),
      getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
      setUserPreference: vi.fn().mockResolvedValue({ success: true }),
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    vi.spyOn(window, 'confirm').mockImplementation(() => true);
  });

  it('設備：填一次延保存檔，記事件', async () => {
    setup([{ id: 1, item_master_id: 5, sn: 'EWS-DEV-1', brand: 'DELL', type: 'Server', model: 'R760', specification: '', ownership: 'FOR_SALE', status: 'ACTIVE', custom_attributes: {}, components: [], warranty_expire: '2026-01-01' }]);
    const { default: DeviceList } = await import('../pages/DeviceList');
    render(<MemoryRouter initialEntries={['/devices?brand=DELL']}><DeviceList /></MemoryRouter>);
    await screen.findByText('EWS-DEV-1');
    fireEvent.click(screen.getByText('EWS-DEV-1').closest('tr').querySelector('td:last-child button'));
    fireEvent.click(await screen.findByText(/編輯詳細資訊/));
    await screen.findByText('修改詳細設備資訊');
    fireEvent.change(screen.getByLabelText('一次延保 (1st EWS)'), { target: { value: '2028-01-01' } });
    fireEvent.click(screen.getByText(/儲存變更/));

    await waitFor(() => expect(calls('updateAssetWarrantyInfo')).toHaveLength(1));
    expect(calls('updateAssetWarrantyInfo')[0][1].slice(6)).toEqual([1, '2028-01-01', null]);
    await waitFor(() => expect(logs().some((l) => l.summary.startsWith('編輯設備詳細資訊'))).toBe(true));
    expect(logs().find((l) => l.summary.startsWith('編輯設備詳細資訊'))).toMatchObject({
      module: 'DEVICE', targetId: 'EWS-DEV-1',
      summary: '編輯設備詳細資訊 [EWS-DEV-1]：一次延保（1st EWS）「--」→「2028-01-01」',
    });
  });

  it('硬體：已有的二次延保帶進編輯視窗，清空後存檔，記事件', async () => {
    setup([{ id: 88, item_master_id: 2, sn: 'EWS-HW-1', brand: 'Intel', model: 'X710', type: '網卡', status: 'ACTIVE', ownership: 'FOR_SALE', custom_attributes: {}, ews2_expire: '2029-03-31' }]);
    const { default: HwList } = await import('../pages/HwList');
    render(<MemoryRouter initialEntries={['/hardware']}><HwList /></MemoryRouter>);
    fireEvent.change(await screen.findByPlaceholderText(/搜尋/), { target: { value: 'EWS-HW' } });
    const row = (await screen.findByText('EWS-HW-1')).closest('tr');
    expect(within(row).getByText('2nd:')).toBeInTheDocument();
    fireEvent.click(row.querySelector('td:last-child button'));
    fireEvent.click(await screen.findByText(/編輯詳細資訊/));
    await screen.findByText('修改硬體資訊');
    expect(screen.getByLabelText('二次延保 (2nd EWS)').value).toBe('2029-03-31');
    fireEvent.change(screen.getByLabelText('二次延保 (2nd EWS)'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '儲存變更' }));

    await waitFor(() => expect(calls('updateAssetWarrantyInfo')).toHaveLength(1));
    expect(calls('updateAssetWarrantyInfo')[0][1].slice(6)).toEqual([88, null, null]);
    await waitFor(() => expect(logs().some((l) => l.summary.startsWith('編輯硬體詳細資訊'))).toBe(true));
    expect(logs().find((l) => l.summary.startsWith('編輯硬體詳細資訊'))).toMatchObject({
      module: 'HARDWARE', targetId: 'EWS-HW-1',
      summary: '編輯硬體詳細資訊 [EWS-HW-1]：二次延保（2nd EWS）「2029-03-31」→「--」',
    });
  });
});
