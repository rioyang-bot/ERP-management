import React from 'react';
import { Database, Clock, ShieldCheck, AlertTriangle, Terminal, RotateCcw } from 'lucide-react';

/**
 * 資料備份與還原說明
 *
 * 放在「系統架構與流程導覽」裡，讓備份時間、保留多久、真的出事時怎麼還原
 * 這幾件事有一個固定查得到的地方，不必去翻部署腳本或問人。
 *
 * 這裡寫的設定值與 scripts/server-backup.sh、backup.ps1、deploy.ps1 一致，
 * 三者若有調整，這一頁要同步更新。
 */

const SERVER = '192.168.100.249';
const BACKUP_DIR = '/opt/erp-management/backups/';

const card = {
  backgroundColor: 'var(--bg-surface)',
  border: '1px solid var(--border-color)',
  borderRadius: '14px',
  padding: '20px 24px',
  marginBottom: '18px',
};

const heading = {
  display: 'flex', alignItems: 'center', gap: '8px',
  fontSize: '15px', fontWeight: 900, color: 'var(--text-main)',
  margin: '0 0 12px',
};

const code = {
  fontFamily: 'monospace', fontSize: '12.5px',
  backgroundColor: 'var(--bg-surface-subtle)',
  border: '1px solid var(--border-color)',
  borderRadius: '6px', padding: '2px 7px',
  color: 'var(--primary-color)', whiteSpace: 'nowrap',
};

const codeBlock = {
  fontFamily: 'monospace', fontSize: '12.5px', lineHeight: 1.9,
  backgroundColor: 'var(--bg-surface-subtle)',
  border: '1px solid var(--border-color)',
  borderRadius: '8px', padding: '12px 14px',
  color: 'var(--text-main)', overflowX: 'auto', margin: '8px 0 0',
};

const th = {
  textAlign: 'left', padding: '8px 10px', fontSize: '12px', fontWeight: 800,
  color: 'var(--text-muted)', borderBottom: '2px solid var(--border-color)', whiteSpace: 'nowrap',
};

const td = {
  padding: '9px 10px', fontSize: '13px', color: 'var(--text-main)',
  borderBottom: '1px solid var(--table-border)', verticalAlign: 'top',
};

