// ============================================================================
// ISO 27001「S-413-02 威脅情資自我檢核表」：每月上傳、檢核人線上簽核一次
// ----------------------------------------------------------------------------
// 檢核表（Word 檔）由威脅情資檢核專案每月產生，任何登入帳號都能上傳（每月 1 日）。
// 一個月一份，月份取檢核表上的檢核日期（115/11/01 → 2026-11）；
// 同月份再上傳＝替換（要帶 replace），已簽的簽名清除、要重簽。
// 刪除限上傳的人本人或管理員。
//
// 檢核人：任何登入帳號都能簽（簽的人取自連線階段，不能代簽），一份只簽一次，
//   有人簽了就算當月結案；要換人簽得先撤銷（限簽的人本人或管理員）。
// 下載：把簽名與簽核日期填進原檔「檢核人（簽章）」那一行（server/threatIntelDocx.js），其他內容原封不動。
//
// 營運總覽用 GET /latest：每月 2 日起本月還沒上傳＝紅色提醒、已上傳沒簽＝黃色提醒
// （判斷在前端 src/utils/isoThreatIntel.js）。
// 上傳、替換、刪除、簽核、撤銷都寫事件紀錄（ISO 表單模組）。
// ============================================================================

import express from 'express';
import crypto from 'crypto';
import { writeAuditLog, clientIp } from './auditLog.js';
import { parseChecklistDocx, signChecklistDocx, ChecklistFormatError } from './threatIntelDocx.js';

export const FORM_CODE = 'S-413-02';
export const FORM_LABEL = '威脅情資自我檢核表';
/** 單檔上限：檢核表通常一兩百 KB（base64 後還要放得進 5 MB 的 JSON 請求） */
export const MAX_FILE_BYTES = 3 * 1024 * 1024;

const PERIOD_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const PNG_RE = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;
const MAX_SIGNATURE_CHARS = 400 * 1024;
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** 刪除：上傳的人本人或管理員 */
export const canDelete = (user, row) => user?.role === 'ADMIN' || (row?.uploaded_by != null && row.uploaded_by === user?.id);
/** 撤銷簽核：簽的人本人或管理員 */
export const canRevoke = (user, row) => !!row?.signed_by_name && (user?.role === 'ADMIN' || (row.signed_by != null && row.signed_by === user?.id));

