import React, { useState, useEffect } from 'react';
import { 
  X, RefreshCw, CheckCircle2, AlertCircle, Calendar, FileText, 
  Cpu, Server, ArrowRight, ShieldCheck, Tag, Box, Info 
} from 'lucide-react';
import { performInPlaceReplacement, performOneToOneReplacement, validateNewSn } from '../utils/rmaService';

/**
 * 原廠 RMA 換新品雙模式更換序號彈窗
 */
const RmaReplacementModal = ({ isOpen, onClose, asset, onSuccess }) => {
  const [mode, setMode] = useState('IN_PLACE'); // 'IN_PLACE' | 'ONE_TO_ONE'
  const [newSn, setNewSn] = useState('');
  const [replaceDate, setReplaceDate] = useState(new Date().toISOString().split('T')[0]);
  const [rmaNo, setRmaNo] = useState('');
  const [remarks, setRemarks] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && asset) {
      setMode('IN_PLACE');
      setNewSn('');
      setReplaceDate(new Date().toISOString().split('T')[0]);
      setRmaNo('');
      setRemarks('');
      setError('');
    }
  }, [isOpen, asset]);

  if (!isOpen || !asset) return null;

  const mountedComponentsCount = Array.isArray(asset.components) 
    ? asset.components.length 
    : (asset._origComponents ? asset._origComponents.length : 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const cleanNewSn = newSn.trim();
    if (!cleanNewSn) {
      setError('請輸入原廠新品序號！');
      return;
    }

    if (cleanNewSn.toUpperCase() === (asset.sn || '').trim().toUpperCase()) {
      setError('新序號不可與當前舊序號完全相同！');
      return;
    }

    try {
      setIsSubmitting(true);

      const rmaDetails = {
        date: replaceDate,
        rmaNo: rmaNo.trim(),
        remarks: remarks.trim()
      };

      if (mode === 'IN_PLACE') {
        await performInPlaceReplacement(asset, cleanNewSn, rmaDetails);
        alert(`✅ 序號更換成功！\n\n已將 [${asset.brand} ${asset.model}] 序號由「${asset.sn || '無序號'}」直接更換為「${cleanNewSn}」。${mountedComponentsCount > 0 ? `\n已同步連動 ${mountedComponentsCount} 件掛載硬體之伺服器序號。` : ''}`);
      } else {
        await performOneToOneReplacement(asset, cleanNewSn, rmaDetails);
        alert(`✅ RMA 一換一換新處理成功！\n\n舊品 [${asset.sn || '無序號'}] 已結案標記為報廢；\n新品 [${cleanNewSn}] 已建立入庫並設為在庫狀態。${mountedComponentsCount > 0 ? `\n已將 ${mountedComponentsCount} 件掛載硬體自動轉移綁定至新設備。` : ''}`);
      }

      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error('RMA Replacement error:', err);
      setError(err.message || '操作失敗，請檢查輸入內容');
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
      zIndex: 1100,
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-color)',
        borderRadius: '20px',
        width: '95vw',
        maxWidth: '680px',
        maxHeight: '90vh',
        boxShadow: 'var(--modal-shadow)',
        overflowY: 'auto',
        color: 'var(--text-main)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Modal 標題區 */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-color)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              backgroundColor: 'rgba(37, 99, 235, 0.12)',
              color: 'var(--primary-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <RefreshCw size={22} />
            </div>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 900, margin: 0, color: 'var(--text-main)' }}>
                原廠換新 / 更換序號 (RMA Serial Replacement)
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                當設備或硬體送修後由原廠提供新品或良品寄回時，請選擇合適的換號模式。
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* 內容區 */}
        <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {error && (
            <div style={{
              padding: '12px 16px',
              borderRadius: '10px',
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#ef4444',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* 當前目標資產資訊小卡 */}
          <div style={{
            padding: '14px 16px',
            backgroundColor: 'var(--bg-surface-subtle)',
            borderRadius: '12px',
            border: '1px solid var(--border-color)',
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '12px',
            fontSize: '13px'
          }}>
            <div>
              <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>品項 / 型號：</span>
              <div style={{ fontWeight: 800, color: 'var(--text-main)', marginTop: '2px' }}>
                {asset.brand} {asset.model} <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>({asset.type || '未分類'})</span>
              </div>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>目前序號 (Current SN)：</span>
              <div style={{ fontWeight: 800, color: '#d97706', marginTop: '2px', fontFamily: 'monospace' }}>
                {asset.sn || '無序號'}
              </div>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>客戶 / End-user：</span>
              <div style={{ fontWeight: 600, color: 'var(--text-main)', marginTop: '2px' }}>
                {asset.client || '未指定'} {asset.end_user ? `(End: ${asset.end_user})` : ''}
              </div>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>掛載硬體零組件：</span>
              <div style={{ fontWeight: 700, color: mountedComponentsCount > 0 ? 'var(--primary-color)' : 'var(--text-muted)', marginTop: '2px' }}>
                {mountedComponentsCount > 0 ? `${mountedComponentsCount} 件（將自動連動新序號）` : '無掛載硬體'}
              </div>
            </div>
          </div>

          {/* 模式選擇器 (雙卡片對照切換) */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: 'var(--text-main)', marginBottom: '8px' }}>
              選擇更換處理模式 (Replacement Mode) *
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              {/* 模式一 */}
              <div
                onClick={() => setMode('IN_PLACE')}
                style={{
                  padding: '14px',
                  borderRadius: '12px',
                  border: mode === 'IN_PLACE' ? '2px solid var(--primary-color)' : '1px solid var(--border-color)',
                  backgroundColor: mode === 'IN_PLACE' ? 'rgba(37, 99, 235, 0.08)' : 'var(--bg-surface)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  position: 'relative'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <Tag size={16} color={mode === 'IN_PLACE' ? 'var(--primary-color)' : 'var(--text-muted)'} />
                  <span style={{ fontSize: '14px', fontWeight: 800, color: mode === 'IN_PLACE' ? 'var(--primary-color)' : 'var(--text-main)' }}>
                    模式一：直接更換序號
                  </span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                  就地換號，完整保留既有合約歷程、出入庫日誌與掛載關係。最簡便直覺。
                </p>
                {mode === 'IN_PLACE' && (
                  <div style={{ position: 'absolute', top: '10px', right: '10px', color: 'var(--primary-color)' }}>
                    <CheckCircle2 size={16} />
                  </div>
                )}
              </div>

              {/* 模式二 */}
              <div
                onClick={() => setMode('ONE_TO_ONE')}
                style={{
                  padding: '14px',
                  borderRadius: '12px',
                  border: mode === 'ONE_TO_ONE' ? '2px solid #10b981' : '1px solid var(--border-color)',
                  backgroundColor: mode === 'ONE_TO_ONE' ? 'rgba(16, 185, 129, 0.08)' : 'var(--bg-surface)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  position: 'relative'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <Box size={16} color={mode === 'ONE_TO_ONE' ? '#10b981' : 'var(--text-muted)'} />
                  <span style={{ fontSize: '14px', fontWeight: 800, color: mode === 'ONE_TO_ONE' ? '#10b981' : 'var(--text-main)' }}>
                    模式二：RMA 一換一更換
                  </span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                  舊品結案標記為報廢並封存歷史；系統自動建立新品入庫並轉移零組件。符合嚴格盤點。
                </p>
                {mode === 'ONE_TO_ONE' && (
                  <div style={{ position: 'absolute', top: '10px', right: '10px', color: '#10b981' }}>
                    <CheckCircle2 size={16} />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 表單輸入欄位 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '6px' }}>
                原廠新品序號 (New Serial Number) *
              </label>
              <input
                type="text"
                autoFocus
                placeholder="請輸入或掃描原廠新品序號"
                value={newSn}
                onChange={(e) => setNewSn(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1.5px solid var(--input-border)',
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--input-text)',
                  fontSize: '14px',
                  fontWeight: 700,
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '6px' }}>
                更換 / 返還日期 *
              </label>
              <input
                type="date"
                value={replaceDate}
                onChange={(e) => setReplaceDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1.5px solid var(--input-border)',
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--input-text)',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '6px' }}>
              原廠 RMA / 工單號碼 (RMA No.) <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>(選填)</span>
            </label>
            <input
              type="text"
              placeholder="例如: RMA-20260909-001 或 原廠維修單號"
              value={rmaNo}
              onChange={(e) => setRmaNo(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid var(--input-border)',
                backgroundColor: 'var(--input-bg)',
                color: 'var(--input-text)',
                fontSize: '13px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '6px' }}>
              換新原因與檢測備註 (Remarks) <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>(選填)</span>
            </label>
            <textarea
              rows={3}
              placeholder="請填寫換新原因或原廠檢測說明..."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--input-border)',
                backgroundColor: 'var(--input-bg)',
                color: 'var(--input-text)',
                fontSize: '13px',
                outline: 'none',
                resize: 'vertical',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* 模式影響小叮嚀 */}
          <div style={{
            padding: '10px 14px',
            backgroundColor: 'var(--bg-surface-subtle)',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            fontSize: '12px',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <Info size={16} color="var(--primary-color)" style={{ flexShrink: 0 }} />
            <div>
              {mode === 'IN_PLACE' ? (
                <span>此操作將在原有資產上記錄 RMA 歷程，並自動同步更新所有關聯硬體的伺服器序號。</span>
              ) : (
                <span>此操作將把舊品標記為報廢換出，並建立一筆新品入庫；原伺服器之掛載硬體將自動轉移至新品上。</span>
              )}
            </div>
          </div>

          {/* 按鈕操作區 */}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            marginTop: '8px',
            borderTop: '1px solid var(--border-color)',
            paddingTop: '16px'
          }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                padding: '10px 18px',
                borderRadius: '10px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-main)',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: '10px 22px',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: mode === 'IN_PLACE' ? 'var(--primary-color)' : '#10b981',
                color: '#fff',
                fontSize: '13px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: mode === 'IN_PLACE' ? '0 4px 12px rgba(37, 99, 235, 0.3)' : '0 4px 12px rgba(16, 185, 129, 0.3)',
                opacity: isSubmitting ? 0.7 : 1
              }}
            >
              {isSubmitting ? '處理中...' : (
                mode === 'IN_PLACE' ? '確認直接更換序號' : '確認一換一換新入庫'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RmaReplacementModal;
