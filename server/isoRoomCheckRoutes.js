// ============================================================================
// ISO 27001「S-408-03 機房檢查表」：每週檢查一次，一個月一張表
// ----------------------------------------------------------------------------
// 每次檢查新增一筆：日期與時間、機房溫度、相對溼度，
// 監視設備／門禁管理／設備管理／機房環境各勾正常（V）或異常（ｘ）。
// 有異常（任一項勾異常，或溫度、溼度超出管制範圍）就要寫說明與處理方式，
// 表單的「異常狀況說明」欄會印出日期時間、說明、處理方式。
//
// 依日期排到這個月的第幾周（1～7 日第一周、8～14 日第二周…29 日以後第五周），
// 同一周只能有一筆（資料庫 UNIQUE (period, week_no)）。
//
// 填寫人取自連線階段（req.user），只記在事件紀錄與這筆資料裡，不印在表單上；
// 修改、刪除限填寫人本人或管理員。
// 檢查人、單位主管每月線上簽核一次（server/isoSignatureRoutes.js），
// 簽核後這個月的紀錄有異動，簽名就失效要重簽（roomCheckHash）。
//
// 營運總覽用 GET /latest 拿最後一次檢查，超過 7 天沒檢查就醒目提醒。
// 項目定義在前端 src/utils/isoRoomCheck.js 也有一份（部署不帶 src，伺服器不能 import），測試會比對兩邊一致。
// ============================================================================

import express from 'express';
import crypto from 'crypto';
import { writeAuditLog, clientIp } from './auditLog.js';
import { validDate } from './isoPeriodicCheckRoutes.js';

export const FORM_CODE = 'S-408-03';
export const FORM_LABEL = '機房檢查表';

/** 打勾的項目（溫度、溼度另外填數字） */
export const ITEMS = [
  { key: 'CCTV', label: '監視設備' },
  { key: 'ACCESS', label: '門禁管理' },
  { key: 'EQUIPMENT', label: '設備管理' },
  { key: 'ENVIRONMENT', label: '機房環境' },
];

/** 管制範圍（範本：機房溫度 15 至 26℃、相對溼度 40% 至 80%），超出就算異常 */
export const TEMP_RANGE = { min: 15, max: 26 };
export const HUMIDITY_RANGE = { min: 40, max: 80 };
/** 能輸入的數值範圍（防打錯） */
const TEMP_LIMIT = { min: -20, max: 60 };
const HUMIDITY_LIMIT = { min: 0, max: 100 };

const STATUS_LABEL = { NORMAL: '正常', ABNORMAL: '異常' };
const PERIOD_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const MAX_TEXT = 100;
const WEEK_LABEL = ['', '第一周', '第二周', '第三周', '第四周', '第五周'];

const COLUMNS = `id, to_char(check_date, 'YYYY-MM-DD') AS check_date, to_char(check_time, 'HH24:MI') AS check_time,
  period, week_no, temperature, humidity, results, abnormal_note, abnormal_action, created_by, created_by_name, created_at, updated_at`;

/** 簽核用：這個月的紀錄（只取會印在表單上的欄位），順序固定 */
export const SIGN_CONTENT_SQL = `SELECT to_char(check_date, 'YYYY-MM-DD') AS check_date, to_char(check_time, 'HH24:MI') AS check_time,
  temperature, humidity, results, abnormal_note, abnormal_action
  FROM iso_room_checks WHERE check_date >= $1 AND check_date < $2 ORDER BY check_date, check_time, id`;

/** 1～7 日第一周、8～14 日第二周…29 日以後第五周 */
export const weekOf = (ymd) => Math.min(5, Math.ceil(Number(String(ymd).slice(8, 10)) / 7));

const num1 = (v) => (v === null || v === undefined || v === '' ? '' : Number(v).toFixed(1).replace(/\.0$/, ''));

