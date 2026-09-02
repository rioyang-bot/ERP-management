import React, { useState, useEffect, useCallback } from 'react';
import { 
  Wrench, Search, Plus, Printer, Trash2, CheckCircle, AlertCircle, 
  Truck, PackageCheck, RotateCcw, ExternalLink, RefreshCw, FileText,
  Calendar, Building2, Cpu, Server, ChevronRight, Eye
} from 'lucide-react';
import RepairOrderRegistrationModal from '../components/RepairOrderRegistrationModal';
import RepairActionModal from '../components/RepairActionModal';
import RepairOrderPrintModal from '../components/RepairOrderPrintModal';
import RepairOrderDetailModal from '../components/RepairOrderDetailModal';
import { logDelete } from '../utils/auditLogger';
import { usePageSize } from '../utils/usePageSize';
import PageSizeSelector from '../components/common/PageSizeSelector';

const STATUS_CONFIG = {
  ALL: { label: '全部維修單', color: 'var(--text-main)', bg: 'transparent' },
  ON_SITE_HANDLING: { label: '現場處理 (在庫)', color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' },
  SENT_OEM: { label: '送修原廠 (維修中)', color: '#d97706', bg: 'rgba(217, 119, 6, 0.12)' },
  OEM_RETURNED: { label: '原廠返還 (在庫)', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)' },
  COMPLETED: { label: '完工出貨 (出庫)', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)' }
};

const RepairList = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('ALL');
  const [repairOrders, setRepairOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal 狀態
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [detailModal, setDetailModal] = useState({ isOpen: false, order: null });
  const [actionModal, setActionModal] = useState({ isOpen: false, order: null, type: 'SEND_OEM' });
  const [printModal, setPrintModal] = useState({ isOpen: false, order: null });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = usePageSize('repair_list', 10);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeTab]);

  // 載入資料
  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      try {
        await window.electronAPI.namedQuery('initRepairTables');
      } catch (e) {
        console.warn('initRepairTables notice:', e);
      }

      const res = await window.electronAPI.namedQuery('fetchRepairOrders');
      if (res.success) {
        setRepairOrders(res.rows || []);
      } else {
        setError('無法讀取維修單列表：' + (res.error || '未知錯誤'));
      }
    } catch (err) {
      console.error('Fetch repair orders error:', err);
      setError('伺服器連線異常，請檢查服務是否啟動。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // 刪除維修單
  const handleDeleteOrder = async (order) => {
    if (!window.confirm(`確定要刪除維修單 [${order.repair_no}] 嗎？此操作將同時移除關聯明細。`)) {
      return;
    }

    try {
      const res = await window.electronAPI.namedQuery('deleteRepairOrder', [order.id]);
      if (res.success) {
        await logDelete('REPAIR', order.repair_no, order.customer_name, `刪除維修單 [${order.repair_no}]`);
        alert(`維修單 [${order.repair_no}] 已刪除。`);
        fetchRecords();
      } else {
        alert('刪除失敗：' + (res.error || '未知錯誤'));
      }
    } catch (err) {
      console.error('Delete repair order error:', err);
      alert('刪除失敗：' + err.message);
    }
  };

  // 過濾清單
  const filteredOrders = repairOrders.filter(order => {
    // 狀態篩選
    if (activeTab !== 'ALL' && order.status !== activeTab) {
      return false;
    }

    // 關鍵字搜尋 (單號, 客戶, 狀況, 結果, 設備, 序號)
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      const matchNo = (order.repair_no || '').toLowerCase().includes(term);
      const matchCust = (order.customer_name || '').toLowerCase().includes(term);
      const matchStatus = (order.on_site_status || '').toLowerCase().includes(term);
      const matchResults = (order.results || '').toLowerCase().includes(term);
      const matchSummary = (order.item_summary || '').toLowerCase().includes(term);
      return matchNo || matchCust || matchStatus || matchResults || matchSummary;
    }

    return true;
  });

  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage) || 1;
  const currentRecords = filteredOrders.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // 統計數據
  const stats = {
    total: repairOrders.length,
    on_site: repairOrders.filter(o => o.status === 'ON_SITE_HANDLING').length,
    sent_oem: repairOrders.filter(o => o.status === 'SENT_OEM').length,
    oem_returned: repairOrders.filter(o => o.status === 'OEM_RETURNED').length,
    completed: repairOrders.filter(o => o.status === 'COMPLETED').length
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1600px', margin: '0 auto', color: 'var(--text-main)' }}>
      {/* 頂部 Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            backgroundColor: 'rgba(239, 68, 68, 0.12)',
            color: '#ef4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Wrench size={24} />
          </div>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 900, margin: 0, letterSpacing: '-0.5px' }}>
              維修單列表 (Repair Orders / RMA List)
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
              維修流程全週期管理：現場取件 ➔ 送修原廠 ➔ 原廠修復返還 ➔ 客戶完工出貨，自動同步設備在庫與維修狀態。
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            onClick={fetchRecords}
            disabled={loading}
            style={{
              padding: '10px 16px',
              borderRadius: '10px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-main)',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <RefreshCw size={15} className={loading ? 'spin' : ''} /> 重新整理
          </button>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            style={{
              padding: '10px 20px',
              borderRadius: '10px',
              border: 'none',
              backgroundColor: '#ef4444',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(239, 68, 68, 0.35)'
            }}
          >
            <Plus size={18} /> 新增維修單 (New RMA)
          </button>
        </div>
      </div>

      {/* 統計指標卡片 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div
          onClick={() => setActiveTab('ALL')}
          style={{
            backgroundColor: 'var(--bg-surface)',
            padding: '16px',
            borderRadius: '14px',
            border: activeTab === 'ALL' ? '2px solid var(--primary-color)' : '1px solid var(--border-color)',
            cursor: 'pointer',
            boxShadow: 'var(--card-shadow)'
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>總維修單數</div>
          <div style={{ fontSize: '26px', fontWeight: 900, marginTop: '4px', color: 'var(--text-main)' }}>{stats.total}</div>
        </div>

        <div
          onClick={() => setActiveTab('ON_SITE_HANDLING')}
          style={{
            backgroundColor: 'var(--bg-surface)',
            padding: '16px',
            borderRadius: '14px',
            border: activeTab === 'ON_SITE_HANDLING' ? '2px solid #10b981' : '1px solid var(--border-color)',
            cursor: 'pointer',
            boxShadow: 'var(--card-shadow)'
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#10b981' }}>🟢 現場處理 (在庫)</div>
          <div style={{ fontSize: '26px', fontWeight: 900, marginTop: '4px', color: '#10b981' }}>{stats.on_site}</div>
        </div>

        <div
          onClick={() => setActiveTab('SENT_OEM')}
          style={{
            backgroundColor: 'var(--bg-surface)',
            padding: '16px',
            borderRadius: '14px',
            border: activeTab === 'SENT_OEM' ? '2px solid #d97706' : '1px solid var(--border-color)',
            cursor: 'pointer',
            boxShadow: 'var(--card-shadow)'
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#d97706' }}>🟠 送修原廠 (維修中)</div>
          <div style={{ fontSize: '26px', fontWeight: 900, marginTop: '4px', color: '#d97706' }}>{stats.sent_oem}</div>
        </div>

        <div
          onClick={() => setActiveTab('OEM_RETURNED')}
          style={{
            backgroundColor: 'var(--bg-surface)',
            padding: '16px',
            borderRadius: '14px',
            border: activeTab === 'OEM_RETURNED' ? '2px solid #8b5cf6' : '1px solid var(--border-color)',
            cursor: 'pointer',
            boxShadow: 'var(--card-shadow)'
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#8b5cf6' }}>🟣 原廠返還 (在庫待出)</div>
          <div style={{ fontSize: '26px', fontWeight: 900, marginTop: '4px', color: '#8b5cf6' }}>{stats.oem_returned}</div>
        </div>

        <div
          onClick={() => setActiveTab('COMPLETED')}
          style={{
            backgroundColor: 'var(--bg-surface)',
            padding: '16px',
            borderRadius: '14px',
            border: activeTab === 'COMPLETED' ? '2px solid #3b82f6' : '1px solid var(--border-color)',
            cursor: 'pointer',
            boxShadow: 'var(--card-shadow)'
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#3b82f6' }}>🔵 完工出貨 (已結案)</div>
          <div style={{ fontSize: '26px', fontWeight: 900, marginTop: '4px', color: '#3b82f6' }}>{stats.completed}</div>
        </div>
      </div>

      {/* 搜尋與頁籤列 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'var(--bg-surface)',
        padding: '14px 18px',
        borderRadius: '14px',
        border: '1px solid var(--border-color)',
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '14px'
      }}>
        {/* 頁籤切換 */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
            const isSelected = activeTab === key;
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                style={{
                  padding: '7px 14px',
                  borderRadius: '8px',
                  border: isSelected ? '1px solid var(--primary-color)' : '1px solid transparent',
                  backgroundColor: isSelected ? 'var(--primary-bg)' : 'transparent',
                  color: isSelected ? 'var(--primary-color)' : 'var(--text-muted)',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                {cfg.label}
              </button>
            );
          })}
        </div>

        {/* 搜尋輸入框 */}
        <div style={{ position: 'relative', width: '320px', maxWidth: '100%' }}>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="搜尋單號、客戶、設備、序號或狀況..."
            style={{
              width: '100%',
              padding: '9px 12px 9px 34px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-surface-subtle)',
              color: 'var(--text-main)',
              fontSize: '13px'
            }}
          />
          <Search size={16} style={{ position: 'absolute', left: '10px', top: '11px', color: 'var(--text-muted)' }} />
        </div>
      </div>

      {/* 錯誤提示 */}
      {error && (
        <div style={{
          padding: '14px 18px',
          borderRadius: '12px',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          color: '#ef4444',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {/* 維修單據主列表表格 */}
      <div style={{
        backgroundColor: 'var(--bg-surface)',
        borderRadius: '16px',
        border: '1px solid var(--border-color)',
        boxShadow: 'var(--card-shadow)',
        overflow: 'hidden'
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--bg-surface-subtle)', borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '14px 16px', fontWeight: 800, whiteSpace: 'nowrap' }}>維修單號 (Repair No.)</th>
                <th style={{ padding: '14px 16px', fontWeight: 800, whiteSpace: 'nowrap' }}>客戶 (Customer)</th>
                <th style={{ padding: '14px 16px', fontWeight: 800, minWidth: '220px' }}>設備明細 (Device / SN)</th>
                <th style={{ padding: '14px 16px', fontWeight: 800, whiteSpace: 'nowrap' }}>現場處理日 (On-site)</th>
                <th style={{ padding: '14px 16px', fontWeight: 800, minWidth: '150px' }}>現場狀況 / 故障描述</th>
                <th style={{ padding: '14px 16px', fontWeight: 800, minWidth: '220px' }}>送修與完工資訊 (OEM & Shipping)</th>
                <th style={{ padding: '14px 16px', fontWeight: 800, textAlign: 'center', whiteSpace: 'nowrap' }}>當前狀態</th>
                <th style={{ padding: '14px 16px', fontWeight: 800, textAlign: 'right', minWidth: '220px' }}>操作流程</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
                    <RefreshCw size={24} className="spin" style={{ margin: '0 auto 10px' }} />
                    資料載入中...
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '56px 20px', color: 'var(--text-muted)' }}>
                    <Wrench size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                    尚未有符合條件的維修單據
                  </td>
                </tr>
              ) : (
                currentRecords.map(order => {
                  const items = order.items || [];
                  const statusInfo = STATUS_CONFIG[order.status] || { label: order.status, color: 'var(--text-main)', bg: 'transparent' };

                  return (
                    <tr
                      key={order.id}
                      style={{
                        borderBottom: '1px solid var(--border-color)',
                        transition: 'background-color 0.15s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-surface-hover)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      {/* 維修單號 */}
                      <td style={{ padding: '14px 16px', fontWeight: 800, color: 'var(--text-main)' }}>
                        <div 
                          style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                          onClick={() => setDetailModal({ isOpen: true, order })}
                          title="點選檢視維修單詳細資訊"
                        >
                          <FileText size={15} color="var(--primary-color)" />
                          <span style={{ borderBottom: '1px dashed var(--primary-color)' }}>{order.repair_no}</span>
                        </div>
                      </td>

                      {/* 客戶名稱 */}
                      <td style={{ padding: '14px 16px', fontWeight: 800, color: 'var(--text-main)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Building2 size={14} color="var(--text-muted)" />
                          {order.customer_name}
                        </div>
                      </td>

                      {/* 設備明細 */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {items.map((it, idx) => (
                            <div key={idx} style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontWeight: 800, color: 'var(--primary-color)' }}>{it.brand}</span>
                              <span style={{ color: 'var(--text-main)' }}>{it.model}</span>
                              <span style={{
                                padding: '1px 6px',
                                borderRadius: '4px',
                                backgroundColor: 'var(--bg-surface-subtle)',
                                border: '1px solid var(--border-color)',
                                fontWeight: 700,
                                fontSize: '11px',
                                color: 'var(--text-muted)'
                              }}>
                                SN: {it.sn}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>

                      {/* 現場處理日 */}
                      <td style={{ padding: '14px 16px', whiteSpace: 'nowrap', fontWeight: 600 }}>
                        {order.on_site_date ? (
                          <span style={{ color: '#10b981' }}>{order.on_site_date}</span>
                        ) : '-'}
                      </td>

                      {/* 現場狀況 */}
                      <td style={{ padding: '14px 16px', color: 'var(--text-main)', fontSize: '12px' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: '6px',
                          backgroundColor: 'rgba(239, 68, 68, 0.08)',
                          color: '#ef4444',
                          fontWeight: 600,
                          display: 'inline-block'
                        }}>
                          {order.on_site_status || '-'}
                        </span>
                      </td>

                      {/* 送修與完工資訊 (整合送修、返還、結果、出貨) */}
                      <td 
                        style={{ padding: '14px 16px', cursor: 'pointer' }}
                        onClick={() => setDetailModal({ isOpen: true, order })}
                        title="點選檢視完整維修送修詳細資訊"
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {order.send_oem_date && (
                            <div style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{
                                padding: '1px 6px',
                                borderRadius: '4px',
                                backgroundColor: 'rgba(217, 119, 6, 0.12)',
                                color: '#d97706',
                                fontWeight: 800,
                                fontSize: '11px',
                                whiteSpace: 'nowrap'
                              }}>
                                送修
                              </span>
                              <span style={{ color: '#d97706', fontWeight: 700 }}>{order.send_oem_date}</span>
                            </div>
                          )}

                          {order.oem_return_date && (
                            <div style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{
                                padding: '1px 6px',
                                borderRadius: '4px',
                                backgroundColor: 'rgba(139, 92, 246, 0.12)',
                                color: '#8b5cf6',
                                fontWeight: 800,
                                fontSize: '11px',
                                whiteSpace: 'nowrap'
                              }}>
                                返還
                              </span>
                              <span style={{ color: '#8b5cf6', fontWeight: 700 }}>{order.oem_return_date}</span>
                            </div>
                          )}

                          {order.results && (
                            <div style={{
                              fontSize: '11px',
                              color: '#10b981',
                              fontWeight: 600,
                              backgroundColor: 'rgba(16, 185, 129, 0.08)',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              maxWidth: '220px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}>
                              💡 {order.results}
                            </div>
                          )}

                          {order.completion_date && (
                            <div style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{
                                padding: '1px 6px',
                                borderRadius: '4px',
                                backgroundColor: 'rgba(59, 130, 246, 0.12)',
                                color: '#3b82f6',
                                fontWeight: 800,
                                fontSize: '11px',
                                whiteSpace: 'nowrap'
                              }}>
                                完工
                              </span>
                              <span style={{ color: '#3b82f6', fontWeight: 700 }}>{order.completion_date}</span>
                            </div>
                          )}

                          {!order.send_oem_date && !order.oem_return_date && !order.completion_date && !order.results && (
                            <span style={{ color: 'var(--text-subtle)', fontSize: '12px' }}>
                              現場在庫 (尚未送修)
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 當前狀態 */}
                      <td style={{ padding: '14px 16px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <span style={{
                          padding: '4px 10px',
                          borderRadius: '20px',
                          backgroundColor: statusInfo.bg,
                          color: statusInfo.color,
                          fontWeight: 800,
                          fontSize: '11px',
                          display: 'inline-block'
                        }}>
                          {statusInfo.label}
                        </span>
                      </td>

                      {/* 操作流程按鈕 */}
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', alignItems: 'center' }}>
                          {/* 檢視詳細資料 */}
                          <button
                            onClick={() => setDetailModal({ isOpen: true, order })}
                            style={{
                              padding: '6px 10px',
                              borderRadius: '8px',
                              border: '1px solid var(--border-color)',
                              backgroundColor: 'var(--bg-surface)',
                              color: 'var(--text-main)',
                              fontWeight: 700,
                              fontSize: '12px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                            title="檢視維修單完整詳細資料與歷程"
                          >
                            <Eye size={13} color="var(--primary-color)" /> 檢視
                          </button>

                          {/* 階段 1 ➔ 階段 2：送修原廠 */}
                          {order.status === 'ON_SITE_HANDLING' && (
                            <button
                              onClick={() => setActionModal({ isOpen: true, order, type: 'SEND_OEM' })}
                              style={{
                                padding: '6px 10px',
                                borderRadius: '8px',
                                border: 'none',
                                backgroundColor: '#d97706',
                                color: '#fff',
                                fontWeight: 700,
                                fontSize: '12px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                              title="送修原廠 (將設備設為維修中)"
                            >
                              <Truck size={13} /> 送修原廠
                            </button>
                          )}

                          {/* 階段 2 ➔ 階段 3：原廠修復返還 */}
                          {order.status === 'SENT_OEM' && (
                            <button
                              onClick={() => setActionModal({ isOpen: true, order, type: 'OEM_RETURN' })}
                              style={{
                                padding: '6px 10px',
                                borderRadius: '8px',
                                border: 'none',
                                backgroundColor: '#8b5cf6',
                                color: '#fff',
                                fontWeight: 700,
                                fontSize: '12px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                              title="原廠返還 (將設備設為在庫)"
                            >
                              <Wrench size={13} /> 原廠返還
                            </button>
                          )}

                          {/* 階段 3 ➔ 階段 4：客戶出貨完工 */}
                          {order.status === 'OEM_RETURNED' && (
                            <button
                              onClick={() => setActionModal({ isOpen: true, order, type: 'COMPLETE' })}
                              style={{
                                padding: '6px 10px',
                                borderRadius: '8px',
                                border: 'none',
                                backgroundColor: '#3b82f6',
                                color: '#fff',
                                fontWeight: 700,
                                fontSize: '12px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                              title="客戶出貨完工 (將設備設為出庫)"
                            >
                              <PackageCheck size={13} /> 客戶出貨
                            </button>
                          )}

                          {/* 已結案標籤 */}
                          {order.status === 'COMPLETED' && (
                            <span style={{
                              padding: '4px 8px',
                              borderRadius: '6px',
                              backgroundColor: 'rgba(59, 130, 246, 0.1)',
                              color: '#3b82f6',
                              fontSize: '11px',
                              fontWeight: 700,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}>
                              <CheckCircle size={13} /> 已結案
                            </span>
                          )}

                          {/* 套印單據按鈕 */}
                          <button
                            onClick={() => setPrintModal({ isOpen: true, order })}
                            style={{
                              padding: '6px 8px',
                              borderRadius: '8px',
                              border: '1px solid var(--border-color)',
                              backgroundColor: 'var(--bg-surface)',
                              color: 'var(--text-main)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center'
                            }}
                            title="列印 / 預覽維修單據"
                          >
                            <Printer size={13} />
                          </button>

                          {/* 刪除按鈕 */}
                          <button
                            onClick={() => handleDeleteOrder(order)}
                            style={{
                              padding: '6px 8px',
                              borderRadius: '8px',
                              border: '1px solid var(--border-color)',
                              backgroundColor: 'var(--bg-surface)',
                              color: '#ef4444',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center'
                            }}
                            title="刪除維修單"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', gap: '12px', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface-subtle)', flexWrap: 'wrap' }}>
          <PageSizeSelector pageSize={itemsPerPage} onChange={(newSize) => { setItemsPerPage(newSize); setCurrentPage(1); }} />
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                style={{ padding: '6px 14px', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: currentPage === 1 ? 'var(--bg-surface-subtle)' : 'var(--bg-surface)', color: currentPage === 1 ? 'var(--text-subtle)' : 'var(--text-main)', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
              >
                上一頁
              </button>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                {currentPage} <span style={{ color: 'var(--text-subtle)', margin: '0 4px' }}>/</span> {totalPages}
              </span>
              <button 
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                style={{ padding: '6px 14px', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: currentPage === totalPages ? 'var(--bg-surface-subtle)' : 'var(--bg-surface)', color: currentPage === totalPages ? 'var(--text-subtle)' : 'var(--text-main)', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
              >
                下一頁
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 彈窗組件 */}
      <RepairOrderRegistrationModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={fetchRecords}
      />

      <RepairOrderDetailModal
        isOpen={detailModal.isOpen}
        onClose={() => setDetailModal({ isOpen: false, order: null })}
        repairOrder={detailModal.order}
        onOpenAction={(order, type) => setActionModal({ isOpen: true, order, type })}
        onOpenPrint={(order) => setPrintModal({ isOpen: true, order })}
      />

      <RepairActionModal
        isOpen={actionModal.isOpen}
        onClose={() => setActionModal({ isOpen: false, order: null, type: 'SEND_OEM' })}
        repairOrder={actionModal.order}
        actionType={actionModal.type}
        onSuccess={fetchRecords}
      />

      <RepairOrderPrintModal
        isOpen={printModal.isOpen}
        onClose={() => setPrintModal({ isOpen: false, order: null })}
        repairOrder={printModal.order}
      />
    </div>
  );
};

export default RepairList;
