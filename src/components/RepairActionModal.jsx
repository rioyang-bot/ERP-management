import React, { useState, useEffect } from 'react';
import { 
  X, Send, PackageCheck, CheckCircle2, AlertCircle, Calendar, 
  FileText, Truck, Wrench, ShieldCheck
} from 'lucide-react';
import { logStatusChange, logUpdate } from '../utils/auditLogger';

const QUICK_RESULTS = [
  '原廠修復寄回',
  'OS 重灌 RH 9.6 H 100 Driver check ok / Mellanx Nic Driver Check OK',
  '更換主機板 / 水冷模組修復寄回',
  '更換電源供應器 (Power Supply) 修復寄回',
  '韌體更新 / 壓力測試 Pass 正常寄回',
  '原廠更換良品寄回'
];

/**
 * 維修單狀態推進確認彈窗
 * actionType: 'SEND_OEM' | 'OEM_RETURN' | 'COMPLETE'
 */
const RepairActionModal = ({ isOpen, onClose, repairOrder, actionType, onSuccess }) => {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [results, setResults] = useState('');
  const [remarks, setRemarks] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && repairOrder) {
      setDate(new Date().toISOString().split('T')[0]);
      setResults(repairOrder.results || '');
      setRemarks(repairOrder.remarks || '');
      setError('');
    }
  }, [isOpen, repairOrder]);

  if (!isOpen || !repairOrder) return null;

  const getActionConfig = () => {
    switch (actionType) {
      case 'SEND_OEM':
        return {
          title: '送修原廠確認 (Send to OEM)',
          subtitle: '確認將故障設備寄出送修原廠，系統將寫入「Send OEM Date」並將設備狀態設為「維修 (REPAIRING)」。',
          icon: <Truck size={22} />,
          themeColor: '#d97706',
          themeBg: 'rgba(217, 119, 6, 0.12)',
          dateLabel: '送原廠日期 (Send OEM Date) *',
          submitText: '確認送修原廠 (設為維修中)'
        };
      case 'OEM_RETURN':
        return {
          title: '原廠修復寄回確認 (OEM Return)',
          subtitle: '確認原廠已修復寄回，系統將寫入「OEM Return Date」與「Results」，並將設備狀態設為「在庫 (ACTIVE)」。',
          icon: <Wrench size={22} />,
          themeColor: '#10b981',
          themeBg: 'rgba(16, 185, 129, 0.12)',
          dateLabel: '原廠修復寄回日期 (OEM Return Date) *',
          submitText: '確認原廠返還 (設為在庫)'
        };
      case 'COMPLETE':
        return {
          title: '客戶出貨/完工確認 (Completion & Ship)',
          subtitle: '確認維修完成並出貨返還客戶，系統將寫入「Completion Date」並將設備狀態設為「出庫 (SHIPPED)」。',
          icon: <PackageCheck size={22} />,
          themeColor: '#3b82f6',
          themeBg: 'rgba(59, 130, 246, 0.12)',
          dateLabel: '客戶出貨/完工日期 (Completion Date) *',
          submitText: '確認出貨完工 (設為出庫)'
        };
      default:
        return {
          title: '處理確認',
          subtitle: '',
          icon: <CheckCircle2 size={22} />,
          themeColor: 'var(--primary-color)',
          themeBg: 'rgba(37, 99, 235, 0.12)',
          dateLabel: '處理日期 *',
          submitText: '確認'
        };
    }
  };

  const config = getActionConfig();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!date) {
      setError('請填寫日期');
      return;
    }

    if (actionType === 'OEM_RETURN' && !results.trim()) {
      setError('請填寫維修結果 / 檢測說明 (Results)');
      return;
    }

    try {
      setIsSubmitting(true);

      const items = repairOrder.items || [];

      if (actionType === 'SEND_OEM') {
        // 1. 寫入 Send OEM Date，更新為 SENT_OEM
        const res = await window.electronAPI.namedQuery('updateRepairSendOEM', [
          date,
          remarks.trim() || null,
          repairOrder.id
        ]);
        if (!res.success) throw new Error(res.error || '更新送修狀態失敗');

        // 2. 將該維修單下的設備序號全部改為 REPAIRING (維修)
        for (const item of items) {
          if (item.sn) {
            await window.electronAPI.namedQuery('updateAssetStatusBySn', ['REPAIRING', item.sn.trim()]);
            await logStatusChange('DEVICE', item.sn.trim(), item.sn.trim(), 'ACTIVE', 'REPAIRING', `維修單 [${repairOrder.repair_no}] 寄出送修原廠`);
          }
        }
      } else if (actionType === 'OEM_RETURN') {
        // 1. 寫入 OEM Return Date 與 Results，更新為 OEM_RETURNED
        const res = await window.electronAPI.namedQuery('updateRepairOEMReturn', [
          date,
          results.trim(),
          remarks.trim() || null,
          repairOrder.id
        ]);
        if (!res.success) throw new Error(res.error || '更新原廠返還狀態失敗');

        // 2. 將該維修單下的設備序號全部改為 ACTIVE (在庫)
        for (const item of items) {
          if (item.sn) {
            await window.electronAPI.namedQuery('updateAssetStatusBySn', ['ACTIVE', item.sn.trim()]);
            await logStatusChange('DEVICE', item.sn.trim(), item.sn.trim(), 'REPAIRING', 'ACTIVE', `維修單 [${repairOrder.repair_no}] 原廠修復寄回入庫檢測`);
          }
        }
      } else if (actionType === 'COMPLETE') {
        // 1. 寫入 Completion Date，更新為 COMPLETED
        const res = await window.electronAPI.namedQuery('updateRepairCompleted', [
          date,
          remarks.trim() || null,
          repairOrder.id
        ]);
        if (!res.success) throw new Error(res.error || '更新出貨完工狀態失敗');

        // 2. 將該維修單下的設備序號全部改為 SHIPPED (出庫)
        for (const item of items) {
          if (item.sn) {
            await window.electronAPI.namedQuery('updateAssetStatusBySn', ['SHIPPED', item.sn.trim()]);
            await logStatusChange('DEVICE', item.sn.trim(), item.sn.trim(), 'ACTIVE', 'SHIPPED', `維修單 [${repairOrder.repair_no}] 維修完畢出貨返還客戶 [${repairOrder.customer_name}]`);
          }
        }
      }

      // 寫入一般異動日誌
      await logUpdate('REPAIR', repairOrder.repair_no, repairOrder.customer_name, `執行操作 [${config.title}]，單號: ${repairOrder.repair_no}`);

      alert(`✅ 操作成功！維修單 [${repairOrder.repair_no}] 狀態已更新。`);
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error('Repair action error:', err);
      setError('操作失敗：' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'var(--bg-modal-overlay)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-color)',
        borderRadius: '20px',
        width: '95vw',
        maxWidth: '680px',
        boxShadow: 'var(--modal-shadow)',
        overflow: 'hidden',
        color: 'var(--text-main)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Modal 頂部標題 */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-color)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              backgroundColor: config.themeBg,
              color: config.themeColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {config.icon}
            </div>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>
                {config.title}
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                維修單號: <strong>{repairOrder.repair_no}</strong> ｜ 客戶: <strong>{repairOrder.customer_name}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-subtle)',
              padding: '6px'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal 內容 */}
        <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {error && (
            <div style={{
              padding: '10px 14px',
              borderRadius: '8px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#ef4444',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <div style={{
            padding: '12px 16px',
            borderRadius: '10px',
            backgroundColor: config.themeBg,
            color: config.themeColor,
            fontSize: '13px',
            lineHeight: '1.5'
          }}>
            {config.subtitle}
          </div>

          {/* 包含設備清單預覽 */}
          <div style={{
            backgroundColor: 'var(--bg-surface-subtle)',
            padding: '12px 16px',
            borderRadius: '10px',
            border: '1px solid var(--border-color)'
          }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>
              本次連動設備 ({repairOrder.items?.length || 0} 台)：
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {(repairOrder.items || []).map((it, idx) => (
                <span
                  key={idx}
                  style={{
                    fontSize: '12px',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-color)',
                    fontWeight: 600
                  }}
                >
                  {it.brand} {it.model} ({it.sn})
                </span>
              ))}
            </div>
          </div>

          {/* 日期欄位 */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px' }}>
              {config.dateLabel}
            </label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-surface-subtle)',
                color: 'var(--text-main)',
                fontSize: '14px'
              }}
            />
          </div>

          {/* 若為原廠返還，需填寫維修結果 (Results) */}
          {actionType === 'OEM_RETURN' && (
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px' }}>
                維修結果 / 檢測說明 (Results) *
              </label>
              <textarea
                rows={3}
                required
                value={results}
                onChange={(e) => setResults(e.target.value)}
                placeholder="例如: OS 重灌 RH 9.6 H 100 Driver check ok / 原廠更換主機板修復寄回"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-surface-subtle)',
                  color: 'var(--text-main)',
                  fontSize: '13px',
                  resize: 'vertical'
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>常用結果：</span>
                {QUICK_RESULTS.map((r, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setResults(r)}
                    style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--text-muted)',
                      fontSize: '11px',
                      cursor: 'pointer'
                    }}
                  >
                    + {r}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 備註 */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>
              備註說明 (Remarks / 物流單號)
            </label>
            <input
              type="text"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="例如: 黑貓單號 123456789 / 原廠 RMA #98765"
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-surface-subtle)',
                color: 'var(--text-main)',
                fontSize: '13px'
              }}
            />
          </div>

          {/* 底部按鈕 */}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            marginTop: '8px',
            paddingTop: '16px',
            borderTop: '1px solid var(--border-color)'
          }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                padding: '10px 20px',
                borderRadius: '10px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-main)',
                fontWeight: 600,
                fontSize: '14px',
                cursor: 'pointer'
              }}
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: '10px 24px',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: config.themeColor,
                color: '#fff',
                fontWeight: 800,
                fontSize: '14px',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: `0 4px 14px ${config.themeColor}55`
              }}
            >
              {config.icon}
              {isSubmitting ? '處理中...' : config.submitText}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RepairActionModal;
