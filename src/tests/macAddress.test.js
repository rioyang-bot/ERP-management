import { describe, it, expect } from 'vitest';
import {
  normalizeMac, addToMac, portMac, ouiOf, validateBaseMac, validateOptionalMac, buildMacTable, needsMacTable, PAIR_STARTS, LAST_PORT,
} from '../utils/macAddress';
import { groupMatchLevel } from '../utils/checklistGroupScope';

/**
 * MAC Address Information：輸入 P1，其他埠 = P1 + (n − 1)，16 進位進位
 * 以 LDA 原本文件（SN NEO264300002）的數字當答案；原文件 P29,P30 的 Exchange Port 誤植為「c5:bw」，正確是 c5:b2。
 */
const P1 = 'a0:19:b2:c0:c5:95';
const EXPECTED = [
  ['P1,P2', 'a0:19:b2:c0:c5:95', 'a0:19:b2:c0:c5:96'],
  ['P5,P6', 'a0:19:b2:c0:c5:99', 'a0:19:b2:c0:c5:9a'],
  ['P9,P10', 'a0:19:b2:c0:c5:9d', 'a0:19:b2:c0:c5:9e'],
  ['P13,P14', 'a0:19:b2:c0:c5:a1', 'a0:19:b2:c0:c5:a2'],
  ['P17,P18', 'a0:19:b2:c0:c5:a5', 'a0:19:b2:c0:c5:a6'],
  ['P21,P22', 'a0:19:b2:c0:c5:a9', 'a0:19:b2:c0:c5:aa'],
  ['P25,P26', 'a0:19:b2:c0:c5:ad', 'a0:19:b2:c0:c5:ae'],
  ['P29,P30', 'a0:19:b2:c0:c5:b1', 'a0:19:b2:c0:c5:b2'],
  ['P33,P34', 'a0:19:b2:c0:c5:b5', 'a0:19:b2:c0:c5:b6'],
  ['P37,P38', 'a0:19:b2:c0:c5:b9', 'a0:19:b2:c0:c5:ba'],
];

describe('MAC 計算', () => {
  it('各種寫法都整理成小寫、冒號分隔；空白回傳空字串，格式不對回傳 null', () => {
    for (const v of ['a0:19:b2:c0:c5:95', 'A0-19-B2-C0-C5-95', 'a019.b2c0.c595', ' A019B2C0C595 ']) {
      expect(normalizeMac(v)).toBe(P1);
    }
    expect(normalizeMac('')).toBe('');
    expect(normalizeMac(null)).toBe('');
    expect(normalizeMac('a0:19:b2:c0:c5:bw')).toBeNull();
    expect(normalizeMac('a0:19:b2:c0:c5')).toBeNull();
  });

  it('Pair 固定 10 列，P3,P4、P7,P8 … 跳過', () => {
    expect(PAIR_STARTS).toEqual([1, 5, 9, 13, 17, 21, 25, 29, 33, 37]);
    expect(LAST_PORT).toBe(38);
  });

  it('輸入 P1 → 整張表與原文件一致（含 P29,P30 更正為 b2）', () => {
    const { oui, rows } = buildMacTable({ baseMac: 'A0-19-B2-C0-C5-95' });
    expect(oui).toBe('a0:19:b2:c0');
    expect(rows.slice(0, 10).map((r) => [r.pair, r.server, r.exchange])).toEqual(EXPECTED);
  });

  it('16 進位往前進位：…:ff + 1 → 下一個位元組', () => {
    expect(addToMac('a0:19:b2:c0:c5:ff', 1)).toBe('a0:19:b2:c0:c6:00');
    expect(addToMac('a0:19:b2:ff:ff:ff', 1)).toBe('a0:19:b3:00:00:00');
    expect(portMac('a0:19:b2:c0:c5:f0', 38)).toBe('a0:19:b2:c0:c6:15');
  });

  it('加到 P38 超過 ff:ff:ff:ff:ff:ff 時提示，表格留空', () => {
    expect(addToMac('ff:ff:ff:ff:ff:ff', 1)).toBeNull();
    expect(validateBaseMac('ff:ff:ff:ff:ff:f0')).toContain('超過');
    const { oui, rows } = buildMacTable({ baseMac: 'ff:ff:ff:ff:ff:f0' });
    expect(oui).toBe('');
    expect(rows[0].server).toBe('');
  });

  it('檢查：P1 空白不算錯、格式錯提示；MGT 可留空', () => {
    expect(validateBaseMac('')).toBe('');
    expect(validateBaseMac(P1)).toBe('');
    expect(validateBaseMac('xyz')).toContain('格式不正確');
    expect(validateOptionalMac('')).toBe('');
    expect(validateOptionalMac('9c:6b:00:c5:13:be')).toBe('');
    expect(validateOptionalMac('9c:6b')).toContain('格式不正確');
  });

  it('OUI 取 P1 前 4 個位元組', () => {
    expect(ouiOf(P1)).toBe('a0:19:b2:c0');
    expect(ouiOf('bad')).toBe('');
  });

  it('MGT(LAN,IPMI) 是最後一列，管理者填的值照填、沒填留空', () => {
    const filled = buildMacTable({ baseMac: P1, mgtLan: '9C-6B-00-C5-13-BE', mgtIpmi: '9c:6b:00:c5:16:19' }).rows[10];
    expect(filled).toEqual({ pair: 'MGT(LAN,IPMI)', server: '9c:6b:00:c5:13:be', exchange: '9c:6b:00:c5:16:19', mgt: true });
    const empty = buildMacTable({ baseMac: P1 }).rows[10];
    expect([empty.server, empty.exchange]).toEqual(['', '']);
  });

  it('沒填 P1 時 Pair 欄照列、MAC 留空', () => {
    const { rows } = buildMacTable({});
    expect(rows).toHaveLength(11);
    expect(rows.every((r) => r.server === '' && r.exchange === '')).toBe(true);
  });

  it('需要 MAC 表：符合的主項目有勾才算', () => {
    const fw = { brand: 'LDA', model: 'FIREWALL' };
    const groups = [{ brand: 'LDA', model: 'FIREWALL', mac_table: true }, { brand: 'LDA', model: 'L1', mac_table: false }];
    expect(needsMacTable(groups, fw, groupMatchLevel)).toBe(true);
    expect(needsMacTable(groups, { brand: 'LDA', model: 'L1' }, groupMatchLevel)).toBe(false);
    expect(needsMacTable(groups, { brand: 'CISCO', model: 'FIREWALL' }, groupMatchLevel)).toBe(false);
  });
});
