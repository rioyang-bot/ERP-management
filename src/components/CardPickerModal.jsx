import React, { useState, useEffect, useMemo } from 'react';
import { X, Search, Layers } from 'lucide-react';

/**
 * 從既有卡片選取
 *
 * 建檔時最常見的情況是「再登記一台同款的」，逐欄挑類型／廠牌／型號／規格很繁瑣。
 * 這裡列出目前實際存在的卡片，選一張就把四個欄位一次帶入。
 *
 * 清單來源與建檔下拉一致，都是既有卡片，因此看得到的組合一定是有效的。
 */
const CardPickerModal = ({ isOpen, onClose, category, onSelect }) => {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [term, setTerm] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setTerm('');
    (async () => {
      try {
        const res = await window.electronAPI.namedQuery('fetchExistingCards', [category]);
        if (!cancelled && res?.success) setCards(res.rows || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, category]);

  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    if (!t) return cards;
    // 空白分隔的多個關鍵字都要命中，方便用「廠牌 型號」快速縮小範圍
    const parts = t.split(/\s+/);
    return cards.filter((c) => {
      const hay = `${c.brand} ${c.type} ${c.model} ${c.specification}`.toLowerCase();
      return parts.every((p) => hay.includes(p));
    });
  }, [cards, term]);

  if (!isOpen) return null;

  const th = {
    textAlign: 'left', padding: '8px 10px', fontSize: '12px', fontWeight: 800,
    color: 'var(--text-muted)', borderBottom: '2px solid var(--border-color)',
    position: 'sticky', top: 0, backgroundColor: 'var(--bg-surface)',
  };
  const td = {
    padding: '9px 10px', fontSize: '13px', color: 'var(--text-main)',
    borderBottom: '1px solid var(--table-border)',
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, backgroundColor: 'var(--bg-modal-overlay)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1100, backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)',
          color: 'var(--text-main)', width: '720px', maxWidth: '95vw', maxHeight: '82vh',
          padding: '24px 28px', borderRadius: '16px', boxShadow: 'var(--modal-shadow)',
          display: 'flex', flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 900, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={20} color="var(--primary-color)" /> 從既有{category}卡片選取
          </h2>
          <X size={20} style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={onClose} />
        </div>

        <p style={{ margin: '0 0 14px', fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          選一張卡片，即可一次帶入類型、廠牌、型號與規格，不必逐欄挑選。
          清單只列出目前實際存在的卡片。
        </p>

        <div style={{ position: 'relative', marginBottom: '12px' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
          <input
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="搜尋廠牌、類型、型號或規格（可用空白分隔多個關鍵字）"
            style={{
              width: '100%', padding: '10px 12px 10px 38px', borderRadius: '8px',
              border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)',
              color: 'var(--input-text)', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>載入中...</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {cards.length === 0 ? `目前沒有任何${category}卡片，請直接在下方欄位新增。` : '沒有符合的卡片'}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>廠牌</th>
                  <th style={th}>類型</th>
                  <th style={th}>型號</th>
                  <th style={th}>規格</th>
                  <th style={{ ...th, textAlign: 'right' }}>數量</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr
                    key={`${c.brand}|${c.type}|${c.model}|${c.specification}`}
                    onClick={() => { onSelect(c); onClose(); }}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-surface-subtle)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    <td style={{ ...td, fontWeight: 800 }}>{c.brand}</td>
                    <td style={td}>{c.type}</td>
                    <td style={td}>{c.model}</td>
                    <td style={{ ...td, color: 'var(--text-muted)' }}>{c.specification || '—'}</td>
                    <td style={{ ...td, textAlign: 'right', color: 'var(--text-muted)' }}>{c.asset_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
          共 {filtered.length} 張卡片{term && `（已篩選，全部 ${cards.length} 張）`}
        </div>
      </div>
    </div>
  );
};

export default CardPickerModal;
