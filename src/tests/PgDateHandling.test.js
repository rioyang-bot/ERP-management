import { describe, it, expect } from 'vitest';
import fs from 'fs';

/**
 * DATE 欄位不做時區換算
 *
 * DATE 記的是「哪一天」，沒有時間也沒有時區。node-postgres 預設把它轉成
 * 「本機時區午夜」的 JS Date，經過 JSON 就變成 UTC 字串 ——
 * 在 UTC+8，2026-09-21 會變成 "2026-09-20T16:00:00.000Z"，
 * 前端取前十碼就成了前一天。
 *
 * 症狀是進貨單把日期改成今天、存檔成功，重新載入卻還是顯示前一天，
 * 看起來像沒存到；實際上存對了，是讀出來時被換算掉一天。
 */
describe('DATE 的型別解析', () => {
  const src = fs.readFileSync('server/pgTypes.js', 'utf8');

  it('只覆寫 DATE (1082)，不動 TIMESTAMP', () => {
    expect(src).toContain('1082');
    // TIMESTAMP 是真正的時間點，換算是對的，不該一起改掉
    expect(src).not.toContain('1114');
    expect(src).not.toContain('1184');
  });

  it('原樣回傳字串，不轉成 Date', () => {
    expect(src).toMatch(/setTypeParser\(DATE_OID, \(value\) => value\)/);
  });

  it.each([
    ['伺服器', 'server.js'],
    ['Electron', 'electron/db.js'],
  ])('%s 有載入這份設定', (_label, file) => {
    const s = fs.readFileSync(file, 'utf8');
    expect(s).toMatch(/pgTypes\.js/);
  });

  it.each([
    ['伺服器', 'server.js', "import pg from 'pg';"],
    ['Electron', 'electron/db.js', "import pg from 'pg';"],
  ])('%s 在建立連線池之前就套用', (_label, file, pgImport) => {
    const s = fs.readFileSync(file, 'utf8');
    const applied = s.indexOf('pgTypes.js');
    const pool = s.indexOf('Pool(');

    expect(applied).toBeGreaterThan(s.indexOf(pgImport));
    expect(applied).toBeLessThan(pool);
  });
});

describe('日期在 UTC+8 的行為', () => {
  // 修正前的做法：pg 給 Date、JSON 轉 UTC、前端取前十碼
  const oldWay = (isoFromJson) => isoFromJson.toString().slice(0, 10);

  it('重現舊的偏移：本機午夜經過 JSON 會退一天', () => {
    // 2026-09-21 00:00 +08:00 的 UTC 表示法
    const asJson = '2026-09-20T16:00:00.000Z';
    expect(oldWay(asJson)).toBe('2026-09-20');
  });

  it('改為字串之後，同一段前端程式取到正確的日期', () => {
    expect(oldWay('2026-09-21')).toBe('2026-09-21');
  });
});
