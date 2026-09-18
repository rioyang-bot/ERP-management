import { describe, it, expect } from 'vitest';
import { queries } from '../../database/queries';

/**
 * 搭載硬體的排列順序
 *
 * 這份清單先前沒有任何 ORDER BY，順序是 UNION 去重的副產物 ——
 * 看起來像照序號排，實際上並沒有保證，同一台設備在不同時候可能不一樣。
 * 現在固定依型號排列，同型號再依廠牌與序號。
 */
const COMPONENT_QUERIES = [
  ['設備／硬體／耗材列表', 'fetchAssetsList'],
  ['依廠牌彙整的列表', 'fetchAssetsListByBrand'],
  ['單台設備明細', 'fetchAssetDetailBySN'],
  ['專案彙整', 'fetchAssetsByProject'],
];

describe('搭載硬體依型號排序', () => {
  it.each(COMPONENT_QUERIES)('%s 的搭載硬體有指定排序', (_label, name) => {
    const sql = queries[name];
    // 搭載硬體那一段 json_agg 內必須帶 ORDER BY
    const agg = sql.slice(sql.indexOf('json_agg'), sql.indexOf('as components'));
    expect(agg).toMatch(/ORDER BY NULLIF\((comp|hi)\.model/);
  });

  it.each(COMPONENT_QUERIES)('%s 把型號未建檔的排在最後', (_label, name) => {
    const agg = queries[name].slice(0, queries[name].indexOf('as components'));
    expect(agg).toContain('NULLS LAST');
  });

  it('同型號再以廠牌、序號決定先後，順序才不會浮動', () => {
    const agg = queries.fetchAssetsList.slice(0, queries.fetchAssetsList.indexOf('as components'));
    expect(agg).toMatch(/ORDER BY NULLIF\(comp\.model, ''\) ASC NULLS LAST, NULLIF\(comp\.brand, ''\) ASC NULLS LAST, comp\.sn/);
  });
});
