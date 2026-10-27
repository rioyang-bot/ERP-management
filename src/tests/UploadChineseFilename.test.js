import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import express from 'express';
import { createUpload } from '../../server/upload.js';

/**
 * 上傳的中文檔名
 *
 * 瀏覽器送出的檔名是 UTF-8，multer 預設當 latin1 解讀，
 * 「簽收單.pdf」存到磁碟變成「ç°½æ¶å®.pdf」。改成以 UTF-8 解讀。
 */
let root;
let server;
let port;

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-upload-'));
  const upload = createUpload(root, { maxMb: 1 });
  const app = express();
  app.post('/api/upload', (req, res, next) => upload.single('file')(req, res, (err) => {
    if (!err) return next();
    return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ success: false, code: err.code });
  }), (req, res) => res.json({
    success: true,
    fileName: req.file.filename,
    originalName: req.file.originalname,
    url: '/' + path.relative(root, req.file.path).split(path.sep).join('/'),
  }));
  await new Promise((resolve) => { server = app.listen(0, '127.0.0.1', resolve); });
  port = server.address().port;
});

afterAll(() => {
  server?.close();
  fs.rmSync(root, { recursive: true, force: true });
});

/** 跟瀏覽器一樣：Content-Disposition 的 filename 直接放 UTF-8 位元組 */
const postFile = (fileName, size = 16) => new Promise((resolve, reject) => {
  const boundary = '----erpTestBoundary';
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`, 'utf8'),
    Buffer.alloc(size, 1),
    Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'),
  ]);
  const req = http.request({
    host: '127.0.0.1', port, path: '/api/upload', method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length },
  }, (res) => {
    let data = '';
    res.setEncoding('utf8');
    res.on('data', (c) => { data += c; });
    res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
  });
  req.on('error', reject);
  req.end(body);
});

describe('上傳檔名', () => {
  it('中文檔名照原樣存到磁碟，不再變成亂碼', async () => {
    const { status, body } = await postFile('簽收單_凱基.pdf');
    expect(status).toBe(200);
    expect(body.originalName).toBe('簽收單_凱基.pdf');
    expect(body.fileName).toMatch(/^簽收單_凱基-\d+\.pdf$/);
    expect(fs.readdirSync(path.join(root, 'uploads'))).toContain(body.fileName);
    // 網址是 /uploads/檔名（相對專案目錄），前端用 fileName 讀回來
    expect(body.url).toBe(`/uploads/${body.fileName}`);
  });

  it('英文檔名不受影響', async () => {
    const { body } = await postFile('DN-20261015-01 signed.jpg');
    expect(body.fileName).toMatch(/^DN-20261015-01 signed-\d+\.jpg$/);
  });

  it('檔名夾帶路徑也寫不到 uploads 外面', async () => {
    const { body } = await postFile('../../逃出去.png');
    expect(body.fileName).toMatch(/^逃出去-\d+\.png$/);
    expect(fs.readdirSync(path.join(root, 'uploads'))).toContain(body.fileName);
  });

  it('超過上限回 413', async () => {
    const { status, body } = await postFile('大檔.jpg', 2 * 1024 * 1024);
    expect(status).toBe(413);
    expect(body.code).toBe('LIMIT_FILE_SIZE');
  });
});
