import React, { useEffect, useRef, useState } from 'react';
import { PenLine, X, Eraser, Check, Upload, Trash2, BadgeCheck } from 'lucide-react';

/** 簽名板的實際像素；存下來的 PNG 也是這個大小（表單上依 3:1 縮放） */
export const PAD_WIDTH = 600;
export const PAD_HEIGHT = 200;

/** 上傳的圖檔接受的格式 */
const ACCEPT = 'image/png,image/jpeg';
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * 上傳的簽名圖放進簽名板：等比例縮到框內置中，接近白色的底變透明（掃描或拍照的簽名才不會有一塊白底）
 */
export const drawUploadedSignature = (ctx, img) => {
  ctx.clearRect(0, 0, PAD_WIDTH, PAD_HEIGHT);
  const ratio = Math.min((PAD_WIDTH - 20) / img.width, (PAD_HEIGHT - 20) / img.height);
  const w = img.width * ratio;
  const h = img.height * ratio;
  ctx.drawImage(img, (PAD_WIDTH - w) / 2, (PAD_HEIGHT - h) / 2, w, h);
  const data = ctx.getImageData(0, 0, PAD_WIDTH, PAD_HEIGHT);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i] > 225 && px[i + 1] > 225 && px[i + 2] > 225) px[i + 3] = 0;
  }
  ctx.putImageData(data, 0, 0);
};

const readImage = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('讀不到這個圖檔'));
    img.src = reader.result;
  };
  reader.onerror = () => reject(new Error('讀不到這個圖檔'));
  reader.readAsDataURL(file);
});

/**
 * 簽名視窗
 *
 * sign（簽核）：有個人簽名檔時直接「使用我的簽名檔簽核」；也可以手寫或上傳一張，勾選後順便存成自己的簽名檔。
 * manage（我的簽名檔）：上傳或手寫後存成自己帳號的簽名檔，或刪除。
 *
 * 用 Pointer Events，滑鼠、手寫筆、觸控都走同一套；手寫筆有壓力值時線條粗細跟著變。
 * 產生的是透明背景的 PNG（data: 網址）。
 *
 * @param {{ mode?: 'sign'|'manage', title: string, signerName: string, savedSignature?: string|null,
 *           onUseSaved?: () => Promise<void>|void, onConfirm: (png: string, opts: { saveAsMine: boolean }) => Promise<void>|void,
 *           onDeleteSaved?: () => Promise<void>|void, onClose: () => void }} props
 */