/** 2026-11 → 115年11月 */
export const rocMonth = (period) => `${Number(period.slice(0, 4)) - 1911}年${period.slice(5, 7)}月`;
/** 2026-11-01 → 115/11/01 */
const rocDate = (ymd) => {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[1]) - 1911}/${m[2]}/${m[3]}` : String(ymd || '');
};
const pad = (n) => String(n).padStart(2, '0');
const ymd = (v) => {
  if (v instanceof Date) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  return String(v ?? '').slice(0, 10);
};
const currentPeriod = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;

/** 列的標題（事件紀錄用）：檢核項目第一行，太長就截斷 */
export const rowTitle = (row) => {
  const first = String(row?.item || '').split('\n')[0].trim();
  return first.length > 40 ? `${first.slice(0, 40)}…` : first;
};

/** 檔名只留檔名本身、去掉不合法字元、限制長度，副檔名一律 .docx */
export const safeFileName = (name) => {
  const base = [...String(name || '').split(/[\\/]/).pop()].filter((ch) => ch.charCodeAt(0) >= 32 && !'<>:"|?*'.includes(ch)).join('').trim();
  const stem = base.replace(/\.docx$/i, '').slice(0, 200) || `${FORM_CODE}${FORM_LABEL}`;
  return `${stem}.docx`;
};

/** 上傳的檔案：base64 → Buffer；格式不對或太大就回錯誤訊息 */
export const decodeUpload = (body = {}) => {
  const b64 = String(body.fileBase64 || '').replace(/^data:[^,]*,/, '');
  if (!b64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return { error: '請選擇要上傳的檢核表（.docx）。' };
  const buffer = Buffer.from(b64, 'base64');
  if (buffer.length === 0) return { error: '請選擇要上傳的檢核表（.docx）。' };
  if (buffer.length > MAX_FILE_BYTES) return { error: `檔案太大（上限 ${MAX_FILE_BYTES / 1024 / 1024} MB）。` };
  if (!/\.docx$/i.test(String(body.fileName || ''))) return { error: '只能上傳 Word（.docx）檔。' };
  return { buffer, fileName: safeFileName(body.fileName) };
};

const META_COLUMNS = `id, period, to_char(check_date, 'YYYY-MM-DD') AS check_date, file_name, file_size, file_hash, rows,
  uploaded_by, uploaded_by_name, uploaded_at, signed_by, signed_by_name, signature_png, signed_at, updated_at`;

/**
 * @param {import('pg').Pool} pool
 * @param {ReturnType<import('./auth.js').createAuth>} auth
 * @param {{ now?: () => Date }} [opts] 測試用
 */
export const createIsoThreatIntelRoutes = (pool, auth, { now = () => new Date() } = {}) => {
  const router = express.Router();

  const userName = (req) => req.user.full_name || req.user.username;

  const audit = (req, actionType, checklist, summary, details) => {
    const period = String(checklist.period).trim();
    return writeAuditLog(pool, {
      userId: req.user.id,
      userName: userName(req),
      userRole: req.user.role,
      actionType,
      module: 'ISO_FORM',
      moduleLabel: 'ISO 表單',
      targetId: `${FORM_CODE} ${period}`,
      targetName: `${FORM_LABEL} ${rocMonth(period)}`,
      summary,
      details: { form: FORM_CODE, period, id: checklist.id, ...details },
      ipAddress: clientIp(req),
    });
  };

  const loadById = async (req, res, columns = META_COLUMNS) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ success: false, error: '檢核表編號不正確。' }); return null; }
    const r = await pool.query(`SELECT ${columns} FROM iso_threat_checklists WHERE id = $1`, [id]);
    if (!r.rows[0]) { res.status(404).json({ success: false, error: '找不到這份檢核表，可能已被刪除。' }); return null; }
    return r.rows[0];
  };

  const summaryOf = (row) => ({
    id: row.id,
    period: String(row.period).trim(),
    checkDate: ymd(row.check_date),
    fileName: row.file_name,
    fileSize: Number(row.file_size),
    rowCount: Array.isArray(row.rows) ? row.rows.length : 0,
    uploadedByName: row.uploaded_by_name,
    uploadedAt: row.uploaded_at,
    signedByName: row.signed_by_name || null,
    signedAt: row.signed_at || null,
  });

  const signatureSummary = (row) => (row.signed_by_name ? `；原檢核人 ${row.signed_by_name} 的簽核一併清除` : '');

  // 營運總覽用：最新一份（月份最大），含上傳與簽核狀態。要寫在 /:period 前面
  router.get('/latest', auth.requireAuth, async (req, res) => {
    try {
      const r = await pool.query(`SELECT ${META_COLUMNS} FROM iso_threat_checklists ORDER BY period DESC LIMIT 1`);
      const row = r.rows[0];
      return res.json({ success: true, latest: row ? summaryOf(row) : null });
    } catch (error) {
      console.error('[IsoThreatIntel] 讀取最新檢核表失敗:', error.message);
      return res.status(500).json({ success: false, error: '讀取威脅情資自我檢核表失敗。' });
    }
  });

  // 下載：簽名填進「檢核人（簽章）」那一行的 Word 檔
  router.get('/:id/download', auth.requireAuth, async (req, res) => {
    try {
      const row = await loadById(req, res, `${META_COLUMNS}, file_data`);
      if (!row) return undefined;
      const out = await signChecklistDocx(row.file_data, { signaturePng: row.signature_png, signedDate: row.signed_at ? ymd(new Date(row.signed_at)) : '' });
      res.setHeader('Content-Type', DOCX_MIME);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(row.file_name)}"; filename*=UTF-8''${encodeURIComponent(row.file_name)}`);
      return res.send(out);
    } catch (error) {
      console.error('[IsoThreatIntel] 下載失敗:', error.message);
      return res.status(500).json({ success: false, error: '產生檢核表失敗。' });
    }
  });

  // 這個月的檢核表：各列、檢核人簽核、自己能做什麼
  router.get('/:period', auth.requireAuth, async (req, res) => {
    const { period } = req.params;
    if (!PERIOD_RE.test(period)) return res.status(400).json({ success: false, error: '月份格式應為 YYYY-MM。' });
    try {
      const r = await pool.query(`SELECT ${META_COLUMNS} FROM iso_threat_checklists WHERE period = $1`, [period]);
      const row = r.rows[0];
      if (!row) return res.json({ success: true, checklist: null });
      return res.json({
        success: true,
        checklist: {
          ...summaryOf(row),
          rows: Array.isArray(row.rows) ? row.rows : [],
          signaturePng: row.signature_png || null,
          canDelete: canDelete(req.user, row),
          canRevoke: canRevoke(req.user, row),
        },
      });
    } catch (error) {
      console.error('[IsoThreatIntel] 讀取失敗:', error.message);
      return res.status(500).json({ success: false, error: '讀取威脅情資自我檢核表失敗。' });
    }
  });

  // 上傳（同月份已有 → 409，帶 replace: true 才替換；替換會清掉簽核）
  router.post('/', auth.requireAuth, async (req, res) => {
    const { buffer, fileName, error } = decodeUpload(req.body || {});
    if (error) return res.status(400).json({ success: false, error });
    let parsed;
    try {
      parsed = await parseChecklistDocx(buffer);
    } catch (err) {
      if (err instanceof ChecklistFormatError) return res.status(400).json({ success: false, error: err.message });
      console.error('[IsoThreatIntel] 解析失敗:', err.message);
      return res.status(400).json({ success: false, error: '讀不出檢核表內容，請確認檔案是威脅情資自我檢核表的 Word 檔。' });
    }
    if (parsed.period > currentPeriod(now())) {
      return res.status(400).json({ success: false, error: `檢核表的檢核日期是 ${rocDate(parsed.checkDate)}，還沒到那個月份，請確認檔案。` });
    }
    const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
    const rowsJson = JSON.stringify(parsed.rows);
    const rowList = parsed.rows.map((x) => ({ no: x.no, title: rowTitle(x), applicable: x.applicable, update: x.update }));
    try {
      const existing = (await pool.query(`SELECT ${META_COLUMNS} FROM iso_threat_checklists WHERE period = $1`, [parsed.period])).rows[0];
      if (existing && req.body?.replace !== true) {
        return res.status(409).json({
          success: false, exists: true, period: parsed.period, fileName: existing.file_name, signedByName: existing.signed_by_name || null,
          error: `${rocMonth(parsed.period)}已經有檢核表（${existing.file_name}）。`,
        });
      }

      if (!existing) {
        const r = await pool.query(
          `INSERT INTO iso_threat_checklists (period, check_date, file_name, file_data, file_size, file_hash, rows, uploaded_by, uploaded_by_name)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
           RETURNING ${META_COLUMNS}`,
          [parsed.period, parsed.checkDate, fileName, buffer, buffer.length, fileHash, rowsJson, req.user.id, userName(req)],
        );
        const row = r.rows[0];
        await audit(req, 'CREATE', row,
          `上傳${FORM_LABEL} [${rocMonth(parsed.period)}]：${fileName}（檢核日期 ${rocDate(parsed.checkDate)}，共 ${parsed.rows.length} 列）`,
          { fileName, fileSize: buffer.length, fileHash, checkDate: parsed.checkDate, rows: rowList });
        return res.json({ success: true, checklist: summaryOf(row) });
      }

      // 替換：檔案換了，原本的簽核不算數
      const r = await pool.query(
        `UPDATE iso_threat_checklists SET check_date = $2, file_name = $3, file_data = $4, file_size = $5, file_hash = $6, rows = $7::jsonb,
           uploaded_by = $8, uploaded_by_name = $9, uploaded_at = CURRENT_TIMESTAMP,
           signed_by = NULL, signed_by_name = NULL, signature_png = NULL, signed_at = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING ${META_COLUMNS}`,
        [existing.id, parsed.checkDate, fileName, buffer, buffer.length, fileHash, rowsJson, req.user.id, userName(req)],
      );
      const row = r.rows[0];
      await audit(req, 'UPDATE', row,
        `替換${FORM_LABEL} [${rocMonth(parsed.period)}]：${existing.file_name} → ${fileName}（檢核日期 ${rocDate(parsed.checkDate)}，共 ${parsed.rows.length} 列${signatureSummary(existing)}）`,
        {
          before: { fileName: existing.file_name, fileHash: existing.file_hash, uploadedByName: existing.uploaded_by_name, signedByName: existing.signed_by_name || null, signedAt: existing.signed_at || null },
          after: { fileName, fileHash, checkDate: parsed.checkDate, rows: rowList },
        });
      return res.json({ success: true, checklist: summaryOf(row), clearedSignature: !!existing.signed_by_name });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ success: false, exists: true, period: parsed.period, error: `${rocMonth(parsed.period)}已經有檢核表，請重新整理後再試。` });
      console.error('[IsoThreatIntel] 上傳失敗:', err.message);
      return res.status(500).json({ success: false, error: '上傳檢核表失敗。' });
    }
  });

  // 刪除：上傳的人本人或管理員
  router.delete('/:id', auth.requireAuth, async (req, res) => {
    try {
      const row = await loadById(req, res);
      if (!row) return undefined;
      if (!canDelete(req.user, row)) {
        return res.status(403).json({ success: false, error: `只有上傳的人（${row.uploaded_by_name}）本人或管理員可以刪除。` });
      }
      await pool.query(`DELETE FROM iso_threat_checklists WHERE id = $1`, [row.id]);
      const period = String(row.period).trim();
      await audit(req, 'DELETE', row,
        `刪除${FORM_LABEL} [${rocMonth(period)}]：${row.file_name}（上傳者 ${row.uploaded_by_name}${signatureSummary(row)}）`,
        { before: { fileName: row.file_name, fileHash: row.file_hash, checkDate: ymd(row.check_date), uploadedByName: row.uploaded_by_name, signedByName: row.signed_by_name || null, signedAt: row.signed_at || null } });
      return res.json({ success: true });
    } catch (error) {
      console.error('[IsoThreatIntel] 刪除失敗:', error.message);
      return res.status(500).json({ success: false, error: '刪除檢核表失敗。' });
    }
  });

  // 檢核人簽核：任何帳號都能簽，一份只簽一次；useSaved 用自己帳號的簽名檔，否則用 body.signature
  router.post('/:id/sign', auth.requireAuth, async (req, res) => {
    const useSaved = req.body?.useSaved === true;
    let signature = String(req.body?.signature || '');
    if (!useSaved && !(PNG_RE.test(signature) && signature.length <= MAX_SIGNATURE_CHARS)) {
      return res.status(400).json({ success: false, error: '簽名圖檔格式不對或太大。' });
    }
    try {
      const row = await loadById(req, res);
      if (!row) return undefined;
      if (row.signed_by_name) return res.status(409).json({ success: false, error: `已由 ${row.signed_by_name} 簽核；要換人簽請先撤銷。` });
      if (useSaved) {
        const saved = await pool.query(`SELECT signature_png FROM user_signatures WHERE user_id = $1`, [req.user.id]);
        signature = saved.rows[0]?.signature_png || '';
        if (!signature) return res.status(400).json({ success: false, error: '這個帳號還沒有簽名檔，請先上傳或手寫。' });
      }
      const name = userName(req);
      // 只在還沒人簽時寫入（兩個人同時按也只會有一個成功）
      const r = await pool.query(
        `UPDATE iso_threat_checklists SET signed_by = $2, signed_by_name = $3, signature_png = $4, signed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND signed_by_name IS NULL
         RETURNING signed_at`,
        [row.id, req.user.id, name, signature],
      );
      if (r.rowCount === 0) return res.status(409).json({ success: false, error: '剛剛已經有人簽核了，請重新整理。' });
      await audit(req, 'CREATE', row,
        `簽核${FORM_LABEL} [${rocMonth(String(row.period).trim())}]：檢核人 ${name}（${row.file_name}，共 ${Array.isArray(row.rows) ? row.rows.length : 0} 列）`,
        { signer: name, fileName: row.file_name, fileHash: row.file_hash, source: useSaved ? '簽名檔' : '手寫／上傳' });
      return res.json({ success: true, signedAt: r.rows[0]?.signed_at });
    } catch (error) {
      console.error('[IsoThreatIntel] 簽核失敗:', error.message);
      return res.status(500).json({ success: false, error: '簽核失敗，請稍後再試。' });
    }
  });

  // 撤銷簽核：簽的人本人或管理員
  router.delete('/:id/sign', auth.requireAuth, async (req, res) => {
    try {
      const row = await loadById(req, res);
      if (!row) return undefined;
      if (!row.signed_by_name) return res.status(404).json({ success: false, error: '這份檢核表還沒有簽核。' });
      if (!canRevoke(req.user, row)) return res.status(403).json({ success: false, error: '只有簽核的人本人或管理員可以撤銷。' });
      await pool.query(
        `UPDATE iso_threat_checklists SET signed_by = NULL, signed_by_name = NULL, signature_png = NULL, signed_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [row.id],
      );
      await audit(req, 'DELETE', row,
        `撤銷${FORM_LABEL} [${rocMonth(String(row.period).trim())}] 的檢核人簽核（原檢核人 ${row.signed_by_name}）`,
        { signedBy: row.signed_by_name, signedAt: row.signed_at });
      return res.json({ success: true });
    } catch (error) {
      console.error('[IsoThreatIntel] 撤銷失敗:', error.message);
      return res.status(500).json({ success: false, error: '撤銷簽核失敗。' });
    }
  });

  return router;
};
