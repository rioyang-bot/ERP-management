import React, { useState } from 'react';
import { HardDrive, RefreshCw, Trash2, CheckCircle2 } from 'lucide-react';
import { formatBytes } from '../utils/uploadRelease';

/**
 * 系統管理：清理沒有使用的上傳檔案（管理員）
 *
 * 掃描伺服器的 uploads，列出資料庫裡已經沒有任何紀錄在用的檔案
 * （刪掉的照片、換掉的簽收單、移除的附件⋯），勾選確認後移到回收區，
 * 保留 30 天才真正刪除。上傳不到 24 小時的不列入（可能單據還沒按儲存）。
 * 判斷方式見 server/uploadCleanup.js；事件紀錄由伺服器寫。
 */
const th = { padding: '10px 14px', fontWeight: 800, textAlign: 'left' };
const td = { padding: '8px 14px' };

const UploadCleanupPanel = () => {
  const [scan, setScan] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [scanning, setScanning] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [message, setMessage] = useState(null);

  const handleScan = async (keepMessage = false) => {
    setScanning(true);
    if (!keepMessage) setMessage(null);
    try {
      const res = await window.electronAPI.scanOrphanUploads();
      if (!res.success) throw new Error(res.error);
      setScan(res);
      setSelected(new Set(res.orphans.map((f) => f.name)));
    } catch (e) {
      alert(`掃描失敗：${e.message}`);
    } finally {
      setScanning(false);
    }
  };

  const picked = (scan?.orphans || []).filter((f) => selected.has(f.name));
  const pickedSize = picked.reduce((s, f) => s + f.size, 0);
  const allPicked = !!scan && scan.orphans.length > 0 && picked.length === scan.orphans.length;

  const toggle = (name) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });
  const toggleAll = () => setSelected(allPicked ? new Set() : new Set(scan.orphans.map((f) => f.name)));

  const handleClean = async () => {
    if (picked.length === 0) return;
    if (!window.confirm(`確定要清掉這 ${picked.length} 個沒有使用的檔案（${formatBytes(pickedSize)}）嗎？\n\n`
      + `檔案會先移到回收區，保留 ${scan.trashKeepDays} 天後才真正刪除。`)) return;
    setCleaning(true);
    setMessage(null);
    try {
      const res = await window.electronAPI.trashOrphanUploads(picked.map((f) => f.name));
      if (!res.success) throw new Error(res.error);
      const skippedNote = res.skipped.length > 0 ? `；${res.skipped.length} 個在這段時間又被用到或已不存在，沒有動` : '';
      setMessage(`已清掉 ${res.trashed.length} 個檔案（${formatBytes(res.size)}），移到回收區保留 ${scan.trashKeepDays} 天${skippedNote}。`);
      await handleScan(true);
    } catch (e) {
      alert(`清理失敗：${e.message}`);
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div className="card-surface" style={{ padding: '32px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '16px', boxShadow: 'var(--card-shadow)' }} data-testid="upload-cleanup">
      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', color: 'var(--text-main)', margin: 0, display: 'flex', alignItems: 'center', gap: '10px', fontWeight: '800' }}>
            <HardDrive size={22} color="var(--primary-color)" /> 清理沒有使用的上傳檔案
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '6px', marginBottom: 0 }}>
            找出伺服器上已經沒有任何紀錄在用的檔案（刪掉的照片、換掉的簽收單、移除的附件⋯）。清掉的檔案先放回收區 30 天，之後才真正刪除。
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => handleScan()}
            disabled={scanning || cleaning}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 18px', backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
            data-testid="scan-uploads-btn"
          >
            <RefreshCw size={15} className={scanning ? 'spin-animation' : ''} />
            {scanning ? '正在掃描中...' : '掃描上傳檔案'}
          </button>
          {picked.length > 0 && (
            <button
              type="button"
              onClick={handleClean}
              disabled={scanning || cleaning}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 20px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
              data-testid="clean-uploads-btn"
            >
              <Trash2 size={15} />
              {cleaning ? '清理中...' : `清掉 ${picked.length} 個（${formatBytes(pickedSize)}）`}
            </button>
          )}
        </div>
      </div>

      {message && (
        <div style={{ padding: '12px 16px', marginBottom: '16px', borderRadius: '8px', backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', color: '#10b981', fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircle2 size={16} /> {message}
        </div>
      )}

      {!scan ? (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '12px', border: '1px dashed var(--border-color)', fontSize: '13px' }}>
          點擊右上角「掃描上傳檔案」，看看伺服器上有多少檔案已經沒有在用。
        </div>
      ) : (
        <>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: 1.8 }} data-testid="upload-scan-summary">
            共 {scan.scannedCount} 個檔案，沒有在用的 <b style={{ color: 'var(--text-main)' }}>{scan.orphans.length}</b> 個（{formatBytes(scan.orphanSize)}）
            {scan.recentCount > 0 && `；${scan.recentCount} 個是 24 小時內上傳的，先不列入`}
            {scan.folders.length > 0 && `；子資料夾 ${scan.folders.join('、')} 裡的舊檔不掃描`}
            。回收區目前 {scan.trash.count} 個（{formatBytes(scan.trash.size)}），放滿 {scan.trashKeepDays} 天自動刪除。
          </div>
          {scan.orphans.length > 0 ? (
            <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: '12px', maxHeight: '420px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--table-header-bg)', borderBottom: '2px solid var(--border-color)' }}>
                    <th style={{ ...th, width: '40px' }}>
                      <input type="checkbox" checked={allPicked} onChange={toggleAll} aria-label="全選" />
                    </th>
                    <th style={th}>檔名</th>
                    <th style={{ ...th, textAlign: 'right' }}>大小</th>
                    <th style={th}>上傳日期</th>
                  </tr>
                </thead>
                <tbody>
                  {scan.orphans.map((f) => (
                    <tr key={f.name} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={td}>
                        <input type="checkbox" checked={selected.has(f.name)} onChange={() => toggle(f.name)} aria-label={`選取 ${f.name}`} />
                      </td>
                      <td style={{ ...td, wordBreak: 'break-all', color: 'var(--text-main)' }}>{f.name}</td>
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>{formatBytes(f.size)}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{new Date(f.modifiedAt).toLocaleString('zh-TW', { hour12: false })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: '20px', textAlign: 'center', color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.08)', borderRadius: '12px', fontSize: '13px', fontWeight: 700 }}>
              沒有需要清理的檔案。
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default UploadCleanupPanel;
