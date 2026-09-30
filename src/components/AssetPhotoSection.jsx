import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Camera, Upload, Trash2, Download, Loader2, CheckCircle2, Circle } from 'lucide-react';
import { logUpdate, getCurrentUser } from '../utils/auditLogger';
import { resolveMediaUrl, downloadMedia } from '../utils/media';
import { screenPhotoFiles, formatFileSize } from '../utils/assetPhotos';

/**
 * 設備主機照片
 *
 * 照片掛在單一台設備（序號）上，不是掛在型號上：同型號的兩台機器，
 * 機況、配置、外觀都不一樣，日後要據以開立驗收單的也是那一台自己的照片。
 *
 * 範本裡的「拍照項目」（例如正面、背面、機櫃內配線）會列在最上面，
 * 每一項各自上傳，人員才知道該拍哪些、拍漏了哪些。有照片就算完成。
 * 範本寫了拍攝說明的，直接顯示在該項底下，照著拍就不會拍錯角度。
 * 不屬於任何拍照項目的照片（包含先前上傳的）列在「其他照片」。
 *
 * 縮圖走 blob 網址而不是 <img src="/uploads/...">：/uploads 擋在 requireAuth
 * 後面，而驗證看的是 Authorization 標頭，瀏覽器的 img 不會帶標頭。
 *
 * @param {object[]} photoItems 這台設備的拍照項目（asset_checklist_items 裡 kind = PHOTO 的列）
 * @param {Function} onChanged  照片有增減時通知外層，讓檢查表的完成度跟著更新
 * @param {Function} canRemove / onRemoveItem 範本已刪除的拍照項目可以從這台設備移除
 */

