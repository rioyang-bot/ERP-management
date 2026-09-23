import React, { useState, useEffect, useCallback } from 'react';
import { 
  Wrench, Search, Plus, Printer, Trash2, CheckCircle, AlertCircle, 
  Truck, PackageCheck, RotateCcw, ExternalLink, RefreshCw, FileText,
  Calendar, Building2, Cpu, Server, ChevronRight, Eye, Home
} from 'lucide-react';
import RepairOrderRegistrationModal from '../components/RepairOrderRegistrationModal';
import RepairActionModal from '../components/RepairActionModal';
import RepairOrderPrintModal from '../components/RepairOrderPrintModal';
import RepairOrderDetailModal from '../components/RepairOrderDetailModal';
import { logDelete, logUpdate } from '../utils/auditLogger';
import { getRepairScopeLabel, getRepairSubLabel, INTERNAL_LABEL } from '../utils/repairScope';
import { usePageSize } from '../utils/usePageSize';
import PageSizeSelector from '../components/common/PageSizeSelector';

// 維修時程欄位的四個階段，顏色沿用詳情頁的時間軸
const TIMELINE_STEPS = [
  { key: 'on_site_date', label: '現場', color: '#10b981' },
  { key: 'send_oem_date', label: '送修', color: '#d97706' },
  { key: 'oem_return_date', label: '返還', color: '#8b5cf6' },
  { key: 'completion_date', label: '完工', color: '#3b82f6' },
];

