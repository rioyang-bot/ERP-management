// ============================================================================
// ISO 表單線上簽核
// ----------------------------------------------------------------------------
//   S-408-02 設備攜出入單：機房管理員、權責主管
//   S-408-03 機房檢查表：檢查人（任何登入帳號）、單位主管（權責主管的簽核權限）
//
// 每個月由各角色自己登入，用自己帳號的簽名檔簽核
// （簽名檔可以上傳圖檔或手寫後存下，/me/signature；沒有簽名檔也能當場手寫）。
//
// 簽的人一律取自連線階段（req.user），不接受用戶端指定，免得有人代簽別人的名字。
// 誰能簽哪個角色，看帳號權限（menu_access）裡的 isoSignRoomAdmin／isoSignSupervisor，
// 在系統管理的「權限設定」勾選；管理員角色也要勾了才能簽。
// 不需要權限的角色（檢查人）任何登入帳號都能簽，撤銷限簽的人本人或管理員。
//
// 簽名時記下當下表單內容的雜湊（由伺服器自己查、自己算）。之後內容不同
// （例如補登了這個月的出貨單），這個簽名就算「簽核後資料有異動」：
// 頁面標示出來、表單（預覽與 PDF）上不印它，要重新簽。
// ============================================================================

import express from 'express';
import crypto from 'crypto';
import { writeAuditLog, clientIp } from './auditLog.js';
import { SIGN_CONTENT_SQL as ROOM_CHECK_SQL, roomCheckHash } from './isoRoomCheckRoutes.js';

/** 簽核角色與需要的帳號權限；permission 是 null 的任何登入帳號都能簽 */
export const SIGNER_ROLES = {
  ROOM_ADMIN: { label: '機房管理員', permission: 'isoSignRoomAdmin' },
  SUPERVISOR: { label: '權責主管', permission: 'isoSignSupervisor' },
  INSPECTOR: { label: '檢查人', permission: null },
};

