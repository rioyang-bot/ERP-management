import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import Overview from '../pages/Overview';
import BackupStatusPanel from '../components/BackupStatusPanel';
import { backupLight, agoText, STALE_HOURS } from '../utils/backupStatus';
import { readStatusFile, createBackupStatusRoutes, STATUS_FILES } from '../../server/backupStatusRoutes.js';

/**
 * 營運總覽最下方的備份燈號：本機備份、Google Drive 備份最後一次的時間與結果
 *
 * 伺服器的備份排程（scripts/server-backup.sh）每次跑完寫 backups/last-backup-*.json，
 * GET /api/backup-status 讀出來；成功綠燈、失敗紅燈、超過 48 小時沒有新的備份也紅燈、
 * 沒有紀錄或雲端還沒設定是灰燈。
 */
const NOW = new Date('2026-11-24T09:00:00+08:00');
const OK = { state: 'ok', time: '2026-11-24T02:00:05+08:00', message: 'ERP_db-20261124-020000.backup（5.2M）' };
const FAILED = { state: 'failed', time: '2026-11-24T02:03:10+08:00', message: '雲端備份失敗：uploads 同步失敗（詳情見 backup.log）' };

describe('燈號判斷', () => {
  it('成功而且在 48 小時內：綠燈，寫出時間與多久以前', () => {
    const b = backupLight(OK, NOW);
    expect(b.light).toBe('green');
    expect(b.status).toBe('備份成功');
    expect(b.when).toBe('115/11/24 02:00（6 小時前）');
    expect(b.alert).toBe('');
  });

  it('失敗：紅燈並提醒', () => {
    const b = backupLight(FAILED, NOW);
    expect(b.light).toBe('red');
    expect(b.status).toBe('備份失敗');
    expect(b.message).toContain('uploads 同步失敗');
    expect(b.alert).toContain('請盡快處理');
  });

  it('成功但超過 48 小時沒有新的備份：紅燈（排程可能停了）', () => {
    const old = { ...OK, time: new Date(NOW.getTime() - (STALE_HOURS + 30) * 3600000).toISOString() };
    const b = backupLight(old, NOW);
    expect(b.light).toBe('red');
    expect(b.status).toBe('逾期未備份');
    expect(b.alert).toContain('已超過 3 天沒有新的備份');
  });

  it('沒有紀錄、雲端尚未設定：灰燈', () => {
    expect(backupLight(null, NOW)).toMatchObject({ light: 'gray', status: '尚無紀錄' });
    expect(backupLight({ state: 'skipped', time: OK.time, message: '還沒設定 erp-backup:，雲端備份尚未啟用' }, NOW))
      .toMatchObject({ light: 'gray', status: '未啟用' });
  });

  it('多久以前', () => {
    expect(agoText('2026-11-24T08:59:40+08:00', NOW)).toBe('剛剛');
    expect(agoText('2026-11-24T08:35:00+08:00', NOW)).toBe('25 分鐘前');
    expect(agoText('2026-11-22T08:00:00+08:00', NOW)).toBe('2 天前');
  });
});

describe('備份狀態區塊', () => {
  it('本機與 Google Drive 各一張：綠燈、紅燈', () => {
    render(<BackupStatusPanel status={{ local: OK, cloud: FAILED }} now={NOW} />);
    const local = screen.getByTestId('backup-status-local');
    const cloud = screen.getByTestId('backup-status-cloud');
    expect(local).toHaveAttribute('data-light', 'green');
    expect(within(local).getByRole('img', { name: '本機備份：備份成功' })).toBeInTheDocument();
    expect(local).toHaveTextContent('最後一次備份：115/11/24 02:00（6 小時前）');
    expect(local).toHaveTextContent('ERP_db-20261124-020000.backup（5.2M）');
    expect(cloud).toHaveAttribute('data-light', 'red');
    expect(within(cloud).getByRole('img', { name: 'Google Drive 備份：備份失敗' })).toBeInTheDocument();
    expect(cloud).toHaveTextContent('最後一次備份失敗，請盡快處理');
  });
});

