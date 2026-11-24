import React from 'react';
import { DatabaseBackup, Cloud } from 'lucide-react';
import { BACKUP_KINDS, backupLight } from '../utils/backupStatus';

const ICONS = { local: DatabaseBackup, cloud: Cloud };

/**
 * 營運總覽最下方：本機備份與 Google Drive 備份最後一次的時間與結果。
 * 成功綠燈、失敗（或逾期沒備份）紅燈、沒有紀錄或未啟用灰燈。
 * @param {{ status: { local: object|null, cloud: object|null }, now?: Date }} props
 */
const BackupStatusPanel = ({ status, now }) => (
  <section className="overview-backup-status" aria-label="備份狀態">
    <h2 className="overview-backup-title">
      <DatabaseBackup size={18} />
      備份狀態
    </h2>
    <div className="overview-backup-grid">
      {BACKUP_KINDS.map(({ key, label, hint }) => {
        const b = backupLight(status?.[key] ?? null, now);
        const Icon = ICONS[key];
        return (
          <div
            key={key}
            className={`overview-backup-card overview-backup-${b.light}`}
            data-testid={`backup-status-${key}`}
            data-light={b.light}
          >
            <span className={`overview-backup-light overview-backup-light-${b.light}`} role="img" aria-label={`${label}：${b.status}`} />
            <div className="overview-backup-body">
              <div className="overview-backup-head">
                <Icon size={16} />
                <span className="overview-backup-label">{label}</span>
                <span className="overview-backup-state">{b.status}</span>
              </div>
              <div className="overview-backup-when">{b.when ? `最後一次備份：${b.when}` : hint}</div>
              {b.message && <div className="overview-backup-message">{b.message}</div>}
              {b.alert && <div className="overview-backup-alert">{b.alert}</div>}
            </div>
          </div>
        );
      })}
    </div>
  </section>
);

export default BackupStatusPanel;
