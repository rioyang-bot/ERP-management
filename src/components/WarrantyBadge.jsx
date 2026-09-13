import React from 'react';
import { getWarrantyState } from '../utils/warranty';

/**
 * 保固狀態標記
 *
 * 依到期日顯示一個圓形小標記，讓人不必自己換算日期就看得出保固狀況：
 *   綠底「保」  保固內
 *   黃底「保」  90 天內即將到期
 *   紅底「過」  已過期
 *
 * 沒有填到期日就不顯示任何標記 —— 沒填不等於過期，標成紅色會造成誤判。
 * 判定規則在 src/utils/warranty.js。
 */

const STYLES = {
  VALID: { label: '保', bg: '#16a34a', text: '保固內' },
  EXPIRING: { label: '保', bg: '#f59e0b', text: '即將到期' },
  EXPIRED: { label: '過', bg: '#ef4444', text: '已過期' },
};

/**
 * @param {string|Date|null} expireDate 到期日
 * @param {string} [name] 保固名稱，用於滑鼠提示，例如「原廠保固」
 * @param {number} [size] 圓形直徑（像素）
 * @param {Date} [today] 便於測試指定基準日
 */
const WarrantyBadge = ({ expireDate, name = '保固', size = 16, today }) => {
  const state = getWarrantyState(expireDate, today);
  if (!state) return null;

  const style = STYLES[state.status];
  const dateText = new Date(expireDate).toLocaleDateString();
  const tip = state.status === 'EXPIRED'
    ? `${name}${style.text}：${dateText}（已過 ${Math.abs(state.days)} 天）`
    : `${name}${style.text}：${dateText}（剩 ${state.days} 天）`;

  return (
    <span
      title={tip}
      aria-label={tip}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: `${size}px`, height: `${size}px`, borderRadius: '50%',
        backgroundColor: style.bg, color: '#fff',
        fontSize: `${Math.round(size * 0.62)}px`, fontWeight: 900,
        lineHeight: 1, flexShrink: 0, verticalAlign: 'middle',
        // 深色底上的白字在淺色主題也要看得清楚
        textShadow: '0 0 1px rgba(0,0,0,0.25)',
      }}
    >
      {style.label}
    </span>
  );
};

export default WarrantyBadge;
