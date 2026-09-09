import { describe, it, expect } from 'vitest';
import { isItemRetired, getItemAggregationKey, aggregateCards, computeNewRetiredKeys } from '../utils/cardAggregation';

describe('卡片聚合與汰舊規則 (cardAggregation)', () => {
  const sampleItems = [
    { id: 1, brand: 'ASUS', type: '伺服器', model: 'RS720', specification: '24C', status: 'ACTIVE' },
    { id: 2, brand: 'ASUS', type: '伺服器', model: 'RS720', specification: '24C', status: 'ACTIVE' },
    { id: 3, brand: 'ASUS', type: '伺服器', model: 'RS720', specification: '32C', status: 'ACTIVE' },
    { id: 4, brand: 'Dell', type: '伺服器', model: 'R750', specification: '64G', status: 'ACTIVE' },
  ];

  it('在依規格 (SPEC) 模式下將其中一張規格卡片移至汰舊區，該規格的項目應被判定為 isItemRetired', () => {
    // 汰舊 ASUS 的 24C 規格
    const retiredKeys = ['ASUS - 伺服器 - RS720 - 24C'];

    expect(isItemRetired(sampleItems[0], retiredKeys)).toBe(true);
    expect(isItemRetired(sampleItems[1], retiredKeys)).toBe(true);
    expect(isItemRetired(sampleItems[2], retiredKeys)).toBe(false); // 32C 仍正常使用
    expect(isItemRetired(sampleItems[3], retiredKeys)).toBe(false); // Dell 仍正常使用
  });

  it('當改為依廠牌 (BRAND) 聚合時，汰舊區的項目不應被計入正常使用的廠牌卡片', () => {
    // 汰舊 ASUS 的 24C 規格 (2台)
    const retiredKeys = ['ASUS - 伺服器 - RS720 - 24C'];

    const { activeStatsMap, retiredStatsMap } = aggregateCards(sampleItems, 'BRAND', retiredKeys);

    // 正常使用的 ASUS 卡片應只計算 32C 的 1 台，不應包含已汰舊的 24C (2台)
    expect(activeStatsMap['ASUS']).toBeDefined();
    expect(activeStatsMap['ASUS'].total).toBe(1);
    expect(activeStatsMap['ASUS'].active).toBe(1);

    // 汰舊區的 ASUS 卡片應包含已汰舊的 24C (2台)
    expect(retiredStatsMap['ASUS']).toBeDefined();
    expect(retiredStatsMap['ASUS'].total).toBe(2);
    expect(retiredStatsMap['ASUS'].active).toBe(2);

    // Dell 未汰舊，應都在 activeStatsMap 中
    expect(activeStatsMap['Dell'].total).toBe(1);
    expect(retiredStatsMap['Dell']).toBeUndefined();
  });

  it('當在依型號 (MODEL) 模式下汰舊整張型號卡片，改為依廠牌 (BRAND) 亦不被計入正常使用', () => {
    // 汰舊整台 ASUS RS720 型號
    const retiredKeys = ['ASUS - 伺服器 - RS720'];

    const { activeStatsMap, retiredStatsMap } = aggregateCards(sampleItems, 'BRAND', retiredKeys);

    // ASUS 所有的 RS720 都在汰舊區，因此 activeStatsMap 中無 ASUS
    expect(activeStatsMap['ASUS']).toBeUndefined();
    expect(retiredStatsMap['ASUS']).toBeDefined();
    expect(retiredStatsMap['ASUS'].total).toBe(3); // 24C(2) + 32C(1)
  });

  it('在依廠牌 (BRAND) 模式下復原卡片時，應一併清除底下的型號或規格汰舊鍵', () => {
    const retiredKeys = ['ASUS - 伺服器 - RS720 - 24C', 'ASUS - 伺服器 - RS720 - 32C', 'Dell - 伺服器 - R750'];

    // 復原 ASUS
    const newRetired = computeNewRetiredKeys('ASUS', true, retiredKeys, 'BRAND');

    // ASUS 相關鍵值應全數被移除，僅保留 Dell
    expect(newRetired).toEqual(['Dell - 伺服器 - R750']);
  });
});
