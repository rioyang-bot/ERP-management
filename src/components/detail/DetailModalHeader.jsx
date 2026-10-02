import React from 'react';
import './DetailModal.css';

/**
 * 單據明細視窗的標題區（進貨單明細、出貨單明細共用）
 *
 * 大標題「X單明細：單號」＋狀態標籤，下方一列時間等資訊，右上角「✕ 關閉」。
 *
 * @param {object} props
 * @param {React.ReactNode} props.icon 標題前的小圖示
 * @param {string} props.title 例如「進貨單明細」
 * @param {string} props.orderNo 單號
 * @param {{ label: string, tone: 'pending'|'done'|'closed'|'editing', testId?: string }[]} [props.badges]
 * @param {{ icon?: React.ReactNode, text: React.ReactNode }[]} [props.meta]
 * @param {() => void} props.onClose
 */
const DetailModalHeader = ({ icon, title, orderNo, badges = [], meta = [], onClose }) => (
  <div className="dm-header">
    <div>
      <h2 className="dm-title">
        {icon}
        {title}：{orderNo}
        {badges.filter(Boolean).map((b) => (
          <span key={b.label} className={`dm-badge dm-badge-${b.tone}`} data-testid={b.testId}>{b.label}</span>
        ))}
      </h2>
      {meta.length > 0 && (
        <div className="dm-meta">
          {meta.filter(Boolean).map((m, i) => (
            <span key={i}>{m.icon}{m.text}</span>
          ))}
        </div>
      )}
    </div>
    <button type="button" className="dm-close" onClick={onClose}>✕ 關閉</button>
  </div>
);

export default DetailModalHeader;
