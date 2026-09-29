import React from 'react';
import { Filter } from 'lucide-react';
import { summariseByStatus, describeFilters } from '../../utils/filterSummary';

/**
 * 篩選結果統計列
 *
 * 顯示在表格上方：總數加上各狀態的數量。
 * 設備與硬體兩個列表共用，不然兩邊的算法很快就會不一樣。
 */
const FilterResultSummary = ({ items, unit = '台', searchTerm, brandFilter, cardLabel }) => {
  const { total, groups } = summariseByStatus(items);
  const desc = describeFilters({ searchTerm, brandFilter, cardLabel });

  return (
    <div
      data-testid="filter-result-summary"
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '8px 14px',
        padding: '10px 14px',
        marginBottom: '12px',
        borderRadius: '10px',
        border: '1px solid var(--border-color)',
        backgroundColor: 'var(--bg-surface-subtle)',
        fontSize: '13px',
        color: 'var(--text-main)',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontWeight: 700 }}>
        <Filter size={14} />
        {desc ? <>以「<span style={{ color: 'var(--text-main)' }}>{desc}</span>」篩選</> : '篩選結果'}
      </span>

      <span style={{ fontWeight: 800 }}>
        共 <span style={{ fontSize: '15px', fontVariantNumeric: 'tabular-nums' }}>{total}</span> {unit}
      </span>

      {groups.length > 0 && (
        <span style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          {groups.map(({ key, label, color, count }) => (
            <span key={key} style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)' }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
              {label}
              <strong style={{ color, fontVariantNumeric: 'tabular-nums' }}>{count}</strong>
            </span>
          ))}
        </span>
      )}
    </div>
  );
};

export default FilterResultSummary;
