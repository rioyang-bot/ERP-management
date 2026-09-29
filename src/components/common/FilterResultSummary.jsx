import React from 'react';
import { Filter } from 'lucide-react';
import { summariseByStatus, describeFilters } from '../../utils/filterSummary';

/**
 * 篩選結果統計列
 *
 * 顯示在表格上方：總數加上各狀態的數量。
 * 設備與硬體兩個列表共用，不然兩邊的算法很快就會不一樣。
 */
const FilterResultSummary = ({ items, unit = '台', searchTerm, brandFilter, cardLabel, alsoIncluded = [] }) => {
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

      {/* 同一位客戶在匯入時有多種寫法，展開是自動的 ——
          不寫出來使用者會不懂為什麼搜「Niky」跑出「元大 郭沛晴」的設備。 */}
      {alsoIncluded.length > 0 && (
        <span style={{ flexBasis: '100%', fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
          已一併列出同一位聯絡人的其他客戶寫法：
          {alsoIncluded.map((name) => (
            <span
              key={name}
              style={{
                display: 'inline-block', margin: '0 4px',
                padding: '1px 8px', borderRadius: '10px',
                backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)',
                color: 'var(--text-main)',
              }}
            >
              {name}
            </span>
          ))}
        </span>
      )}
    </div>
  );
};

export default FilterResultSummary;