const SignaturePadModal = ({ mode = 'sign', title, signerName, savedSignature = null, onUseSaved, onConfirm, onDeleteSaved, onClose }) => {
  const canvasRef = useRef(null);
  const fileRef = useRef(null);
  const drawing = useRef(null);
  const [hasInk, setHasInk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveAsMine, setSaveAsMine] = useState(!savedSignature);
  const [uploadError, setUploadError] = useState('');

  const ctx = () => canvasRef.current?.getContext?.('2d') || null;

  useEffect(() => {
    const c = ctx();
    if (!c) return;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.strokeStyle = '#111827';
  }, []);

  /** 螢幕座標 → 畫布座標（畫布顯示時會縮放） */
  const pointOf = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const sx = PAD_WIDTH / (rect.width || PAD_WIDTH);
    const sy = PAD_HEIGHT / (rect.height || PAD_HEIGHT);
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  };

  const widthOf = (e) => (e.pointerType === 'pen' && e.pressure > 0 ? 1.5 + e.pressure * 3.5 : 3);

  const handleDown = (e) => {
    e.preventDefault();
    canvasRef.current.setPointerCapture?.(e.pointerId);
    const p = pointOf(e);
    drawing.current = p;
    const c = ctx();
    if (c) {
      // 只點一下也要留下一點
      c.beginPath();
      c.fillStyle = '#111827';
      c.arc(p.x, p.y, widthOf(e) / 2, 0, Math.PI * 2);
      c.fill();
    }
    setHasInk(true);
  };

  const handleMove = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const p = pointOf(e);
    const c = ctx();
    if (c) {
      c.lineWidth = widthOf(e);
      c.beginPath();
      c.moveTo(drawing.current.x, drawing.current.y);
      c.lineTo(p.x, p.y);
      c.stroke();
    }
    drawing.current = p;
  };

  const handleUp = () => { drawing.current = null; };

  const handleClear = () => {
    ctx()?.clearRect(0, 0, PAD_WIDTH, PAD_HEIGHT);
    setHasInk(false);
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadError('');
    if (!ACCEPT.split(',').includes(file.type)) { setUploadError('請選 PNG 或 JPG 圖檔'); return; }
    if (file.size > MAX_UPLOAD_BYTES) { setUploadError('圖檔超過 5 MB'); return; }
    try {
      const img = await readImage(file);
      const c = ctx();
      if (c) drawUploadedSignature(c, img);
      setHasInk(true);
    } catch (err) {
      setUploadError(err.message);
    }
  };

  const run = async (fn) => {
    if (saving) return;
    setSaving(true);
    try { await fn(); } finally { setSaving(false); }
  };

  const handleConfirm = () => {
    if (!hasInk) return;
    run(() => onConfirm(canvasRef.current.toDataURL('image/png'), { saveAsMine: mode === 'manage' || saveAsMine }));
  };

  const btn = { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 16px', borderRadius: '8px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' };
  const subtle = { ...btn, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-main)' };
  const primary = (enabled) => ({ ...btn, border: 'none', backgroundColor: enabled ? '#ea580c' : 'var(--border-color)', color: '#fff', cursor: enabled ? 'pointer' : 'not-allowed' });
  const signImg = { height: '60px', width: '180px', objectFit: 'contain', backgroundColor: '#fff', borderRadius: '6px', border: '1px solid var(--border-color)' };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'var(--bg-modal-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, backdropFilter: 'blur(4px)' }}>
      <div role="dialog" aria-label={title} className="card-surface" style={{ width: 'min(680px, 94vw)', maxHeight: '94vh', overflowY: 'auto', padding: '22px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '16px', boxShadow: 'var(--modal-shadow)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <h2 style={{ fontSize: '1.1rem', margin: 0, fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)' }}>
            <PenLine size={20} color="#ea580c" /> {title}
          </h2>
          <button type="button" aria-label="關閉" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={22} /></button>
        </div>
        <p style={{ margin: '0 0 12px', fontSize: '12px', color: 'var(--text-muted)' }}>
          {mode === 'sign' ? '簽核人' : '帳號'}：<b style={{ color: 'var(--text-main)' }}>{signerName}</b>
        </p>

        {/* 自己帳號的簽名檔 */}
        {savedSignature && (
          <div data-testid="saved-signature" style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', padding: '12px', marginBottom: '14px', borderRadius: '10px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface-subtle)' }}>
            <img src={savedSignature} alt="我的簽名檔" style={signImg} />
            <div style={{ flex: 1, fontSize: '12px', color: 'var(--text-muted)' }}>{mode === 'sign' ? '我的簽名檔' : '目前的簽名檔'}</div>
            {mode === 'sign' && (
              <button type="button" onClick={() => run(onUseSaved)} disabled={saving} style={primary(!saving)}>
                <BadgeCheck size={15} /> {saving ? '送出中...' : '使用我的簽名檔簽核'}
              </button>
            )}
            {mode === 'manage' && onDeleteSaved && (
              <button type="button" onClick={() => run(onDeleteSaved)} disabled={saving} style={subtle}>
                <Trash2 size={15} /> 刪除簽名檔
              </button>
            )}
          </div>
        )}

        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
          {mode === 'sign' && savedSignature ? '或者這次改用新的簽名：' : ''}用滑鼠、手寫板或觸控筆在框內簽名，也可以上傳簽名圖檔（PNG、JPG，白底會自動去掉）。
        </div>
        <canvas
          ref={canvasRef}
          width={PAD_WIDTH}
          height={PAD_HEIGHT}
          aria-label="簽名板"
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerCancel={handleUp}
          onPointerLeave={handleUp}
          style={{ width: '100%', aspectRatio: `${PAD_WIDTH} / ${PAD_HEIGHT}`, display: 'block', touchAction: 'none', cursor: 'crosshair', backgroundColor: '#ffffff', border: '2px dashed var(--border-color)', borderRadius: '10px' }}
        />
        <input ref={fileRef} type="file" accept={ACCEPT} aria-label="上傳簽名圖檔" onChange={handleUpload} style={{ display: 'none' }} />
        {uploadError && <div role="alert" style={{ marginTop: '8px', fontSize: '12px', color: '#ef4444' }}>{uploadError}</div>}

        {mode === 'sign' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', fontSize: '13px', color: 'var(--text-main)', cursor: 'pointer' }}>
            <input type="checkbox" checked={saveAsMine} onChange={(e) => setSaveAsMine(e.target.checked)} />
            {savedSignature ? '同時更新為我的簽名檔' : '存成我的簽名檔（下次直接使用）'}
          </label>
        )}

        <div style={{ display: 'flex', gap: '10px', marginTop: '14px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" onClick={handleClear} style={{ ...subtle, marginRight: 'auto' }}>
            <Eraser size={15} /> 清除重簽
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} style={subtle}>
            <Upload size={15} /> 上傳簽名圖檔
          </button>
          <button type="button" onClick={onClose} style={subtle}>取消</button>
          <button type="button" onClick={handleConfirm} disabled={!hasInk || saving} style={primary(hasInk && !saving)}>
            <Check size={15} /> {saving ? '送出中...' : mode === 'sign' ? '確認簽名' : '儲存簽名檔'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SignaturePadModal;
