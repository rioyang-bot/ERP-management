import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  FileText, Search, Filter, Eye, RefreshCw, AlertCircle, Trash2, Calendar, 
  Printer, Paperclip, Upload, FileCheck, ExternalLink, X 
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { logStatusChange, logDelete, logUpdate } from '../utils/auditLogger';
import LentOrderPrintModal from '../components/LentOrderPrintModal';
import DeliveryReceiptPrintModal from '../components/DeliveryReceiptPrintModal';
import OutboundRegistrationModal from '../components/OutboundRegistrationModal';

const DNList = ({ isSplitMode = false }) => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchField, setSearchField] = useState('all');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  const searchOptions = [
    { value: 'all', label: '全部欄位' },
    { value: 'request_no', label: 'D/N 單號' },
    { value: 'customer', label: '客戶名稱' }
  ];

  const [dnRecords, setDnRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [selectedDN, setSelectedDN] = useState(null);
  const [dnItems, setDnItems] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [printModal, setPrintModal] = useState({ show: false, dn: null, items: [] });
  const [deliveryReceiptModal, setDeliveryReceiptModal] = useState({ show: false, dn: null, items: [] });
  
  // 客戶簽收單據相關狀態與 Refs
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [docModal, setDocModal] = useState({ show: false, dn: null });
  const detailFileInputRef = useRef(null);
  const tableFileInputRef = useRef(null);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, searchField, statusFilter, startDate, endDate]);

  const getMediaSrc = (fileName) => {
    if (!fileName) return null;
    const rawUrl = `erp-media:///${encodeURIComponent(fileName)}`;
    return window.getMediaUrl ? window.getMediaUrl(rawUrl) : rawUrl;
  };

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 確保 signed_doc 欄位存在
      try { await window.electronAPI.namedQuery('migrateOutboundSignedDoc'); } catch(e) {}
      const res = await window.electronAPI.namedQuery('fetchDNList');
      if (res.success) {
        setDnRecords(res.rows || []);
      } else {
        setError('無法讀取清單：' + (res.error || '未知錯誤'));
      }
    } catch (err) {
      console.error('Fetch DN List error:', err);
      if (err.message.includes('JSON')) {
        setError('伺服器資料解析失敗，請嘗試重新整理。');
      } else {
        setError('連線異常，請檢查伺服器是否正常啟動。');
      }
    } finally {
      setLoading(false);
    }
  }, []);

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
        'OUTBOUND',
        dn.id,
        dn.request_no,
        `上傳出貨單 [${dn.request_no}] 之客戶已簽收單據 [${file.name}]`,
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
    if (!window.confirm(`確定要刪除出貨單 [${dn.request_no}] 的客戶簽收單據 [${dn.signed_doc_name || '附件'}] 嗎？`)) return;

    try {
      const res = await window.electronAPI.namedQuery('removeOutboundSignedDoc', [dn.id]);
      if (!res.success) throw new Error(res.error || '刪除失敗');

      logDelete(
        'OUTBOUND',
        dn.id,
        dn.request_no,
        `刪除出貨單 [${dn.request_no}] 之客戶已簽收單據 [${dn.signed_doc_name}]`,
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

  const handleDelete = async (dn) => {
    if (dn.status !== 'PENDING') {
      alert(`出貨單 [${dn.request_no}] 目前狀態為【${dn.status === 'SHIPPED' ? '已出貨' : '已結案'}】，不可直接刪除以維護庫存狀態與歷史紀錄。`);
      return;
    }

    if (!window.confirm(`確定要刪除待出貨單據 [${dn.request_no}] 嗎？\n此動作將一併移除所有關聯明細。`)) return;

    try {
      const res = await window.electronAPI.namedQuery('deleteOutboundRequest', [dn.id]);
      if (res.success) {
        logDelete('OUTBOUND', dn.request_no, dn.customer || '出貨單', `刪除待出貨單據 [${dn.request_no}]`, { dnId: dn.id, dnNumber: dn.request_no, customer: dn.customer });
        alert('刪除成功');
        fetchRecords();
      } else {
        alert('刪除失敗：' + res.error);
      }
    } catch (err) {
      console.error('Delete error:', err);
      alert('刪除過程中發生錯誤');
    }
  };

  const handleConfirmDelivery = async () => {
    if (!selectedDN || !dnItems.length) return;
    if (!window.confirm(`確認要將出貨單 [${selectedDN.request_no}] 狀態設定為已出貨並扣除庫存嗎？`)) return;

    setIsConfirming(true);
    try {
      // 階段一：事前驗證 (Pre-check)
      for (const item of dnItems) {
        if (item.category_name === '耗材') {
          const res = await window.electronAPI.namedQuery('checkItemStock', [item.item_id]);
          if (!res.success || !res.rows.length) {
            throw new Error(`【${item.brand} ${item.model}】查無庫存資料，無法作業。`);
          }
          const currentStock = res.rows[0].stock_qty;
          if (currentStock < item.quantity) {
            throw new Error(`【${item.brand} ${item.model}】數量不足無法扣除 (目前庫存: ${currentStock}, 需要: ${item.quantity})。`);
          }
        } else if (item.category_name === '硬體' || item.category_name === '設備') {
          if (!item.sn) {
            throw new Error(`【${item.brand} ${item.model}】沒有對應的序號，無法出貨。`);
          }
          const res = await window.electronAPI.namedQuery('checkAssetActive', [item.sn]);
          if (!res.success || !res.rows.length) {
            throw new Error(`【${item.brand} ${item.model}】序號 ${item.sn} 查不到有效資料。`);
          }
          if (res.rows[0].status !== 'ACTIVE') {
            throw new Error(`【${item.brand} ${item.model}】序號 ${item.sn} 狀態為 ${res.rows[0].status}，非可用(ACTIVE)狀態。`);
          }
        }
      }

      // 階段二：正式變更 (Commit)
      for (const item of dnItems) {
        if (item.category_name === '耗材') {
           const res = await window.electronAPI.namedQuery('updateStockQtyOnOutbound', [item.quantity, item.item_id]);
           if (!res.success) throw new Error(`扣除耗材 [${item.brand} ${item.model}] 庫存時發生錯誤。`);
        } else if (item.category_name === '硬體' || item.category_name === '設備') {
           const destLocation = item.location || selectedDN.location;
           const assetStatus = selectedDN.request_type === 'LEND' ? 'LENT' : 'SHIPPED';
           const res = await window.electronAPI.namedQuery('updateAssetStatusAndLocationBySn', [assetStatus, destLocation, item.sn]);
           if (!res.success) throw new Error(`變更序號 [${item.sn}] 狀態時發生錯誤。`);
        }
      }

      // 更新出貨單狀態
      const finalRes = await window.electronAPI.namedQuery('updateOutboundRequestStatus', ['SHIPPED', selectedDN.id]);
      if (!finalRes.success) throw new Error('變更出貨單主檔狀態時發生錯誤。');

      logStatusChange(
        'OUTBOUND',
        selectedDN.request_no,
        selectedDN.customer || '出貨單',
        selectedDN.status || 'PENDING',
        'SHIPPED',
        `出貨單 [${selectedDN.request_no}] 確認出貨並完成庫存扣除 (${dnItems.length} 項品項)`,
        { dnId: selectedDN.id, dnNumber: selectedDN.request_no, customer: selectedDN.customer, itemsCount: dnItems.length, items: dnItems.map(i => ({ model: i.model, brand: i.brand, sn: i.sn, qty: i.quantity })) }
      );

      alert('出貨成功！狀態已變更且相關庫存已扣除。');
      setIsModalOpen(false);
      fetchRecords();

    } catch (err) {
      console.error('Confirm delivery error:', err);
      // Fallback 秀出告警視窗 (透過原生 alert, 未來可更換為自訂 Modal)
      alert('⚠️ 異常告警\n\n確認出貨失敗：\n' + err.message);
    } finally {
      setIsConfirming(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const filteredRecords = dnRecords.filter(dn => {
    const search = searchTerm.toLowerCase();
    
    let matchSearch = true;
    if (searchField === 'all') {
      matchSearch = (dn.request_no || '').toLowerCase().includes(search) ||
             (dn.customer || '').toLowerCase().includes(search) ||
             (dn.signed_doc_name || '').toLowerCase().includes(search);
    } else if (searchField === 'request_no') {
      matchSearch = (dn.request_no || '').toLowerCase().includes(search);
    } else if (searchField === 'customer') {
      matchSearch = (dn.customer || '').toLowerCase().includes(search);
    }

    if (!matchSearch) return false;

    if (statusFilter !== 'ALL') {
      if (dn.status !== statusFilter) return false;
    }

    if (startDate || endDate) {
      const dnDate = new Date(dn.created_at || dn.shipping_date);
      dnDate.setHours(0,0,0,0);
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0,0,0,0);
        if (dnDate < start) return false;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(0,0,0,0);
        if (dnDate > end) return false;
      }
    }
    return true;
  });

  const sortedAndFiltered = [...filteredRecords].sort((a, b) => {
    const aIncomplete = a.status !== 'SHIPPED';
    const bIncomplete = b.status !== 'SHIPPED';
    if (aIncomplete && !bIncomplete) return -1;
    if (!aIncomplete && bIncomplete) return 1;
    return new Date(b.shipping_date) - new Date(a.shipping_date);
  });

  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.ceil(sortedAndFiltered.length / ITEMS_PER_PAGE) || 1;
  const currentRecords = sortedAndFiltered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const pendingCount = dnRecords.filter(dn => dn.status !== 'SHIPPED').length;

  return (
    <div className="page-container" style={isSplitMode ? { padding: 0, minHeight: 'auto', backgroundColor: 'transparent' } : {}}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: '900', margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-main)' }}>
              <FileText size={26} color="var(--primary-color)" /> 出貨單列表 (Delivery Note List)
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px', marginBottom: 0 }}>檢視所有出貨紀錄、追蹤出單進度並執行扣庫存作業。</p>
          </div>
          {!isSplitMode && (
            <div style={{ display: 'flex', backgroundColor: 'var(--bg-surface-subtle)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
              <button
                onClick={() => setShowAddModal(true)}
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
                <FileText size={18} /> ➕ 新增出貨單 (New Delivery Note)
              </button>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
           <div style={{ backgroundColor: 'var(--bg-surface)', padding: '12px 24px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', gap: '24px', boxShadow: 'var(--card-shadow)' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>待處理出貨單</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f97316' }}>
                  {pendingCount} <span style={{ fontSize: '0.8rem', fontWeight: 400, opacity: 0.8 }}>單</span>
                </div>
              </div>

           </div>
        </div>
      </div>

      <div className="card-surface" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '16px', alignItems: 'center', backgroundColor: 'var(--bg-surface-subtle)' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1 }}>
            <select 
              value={searchField} 
              onChange={e => setSearchField(e.target.value)}
              style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--input-border)', outline: 'none', fontSize: '0.9rem', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', cursor: 'pointer', minWidth: '130px' }}
            >
              {searchOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            <div style={{ position: 'relative', width: '320px' }}>
              <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
              <input 
                type="text" 
                placeholder={`搜尋${searchOptions.find(o => o.value === searchField)?.label}...`} 
                style={{ width: '100%', padding: '10px 10px 10px 40px', borderRadius: '10px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', outline: 'none', fontSize: '0.9rem', boxSizing: 'border-box' }}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--input-border)', outline: 'none', fontSize: '0.9rem', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', cursor: 'pointer', minWidth: '130px' }}
            >
              <option value="ALL">全部狀態</option>
              <option value="PENDING">已建立 (待出貨)</option>
              <option value="SHIPPED">已出貨</option>
              <option value="RETURNED">已歸還</option>
            </select>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '10px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)' }}>
              <Calendar size={18} color="var(--text-subtle)" />
              <input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{ border: 'none', outline: 'none', fontSize: '0.9rem', color: 'var(--text-main)', background: 'transparent' }} 
              />
              <span style={{ color: 'var(--text-subtle)' }}>-</span>
              <input 
                type="date" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{ border: 'none', outline: 'none', fontSize: '0.9rem', color: 'var(--text-main)', background: 'transparent' }} 
              />
            </div>
          </div>
        </div>

        <div style={{ padding: '24px' }}>
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '16px', backgroundColor: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '8px', marginBottom: '20px' }}>
              <AlertCircle size={20} />
              <span>{error}</span>
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border-color)', backgroundColor: 'var(--table-header-bg)' }}>
                <th style={{ padding: '14px 12px', fontSize: '0.95rem', color: 'var(--table-header-text)', fontWeight: 800 }}>D/N 單號</th>
                <th style={{ padding: '14px 12px', fontSize: '0.95rem', color: 'var(--table-header-text)', fontWeight: 800 }}>出貨日期</th>
                <th style={{ padding: '14px 12px', fontSize: '0.95rem', color: 'var(--table-header-text)', fontWeight: 800 }}>客戶/對象</th>
                <th style={{ padding: '14px 12px', fontSize: '0.95rem', color: 'var(--table-header-text)', fontWeight: 800 }}>項目數</th>
                <th style={{ padding: '14px 12px', fontSize: '0.95rem', color: 'var(--table-header-text)', fontWeight: 800 }}>建立者</th>
                <th style={{ padding: '14px 12px', fontSize: '0.95rem', color: 'var(--table-header-text)', fontWeight: 800 }}>狀態</th>
                <th style={{ padding: '14px 12px', fontSize: '0.95rem', color: 'var(--table-header-text)', fontWeight: 800 }}>簽收單據</th>
                <th style={{ padding: '14px 12px', fontSize: '0.95rem', color: 'var(--table-header-text)', fontWeight: 800 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>讀取中...</td></tr>
              ) : currentRecords.length === 0 ? (
                <tr><td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>目前尚無出貨單資料</td></tr>
              ) : currentRecords.map(dn => (
                <tr key={dn.id} className="row-hover" style={{ borderBottom: '1px solid var(--table-border)', color: 'var(--text-main)' }}>
                  <td style={{ padding: '12px', fontWeight: 700, color: 'var(--text-main)' }}>
                    {dn.request_no}
                    {dn.request_type === 'LEND' && (
                      <span style={{ marginLeft: '8px', fontSize: '0.75rem', backgroundColor: '#eab308', color: 'white', padding: '2px 6px', borderRadius: '4px', verticalAlign: 'middle' }}>
                        借用單
                      </span>
                    )}
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
                  <td style={{ padding: '12px' }}>
                    <span style={{ fontWeight: 700, color: 'var(--primary-color)' }}>{dn.item_count}</span> 項
                  </td>
                  <td style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>{dn.creator_name || '系統'}</td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ 
                      padding: '4px 10px', 
                      borderRadius: '12px', 
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      backgroundColor: dn.status === 'SHIPPED' ? 'rgba(34, 197, 94, 0.15)' : (dn.status === 'RETURNED' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(249, 115, 22, 0.15)'),
                      color: dn.status === 'SHIPPED' ? '#22c55e' : (dn.status === 'RETURNED' ? '#3b82f6' : '#f97316')
                    }}>
                      {dn.status === 'PENDING' ? '已建立' : (dn.status === 'SHIPPED' ? '已出貨' : (dn.status === 'RETURNED' ? '已歸還' : dn.status))}
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
                      {dn.status === 'PENDING' && (
                        <button 
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', padding: 0, backgroundColor: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '6px', cursor: 'pointer', flexShrink: 0 }}
                          title="刪除單據"
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
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '16px', gap: '12px', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface-subtle)' }}>
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

      {/* 明細彈窗 */}
      {isModalOpen && selectedDN && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content dn-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={18} color="var(--primary-color)" />
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-main)' }}>出貨單明細</h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{selectedDN.request_no}</span>
                </div>
              </div>
              <button className="close-btn" onClick={() => setIsModalOpen(false)}>&times;</button>
            </div>
            
            <div className="modal-body" style={{ padding: '8px 20px' }}>
              <div className="dn-summary" style={{ display: 'flex', justifyContent: 'space-between', gap: '20px', marginBottom: '12px', padding: '10px 16px', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="summary-label" style={{ margin: 0 }}>客戶對象:</span>
                  <span className="summary-value" style={{ fontSize: '0.85rem' }}>
                    {selectedDN.customer} 
                    {selectedDN.contact_info && <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: '8px' }}>({selectedDN.contact_info})</span>}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="summary-label" style={{ margin: 0 }}>出貨日期:</span>
                  <span className="summary-value" style={{ fontSize: '0.85rem' }}>{new Date(selectedDN.shipping_date).toLocaleDateString()}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="summary-label" style={{ margin: 0 }}>出貨地點:</span>
                  <span className="summary-value" style={{ fontSize: '0.85rem' }}>{selectedDN.location || '-'}</span>
                </div>
              </div>

              {/* 項目清單 */}
              <div className="dn-items-list" style={{ marginBottom: '12px' }}>
                <h4 style={{ marginBottom: '8px', fontSize: '0.85rem', color: 'var(--text-main)', fontWeight: 800 }}>項目清單 ({dnItems.length})</h4>
                <div className="dn-items-list-container" style={{ maxHeight: '320px', overflowY: 'auto' }}>
                  <table className="dn-items-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead style={{ position: 'sticky', top: 0, backgroundColor: 'var(--table-header-bg)', zIndex: 10 }}>
                      <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>
                        <th style={{ padding: '8px 12px', fontSize: '0.75rem', color: 'var(--table-header-text)' }}>類型</th>
                        <th style={{ padding: '8px 12px', fontSize: '0.75rem', color: 'var(--table-header-text)' }}>項目詳情</th>
                        <th style={{ padding: '8px 12px', fontSize: '0.75rem', color: 'var(--table-header-text)' }}>序號 (S/N)</th>
                        <th style={{ padding: '8px 12px', fontSize: '0.75rem', color: 'var(--table-header-text)', textAlign: 'center' }}>數量</th>
                        <th style={{ padding: '8px 12px', fontSize: '0.75rem', color: 'var(--table-header-text)' }}>發送位置</th>
                      </tr>
                    </thead>
                    <tbody>
                      {isDetailLoading ? (
                        <tr><td colSpan="5" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>讀取中...</td></tr>
                      ) : dnItems.map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--table-border)' }}>
                          <td style={{ padding: '6px 12px' }}>
                            <span className="type-badge-mini">{item.type}</span>
                          </td>
                          <td style={{ padding: '6px 12px' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-main)' }}>{item.brand} {item.model}</div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{item.specification}</div>
                          </td>
                          <td style={{ padding: '6px 12px' }}>
                            {item.sn && (
                              <code style={{ fontSize: '0.75rem', backgroundColor: 'var(--bg-surface-subtle)', padding: '1px 4px', borderRadius: '3px', color: 'var(--text-main)', border: '1px solid var(--border-color)' }}>
                                {item.sn}
                              </code>
                            )}
                          </td>
                          <td style={{ padding: '6px 12px', textAlign: 'center' }}>
                            <span style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--text-main)' }}>{item.quantity}</span>
                          </td>
                          <td style={{ padding: '6px 12px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {item.location || '-'}
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
                      download={selectedDN.signed_doc_name || '出貨簽收單'}
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

            <div className="modal-footer" style={{ padding: '12px 20px', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface-subtle)', display: 'flex', justifyContent: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
              {selectedDN.request_type === 'LEND' && (
                <button 
                  onClick={() => setPrintModal({ show: true, dn: selectedDN, items: dnItems })}
                  style={{ padding: '8px 18px', borderRadius: '50px', border: 'none', backgroundColor: '#2563eb', color: 'white', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)' }}
                >
                  <Printer size={16} /> 🖨️ 產生借貨申請單 (PDF)
                </button>
              )}
              <button 
                onClick={() => setDeliveryReceiptModal({ show: true, dn: selectedDN, items: dnItems })}
                style={{ padding: '8px 18px', borderRadius: '50px', border: 'none', backgroundColor: '#059669', color: 'white', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 8px rgba(5, 150, 105, 0.3)' }}
              >
                <Printer size={16} /> 🖨️ 產生交貨簽收單 (PDF)
              </button>
              {selectedDN.status === 'PENDING' && (
                <button 
                  className="btn-primary" 
                  onClick={handleConfirmDelivery}
                  disabled={isConfirming}
                  style={{ padding: '8px 24px', opacity: isConfirming ? 0.7 : 1 }}
                >
                  {isConfirming ? '處理中...' : '確認出貨'}
                </button>
              )}
            </div>
          </div>
        </div>
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

      {/* 交貨簽收單列印/預覽 Modal */}
      {deliveryReceiptModal.show && deliveryReceiptModal.dn && (
        <DeliveryReceiptPrintModal
          isOpen={deliveryReceiptModal.show}
          onClose={() => setDeliveryReceiptModal({ show: false, dn: null, items: [] })}
          dnData={deliveryReceiptModal.dn}
          items={deliveryReceiptModal.items}
        />
      )}

      {/* 新增出貨單 Modal */}
      <OutboundRegistrationModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={fetchRecords}
      />

      {/* 獨立簽收單管理 Modal */}
      {docModal.show && docModal.dn && (
        <div className="modal-overlay" onClick={() => setDocModal({ show: false, dn: null })} style={{ zIndex: 9999 }}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '450px', padding: '24px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '12px', color: 'var(--text-main)' }}>
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
                    download={docModal.dn.signed_doc_name || '出貨簽收單'}
                    style={{ flex: 1, padding: '10px', borderRadius: '8px', backgroundColor: '#2563eb', color: '#fff', textAlign: 'center', textDecoration: 'none', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    <ExternalLink size={16} /> 開啟 / 下載查驗
                  </a>
                  <button
                    onClick={() => tableFileInputRef.current?.click()}
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
                onClick={() => tableFileInputRef.current?.click()}
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
                  <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-main)' }}>點此上傳客戶已簽收的出貨單</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>支援 PNG、JPG、PDF 格式檔案</div>
                </div>
              </div>
            )}

            <input
              type="file"
              ref={tableFileInputRef}
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

      <style>{`
        .row-hover:hover { background-color: var(--table-row-hover, rgba(59, 130, 246, 0.05)); }
        .spinner { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        
        .btn-action-view, .btn-action-delete {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          border: none;
          cursor: pointer;
        }

        .btn-action-view {
          background-color: var(--primary-bg);
          color: var(--primary-color);
          border: 1px solid rgba(59, 130, 246, 0.2);
        }

        .btn-action-view:hover {
          background-color: var(--primary-color);
          color: white;
          transform: translateY(-2px) scale(1.05);
          box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.3);
        }

        .btn-action-delete {
          background-color: rgba(239, 68, 68, 0.12);
          color: #ef4444;
          border: 1px solid rgba(239, 68, 68, 0.25);
        }

        .btn-action-delete:hover {
          background-color: #ef4444;
          color: white;
          transform: translateY(-2px) scale(1.05);
          box-shadow: 0 4px 6px -1px rgba(239, 68, 68, 0.3);
        }

        .btn-primary, .btn-secondary {
          border-radius: 50px !important;
          padding-left: 20px !important;
          padding-right: 20px !important;
          transition: all 0.3s ease;
        }

        .dn-modal { 
          width: 60vw; 
          max-width: 95vw; 
          background-color: var(--bg-surface);
          border-radius: 12px;
          box-shadow: var(--modal-shadow);
          border: 1px solid var(--border-color);
          overflow: hidden;
          position: relative;
          animation: modalFadeIn 0.3s ease-out;
          color: var(--text-main);
        }

        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: var(--bg-modal-overlay);
          backdrop-filter: blur(4px);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 9999;
          animation: overlayFadeIn 0.2s ease-out;
        }

        @keyframes modalFadeIn {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }

        @keyframes overlayFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .dn-summary {
          border-left: 4px solid var(--primary-color);
          background: var(--bg-surface-subtle);
          box-shadow: inset 0 0 0 1px var(--border-color);
        }

        .dn-items-table tr:nth-child(even) {
          background-color: var(--bg-surface-subtle);
        }

        .dn-items-table tr:hover {
          background-color: var(--table-row-hover);
        }
        
        .summary-label { 
          font-size: 0.7rem; 
          color: var(--text-muted); 
          font-weight: 800; 
          text-transform: uppercase; 
          letter-spacing: 0.025em;
          margin-bottom: 2px; 
        }

        .summary-value { 
          font-weight: 700; 
          color: var(--text-main); 
        }
        
        .type-badge-mini {
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 0.65rem;
          font-weight: 800;
          background-color: var(--bg-surface-subtle);
          color: var(--text-main);
          border: 1px solid var(--border-color);
          display: inline-block;
          white-space: nowrap;
        }

        .dn-items-list-container {
          border: 1px solid var(--border-color);
          border-radius: 8px;
          overflow: hidden;
          background-color: var(--bg-surface);
        }

        .close-btn {
          position: absolute;
          top: 12px;
          right: 16px;
          background: var(--bg-surface-subtle);
          border: 1px solid var(--border-color);
          color: var(--text-muted);
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 1.2rem;
          transition: all 0.2s;
          padding-bottom: 2px;
          z-index: 20;
        }

        .close-btn:hover {
          background-color: #ef4444;
          color: white;
          border-color: #ef4444;
          transform: rotate(90deg);
        }
      `}</style>
    </div>
  );
};

export default DNList;
