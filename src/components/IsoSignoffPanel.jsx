import React, { useCallback, useContext, useEffect, useState } from 'react';
import { PenLine, Undo2, AlertTriangle } from 'lucide-react';
import { RoleContext } from '../context/RoleContext';
import SignaturePadModal from './SignaturePadModal';
import { rocYear } from '../utils/isoEquipmentForm';

const smallBtn = { display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 12px', borderRadius: '7px', fontWeight: 700, fontSize: '12px', cursor: 'pointer' };

const formatSignedAt = (ts) => {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${rocYear(d.getFullYear())}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/**
 * ISO 表單的線上簽核區（每個月每個角色簽一次，見 server/isoSignatureRoutes.js）
 *
 * 每個角色一張卡：簽名圖、簽核人與時間；能簽的人看到「簽核」，簽核後資料有異動的要重簽；
 * 能撤銷的人看到「撤銷」。也可以設定自己帳號的簽名檔，簽核時直接用。
 *
 * @param {{ formCode: string, formLabel: string, period: string, roles: {role: string, label: string}[],
 *           disabled?: boolean, refreshKey?: any, onSignaturesChange?: (valid: Record<string, {png: string, signedAt: string}>) => void }} props
 *   onSignaturesChange 收到的只有有效的簽名（簽核後資料有異動的不算），給表單預覽與 PDF 用；
 *   refreshKey 變了就重新讀一次（例如表單內容改了，簽名可能變成失效）
 */
const IsoSignoffPanel = ({ formCode, formLabel, period, roles, disabled = false, refreshKey, onSignaturesChange }) => {
  const { authUser } = useContext(RoleContext) || {};
  const [sign, setSign] = useState({ signatures: {}, permissions: {} });
  const [signError, setSignError] = useState('');
  const [signingRole, setSigningRole] = useState(null);
  const [mySignature, setMySignature] = useState(null);
  const [managingMine, setManagingMine] = useState(false);

  const [y, m] = String(period || '').split('-').map(Number);
  const periodLabel = y && m ? `${rocYear(y)}年${String(m).padStart(2, '0')}月` : '';

  const loadSignatures = useCallback(async () => {
    if (!y || !m || !window.electronAPI.isoSignature) return;
    const res = await window.electronAPI.isoSignature('GET', formCode, period);
    if (res?.success) {
      setSign({ signatures: res.signatures || {}, permissions: res.permissions || {} });
      setSignError('');
    } else {
      setSign({ signatures: {}, permissions: {} });
      setSignError(res?.error || '讀取簽核狀態失敗');
    }
  }, [y, m, formCode, period]);

  useEffect(() => { loadSignatures(); }, [loadSignatures, refreshKey]);

  // 表單上只印有效的簽名（簽核後資料有異動的不印）
  useEffect(() => {
    onSignaturesChange?.(Object.fromEntries(Object.entries(sign.signatures)
      .filter(([, s]) => s && !s.stale)
      .map(([role, s]) => [role, { png: s.signaturePng, signedAt: s.signedAt }])));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在簽核狀態變了時通知
  }, [sign]);

  // 自己帳號的簽名檔（簽核時可以直接用）
  useEffect(() => {
    if (!window.electronAPI.isoSignature) return;
    window.electronAPI.isoSignature('GET', 'me', 'signature').then((res) => {
      if (res?.success) setMySignature(res.signaturePng || null);
    });
  }, []);

  const saveMySignature = async (png) => {
    const res = await window.electronAPI.isoSignature('PUT', 'me', 'signature', undefined, { signature: png });
    if (!res?.success) throw new Error(res?.error || '儲存簽名檔失敗');
    setMySignature(png);
  };

  /** 簽核：body 是 { useSaved: true }（用自己帳號的簽名檔）或 { signature }（這次手寫／上傳的） */
  const submitSign = async (body) => {
    const res = await window.electronAPI.isoSignature('POST', formCode, period, signingRole, body);
    if (!res?.success) {
      alert('簽核失敗：' + (res?.error || '未知錯誤'));
      return;
    }
    setSigningRole(null);
    await loadSignatures();
  };

  const handleSign = async (png, { saveAsMine } = {}) => {
    if (saveAsMine) {
      try { await saveMySignature(png); } catch (err) { alert(err.message); return; }
    }
    await submitSign({ signature: png });
  };

  const handleSaveMine = async (png) => {
    try {
      await saveMySignature(png);
      setManagingMine(false);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteMine = async () => {
    if (!window.confirm('確定要刪除我的簽名檔嗎？已經簽核過的月份不受影響。')) return;
    const res = await window.electronAPI.isoSignature('DELETE', 'me', 'signature');
    if (!res?.success) { alert('刪除失敗：' + (res?.error || '未知錯誤')); return; }
    setMySignature(null);
    setManagingMine(false);
  };

  const handleRevoke = async (def) => {
    const s = sign.signatures[def.role];
    if (!window.confirm(`確定要撤銷 ${periodLabel} 的${def.label}簽核（${s?.userName}）嗎？`)) return;
    const res = await window.electronAPI.isoSignature('DELETE', formCode, period, def.role);
    if (!res?.success) {
      alert('撤銷失敗：' + (res?.error || '未知錯誤'));
      return;
    }
    await loadSignatures();
  };

  const signingDef = roles.find((d) => d.role === signingRole);
  const canSignAny = roles.some((d) => sign.permissions[d.role]?.canSign);
  const signerName = authUser?.full_name || authUser?.username || '';

  return (
    <>
      {canSignAny && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
          <span>我的簽名檔：{mySignature ? '已設定' : '尚未設定'}</span>
          <button type="button" onClick={() => setManagingMine(true)}
            style={{ ...smallBtn, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-main)' }}>
            <PenLine size={13} /> {mySignature ? '管理我的簽名檔' : '設定我的簽名檔'}
          </button>
        </div>
      )}
      <div aria-label="線上簽核" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px', marginBottom: '14px' }}>
        {roles.map((def) => {
          const s = sign.signatures[def.role];
          const perm = sign.permissions[def.role] || {};
          return (
            <div key={def.role} data-testid={`iso-sign-${def.role}`}
              style={{ padding: '12px 14px', borderRadius: '10px', border: `1px solid ${s?.stale ? '#f59e0b' : 'var(--border-color)'}`, backgroundColor: 'var(--bg-surface-subtle)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <span style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text-main)' }}>{def.label}</span>
                {s && !s.stale && <span style={{ fontSize: '11px', fontWeight: 800, color: '#10b981' }}>已簽核</span>}
                {!s && <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-subtle)' }}>尚未簽核</span>}
              </div>
              {s && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <img src={s.signaturePng} alt={`${def.label}簽名`} style={{ height: '54px', width: '162px', objectFit: 'contain', backgroundColor: '#fff', borderRadius: '6px', border: '1px solid var(--border-color)' }} />
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{s.userName}</div>
                    <div>{formatSignedAt(s.signedAt)}</div>
                  </div>
                </div>
              )}
              {s?.stale && (
                <div role="status" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#d97706' }}>
                  <AlertTriangle size={14} /> 簽核後資料有異動，請重新簽核（表單上不會印這個簽名）
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {perm.canSign && (!s || s.stale) && (
                  <button type="button" onClick={() => setSigningRole(def.role)} disabled={disabled}
                    style={{ ...smallBtn, border: 'none', backgroundColor: '#ea580c', color: '#fff' }}>
                    <PenLine size={13} /> {s ? `重新簽核（${def.label}）` : `簽核（${def.label}）`}
                  </button>
                )}
                {perm.canRevoke && s && (
                  <button type="button" onClick={() => handleRevoke(def)}
                    style={{ ...smallBtn, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-main)' }}>
                    <Undo2 size={13} /> 撤銷{def.label}簽核
                  </button>
                )}
                {!perm.canSign && !s && (
                  <span style={{ fontSize: '11px', color: 'var(--text-subtle)' }}>由指定的帳號登入簽核（系統管理 → 權限設定）</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {signError && <div role="alert" style={{ fontSize: '12px', color: '#ef4444', marginBottom: '10px' }}>簽核狀態：{signError}</div>}

      {signingDef && (
        <SignaturePadModal
          title={`${periodLabel} ${formLabel} — ${signingDef.label}簽核`}
          signerName={signerName}
          savedSignature={mySignature}
          onUseSaved={() => submitSign({ useSaved: true })}
          onConfirm={handleSign}
          onClose={() => setSigningRole(null)}
        />
      )}
      {managingMine && (
        <SignaturePadModal
          mode="manage"
          title="我的簽名檔"
          signerName={signerName}
          savedSignature={mySignature}
          onConfirm={handleSaveMine}
          onDeleteSaved={handleDeleteMine}
          onClose={() => setManagingMine(false)}
        />
      )}
    </>
  );
};

export default IsoSignoffPanel;
