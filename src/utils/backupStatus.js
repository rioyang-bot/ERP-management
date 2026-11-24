/**
 * 營運總覽的備份燈號
 *
 * 伺服器每天排程備份（scripts/server-backup.sh），跑完把結果寫成狀態檔，
 * 由 GET /api/backup-status 讀回：{ local, cloud }，各是 { state, time, message } 或 null。
 *
 * 燈號：
 *   綠燈 最後一次成功，且在 STALE_HOURS 小時內
 *   紅燈 最後一次失敗；或雖然成功但已超過 STALE_HOURS 小時沒有再備份（排程可能停了）
 *   灰燈 還沒有任何紀錄，或雲端備份尚未設定（略過）
 */
import { formatRocDateTime } from './isoThreatIntel';

export const BACKUP_KINDS = [
  { key: 'local', label: '本機備份', hint: '伺服器上的資料庫備份' },
  { key: 'cloud', label: 'Google Drive 備份', hint: '資料庫備份、照片與文件、設定檔' },
];

/** 每天備份一次，超過兩天沒有新的成功紀錄就當成出問題 */
export const STALE_HOURS = 48;

/** 多久以前：剛剛／25 分鐘前／3 小時前／2 天前 */
export const agoText = (time, now = new Date()) => {
  const mins = Math.floor((now.getTime() - new Date(time).getTime()) / 60000);
  if (Number.isNaN(mins)) return '';
  if (mins < 1) return '剛剛';
  if (mins < 60) return `${mins} 分鐘前`;
  if (mins < 60 * 24) return `${Math.floor(mins / 60)} 小時前`;
  return `${Math.floor(mins / 60 / 24)} 天前`;
};

/**
 * @param {{ state: 'ok'|'failed'|'skipped', time: string, message?: string } | null} entry
 * @returns {{ light: 'green'|'red'|'gray', status: string, when: string, message: string, alert: string }}
 */
export const backupLight = (entry, now = new Date()) => {
  if (!entry) return { light: 'gray', status: '尚無紀錄', when: '', message: '還沒有備份紀錄（每天排程備份後就會顯示）', alert: '' };
  const when = `${formatRocDateTime(entry.time)}（${agoText(entry.time, now)}）`;
  const message = entry.message || '';
  if (entry.state === 'skipped') return { light: 'gray', status: '未啟用', when, message, alert: '' };
  if (entry.state === 'failed') return { light: 'red', status: '備份失敗', when, message, alert: '最後一次備份失敗，請盡快處理' };
  const hours = (now.getTime() - new Date(entry.time).getTime()) / 3600000;
  if (hours > STALE_HOURS) {
    return { light: 'red', status: '逾期未備份', when, message, alert: `已超過 ${Math.floor(hours / 24)} 天沒有新的備份，請確認備份排程` };
  }
  return { light: 'green', status: '備份成功', when, message, alert: '' };
};
