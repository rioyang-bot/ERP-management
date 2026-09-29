import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { queries } from '../../database/queries';

/**
 * 耗材品項的識別鍵
 *
 * 2026-09-29 有六筆耗材從耗材列表誤建，其中四筆讓同一個品項多出一筆主檔。
 * 應用層其實有擋重複，但它比對的是「廠牌＋類型＋型號＋備註」——
 * 備註是自由文字（既有資料裡的內容多半是廠牌名重複一次），
 * 只要備註不同就被當成不同品項放行。
 *
 * 實測 78 筆耗材主檔，把備註排除在識別鍵外之後 0 組相撞，
 * 代表備註對「是不是同一個品項」毫無貢獻。
 */
describe('耗材重複檢查的識別鍵', () => {
  const sql = queries.checkDuplicateConsumable;

  it('比對廠牌、類型、型號三項', () => {
    expect(sql).toContain('$1');
    expect(sql).toContain('$2');
    expect(sql).toContain('$3');
  });

  it('不把備註算進識別鍵', () => {
    // specification 只出現在要取回的欄位裡，不出現在 WHERE 條件
    const where = sql.slice(sql.indexOf('WHERE'));
    expect(where).not.toContain('specification');
    expect(sql).not.toContain('$4');
  });

  it('回傳既有品項的資訊，訊息才講得出是哪一筆', () => {
    const select = sql.slice(0, sql.indexOf('FROM'));
    for (const col of ['brand', 'type', 'model', 'specification', 'stock_qty', 'lab_qty']) {
      expect(select, col).toContain(col);
    }
  });

  it('只看耗材，不會撞到設備或硬體的同名品項', () => {
    expect(sql).toContain("category_id = (SELECT id FROM categories WHERE name = '耗材')");
  });

  it('大小寫與多餘空白不影響比對', () => {
    expect(sql).toContain('UPPER(TRIM(REGEXP_REPLACE(');
  });
});

/**
 * 只靠應用層檢查不夠：匯入、腳本或任何新寫的程式繞過那段就會再生出重複。
 * 資料庫層再擋一次。
 */
describe('資料庫層的唯一索引', () => {
  const migration = fs.readFileSync('database/migration_consumable_unique_key.sql', 'utf8');

  it('索引鍵與應用層一致：廠牌＋類型＋型號', () => {
    expect(migration).toContain('CREATE UNIQUE INDEX idx_item_master_consumable_unique');
    expect(migration).toContain("UPPER(TRIM(COALESCE(brand, '''')))");
    expect(migration).toContain("UPPER(TRIM(COALESCE(type, '''')))");
    expect(migration).toContain("UPPER(TRIM(COALESCE(model, '''')))");
  });

  /** 設備與硬體的 specification 是真的規格，套用同一把鍵會誤擋 */
  it('只限耗材', () => {
    expect(migration).toContain('WHERE category_id = %s');
    expect(migration).toContain("SELECT id INTO consumable_id FROM categories WHERE name = '耗材'");
  });

  it('既有資料有衝突時明確報錯，不會靜靜失敗', () => {
    expect(migration).toContain('RAISE EXCEPTION');
    expect(migration).toContain('HAVING COUNT(*) > 1');
  });

  it('可重複執行', () => {
    expect(migration).toContain("WHERE indexname = 'idx_item_master_consumable_unique'");
  });

  it('已登記在 migration 清單裡', () => {
    const manifest = JSON.parse(fs.readFileSync('database/migrations.manifest.json', 'utf8'));
    expect(manifest.migrations.some((m) => m.file === 'migration_consumable_unique_key.sql')).toBe(true);
  });
});
