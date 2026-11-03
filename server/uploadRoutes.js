// ============================================================================
// 上傳檔案的釋放與清理（/api/uploads）
// ----------------------------------------------------------------------------
// POST /release          畫面上刪掉／換掉檔案後交回舊檔名；登入即可呼叫，
//                        伺服器自己確認沒有任何紀錄在用才移到回收區，所以不怕亂傳。
// GET  /orphans          清理工具：列出沒有紀錄在用的檔案（管理員）
// POST /orphans/delete   清理工具：確認後移到回收區，並寫事件紀錄（管理員）
//
// 判斷方式與回收區見 server/uploadCleanup.js。
// ============================================================================

import express from 'express';
import { clientIp, writeAuditLog } from './auditLog.js';
import {
  releaseFiles, scanOrphans, trashOrphans, MAX_FILES_PER_REQUEST, TRASH_KEEP_DAYS,
} from './uploadCleanup.js';

/** 1234567 → 1.2 MB */
export const formatBytes = (n) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

const readFileNames = (body) => {
  const files = body?.files;
  if (!Array.isArray(files) || files.length === 0) return { error: '沒有指定檔案。' };
  if (files.length > MAX_FILES_PER_REQUEST) return { error: `一次最多 ${MAX_FILES_PER_REQUEST} 個檔案。` };
  if (files.some((f) => typeof f !== 'string')) return { error: '檔名格式不正確。' };
  return { files };
};

/**
 * @param {import('pg').Pool} pool
 * @param {ReturnType<import('./auth.js').createAuth>} auth
 * @param {string} uploadsDir
 */
export const createUploadRoutes = (pool, auth, uploadsDir) => {
  const router = express.Router();

  router.post('/release', auth.requireAuth, async (req, res) => {
    const { files, error } = readFileNames(req.body);
    if (error) return res.status(400).json({ success: false, error });
    try {
      const result = await releaseFiles(pool, uploadsDir, files);
      res.json({ success: true, ...result });
    } catch (e) {
      console.error('[Uploads] 釋放檔案失敗:', e.message);
      res.status(500).json({ success: false, error: '釋放檔案失敗。' });
    }
  });

  router.get('/orphans', auth.requireAuth, auth.requireRole('ADMIN'), async (req, res) => {
    try {
      const result = await scanOrphans(pool, uploadsDir);
      res.json({ success: true, ...result, trashKeepDays: TRASH_KEEP_DAYS });
    } catch (e) {
      console.error('[Uploads] 掃描失敗:', e.message);
      res.status(500).json({ success: false, error: '掃描上傳檔案失敗。' });
    }
  });

  router.post('/orphans/delete', auth.requireAuth, auth.requireRole('ADMIN'), async (req, res) => {
    const { files, error } = readFileNames(req.body);
    if (error) return res.status(400).json({ success: false, error });
    try {
      const result = await trashOrphans(pool, uploadsDir, files);
      if (result.trashed.length > 0) {
        await writeAuditLog(pool, {
          userId: req.user.id,
          userName: req.user.full_name || req.user.username,
          userRole: req.user.role,
          actionType: 'DELETE',
          module: 'SYSTEM_SETTINGS',
          moduleLabel: '系統維護',
          targetId: 'UPLOADS',
          targetName: '上傳檔案',
          summary: `清理沒有使用的上傳檔案 ${result.trashed.length} 個（${formatBytes(result.size)}），移到回收區保留 ${TRASH_KEEP_DAYS} 天`,
          details: {
            count: result.trashed.length, size: result.size,
            files: result.trashed.map((f) => f.name), skipped: result.skipped,
          },
          ipAddress: clientIp(req),
        });
      }
      res.json({ success: true, ...result });
    } catch (e) {
      console.error('[Uploads] 清理失敗:', e.message);
      res.status(500).json({ success: false, error: '清理上傳檔案失敗。' });
    }
  });

  return router;
};
