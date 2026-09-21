#!/usr/bin/env node
/**
 * 批次更正資產序號
 *
 * 進貨時打錯一整批序號，一筆一筆從畫面改既費工、也容易漏掉某個關聯。
 * 序號在這套系統裡是以「字串」被好幾個地方記著的：
 *
 *   assets.sn                                  資產本身
 *   assets.custom_attributes.server_sn         硬體掛在哪一台設備
 *   assets.custom_attributes.mounted_hw_sns    設備掛了哪些硬體（逗號分隔）
 *   inbound_items.sn / outbound_items.sn       進貨、出貨明細
 *   repair_items.sn                            維修單明細
 *   asset_checklist_items                      以 asset_id 關聯，不受影響
 *
 * 少改一處就會留下一個指向不存在序號的紀錄，因此全部在同一個交易裡完成：
 * 有任何一筆對不上就整批不動。
 *
 * 用法：
 *   node scripts/rename-asset-sn.mjs <對照檔>            # 試算，不寫入
 *   node scripts/rename-asset-sn.mjs <對照檔> --apply    # 實際執行
 *
 * 對照檔一行一筆，舊序號與新序號以逗號、Tab 或空白分隔；# 開頭為註解：
 *   OLD-SN-001, NEW-SN-001
 *   OLD-SN-002  NEW-SN-002
 */
import fs from 'fs';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const [, , mappingPath, ...flags] = process.argv;
const APPLY = flags.includes('--apply');

if (!mappingPath) {
  console.error('請指定對照檔：node scripts/rename-asset-sn.mjs <對照檔> [--apply]');
  process.exit(1);
}

/** 解析對照檔，回傳 [{ from, to }]；格式錯誤直接中止，不要猜使用者的意思 */
function parseMapping(text) {
  const pairs = [];
  const seenFrom = new Set();
  const seenTo = new Set();

  text.split(/\r?\n/).forEach((raw, idx) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const parts = line.split(/[,\t]+|\s{1,}/).map((p) => p.trim()).filter(Boolean);
    if (parts.length !== 2) {
      throw new Error(`第 ${idx + 1} 行格式不對（需要「舊序號 新序號」兩欄）：${line}`);
    }
    const [from, to] = parts;
    if (from.toUpperCase() === to.toUpperCase()) {
      throw new Error(`第 ${idx + 1} 行的新舊序號相同：${line}`);
    }
    if (seenFrom.has(from.toUpperCase())) throw new Error(`舊序號重複出現：${from}`);
    if (seenTo.has(to.toUpperCase())) throw new Error(`新序號重複出現：${to}`);
    seenFrom.add(from.toUpperCase());
    seenTo.add(to.toUpperCase());
    pairs.push({ from, to });
  });

  if (pairs.length === 0) throw new Error('對照檔沒有任何可用的資料');
  return pairs;
}

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// 對照檔的問題要講清楚是哪一行哪裡不對，不要丟一整串堆疊給使用者
let pairs;
try {
  pairs = parseMapping(fs.readFileSync(mappingPath, 'utf8'));
} catch (e) {
  console.error(`✗ 對照檔有問題，未做任何變更：${e.message}`);
  await pool.end();
  process.exit(1);
}
console.log(`對照檔共 ${pairs.length} 筆\n`);

const client = await pool.connect();
let failed = false;

