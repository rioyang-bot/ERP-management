// ============================================================================
// ISO 27001 定期檢查紀錄（雙周檢視一次的表單）
// ----------------------------------------------------------------------------
//   S-409-01 備份檢查紀錄表：防火牆、Core Switch 組態檔案；正常要填最後備份日
//   S-409-02 日誌審查紀錄表：防火牆、Core Switch 的 System Log／Event Log
//
// 每次檢查新增一筆：日期（預設當天，可以改）、每個項目勾正常或異常（異常要寫說明）、檢查人員。
// 檢查人員一律取自連線階段（req.user），不接受用戶端指定，免得有人代填別人的名字。
// 修改、刪除只限檢查人員本人或管理員；修改不會換掉檢查人員。
// 新增、修改、刪除都寫事件紀錄（ISO 表單模組）。
//
// 營運總覽用 GET /latest 拿每張表最後一次的日期，超過兩週沒檢查就醒目提醒。
// 表單定義在前端 src/utils/isoPeriodicCheck.js 也有一份（部署不帶 src，伺服器不能 import），測試會比對兩邊一致。
// ============================================================================

import express from 'express';
import { writeAuditLog, clientIp } from './auditLog.js';

const ITEMS = [
  { key: 'FIREWALL', label: '防火牆' },
  { key: 'CORE_SWITCH', label: 'Core Switch' },
];

/** verb：表單上的用語（審查日期／檢查日期…）；lastBackup：正常時要填最後備份日 */
export const FORMS = {
  'S-409-01': { label: '備份檢查紀錄表', verb: '檢查', items: ITEMS, lastBackup: true },
  'S-409-02': { label: '日誌審查紀錄表', verb: '審查', items: ITEMS, lastBackup: false },
};

const STATUS_LABEL = { NORMAL: '正常', ABNORMAL: '異常' };
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_NOTE = 500;
const MAX_LAST_BACKUP = 100;

const COLUMNS = `id, form_code, to_char(check_date, 'YYYY-MM-DD') AS check_date, results, reviewer_id, reviewer_name, created_at, updated_at`;

const pad = (n) => String(n).padStart(2, '0');
const localYmd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 2026-11-11 → 115/11/11 */
const rocDate = (ymd) => {
  const m = String(ymd || '').match(DATE_RE);
  return m ? `${Number(m[1]) - 1911}/${m[2]}/${m[3]}` : String(ymd || '');
};

/**
 * 檢查日期：要是真的日期，而且不能是未來。
 * 伺服器時區可能跟使用者差一天（例如 UTC），所以多放寬一天。
 */
export const validDate = (s, now = new Date()) => {
  const m = String(s || '').match(DATE_RE);
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return false;
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return s <= localYmd(tomorrow);
};

/**
 * 檢查結果：每個項目都要勾正常或異常；異常要寫說明；備份檢查勾正常要填最後備份日。
 * @returns {{ results?: object[], error?: string }}
 */
export const normalizeResults = (def, input) => {
  const byKey = new Map((Array.isArray(input) ? input : []).filter((r) => r && typeof r === 'object').map((r) => [r.key, r]));
  const results = [];
  for (const item of def.items) {
    const r = byKey.get(item.key);
    if (!r || !STATUS_LABEL[r.status]) return { error: `請勾選「${item.label}」的${def.verb}結果（正常或異常）。` };
    const note = r.status === 'ABNORMAL' ? String(r.note ?? '').trim() : '';
    if (r.status === 'ABNORMAL' && !note) return { error: `「${item.label}」勾了異常，請填寫異常說明。` };
    if (note.length > MAX_NOTE) return { error: `「${item.label}」的異常說明太長（最多 ${MAX_NOTE} 字）。` };
    const entry = { key: item.key, status: r.status, note };
    if (def.lastBackup) {
      const lastBackup = r.status === 'NORMAL' ? String(r.lastBackup ?? '').trim() : '';
      if (r.status === 'NORMAL' && !lastBackup) return { error: `「${item.label}」勾了正常，請填寫最後備份日。` };
      if (lastBackup.length > MAX_LAST_BACKUP) return { error: `「${item.label}」的最後備份日太長（最多 ${MAX_LAST_BACKUP} 字）。` };
      entry.lastBackup = lastBackup;
    }
    results.push(entry);
  }
  return { results };
};

