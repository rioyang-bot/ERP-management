import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAuthRoutes } from '../../server/authRoutes.js';

// bcrypt 實際算雜湊會拖垮測試（單次就超過逾時），而這裡要驗的是「有沒有寫紀錄」，
// 不是雜湊本身。密碼對不對改用一個固定字串判斷。
vi.mock('../../server/auth.js', () => ({
  hashPassword: async () => 'hashed',
  verifyPassword: async (plain) => ({ ok: plain === 'right-password', needsUpgrade: false }),
}));
import { MODULE_MAP, ACTION_TYPES } from '../utils/auditLogger';

/**
 * 登入、登入失敗與登出的事件紀錄
 *
 * 這三件事前端寫不了：登入失敗當下根本還沒有連線階段，來源 IP 也只有伺服器拿得到。
 * 先前的結果是系統裡誰什麼時候登入過、有沒有人在猜帳號，完全查不到。
 *
 * 這裡直接把路由掛起來跑，檢查真的有一筆寫進 system_audit_logs。
 */

/** 收集 pool.query 的呼叫，並依 SQL 決定回傳什麼 */
const makePool = ({ user = null } = {}) => {
  const calls = [];
  const query = vi.fn(async (sql, params) => {
    calls.push({ sql, params });
    if (/FROM users WHERE LOWER\(username\)/.test(sql)) {
      return { rows: user ? [user] : [] };
    }
    return { rows: [] };
  });
  return { pool: { query }, calls };
};

const auditRows = (calls) => calls.filter((c) => /INSERT INTO system_audit_logs/.test(c.sql));

/** 取出路由處理函式：createAuthRoutes 回傳的是 express router */
const handlerFor = (router, method, path) => {
  const layer = router.stack.find((l) => l.route?.path === path && l.route?.methods?.[method]);
  if (!layer) throw new Error(`找不到路由 ${method.toUpperCase()} ${path}`);
  // 最後一個才是真正的處理函式，前面可能是 requireAuth 之類的中介層
  return layer.route.stack.at(-1).handle;
};

const makeRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  return res;
};

const makeReq = (over = {}) => ({
  body: {},
  ip: '192.168.100.55',
  get: (h) => (h.toLowerCase() === 'user-agent' ? 'vitest' : undefined),
  ...over,
});

const auth = {
  createSession: vi.fn(async () => ({ token: 'tok', expiresAt: new Date() })),
  destroySession: vi.fn(async () => {}),
  requireAuth: (req, res, next) => next(),
  requireRole: () => (req, res, next) => next(),
};