const ymd = (v) => {
  if (v instanceof Date) {
    const p = (n) => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  return String(v ?? '').slice(0, 10);
};

/** 設備攜出入單內容的雜湊：只看會印在表單上的欄位，順序照查詢結果 */
export const contentHash = (rows = []) => crypto.createHash('sha256')
  .update(JSON.stringify(rows.map((r) => [
    ymd(r.move_date), r.direction, r.reason, r.vendor, r.brand, r.model, r.specification, r.sn,
  ].map((v) => (v instanceof Date ? ymd(v) : String(v ?? ''))))))
  .digest('hex');

/**
 * since：表單開始使用的月份（範本 v1.0 發布日期 115/06/01），之前的月份沒有這張表單，不列入待簽提醒
 * roles：這張表單的簽核角色與表單上的稱呼（單位主管沿用權責主管的權限）
 * load(pool, namedQueries, [起日, 迄日))：這個月表單上的資料；hash：內容雜湊；dateOf：資料列的日期（待簽提醒依月份分組）
 */
export const FORMS = {
  'S-408-02': {
    label: '設備攜出入單', since: '2026-06',
    roles: { ROOM_ADMIN: '機房管理員', SUPERVISOR: '權責主管' },
    load: (pool, namedQueries, range) => pool.query(namedQueries.fetchEquipmentMovements, range),
    hash: contentHash,
    dateOf: (r) => r.move_date,
  },
  'S-408-03': {
    label: '機房檢查表', since: '2026-06',
    roles: { INSPECTOR: '檢查人', SUPERVISOR: '單位主管' },
    load: (pool, namedQueries, range) => pool.query(ROOM_CHECK_SQL, range),
    hash: roomCheckHash,
    dateOf: (r) => r.check_date,
  },
};

const PERIOD_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const PNG_RE = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;
/** 手寫簽名 600×200 的 PNG 大約幾十 KB，留一些餘裕 */
const MAX_SIGNATURE_CHARS = 400 * 1024;

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

export const canSign = (user, role) => {
  const r = SIGNER_ROLES[role];
  if (!r || !user) return false;
  return r.permission === null ? !!user.id : !!user.menu_access?.[r.permission];
};

/** 撤銷：要權限的角色＝有權限的人或管理員；不要權限的角色（檢查人）＝簽的人本人或管理員 */
export const canRevoke = (user, role, signerId) => {
  if (user?.role === 'ADMIN') return true;
  if (SIGNER_ROLES[role]?.permission === null) return signerId != null && signerId === user?.id;
  return canSign(user, role);
};

/** 從 since 到上個月（含）的每個月份；本月還沒結束，不算 */
export const monthsToRemind = (since, now = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0');
  const [sy, sm] = since.split('-').map(Number);
  const out = [];
  for (let y = sy, m = sm; y * 12 + m < now.getFullYear() * 12 + now.getMonth() + 1;) {
    out.push(`${y}-${pad(m)}`);
    if (m === 12) { y += 1; m = 1; } else { m += 1; }
  }
  return out;
};

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
    if (!Object.hasOwn(FORMS, form)) { res.status(400).json({ success: false, error: '不支援的表單。' }); return null; }
    if (!PERIOD_RE.test(period)) { res.status(400).json({ success: false, error: '月份格式應為 YYYY-MM。' }); return null; }
    return { form, period, def: FORMS[form] };
  };

  const currentContent = async (def, period) => {
    const r = await def.load(pool, namedQueries, periodRange(period));
    return { hash: def.hash(r.rows), rowCount: r.rows.length };
  };

  /** 網址上的簽核角色要是這張表單的；不對就直接回 400 */
  const parseRole = (req, res, def) => {
    const { role } = req.params;
    if (!Object.hasOwn(def.roles, role)) { res.status(400).json({ success: false, error: '不支援的簽核角色。' }); return null; }
    return { role, label: def.roles[role] };
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

  // 待簽提醒（營運總覽）：上個月（含）以前、有設備進出、還沒簽完的月份。
  // 「簽完」＝兩個角色都有簽、且簽核後資料沒有異動（與表單頁的判定相同）。
  // 整段期間只查一次，再依月份分組算雜湊；分組後的順序與單月查詢相同，雜湊一致。
  // 要放在 /:form/:period 之前，否則 pending 會被當成月份。
  router.get('/:form/pending', auth.requireAuth, async (req, res) => {
    const { form } = req.params;
    const def = Object.hasOwn(FORMS, form) ? FORMS[form] : null;
    if (!def) return res.status(400).json({ success: false, error: '不支援的表單。' });
    const months = monthsToRemind(def.since);
    if (months.length === 0) return res.json({ success: true, months: [] });
    try {
      const [start] = periodRange(months[0]);
      const [, end] = periodRange(months.at(-1));
      const [moves, sigs] = await Promise.all([
        def.load(pool, namedQueries, [start, end]),
        pool.query(
          `SELECT period, signer_role, user_name, content_hash FROM iso_form_signatures
            WHERE form_code = $1 AND period >= $2 AND period <= $3`,
          [form, months[0], months.at(-1)]
        ),
      ]);
      const byMonth = new Map();
      for (const r of moves.rows) {
        const p = ymd(def.dateOf(r)).slice(0, 7);
        if (!byMonth.has(p)) byMonth.set(p, []);
        byMonth.get(p).push(r);
      }
      const signed = new Map(sigs.rows.map((s) => [`${String(s.period).trim()}|${s.signer_role}`, s]));
      const pending = [];
      for (const period of months) {
        const rows = byMonth.get(period);
        if (!rows?.length) continue; // 沒有資料的月份不用簽
        const hash = def.hash(rows);
        const roles = Object.entries(def.roles).map(([role, label]) => {
          const s = signed.get(`${period}|${role}`);
          const status = !s ? 'MISSING' : (s.content_hash === hash ? 'SIGNED' : 'STALE');
          return { role, label, status, userName: s?.user_name || null };
        });
        if (roles.some((r) => r.status !== 'SIGNED')) {
          pending.push({ period, label: rocLabel(period), rowCount: rows.length, roles });
        }
      }
      // 最近的月份排前面
      res.json({ success: true, months: pending.reverse() });
    } catch (error) {
      console.error('[IsoSignature] 讀取待簽月份失敗:', error.message);
      res.status(500).json({ success: false, error: '讀取待簽月份失敗。' });
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
        if (!Object.hasOwn(p.def.roles, s.signer_role)) continue;
        signatures[s.signer_role] = {
          userName: s.user_name,
          signedAt: s.signed_at,
          signaturePng: s.signature_png,
          rowCount: s.row_count,
          stale: s.content_hash !== content.hash,
        };
      }
      const signerIds = new Map(sigs.rows.map((s) => [s.signer_role, s.user_id]));
      const permissions = {};
      for (const role of Object.keys(p.def.roles)) {
        permissions[role] = { canSign: canSign(req.user, role), canRevoke: canRevoke(req.user, role, signerIds.get(role)) };
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
    const roleDef = parseRole(req, res, p.def);
    if (!roleDef) return undefined;
    const { role } = roleDef;
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
    const roleDef = parseRole(req, res, p.def);
    if (!roleDef) return undefined;
    const { role } = roleDef;
    try {
      // 不要權限的角色（檢查人）看是誰簽的；其他角色看帳號權限
      let signerId = null;
      if (SIGNER_ROLES[role].permission === null && req.user.role !== 'ADMIN') {
        const cur = await pool.query(
          `SELECT user_id FROM iso_form_signatures WHERE form_code = $1 AND period = $2 AND signer_role = $3`,
          [p.form, p.period, role]
        );
        if (!cur.rows[0]) return res.status(404).json({ success: false, error: '這個月份還沒有簽核。' });
        signerId = cur.rows[0].user_id;
      }
      if (!canRevoke(req.user, role, signerId)) {
        return res.status(403).json({
          success: false,
          error: SIGNER_ROLES[role].permission === null ? `只有簽核的人本人或管理員可以撤銷${roleDef.label}簽核。` : '權限不足。',
        });
      }
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