describe('營運總覽頁面', () => {
  beforeEach(() => {
    window.electronAPI = {
      namedQuery: vi.fn(async () => ({ success: true, rows: [] })),
      backupStatus: vi.fn(async () => ({ success: true, local: OK, cloud: null })),
    };
  });

  it('最下方顯示備份狀態', async () => {
    render(<MemoryRouter><Overview /></MemoryRouter>);
    const panel = await screen.findByRole('region', { name: '備份狀態' });
    expect(window.electronAPI.backupStatus).toHaveBeenCalled();
    expect(within(panel).getByTestId('backup-status-local')).toHaveAttribute('data-light', expect.stringMatching(/green|red/));
    expect(within(panel).getByTestId('backup-status-cloud')).toHaveAttribute('data-light', 'gray');
    // 在耗材預警區塊之後（頁面最下方）
    const lowStock = document.getElementById('low-stock-section');
    expect(lowStock.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('讀不到備份狀態就不顯示，其他區塊照常', async () => {
    window.electronAPI.backupStatus = vi.fn(async () => ({ success: false, error: 'x' }));
    render(<MemoryRouter><Overview /></MemoryRouter>);
    await screen.findByText('耗材低於安全庫存預警');
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole('region', { name: '備份狀態' })).toBeNull();
  });
});

describe('伺服器：讀備份狀態檔', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-backup-status-')); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it('讀出備份腳本寫的檔案；沒有檔案是 null，內容壞掉也當成讀不到', async () => {
    fs.writeFileSync(path.join(dir, STATUS_FILES.local), `${JSON.stringify(OK)}\n`);
    fs.writeFileSync(path.join(dir, STATUS_FILES.cloud), '{"state":"ok","time":"20');
    expect(await readStatusFile(path.join(dir, STATUS_FILES.local))).toEqual(OK);
    expect(await readStatusFile(path.join(dir, STATUS_FILES.cloud))).toBeNull();
    expect(await readStatusFile(path.join(dir, 'missing.json'))).toBeNull();
    fs.writeFileSync(path.join(dir, STATUS_FILES.cloud), JSON.stringify({ state: 'weird', time: OK.time }));
    expect(await readStatusFile(path.join(dir, STATUS_FILES.cloud))).toBeNull();
  });

  it('GET /api/backup-status：要登入，回傳 local 與 cloud', async () => {
    fs.writeFileSync(path.join(dir, STATUS_FILES.cloud), JSON.stringify(FAILED));
    const requireAuth = vi.fn((req, res, next) => next());
    const router = createBackupStatusRoutes({ requireAuth }, dir);
    const app = express();
    app.use('/api/backup-status', router);
    const server = app.listen(0);
    try {
      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}/api/backup-status`);
      expect(await res.json()).toEqual({ success: true, local: null, cloud: FAILED });
      expect(requireAuth).toHaveBeenCalled();
    } finally {
      server.close();
    }
  });
});

describe('備份腳本會寫狀態檔', () => {
  const script = fs.readFileSync(path.join(__dirname, '../../scripts/server-backup.sh'), 'utf8');
  it('本機與雲端各寫一個檔，檔名與伺服器讀的一致', () => {
    expect(script).toContain(`STATUS_LOCAL="$BACKUP_DIR/${STATUS_FILES.local}"`);
    expect(script).toContain(`STATUS_CLOUD="$BACKUP_DIR/${STATUS_FILES.cloud}"`);
    // 成功、驗證失敗、pg_dump 失敗（trap）、雲端成功／略過／失敗都有記
    expect(script).toMatch(/write_status "\$STATUS_LOCAL" ok/);
    expect(script).toMatch(/write_status "\$STATUS_LOCAL" failed "備份檔驗證失敗/);
    expect(script).toMatch(/trap on_exit EXIT/);
    expect(script).toMatch(/write_status "\$STATUS_CLOUD" ok/);
    expect(script).toMatch(/write_status "\$STATUS_CLOUD" skipped/);
    expect(script).toMatch(/write_status "\$STATUS_CLOUD" failed/);
  });
});