describe('登入與登出留下事件紀錄', () => {
  beforeEach(() => vi.clearAllMocks());

  it('帳號不存在時記下一筆登入失敗', async () => {
    const { pool, calls } = makePool({ user: null });
    const router = createAuthRoutes(pool, auth);
    const res = makeRes();
    await handlerFor(router, 'post', '/login')(makeReq({ body: { username: 'ghost', password: 'x' } }), res);

    expect(res.statusCode).toBe(401);
    const rows = auditRows(calls);
    expect(rows).toHaveLength(1);
    expect(rows[0].params[3]).toBe('LOGIN_FAILED');
    expect(rows[0].params[8]).toContain('ghost');
    // 對外的訊息不分辨帳號是否存在，紀錄裡才分得出來
    expect(res.body.error).toBe('帳號或密碼錯誤。');
    expect(JSON.parse(rows[0].params[9]).reason).toBe('NO_SUCH_USER');
  });

  it('密碼錯誤時記下一筆登入失敗，並記得是哪個帳號', async () => {
    const { pool, calls } = makePool({
      user: { id: 9, username: 'rio', role: 'ADMIN', full_name: '楊先生', password_hash: 'bad-hash' },
    });
    const router = createAuthRoutes(pool, auth);
    const res = makeRes();
    await handlerFor(router, 'post', '/login')(makeReq({ body: { username: 'rio', password: 'wrong' } }), res);

    expect(res.statusCode).toBe(401);
    const rows = auditRows(calls);
    expect(rows).toHaveLength(1);
    expect(rows[0].params[3]).toBe('LOGIN_FAILED');
    expect(rows[0].params[0]).toBe(9);
    expect(JSON.parse(rows[0].params[9]).reason).toBe('BAD_PASSWORD');
  });

  it('登入成功記下是誰、從哪裡登入的', async () => {
    const { pool, calls } = makePool({
      user: {
        id: 9, username: 'rio', role: 'ADMIN', full_name: '楊先生',
        password_hash: 'hashed', password_algo: 'bcrypt',
      },
    });
    const router = createAuthRoutes(pool, auth);
    const res = makeRes();
    await handlerFor(router, 'post', '/login')(
      makeReq({ body: { username: 'rio', password: 'right-password' } }), res);

    expect(res.body.success).toBe(true);
    const rows = auditRows(calls);
    expect(rows).toHaveLength(1);
    expect(rows[0].params[3]).toBe('LOGIN');
    expect(rows[0].params[0]).toBe(9);
    expect(rows[0].params[8]).toContain('rio');
    expect(rows[0].params[10]).toBe('192.168.100.55');
  });

  it('登出記下是誰登出的', async () => {
    const { pool, calls } = makePool();
    const router = createAuthRoutes(pool, auth);
    const res = makeRes();
    await handlerFor(router, 'post', '/logout')(
      makeReq({ user: { id: 3, username: 'rio', role: 'ADMIN', full_name: '楊先生' }, sessionToken: 'tok' }),
      res
    );

    const rows = auditRows(calls);
    expect(rows).toHaveLength(1);
    expect(rows[0].params[3]).toBe('LOGOUT');
    expect(rows[0].params[8]).toContain('rio');
  });

  it('來源 IP 以反向代理轉發的那一個為準', async () => {
    const { pool, calls } = makePool({ user: null });
    const router = createAuthRoutes(pool, auth);
    const req = makeReq({
      body: { username: 'ghost', password: 'x' },
      get: (h) => (h.toLowerCase() === 'x-forwarded-for' ? '10.1.2.3, 127.0.0.1' : undefined),
    });
    await handlerFor(router, 'post', '/login')(req, makeRes());

    // 前面有 nginx，直接看 req.ip 會全部變成 127.0.0.1
    expect(auditRows(calls)[0].params[10]).toBe('10.1.2.3');
  });

  it('寫紀錄失敗不會把使用者擋在門外', async () => {
    const { pool } = makePool({ user: null });
    pool.query = vi.fn(async (sql) => {
      if (/INSERT INTO system_audit_logs/.test(sql)) throw new Error('磁碟滿了');
      return { rows: [] };
    });
    const router = createAuthRoutes(pool, auth);
    const res = makeRes();
    await handlerFor(router, 'post', '/login')(makeReq({ body: { username: 'ghost', password: 'x' } }), res);

    // 照常回 401，而不是變成 500
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('帳號或密碼錯誤。');
  });
});

describe('事件紀錄的模組與動作對照表', () => {
  it('維修與系統維護也要有中文標籤', () => {
    // 先前這兩個模組有人在寫、卻不在對照表裡，
    // 事件紀錄上就顯示英文的 REPAIR，模組下拉選單也篩不出來
    expect(MODULE_MAP.REPAIR.label).toBe('維修管理');
    expect(MODULE_MAP.SYSTEM_SETTINGS.label).toBe('系統維護');
  });

  it('登入相關的動作型別有定義', () => {
    expect(ACTION_TYPES.LOGIN).toBe('LOGIN');
    expect(ACTION_TYPES.LOGIN_FAILED).toBe('LOGIN_FAILED');
    expect(ACTION_TYPES.LOGOUT).toBe('LOGOUT');
  });
});
