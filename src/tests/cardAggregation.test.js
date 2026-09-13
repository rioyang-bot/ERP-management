import { describe, it, expect } from 'vitest';
import { isItemRetired, getItemAggregationKey, aggregateCards, computeNewRetiredKeys, getCardTitle, showsModelSubtitle, getCardSearchText, TYPE_KEY_PREFIX } from '../utils/cardAggregation';

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

  describe('依類型 (TYPE) 聚合', () => {
    it('相同類型不分廠牌與型號，全部併成同一張卡片', () => {
      const { activeStatsMap } = aggregateCards(sampleItems, 'TYPE', []);
      const key = TYPE_KEY_PREFIX + '伺服器';

      expect(Object.keys(activeStatsMap)).toEqual([key]);
      expect(activeStatsMap[key].total).toBe(4); // ASUS 3 台 + Dell 1 台
      expect(activeStatsMap[key].type).toBe('伺服器');
    });

    it('沒有填類型的項目會被歸到「未分類」，不會跟有類型的混在一起', () => {
      const items = [...sampleItems, { id: 5, brand: 'HP', model: 'DL380', status: 'ACTIVE' }];
      const { activeStatsMap } = aggregateCards(items, 'TYPE', []);

      expect(activeStatsMap[TYPE_KEY_PREFIX + '伺服器'].total).toBe(4);
      expect(activeStatsMap[TYPE_KEY_PREFIX + '未分類'].total).toBe(1);
    });

    it('類型卡片的鍵值帶有前綴，不會與同名廠牌的鍵值互相誤判', () => {
      // 廠牌與類型同名的極端情況：汰舊廠牌不應連帶讓同名類型被判為汰舊
      const item = { id: 9, brand: 'SWITCH', type: 'SWITCH', model: 'X', specification: '', status: 'ACTIVE' };

      expect(getItemAggregationKey(item, 'BRAND')).toBe('SWITCH');
      expect(getItemAggregationKey(item, 'TYPE')).toBe(TYPE_KEY_PREFIX + 'SWITCH');
      expect(getItemAggregationKey(item, 'TYPE')).not.toBe(getItemAggregationKey(item, 'BRAND'));
    });

    it('把類型卡片移至汰舊區後，在其他聚合規則下也不會被計入正常使用', () => {
      const retiredKeys = [TYPE_KEY_PREFIX + '伺服器'];

      expect(isItemRetired(sampleItems[0], retiredKeys)).toBe(true);

      const { activeStatsMap, retiredStatsMap } = aggregateCards(sampleItems, 'BRAND', retiredKeys);
      expect(activeStatsMap['ASUS']).toBeUndefined();
      expect(activeStatsMap['Dell']).toBeUndefined();
      expect(retiredStatsMap['ASUS'].total).toBe(3);
      expect(retiredStatsMap['Dell'].total).toBe(1);
    });

    it('復原類型卡片時，一併解除該類型底下的型號與規格汰舊鍵', () => {
      const retiredKeys = [
        TYPE_KEY_PREFIX + '伺服器',
        'ASUS - 伺服器 - RS720 - 24C',
        'Dell - 交換器 - S5248',        // 不同類型，應保留
        TYPE_KEY_PREFIX + '交換器',      // 不同類型的類型鍵，應保留
      ];

      const newRetired = computeNewRetiredKeys(TYPE_KEY_PREFIX + '伺服器', true, retiredKeys, 'TYPE');

      expect(newRetired).toEqual(['Dell - 交換器 - S5248', TYPE_KEY_PREFIX + '交換器']);
    });

    it('依類型的卡片搜尋得到它涵蓋的每個廠牌，而不是只有第一個', () => {
      const { activeStatsMap } = aggregateCards(sampleItems, 'TYPE', []);
      const card = activeStatsMap[TYPE_KEY_PREFIX + '伺服器'];

      // 這張「伺服器」卡片同時含有 ASUS 與 Dell
      expect(card.brands.sort()).toEqual(['ASUS', 'Dell']);
      expect(getCardSearchText(card)).toContain('asus');
      expect(getCardSearchText(card)).toContain('dell');
      expect(getCardSearchText(card)).toContain('rs720');
      expect(getCardSearchText(card)).toContain('r750');
    });

    it('卡片標題在依類型時顯示類型，其他模式顯示廠牌；副標題只在依規格與依型號顯示', () => {
      const stat = { brand: 'ASUS', type: '伺服器', model: 'RS720' };

      expect(getCardTitle(stat, 'TYPE')).toBe('伺服器');
      expect(getCardTitle(stat, 'BRAND')).toBe('ASUS');
      expect(getCardTitle(stat, 'SPEC')).toBe('ASUS');

      expect(showsModelSubtitle('SPEC')).toBe(true);
      expect(showsModelSubtitle('MODEL')).toBe(true);
      expect(showsModelSubtitle('TYPE')).toBe(false);
      expect(showsModelSubtitle('BRAND')).toBe(false);
    });
  });
});
