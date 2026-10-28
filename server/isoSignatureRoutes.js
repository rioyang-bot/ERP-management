// ============================================================================
// ISO 表單線上簽核（目前只有 S-408-02 設備攜出入單）
// ----------------------------------------------------------------------------
// 每個月由機房管理員、權責主管各自登入，用自己帳號的簽名檔簽核
// （簽名檔可以上傳圖檔或手寫後存下，/me/signature；沒有簽名檔也能當場手寫）。
//
// 簽的人一律取自連線階段（req.user），不接受用戶端指定，免得有人代簽別人的名字。
// 誰能簽哪個角色，看帳號權限（menu_access）裡的 isoSignRoomAdmin／isoSignSupervisor，
// 在系統管理的「權限設定」勾選；管理員角色也要勾了才能簽。
//
// 簽名時記下當下表單內容的雜湊（由伺服器自己查、自己算）。之後內容不同
// （例如補登了這個月的出貨單），這個簽名就算「簽核後資料有異動」：
// 頁面標示出來、表單（預覽與 PDF）上不印它，要重新簽。
// ============================================================================

import express from 'express';
import crypto from 'crypto';
import { writeAuditLog, clientIp } from './auditLog.js';

export const FORMS = {
  'S-408-02': { label: '設備攜出入單', query: 'fetchEquipmentMovements' },
};

export const SIGNER_ROLES = {
  ROOM_ADMIN: { label: '機房管理員', permission: 'isoSignRoomAdmin' },
  SUPERVISOR: { label: '權責主管', permission: 'isoSignSupervisor' },
};

const PERIOD_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const PNG_RE = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;
/** 手寫簽名 600×200 的 PNG 大約幾十 KB，留一些餘裕 */
const MAX_SIGNATURE_CHARS = 400 * 1024;