const BackupRestoreGuide = () => (
  <div style={{ maxWidth: '980px' }}>

    {/* --- 備份時機 --- */}
    <div style={card}>
      <h3 style={heading}><Clock size={18} color="var(--primary-color)" /> 什麼時候會備份</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>時機</th>
              <th style={th}>執行方式</th>
              <th style={th}>需要人工操作嗎</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={td}><b>每天凌晨 02:00</b></td>
              <td style={td}>伺服器排程 (cron) 自動執行 <code style={code}>scripts/server-backup.sh</code></td>
              <td style={td}>否，全自動</td>
            </tr>
            <tr>
              <td style={td}><b>每次更新系統前</b></td>
              <td style={td}><code style={code}>npm run deploy</code> 的第 2 步會先備份</td>
              <td style={td}>否，包含在部署流程中。<b>備份失敗即中止部署</b>，不會動到系統</td>
            </tr>
            <tr>
              <td style={td}><b>大量匯入資料前</b></td>
              <td style={td}><code style={code}>npm run backup</code></td>
              <td style={td}>是，需要時自行執行</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    {/* --- 備份放在哪、留多久 --- */}
    <div style={card}>
      <h3 style={heading}><Database size={18} color="var(--primary-color)" /> 備份放在哪、保留多久</h3>
      <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13.5px', lineHeight: 2, color: 'var(--text-main)' }}>
        <li>位置：伺服器 <code style={code}>{SERVER}</code> 的 <code style={code}>{BACKUP_DIR}</code></li>
        <li>格式：PostgreSQL <code style={code}>pg_dump -F c</code> 自訂格式，已壓縮</li>
        <li>命名：每日備份 <code style={code}>ERP_db-20260913-020000.backup</code>，每月 1 號 <code style={code}>ERP_db-monthly-…</code></li>
        <li>保留：<b>每日備份留 30 天</b>；<b>每月 1 號的備份留 13 個月</b>，由排程自動清理過期檔案</li>
        <li>每份備份產生後會立刻驗證讀得出內容，驗證不過就刪除並回報失敗，不會留下損毀的假檔案</li>
      </ul>
      <div style={{
        marginTop: '14px', padding: '12px 14px', borderRadius: '8px',
        backgroundColor: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.35)',
        fontSize: '13px', color: 'var(--text-main)', lineHeight: 1.8,
      }}>
        <b style={{ color: '#f59e0b' }}>注意：備份與資料庫在同一台機器。</b>
        這可以救回誤刪、匯入出錯、升級失敗，但如果是<b>那台機器或硬碟壞掉</b>，資料庫和備份會一起沒有。
        建議定期另外複製一份到別的地方（NAS、另一台電腦或外接硬碟）。
      </div>
    </div>

    {/* --- 日常查詢 --- */}
    <div style={card}>
      <h3 style={heading}><ShieldCheck size={18} color="#16a34a" /> 確認備份正常運作</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>要做的事</th>
              <th style={th}>指令（在專案資料夾執行）</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={td}>看排程有沒有在跑、最近幾次結果</td>
              <td style={td}><code style={code}>npm run backup:schedule -- -Status</code></td>
            </tr>
            <tr>
              <td style={td}>列出伺服器上現有的備份</td>
              <td style={td}><code style={code}>npm run backup:list</code></td>
            </tr>
            <tr>
              <td style={td}>看資料庫與備份佔用多少空間、磁碟還剩多少</td>
              <td style={td}><code style={code}>npm run db:usage</code></td>
            </tr>
            <tr>
              <td style={td}>立即手動備份一次</td>
              <td style={td}><code style={code}>npm run backup</code></td>
            </tr>
            <tr>
              <td style={td}>安裝／變更每日備份時間（例：改成凌晨 3 點）</td>
              <td style={td}><code style={code}>npm run backup:schedule -- -Hour 3</code></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p style={{ margin: '12px 0 0', fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.8 }}>
        每次執行的結果都會寫進伺服器的 <code style={code}>{BACKUP_DIR}backup.log</code>。
        建議每個月看一次 <code style={code}>-Status</code>，確認排程沒有默默停掉。
      </p>
    </div>

    {/* --- 還原 --- */}
    <div style={{ ...card, borderColor: 'rgba(239, 68, 68, 0.4)' }}>
      <h3 style={{ ...heading, color: '#ef4444' }}>
        <RotateCcw size={18} color="#ef4444" /> 如何還原備份
      </h3>

      <div style={{
        padding: '12px 14px', borderRadius: '8px', marginBottom: '14px',
        backgroundColor: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.35)',
        display: 'flex', gap: '10px', alignItems: 'flex-start',
        fontSize: '13px', color: 'var(--text-main)', lineHeight: 1.8,
      }}>
        <AlertTriangle size={18} color="#ef4444" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div>
          <b style={{ color: '#ef4444' }}>還原會覆蓋伺服器上現有的全部資料。</b>
          備份時間點之後輸入的任何資料都會消失，且無法復原。
          執行前請先確認：選對備份檔、確定要回到那個時間點、並通知正在使用系統的同仁停止輸入。
        </div>
      </div>

      <div style={{ fontSize: '13.5px', color: 'var(--text-main)', lineHeight: 1.9 }}>
        <b>步驟 1</b> 先確認要還原到哪一份（列出所有備份與時間）：
        <pre style={codeBlock}>npm run backup:list</pre>

        <b style={{ display: 'inline-block', marginTop: '14px' }}>步驟 2</b>
        還原前先把「現在」的狀態也備一份，萬一還原後發現選錯，還回得來：
        <pre style={codeBlock}>npm run backup</pre>

        <b style={{ display: 'inline-block', marginTop: '14px' }}>步驟 3</b> 登入伺服器：
        <pre style={codeBlock}>ssh root@{SERVER}</pre>

        <b style={{ display: 'inline-block', marginTop: '14px' }}>步驟 4</b>
        停止服務，避免還原過程中有人正在寫入：
        <pre style={codeBlock}>pm2 stop all</pre>

        <b style={{ display: 'inline-block', marginTop: '14px' }}>步驟 5</b>
        還原（把檔名換成步驟 1 選定的那一份）：
        <pre style={codeBlock}>{`sudo -u postgres pg_restore -d ERP_db --clean --if-exists ${BACKUP_DIR}ERP_db-20260913-020000.backup`}</pre>

        <b style={{ display: 'inline-block', marginTop: '14px' }}>步驟 6</b> 重新啟動服務：
        <pre style={codeBlock}>pm2 start all</pre>

        <b style={{ display: 'inline-block', marginTop: '14px' }}>步驟 7</b>
        開啟系統確認資料正確。若發現還原錯版本，用步驟 2 那份備份重跑步驟 4～6。
      </div>
    </div>

    {/* --- 相關檔案 --- */}
    <div style={card}>
      <h3 style={heading}><Terminal size={18} color="var(--text-muted)" /> 相關檔案位置</h3>
      <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', lineHeight: 2, color: 'var(--text-main)' }}>
        <li><code style={code}>scripts/server-backup.sh</code> 伺服器端實際執行備份與清理的腳本</li>
        <li><code style={code}>backup-schedule.ps1</code> 安裝／查詢／移除每日排程</li>
        <li><code style={code}>backup.ps1</code> 手動備份一次、列出現有備份</li>
        <li><code style={code}>db-usage.ps1</code> 查詢資料庫與備份的空間使用量</li>
        <li><code style={code}>deploy.ps1</code> 部署腳本，第 2 步會自動備份</li>
      </ul>
    </div>

  </div>
);

export default BackupRestoreGuide;
