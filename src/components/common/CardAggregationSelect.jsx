import React from 'react';

/**
 * 卡片聚合規則的下拉選單
 *
 * 原本是一排按鈕，選項一多就把工具列擠滿，而且哪一個是目前生效的
 * 得靠底色分辨。改成下拉選單後只佔一格，目前的規則直接寫在上面。
 *
 * 設備、硬體、耗材三個列表共用，選項由呼叫端指定。
 *
 * @param {string} value    目前套用的規則
 * @param {(mode: string) => void} onChange
 * @param {Array<{value: string, label: string, title: string}>} modes
 */
const CardAggregationSelect = ({ value, onChange, modes }) => {
  const current = modes.find((m) => m.value === value);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '6px',
      backgroundColor: 'var(--bg-surface-subtle)', padding: '3px 8px',
      borderRadius: '12px', border: '1px solid var(--border-color)',
    }}>
      <label
        htmlFor="card-aggregation-mode"
        style={{ fontSize: '12px', fontWeight: '800', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}
      >
        聚合規則:
      </label>
      <select
        id="card-aggregation-mode"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        // 選單收合時看不到各選項的說明，把目前這一項的說明掛在選單上
        title={current?.title || ''}
        style={{
          padding: '5px 8px',
          borderRadius: '7px',
          border: '1px solid var(--border-color)',
          backgroundColor: 'var(--bg-surface)',
          color: 'var(--text-main)',
          fontSize: '11px',
          fontWeight: '800',
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        {modes.map((m) => (
          <option key={m.value} value={m.value} title={m.title}>{m.label}</option>
        ))}
      </select>
    </div>
  );
};

export default CardAggregationSelect;