const AssetPhotoSection = ({ device, card, photoItems = [], onChanged, canRemove, onRemoveItem }) => {
  const [photos, setPhotos] = useState([]);
  const [thumbs, setThumbs] = useState({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const itemFileInputRef = useRef(null);
  // 按了哪一個拍照項目的上傳鈕；檔案選好之後才知道要掛到哪一項
  const targetItemRef = useRef(null);
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

  const itemIds = new Set(photoItems.map((i) => i.id));
  const photosOf = (itemId) => photos.filter((p) => p.checklist_item_id === itemId);
  // 沒有對應到（或對應的拍照項目已經不在這台設備上）的都算其他照片
  const otherPhotos = photos.filter((p) => !p.checklist_item_id || !itemIds.has(p.checklist_item_id));
  const doneItems = photoItems.filter((i) => photosOf(i.id).length > 0).length;

  const handlePick = () => fileInputRef.current?.click();
  const handlePickForItem = (item) => {
    targetItemRef.current = item;
    itemFileInputRef.current?.click();
  };

  const handleFiles = async (fileList, item = null) => {
    const files = [...(fileList || [])];
    if (files.length === 0) return;

    const { accepted, rejected } = screenPhotoFiles(files);
    if (rejected.length > 0) {
      alert('以下檔案不會上傳：\n\n' + rejected.map((r) => `· ${r.name} —— ${r.reason}`).join('\n'));
    }
    if (accepted.length === 0) return;

    const target = item ? `的「${item.item_name}」` : '';
    if (!window.confirm(`確定要為 [${deviceSn || assetId}]${target}上傳這 ${accepted.length} 張照片嗎？\n\n`
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
          assetId, saved.fileName, file.name, file.type, file.size, user.id, user.name, item ? item.id : null,
        ]);
        if (!res.success || (res.rows || []).length === 0) throw new Error(res.error || '寫入照片紀錄失敗');
        done.push(file.name);
      }

      await logUpdate('DEVICE', deviceSn || assetId, deviceSn,
        `設備 [${deviceSn || assetId}] 上傳主機照片 ${done.length} 張${item ? `（拍照項目：${item.item_name}）` : ''}`,
        { sn: deviceSn, files: done, photoItem: item ? item.item_name : null });
      await loadPhotos();
      if (onChanged) onChanged();
    } catch (e) {
      alert(`上傳失敗：${e.message}${done.length > 0 ? `\n\n已經上傳成功的 ${done.length} 張會保留。` : ''}`);
      await loadPhotos();
      if (done.length > 0 && onChanged) onChanged();
    } finally {
      setBusy(false);
      targetItemRef.current = null;
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (itemFileInputRef.current) itemFileInputRef.current.value = '';
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
      if (onChanged) onChanged();
    } catch (e) {
      alert(`刪除失敗：${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const SECTION = card || {};

  const uploadBtnStyle = (color) => ({
    display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 14px',
    borderRadius: '8px', border: 'none', backgroundColor: busy ? 'var(--border-color)' : color,
    color: '#fff', fontWeight: 800, fontSize: '12px', cursor: busy ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
  });

  /**
   * @param {boolean} compact 拍照項目底下用的小縮圖：一列可能有好幾項，
   *                          用原本的大卡片會把整張檢查表撐得很長
   */
  const renderPhoto = (photo, compact = false) => (
    <div
      key={photo.id}
      style={{
        width: compact ? '96px' : '132px', border: '1px solid var(--border-color)', borderRadius: compact ? '8px' : '10px',
        overflow: 'hidden', backgroundColor: 'var(--bg-surface)',
      }}
      data-testid={`asset-photo-${photo.id}`}
    >
      <button
        type="button"
        onClick={() => handleDownload(photo)}
        title={`點擊下載 ${photo.original_name}`}
        style={{
          display: 'block', width: '100%', height: compact ? '64px' : '96px', padding: 0, border: 'none',
          backgroundColor: 'var(--bg-surface-subtle)', cursor: 'pointer',
        }}
        data-testid={`download-asset-photo-${photo.id}`}
      >
        {thumbs[photo.id] ? (
          <img
            src={thumbs[photo.id]}
            alt={photo.original_name}
            style={{ width: '100%', height: compact ? '64px' : '96px', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>載入中…</span>
        )}
      </button>
      <div style={{ padding: compact ? '3px 4px 3px 6px' : '6px 8px', display: 'flex', alignItems: 'center', gap: compact ? '2px' : '6px' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            title={`${photo.original_name}（${formatFileSize(photo.file_size)}${photo.uploaded_by_name ? ` · ${photo.uploaded_by_name}` : ''}）`}
            style={{ fontSize: compact ? '10px' : '11px', fontWeight: 700, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {photo.original_name}
          </div>
          {!compact && (
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
              {formatFileSize(photo.file_size)}
              {photo.uploaded_by_name ? ` · ${photo.uploaded_by_name}` : ''}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => handleDownload(photo)}
          title="下載"
          style={{ border: 'none', background: 'none', color: 'var(--primary-color)', cursor: 'pointer', padding: '2px' }}
        >
          <Download size={compact ? 12 : 14} />
        </button>
        <button
          type="button"
          onClick={() => handleDelete(photo)}
          disabled={busy}
          title="刪除"
          style={{ border: 'none', background: 'none', color: '#ef4444', cursor: busy ? 'not-allowed' : 'pointer', padding: '2px' }}
          data-testid={`delete-asset-photo-${photo.id}`}
        >
          <Trash2 size={compact ? 12 : 14} />
        </button>
      </div>
    </div>
  );

  const hasItems = photoItems.length > 0;

  return (
    <section style={{ ...SECTION, padding: '16px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 900, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Camera size={16} color="#0891b2" /> 主機照片
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>
            {photos.length > 0 ? `${photos.length} 張` : '尚未上傳'}
          </span>
          {hasItems && (
            <span
              style={{ fontSize: '11px', fontWeight: 800, color: doneItems === photoItems.length ? '#10b981' : '#f59e0b' }}
              data-testid="photo-items-progress"
            >
              拍照項目 {doneItems} / {photoItems.length}
            </span>
          )}
        </h3>
        <button
          type="button"
          onClick={handlePick}
          disabled={busy || !assetId}
          style={uploadBtnStyle('#0891b2')}
          data-testid="upload-asset-photo-btn"
        >
          {busy ? <Loader2 size={14} /> : <Upload size={14} />} {busy ? '處理中…' : (hasItems ? '上傳其他照片' : '上傳照片')}
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
        <input
          ref={itemFileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => handleFiles(e.target.files, targetItemRef.current)}
          data-testid="asset-photo-item-input"
        />
      </div>

      <p style={{ margin: '6px 0 0 0', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.7 }}>
        {hasItems
          ? '請依下方的拍照項目逐項上傳，每一項至少一張。點縮圖可以把原檔存下來。單張上限 10 MB。'
          : '拍下這台機器的外觀與機況，點縮圖可以把原檔存下來。單張上限 10 MB。'}
      </p>

      {error && (
        <div style={{ marginTop: '10px', fontSize: '12px', color: '#ef4444', fontWeight: 700 }}>{error}</div>
      )}

      {loading ? (
        <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>讀取中…</div>
      ) : (
        <>
          {/* 拍照項目：範本規定這台要拍的照片 */}
          {/* 一項一列：名稱、說明、狀態、上傳鈕排在同一行，有照片才在下面多一排小縮圖。
              先前一項一張卡片，九個項目就把整張檢查表撐得很長 */}
          {hasItems && !error && (
            <div style={{ marginTop: '10px', border: '1px solid var(--border-color)', borderRadius: '10px', overflow: 'hidden' }}>
              {photoItems.map((item, idx) => {
                const list = photosOf(item.id);
                const done = list.length > 0;
                return (
                  <div
                    key={item.id}
                    style={{
                      padding: '6px 10px',
                      borderTop: idx === 0 ? 'none' : '1px solid var(--border-color)',
                      borderLeft: `3px solid ${done ? '#10b981' : '#f59e0b'}`,
                      backgroundColor: done ? 'rgba(16, 185, 129, 0.05)' : 'transparent',
                    }}
                    data-testid={`photo-item-${item.id}`}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {done ? <CheckCircle2 size={15} color="#10b981" style={{ flexShrink: 0 }} /> : <Circle size={15} color="#f59e0b" style={{ flexShrink: 0 }} />}
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: '12px', rowGap: '1px' }}>
                        <b style={{ fontSize: '13px', color: 'var(--text-main)', wordBreak: 'break-word' }}>
                          {item.item_name}
                        </b>
                        {item.description && (
                          // 說明是拍攝指示（常常是要下的指令），完整顯示、不截斷
                          <span
                            style={{ flex: '1 1 220px', minWidth: 0, fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5, fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace' }}
                            data-testid={`photo-item-desc-${item.id}`}
                          >
                            {item.description}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: done ? '#10b981' : '#f59e0b', whiteSpace: 'nowrap' }}>
                        {done ? `已上傳 ${list.length} 張` : '尚未上傳'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handlePickForItem(item)}
                        disabled={busy || !assetId}
                        style={{ ...uploadBtnStyle('#0891b2'), padding: '4px 10px', gap: '4px', borderRadius: '6px' }}
                        aria-label={`上傳 ${item.item_name} 的照片`}
                      >
                        <Upload size={12} /> 上傳
                      </button>
                      {canRemove && onRemoveItem && canRemove(item) && (
                        <button
                          type="button"
                          onClick={() => onRemoveItem(item)}
                          title="範本已刪除，可從這台設備移除；照片會改列為其他照片"
                          aria-label={`移除 ${item.item_name}`}
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', padding: 0, borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: '#ef4444', cursor: 'pointer', flexShrink: 0 }}
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                    {list.length > 0 && (
                      <div style={{ margin: '6px 0 2px 23px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {list.map((p) => renderPhoto(p, true))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* 其他照片：不屬於任何拍照項目 */}
          {hasItems && otherPhotos.length > 0 && (
            <div style={{ marginTop: '14px', fontSize: '12px', fontWeight: 800, color: 'var(--text-muted)' }}>
              其他照片（{otherPhotos.length} 張）
            </div>
          )}
          {otherPhotos.length > 0 ? (
            <div style={{ marginTop: hasItems ? '8px' : '12px', display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
              {otherPhotos.map(renderPhoto)}
            </div>
          ) : (
            !hasItems && !error && (
              <div style={{
                marginTop: '12px', padding: '18px', borderRadius: '8px',
                border: '1.5px dashed var(--border-color)', textAlign: 'center',
                fontSize: '12px', color: 'var(--text-muted)',
              }}>
                還沒有照片
              </div>
            )
          )}
        </>
      )}
    </section>
  );
};

export default AssetPhotoSection;
