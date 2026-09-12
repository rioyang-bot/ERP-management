// ============================================================================
// 伺服器端身分驗證
// ----------------------------------------------------------------------------
// 設計重點：
//   1. 密碼一律在伺服器端驗證，password_hash 絕不回傳給用戶端。
//   2. 登入成功後發給一組隨機連線代碼（token），存於 user_sessions，
//      可隨時撤銷；代碼本身不含任何使用者資訊。
//   3. 除登入端點外，所有 /api 路由都必須通過 requireAuth。
//   4. 密碼相關操作不經過 sanitizeParams —— 該函式會刪除 | & ; $ % @ ' \ ( ) +
//      等字元，會在使用者無感的情況下竄改並弱化密碼。
//   5. 舊資料為未加鹽的單輪 SHA-256，無法反推。改採「登入時漸進升級」：
//      驗證通過後立即以 bcrypt 重新雜湊寫回，使用者無須重設密碼。
// ============================================================================

import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;
const SESSION_TTL_HOURS = 12;

/** 以 bcrypt 雜湊明文密碼 */
export const hashPassword = (plain) => bcrypt.hash(String(plain), BCRYPT_ROUNDS);

/** 舊制：未加鹽單輪 SHA-256（僅用於驗證既有資料，不再用於新密碼） */
const legacySha256 = (plain) =>
  crypto.createHash('sha256').update(String(plain), 'utf8').digest('hex');

/**
 * 驗證密碼是否正確。
 * @returns {Promise<{ ok: boolean, needsUpgrade: boolean }>}
 *   needsUpgrade 為 true 時，呼叫端應以 bcrypt 重新雜湊並寫回。
 */
export const verifyPassword = async (plain, storedHash) => {
  if (!storedHash) return { ok: false, needsUpgrade: false };

  // bcrypt 格式一律以 $2 開頭：以雜湊實際內容判斷演算法，比信任 password_algo 欄位穩妥
  if (String(storedHash).startsWith('$2')) {
    return { ok: await bcrypt.compare(String(plain), storedHash), needsUpgrade: false };
  }

  // 舊制 SHA-256：使用定時比較避免時間差攻擊
  const candidate = legacySha256(plain);
  const a = Buffer.from(candidate, 'utf8');
  const b = Buffer.from(String(storedHash).toLowerCase(), 'utf8');
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  return { ok, needsUpgrade: ok };
};

/** 產生連線代碼：128 個十六進位字元（64 bytes 亂數） */
export const generateToken = () => crypto.randomBytes(64).toString('hex');

/** 從請求標頭取出 Bearer 代碼 */
const extractToken = (req) => {
  const header = req.get('authorization') || '';
  const m = /^Bearer\s+([A-Za-z0-9._-]+)$/.exec(header.trim());
  return m ? m[1] : null;
};

/**
 * 建立 Express 中介層與連線階段管理工具。
 * @param {import('pg').Pool} pool
 */
export const createAuth = (pool) => {
  /** 登入成功後建立連線階段 */
  const createSession = async (userId, userAgent) => {
    const token = generateToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000);
    await pool.query(
      `INSERT INTO user_sessions (token, user_id, expires_at, user_agent) VALUES ($1, $2, $3, $4)`,
      [token, userId, expiresAt, String(userAgent || '').slice(0, 500)]
    );
    return { token, expiresAt };
  };

  const destroySession = async (token) => {
    if (!token) return;
    await pool.query(`DELETE FROM user_sessions WHERE token = $1`, [token]);
  };

  /** 清除逾期的連線階段，避免資料表無限成長 */
  const purgeExpired = async () => {
    const r = await pool.query(`DELETE FROM user_sessions WHERE expires_at < CURRENT_TIMESTAMP`);
    return r.rowCount;
  };

  /**
   * 驗證中介層：代碼無效或逾期一律回 401。
   * 通過後於 req.user 附上使用者資訊（不含 password_hash）。
   */
  const requireAuth = async (req, res, next) => {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ success: false, error: '尚未登入或連線階段已失效，請重新登入。' });
    }
    try {
      const r = await pool.query(
        `SELECT s.token, u.id, u.username, u.role, u.full_name, u.menu_access
           FROM user_sessions s
           JOIN users u ON u.id = s.user_id
          WHERE s.token = $1 AND s.expires_at > CURRENT_TIMESTAMP AND u.is_active = TRUE`,
        [token]
      );
      if (r.rows.length === 0) {
        return res.status(401).json({ success: false, error: '尚未登入或連線階段已失效，請重新登入。' });
      }
      req.user = r.rows[0];
      req.sessionToken = token;
      // 不每次都寫入，降低寫入量：僅在超過 5 分鐘未更新時記錄
      pool.query(
        `UPDATE user_sessions SET last_seen_at = CURRENT_TIMESTAMP
          WHERE token = $1 AND last_seen_at < CURRENT_TIMESTAMP - INTERVAL '5 minutes'`,
        [token]
      ).catch(() => { /* 更新活動時間失敗不影響請求 */ });
      return next();
    } catch (err) {
      console.error('[Auth] 驗證連線階段失敗:', err.message);
      return res.status(500).json({ success: false, error: '驗證失敗，請稍後再試。' });
    }
  };

  /** 僅限特定角色。用於使用者管理等高權限操作。 */
  const requireRole = (...roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: '權限不足。' });
    }
    return next();
  };

  return { createSession, destroySession, purgeExpired, requireAuth, requireRole };
};
