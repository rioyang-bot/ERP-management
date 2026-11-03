import React from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';

/**
 * 點了卡片之後，在下面列出它底下的子卡片
 *
 *   依類型 → SERVER 底下的各廠牌
 *   依廠牌 → BLACKCORE 底下的各型號
 *   依型號 → 該型號底下的各規格
 *
 * 卡片區只列出這一層（不再同時顯示上一層的卡片，免得佔版面）。
 * 點子卡片：下方清單只剩那一組；再點一次取消，回到整張卡片的範圍。
 * 「返回上一層」回到原本的卡片。
 * 設備、硬體、耗材三個列表共用，各列表的統計欄位不同，由呼叫端轉成 stats。
 *
 * @param {string} parentTitle 點選的那張卡片，例如「SERVER」
 * @param {string} childLabel  子卡片是什麼，例如「廠牌」
 * @param {Array<{key: string, title: string, subtitle?: string, total: number,
 *   stats: Array<{label: string, value: number, color: string, title?: string}>}>} cards
 * @param {string|null} selectedKey
 * @param {(key: string|null) => void} onSelect
 * @param {() => void} [onBack] 返回上一層
 * @param {string} unit 「台」「個」
 */
const DrilldownCards = ({ parentTitle, childLabel, cards, selectedKey, onSelect, onBack, unit }) => {
  if (!cards || cards.length === 0) return null;

  return (
    <section
      aria-label={`${parentTitle} 的${childLabel}`}
      data-testid="drilldown-cards"
      style={{ width: '100%', marginTop: '4px' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '8px' }}>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 10px', borderRadius: '10px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-main)', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
          >
            <ArrowLeft size={12} /> 返回上一層
          </button>
        )}
        <ChevronRight size={14} />
        {parentTitle} 的{childLabel}（{cards.length}）
        {selectedKey && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            style={{ marginLeft: '6px', padding: '1px 8px', borderRadius: '10px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
          >
            顯示全部{childLabel}
          </button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '10px' }}>
        {cards.map((c) => {
          const isSelected = selectedKey === c.key;
          return (
            <button
              key={c.key}
              type="button"
              data-testid={`drilldown-card-${c.key}`}
              aria-pressed={isSelected}
              onClick={() => onSelect(isSelected ? null : c.key)}
              style={{
                textAlign: 'left', cursor: 'pointer', padding: '8px 10px', borderRadius: '10px',
                backgroundColor: isSelected ? 'var(--primary-bg, rgba(37, 99, 235, 0.08))' : 'var(--bg-surface)',
                border: isSelected ? '2px solid var(--primary-color)' : '1px solid var(--border-color)',
                boxShadow: isSelected ? '0 4px 12px rgba(37, 99, 235, 0.2)' : 'none',
                color: 'var(--text-main)', fontFamily: 'inherit',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                <span
                  title={c.title}
                  style={{ fontSize: '12px', fontWeight: 900, color: isSelected ? 'var(--primary-color)' : 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}
                >
                  {c.title}
                </span>
                <span style={{ fontSize: '10px', fontWeight: 800, color: isSelected ? 'var(--primary-color)' : 'var(--text-muted)', backgroundColor: 'var(--bg-surface-subtle)', padding: '1px 5px', borderRadius: '4px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  共 {c.total} {unit}
                </span>
              </div>
              {c.subtitle && (
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.subtitle}
                </div>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 8px', marginTop: '5px', fontSize: '10px' }}>
                {c.stats.map((s) => (
                  <span key={s.label} title={s.title} style={{ display: 'inline-flex', gap: '3px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{s.label}</span>
                    <span style={{ color: s.color, fontWeight: 800 }}>{s.value}</span>
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default DrilldownCards;