const STATUS_CONFIG = {
  ALL: { label: '全部維修單', color: 'var(--text-main)', bg: 'transparent' },
  ON_SITE_HANDLING: { label: '現場處理', color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' },
  SENT_OEM: { label: '送修原廠', color: '#d97706', bg: 'rgba(217, 119, 6, 0.12)' },
  OEM_RETURNED: { label: '原廠返還', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)' },
  COMPLETED: { label: '完工結案', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)' }
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
      // 先把還在維修中的設備放回在庫。明細會隨單據 CASCADE 刪除，
      // 順序反過來就找不到要還原哪些設備了。
      const restored = await window.electronAPI.namedQuery('restoreAssetsFromRepair', [order.id]);
      const restoredCount = restored.success ? (restored.rows?.length || 0) : 0;

      const res = await window.electronAPI.namedQuery('deleteRepairOrder', [order.id]);
      if (res.success) {
        await logDelete('REPAIR', order.repair_no, order.customer_name, `刪除維修單 [${order.repair_no}]`);
        alert(restoredCount > 0
          ? `維修單 [${order.repair_no}] 已刪除，${restoredCount} 台設備已改回「在庫」。`
          : `維修單 [${order.repair_no}] 已刪除。`);
        fetchRecords();
      } else {
        alert('刪除失敗：' + (res.error || '未知錯誤'));
      }
    } catch (err) {
      console.error('Delete repair order error:', err);
      alert('刪除失敗：' + err.message);
    }
  };

  /**
   * 標記或取消「不需送回原廠」。
   *
   * 只在現場處理階段可改 —— 已經送出原廠的單再宣稱不需送修並不合理，
   * 查詢本身也帶了同樣的條件，改不到時會回 0 筆。
   */
  const handleToggleNoOem = async (order) => {
    const turnOn = !order.no_oem_required;
    const msg = turnOn
      ? `確定維修單 [${order.repair_no}] 不需送回原廠嗎？

改為由 IT 人員自行處理，修復後填寫維修結果即可完工結案。`
      : `確定要取消維修單 [${order.repair_no}] 的「不需送回原廠」標記嗎？

取消後會恢復送修原廠的流程。`;
    if (!window.confirm(msg)) return;

    try {
      const res = await window.electronAPI.namedQuery('setRepairNoOemRequired', [turnOn, order.id]);
      if (!res.success) throw new Error(res.error || '未知錯誤');
      if (!res.rows || res.rows.length === 0) {
        alert('這張維修單已不在「現場處理」階段，無法變更送修方式。');
        return;
      }
      await logUpdate(
        'REPAIR', order.repair_no, order.customer_name,
        turnOn ? `維修單 [${order.repair_no}] 標記為不需送回原廠（由 IT 自行處理）`
               : `維修單 [${order.repair_no}] 取消不需送回原廠標記`
      );
      fetchRecords();
    } catch (err) {
      alert('變更失敗：' + err.message);
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
      const matchCust = (order.is_internal ? INTERNAL_LABEL : (order.customer_name || '')).toLowerCase().includes(term)
        || (order.contact_person || '').toLowerCase().includes(term);
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
            <h1 style={{ fontSize: 'var(--page-title-size, 1.35rem)', fontWeight: 900, margin: 0, letterSpacing: '-0.5px' }}>
              維修單列表 (Repair Orders / RMA List)
            </h1>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
              維修流程全週期管理：現場取件 ➔ 送修原廠 ➔ 原廠修復返還 ➔ 客戶完工出貨，自動同步設備在庫與維修狀態。
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            onClick={fetchRecords}
            disabled={loading}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-main)',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> 重新整理
          </button>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#ef4444',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 14px rgba(239, 68, 68, 0.35)'
            }}
          >
            <Plus size={16} /> 新增維修單 (New RMA)
          </button>
        </div>
      </div>

      {/* 統計指標卡片 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '10px',
        marginBottom: '12px'
      }}>
        <div
          onClick={() => setActiveTab('ALL')}
          style={{
            backgroundColor: 'var(--bg-surface)',
            padding: '10px 14px',
            borderRadius: '10px',
            border: activeTab === 'ALL' ? '2px solid var(--primary-color)' : '1px solid var(--border-color)',
            cursor: 'pointer',
            boxShadow: 'var(--card-shadow)'
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>總維修單數</div>
          <div style={{ fontSize: '20px', fontWeight: 900, marginTop: '2px', color: 'var(--text-main)' }}>{stats.total}</div>
        </div>

        <div
          onClick={() => setActiveTab('ON_SITE_HANDLING')}
          style={{
            backgroundColor: 'var(--bg-surface)',
            padding: '10px 14px',
            borderRadius: '10px',
            border: activeTab === 'ON_SITE_HANDLING' ? '2px solid #10b981' : '1px solid var(--border-color)',
            cursor: 'pointer',
            boxShadow: 'var(--card-shadow)'
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#10b981' }}>🟢 現場處理 (在庫)</div>
          <div style={{ fontSize: '20px', fontWeight: 900, marginTop: '2px', color: '#10b981' }}>{stats.on_site}</div>
        </div>

        <div
          onClick={() => setActiveTab('SENT_OEM')}
          style={{
            backgroundColor: 'var(--bg-surface)',
            padding: '10px 14px',
            borderRadius: '10px',
            border: activeTab === 'SENT_OEM' ? '2px solid #d97706' : '1px solid var(--border-color)',
            cursor: 'pointer',
            boxShadow: 'var(--card-shadow)'
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#d97706' }}>🟠 送修原廠 (維修中)</div>
          <div style={{ fontSize: '20px', fontWeight: 900, marginTop: '2px', color: '#d97706' }}>{stats.sent_oem}</div>
        </div>

        <div
          onClick={() => setActiveTab('OEM_RETURNED')}
          style={{
            backgroundColor: 'var(--bg-surface)',
            padding: '10px 14px',
            borderRadius: '10px',
            border: activeTab === 'OEM_RETURNED' ? '2px solid #8b5cf6' : '1px solid var(--border-color)',
            cursor: 'pointer',
            boxShadow: 'var(--card-shadow)'
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#8b5cf6' }}>🟣 原廠返還 (在庫)</div>
          <div style={{ fontSize: '20px', fontWeight: 900, marginTop: '2px', color: '#8b5cf6' }}>{stats.oem_returned}</div>
        </div>

        <div
          onClick={() => setActiveTab('COMPLETED')}
          style={{
            backgroundColor: 'var(--bg-surface)',
            padding: '10px 14px',
            borderRadius: '10px',
            border: activeTab === 'COMPLETED' ? '2px solid #3b82f6' : '1px solid var(--border-color)',
            cursor: 'pointer',
            boxShadow: 'var(--card-shadow)'
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#3b82f6' }}>🔵 完工出貨 (已結案)</div>
          <div style={{ fontSize: '20px', fontWeight: 900, marginTop: '2px', color: '#3b82f6' }}>{stats.completed}</div>
        </div>
      </div>

      {/* 搜尋與頁籤列 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'var(--bg-surface)',
        padding: '8px 14px',
        borderRadius: '10px',
        border: '1px solid var(--border-color)',
        marginBottom: '12px',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        {/* 頁籤切換 */}
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
            const isSelected = activeTab === key;
            return (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  border: isSelected ? '1px solid var(--primary-color)' : '1px solid transparent',
                  backgroundColor: isSelected ? 'var(--primary-bg)' : 'transparent',
                  color: isSelected ? 'var(--primary-color)' : 'var(--text-muted)',
                  fontSize: '12px',
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
        <div style={{ position: 'relative', width: '280px', maxWidth: '100%' }}>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="搜尋單號、客戶、設備、序號或狀況..."
            style={{
              width: '100%',
              padding: '7px 10px 7px 32px',
              borderRadius: '8px',
              border: '1px solid var(--input-border)',
              backgroundColor: 'var(--input-bg)',
              color: 'var(--input-text)',
              fontSize: '12px',
              outline: 'none'
            }}
          />
          <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        </div>
      </div>

      {/* 錯誤提示 */}
      {error && (
        <div style={{
          padding: '10px 14px',
          borderRadius: '10px',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          color: '#ef4444',
          marginBottom: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* 維修單據主列表表格 */}
      <div style={{
        backgroundColor: 'var(--bg-surface)',
        borderRadius: 'var(--card-radius, 14px)',
        border: '1px solid var(--border-color)',
        boxShadow: 'var(--card-shadow)',
        overflow: 'hidden'
      }}>
        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 290px)', minHeight: '300px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 4, backgroundColor: 'var(--table-header-bg)' }}>
              <tr style={{ backgroundColor: 'var(--table-header-bg)', borderBottom: '2px solid var(--border-color)' }}>
                <th style={{ padding: 'var(--table-cell-padding-y, 8px) var(--table-cell-padding-x, 10px)', fontWeight: 800, whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 4, backgroundColor: 'var(--table-header-bg)', boxShadow: '0 1px 0 var(--border-color)' }}>維修單號 (Repair No.)</th>
                <th style={{ padding: 'var(--table-cell-padding-y, 8px) var(--table-cell-padding-x, 10px)', fontWeight: 800, whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 4, backgroundColor: 'var(--table-header-bg)', boxShadow: '0 1px 0 var(--border-color)' }}>客戶 (Customer)</th>
                <th style={{ padding: 'var(--table-cell-padding-y, 8px) var(--table-cell-padding-x, 10px)', fontWeight: 800, minWidth: '200px', position: 'sticky', top: 0, zIndex: 4, backgroundColor: 'var(--table-header-bg)', boxShadow: '0 1px 0 var(--border-color)' }}>設備明細 (Device / SN)</th>
                <th style={{ padding: 'var(--table-cell-padding-y, 8px) var(--table-cell-padding-x, 10px)', fontWeight: 800, minWidth: '160px', position: 'sticky', top: 0, zIndex: 4, backgroundColor: 'var(--table-header-bg)', boxShadow: '0 1px 0 var(--border-color)' }}>現場狀況 / 故障描述</th>
                <th style={{ padding: 'var(--table-cell-padding-y, 8px) var(--table-cell-padding-x, 10px)', fontWeight: 800, textAlign: 'center', whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 4, backgroundColor: 'var(--table-header-bg)', boxShadow: '0 1px 0 var(--border-color)' }}>當前狀態</th>
                <th style={{ padding: 'var(--table-cell-padding-y, 8px) var(--table-cell-padding-x, 10px)', fontWeight: 800, minWidth: '190px', position: 'sticky', top: 0, zIndex: 4, backgroundColor: 'var(--table-header-bg)', boxShadow: '0 1px 0 var(--border-color)' }}>維修時程 (Maint. Timeline)</th>
                <th style={{ padding: 'var(--table-cell-padding-y, 8px) var(--table-cell-padding-x, 10px)', fontWeight: 800, textAlign: 'right', minWidth: '200px', position: 'sticky', top: 0, zIndex: 4, backgroundColor: 'var(--table-header-bg)', boxShadow: '0 1px 0 var(--border-color)' }}>操作流程</th>
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
                      {/* 單號不換行：RMA-20260923-01 斷成兩行會把整列撐高。
                          也不再是連結 —— 右邊的「檢視」就是開詳情的入口，兩個一樣的入口只是噪音。 */}
                      <td style={{ padding: '14px 16px', fontWeight: 800, color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <FileText size={15} color="var(--primary-color)" />
                          <span>{order.repair_no}</span>
                        </div>
                      </td>

                      {/* 客戶名稱 */}
                      <td style={{ padding: '14px 16px', fontWeight: 800, color: 'var(--text-main)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Building2 size={14} color={order.is_internal ? 'var(--primary-color)' : 'var(--text-muted)'} />
                          <span style={order.is_internal ? { color: 'var(--primary-color)' } : undefined}>
                            {getRepairScopeLabel(order)}
                          </span>
                        </div>
                        {getRepairSubLabel(order) && (
                          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginTop: '3px', paddingLeft: '20px' }}>
                            {getRepairSubLabel(order)}
                          </div>
                        )}
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

                      {/* 現場狀況／故障描述。列表只顯示，修改在「檢視」的詳情裡 ——
                          四個階段的說明都集中在同一個地方改，不必記得哪一段要去哪裡找。 */}
                      <td style={{ padding: '14px 16px', color: 'var(--text-main)', fontSize: '12px', minWidth: '220px' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: '6px',
                          backgroundColor: order.on_site_status ? 'rgba(239, 68, 68, 0.08)' : 'transparent',
                          color: order.on_site_status ? '#ef4444' : 'var(--text-subtle)',
                          fontWeight: 600,
                          display: 'inline-block',
                          whiteSpace: 'pre-wrap',
                        }}>
                          {order.on_site_status || '-'}
                        </span>
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
                        {/* 不送原廠的單要一眼看得出來，否則會以為流程卡住了 */}
                        {order.no_oem_required && (
                          <div style={{ marginTop: '4px' }}>
                            <span style={{
                              padding: '3px 8px',
                              borderRadius: '20px',
                              backgroundColor: 'rgba(13, 148, 136, 0.12)',
                              color: '#0d9488',
                              fontWeight: 800,
                              fontSize: '10px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px'
                            }}>
                              <Home size={10} /> 不需送回原廠
                            </span>
                          </div>
                        )}
                      </td>

                      {/* 維修時程：現場、送修、返還、完工四個日期併成一欄。
                          維修結果不放這裡 —— 截斷成一行的摘要幫不上忙，詳情裡有完整內容。 */}
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {TIMELINE_STEPS.map(({ key, label, color }) => (
                            order[key] ? (
                              <div key={key} style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{
                                  padding: '1px 6px', borderRadius: '4px', minWidth: '34px', textAlign: 'center',
                                  backgroundColor: `${color}1f`, color, fontWeight: 800, fontSize: '11px', whiteSpace: 'nowrap',
                                }}>
                                  {label}
                                </span>
                                <span style={{ color, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{order[key]}</span>
                              </div>
                            ) : null
                          ))}

                          {!order.send_oem_date && !order.oem_return_date && !order.completion_date && (
                            <span style={{ color: 'var(--text-subtle)', fontSize: '11px' }}>
                              現場處理中 (尚未送修)
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 操作流程按鈕 */}
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                          {/* 檢視詳細資料 */}
                          <button
                            onClick={() => setDetailModal({ isOpen: true, order })}
                            style={{
                              padding: '6px 10px',
                                whiteSpace: 'nowrap',
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

                          {/* 現場處理階段可選擇不送原廠，改由 IT 自行修復 */}
                          {order.status === 'ON_SITE_HANDLING' && (
                            <button
                              onClick={() => handleToggleNoOem(order)}
                              style={{
                                padding: '6px 10px',
                                whiteSpace: 'nowrap',
                                borderRadius: '8px',
                                border: order.no_oem_required ? 'none' : '1px solid #0d9488',
                                backgroundColor: order.no_oem_required ? 'var(--bg-surface)' : 'rgba(13, 148, 136, 0.12)',
                                color: order.no_oem_required ? 'var(--text-muted)' : '#0d9488',
                                fontWeight: 700,
                                fontSize: '12px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                              title={order.no_oem_required ? '取消標記，恢復送修原廠流程' : '這張單不需送回原廠，由 IT 人員自行處理'}
                            >
                              <Home size={13} /> {order.no_oem_required ? '恢復送原廠' : '免送原廠'}
                            </button>
                          )}

                          {/* 不送原廠：現場處理 ➔ 直接完工結案 */}
                          {order.status === 'ON_SITE_HANDLING' && order.no_oem_required && (
                            <button
                              onClick={() => setActionModal({ isOpen: true, order, type: 'IN_HOUSE_COMPLETE' })}
                              style={{
                                padding: '6px 10px',
                                whiteSpace: 'nowrap',
                                borderRadius: '8px',
                                border: 'none',
                                backgroundColor: '#0d9488',
                                color: '#fff',
                                fontWeight: 700,
                                fontSize: '12px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                              title="IT 自行修復完成，填寫維修結果後結案出貨"
                            >
                              <Wrench size={13} /> 自行維修完工
                            </button>
                          )}

                          {/* 階段 1 ➔ 階段 2：送修原廠（標記不送原廠時就不該再出現） */}
                          {order.status === 'ON_SITE_HANDLING' && !order.no_oem_required && (
                            <button
                              onClick={() => setActionModal({ isOpen: true, order, type: 'SEND_OEM' })}
                              style={{
                                padding: '6px 10px',
                                whiteSpace: 'nowrap',
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
                                whiteSpace: 'nowrap',
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
                              title={order.is_internal
                                ? '原廠返還並結案 (設備回到在庫)'
                                : '原廠返還 (設備維持維修中，待完工出貨)'}
                            >
                              <Wrench size={13} /> 原廠返還
                            </button>
                          )}

                          {/* 階段 3 ➔ 階段 4：客戶出貨完工 */}
                          {/* 內部維修在原廠返還時就結案了，不會停在這個狀態 */}
                          {order.status === 'OEM_RETURNED' && !order.is_internal && (
                            <button
                              onClick={() => setActionModal({ isOpen: true, order, type: 'COMPLETE' })}
                              style={{
                                padding: '6px 10px',
                                whiteSpace: 'nowrap',
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
                              whiteSpace: 'nowrap',
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
                              whiteSpace: 'nowrap',
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

      {/* 頁面說明：兩種維修對象的流程、各階段的設備狀態，以及幾個容易誤會的地方 */}
      <div style={{
        marginTop: '20px', padding: '16px 20px',
        backgroundColor: 'var(--bg-surface-subtle)', border: '1px solid var(--border-color)',
        borderRadius: '12px', fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.8',
      }}>
        <div style={{ fontWeight: 800, color: 'var(--text-main)', marginBottom: '8px' }}>
          維修單說明
        </div>

        <div style={{ marginBottom: '10px' }}>
          維修單分兩種對象，建單時選擇，起始階段與後續流程都跟著它走。
          加入設備時系統會自動判斷：設備有客戶就是客戶送修，沒有（公司資產或尚未出貨的庫存品）就是公司內部，仍可自行更改。
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div>
            <b style={{ color: 'var(--primary-color)' }}>客戶送修</b>
            <span style={{ marginLeft: '6px' }}>設備在客戶端，需填寫客戶名稱與聯絡人。</span>
            <div style={{ marginTop: '4px', paddingLeft: '12px', fontFamily: 'monospace', fontSize: '12px' }}>
              現場處理<span style={{ color: '#ef4444' }}>（維修）</span>
              {' → '}送修原廠<span style={{ color: '#ef4444' }}>（維修）</span>
              {' → '}原廠返還<span style={{ color: '#ef4444' }}>（維修）</span>
              {' → '}完工出貨<span style={{ color: '#3b82f6' }}>（出貨）</span>＝結案
            </div>
          </div>

          <div>
            <b style={{ color: '#d97706' }}>公司內部</b>
            <span style={{ marginLeft: '6px' }}>
              公司資產或尚未出貨的庫存品，沒有客戶。改為選擇供應商（送回哪一家原廠），來源是客戶／廠商管理裡的供應商。
            </span>
            <div style={{ marginTop: '4px', paddingLeft: '12px', fontFamily: 'monospace', fontSize: '12px' }}>
              送修原廠<span style={{ color: '#ef4444' }}>（維修）</span>
              {' → '}原廠返還<span style={{ color: '#16a34a' }}>（在庫）</span>＝結案
            </div>
          </div>
        </div>

        <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div>
            • <b>設備狀態</b>：設備一旦進了維修單就標記為「維修」，不再計入可動用的在庫。
            客戶送修要到完工出貨才轉為「出貨」；公司內部沒有出貨這一步，原廠返還後回到「在庫」。
          </div>
          <div>
            • <b>公司內部沒有現場處理</b>：東西本來就在自己手上，沒有現場可去，建單時直接從送修原廠起算。
            詳情的流程圖會把不適用的階段標示出來。
          </div>
          <div>
            • <b>不需送回原廠</b>：客戶送修若由 IT 自行修復，可在現場處理階段標記，
            之後填寫維修結果直接完工結案，不經過原廠那兩個階段。
          </div>
          <div>
            • <b>四個階段的說明</b>：現場狀況／故障描述、送修備註、維修與檢測結果、
            出貨備註各自獨立，不會互相覆蓋。內容都在「檢視」的詳情裡，
            任何階段都可以就地修改 —— 這些是描述而不是流程狀態，
            打錯字或事後補充都不會被單據階段擋住。
          </div>
          <div>
            • <b>刪除維修單</b>：會把還停在「維修」的設備改回「在庫」，
            否則單據沒了、設備會永遠卡在維修中。已完工出貨或已報廢的不會被更動。
          </div>
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
        // 詳情裡改完四段說明後，列表與彈窗上的內容都要跟著換掉，
        // 否則要關掉再打開才看得到新的值
        onUpdated={(patch) => {
          setDetailModal((m) => (m.order ? { ...m, order: { ...m.order, ...patch } } : m));
          fetchRecords();
        }}
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