/** 事件紀錄的摘要：防火牆 正常（最後備份日 115/11/01）、Core Switch 異常（說明） */
export const describeResults = (def, results = []) => def.items.map((item) => {
  const r = (Array.isArray(results) ? results : []).find((x) => x.key === item.key);
  if (!r) return `${item.label} 未填`;
  const extra = r.status === 'ABNORMAL' ? r.note : (r.lastBackup ? `最後備份日 ${r.lastBackup}` : '');
  return `${item.label} ${STATUS_LABEL[r.status] || r.status}${extra ? `（${extra}）` : ''}`;
}).join('、');

const toDto = (row) => ({
  id: row.id,
  formCode: row.form_code,
  checkDate: row.check_date,
  results: Array.isArray(row.results) ? row.results : [],
  reviewerId: row.reviewer_id,
  reviewerName: row.reviewer_name,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/** 檢查人員本人或管理員才能改、刪 */
export const canManage = (user, row) => user?.role === 'ADMIN' || (row?.reviewer_id != null && row.reviewer_id === user?.id);

/**
 * @param {import('pg').Pool} pool
 * @param {ReturnType<import('./auth.js').createAuth>} auth
 */
export const createIsoPeriodicCheckRoutes = (pool, auth) => {
  const router = express.Router();

  const userName = (req) => req.user.full_name || req.user.username;

  const audit = (req, actionType, form, row, summary, details) => writeAuditLog(pool, {
    userId: req.user.id,
    userName: userName(req),
    userRole: req.user.role,
    actionType,
    module: 'ISO_FORM',
    moduleLabel: 'ISO 表單',
    targetId: `${form} #${row.id}`,
    targetName: `${FORMS[form].label} ${rocDate(row.check_date)}`,
    summary,
    details: { form, id: row.id, ...details },
    ipAddress: clientIp(req),
  });

  /** 驗證網址上的表單代號；不對就直接回 400 */
  const parseForm = (req, res) => {
    const { form } = req.params;
    if (!Object.hasOwn(FORMS, form)) { res.status(400).json({ success: false, error: '不支援的表單。' }); return null; }
    return { form, def: FORMS[form] };
  };

  /** 讀取並檢查要改、刪的那一筆；不行就直接回應並傳回 null */
  const loadOwned = async (req, res, form) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ success: false, error: '紀錄編號不正確。' }); return null; }
    const r = await pool.query(`SELECT ${COLUMNS} FROM iso_periodic_checks WHERE id = $1 AND form_code = $2`, [id, form]);
    const row = r.rows[0];
    if (!row) { res.status(404).json({ success: false, error: '找不到這筆紀錄，可能已被刪除。' }); return null; }
    if (!canManage(req.user, row)) {
      res.status(403).json({ success: false, error: `只有${FORMS[form].verb}人員（${row.reviewer_name}）本人或管理員可以修改、刪除。` });
      return null;
    }
    return row;
  };

  /** 解析新增／修改的內容；不對就直接回 400 並傳回 null */
  const parseBody = (req, res, def) => {
    const checkDate = String(req.body?.checkDate || '');
    if (!validDate(checkDate)) { res.status(400).json({ success: false, error: `${def.verb}日期不正確（不能是未來的日期）。` }); return null; }
    const { results, error } = normalizeResults(def, req.body?.results);
    if (error) { res.status(400).json({ success: false, error }); return null; }
    return { checkDate, results };
  };

  // 營運總覽用：每張表最後一次檢查。要寫在 /:form 前面，否則 latest 會被當成表單代號
  router.get('/latest', auth.requireAuth, async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT DISTINCT ON (form_code) form_code, to_char(check_date, 'YYYY-MM-DD') AS check_date, reviewer_name
           FROM iso_periodic_checks
          ORDER BY form_code, check_date DESC, id DESC`,
      );
      const byForm = new Map(r.rows.map((row) => [row.form_code, row]));
      const forms = Object.fromEntries(Object.keys(FORMS).map((code) => {
        const row = byForm.get(code);
        return [code, { lastDate: row?.check_date || null, reviewerName: row?.reviewer_name || null }];
      }));
      res.json({ success: true, forms });
    } catch (error) {
      console.error('[IsoPeriodicCheck] 讀取最後檢查日期失敗:', error.message);
      res.status(500).json({ success: false, error: '讀取最後檢查日期失敗。' });
    }
  });

  router.get('/:form', auth.requireAuth, async (req, res) => {
    const p = parseForm(req, res);
    if (!p) return undefined;
    try {
      const r = await pool.query(`SELECT ${COLUMNS} FROM iso_periodic_checks WHERE form_code = $1 ORDER BY check_date DESC, id DESC`, [p.form]);
      return res.json({ success: true, rows: r.rows.map((row) => ({ ...toDto(row), canManage: canManage(req.user, row) })) });
    } catch (error) {
      console.error('[IsoPeriodicCheck] 讀取失敗:', error.message);
      return res.status(500).json({ success: false, error: '讀取紀錄失敗。' });
    }
  });

  router.post('/:form', auth.requireAuth, async (req, res) => {
    const p = parseForm(req, res);
    if (!p) return undefined;
    const body = parseBody(req, res, p.def);
    if (!body) return undefined;
    try {
      const r = await pool.query(
        `INSERT INTO iso_periodic_checks (form_code, check_date, results, reviewer_id, reviewer_name)
         VALUES ($1, $2, $3::jsonb, $4, $5)
         RETURNING ${COLUMNS}`,
        [p.form, body.checkDate, JSON.stringify(body.results), req.user.id, userName(req)],
      );
      const row = r.rows[0];
      await audit(req, 'CREATE', p.form, row,
        `新增${p.def.label}（${rocDate(row.check_date)}）：${describeResults(p.def, body.results)}`,
        { checkDate: row.check_date, results: body.results, reviewer: row.reviewer_name });
      return res.json({ success: true, row: { ...toDto(row), canManage: true } });
    } catch (error) {
      console.error('[IsoPeriodicCheck] 新增失敗:', error.message);
      return res.status(500).json({ success: false, error: '新增紀錄失敗。' });
    }
  });

  router.put('/:form/:id', auth.requireAuth, async (req, res) => {
    const p = parseForm(req, res);
    if (!p) return undefined;
    const body = parseBody(req, res, p.def);
    if (!body) return undefined;
    try {
      const before = await loadOwned(req, res, p.form);
      if (!before) return undefined;
      const r = await pool.query(
        `UPDATE iso_periodic_checks SET check_date = $2, results = $3::jsonb, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
         RETURNING ${COLUMNS}`,
        [before.id, body.checkDate, JSON.stringify(body.results)],
      );
      const row = r.rows[0];
      if (!row) return res.status(404).json({ success: false, error: '找不到這筆紀錄，可能已被刪除。' });
      const dateChanged = before.check_date !== row.check_date;
      await audit(req, 'UPDATE', p.form, row,
        `修改${p.def.label}（${dateChanged ? `${rocDate(before.check_date)} → ` : ''}${rocDate(row.check_date)}，${p.def.verb}人員 ${row.reviewer_name}）：${describeResults(p.def, body.results)}`,
        {
          before: { checkDate: before.check_date, results: before.results },
          after: { checkDate: row.check_date, results: body.results },
          reviewer: row.reviewer_name,
        });
      return res.json({ success: true, row: { ...toDto(row), canManage: true } });
    } catch (error) {
      console.error('[IsoPeriodicCheck] 修改失敗:', error.message);
      return res.status(500).json({ success: false, error: '修改紀錄失敗。' });
    }
  });

  router.delete('/:form/:id', auth.requireAuth, async (req, res) => {
    const p = parseForm(req, res);
    if (!p) return undefined;
    try {
      const before = await loadOwned(req, res, p.form);
      if (!before) return undefined;
      const r = await pool.query('DELETE FROM iso_periodic_checks WHERE id = $1 RETURNING id', [before.id]);
      if (r.rows.length === 0) return res.status(404).json({ success: false, error: '找不到這筆紀錄，可能已被刪除。' });
      await audit(req, 'DELETE', p.form, before,
        `刪除${p.def.label}（${rocDate(before.check_date)}，${p.def.verb}人員 ${before.reviewer_name}）：${describeResults(p.def, before.results)}`,
        { checkDate: before.check_date, results: before.results, reviewer: before.reviewer_name });
      return res.json({ success: true });
    } catch (error) {
      console.error('[IsoPeriodicCheck] 刪除失敗:', error.message);
      return res.status(500).json({ success: false, error: '刪除紀錄失敗。' });
    }
  });

  return router;
};

export default createIsoPeriodicCheckRoutes;
