// ============================================================================
// 營運總覽的備份燈號：最後一次本機備份與 Google Drive 雲端備份的結果
// ----------------------------------------------------------------------------
// 每天的備份由伺服器排程跑 scripts/server-backup.sh，每次跑完把結果寫進
//   backups/last-backup-local.json   本機（資料庫）備份
//   backups/last-backup-cloud.json   Google Drive 雲端備份
// 內容是 { state: 'ok' | 'failed' | 'skipped', time: ISO 時間, message: 說明 }。
// 這裡只負責讀出來；還沒有檔案（從沒跑過，或在開發機上）回傳 null。
// 燈號顏色、多久沒備份算逾期，由前端 src/utils/backupStatus.js 判斷。
// ============================================================================

import express from 'express';
import fs from 'fs/promises';
import path from 'path';

export const STATUS_FILES = { local: 'last-backup-local.json', cloud: 'last-backup-cloud.json' };
const STATES = new Set(['ok', 'failed', 'skipped']);
const MAX_MESSAGE = 500;

/** 讀一個狀態檔；沒有檔案回傳 null，內容壞掉也當成讀不到 */
export const readStatusFile = async (file) => {
  let text;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
  try {
    const j = JSON.parse(text);
    if (!STATES.has(j?.state) || typeof j.time !== 'string' || Number.isNaN(Date.parse(j.time))) return null;
    return { state: j.state, time: j.time, message: String(j.message ?? '').slice(0, MAX_MESSAGE) };
  } catch {
    return null;
  }
};

/**
 * @param {ReturnType<import('./auth.js').createAuth>} auth
 * @param {string} backupDir 伺服器上的 backups 資料夾
 */
export const createBackupStatusRoutes = (auth, backupDir) => {
  const router = express.Router();

  router.get('/', auth.requireAuth, async (req, res) => {
    try {
      const [local, cloud] = await Promise.all([
        readStatusFile(path.join(backupDir, STATUS_FILES.local)),
        readStatusFile(path.join(backupDir, STATUS_FILES.cloud)),
      ]);
      res.json({ success: true, local, cloud });
    } catch (error) {
      console.error('[BackupStatus] 讀取失敗:', error.message);
      res.status(500).json({ success: false, error: '讀取備份狀態失敗。' });
    }
  });

  return router;
};
