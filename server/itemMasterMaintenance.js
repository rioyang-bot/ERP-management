// ============================================================================
// 品項主檔維護：清理沒人用的設備／硬體主檔、整併大小寫與空白重複的主檔
// ----------------------------------------------------------------------------
// 這兩件事都會刪掉 item_master 的資料，先前卻一筆事件紀錄也沒有 ——
// 事後要查「那個型號怎麼不見了」「這些設備怎麼換到另一個主檔底下」完全無從查起。
// 現在每次真的有刪除或整併，都寫進事件紀錄（模組：系統維護）：
//   - 清理：列出被刪掉的主檔（廠牌／類型／型號／規格）
//   - 整併：每一組各記一筆，保留哪一個主檔、刪掉哪些、各資料表搬了幾筆
// 伺服器啟動時跑的記在「系統」名下；從系統設定按鈕觸發的記在操作的使用者名下。
// ============================================================================

import { writeAuditLog, clientIp } from './auditLog.js';

const SYSTEM_MODULE = { module: 'SYSTEM_SETTINGS', moduleLabel: '系統維護' };

/** 事件紀錄的操作者：有連線階段就記使用者，伺服器啟動時記「系統」 */
export function auditActor(req) {
  if (req?.user) {
    return {
      userId: req.user.id ?? null,
      userName: req.user.full_name || req.user.username || '系統',
      userRole: req.user.role || 'USER',
      ipAddress: clientIp(req),
    };
  }
  return { userId: null, userName: '系統', userRole: 'SYSTEM', ipAddress: 'Local' };
}

/** 主檔的顯示文字：廠牌 / 類型 / 型號 / 規格 */
export function describeMaster(row = {}) {
  const parts = [row.brand, row.type, row.model].map((v) => String(v ?? '').trim()).filter(Boolean);
  const spec = String(row.specification ?? '').trim();
  return `${parts.join(' / ') || `#${row.id}`}${spec ? `（${spec}）` : ''}`;
}

const masterInfo = (row = {}) => ({
  id: row.id,
  category: row.cat_name ?? row.category ?? null,
  brand: row.brand ?? null,
  type: row.type ?? null,
  model: row.model ?? null,
  specification: row.specification ?? null,
});

/**
 * 清理沒有任何資產與單據關聯的設備、硬體主檔（當初匯入錯誤、資產已修改或刪除的殘留資料）。
 * 有刪到東西才寫一筆事件紀錄，列出刪掉的主檔。
 * @returns {Promise<object[]>} 被刪掉的主檔
 */
export async function cleanupUnusedItemMasters(pool, { req = null } = {}) {
  const res = await pool.query(`
    DELETE FROM item_master i
    USING categories c
    WHERE i.category_id = c.id
      AND c.name IN ('設備', '硬體')
      AND NOT EXISTS (SELECT 1 FROM assets a WHERE a.item_master_id = i.id)
      AND NOT EXISTS (SELECT 1 FROM inbound_items ii WHERE ii.item_id = i.id)
      AND NOT EXISTS (SELECT 1 FROM outbound_items oi WHERE oi.item_id = i.id)
      AND NOT EXISTS (SELECT 1 FROM item_lab_assignments la WHERE la.item_master_id = i.id)
    RETURNING i.id, c.name AS cat_name, i.brand, i.type, i.model, i.specification
  `);
  const rows = res?.rows || [];
  if (rows.length === 0) return rows;

  const list = rows.map((r) => `${r.cat_name ? `[${r.cat_name}] ` : ''}${describeMaster(r)}`);
  await writeAuditLog(pool, {
    ...auditActor(req),
    ...SYSTEM_MODULE,
    actionType: 'DELETE',
    targetId: rows.map((r) => r.id).join(','),
    targetName: '未使用的品項主檔',
    summary: `自動清理未使用的品項主檔 ${rows.length} 筆：${list.join('、')}`,
    details: { reason: '無任何資產、進出貨單與 LAB 配置關聯', count: rows.length, removed: rows.map(masterInfo) },
  });
  console.log(`🧹 Removed ${rows.length} unused item master(s): ${rows.map((r) => r.id).join(',')}`);
  return rows;
}

// 整併時要把次要主檔的關聯搬到保留的主檔：資料表、欄位、事件紀錄上的名稱
const MERGE_TABLES = [
  { table: 'assets', column: 'item_master_id', label: '資產' },
  { table: 'inbound_items', column: 'item_id', label: '進貨單項目' },
  { table: 'outbound_items', column: 'item_id', label: '出貨單項目' },
  { table: 'item_lab_assignments', column: 'item_master_id', label: 'LAB 配置紀錄' },
  { table: 'repair_items', column: 'item_master_id', label: '維修品項' },
];

/**
 * 大小寫與空白重複品項主檔安全整併。
 * 每整併一組寫一筆事件紀錄：保留的主檔、刪掉的主檔、各資料表搬了幾筆。
 * @param {import('pg').Pool} clientPool
 * @param {{ req?: object }} [options] 從 API 觸發時傳入 req，事件紀錄記在該使用者名下
 */
