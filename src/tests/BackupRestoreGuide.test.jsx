import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import BackupRestoreGuide from '../components/BackupRestoreGuide';

describe('資料備份與還原說明', () => {
  it('寫明每日自動備份的時間與位置', () => {
    render(<BackupRestoreGuide />);

    expect(screen.getByText(/每天凌晨 02:00/)).toBeInTheDocument();
    expect(screen.getByText('/opt/erp-management/backups/')).toBeInTheDocument();
    expect(screen.getByText('192.168.100.249')).toBeInTheDocument();
  });

  it('列出三種會產生備份的時機', () => {
    render(<BackupRestoreGuide />);

    expect(screen.getByText(/每天凌晨 02:00/)).toBeInTheDocument();
    expect(screen.getByText(/每次更新系統前/)).toBeInTheDocument();
    expect(screen.getByText(/大量匯入資料前/)).toBeInTheDocument();
  });

  it('寫明保留策略', () => {
    render(<BackupRestoreGuide />);

    expect(screen.getByText(/每日備份留 30 天/)).toBeInTheDocument();
    expect(screen.getByText(/每月 1 號的備份留 13 個月/)).toBeInTheDocument();
  });

  it('還原說明含覆蓋警告與完整的 pg_restore 指令', () => {
    render(<BackupRestoreGuide />);

    expect(screen.getByText(/還原會覆蓋伺服器上現有的全部資料/)).toBeInTheDocument();

    // 指令要是可以直接照抄的完整一行，不能被 JSX 拆散或漏掉參數
    const restore = screen.getByText(/pg_restore/);
    expect(restore.textContent).toBe(
      'sudo -u postgres pg_restore -d ERP_db --clean --if-exists /opt/erp-management/backups/ERP_db-20260913-020000.backup'
    );
  });

  it('還原步驟包含先停服務再重啟，且還原前先備一份現況', () => {
    render(<BackupRestoreGuide />);

    expect(screen.getByText('pm2 stop all')).toBeInTheDocument();
    expect(screen.getByText('pm2 start all')).toBeInTheDocument();
    // npm run backup 在指令一覽與還原步驟 2 各出現一次
    expect(screen.getAllByText('npm run backup').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('npm run backup:list').length).toBeGreaterThanOrEqual(2);
  });

  it('提醒備份與資料庫在同一台機器的風險', () => {
    render(<BackupRestoreGuide />);

    expect(screen.getByText(/備份與資料庫在同一台機器/)).toBeInTheDocument();
  });
});
