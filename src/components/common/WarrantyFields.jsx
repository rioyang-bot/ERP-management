import React from 'react';
import { WARRANTY_YEAR_OPTIONS, addYears } from '../../utils/warranty';

/**
 * 設備／硬體編輯視窗的日期與保固欄位
 *
 *   進貨日期 (Stock Date)        安裝日期 (Project Date)
 *   原廠保固(年)                 客戶保固(年)
 *   原廠保固到期 (Warranty Expire) 客戶保固到期 (Cust Warranty)
 *
 * 左邊一路是原廠保固（進貨日期 + 年數），右邊是客戶保固（安裝日期 + 年數）。
 * 有選年數、也有基準日期時到期日自動算、不能手改；沒選年數就照舊手動填。
 * 進貨日期由確認進貨、安裝日期由出貨自動寫入，兩者都可以在這裡再改。
 *
 * @param {object} value    編輯中的資產（用到 stock_date、installed_date、warranty_years…）
 * @param {(patch: object) => void} onChange 只傳有變的欄位
 */
const WarrantyFields = ({ value, onChange, labelStyle, inputStyle, style }) => {
  const v = value || {};
  const hintStyle = { display: 'block', marginTop: '4px', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' };

  const yearsSelect = (field, label) => (
    <label style={labelStyle}>
      {label}
      <select
        value={v[field] ?? ''}
        onChange={(e) => onChange({ [field]: e.target.value })}
        style={inputStyle}
      >
        <option value="">未設定（到期日手動填）</option>
        {WARRANTY_YEAR_OPTIONS.map((n) => <option key={n} value={String(n)}>{n} 年</option>)}
      </select>
    </label>
  );

  const expireInput = (field, label, baseDate, years, baseLabel) => {
    const auto = addYears(baseDate, years);
    let hint = null;
    if (auto) hint = `自動計算：${baseLabel} + ${years} 年`;
    else if (years) hint = `請先填${baseLabel}，才會自動計算`;
    // 提示放在 label 外面，欄位名稱才不會連提示文字一起念出來
    return (
      <div>
        <label style={labelStyle}>
          {label}
          <input
            type="date"
            value={auto || v[field] || ''}
            readOnly={!!auto}
            onChange={(e) => { if (!auto) onChange({ [field]: e.target.value }); }}
            style={auto ? { ...inputStyle, backgroundColor: 'var(--bg-surface-subtle)', cursor: 'not-allowed' } : inputStyle}
          />
        </label>
        {hint && <span style={hintStyle}>{hint}</span>}
      </div>
    );
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', ...style }}>
      <label style={labelStyle}>
        進貨日期 (Stock Date)
        <input type="date" value={v.stock_date || ''} onChange={(e) => onChange({ stock_date: e.target.value })} style={inputStyle} />
      </label>
      <label style={labelStyle}>
        安裝日期 (Project Date)
        <input type="date" value={v.installed_date || ''} onChange={(e) => onChange({ installed_date: e.target.value })} style={inputStyle} />
      </label>
      {yearsSelect('warranty_years', '原廠保固(年)')}
      {yearsSelect('customer_warranty_years', '客戶保固(年)')}
      {expireInput('warranty_expire', '原廠保固到期 (Warranty Expire)', v.stock_date, v.warranty_years, '進貨日期')}
      {expireInput('customer_warranty_expire', '客戶保固到期 (Cust Warranty)', v.installed_date, v.customer_warranty_years, '安裝日期')}
    </div>
  );
};

export default WarrantyFields;
