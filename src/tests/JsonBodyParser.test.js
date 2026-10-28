import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import zlib from 'zlib';
import fs from 'fs';
import express from 'express';
import { createJsonBodyParser } from '../../server/jsonBody.js';

/**
 * API 不接受壓縮過的請求內容（CVE-2026-111497：Node.js Brotli 解碼器越界寫入）
 *
 * 解析請求內容在登入檢查之前，連得到伺服器就能把壓縮資料送進 zlib。
 * 關掉解壓之後，帶 Content-Encoding 的請求直接回 415，解碼器根本不會被呼叫；
 * 前端送資料不壓縮，一般的 JSON 照常解析。
 */
let server;
let base;

beforeAll(async () => {
  const app = express();
  app.use(createJsonBodyParser({ limit: '5mb' }));
  app.post('/echo', (req, res) => res.json({ success: true, body: req.body }));
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

const post = (body, headers = {}) => fetch(`${base}/echo`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body,
});

const JSON_BODY = JSON.stringify({ name: '測試', qty: 2 });

describe('JSON 請求內容解析', () => {
  it('一般（未壓縮）的 JSON 照常解析', async () => {
    const res = await post(JSON_BODY);
    expect(res.status).toBe(200);
    expect((await res.json()).body).toEqual({ name: '測試', qty: 2 });
  });

  it('明寫 Content-Encoding: identity 也照常解析', async () => {
    const res = await post(JSON_BODY, { 'Content-Encoding': 'identity' });
    expect(res.status).toBe(200);
  });

  it.each([
    ['br', zlib.brotliCompressSync],
    ['gzip', zlib.gzipSync],
    ['deflate', zlib.deflateSync],
    ['BR', zlib.brotliCompressSync],
  ])('Content-Encoding: %s 一律回 415（JSON），不解壓', async (encoding, compress) => {
    const res = await post(compress(Buffer.from(JSON_BODY)), { 'Content-Encoding': encoding });
    expect(res.status).toBe(415);
    expect(await res.json()).toEqual({ success: false, error: '不接受壓縮過的請求內容' });
  });

  it('其他錯誤（例如 JSON 格式錯）照舊交給後面的錯誤處理', async () => {
    const res = await post('{not json');
    expect(res.status).toBe(400);
  });

  it('伺服器用的是這個解析器，不是預設的 express.json', () => {
    const src = fs.readFileSync('server.js', 'utf8');
    expect(src).toContain("app.use(createJsonBodyParser({ limit: '5mb' }));");
    expect(src).not.toMatch(/express\.json\(/);
  });
});