/** 2026-11-10 → 115/11/10 */
const rocDate = (ymd) => {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[1]) - 1911}/${m[2]}/${m[3]}` : String(ymd || '');
};

/** 2026-11 → 115年11月 */
const rocMonth = (period) => `${Number(period.slice(0, 4)) - 1911}年${period.slice(5, 7)}月`;

/** 表單內容的雜湊：只看會印在表單上的欄位（簽核用，見 isoSignatureRoutes.js） */
export const roomCheckHash = (rows = []) => crypto.createHash('sha256')
  .update(JSON.stringify(rows.map((r) => [
    String(r.check_date ?? '').slice(0, 10), String(r.check_time ?? '').slice(0, 5), num1(r.temperature), num1(r.humidity),
    ...ITEMS.map((i) => r.results?.[i.key] || ''), r.abnormal_note || '', r.abnormal_action || '',
  ])))
  .digest('hex');

/** 這筆有沒有異常：任一項勾異常，或溫度、溼度超出管制範圍 */
export const isAbnormal = ({ temperature, humidity, results }) => (
  ITEMS.some((i) => results?.[i.key] === 'ABNORMAL')
  || temperature < TEMP_RANGE.min || temperature > TEMP_RANGE.max
  || humidity < HUMIDITY_RANGE.min || humidity > HUMIDITY_RANGE.max
);

/** 數字欄位：最多一位小數，在可輸入範圍內 */
const parseNumber = (v, limit) => {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < limit.min || n > limit.max) return null;
  return Math.round(n * 10) / 10;
};

/**
 * 檢查新增／修改的內容
 * @returns {{ value?: object, error?: string }}
 */
export const normalizeCheck = (body = {}, now = new Date()) => {
  const checkDate = String(body.checkDate || '');
  if (!validDate(checkDate, now)) return { error: '檢查日期不正確（不能是未來的日期）。' };
  const checkTime = String(body.checkTime || '');
  if (!TIME_RE.test(checkTime)) return { error: '請填寫檢查時間（時:分）。' };
  const temperature = parseNumber(body.temperature, TEMP_LIMIT);
  if (temperature === null) return { error: `請填寫機房溫度（${TEMP_LIMIT.min}～${TEMP_LIMIT.max}℃）。` };
  const humidity = parseNumber(body.humidity, HUMIDITY_LIMIT);
  if (humidity === null) return { error: `請填寫相對溼度（${HUMIDITY_LIMIT.min}～${HUMIDITY_LIMIT.max}%）。` };
  const input = body.results && typeof body.results === 'object' ? body.results : {};
  const results = {};
  for (const item of ITEMS) {
    if (!STATUS_LABEL[input[item.key]]) return { error: `請勾選「${item.label}」的檢查結果（正常或異常）。` };
    results[item.key] = input[item.key];
  }
  const value = { checkDate, checkTime, temperature, humidity, results, abnormalNote: '', abnormalAction: '' };
  if (isAbnormal(value)) {
    value.abnormalNote = String(body.abnormalNote ?? '').trim();
    value.abnormalAction = String(body.abnormalAction ?? '').trim();
    if (!value.abnormalNote) return { error: '有異常（勾了異常，或溫度、溼度超出管制範圍），請填寫異常說明。' };
    if (!value.abnormalAction) return { error: '有異常，請填寫處理方式。' };
    if (value.abnormalNote.length > MAX_TEXT) return { error: `異常說明太長（最多 ${MAX_TEXT} 字）。` };
    if (value.abnormalAction.length > MAX_TEXT) return { error: `處理方式太長（最多 ${MAX_TEXT} 字）。` };
  }
  return { value: { ...value, period: checkDate.slice(0, 7), weekNo: weekOf(checkDate) } };
};

/** 事件紀錄的摘要：溫度 22.5℃、溼度 55%、監視設備 正常…；說明：…；處理方式：… */
export const describeCheck = (c) => {
  const parts = [`溫度 ${num1(c.temperature)}℃`, `溼度 ${num1(c.humidity)}%`, ...ITEMS.map((i) => `${i.label} ${STATUS_LABEL[c.results?.[i.key]] || '未填'}`)];
  let s = parts.join('、');
  if (c.abnormalNote) s += `；說明：${c.abnormalNote}；處理方式：${c.abnormalAction}`;
  return s;
};

const toDto = (row) => ({
  id: row.id,
  checkDate: row.check_date,
  checkTime: row.check_time,
  period: String(row.period || '').trim(),
  weekNo: Number(row.week_no),
  temperature: Number(row.temperature),
  humidity: Number(row.humidity),
  results: row.results && typeof row.results === 'object' ? row.results : {},
  abnormalNote: row.abnormal_note || '',
  abnormalAction: row.abnormal_action || '',
  createdByName: row.created_by_name,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/** 填寫人本人或管理員才能改、刪 */
export const canManage = (user, row) => user?.role === 'ADMIN' || (row?.created_by != null && row.created_by === user?.id);

/**
 * @param {import('pg').Pool} pool
 * @param {ReturnType<import('./auth.js').createAuth>} auth
 */
export const createIsoRoomCheckRoutes = (pool, auth) => {
  const router = express.Router();

  const userName = (req) => req.user.full_name || req.user.username;

  const stamp = (row) => `${rocDate(row.check_date)} ${row.check_time}，${WEEK_LABEL[row.week_no] || ''}`;

  const audit = (req, actionType, row, summary, details) => writeAuditLog(pool, {
    userId: req.user.id,
    userName: userName(req),
    userRole: req.user.role,
    actionType,
    module: 'ISO_FORM',
    moduleLabel: 'ISO 表單',
    targetId: `${FORM_CODE} #${row.id}`,
    targetName: `${FORM_LABEL} ${rocDate(row.check_date)}`,
    summary,
    details: { form: FORM_CODE, id: row.id, ...details },
    ipAddress: clientIp(req),
  });

  const snapshot = (row) => ({
    checkDate: row.check_date, checkTime: row.check_time, weekNo: Number(row.week_no),
    temperature: Number(row.temperature), humidity: Number(row.humidity), results: row.results,
    abnormalNote: row.abnormal_note || '', abnormalAction: row.abnormal_action || '',
  });

  /** 同一周已經有紀錄（UNIQUE 衝突）→ 409 */
  const duplicateWeek = (res, value) => res.status(409).json({
    success: false,
    error: `${rocMonth(value.period)}${WEEK_LABEL[value.weekNo]}已經有檢查紀錄（每週一筆），請改那一筆或換日期。`,
  });

  const parseBody = (req, res) => {
    const { value, error } = normalizeCheck(req.body || {});
    if (error) { res.status(400).json({ success: false, error }); return null; }
    return value;
  };

  const loadOwned = async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ success: false, error: '紀錄編號不正確。' }); return null; }
    const r = await pool.query(`SELECT ${COLUMNS} FROM iso_room_checks WHERE id = $1`, [id]);
    const row = r.rows[0];
    if (!row) { res.status(404).json({ success: false, error: '找不到這筆紀錄，可能已被刪除。' }); return null; }
    if (!canManage(req.user, row)) {
      res.status(403).json({ success: false, error: `只有填寫人（${row.created_by_name}）本人或管理員可以修改、刪除。` });
      return null;
    }
    return row;
  };

  // 營運總覽用：最後一次檢查。要寫在 /:period 前面
  router.get('/latest', auth.requireAuth, async (req, res) => {
    try {
      const r = await pool.query(`SELECT ${COLUMNS} FROM iso_room_checks ORDER BY check_date DESC, check_time DESC, id DESC LIMIT 1`);
      const row = r.rows[0];
      res.json({ success: true, lastDate: row?.check_date || null, lastTime: row?.check_time || null, userName: row?.created_by_name || null });
    } catch (error) {
      console.error('[IsoRoomCheck] 讀取最後檢查失敗:', error.message);
      res.status(500).json({ success: false, error: '讀取最後檢查日期失敗。' });
    }
  });

  // 這個月的紀錄
  router.get('/:period', auth.requireAuth, async (req, res) => {
    const { period } = req.params;
    if (!PERIOD_RE.test(period)) return res.status(400).json({ success: false, error: '月份格式應為 YYYY-MM。' });
    try {
      const r = await pool.query(`SELECT ${COLUMNS} FROM iso_room_checks WHERE period = $1 ORDER BY week_no, id`, [period]);
      return res.json({ success: true, rows: r.rows.map((row) => ({ ...toDto(row), canManage: canManage(req.user, row) })) });
    } catch (error) {
      console.error('[IsoRoomCheck] 讀取失敗:', error.message);
      return res.status(500).json({ success: false, error: '讀取檢查紀錄失敗。' });
    }
  });

  router.post('/', auth.requireAuth, async (req, res) => {
    const v = parseBody(req, res);
    if (!v) return undefined;
    try {
      const r = await pool.query(
        `INSERT INTO iso_room_checks (check_date, check_time, period, week_no, temperature, humidity, results, abnormal_note, abnormal_action, created_by, created_by_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11)
         RETURNING ${COLUMNS}`,
        [v.checkDate, v.checkTime, v.period, v.weekNo, v.temperature, v.humidity, JSON.stringify(v.results), v.abnormalNote, v.abnormalAction, req.user.id, userName(req)],
      );
      const row = r.rows[0];
      await audit(req, 'CREATE', row, `新增${FORM_LABEL}（${stamp(row)}）：${describeCheck(v)}`, { after: snapshot(row) });
      return res.json({ success: true, row: { ...toDto(row), canManage: true } });
    } catch (error) {
      if (error.code === '23505') return duplicateWeek(res, v);
      console.error('[IsoRoomCheck] 新增失敗:', error.message);
      return res.status(500).json({ success: false, error: '新增紀錄失敗。' });
    }
  });

  // 修改：填寫人不會換掉
  router.put('/:id', auth.requireAuth, async (req, res) => {
    const v = parseBody(req, res);
    if (!v) return undefined;
    try {
      const before = await loadOwned(req, res);
      if (!before) return undefined;
      const r = await pool.query(
        `UPDATE iso_room_checks SET check_date = $2, check_time = $3, period = $4, week_no = $5, temperature = $6, humidity = $7,
           results = $8::jsonb, abnormal_note = $9, abnormal_action = $10, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING ${COLUMNS}`,
        [before.id, v.checkDate, v.checkTime, v.period, v.weekNo, v.temperature, v.humidity, JSON.stringify(v.results), v.abnormalNote, v.abnormalAction],
      );
      const row = r.rows[0];
      const moved = before.check_date !== row.check_date || before.check_time !== row.check_time ? `${stamp(before)} → ` : '';
      await audit(req, 'UPDATE', row, `修改${FORM_LABEL}（${moved}${stamp(row)}，填寫人 ${row.created_by_name}）：${describeCheck(v)}`,
        { before: snapshot(before), after: snapshot(row) });
      return res.json({ success: true, row: { ...toDto(row), canManage: true } });
    } catch (error) {
      if (error.code === '23505') return duplicateWeek(res, v);
      console.error('[IsoRoomCheck] 修改失敗:', error.message);
      return res.status(500).json({ success: false, error: '修改紀錄失敗。' });
    }
  });

  router.delete('/:id', auth.requireAuth, async (req, res) => {
    try {
      const row = await loadOwned(req, res);
      if (!row) return undefined;
      await pool.query(`DELETE FROM iso_room_checks WHERE id = $1`, [row.id]);
      const snap = snapshot(row);
      await audit(req, 'DELETE', row, `刪除${FORM_LABEL}（${stamp(row)}，填寫人 ${row.created_by_name}）：${describeCheck(snap)}`, { before: snap });
      return res.json({ success: true });
    } catch (error) {
      console.error('[IsoRoomCheck] 刪除失敗:', error.message);
      return res.status(500).json({ success: false, error: '刪除紀錄失敗。' });
    }
  });

  return router;
};
