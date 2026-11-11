import React from 'react';
import { summarizeItems } from '../../utils/itemSearch';

const MAX_SHOWN = 3;

/** 單據列表用品項搜尋時，在那一列底下標出是哪些明細符合 */
const MatchedItemsHint = ({ items, testId }) => {
  if (!items || items.length === 0) return null;
  const groups = summarizeItems(items);
  const shown = groups.slice(0, MAX_SHOWN);
  return (
    <div data-testid={testId} style={{ marginTop: '4px', fontSize: '0.75rem', color: '#7c3aed', fontWeight: 700, lineHeight: 1.5, whiteSpace: 'normal', minWidth: '160px' }}>
      符合：{shown.map((g) => `${g.label} ×${g.qty}`).join('、')}
      {groups.length > MAX_SHOWN && ` 等 ${groups.length} 種`}
    </div>
  );
};

export default MatchedItemsHint;