const ymd = (v) => {
  if (v instanceof Date) {
    const p = (n) => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  return String(v ?? '').slice(0, 10);
};

/** 表單內容的雜湊：只看會印在表單上的欄位，順序照查詢結果 */
export const contentHash = (rows = []) => crypto.createHash('sha256')
  .update(JSON.stringify(rows.map((r) => [
    ymd(r.move_date), r.direction, r.reason, r.vendor, r.brand, r.model, r.specification, r.sn,
  ].map((v) => (v instanceof Date ? ymd(v) : String(v ?? ''))))))
  .digest('hex');

/** 2026-10 → 起日（含）與下個月 1 號（不含） */
const periodRange = (period) => {
  const [, y, m] = period.match(PERIOD_RE).map(Number);
  const pad = (n) => String(n).padStart(2, '0');
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return [`${y}-${pad(m)}-01`, `${ny}-${pad(nm)}-01`];
};

const rocLabel = (period) => {
  const [y, m] = period.split('-');
  return `${Number(y) - 1911}年${m}月`;
};

export const canSign = (user, role) => !!user?.menu_access?.[SIGNER_ROLES[role]?.permission];

/**
 * @param {import('pg').Pool} pool
 * @param {ReturnType<import('./auth.js').createAuth>} auth
 * @param {Record<string, string>} namedQueries
 */
export const createIsoSignatureRoutes = (pool, auth, namedQueries) => {
  const router = express.Router();

  /** 驗證網址上的表單代號與月份；不對就直接回 400 */
  const parse = (req, res) => {
    const { form, period } = req.params;
    if (!FORMS[form]) { res.status(400).json({ success: false, error: '不支援的表單。' }); return null; }
    if (!PERIOD_RE.test(period)) { res.status(400).json({ success: false, error: '月份格式應為 YYYY-MM。' }); return null; }
    return { form, period, def: FORMS[form] };
  };

  const currentContent = async (def, period) => {
    const r = await pool.query(namedQueries[def.query], periodRange(period));
    return { hash: contentHash(r.rows), rowCount: r.rows.length };
  };

  const auditBase = (req, form, period, def) => ({
    userId: req.user.id,
    userName: req.user.full_name || req.user.username,
    userRole: req.user.role,
    module: 'ISO_FORM',
    moduleLabel: 'ISO 表單',
    targetId: `${form} ${period}`,
    targetName: `${def.label} ${rocLabel(period)}`,
    ipAddress: clientIp(req),
  });

  const validPng = (s) => PNG_RE.test(s) && s.length <= MAX_SIGNATURE_CHARS;

  const userAudit = (req, actionType, summary) => writeAuditLog(pool, {
    userId: req.user.id,
    userName: req.user.full_name || req.user.username,
    userRole: req.user.role,
    actionType,
    module: 'USER',
    moduleLabel: '帳號權限',
    targetId: req.user.username,
    targetName: req.user.full_name || req.user.username,
    summary,
    details: { username: req.user.username },
    ipAddress: clientIp(req),
  });

  // 個人簽名檔：只能讀寫自己的（對象取自連線階段）。要寫在 /:form/:period 前面，否則 me 會被當成表單代號
  router.get('/me/signature', auth.requireAuth, async (req, res) => {
    try {
      const r = await pool.query(`SELECT signature_png, updated_at FROM user_signatures WHERE user_id = $1`, [req.user.id]);
      const s = r.rows[0];
      res.json({ success: true, signaturePng: s?.signature_png || null, updatedAt: s?.updated_at || null });
    } catch (error) {
      console.error('[IsoSignature] 讀取簽名檔失敗:', error.message);
      res.status(500).json({ success: false, error: '讀取簽名檔失敗。' });
    }
  });

  router.put('/me/signature', auth.requireAuth, async (req, res) => {
    const signature = String(req.body?.signature || '');
    if (!validPng(signature)) return res.status(400).json({ success: false, error: '簽名圖檔格式不對或太大。' });
    try {
      const r = await pool.query(
        `INSERT INTO user_signatures (user_id, signature_png, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id) DO UPDATE SET signature_png = EXCLUDED.signature_png, updated_at = EXCLUDED.updated_at
         RETURNING (xmax <> 0) AS replaced`,
        [req.user.id, signature]
      );
      const replaced = !!r.rows[0]?.replaced;
      await userAudit(req, replaced ? 'UPDATE' : 'CREATE', `${replaced ? '更新' : '設定'}個人簽名檔 [${req.user.username}]`);
      res.json({ success: true });
    } catch (error) {
      console.error('[IsoSignature] 儲存簽名檔失敗:', error.message);
      res.status(500).json({ success: false, error: '儲存簽名檔失敗。' });
    }
  });

  router.delete('/me/signature', auth.requireAuth, async (req, res) => {
    try {
      const r = await pool.query(`DELETE FROM user_signatures WHERE user_id = $1 RETURNING user_id`, [req.user.id]);
      if (r.rowCount === 0) return res.status(404).json({ success: false, error: '還沒有簽名檔。' });
      await userAudit(req, 'DELETE', `刪除個人簽名檔 [${req.user.username}]`);
      res.json({ success: true });
    } catch (error) {
      console.error('[IsoSignature] 刪除簽名檔失敗:', error.message);
      res.status(500).json({ success: false, error: '刪除簽名檔失敗。' });
    }
  });

  // 這個月的簽核狀態
  router.get('/:form/:period', auth.requireAuth, async (req, res) => {
    const p = parse(req, res);
    if (!p) return;
    try {
      const [content, sigs] = await Promise.all([
        currentContent(p.def, p.period),
        pool.query(
          `SELECT signer_role, user_id, user_name, signature_png, content_hash, row_count, signed_at
             FROM iso_form_signatures WHERE form_code = $1 AND period = $2`,
          [p.form, p.period]
        ),
      ]);
      const signatures = {};
      for (const s of sigs.rows) {
        signatures[s.signer_role] = {
          userName: s.user_name,
          signedAt: s.signed_at,
          signaturePng: s.signature_png,
          rowCount: s.row_count,
          stale: s.content_hash !== content.hash,
        };
      }
      const permissions = {};
      for (const role of Object.keys(SIGNER_ROLES)) {
        permissions[role] = { canSign: canSign(req.user, role), canRevoke: canSign(req.user, role) || req.user.role === 'ADMIN' };
      }
      res.json({ success: true, signatures, permissions, rowCount: content.rowCount });
    } catch (error) {
      console.error('[IsoSignature] 讀取失敗:', error.message);
      res.status(500).json({ success: false, error: '讀取簽核狀態失敗。' });
    }
  });

  // 簽名：同一個角色已有有效簽名時不能直接蓋過，要先撤銷；簽核後資料有異動的可以直接重簽
  router.post('/:form/:period/:role', auth.requireAuth, async (req, res) => {
    const p = parse(req, res);
    if (!p) return;
    const { role } = req.params;
    const roleDef = SIGNER_ROLES[role];
    if (!roleDef) return res.status(400).json({ success: false, error: '不支援的簽核角色。' });
    if (!canSign(req.user, role)) {
      return res.status(403).json({ success: false, error: `這個帳號沒有簽「${roleDef.label}」的權限，請管理員在權限設定裡勾選。` });
    }
    // useSaved：用自己帳號的簽名檔（伺服器自己讀，不經過用戶端）；否則用這次手寫／上傳的
    const useSaved = req.body?.useSaved === true;
    let signature = String(req.body?.signature || '');
    if (!useSaved && !validPng(signature)) {
      return res.status(400).json({ success: false, error: '簽名圖檔格式不對或太大。' });
    }
    try {
      if (useSaved) {
        const saved = await pool.query(`SELECT signature_png FROM user_signatures WHERE user_id = $1`, [req.user.id]);
        signature = saved.rows[0]?.signature_png || '';
        if (!signature) return res.status(400).json({ success: false, error: '這個帳號還沒有簽名檔，請先上傳或手寫。' });
      }
      const content = await currentContent(p.def, p.period);
      const existing = await pool.query(
        `SELECT user_name, content_hash FROM iso_form_signatures WHERE form_code = $1 AND period = $2 AND signer_role = $3`,
        [p.form, p.period, role]
      );
      const prev = existing.rows[0];
      if (prev && prev.content_hash === content.hash) {
        return res.status(409).json({ success: false, error: `${roleDef.label}已由 ${prev.user_name} 簽核；要重簽請先撤銷。` });
      }
      const userName = req.user.full_name || req.user.username;
      const r = await pool.query(
        `INSERT INTO iso_form_signatures (form_code, period, signer_role, user_id, user_name, signature_png, content_hash, row_count, signed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
         ON CONFLICT (form_code, period, signer_role) DO UPDATE SET
           user_id = EXCLUDED.user_id, user_name = EXCLUDED.user_name, signature_png = EXCLUDED.signature_png,
           content_hash = EXCLUDED.content_hash, row_count = EXCLUDED.row_count, signed_at = EXCLUDED.signed_at
         RETURNING signed_at`,
        [p.form, p.period, role, req.user.id, userName, signature, content.hash, content.rowCount]
      );
      await writeAuditLog(pool, {
        ...auditBase(req, p.form, p.period, p.def),
        actionType: 'CREATE',
        summary: `${prev ? '重新簽核' : '簽核'}${p.def.label} [${rocLabel(p.period)}]：${roleDef.label} ${userName}（共 ${content.rowCount} 列）`
          + (prev ? `，原簽核人 ${prev.user_name} 的簽名因資料異動失效` : ''),
        details: {
          form: p.form, period: p.period, role, roleLabel: roleDef.label, rowCount: content.rowCount, source: useSaved ? '簽名檔' : '手寫／上傳',
          contentHash: content.hash, ...(prev ? { replaced: { userName: prev.user_name, reason: '簽核後資料有異動' } } : {}),
        },
      });
      res.json({ success: true, signedAt: r.rows[0]?.signed_at });
    } catch (error) {
      console.error('[IsoSignature] 簽核失敗:', error.message);
      res.status(500).json({ success: false, error: '簽核失敗，請稍後再試。' });
    }
  });

  // 撤銷：有這個角色簽核權限的人或管理員
  router.delete('/:form/:period/:role', auth.requireAuth, async (req, res) => {
    const p = parse(req, res);
    if (!p) return;
    const { role } = req.params;
    const roleDef = SIGNER_ROLES[role];
    if (!roleDef) return res.status(400).json({ success: false, error: '不支援的簽核角色。' });
    if (!canSign(req.user, role) && req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: '權限不足。' });
    }
    try {
      const r = await pool.query(
        `DELETE FROM iso_form_signatures WHERE form_code = $1 AND period = $2 AND signer_role = $3 RETURNING user_name, signed_at`,
        [p.form, p.period, role]
      );
      const removed = r.rows[0];
      if (!removed) return res.status(404).json({ success: false, error: '這個月份還沒有簽核。' });
      await writeAuditLog(pool, {
        ...auditBase(req, p.form, p.period, p.def),
        actionType: 'DELETE',
        summary: `撤銷${p.def.label} [${rocLabel(p.period)}] 的${roleDef.label}簽核（原簽核人 ${removed.user_name}）`,
        details: { form: p.form, period: p.period, role, roleLabel: roleDef.label, signedBy: removed.user_name, signedAt: removed.signed_at },
      });
      res.json({ success: true });
    } catch (error) {
      console.error('[IsoSignature] 撤銷失敗:', error.message);
      res.status(500).json({ success: false, error: '撤銷失敗，請稍後再試。' });
    }
  });

  return router;
};
