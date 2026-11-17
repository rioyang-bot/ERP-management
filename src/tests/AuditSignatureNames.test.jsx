import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { createIsoSignatureRoutes, cleanSignatureName } from '../../server/isoSignatureRoutes.js';
import SignaturePadModal, { HAND_DRAWN_NAME } from '../components/SignaturePadModal';

/**
 * 個人簽名檔記下檔名，事件紀錄寫得出「簽名檔：舊檔名 → 新檔名」
 *
 * 上傳的記原始檔名，手寫的記「手寫簽名」；既有簽名檔沒有檔名，第一次更換時變更前是空白。
 */
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const PNG2 = 'data:image/png;base64,TkVXU0lHTg==';
const USER = { id: 7, username: 'tom', full_name: '王機房', role: 'IT', menu_access: {} };
const auth = { requireAuth: (req, res, next) => next() };

/** mine：資料庫裡原本的那一份 { signature_png, signature_name } */
const makePool = (mine = null) => {
  const calls = [];
  const query = vi.fn(async (sql, params) => {
    calls.push({ sql, params });
    if (/SELECT/.test(sql) && /FROM user_signatures/.test(sql)) return { rows: mine ? [mine] : [] };
    if (/INSERT INTO user_signatures/.test(sql)) return { rows: [{ replaced: !!mine }] };
    if (/DELETE FROM user_signatures/.test(sql)) return { rows: mine ? [{ user_id: params[0], signature_name: mine.signature_name }] : [], rowCount: mine ? 1 : 0 };
    return { rows: [] };
  });
  return { pool: { query }, calls };
};
const handlerFor = (router, method, path) => router.stack.find((l) => l.route?.path === path && l.route?.methods?.[method]).route.stack.at(-1).handle;
const makeRes = () => ({ statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(p) { this.body = p; return this; } });
const makeReq = (body = {}) => ({ user: USER, params: {}, body, ip: '10.0.0.1', get: () => undefined });
const auditRows = (calls) => calls.filter((c) => /INSERT INTO system_audit_logs/.test(c.sql)).map((c) => c.params);
const put = async (ctx, body) => {
  const res = makeRes();
  await handlerFor(createIsoSignatureRoutes(ctx.pool, auth, {}), 'put', '/me/signature')(makeReq(body), res);
  return res;
};

