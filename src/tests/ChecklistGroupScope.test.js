import { describe, it, expect } from 'vitest';
import { groupScopeLabel, groupMatchLevel, pickDefaultGroup } from '../utils/checklistGroupScope';
import { queries } from '../../database/queries';

/**
 * 出機檢查表主項目可綁廠牌，也可再綁該廠牌的某個型號。
 * 例如 LDA 的 FIREWALL、NEOTAP 各有各的檢查項目。
 */
const NEOTAP = { brand: 'LDA', model: 'NEOTAP' };

describe('主項目的範圍標籤', () => {
  it('廠牌 + 型號', () => expect(groupScopeLabel({ brand: 'LDA', model: 'NEOTAP' })).toBe('LDA · NEOTAP'));
  it('只有廠牌', () => expect(groupScopeLabel({ brand: 'LDA', model: null })).toBe('LDA'));
  it('都沒有就是通用', () => expect(groupScopeLabel({ brand: null, model: null })).toBe('通用'));
  it('沒有廠牌時型號不算數', () => expect(groupScopeLabel({ brand: '', model: 'NEOTAP' })).toBe('通用'));
});

describe('主項目是否套用到這台設備', () => {
  it('型號相同（不分大小寫、前後空白）', () => {
    expect(groupMatchLevel({ brand: 'lda ', model: ' neotap' }, NEOTAP)).toBe('model');
  });
  it('只綁廠牌的套用到該廠牌所有型號', () => {
    expect(groupMatchLevel({ brand: 'LDA' }, NEOTAP)).toBe('brand');
  });
  it('指定了別的型號就不套用', () => {
    expect(groupMatchLevel({ brand: 'LDA', model: 'FIREWALL' }, NEOTAP)).toBeNull();
  });
  it('別家廠牌同名型號不套用', () => {
    expect(groupMatchLevel({ brand: 'CISCO', model: 'NEOTAP' }, NEOTAP)).toBeNull();
  });
  it('通用的套用到所有設備', () => {
    expect(groupMatchLevel({ brand: null }, NEOTAP)).toBe('generic');
  });
});

describe('預設先看哪一組', () => {
  const groups = [
    { id: 1, brand: null },
    { id: 2, brand: 'LDA' },
    { id: 3, brand: 'LDA', model: 'FIREWALL' },
    { id: 4, brand: 'LDA', model: 'NEOTAP' },
  ];
  it('型號 > 廠牌 > 通用', () => {
    expect(pickDefaultGroup(groups, NEOTAP).id).toBe(4);
    expect(pickDefaultGroup(groups, { brand: 'LDA', model: 'L1' }).id).toBe(2);
    expect(pickDefaultGroup(groups, { brand: 'DELL', model: 'R660XS' }).id).toBe(1);
  });
  it('都不符合時退回第一組，沒有主項目時回傳 null', () => {
    expect(pickDefaultGroup([{ id: 9, brand: 'DELL' }], NEOTAP).id).toBe(9);
    expect(pickDefaultGroup([], NEOTAP)).toBeNull();
  });
});

describe('資料庫端的比對規則與畫面一致', () => {
  const oneLine = (s) => s.replace(/\s+/g, ' ');

  it('自動套用：主項目有型號時只比對到該型號', () => {
    const sql = oneLine(queries.syncBrandChecklistToAssets);
    expect(sql).toContain("COALESCE(NULLIF(TRIM(g.model), ''), '') = '' OR UPPER(TRIM(COALESCE(m.model, ''))) = UPPER(TRIM(g.model))");
  });

  it('型號必須搭配廠牌：沒有廠牌時存成 NULL', () => {
    for (const name of ['insertChecklistGroup', 'updateChecklistGroup']) {
      expect(oneLine(queries[name])).toContain("CASE WHEN NULLIF(TRIM(COALESCE($2, '')), '') IS NULL THEN NULL");
    }
  });
});
