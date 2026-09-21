import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import DeviceList from '../pages/DeviceList';
import { queries } from '../../database/queries';

/**
 * 公司資產編號 (Asset No)
 *
 * 公司資產另有一組自己編的財產編號，與出廠序號是兩回事 ——
 * 盤點與財產清冊對的是前者。先前系統沒有這個欄位，只能寫在備註裡。
 *
 * 另外，公司資產的標籤原本擠在第一行類型／廠牌的後面，遇到長廠牌名稱
 * （例如 SERVER TECHNOLOGY）就會壓到隔壁的序號欄，因此獨立成第三行，
 * 後面接資產編號。
 */
const COMPANY = {
  id: 1, sn: 'QTU5250009', brand: 'RARITAN', type: 'PDU', model: 'PX3-5466R',
  specification: '', ownership: 'COMPANY', asset_no: 'METECH-2026-001',
  status: 'ACTIVE', custom_attributes: {}, components: [],
};
const FOR_SALE = {
  id: 2, sn: 'B684M31272', brand: 'EATON', type: 'PDU', model: 'EMAU25-10',
  specification: '', ownership: 'FOR_SALE', asset_no: null,
  status: 'ACTIVE', custom_attributes: {}, components: [],
};
const UNNUMBERED = {
  id: 3, sn: 'A9000000009', brand: 'SERVER TECHNOLOGY', type: 'PDU', model: 'C2WG24BN',
  specification: '', ownership: 'COMPANY', asset_no: null,
  status: 'ACTIVE', custom_attributes: {}, components: [],
};

describe('設備列表：公司資產與資產編號', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    window.electronAPI = {
      namedQuery: vi.fn((query) => {
        if (query === 'fetchAssetsList' || query === 'fetchAssetsListByBrand') {
          return Promise.resolve({ success: true, rows: [COMPANY, FOR_SALE, UNNUMBERED] });
        }
        return Promise.resolve({ success: true, rows: [] });
      }),
      runTransaction: vi.fn(), saveFile: vi.fn(), getDashboardStats: vi.fn(),
      getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
      setUserPreference: vi.fn().mockResolvedValue({ success: true }),
    };
  });

  const show = async () => {
    render(<MemoryRouter initialEntries={['/devices?brand=RARITAN']}><DeviceList /></MemoryRouter>);
    await screen.findByText('QTU5250009');
  };
  const cellOf = (sn) => screen.getByText(sn).closest('tr').querySelector('td');

  it('公司資產標籤自成一行，不跟類型／廠牌擠在一起', async () => {
    await show();
    const lines = [...cellOf('QTU5250009').children];

    expect(lines).toHaveLength(3);
    expect(lines[0].textContent).toContain('PDU');
    expect(lines[1].textContent).toContain('PX3-5466R');
    expect(lines[2].textContent).toContain('公司資產');
  });

  it('標籤後面接資產編號', async () => {
    await show();
    const third = [...cellOf('QTU5250009').children][2];

    expect(third.textContent).toContain('METECH-2026-001');
  });

  it('公司資產但還沒編號時標示「未編號」，不是空白', async () => {
    await show();
    const third = [...cellOf('A9000000009').children][2];

    expect(third.textContent).toContain('未編號');
  });

  it('一般銷售不顯示這一行', async () => {
    await show();
    const lines = [...cellOf('B684M31272').children];

    expect(lines).toHaveLength(2);
    expect(cellOf('B684M31272').textContent).not.toContain('公司資產');
  });

  it('可以用資產編號搜尋', async () => {
    await show();
    await userEvent.type(screen.getByPlaceholderText('快速搜尋...'), 'METECH-2026-001');

    await waitFor(() => expect(screen.queryByText('B684M31272')).not.toBeInTheDocument());
    expect(screen.getByText('QTU5250009')).toBeInTheDocument();
  });
});

describe('資產編號的寫入規則', () => {
  const sql = queries.updateAssetDetails;

  it('只有公司資產才存編號', () => {
    expect(sql).toContain("CASE WHEN COALESCE($12, 'FOR_SALE') = 'COMPANY'");
  });

  it('改回一般銷售時清掉編號，不留下不適用的資料', () => {
    expect(sql).toMatch(/ELSE NULL END/);
  });

  it('空白視為沒有編號', () => {
    expect(sql).toContain("NULLIF(TRIM($15), '')");
  });
});
