import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  ShieldCheck, 
  RefreshCw, 
  X, 
  Search, 
  ExternalLink, 
  ChevronRight, 
  PlusCircle, 
  Edit, 
  Trash2, 
  ArrowRightLeft, 
  Layers, 
  Clock, 
  User, 
  Radio, 
  ChevronDown,
  Copy,
  Check
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MODULE_MAP } from '../../utils/auditLogger';

const LiveEventDrawer = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAction, setSelectedAction] = useState('ALL');
  const [expandedLogId, setExpandedLogId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const drawerRef = useRef(null);

  // 取得最新 24 小時內即時事件紀錄
  const fetchRecentLogs = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setRefreshing(true);
    try {
      if (window.electronAPI && typeof window.electronAPI.namedQuery === 'function') {
        const res = await window.electronAPI.namedQuery('fetchLiveAuditLogs');
        if (res.success) {
          setLogs(res.rows || []);
        } else {
          // Fallback if fetchLiveAuditLogs isn't registered yet
          const fallbackRes = await window.electronAPI.namedQuery('fetchAuditLogs');
          if (fallbackRes.success) {
            const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
            const recent = (fallbackRes.rows || []).filter(r => new Date(r.timestamp).getTime() >= twentyFourHoursAgo);
            setLogs(recent);
          }
        }
      }
    } catch (err) {
      console.error('[LiveEventDrawer] Fetch error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // 當抽屜開啟時抓取，並啟動定時輪詢與事件監聽
  useEffect(() => {
    if (isOpen) {
      fetchRecentLogs();

      // 5秒即時輪詢
      const interval = setInterval(() => {
        fetchRecentLogs(true);
      }, 5000);

      // 監聽全域資料庫異動事件
      const handleDbUpdate = () => {
        fetchRecentLogs(true);
      };
      window.addEventListener('db-update', handleDbUpdate);

      return () => {
        clearInterval(interval);
        window.removeEventListener('db-update', handleDbUpdate);
      };
    }
  }, [isOpen, fetchRecentLogs]);

  // 鍵盤 ESC 關閉
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // 相對時間計算
  const getRelativeTime = (timestamp) => {
    const now = new Date();
    const past = new Date(timestamp);
    const diffInSeconds = Math.floor((now - past) / 1000);

    if (diffInSeconds < 30) return '剛剛';
    if (diffInSeconds < 60) return `${diffInSeconds} 秒前`;
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes} 分鐘前`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} 小時前`;
    return past.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // 動作樣式
  const getActionBadge = (actionType) => {
    switch (actionType) {
      case 'CREATE':
        return {
          label: '新增',
          icon: <PlusCircle size={13} />,
          bg: 'rgba(16, 185, 129, 0.15)',
          color: '#10b981',
          border: '1px solid rgba(16, 185, 129, 0.3)'
        };
      case 'UPDATE':
        return {
          label: '變更',
          icon: <Edit size={13} />,
          bg: 'rgba(59, 130, 246, 0.15)',
          color: '#3b82f6',
          border: '1px solid rgba(59, 130, 246, 0.3)'
        };
      case 'DELETE':
        return {
          label: '移除',
          icon: <Trash2 size={13} />,
          bg: 'rgba(239, 68, 68, 0.15)',
          color: '#ef4444',
          border: '1px solid rgba(239, 68, 68, 0.3)'
        };
      case 'STATUS_CHANGE':
        return {
          label: '狀態',
          icon: <ArrowRightLeft size={13} />,
          bg: 'rgba(245, 158, 11, 0.15)',
          color: '#f59e0b',
          border: '1px solid rgba(245, 158, 11, 0.3)'
        };
      default:
        return {
          label: actionType || '操作',
          icon: <Clock size={13} />,
          bg: 'var(--bg-surface-subtle)',
          color: 'var(--text-muted)',
          border: '1px solid var(--border-color)'
        };
    }
  };

  // 篩選 (只顯示 24 小時內事件)
  const filteredLogs = logs.filter(log => {
    const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
    if (new Date(log.timestamp).getTime() < twentyFourHoursAgo) {
      return false;
    }
    if (selectedAction !== 'ALL') {
      if (selectedAction === 'UPDATE' && log.action_type !== 'UPDATE' && log.action_type !== 'STATUS_CHANGE') {
        return false;
      } else if (selectedAction !== 'UPDATE' && log.action_type !== selectedAction) {
        return false;
      }
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const summaryMatch = (log.summary || '').toLowerCase().includes(term);
      const targetIdMatch = (log.target_id || '').toLowerCase().includes(term);
      const targetNameMatch = (log.target_name || '').toLowerCase().includes(term);
      const userMatch = (log.user_name || '').toLowerCase().includes(term);
      const moduleMatch = (log.module_label || '').toLowerCase().includes(term);
      if (!summaryMatch && !targetIdMatch && !targetNameMatch && !userMatch && !moduleMatch) {
        return false;
      }
    }
    return true;
  });

  const handleCopy = (e, id, details) => {
    e.stopPropagation();
    try {
      navigator.clipboard.writeText(JSON.stringify(details, null, 2));
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <>
      {/* 遮罩背景 */}
      <div 
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'var(--bg-modal-overlay)',
          backdropFilter: 'blur(2px)',
          zIndex: 998,
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
      />

      {/* 向左攤開的側邊即時抽屜 */}
      <aside
        ref={drawerRef}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: '460px',
          maxWidth: '90vw',
          height: '100vh',
          backgroundColor: 'var(--bg-surface)',
          borderLeft: '1px solid var(--border-color)',
          boxShadow: 'var(--modal-shadow)',
          zIndex: 999,
          display: 'flex',
          flexDirection: 'column',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
          color: 'var(--text-main)',
          boxSizing: 'border-box'
        }}
      >
        {/* 抽屜頂部 Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-color)',
          backgroundColor: 'var(--bg-surface-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: '#10b981',
              boxShadow: '0 0 10px #10b981',
              animation: 'pulse 2s infinite'
            }} />
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 900, margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)' }}>
                即時事件串流 (Live Events)
              </h2>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                24 小時內異動事件監聽中 (每 5 秒自動更新)
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => fetchRecentLogs(false)}
              disabled={refreshing}
              title="立即重新整理"
              style={{
                background: 'none',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '6px 8px',
                color: 'var(--text-main)',
                cursor: refreshing ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                backgroundColor: 'var(--bg-surface)'
              }}
            >
              <RefreshCw size={15} className={refreshing ? 'spin-icon' : ''} />
            </button>

            <button
              onClick={onClose}
              title="關閉即時面板 (ESC)"
              style={{
                background: 'none',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '6px 8px',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                backgroundColor: 'var(--bg-surface)'
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* 篩選工具列 */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)' }}>
          {/* 動作快速篩選藥丸 */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
            {[
              { key: 'ALL', label: '全部' },
              { key: 'CREATE', label: '新增', color: '#10b981' },
              { key: 'UPDATE', label: '變更', color: '#3b82f6' },
              { key: 'DELETE', label: '刪除', color: '#ef4444' },
              { key: 'STATUS_CHANGE', label: '狀態', color: '#f59e0b' }
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setSelectedAction(tab.key)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '16px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: selectedAction === tab.key ? '1px solid var(--primary-color)' : '1px solid var(--border-color)',
                  backgroundColor: selectedAction === tab.key ? 'var(--primary-color)' : 'var(--bg-surface-subtle)',
                  color: selectedAction === tab.key ? '#fff' : 'var(--text-main)',
                  transition: 'all 0.15s ease'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* 關鍵字搜尋 */}
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
            <input
              type="text"
              placeholder="搜尋序號、單號、操作人或摘要..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 10px 7px 30px',
                borderRadius: '8px',
                border: '1px solid var(--input-border)',
                backgroundColor: 'var(--input-bg)',
                color: 'var(--input-text)',
                fontSize: '0.8rem',
                boxSizing: 'border-box'
              }}
            />
          </div>
        </div>

        {/* 即時事件列表卡片區 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
              <RefreshCw size={24} className="spin-icon" style={{ marginBottom: '8px' }} />
              <div style={{ fontSize: '0.85rem' }}>讀取即時事件串流中...</div>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
              <ShieldCheck size={36} color="var(--text-subtle)" style={{ marginBottom: '10px' }} />
              <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>最近 24 小時內無相符的事件紀錄</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginTop: '4px' }}>系統產生新異動時將即時顯示於此處</div>
            </div>
          ) : (
            filteredLogs.slice(0, 50).map(log => {
              const actionBadge = getActionBadge(log.action_type);
              const isExpanded = expandedLogId === log.id;

              return (
                <div
                  key={log.id}
                  onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                  style={{
                    backgroundColor: 'var(--bg-surface-subtle)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '12px',
                    padding: '14px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: isExpanded ? '0 4px 12px rgba(0,0,0,0.08)' : 'none',
                    borderColor: isExpanded ? 'var(--primary-color)' : 'var(--border-color)'
                  }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-surface-hover)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--bg-surface-subtle)'}
                >
                  {/* 卡片標頭：動作 + 模組 + 時間 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '2px 7px',
                        borderRadius: '5px',
                        fontSize: '0.7rem',
                        fontWeight: 800,
                        backgroundColor: actionBadge.bg,
                        color: actionBadge.color,
                        border: actionBadge.border
                      }}>
                        {actionBadge.icon} {actionBadge.label}
                      </span>

                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: '4px',
                        backgroundColor: 'var(--bg-surface)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-muted)'
                      }}>
                        {log.module_label || log.module}
                      </span>
                    </div>

                    <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <Clock size={11} /> {getRelativeTime(log.timestamp)}
                    </span>
                  </div>

                  {/* 標的編號 / SN */}
                  {log.target_id && (
                    <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.8rem', color: 'var(--primary-color)', marginBottom: '4px' }}>
                      {log.target_id} {log.target_name ? <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>({log.target_name})</span> : null}
                    </div>
                  )}

                  {/* 摘要說明 */}
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', lineHeight: '1.4', marginBottom: '8px' }}>
                    {log.summary}
                  </div>

                  {/* 底部操作人與展開箭頭 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)', paddingTop: '6px', marginTop: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <User size={12} />
                      <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{log.user_name || '系統'}</span>
                      {log.user_role && <span style={{ color: 'var(--text-subtle)', fontSize: '0.7rem' }}>({log.user_role})</span>}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px', color: 'var(--primary-color)', fontWeight: 600 }}>
                      <span>{isExpanded ? '收合' : '詳情'}</span>
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </div>
                  </div>

                  {/* 展開之 JSON 詳情 */}
                  {isExpanded && (
                    <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed var(--border-color)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>Payload 參數結構</span>
                        <button
                          onClick={e => handleCopy(e, log.id, log.details)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '3px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            border: '1px solid var(--border-color)',
                            backgroundColor: 'var(--bg-surface)',
                            color: copiedId === log.id ? '#10b981' : 'var(--text-muted)',
                            fontSize: '0.7rem',
                            cursor: 'pointer'
                          }}
                        >
                          {copiedId === log.id ? <Check size={11} /> : <Copy size={11} />}
                          {copiedId === log.id ? '已複製' : '複製'}
                        </button>
                      </div>
                      <pre style={{
                        padding: '10px',
                        backgroundColor: 'var(--input-bg)',
                        color: 'var(--text-main)',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color)',
                        fontSize: '0.72rem',
                        fontFamily: 'monospace',
                        overflowX: 'auto',
                        maxHeight: '180px',
                        margin: 0
                      }}>
                        {JSON.stringify(log.details || {}, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* 抽屜底部 Footer: 跳轉至完整事件紀錄查詢頁面 */}
        <div style={{
          padding: '16px 20px',
          borderTop: '1px solid var(--border-color)',
          backgroundColor: 'var(--bg-surface-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            顯示 24 小時內共 <strong style={{ color: 'var(--text-main)' }}>{Math.min(filteredLogs.length, 50)}</strong> 筆事件
          </span>

          <button
            onClick={() => {
              onClose();
              navigate('/event-logs');
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              backgroundColor: 'var(--primary-color)',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)'
            }}
          >
            <span>開啟完整事件紀錄總表</span>
            <ExternalLink size={14} />
          </button>
        </div>
      </aside>

      <style>{`
        @keyframes pulse {
          0% { transform: scale(0.95); opacity: 0.8; }
          50% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(0.95); opacity: 0.8; }
        }
        .spin-icon {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
};

export default LiveEventDrawer;
