import { describe, it, expect } from 'vitest';
import { sanitizeParams } from '../utils/security';

describe('安全性過濾測試 (sanitizeParams)', () => {
  
  it('應濾除規範中的特殊字元 (| & ; $ % @ \' " \\ ( ) + CR LF)', () => {
    const input = ["admin'; DROP TABLE users; --", "data&value|other"];
    const expected = ["admin  TABLE users --", "datavalueother"];
    expect(sanitizeParams(input)).toEqual(expected);
  });

  it('應濾除 Mass SQL Injection 關鍵字 (Select, Insert, Drop 等)', () => {
    const input = ["SELECT * FROM secret", "INSERT INTO logs", "Drop database"];
    // 預期關鍵字被移除，剩餘部分會被 trim()
    const expected = ["* FROM secret", "INTO logs", "database"];
    expect(sanitizeParams(input)).toEqual(expected);
  });

  it('關鍵字濾除應不分大小寫 (Case-Insensitive)', () => {
    const input = ["sElEcT something", "dRoP table"];
    const expected = ["something", "table"];
    expect(sanitizeParams(input)).toEqual(expected);
  });

  it('不應破壞非字串類型的參數 (例如 JSON 物件)', () => {
    const input = ["normal string", { key: "value", id: 123 }, 456];
    const expected = ["normal string", { key: "value", id: 123 }, 456];
    expect(sanitizeParams(input)).toEqual(expected);
  });

  it('應正確處理空值與非陣列輸入', () => {
    expect(sanitizeParams(null)).toEqual([]);
    expect(sanitizeParams(undefined)).toEqual([]);
    expect(sanitizeParams("not an array")).toEqual([]);
  });

  it('應執行 trim() 以移除前後多餘空白', () => {
    const input = ["  trimmed content  ", "  "];
    const expected = ["trimmed content", ""];
    expect(sanitizeParams(input)).toEqual(expected);
  });

});
