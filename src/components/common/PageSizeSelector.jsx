import React from 'react';

export const PageSizeSelector = ({ pageSize, onChange }) => {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-muted)' }}>
      <span>顯示</span>
      <select
        value={pageSize}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          padding: '4px 8px',
          borderRadius: '6px',
          border: '1px solid var(--border-color)',
          backgroundColor: 'var(--bg-surface)',
          color: 'var(--text-main)',
          fontSize: '13px',
          fontWeight: 700,
          cursor: 'pointer',
          outline: 'none'
        }}
      >
        <option value={10}>10</option>
        <option value={20}>20</option>
        <option value={50}>50</option>
        <option value={100}>100</option>
      </select>
      <span>筆/頁</span>
    </div>
  );
};

export default PageSizeSelector;
