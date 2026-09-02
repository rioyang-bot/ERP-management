import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  FileText, Search, Eye, CornerDownLeft, AlertCircle, History, Clock, 
  CheckCircle, Printer, PackageCheck, Send, Paperclip, Upload, Trash2, 
  Download, ExternalLink, FileCheck, Image as ImageIcon, X, Plus 
} from 'lucide-react';
import { logStatusChange, logUpdate, logDelete } from '../utils/auditLogger';
import LentOrderPrintModal from '../components/LentOrderPrintModal';
import LendOrderRegistrationModal from '../components/LendOrderRegistrationModal';
import { usePageSize } from '../utils/usePageSize';
import PageSizeSelector from '../components/common/PageSizeSelector';

const LentList = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('PENDING'); // 'PENDING' | 'SHIPPED' | 'RETURNED'
  const [dnRecords, setDnRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [selectedDN, setSelectedDN] = useState(null);
  const [dnItems, setDnItems] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [returnModal, setReturnModal] = useState({ show: false, dn: null, date: new Date().toISOString().split('T')[0] });
  const [showOverdue, setShowOverdue] = useState(false);
  const [printModal, setPrintModal] = useState({ show: false, dn: null, items: [] });
  
  // 簽收單據管理 Modal 狀態
  const [docModal, setDocModal] = useState({ show: false, dn: null });
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const fileInputRef = useRef(null);
  const detailFileInputRef = useRef(null);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 確保 signed_doc 欄位存在
      try { await window.electronAPI.namedQuery('migrateOutboundSignedDoc'); } catch(e) {}

      const res = await window.electronAPI.namedQuery('fetchLentRequests');
      if (res.success) {
        const rows = res.rows || [];
        setDnRecords(rows);
        // 如果目前待出貨為 0 且借出中有資料，自動切換至借出中
        const pCount = rows.filter(r => r.status === 'PENDING').length;
        const sCount = rows.filter(r => r.status === 'SHIPPED').length;
        if (pCount === 0 && sCount > 0 && activeTab === 'PENDING') {
          setActiveTab('SHIPPED');
        }
      } else {
        setError('無法讀取清單：' + (res.error || '未知錯誤'));
      }
    } catch (err) {
      console.error('Fetch Lent List error:', err);
      setError('連線異常，請檢查伺服器是否正常啟動。');
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchTerm, showOverdue]);

  const getMediaSrc = (fileName) => {
    if (!fileName) return null;
    const rawUrl = `erp-media:///${encodeURIComponent(fileName)}`;
    return window.getMediaUrl ? window.getMediaUrl(rawUrl) : rawUrl;
  };

  const handleViewDetails = async (dn) => {
    setSelectedDN(dn);
    setIsModalOpen(true);
    setIsDetailLoading(true);
    try {
      const res = await window.electronAPI.namedQuery('fetchDNItems', [dn.id]);
      if (res.success) {
        setDnItems(res.rows);
      } else {
        alert('無法讀取明細：' + res.error);
      }
    } catch (err) {
      console.error('Fetch details error:', err);
      alert('讀取明細失敗');
    } finally {
      setIsDetailLoading(false);
    }
  };

  const handleOpenPrintModal = async (dn, loadedItems = null) => {
    if (loadedItems && loadedItems.length > 0) {
      setPrintModal({ show: true, dn, items: loadedItems });
      return;
    }
    try {
      const res = await window.electronAPI.namedQuery('fetchDNItems', [dn.id]);
      if (res.success) {
        setPrintModal({ show: true, dn, items: res.rows || [] });
      } else {
        alert('無法讀取借用明細：' + res.error);
      }
    } catch (err) {
      console.error('Fetch items for print error:', err);
      alert('讀取借用明細失敗');
    }
  };

  // 上傳簽收單檔案
  const handleUploadSignedDoc = async (dn, file) => {
    if (!file) return;
    setIsUploadingDoc(true);
    try {
      const buffer = await file.arrayBuffer();
      const saveRes = await window.electronAPI.saveFile(file.name, buffer);
      if (!saveRes.success) throw new Error(saveRes.error || '檔案儲存失敗');

      const updateRes = await window.electronAPI.namedQuery('updateOutboundSignedDoc', [saveRes.fileName, file.name, dn.id]);
      if (!updateRes.success) throw new Error(updateRes.error || '資料庫更新失敗');

      logUpdate(
        'LENT',
        dn.id,
        dn.request_no,
        `上傳借用單 [${dn.request_no}] 之客戶已簽收單據 [${file.name}]`,
        { dnId: dn.id, dnNumber: dn.request_no, customer: dn.customer, fileName: saveRes.fileName, originalName: file.name }
      );

      alert(`客戶簽收單據 [${file.name}] 上傳成功！`);
      
      if (selectedDN && selectedDN.id === dn.id) {
        setSelectedDN(prev => ({ ...prev, signed_doc_url: saveRes.fileName, signed_doc_name: file.name }));
      }
      if (docModal.show && docModal.dn?.id === dn.id) {
        setDocModal(prev => ({ ...prev, dn: { ...prev.dn, signed_doc_url: saveRes.fileName, signed_doc_name: file.name } }));
      }
      await fetchRecords();
    } catch (err) {
      console.error('Upload signed doc error:', err);
      alert('上傳簽收單據失敗：' + err.message);
    } finally {
      setIsUploadingDoc(false);
    }
  };

  // 刪除簽收單檔案
  const handleDeleteSignedDoc = async (dn) => {
    if (!window.confirm(`確定要刪除借用單 [${dn.request_no}] 的客戶簽收單據 [${dn.signed_doc_name || '附件'}] 嗎？`)) return;

    try {
      const res = await window.electronAPI.namedQuery('removeOutboundSignedDoc', [dn.id]);
      if (!res.success) throw new Error(res.error || '刪除失敗');

      logDelete(
        'LENT',
        dn.id,
        dn.request_no,
        `刪除借用單 [${dn.request_no}] 之客戶已簽收單據 [${dn.signed_doc_name}]`,
        { dnId: dn.id, dnNumber: dn.request_no, customer: dn.customer, deletedDoc: dn.signed_doc_name }
      );

      alert('簽收單據已成功刪除！');

      if (selectedDN && selectedDN.id === dn.id) {
        setSelectedDN(prev => ({ ...prev, signed_doc_url: null, signed_doc_name: null }));
      }
      if (docModal.show && docModal.dn?.id === dn.id) {
        setDocModal(prev => ({ ...prev, dn: { ...prev.dn, signed_doc_url: null, signed_doc_name: null } }));
      }
      await fetchRecords();
    } catch (err) {
      console.error('Delete signed doc error:', err);
      alert('刪除簽收單據失敗：' + err.message);
    }
  };

  // 刪除借用單據 (僅限待出貨狀態)
  const handleDelete = async (dn) => {
    if (dn.status !== 'PENDING') {
      alert(`借用單 [${dn.request_no}] 目前狀態為【${dn.status === 'SHIPPED' ? '借出中' : '已結案'}】，不可直接刪除以維護庫存與歷史紀錄。`);
      return;
    }

    if (!window.confirm(`確定要刪除待借出單據 [${dn.request_no}] 嗎？\n此動作將一併移除所有關聯明細。`)) return;

    try {
      const res = await window.electronAPI.namedQuery('deleteOutboundRequest', [dn.id]);
      if (res.success) {
        logDelete('LENT', dn.request_no, dn.customer || '借用單', `刪除待借出單據 [${dn.request_no}]`, { dnId: dn.id, dnNumber: dn.request_no, customer: dn.customer });
        alert('刪除成功');
        fetchRecords();
      } else {
        alert('刪除失敗：' + res.error);
      }
    } catch (err) {
      console.error('Delete error:', err);
      alert('刪除失敗：' + err.message);
    }
  };

  // 確認借出 (出庫)
  const handleConfirmLoanDelivery = async (dn) => {
    if (!window.confirm(`確認要將借用單 [${dn.request_no}] 執行出庫/借出，並扣除庫存/將設備變更為借出 (LENT) 狀態嗎？`)) return;

    setIsConfirming(true);
    try {
      const res = await window.electronAPI.namedQuery('fetchDNItems', [dn.id]);
      if (!res.success) throw new Error('讀取借用明細失敗');
      const items = res.rows || [];

      // 階段一：事前驗證 (Pre-check)
      for (const item of items) {
        if (item.category_name === '耗材') {
          const stockRes = await window.electronAPI.namedQuery('checkItemStock', [item.item_id]);
          if (!stockRes.success || !stockRes.rows.length) {
            throw new Error(`【${item.brand} ${item.model}】查無庫存資料，無法作業。`);
          }
          const currentStock = stockRes.rows[0].stock_qty;
          if (currentStock < item.quantity) {
            throw new Error(`【${item.brand} ${item.model}】數量不足無法扣除 (目前庫存: ${currentStock}, 需要: ${item.quantity})。`);
          }
        } else if (item.category_name === '硬體' || item.category_name === '設備') {
          if (!item.sn) {
            throw new Error(`【${item.brand} ${item.model}】沒有對應的序號，無法出貨。`);
          }
          const assetRes = await window.electronAPI.namedQuery('checkAssetActive', [item.sn]);
          if (!assetRes.success || !assetRes.rows.length) {
            throw new Error(`【${item.brand} ${item.model}】序號 ${item.sn} 查不到有效資料。`);
          }
          if (assetRes.rows[0].status !== 'ACTIVE') {
            throw new Error(`【${item.brand} ${item.model}】序號 ${item.sn} 狀態為 ${assetRes.rows[0].status}，非可用(ACTIVE)狀態。`);
          }
        }
      }

      // 階段二：正式變更 (Commit)
      for (const item of items) {
        if (item.category_name === '耗材') {
          const updateRes = await window.electronAPI.namedQuery('updateStockQtyOnOutbound', [item.quantity, item.item_id]);
          if (!updateRes.success) throw new Error(`扣除耗材 [${item.brand} ${item.model}] 庫存失敗。`);
        } else if (item.category_name === '硬體' || item.category_name === '設備') {
          const destLocation = item.location || dn.location;
          const updateRes = await window.electronAPI.namedQuery('updateAssetStatusAndLocationBySn', ['LENT', destLocation, item.sn]);
          if (!updateRes.success) throw new Error(`變更序號 [${item.sn}] 狀態為借出失敗。`);
        }
      }

      // 更新出貨單狀態為 SHIPPED
      const finalRes = await window.electronAPI.namedQuery('updateOutboundRequestStatus', ['SHIPPED', dn.id]);
      if (!finalRes.success) throw new Error('變更借用單狀態失敗。');

      logStatusChange(
        'LENT',
        dn.request_no,
        dn.customer || '借用單',
        'PENDING',
        'SHIPPED',
        `借用單 [${dn.request_no}] 確認借出出庫 (${items.length} 項品項)`,
        { dnId: dn.id, dnNumber: dn.request_no, customer: dn.customer, itemsCount: items.length, items: items.map(i => ({ model: i.model, brand: i.brand, sn: i.sn, qty: i.quantity })) }
      );

      alert('借用單確認借出成功！設備狀態已更新為借出 (LENT)。');
      if (isModalOpen) setIsModalOpen(false);
      fetchRecords();

    } catch (err) {
      console.error('Confirm loan delivery error:', err);
      alert('⚠️ 確認借出失敗：\n' + err.message);
    } finally {
      setIsConfirming(false);
    }
  };

  const handleReturnToStockClick = (dn) => {
    setReturnModal({ show: true, dn, date: new Date().toISOString().split('T')[0] });
  };

  const executeReturnToStock = async () => {
    const { dn, date } = returnModal;
    if (!dn || !date) return;

    try {
      const res = await window.electronAPI.namedQuery('fetchDNItems', [dn.id]);
      if (!res.success) throw new Error('讀取明細失敗');
      const items = res.rows;
      
      for (const item of items) {
        if ((item.category_name === '硬體' || item.category_name === '設備') && item.sn) {
           const updateRes = await window.electronAPI.namedQuery('updateAssetStatusAndLocationBySn', ['ACTIVE', '', item.sn]);
           if (!updateRes.success) throw new Error(`變更序號 [${item.sn}] 狀態失敗。`);
        }
      }

      const finalRes = await window.electronAPI.namedQuery('updateOutboundRequestReturned', [dn.id, date]);
      if (!finalRes.success) throw new Error('變更借用單狀態失敗。');

      logStatusChange(
        'LENT',
        dn.request_no,
        dn.customer || '借用單',
        'SHIPPED',
        'RETURNED',
        `登記借用單 [${dn.request_no}] 歸還入庫 (歸還日: ${date}, 共 ${items.length} 項品項)`,
        { dnId: dn.id, dnNumber: dn.request_no, customer: dn.customer, returnDate: date, itemsCount: items.length, items: items.map(i => ({ model: i.model, brand: i.brand, sn: i.sn })) }
      );

      alert('歸還成功！設備已恢復為在庫狀態。');
      setReturnModal({ show: false, dn: null, date: '' });
      fetchRecords();

    } catch (err) {
      console.error('Return error:', err);
      alert('歸還過程中發生錯誤：\n' + err.message);
    }
  };

  const filteredRecords = dnRecords.filter(dn => {
    if (dn.status !== activeTab) return false;
    
    if (showOverdue && activeTab === 'SHIPPED') {
      const today = new Date().toISOString().split('T')[0];
      const returnDate = dn.expected_return_date ? new Date(dn.expected_return_date).toISOString().split('T')[0] : null;
      if (!returnDate || returnDate >= today) return false;
    }
    
    const search = searchTerm.toLowerCase();
    if (!search) return true;
    return (dn.request_no || '').toLowerCase().includes(search) ||
           (dn.customer || '').toLowerCase().includes(search) ||
           (dn.project_name || '').toLowerCase().includes(search) ||
           (dn.signed_doc_name || '').toLowerCase().includes(search) ||
           (dn.searchable_items || '').toLowerCase().includes(search);
  });

  const [itemsPerPage, setItemsPerPage] = usePageSize('lent_list', 10);
  const totalPages = Math.ceil(filteredRecords.length / itemsPerPage) || 1;
  const currentRecords = filteredRecords.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const pendingCount = dnRecords.filter(dn => dn.status === 'PENDING').length;
  const shippedCount = dnRecords.filter(dn => dn.status === 'SHIPPED').length;
  const returnedCount = dnRecords.filter(dn => dn.status === 'RETURNED').length;

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: '900', margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-main)' }}>
              <FileText size={26} color="var(--primary-color)" /> 設備/硬體借用列表 (Device/HW Lent List)
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px', marginBottom: 0 }}>檢視所有借出中的設備與硬體紀錄，並可上傳/管理客戶已簽收單據供日後查驗。</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              style={{
                padding: '8px 16px',
                backgroundColor: 'var(--primary-color)',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)'
              }}
            >
              <Clock size={18} /> ➕ 新增借用單 (New Lent Order)
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div style={{ backgroundColor: 'var(--bg-surface)', padding: '12px 24px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', gap: '24px', boxShadow: 'var(--card-shadow)' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>待出貨單據</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#3b82f6' }}>
                  {pendingCount} <span style={{ fontSize: '0.8rem', fontWeight: 400, opacity: 0.8 }}>單</span>
                </div>
              </div>
              <div style={{ borderLeft: '1px solid var(--border-color)', paddingLeft: '24px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>借出中 (待歸還)</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f59e0b' }}>
                  {shippedCount} <span style={{ fontSize: '0.8rem', fontWeight: 400, opacity: 0.8 }}>單</span>
                </div>
              </div>
           </div>
        </div>
      </div>

      <div className="card-surface" style={{ padding: '0', overflow: 'hidden' }}>
        {/* 三大頁籤 */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface-subtle)' }}>
          <button 
            onClick={() => setActiveTab('PENDING')}
            style={{ 
              padding: '16px 24px', 
              border: 'none', 
              backgroundColor: activeTab === 'PENDING' ? 'var(--bg-surface)' : 'transparent',
              borderBottom: activeTab === 'PENDING' ? '3px solid #3b82f6' : '3px solid transparent',
              color: activeTab === 'PENDING' ? '#3b82f6' : 'var(--text-muted)',
              fontWeight: activeTab === 'PENDING' ? 800 : 600,
              fontSize: '0.95rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Clock size={18} /> 已建立 (待借出)
            {pendingCount > 0 && (
              <span style={{ backgroundColor: '#3b82f6', color: '#fff', padding: '2px 8px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 800 }}>
                {pendingCount}
              </span>
            )}
          </button>
          <button 
            onClick={() => setActiveTab('SHIPPED')}
            style={{ 
              padding: '16px 24px', 
              border: 'none', 
              backgroundColor: activeTab === 'SHIPPED' ? 'var(--bg-surface)' : 'transparent',
              borderBottom: activeTab === 'SHIPPED' ? '3px solid #f59e0b' : '3px solid transparent',
              color: activeTab === 'SHIPPED' ? '#f59e0b' : 'var(--text-muted)',
              fontWeight: activeTab === 'SHIPPED' ? 800 : 600,
              fontSize: '0.95rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Send size={18} /> 借出中 (待歸還)
            {shippedCount > 0 && (
              <span style={{ backgroundColor: '#f59e0b', color: '#fff', padding: '2px 8px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 800 }}>
                {shippedCount}
              </span>
            )}
          </button>
          <button 
            onClick={() => setActiveTab('RETURNED')}
            style={{ 
              padding: '16px 24px', 
              border: 'none', 
              backgroundColor: activeTab === 'RETURNED' ? 'var(--bg-surface)' : 'transparent',
              borderBottom: activeTab === 'RETURNED' ? '3px solid #10b981' : '3px solid transparent',
              color: activeTab === 'RETURNED' ? '#10b981' : 'var(--text-muted)',
              fontWeight: activeTab === 'RETURNED' ? 800 : 600,
              fontSize: '0.95rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <CheckCircle size={18} /> 已結案 (歷史紀錄)
          </button>
        </div>

        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', backgroundColor: 'var(--bg-surface)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
            <div style={{ position: 'relative', width: '320px' }}>
              <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
              <input 
                type="text" 
                placeholder="快速搜尋單號、客戶、專案、簽收單..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ width: '100%', padding: '10px 12px 10px 40px', borderRadius: '20px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', outline: 'none', fontSize: '0.9rem' }}
              />
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm('')} 
                  style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', padding: '4px', display: 'flex', alignItems: 'center' }}
                >
                  ✕
                </button>
              )}
            </div>
            
            {activeTab === 'SHIPPED' && (
              <button
                onClick={() => setShowOverdue(!showOverdue)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '20px',
                  border: showOverdue ? 'none' : '1px solid var(--border-color)',
                  backgroundColor: showOverdue ? '#fee2e2' : 'var(--bg-surface-subtle)',
                  color: showOverdue ? '#ef4444' : 'var(--text-muted)',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s'
                }}
              >
                🚨 僅顯示逾期未還
              </button>
            )}
          </div>
        </div>

        {error && (
          <div style={{ margin: '20px', padding: '16px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <AlertCircle size={20} />
            <span style={{ fontWeight: 600 }}>{error}</span>
          </div>
        )}

        <div style={{ overflowX: 'auto', padding: '0 24px 24px', backgroundColor: 'var(--bg-surface)' }}>
          <table className="vibrant-table" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '16px' }}>
            <thead style={{ backgroundColor: 'var(--table-header-bg)', borderBottom: '2px solid var(--border-color)' }}>
              <tr style={{ textAlign: 'left' }}>
                <th style={{ padding: '14px 12px', fontSize: '0.95rem', color: 'var(--table-header-text)', fontWeight: 800 }}>借用單號</th>
                <th style={{ padding: '14px 12px', fontSize: '0.95rem', color: 'var(--table-header-text)', fontWeight: 800 }}>借出日期</th>
                <th style={{ padding: '14px 12px', fontSize: '0.95rem', color: 'var(--table-header-text)', fontWeight: 800 }}>客戶/對象</th>
                <th style={{ padding: '14px 12px', fontSize: '0.95rem', color: 'var(--table-header-text)', fontWeight: 800 }}>預計歸還日</th>
                {activeTab === 'RETURNED' && <th style={{ padding: '14px 12px', fontSize: '0.95rem', color: 'var(--table-header-text)', fontWeight: 800 }}>實際歸還日</th>}
                <th style={{ padding: '14px 12px', fontSize: '0.95rem', color: 'var(--table-header-text)', fontWeight: 800 }}>狀態</th>
                <th style={{ padding: '14px 12px', fontSize: '0.95rem', color: 'var(--table-header-text)', fontWeight: 800 }}>簽收單據</th>
                <th style={{ padding: '14px 12px', fontSize: '0.95rem', color: 'var(--table-header-text)', fontWeight: 800 }}>所屬專案</th>
                <th style={{ padding: '14px 12px', fontSize: '0.95rem', color: 'var(--table-header-text)', fontWeight: 800 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="9" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>讀取中...</td></tr>
              ) : currentRecords.length === 0 ? (
                <tr><td colSpan="9" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  {activeTab === 'PENDING' ? '目前尚無待借出單據' : (activeTab === 'SHIPPED' ? '目前尚無借用中單據' : '目前尚無已歸還的歷史紀錄')}
                </td></tr>
              ) : currentRecords.map(dn => (
                <tr key={dn.id} className="row-hover" style={{ borderBottom: '1px solid var(--table-border)', color: 'var(--text-main)' }}>
                  <td style={{ padding: '12px', fontWeight: 700, color: 'var(--text-main)' }}>
                    {dn.request_no}
                  </td>
                  <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{new Date(dn.shipping_date).toLocaleDateString()}</td>
                  <td style={{ padding: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{dn.customer}</span>
                      {dn.contact_info && (
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', backgroundColor: 'var(--bg-surface-subtle)', padding: '2px 8px', borderRadius: '4px' }}>
                          {dn.contact_info}
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '12px', color: dn.status === 'SHIPPED' ? '#f59e0b' : 'var(--text-muted)', fontWeight: dn.status === 'SHIPPED' ? 700 : 400 }}>
                    {dn.expected_return_date ? new Date(dn.expected_return_date).toLocaleDateString() : '-'}
                  </td>
                  {activeTab === 'RETURNED' && (
                    <td style={{ padding: '12px', color: '#10b981', fontWeight: 600 }}>
                      {dn.actual_return_date ? new Date(dn.actual_return_date).toLocaleDateString() : '-'}
                    </td>
                  )}
                  <td style={{ padding: '12px' }}>
                    <span style={{ 
                      padding: '4px 10px', 
                      borderRadius: '12px', 
                      fontSize: '0.8rem', 
                      fontWeight: 600,
                      backgroundColor: dn.status === 'SHIPPED' ? 'rgba(245, 158, 11, 0.15)' : (dn.status === 'RETURNED' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(59, 130, 246, 0.15)'),
                      color: dn.status === 'SHIPPED' ? '#f59e0b' : (dn.status === 'RETURNED' ? '#22c55e' : '#3b82f6')
                    }}>
                      {dn.status === 'PENDING' ? '待出貨 (已建立)' : (dn.status === 'SHIPPED' ? '借出中' : (dn.status === 'RETURNED' ? '已歸還' : dn.status))}
                    </span>
                  </td>
                  {/* 簽收單據欄位 */}
                  <td style={{ padding: '12px' }}>
                    {dn.signed_doc_url ? (
                      <button
                        onClick={() => setDocModal({ show: true, dn })}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 10px',
                          borderRadius: '16px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          backgroundColor: 'rgba(16, 185, 129, 0.15)',
                          color: '#10b981',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                          cursor: 'pointer'
                        }}
                        title={`點選檢視簽收單: ${dn.signed_doc_name || '附件'}`}
                      >
                        <FileCheck size={13} /> 已簽收
                      </button>
                    ) : (
                      <button
                        onClick={() => setDocModal({ show: true, dn })}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '4px 8px',
                          borderRadius: '16px',
                          fontSize: '0.75rem',
                          color: 'var(--text-muted)',
                          backgroundColor: 'var(--bg-surface-subtle)',
                          border: '1px solid var(--border-color)',
                          cursor: 'pointer'
                        }}
                        title="上傳客戶簽收單據"
                      >
                        <Paperclip size={12} /> 未上傳
                      </button>
                    )}
                  </td>
                  <td style={{ padding: '12px' }}>
                     {dn.project_name ? (
                        <span style={{ fontWeight: 600, color: '#818cf8', backgroundColor: 'rgba(99, 102, 241, 0.15)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.85rem' }}>
                          {dn.project_name}
                        </span>
                     ) : <span style={{ color: 'var(--text-subtle)', fontSize: '0.85rem' }}>-</span>}
                  </td>
                  <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', whiteSpace: 'nowrap' }}>
                      <button 
                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', padding: 0, backgroundColor: 'var(--primary-bg)', color: 'var(--primary-color)', border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: '6px', cursor: 'pointer', flexShrink: 0 }}
                        title="查看詳情"
                        aria-label="檢視"
                        onClick={() => handleViewDetails(dn)}
                      >
                        <Eye size={16} />
                      </button>
                      <button 
                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', padding: 0, backgroundColor: 'rgba(37, 99, 235, 0.12)', color: '#2563eb', border: '1px solid rgba(37, 99, 235, 0.25)', borderRadius: '6px', cursor: 'pointer', flexShrink: 0 }}
                        title="產生/列印借貨申請單 (PDF)"
                        aria-label="借貨單"
                        onClick={() => handleOpenPrintModal(dn)}
                      >
                        <Printer size={16} />
                      </button>
                      {dn.status === 'PENDING' && (
                        <button 
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', padding: 0, backgroundColor: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: '6px', cursor: 'pointer', flexShrink: 0 }}
                          title="確認出庫借出"
                          aria-label="確認借出"
                          disabled={isConfirming}
                          onClick={() => handleConfirmLoanDelivery(dn)}
                        >
                          <Send size={16} />
                        </button>
                      )}
                      {dn.status === 'SHIPPED' && (
                        <button 
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', padding: 0, backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '6px', cursor: 'pointer', flexShrink: 0 }}
                          title="歸還入庫"
                          aria-label="歸還入庫"
                          onClick={() => handleReturnToStockClick(dn)}
                        >
                          <CornerDownLeft size={16} />
                        </button>
                      )}
                      {dn.status === 'PENDING' && (
                        <button 
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', padding: 0, backgroundColor: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '6px', cursor: 'pointer', flexShrink: 0 }}
                          title="刪除借用單"
                          aria-label="刪除"
                          onClick={() => handleDelete(dn)}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
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
      </div>

      {/* 借用單明細彈窗 */}
      {isModalOpen && selectedDN && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content dn-modal" style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={18} color="#f59e0b" />
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-main)' }}>借用明細</h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{selectedDN.request_no}</span>
                </div>
              </div>
              <button className="close-btn" onClick={() => setIsModalOpen(false)} style={{ color: 'var(--text-muted)' }}>&times;</button>
            </div>
            
            <div className="modal-body" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="dn-summary" style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', padding: '12px 16px', borderRadius: '8px', backgroundColor: 'var(--bg-surface-subtle)', border: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="summary-label" style={{ margin: 0, color: 'var(--text-muted)' }}>客戶對象:</span>
                  <span className="summary-value" style={{ fontSize: '0.85rem', color: 'var(--text-main)', fontWeight: 600 }}>
                    {selectedDN.customer} 
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="summary-label" style={{ margin: 0, color: 'var(--text-muted)' }}>狀態:</span>
                  <span className="summary-value" style={{ fontSize: '0.85rem' }}>
                    {selectedDN.status === 'PENDING' ? (
                      <span style={{ color: '#3b82f6', fontWeight: 700 }}>待出貨 (已建立)</span>
                    ) : selectedDN.status === 'SHIPPED' ? (
                      <span style={{ color: '#f59e0b', fontWeight: 700 }}>借出中</span>
                    ) : (
                      <span style={{ color: '#10b981', fontWeight: 700 }}>已歸還</span>
                    )}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="summary-label" style={{ margin: 0, color: 'var(--text-muted)' }}>借出日期:</span>
                  <span className="summary-value" style={{ fontSize: '0.85rem', color: 'var(--text-main)' }}>{new Date(selectedDN.shipping_date).toLocaleDateString()}</span>
                </div>
              </div>

              {/* 項目清單 */}
              <div className="dn-items-list" style={{ marginBottom: '12px' }}>
                <h4 style={{ marginBottom: '8px', fontSize: '0.85rem', color: 'var(--text-main)', fontWeight: 800 }}>項目清單 ({dnItems.length})</h4>
                <div className="dn-items-list-container" style={{ maxHeight: '340px', overflowY: 'auto' }}>
                  <table className="dn-items-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--table-header-bg)', zIndex: 10 }}>
                      <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>
                        <th style={{ padding: '8px 12px', fontSize: '0.75rem', color: 'var(--table-header-text)' }}>類型</th>
                        <th style={{ padding: '8px 12px', fontSize: '0.75rem', color: 'var(--table-header-text)' }}>項目詳情</th>
                        <th style={{ padding: '8px 12px', fontSize: '0.75rem', color: 'var(--table-header-text)' }}>序號 (S/N)</th>
                        <th style={{ padding: '8px 12px', fontSize: '0.75rem', color: 'var(--table-header-text)', textAlign: 'center' }}>數量</th>
                      </tr>
                    </thead>
                    <tbody>
                      {isDetailLoading ? (
                        <tr><td colSpan="4" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>讀取中...</td></tr>
                      ) : dnItems.map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--table-border)' }}>
                          <td style={{ padding: '12px' }}>
                            <span style={{ 
                              padding: '2px 8px', 
                              borderRadius: '4px', 
                              fontSize: '0.7rem', 
                              fontWeight: 700,
                              backgroundColor: item.category_name === '設備' ? 'rgba(79, 70, 229, 0.15)' : (item.category_name === '硬體' ? 'rgba(219, 39, 119, 0.15)' : 'var(--bg-surface-subtle)'),
                              color: item.category_name === '設備' ? '#818cf8' : (item.category_name === '硬體' ? '#f472b6' : 'var(--text-muted)')
                            }}>
                              {item.category_name || '其他'}
                            </span>
                          </td>
                          <td style={{ padding: '12px' }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.85rem' }}>{item.brand} {item.model}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>{item.specification}</div>
                          </td>
                          <td style={{ padding: '12px' }}>
                            {item.sn ? (
                              <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-main)', border: '1px solid var(--border-color)', padding: '2px 6px', borderRadius: '4px' }}>
                                {item.sn}
                              </span>
                            ) : <span style={{ color: 'var(--text-subtle)', fontSize: '0.8rem' }}>-</span>}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'center', fontWeight: 600, color: 'var(--primary-color)' }}>
                            {item.quantity}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 客戶已簽收單據區塊 */}
              <div style={{ padding: '14px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface-subtle)', marginBottom: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Paperclip size={15} color="#10b981" /> 客戶已簽收單據 (Signed Document)
                  </span>
                  <div>
                    {selectedDN.signed_doc_url ? (
                      <button
                        onClick={() => handleDeleteSignedDoc(selectedDN)}
                        style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.3)', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Trash2 size={13} /> 刪除檔案
                      </button>
                    ) : (
                      <button
                        onClick={() => detailFileInputRef.current?.click()}
                        disabled={isUploadingDoc}
                        style={{ padding: '4px 12px', borderRadius: '6px', border: 'none', backgroundColor: '#10b981', color: '#fff', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Upload size={13} /> {isUploadingDoc ? '上傳中...' : '上傳簽收單'}
                      </button>
                    )}
                    <input
                      type="file"
                      ref={detailFileInputRef}
                      style={{ display: 'none' }}
                      accept="image/*,.pdf"
                      onChange={(e) => {
                        if (e.target.files?.[0]) {
                          handleUploadSignedDoc(selectedDN, e.target.files[0]);
                        }
                      }}
                    />
                  </div>
                </div>

                {selectedDN.signed_doc_url ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', backgroundColor: 'var(--bg-surface)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                      <FileCheck size={16} color="#10b981" />
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {selectedDN.signed_doc_name || '客戶簽收單據'}
                      </span>
                    </div>
                    <a
                      href={getMediaSrc(selectedDN.signed_doc_url)}
                      target="_blank"
                      rel="noreferrer"
                      download={selectedDN.signed_doc_name || '借貨簽收單'}
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: 'var(--primary-color)', fontWeight: 700, textDecoration: 'none', padding: '4px 8px', borderRadius: '4px', backgroundColor: 'var(--primary-bg)' }}
                    >
                      <ExternalLink size={14} /> 開啟 / 下載查驗
                    </a>
                  </div>
                ) : (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '12px' }}>
                    尚未上傳客戶簽收單據。收到客戶簽名蓋章回傳單據後，請點選上方按鈕上傳儲存供日後稽核查驗。
                  </div>
                )}
              </div>
            </div>
            
            <div className="modal-footer" style={{ padding: '12px 20px', display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid var(--border-color)' }}>
              {selectedDN.status === 'PENDING' && (
                <button 
                  onClick={() => handleConfirmLoanDelivery(selectedDN)}
                  disabled={isConfirming}
                  style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', backgroundColor: '#10b981', color: 'white', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Send size={16} /> 確認出庫借出
                </button>
              )}
              <button 
                onClick={() => { setIsModalOpen(false); handleOpenPrintModal(selectedDN, dnItems); }}
                style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', backgroundColor: '#2563eb', color: 'white', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)' }}
              >
                <Printer size={16} /> 🖨️ 產生/列印借貨申請單 (PDF)
              </button>
              <button 
                onClick={() => setIsModalOpen(false)}
                style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-main)', fontWeight: 600, cursor: 'pointer' }}
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 專屬簽收單據管理 Modal */}
      {docModal.show && docModal.dn && (
        <div className="modal-overlay" style={{ zIndex: 9999 }} onClick={() => setDocModal({ show: false, dn: null })}>
          <div className="modal-content" style={{ width: '480px', padding: '24px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '16px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Paperclip size={20} color="#10b981" />
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-main)' }}>客戶已簽收單據管理</h3>
              </div>
              <X size={20} style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setDocModal({ show: false, dn: null })} />
            </div>

            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '16px' }}>
              單號：<strong style={{ color: 'var(--primary-color)' }}>{docModal.dn.request_no}</strong> ({docModal.dn.customer})
            </p>

            {docModal.dn.signed_doc_url ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ padding: '16px', borderRadius: '12px', backgroundColor: 'var(--bg-surface-subtle)', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                  {docModal.dn.signed_doc_url.match(/\.(jpeg|jpg|png|webp|gif)$/i) ? (
                    <img 
                      src={getMediaSrc(docModal.dn.signed_doc_url)} 
                      alt="簽收單預覽" 
                      style={{ maxHeight: '200px', maxWidth: '100%', borderRadius: '8px', objectFit: 'contain', border: '1px solid var(--border-color)' }} 
                    />
                  ) : (
                    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                      <FileCheck size={40} color="#10b981" />
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)' }}>{docModal.dn.signed_doc_name || '已簽收 PDF 檔案'}</span>
                    </div>
                  )}
                  <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-main)' }}>{docModal.dn.signed_doc_name}</span>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <a
                    href={getMediaSrc(docModal.dn.signed_doc_url)}
                    target="_blank"
                    rel="noreferrer"
                    download={docModal.dn.signed_doc_name || '借貨簽收單'}
                    style={{ flex: 1, padding: '10px', borderRadius: '8px', backgroundColor: '#2563eb', color: '#fff', textAlign: 'center', textDecoration: 'none', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    <ExternalLink size={16} /> 開啟 / 下載查驗
                  </a>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingDoc}
                    style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-main)', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Upload size={16} /> 更換
                  </button>
                  <button
                    onClick={() => handleDeleteSignedDoc(docModal.dn)}
                    style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.3)', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Trash2 size={16} /> 刪除
                  </button>
                </div>
              </div>
            ) : (
              <div 
                onClick={() => fileInputRef.current?.click()}
                style={{ 
                  padding: '36px 20px', 
                  borderRadius: '12px', 
                  border: '2px dashed var(--border-color)', 
                  backgroundColor: 'var(--bg-surface-subtle)', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  gap: '12px', 
                  cursor: 'pointer' 
                }}
              >
                <Upload size={32} color="#10b981" />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-main)' }}>點此上傳客戶已簽收的借貨單</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>支援 PNG、JPG、PDF 格式檔案</div>
                </div>
              </div>
            )}

            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept="image/*,.pdf"
              onChange={(e) => {
                if (e.target.files?.[0]) {
                  handleUploadSignedDoc(docModal.dn, e.target.files[0]);
                }
              }}
            />
          </div>
        </div>
      )}

      {/* 歸還入庫確認 Modal */}
      {returnModal.show && returnModal.dn && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal-content" style={{ width: '400px', padding: '24px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}>
            <h3 style={{ marginTop: 0, color: 'var(--text-main)' }}>歸還入庫確認</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '16px' }}>
              將單號 <strong style={{ color: 'var(--primary-color)' }}>{returnModal.dn.request_no}</strong> 標記為已歸還，並設定其實際歸還日期。相關設備將同步入庫。
            </p>
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px', color: 'var(--text-main)' }}>
                歸還入庫日期
              </label>
              <input 
                type="date"
                value={returnModal.date}
                onChange={e => setReturnModal({ ...returnModal, date: e.target.value })}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', outline: 'none' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setReturnModal({ show: false, dn: null, date: '' })}
                style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-main)', fontWeight: 600, cursor: 'pointer' }}
              >
                取消
              </button>
              <button 
                onClick={executeReturnToStock}
                style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: '#10b981', color: 'white', fontWeight: 600, cursor: 'pointer' }}
              >
                確定歸還
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 借用單建檔 (Lend Note Registration) Modal */}
      {isCreateModalOpen && (
        <LendOrderRegistrationModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onSuccess={(createdDn, items) => {
            setIsCreateModalOpen(false);
            fetchRecords();
            setPrintModal({ show: true, dn: createdDn, items });
            setActiveTab('PENDING');
          }}
        />
      )}

      {/* 借貨申請單列印/預覽 Modal */}
      {printModal.show && printModal.dn && (
        <LentOrderPrintModal
          isOpen={printModal.show}
          onClose={() => setPrintModal({ show: false, dn: null, items: [] })}
          dnData={printModal.dn}
          items={printModal.items}
        />
      )}
    </div>
  );
};

export default LentList;
