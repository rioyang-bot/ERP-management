import React, { useState } from 'react';
import { X, Save } from 'lucide-react';
import { logUpdate } from '../utils/auditLogger';
import { sameAssetNo, checkDuplicateAssetNo } from '../utils/assetNo';

/**
 * 庫存盤點表 > 公司資產：編輯詳細資訊
 *
 * 盤點時最常要順手補的是資產序號、存放地點、保管人(End-User)與備註，
 * 不必再跑到設備或硬體列表找那一台。廠牌型號、序號這些會連動其他單據的欄位
 * 仍然只能在設備／硬體列表改，這裡只讀。
 */
const FIELDS = [
  { key: 'asset_no', label: '資產序號 (Asset No)', maxLength: 100 },
  { key: 'location', label: '存放地點 (Location)', maxLength: 100 },
  { key: 'end_user', label: '保管人(End-User)', maxLength: 100 },
];

const LABELS = { asset_no: '資產序號', location: '存放地點', end_user: '保管人', remarks: '備註' };

const clean = (v) => String(v || '').trim();

const labelStyle = { display: 'block', fontWeight: 800, fontSize: '13px', marginBottom: '6px', color: 'var(--text-muted)' };
const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', outline: 'none', fontSize: '13px', boxSizing: 'border-box' };

const CompanyAssetEditModal = ({ item, endUserOptions = [], onClose, onSaved }) => {
  const [form, setForm] = useState({
    asset_no: item.asset_no || '',
    location: item.location || '',
    end_user: item.end_user || '',
    remarks: item.remarks || '',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const changes = Object.keys(LABELS)
      .filter((k) => clean(form[k]) !== clean(item[k]))
      .map((k) => ({ field: k, label: LABELS[k], from: clean(item[k]), to: clean(form[k]) }));
    if (changes.length === 0) { onClose(); return; }

    setSaving(true);
    try {
      // 只在資產序號有改時檢查：既有資料就算撞號，改其他欄位也不該被擋
      if (!sameAssetNo(form.asset_no, item.asset_no)) {
        const dupMsg = await checkDuplicateAssetNo(form.asset_no, item.id);
        if (dupMsg) { alert(dupMsg); return; }
      }
      const res = await window.electronAPI.namedQuery('updateCompanyAssetStocktakingInfo', [
        form.asset_no, form.location, form.end_user, form.remarks, item.id,
      ]);
      if (!res.success || !res.rows?.length) {
        alert('儲存失敗：' + (res.error || '找不到這筆公司資產（可能已改為一般銷售）'));
        return;
      }
      // 設備與硬體各有自己的履歷，模組跟著資產分類走，品項履歷才接得回這一台
      const isHardware = item.category_name === '硬體';
      const sn = item.sn || item.id;
      await logUpdate(isHardware ? 'HARDWARE' : 'DEVICE', sn, `${item.brand || ''} ${item.model || ''}`.trim(),
        `盤點表編輯${isHardware ? '硬體' : '設備'}詳細資訊 [${sn}]：${changes.map((c) => `${c.label}「${c.from || '空白'}」→「${c.to || '空白'}」`).join('、')}`,
        { id: item.id, sn: item.sn, source: '庫存盤點表', changes });
      window.dispatchEvent(new CustomEvent('db-update'));
      onSaved({ ...item, ...Object.fromEntries(Object.keys(LABELS).map((k) => [k, clean(form[k]) || null])) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'var(--bg-modal-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
      <div role="dialog" aria-label="編輯詳細資訊" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-main)', width: '560px', maxWidth: '95vw', padding: '28px', borderRadius: '16px', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--modal-shadow)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: '900', margin: 0 }}>編輯詳細資訊</h2>
          <X size={24} aria-label="關閉" style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={onClose} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: '6px 12px', padding: '12px 14px', borderRadius: '10px', backgroundColor: 'var(--bg-surface-subtle)', fontSize: '13px', marginBottom: '20px' }}>
          <span style={{ color: 'var(--text-muted)' }}>資產分類</span><span>{item.category_name}</span>
          <span style={{ color: 'var(--text-muted)' }}>廠牌 / 型號</span><span>{item.brand} {item.model}</span>
          <span style={{ color: 'var(--text-muted)' }}>序號 (S/N)</span><span style={{ fontFamily: 'monospace' }}>{item.sn}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {FIELDS.map((f) => (
            <div key={f.key}>
              <label htmlFor={`company-edit-${f.key}`} style={labelStyle}>{f.label}</label>
              <input
                id={`company-edit-${f.key}`}
                type="text"
                maxLength={f.maxLength}
                value={form[f.key]}
                list={f.key === 'end_user' ? 'company-edit-end-users' : undefined}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                style={inputStyle}
              />
            </div>
          ))}
          <datalist id="company-edit-end-users">
            {endUserOptions.map((u) => <option key={u} value={u} />)}
          </datalist>
          <div>
            <label htmlFor="company-edit-remarks" style={labelStyle}>備註 (Remarks)</label>
            <textarea
              id="company-edit-remarks"
              rows={3}
              value={form.remarks}
              onChange={(e) => setForm({ ...form, remarks: e.target.value })}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            廠牌、型號、序號等其他欄位請到設備或硬體列表修改。
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
          <button onClick={onClose} disabled={saving} style={{ padding: '10px 20px', backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '10px', cursor: 'pointer' }}>取消</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '10px 20px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Save size={16} /> {saving ? '儲存中...' : '儲存'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CompanyAssetEditModal;
