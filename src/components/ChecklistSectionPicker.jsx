import React from 'react';
import { EXPORT_SECTIONS } from '../utils/checklistSections';

/**
 * 出機檢查表「輸出內容」勾選：列印與匯出 Word 要包含哪些區塊（見 utils/checklistSections.js）
 * 出機檢查表視窗與列印預覽共用同一份勾選。
 *
 * @param {object}   props
 * @param {object}   props.sections 目前的勾選 { info: true, ... }
 * @param {Function} props.onToggle (id) => void
 * @param {boolean}  [props.showMac] 這台設備需要 MAC 表才列出「MAC 表」
 */
const ChecklistSectionPicker = ({ sections, onToggle, showMac = false }) => {
  const list = EXPORT_SECTIONS.filter((s) => s.id !== 'mac' || showMac);
  const none = !list.some((s) => sections[s.id]);
  return (
    <div
      style={{ display: 'flex', alignItems: 'center', gap: '4px 12px', flexWrap: 'wrap', fontSize: '12px' }}
      role="group"
      aria-label="列印與匯出 Word 的內容"
      data-testid="checklist-section-picker"
    >
      <span style={{ fontWeight: 800, color: 'var(--text-muted)' }}>輸出內容：</span>
      {list.map((s) => (
        <label key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 700, color: 'var(--text-main)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={Boolean(sections[s.id])} onChange={() => onToggle(s.id)} aria-label={`輸出 ${s.label}`} />
          {s.label}
        </label>
      ))}
      {none && <span style={{ color: '#ef4444', fontWeight: 700 }}>請至少勾選一項</span>}
    </div>
  );
};

export default ChecklistSectionPicker;