try {
  await client.query('BEGIN');

  // --- 先全部檢查過，有問題就整批不做 ---
  for (const { from, to } of pairs) {
    const found = await client.query(
      'SELECT id, sn FROM assets WHERE UPPER(TRIM(sn)) = UPPER(TRIM($1))', [from]);
    if (found.rows.length === 0) throw new Error(`找不到序號 ${from}`);
    if (found.rows.length > 1) throw new Error(`序號 ${from} 對到 ${found.rows.length} 筆資產，請先處理重複`);

    const taken = await client.query(
      'SELECT id FROM assets WHERE UPPER(TRIM(sn)) = UPPER(TRIM($1))', [to]);
    if (taken.rows.length > 0) throw new Error(`新序號 ${to} 已經被其他資產使用`);
  }
  console.log('✓ 檢查通過：每個舊序號都只對到一筆資產，新序號都還沒被用\n');

  // --- 逐筆更名，連同所有以序號字串記錄的關聯 ---
  let totalLinks = 0;
  for (const { from, to } of pairs) {
    const asset = (await client.query(
      'UPDATE assets SET sn = $1, updated_at = CURRENT_TIMESTAMP WHERE UPPER(TRIM(sn)) = UPPER(TRIM($2)) RETURNING id', [to, from])).rows[0];

    // 這台設備底下掛的硬體，其 server_sn 要跟著改
    const mountedHw = await client.query(
      `UPDATE assets SET custom_attributes = COALESCE(custom_attributes, '{}'::jsonb) || jsonb_build_object('server_sn', $1::text)
       WHERE custom_attributes->>'server_sn' IS NOT NULL
         AND UPPER(TRIM(custom_attributes->>'server_sn')) = UPPER(TRIM($2)) RETURNING id`, [to, from]);

    // 這顆硬體被哪些設備列在 mounted_hw_sns 裡（逐筆比對後替換，避免子字串誤傷）
    const parents = await client.query(
      `UPDATE assets d
       SET custom_attributes = COALESCE(d.custom_attributes, '{}'::jsonb) || jsonb_build_object(
             'mounted_hw_sns',
             (SELECT string_agg(CASE WHEN UPPER(TRIM(p)) = UPPER(TRIM($2)) THEN TRIM($1) ELSE TRIM(p) END, ', ')
              FROM unnest(string_to_array(d.custom_attributes->>'mounted_hw_sns', ',')) AS p
              WHERE TRIM(p) <> ''))
       WHERE d.custom_attributes->>'mounted_hw_sns' IS NOT NULL
         AND EXISTS (SELECT 1 FROM unnest(string_to_array(d.custom_attributes->>'mounted_hw_sns', ',')) AS p
                     WHERE UPPER(TRIM(p)) = UPPER(TRIM($2)))
       RETURNING d.id`, [to, from]);

    const inb = await client.query(
      'UPDATE inbound_items SET sn = $1 WHERE sn IS NOT NULL AND UPPER(TRIM(sn)) = UPPER(TRIM($2)) RETURNING id', [to, from]);
    const outb = await client.query(
      'UPDATE outbound_items SET sn = $1 WHERE sn IS NOT NULL AND UPPER(TRIM(sn)) = UPPER(TRIM($2)) RETURNING id', [to, from]);
    const rep = await client.query(
      'UPDATE repair_items SET sn = $1 WHERE sn IS NOT NULL AND UPPER(TRIM(sn)) = UPPER(TRIM($2)) RETURNING id', [to, from]);

    const links = mountedHw.rowCount + parents.rowCount + inb.rowCount + outb.rowCount + rep.rowCount;
    totalLinks += links;

    const detail = [
      mountedHw.rowCount ? `底下硬體 ${mountedHw.rowCount}` : '',
      parents.rowCount ? `所屬設備 ${parents.rowCount}` : '',
      inb.rowCount ? `進貨明細 ${inb.rowCount}` : '',
      outb.rowCount ? `出貨明細 ${outb.rowCount}` : '',
      rep.rowCount ? `維修明細 ${rep.rowCount}` : '',
    ].filter(Boolean).join('、') || '無其他關聯';

    console.log(`  ${from} → ${to}  (資產 id ${asset.id}；${detail})`);
  }

  console.log(`\n合計更名 ${pairs.length} 筆資產，連動 ${totalLinks} 處關聯`);

  if (APPLY) {
    await client.query('COMMIT');
    console.log('\n已寫入資料庫。');
  } else {
    await client.query('ROLLBACK');
    console.log('\n這是試算，尚未寫入。確認無誤後加上 --apply 再執行一次。');
  }
} catch (e) {
  failed = true;
  await client.query('ROLLBACK');
  console.error(`\n✗ 中止，整批未變更：${e.message}`);
} finally {
  client.release();
  await pool.end();
}

process.exit(failed ? 1 : 0);
