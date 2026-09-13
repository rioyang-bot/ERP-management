import { describe, it, expect } from 'vitest';
import { isFullyOutOfWarranty } from '../utils/warranty';

const TODAY = new Date(2026, 8, 13); // 2026-09-13
const days = (n) => {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + n);
  return d;
};

describe('過保判定（列表的第二排序依據）', () => {
  it('兩種保固都過期才算過保', () => {
    expect(isFullyOutOfWarranty(
      { warranty_expire: days(-10), customer_warranty_expire: days(-5) }, TODAY
    )).toBe(true);
  });

  it('原廠過期但客戶保固還在，不算過保', () => {
    // 對客戶仍有保固責任，不該被排到最後面
    expect(isFullyOutOfWarranty(
      { warranty_expire: days(-10), customer_warranty_expire: days(200) }, TODAY
    )).toBe(false);
  });

  it('只填了一種且已過期，算過保', () => {
    expect(isFullyOutOfWarranty({ warranty_expire: days(-1) }, TODAY)).toBe(true);
    expect(isFullyOutOfWarranty({ customer_warranty_expire: days(-1) }, TODAY)).toBe(true);
  });

  it('只填了一種且還在保固內，不算過保', () => {
    expect(isFullyOutOfWarranty({ warranty_expire: days(10) }, TODAY)).toBe(false);
  });

  it('完全沒填到期日不算過保 —— 狀況不明，不應被當成過期', () => {
    expect(isFullyOutOfWarranty({}, TODAY)).toBe(false);
    expect(isFullyOutOfWarranty({ warranty_expire: null, customer_warranty_expire: '' }, TODAY)).toBe(false);
    expect(isFullyOutOfWarranty(null, TODAY)).toBe(false);
  });

  it('到期日當天不算過保，隔天才算', () => {
    expect(isFullyOutOfWarranty({ warranty_expire: days(0) }, TODAY)).toBe(false);
    expect(isFullyOutOfWarranty({ warranty_expire: days(-1) }, TODAY)).toBe(true);
  });
});

describe('列表排序：狀態優先，過保排在同狀態的最後', () => {
  const statusPriority = { ACTIVE: 1, LENT: 2, SHIPPED: 3 };

  // 與 DeviceList 相同的排序規則
  const sortLikeDeviceList = (list) => [...list].sort((a, b) => {
    const priorityDiff = (statusPriority[a.status] || 99) - (statusPriority[b.status] || 99);
    if (priorityDiff !== 0) return priorityDiff;
    const expiredDiff = (isFullyOutOfWarranty(a, TODAY) ? 1 : 0) - (isFullyOutOfWarranty(b, TODAY) ? 1 : 0);
    if (expiredDiff !== 0) return expiredDiff;
    return (b.id || 0) - (a.id || 0);
  });

  it('同一個狀態內，過保的排到後面', () => {
    const sorted = sortLikeDeviceList([
      { id: 1, status: 'ACTIVE', warranty_expire: days(-10) },  // 過保
      { id: 2, status: 'ACTIVE', warranty_expire: days(100) },  // 保固內
      { id: 3, status: 'ACTIVE', warranty_expire: days(-20) },  // 過保
      { id: 4, status: 'ACTIVE' },                              // 未填
    ]);
    expect(sorted.map((x) => x.id)).toEqual([4, 2, 3, 1]);
  });

  it('狀態仍是第一優先：在庫的過保品，仍排在已出貨的保固內品之前', () => {
    const sorted = sortLikeDeviceList([
      { id: 1, status: 'SHIPPED', warranty_expire: days(100) },
      { id: 2, status: 'ACTIVE', warranty_expire: days(-100) },
    ]);
    expect(sorted.map((x) => x.status)).toEqual(['ACTIVE', 'SHIPPED']);
  });

  it('過保與否相同時，維持原本的 id 由大到小', () => {
    const sorted = sortLikeDeviceList([
      { id: 5, status: 'ACTIVE', warranty_expire: days(50) },
      { id: 9, status: 'ACTIVE', warranty_expire: days(80) },
      { id: 7, status: 'ACTIVE', warranty_expire: days(60) },
    ]);
    expect(sorted.map((x) => x.id)).toEqual([9, 7, 5]);
  });

  it('未填到期日的不會被當成過保而排到後面', () => {
    const sorted = sortLikeDeviceList([
      { id: 1, status: 'ACTIVE', warranty_expire: days(-1) },
      { id: 2, status: 'ACTIVE' },
    ]);
    expect(sorted.map((x) => x.id)).toEqual([2, 1]);
  });
});
