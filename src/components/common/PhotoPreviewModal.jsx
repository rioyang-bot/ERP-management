import React, { useEffect } from 'react';
import { Download, X, ChevronLeft, ChevronRight } from 'lucide-react';

const navBtn = { position: 'absolute', top: '50%', transform: 'translateY(-50%)', width: '44px', height: '44px', borderRadius: '50%', border: 'none', backgroundColor: 'rgba(255, 255, 255, 0.15)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const barBtn = { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 14px', borderRadius: '8px', border: 'none', fontWeight: 800, fontSize: '13px', cursor: 'pointer' };

/**
 * 照片預覽：點縮圖先看大圖，按「下載」才存檔
 *
 * 設備的主機照片（AssetPhotoSection）與出機檢查表範本的預設照片共用。
 * Esc 關閉、左右鍵切換同一組的上一張／下一張，點背景也會關閉。
 *
 * @param {object[]} list       同一組的照片（至少要有 id、original_name）
 * @param {number}   index      目前顯示第幾張
 * @param {string}   [title]    標題上方的小字，例如拍照項目名稱
 * @param {(photo) => string} srcOf  照片的 blob 網址；還沒取回時回傳空值，顯示「載入中…」
 * @param {(i: number) => void} onIndexChange
 * @param {() => void} onClose
 * @param {(photo) => void} onDownload
 */

const PhotoPreviewModal = ({ list, index, title, srcOf, onIndexChange, onClose, onDownload }) => {
  // 掛在 window 的捕捉階段：外層彈窗也聽 Esc，先攔下來只關預覽
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      else if (e.key === 'ArrowLeft' && index > 0) onIndexChange(index - 1);
      else if (e.key === 'ArrowRight' && index < list.length - 1) onIndexChange(index + 1);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [index, list.length, onClose, onIndexChange]);

  const photo = list[index];
  if (!photo) return null;
  const src = srcOf(photo);

  return (
    <div
      role="dialog"
      aria-label="照片預覽"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 2000, backgroundColor: 'rgba(0, 0, 0, 0.82)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px', gap: '12px' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: 'min(92vw, 1100px)', color: '#fff' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {title && <div style={{ fontSize: '12px', opacity: 0.75 }}>{title}</div>}
          <div style={{ fontSize: '14px', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={photo.original_name}>
            {photo.original_name}
            {list.length > 1 && <span style={{ marginLeft: '8px', fontWeight: 600, opacity: 0.75 }}>{index + 1} / {list.length}</span>}
          </div>
        </div>
        <button type="button" onClick={() => onDownload(photo)} style={{ ...barBtn, backgroundColor: '#2563eb', color: '#fff' }} data-testid="photo-preview-download">
          <Download size={15} /> 下載
        </button>
        <button type="button" onClick={onClose} style={{ ...barBtn, backgroundColor: 'rgba(255, 255, 255, 0.15)', color: '#fff' }} aria-label="關閉預覽">
          <X size={15} /> 關閉
        </button>
      </div>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 'min(92vw, 1100px)', height: '78vh' }}>
        {src ? (
          <img src={src} alt={photo.original_name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '6px', boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)' }} />
        ) : (
          <span style={{ color: '#fff', fontSize: '13px' }}>載入中…</span>
        )}
        {index > 0 && (
          <button type="button" onClick={() => onIndexChange(index - 1)} style={{ ...navBtn, left: '8px' }} aria-label="上一張">
            <ChevronLeft size={26} />
          </button>
        )}
        {index < list.length - 1 && (
          <button type="button" onClick={() => onIndexChange(index + 1)} style={{ ...navBtn, right: '8px' }} aria-label="下一張">
            <ChevronRight size={26} />
          </button>
        )}
      </div>
    </div>
  );
};

export default PhotoPreviewModal;
