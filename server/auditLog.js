// ============================================================================
// 伺服器端事件紀錄
// ----------------------------------------------------------------------------
// 前端的 src/utils/auditLogger.js 寫的是使用者在畫面上做的事。
// 登入、登入失敗與登出前端寫不了：失敗的登入根本還沒有連線階段，
// 來源 IP 也只有伺服器拿得到。因此這幾件事在這裡直接寫進同一張表。
//
// 寫紀錄失敗不能影響登入本身 —— 登入是使用者進得來系統的前提，
// 稽核寫不進去頂多少一筆紀錄，不該讓人因此被擋在門外。
// ============================================================================

const INSERT_SQL = `
  INSERT INTO system_audit_logs (
    user_id, user_name, user_role, action_type, module, module_label,
    target_id, target_name, summary, details, ip_address
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
`;

/**
 * 取得來源 IP。
 * 正式環境前面有 nginx，直接看 req.ip 會全部變成 127.0.0.1。
 */
export function clientIp(req) {
  const forwarded = req.get?.('x-forwarded-for');
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

/**
 * 寫一筆事件紀錄。
 *
 * @param {import('pg').Pool} pool
 * @param {object} entry
 */
export async function writeAuditLog(pool, {
  userId = null,
  userName = '系統',
  userRole = 'SYSTEM',
  actionType,
  module = 'USER',
  moduleLabel = '帳號權限',
  targetId = '',
  targetName = '',
  summary = '',
  details = {},
  ipAddress = 'unknown',
}) {
  try {
    await pool.query(INSERT_SQL, [
      userId, userName, userRole, actionType, module, moduleLabel,
      String(targetId || ''), String(targetName || ''), summary,
      JSON.stringify(details ?? {}), ipAddress,
    ]);
  } catch (err) {
    console.error('[AuditLog] 寫入失敗（不影響本次操作）:', err.message);
  }
}

export default { writeAuditLog, clientIp };