describe('個人簽名檔的檔名（伺服器）', () => {
  it('migration：user_signatures 加 signature_name，列在清單末端', () => {
    const { migrations } = JSON.parse(fs.readFileSync('database/migrations.manifest.json', 'utf8'));
    expect(migrations.find((m) => m.file === 'migration_user_signature_name.sql')).toMatchObject({ type: 'schema' });
    const sql = fs.readFileSync('database/migration_user_signature_name.sql', 'utf8');
    expect(sql).toContain('ALTER TABLE user_signatures ADD COLUMN IF NOT EXISTS signature_name VARCHAR(255)');
    expect(sql).toMatch(/BEGIN;[\s\S]*COMMIT;/);
  });

  it('第一次設定：存下檔名，事件紀錄記（空白） → 新檔名', async () => {
    const ctx = makePool();
    expect((await put(ctx, { signature: PNG, signatureName: 'C:\\fakepath\\tom-sign.png' })).statusCode).toBe(200);
    expect(ctx.calls.find((c) => /INSERT INTO user_signatures/.test(c.sql)).params).toEqual([7, PNG, 'tom-sign.png']);
    const [log] = auditRows(ctx.calls);
    expect([log[3], log[8]]).toEqual(['CREATE', '設定個人簽名檔 [tom]：簽名檔：（空白） → tom-sign.png']);
    const details = JSON.parse(log[9]);
    expect(details.changes).toEqual([{ field: 'signature', label: '簽名檔', from: '', to: 'tom-sign.png', kind: 'file' }]);
    expect(log[9]).not.toContain('base64');
  });

  it('更換：先讀原本那一份，記舊檔名 → 新檔名；舊資料沒有檔名時變更前是空白', async () => {
    let ctx = makePool({ signature_png: PNG, signature_name: 'old.png' });
    await put(ctx, { signature: PNG2, signatureName: HAND_DRAWN_NAME });
    let [log] = auditRows(ctx.calls);
    expect([log[3], log[8]]).toEqual(['UPDATE', '更新個人簽名檔 [tom]：簽名檔：old.png → 手寫簽名']);
    expect(JSON.parse(log[9]).before).toEqual({ signatureName: 'old.png' });
    // 先讀後寫
    const order = ctx.calls.map((c) => c.sql);
    expect(order.findIndex((s) => /SELECT/.test(s))).toBeLessThan(order.findIndex((s) => /INSERT INTO user_signatures/.test(s)));

    ctx = makePool({ signature_png: PNG, signature_name: null });
    await put(ctx, { signature: PNG2, signatureName: 'new.png' });
    [log] = auditRows(ctx.calls);
    expect(log[8]).toBe('更新個人簽名檔 [tom]：簽名檔：（空白） → new.png');

    // 兩次都是手寫：檔名相同，但圖換了也要看得出來
    ctx = makePool({ signature_png: PNG, signature_name: HAND_DRAWN_NAME });
    await put(ctx, { signature: PNG2, signatureName: HAND_DRAWN_NAME });
    [log] = auditRows(ctx.calls);
    expect(log[8]).toBe('更新個人簽名檔 [tom]：簽名檔：手寫簽名 → 手寫簽名（已更換）');
  });

  it('刪除：記刪掉的檔名', async () => {
    const ctx = makePool({ signature_png: PNG, signature_name: 'tom-sign.png' });
    const res = makeRes();
    await handlerFor(createIsoSignatureRoutes(ctx.pool, auth, {}), 'delete', '/me/signature')(makeReq(), res);
    const [log] = auditRows(ctx.calls);
    expect([log[3], log[8]]).toEqual(['DELETE', '刪除個人簽名檔 [tom]：簽名檔：tom-sign.png → （空白）']);
    expect(JSON.parse(log[9]).before).toEqual({ signatureName: 'tom-sign.png' });
  });

  it('檔名只留檔名本身、去掉控制字元；沒送就是 null', () => {
    expect(cleanSignatureName('/a/b/簽名.png')).toBe('簽名.png');
    expect(cleanSignatureName('x\u0000y.png')).toBe('xy.png');
    expect(cleanSignatureName(undefined)).toBeNull();
    expect(cleanSignatureName('a'.repeat(300))).toHaveLength(255);
  });
});

describe('簽名視窗送出的檔名', () => {
  beforeEach(() => {
    const ctx = {
      beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), clearRect: vi.fn(),
      drawImage: vi.fn(), getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(8) })), putImageData: vi.fn(),
    };
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx);
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => PNG);
    HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
  });

  it('手寫的送「手寫簽名」', async () => {
    const onConfirm = vi.fn();
    render(<SignaturePadModal mode="manage" title="我的簽名檔" signerName="王機房" onConfirm={onConfirm} onClose={vi.fn()} />);
    fireEvent.pointerDown(screen.getByLabelText('簽名板'), { pointerId: 1, clientX: 5, clientY: 5 });
    fireEvent.click(screen.getByRole('button', { name: '儲存簽名檔' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(PNG, { saveAsMine: true, signatureName: HAND_DRAWN_NAME }));
  });

  it('上傳的送原始檔名', async () => {
    // jsdom 不載圖片：給一個設了 src 就觸發 onload 的假圖
    vi.stubGlobal('Image', class { constructor() { this.width = 300; this.height = 100; } set src(v) { setTimeout(() => this.onload?.()); } });
    const onConfirm = vi.fn();
    render(<SignaturePadModal mode="manage" title="我的簽名檔" signerName="王機房" onConfirm={onConfirm} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('上傳簽名圖檔'), { target: { files: [new File(['x'], 'tom-sign.png', { type: 'image/png' })] } });
    await waitFor(() => expect(screen.getByRole('button', { name: '儲存簽名檔' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: '儲存簽名檔' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(PNG, { saveAsMine: true, signatureName: 'tom-sign.png' }));
    vi.unstubAllGlobals();
  });
});
