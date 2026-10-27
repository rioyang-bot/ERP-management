import { describe, it, expect } from 'vitest';
import fs from 'fs';

/**
 * 資料更正：RMA-20261022-01 以庫存設備換貨的出貨日選錯（10/29 → 10/22）
 *
 * 部署時由 npm run migrate 套用。這裡只檢查腳本的防護條件；
 * 實際結果已在本機資料庫（伺服器備份）於交易內實跑驗證。
 */
const sql = fs.readFileSync('database/fix_rma_20261022_ship_date.sql', 'utf8');

describe('RMA-20261022-01 出貨日更正', () => {
  it('列在 migration 清單，類型是資料更正', () => {
    const { migrations } = JSON.parse(fs.readFileSync('database/migrations.manifest.json', 'utf8'));
    expect(migrations.find((m) => m.file === 'fix_rma_20261022_ship_date.sql')).toMatchObject({ type: 'data' });
  });

  it('只在資料還是 10/29、DN-20261029-01 時才動作', () => {
    expect(sql).toContain('WHERE request_no = v_old_no AND shipping_date = v_wrong');
    expect(sql).toContain("WHERE repair_no = 'RMA-20261022-01' AND swap_dn_no = v_old_no");
    expect(sql).toMatch(/IF v_dn_id IS NULL OR v_ro_id IS NULL THEN[\s\S]*?RETURN;/);
    // 設備與硬體只改還是 10/29 的
    expect(sql).toContain('a.shipping_date = v_wrong');
  });

  it('10/22 已有出貨單時取下一個號碼，不會撞號', () => {
    expect(sql).toContain("WHERE request_no ~ '^DN-20261022-[0-9]+$'");
  });

  it('維修單、出貨單、每支序號各補一筆更正紀錄', () => {
    expect(sql.match(/INSERT INTO system_audit_logs/g)).toHaveLength(2);
    for (const m of ["'REPAIR'", "'OUTBOUND'", 'r.module']) expect(sql).toContain(m);
    expect(sql).toContain("'correction', true");
  });
});
