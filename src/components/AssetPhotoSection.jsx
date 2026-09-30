import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Camera, Upload, Trash2, Download, Loader2 } from 'lucide-react';
import { logUpdate, getCurrentUser } from '../utils/auditLogger';
import { resolveMediaUrl, downloadMedia } from '../utils/media';
import { screenPhotoFiles, formatFileSize } from '../utils/assetPhotos';

/**
 * 設備主機照片
 *
 * 照片掛在單一台設備（序號）上，不是掛在型號上：同型號的兩台機器，
 * 機況、配置、外觀都不一樣，日後要據以開立驗收單的也是那一台自己的照片。
 *
 * 縮圖走 blob 網址而不是 <img src="/uploads/...">：/uploads 擋在 requireAuth
 * 後面，而驗證看的是 Authorization 標頭，瀏覽器的 img 不會帶標頭。
 */

const AssetPhotoSection = ({ device, card }) => {
  const [photos, setPhotos] = useState([]);
  const [thumbs, setThumbs] = useState({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  // 已經產生的 blob 網址，元件收掉時要一併回收
  const objectUrlsRef = useRef([]);

  const assetId = device?.id;
  const deviceSn = (device?.sn || '').trim();

  const loadPhotos = useCallback(async () => {
    if (!assetId) return;
    setLoading(true);
    setError('');
    try {
      const res = await window.electronAPI.namedQuery('fetchAssetPhotos', [assetId]);
      if (!res.success) throw new Error(res.error || '讀取失敗');
      setPhotos(res.rows || []);
    } catch (e) {
      // 資料庫變更還沒套用時只擋住這一區，不要讓整張檢查表打不開
      setError(`讀取主機照片失敗：${e.message}`);
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => { loadPhotos(); }, [loadPhotos]);

  // 縮圖逐張取回。失敗的那張就不顯示縮圖，仍然可以下載與刪除。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const photo of photos) {
        if (thumbs[photo.id]) continue;
        const resolved = await resolveMediaUrl(photo.file_name);
        if (cancelled) {
          if (resolved.revoke) URL.revokeObjectURL(resolved.url);
          return;
        }
        if (resolved.url) {
          if (resolved.revoke) objectUrlsRef.current.push(resolved.url);
          setThumbs((prev) => ({ ...prev, [photo.id]: resolved.url }));
        }
      }
    })();
    return () => { cancelled = true; };
    // thumbs 不列入相依：它在迴圈裡被更新，列進去會無限重跑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos]);

  useEffect(() => () => {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current = [];
  }, []);

  const handlePick = () => fileInputRef.current?.click();

  const handleFiles = async (fileList) => {
    const files = [...(fileList || [])];
    if (files.length === 0) return;

    const { accepted, rejected } = screenPhotoFiles(files);
    if (rejected.length > 0) {
      alert('以下檔案不會上傳：\n\n' + rejected.map((r) => `· ${r.name} —— ${r.reason}`).join('\n'));
    }
    if (accepted.length === 0) return;

    if (!window.confirm(`確定要為 [${deviceSn || assetId}] 上傳這 ${accepted.length} 張照片嗎？\n\n`
      + accepted.map((f) => `· ${f.name}（${formatFileSize(f.size)}）`).join('\n'))) return;

    setBusy(true);
    const user = getCurrentUser();
    const done = [];
    try {
      for (const file of accepted) {
        const buffer = await file.arrayBuffer();
        const saved = await window.electronAPI.saveFile(file.name, buffer);
        if (!saved.success) throw new Error(saved.error || '檔案儲存失敗');

        const res = await window.electronAPI.namedQuery('insertAssetPhoto', [
          assetId, saved.fileName, file.name, file.type, file.size, user.id, user.name,
        ]);
        if (!res.success || (res.rows || []).length === 0) throw new Error(res.error || '寫入照片紀錄失敗');
        done.push(file.name);
      }

      await logUpdate('DEVICE', deviceSn || assetId, deviceSn,
        `設備 [${deviceSn || assetId}] 上傳主機照片 ${done.length} 張`,
        { sn: deviceSn, files: done });
      await loadPhotos();
    } catch (e) {
      alert(`上傳失敗：${e.message}${done.length > 0 ? `\n\n已經上傳成功的 ${done.length} 張會保留。` : ''}`);
      await loadPhotos();
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownload = async (photo) => {
    const res = await downloadMedia(photo.file_name, photo.original_name);
    if (!res.success) alert(`下載失敗：${res.error}`);
  };

  const handleDelete = async (photo) => {
    if (!window.confirm(`確定要刪除照片 [${photo.original_name}] 嗎？\n\n刪除後就找不回來了。`)) return;
    setBusy(true);
    try {
      const res = await window.electronAPI.namedQuery('deleteAssetPhoto', [photo.id]);
      if (!res.success || (res.rows || []).length === 0) throw new Error(res.error || '找不到這張照片');
      await logUpdate('DEVICE', deviceSn || assetId, deviceSn,
        `設備 [${deviceSn || assetId}] 刪除主機照片 [${photo.original_name}]`,
        { sn: deviceSn, file: photo.original_name });
      setThumbs((prev) => { const n = { ...prev }; delete n[photo.id]; return n; });
      await loadPhotos();
    } catch (e) {
      alert(`刪除失敗：${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const SECTION = card || {};

  return (
    <section style={{ ...SECTION, padding: '16px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 900, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Camera size={16} color="#0891b2" /> 主機照片
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>
            {photos.length > 0 ? `${photos.length} 張` : '尚未上傳'}
          </span>
        </h3>
        <button
          type="button"
          onClick={handlePick}
          disabled={busy || !assetId}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 14px',
            borderRadius: '8px', border: 'none', backgroundColor: busy ? 'var(--border-color)' : '#0891b2',
            color: '#fff', fontWeight: 800, fontSize: '12px', cursor: busy ? 'not-allowed' : 'pointer',
          }}
          data-testid="upload-asset-photo-btn"
        >
          {busy ? <Loader2 size={14} /> : <Upload size={14} />} {busy ? '處理中…' : '上傳照片'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => handleFiles(e.target.files)}
          data-testid="asset-photo-input"
        />
      </div>

      <p style={{ margin: '6px 0 0 0', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.7 }}>
        拍下這台機器的外觀與機況，點縮圖可以把原檔存下來。單張上限 10 MB。
      </p>

      {error && (
        <div style={{ marginTop: '10px', fontSize: '12px', color: '#ef4444', fontWeight: 700 }}>{error}</div>
      )}

      {loading ? (
        <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>讀取中…</div>
      ) : photos.length === 0 ? (
        !error && (
          <div style={{
            marginTop: '12px', padding: '18px', borderRadius: '8px',
            border: '1.5px dashed var(--border-color)', textAlign: 'center',
            fontSize: '12px', color: 'var(--text-muted)',
          }}>
            還沒有照片
          </div>
        )
      ) : (
        <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
          {photos.map((photo) => (
            <div
              key={photo.id}
              style={{
                width: '132px', border: '1px solid var(--border-color)', borderRadius: '10px',
                overflow: 'hidden', backgroundColor: 'var(--bg-surface)',
              }}
              data-testid={`asset-photo-${photo.id}`}
            >
              <button
                type="button"
                onClick={() => handleDownload(photo)}
                title={`點擊下載 ${photo.original_name}`}
                style={{
                  display: 'block', width: '100%', height: '96px', padding: 0, border: 'none',
                  backgroundColor: 'var(--bg-surface-subtle)', cursor: 'pointer',
                }}
                data-testid={`download-asset-photo-${photo.id}`}
              >
                {thumbs[photo.id] ? (
                  <img
                    src={thumbs[photo.id]}
                    alt={photo.original_name}
                    style={{ width: '100%', height: '96px', objectFit: 'cover', display: 'block' }}
                  />
                ) : (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>載入中…</span>
                )}
              </button>
              <div style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    title={photo.original_name}
                    style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {photo.original_name}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    {formatFileSize(photo.file_size)}
                    {photo.uploaded_by_name ? ` · ${photo.uploaded_by_name}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDownload(photo)}
                  title="下載"
                  style={{ border: 'none', background: 'none', color: 'var(--primary-color)', cursor: 'pointer', padding: '2px' }}
                >
                  <Download size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(photo)}
                  disabled={busy}
                  title="刪除"
                  style={{ border: 'none', background: 'none', color: '#ef4444', cursor: busy ? 'not-allowed' : 'pointer', padding: '2px' }}
                  data-testid={`delete-asset-photo-${photo.id}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default AssetPhotoSection;
