import React from 'react';
import WarrantyBadge from '../WarrantyBadge';

const fmt = (d) => (d ? new Date(d).toLocaleDateString() : '--');
const yearsTag = (n) => (n ? <span style={{ color: 'var(--text-muted)' }}>({n}年)</span> : null);

/**
 * 列表的保固資訊欄
 *
 *   I 進貨日期      P 安裝日期
 *   W 原廠保固到期   C 客戶保固到期
 *   S 系統日期（設備才有）
 *
 * 左邊是原廠保固（由進貨日期起算），右邊是客戶保固（由安裝日期起算）；
 * 到期日後面標出選的保固年數，沒選年數（手動填的到期日）就不標。
 */
const WarrantyInfoCell = ({ item, showSystemDate = false }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 8px' }}>
    <div><span style={{ color: '#8b5cf6', fontWeight: 'bold' }}>I:</span> {fmt(item.stock_date)}</div>
    <div><span style={{ color: '#3b82f6', fontWeight: 'bold' }}>P:</span> {fmt(item.installed_date)}</div>
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <span style={{ color: '#ef4444', fontWeight: 'bold' }}>W:</span>
      {fmt(item.warranty_expire)}
      {yearsTag(item.warranty_years)}
      <WarrantyBadge expireDate={item.warranty_expire} name="原廠保固" size={15} />
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>C:</span>
      {fmt(item.customer_warranty_expire)}
      {yearsTag(item.customer_warranty_years)}
      <WarrantyBadge expireDate={item.customer_warranty_expire} name="客戶保固" size={15} />
    </div>
    {showSystemDate && (
      <div><span style={{ color: '#10b981', fontWeight: 'bold' }}>S:</span> {fmt(item.system_date)}</div>
    )}
  </div>
);

export default WarrantyInfoCell;