export async function autoMergeDuplicateItemMasters(clientPool, { req = null } = {}) {
  try {
    const dupRes = await clientPool.query(`
      SELECT
        c.name as cat_name,
        LOWER(TRIM(i.brand)) as norm_brand,
        LOWER(TRIM(i.type)) as norm_type,
        LOWER(TRIM(i.model)) as norm_model,
        LOWER(TRIM(COALESCE(i.specification, ''))) as norm_specification,
        array_agg(i.id ORDER BY i.id ASC) as ids
      FROM item_master i
      JOIN categories c ON i.category_id = c.id
      WHERE c.name IN ('設備', '硬體')
      GROUP BY c.name, LOWER(TRIM(i.brand)), LOWER(TRIM(i.type)), LOWER(TRIM(i.model)), LOWER(TRIM(COALESCE(i.specification, '')))
      HAVING COUNT(*) > 1
    `);

    if (dupRes.rows.length === 0) {
      console.log('✅ Item Master check: No duplicate case-insensitive masters found.');
      return { mergedGroups: 0, removedMasters: 0 };
    }

    console.log(`🔍 Found ${dupRes.rows.length} groups of case-insensitive duplicate item masters. Merging...`);
    let totalRemoved = 0;
    const actor = auditActor(req);

    for (const group of dupRes.rows) {
      const allIds = group.ids;
      // 找出擁有最多資產關聯的主檔做為主要主檔 (primaryId)
      const assetCounts = await clientPool.query(`
        SELECT item_master_id, COUNT(*) as cnt
        FROM assets
        WHERE item_master_id = ANY($1)
        GROUP BY item_master_id
        ORDER BY cnt DESC, item_master_id ASC
      `, [allIds]);

      const primaryId = assetCounts.rows.length > 0 ? assetCounts.rows[0].item_master_id : allIds[0];
      const secondaryIds = allIds.filter(id => id !== primaryId);

      if (secondaryIds.length === 0) continue;

      // 整併前先讀出這一組主檔原本的內容（刪掉之後就查不到大小寫原本長怎樣）
      const masterRes = await clientPool.query(`
        SELECT id, brand, type, model, specification FROM item_master WHERE id = ANY($1) ORDER BY id ASC
      `, [allIds]);
      const masters = new Map((masterRes?.rows || []).map((r) => [r.id, r]));

      // 1~5. 轉移資產、進貨單、出貨單、LAB 配置、維修品項的關聯，記下各搬了幾筆
      const moved = {};
      for (const { table, column } of MERGE_TABLES) {
        const r = await clientPool.query(`
        UPDATE ${table} SET ${column} = $1 WHERE ${column} = ANY($2)
      `, [primaryId, secondaryIds]);
        moved[table] = r?.rowCount ?? 0;
      }

      // 6. 安全刪除次要重複主檔
      await clientPool.query(`
        DELETE FROM item_master WHERE id = ANY($1)
      `, [secondaryIds]);

      totalRemoved += secondaryIds.length;
      console.log(`   ✨ Merged [${group.cat_name} ${group.norm_brand} ${group.norm_model}]: Kept ID ${primaryId}, merged ${secondaryIds.length} duplicate(s) (${secondaryIds.join(',')})`);

      const kept = { ...(masters.get(primaryId) || { id: primaryId }), cat_name: group.cat_name };
      const removed = secondaryIds.map((id) => ({ ...(masters.get(id) || { id }), cat_name: group.cat_name }));
      const movedText = MERGE_TABLES
        .filter(({ table }) => moved[table] > 0)
        .map(({ table, label }) => `${label} ${moved[table]} 筆`)
        .join('、') || '無關聯資料需搬移';
      await writeAuditLog(clientPool, {
        ...actor,
        ...SYSTEM_MODULE,
        actionType: 'UPDATE',
        targetId: String(primaryId),
        targetName: describeMaster(kept),
        summary: `整併重複品項主檔 [${group.cat_name}] ${describeMaster(kept)}：保留 #${primaryId}，`
          + `刪除 ${removed.map((r) => `#${r.id} ${describeMaster(r)}`).join('、')}；搬移 ${movedText}`,
        details: {
          category: group.cat_name,
          keptId: primaryId,
          kept: masterInfo(kept),
          removedIds: secondaryIds,
          removed: removed.map(masterInfo),
          movedRows: moved,
        },
      });
    }

    console.log(`✅ Item Master Auto-Merge finished: Merged ${dupRes.rows.length} groups, removed ${totalRemoved} duplicate masters.`);
    return { mergedGroups: dupRes.rows.length, removedMasters: totalRemoved };
  } catch (err) {
    console.error('⚠️ Notice on auto-merging duplicate item masters:', err.message);
    return { error: err.message };
  }
}

export default { autoMergeDuplicateItemMasters, cleanupUnusedItemMasters, auditActor, describeMaster };
