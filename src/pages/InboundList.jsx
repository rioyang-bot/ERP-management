import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDownToLine, Search, Filter, Eye, RefreshCw, AlertCircle, Trash2, Calendar, Hash, FileText, Plus, Edit2, Save, X } from 'lucide-react';

const InboundList = ({ isSplitMode = false }) => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchField, setSearchField] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const searchOptions = [
    { value: 'all', label: '全部欄位' },
    { value: 'order_no', label: '進貨單號' },
    { value: 'partner', label: '供應商' },
    { value: 'invoice_no', label: '發票號碼' }
  ];

  const [inboundRecords, setInboundRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderItems, setOrderItems] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [partners, setPartners] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({ partner_id: '', invoice_no: '', attachments: [] });
  const [previewFile, setPreviewFile] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, searchField, startDate, endDate]);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, partnersRes] = await Promise.all([
        window.electronAPI.namedQuery('fetchInboundList'),
        window.electronAPI.namedQuery('fetchSuppliers')
      ]);
      
      if (partnersRes.success) {
        setPartners(partnersRes.rows);
      }
      
      if (res.success) {
        setInboundRecords(res.rows || []);
      } else {
        setError('無法讀取進貨清單：' + (res.error || '未知錯誤'));
      }
    } catch (err) {
      console.error('Fetch inbound list error:', err);
      setError('伺服器連線異常，請檢查是否正常啟動。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const handleViewDetails = async (order, editMode = false) => {
    setSelectedOrder(order);
    setIsModalOpen(true);
    setIsEditing(editMode);
    
    let parsedAttachments = [];
    try {
       parsedAttachments = typeof order.attachments === 'string' ? JSON.parse(order.attachments || '[]') : (order.attachments || []);
    } catch(e) {}
    
    setEditData({
      partner_id: order.partner_id || '',
      invoice_no: order.invoice_no || '',
      attachments: parsedAttachments
    });
    setIsDetailLoading(true);
    try {
      const res = await window.electronAPI.namedQuery('fetchInboundItems', [order.id]);
      if (res.success) {
        setOrderItems(res.rows);
      } else {
        alert('無法讀取進貨明細：' + res.error);
      }
    } catch (err) {
      console.error('Fetch details error:', err);
      alert('讀取進貨明細失敗');
    } finally {
      setIsDetailLoading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    try {
      const newAttachments = [...editData.attachments];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const buffer = await file.arrayBuffer();
        const res = await window.electronAPI.saveFile(file.name, buffer);
        if (res.success) {
          newAttachments.push({ originalName: file.name, fileName: res.fileName, type: file.type });
        } else {
          alert('上傳失敗: ' + res.error);
        }
      }
      setEditData(prev => ({ ...prev, attachments: newAttachments }));
    } catch (err) {
      console.error(err);
      alert('上傳發生錯誤');
    } finally {
      e.target.value = '';
    }
  };

  const removeAttachment = (index) => {
    const newAtt = [...editData.attachments];
    newAtt.splice(index, 1);
    setEditData(prev => ({ ...prev, attachments: newAtt }));
  };

  const getMediaSrc = (fileName) => {
    const rawUrl = `erp-media:///${encodeURIComponent(fileName)}`;
    return window.getMediaUrl ? window.getMediaUrl(rawUrl) : rawUrl;
  };

  const handleSaveEdit = async () => {
    if (!selectedOrder) return;
    setIsSaving(true);
    try {
      const res = await window.electronAPI.namedQuery('updateInboundOrderHeader', [
        editData.partner_id || null, 
        editData.invoice_no || null, 
        JSON.stringify(editData.attachments), 
        selectedOrder.id
      ]);
      if (res.success) {
        alert('儲存成功！');
        setIsEditing(false);
        fetchRecords();
        setSelectedOrder(prev => ({
           ...prev, 
           partner_id: editData.partner_id,
           invoice_no: editData.invoice_no,
           attachments: JSON.stringify(editData.attachments),
           partner_name: partners.find(p => p.id.toString() === editData.partner_id.toString())?.name || prev.partner_name
        }));
      } else {
        alert('儲存失敗：' + res.error);
      }
    } catch(err) {
      alert('發生錯誤');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredRecords = inboundRecords.filter(order => {
    const search = searchTerm.toLowerCase();
    if (!search) return true;

    const orderNo = (order.order_no || '').toLowerCase();
    const partner = (order.partner_name || '').toLowerCase();
    const invoice = (order.invoice_no || '').toLowerCase();

    let matchSearch = true;
    if (searchField === 'all') {
      matchSearch = orderNo.includes(search) || partner.includes(search) || invoice.includes(search);
    } else if (searchField === 'order_no') {
      matchSearch = orderNo.includes(search);
    } else if (searchField === 'partner') {
      matchSearch = partner.includes(search);
    } else if (searchField === 'invoice_no') {
      matchSearch = invoice.includes(search);
    }

    if (!matchSearch) return false;

    if (startDate || endDate) {
      const orderDate = new Date(order.created_at);
      orderDate.setHours(0, 0, 0, 0);
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        if (orderDate < start) return false;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(0, 0, 0, 0);
        if (orderDate > end) return false;
      }
    }
    return true;
  });

  const sortedAndFiltered = [...filteredRecords]

  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.ceil(sortedAndFiltered.length / ITEMS_PER_PAGE) || 1;
  const currentRecords = sortedAndFiltered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const pendingCount = inboundRecords.filter(order => order.status !== 'COMPLETED').length;

  return (
    <div className="inbound-list-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: '900', margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-main)' }}>
              <ArrowDownToLine size={26} color="#10b981" />
              進貨單列表(Stock in List)
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '13.5px', marginTop: '6px', fontWeight: 500, letterSpacing: '0.3px' }}>
              追查所有入庫單據明細、核銷與對帳關聯。
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
           <div style={{ backgroundColor: 'var(--bg-surface)', padding: '12px 24px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', gap: '24px', boxShadow: 'var(--card-shadow)' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>待處理進貨單</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#10b981' }}>
                  {pendingCount} <span style={{ fontSize: '0.8rem', fontWeight: 400, opacity: 0.8 }}>單</span>
                </div>
              </div>
           </div>
          {!isSplitMode && (
            <button
              onClick={() => navigate('/inbound-split')}
              style={{
                padding: '8px 16px',
                backgroundColor: '#10b981',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
              }}
            >
              <Plus size={18} /> 進貨入庫 (S/I Reg)
            </button>
          )}
        </div>
      </div>

      <div style={{ backgroundColor: 'var(--bg-surface)', borderRadius: '16px', boxShadow: 'var(--card-shadow)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '16px', backgroundColor: '#fff5f5', color: '#d32f2f', borderRadius: '8px', marginBottom: '20px' }}>
              <AlertCircle size={20} />
              <span>{error}</span>
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border-color)', backgroundColor: 'var(--table-header-bg)' }}>
                  <th style={{ padding: '14px 12px', fontSize: '0.95rem', color: 'var(--table-header-text)', fontWeight: 800 }}>進貨單號</th>
                  <th style={{ padding: '14px 12px', fontSize: '0.95rem', color: 'var(--table-header-text)', fontWeight: 800 }}>進貨建立時間</th>
                  <th style={{ padding: '14px 12px', fontSize: '0.95rem', color: 'var(--table-header-text)', fontWeight: 800 }}>供應商</th>
                  <th style={{ padding: '14px 12px', fontSize: '0.95rem', color: 'var(--table-header-text)', fontWeight: 800 }}>發票號碼</th>
                  <th style={{ padding: '14px 12px', fontSize: '0.95rem', color: 'var(--table-header-text)', fontWeight: 800 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="5" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>讀取中...</td></tr>
                ) : currentRecords.length === 0 ? (
                  <tr><td colSpan="5" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>目前尚無進貨單資料</td></tr>
                ) : currentRecords.map(order => (
                  <tr key={order.id} className="row-hover" style={{ borderBottom: '1px solid var(--table-border)', color: 'var(--text-main)' }}>
                    <td style={{ padding: '12px', fontWeight: 700, color: 'var(--text-main)' }}>{order.order_no}</td>
                    <td style={{ padding: '12px', color: 'var(--text-muted)' }}>{new Date(order.created_at).toLocaleString()}</td>
                    <td style={{ padding: '12px', color: order.partner_name ? 'var(--text-main)' : 'var(--text-subtle)', fontWeight: 600 }}>{order.partner_name || '無紀錄'}</td>
                    <td style={{ padding: '12px', color: order.invoice_no ? 'var(--text-main)' : 'var(--text-subtle)' }}>{order.invoice_no || '--'}</td>
                    <td style={{ padding: '12px' }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => handleViewDetails(order, false)}
                          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', backgroundColor: 'var(--primary-bg)', color: 'var(--primary-color)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
                        >
                          <Eye size={16} /> 檢視
                        </button>
                        <button
                          onClick={() => handleViewDetails(order, true)}
                          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
                        >
                          <Edit2 size={16} /> 編輯
                        </button>
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

      {isModalOpen && selectedOrder && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'var(--bg-modal-overlay)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '16px', width: '60vw', maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: 'var(--modal-shadow)' }}>
            <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ margin: '0 0 8px 0', fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <FileText size={24} color="#059669" />
                  進貨明細單：{selectedOrder.order_no}
                  {isEditing && <span style={{fontSize: '0.9rem', color: '#16a34a', backgroundColor: 'rgba(22, 163, 74, 0.15)', padding: '4px 8px', borderRadius: '6px'}}>編輯模式</span>}
                </h2>
                <div style={{ display: 'flex', gap: '20px', color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 500 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={14} /> 建立時間：{new Date(selectedOrder.created_at).toLocaleString()}</span>
                  {!isEditing && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><FileText size={14} /> 供應商：{selectedOrder.partner_name || '無'}</span>}
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{ padding: '8px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                ✕ 關閉
              </button>
            </div>

            <div style={{ padding: '32px', overflowY: 'auto' }}>
              {isEditing ? (
                 <div style={{ marginBottom: '24px', display: 'flex', gap: '16px', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', gap: '16px' }}>
                       <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, color: 'var(--text-muted)' }}>發票號碼</label>
                          <input type="text" value={editData.invoice_no} onChange={e => setEditData({...editData, invoice_no: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', outline: 'none' }} />
                       </div>
                       <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, color: 'var(--text-muted)' }}>供應商</label>
                          <select value={editData.partner_id} onChange={e => setEditData({...editData, partner_id: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', outline: 'none' }}>
                            <option value="">請選擇供應商</option>
                            {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                       </div>
                    </div>
                    <div>
                       <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, color: 'var(--text-muted)' }}>附件管理</label>
                       <div style={{ padding: '16px', border: '2px dashed var(--border-color)', borderRadius: '12px', backgroundColor: 'var(--bg-surface-subtle)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                         <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                           {editData.attachments.map((att, index) => (
                             <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px', boxShadow: 'var(--card-shadow)' }}>
                               {att.type?.startsWith('image/') ? (
                                  <img src={getMediaSrc(att.fileName)} alt={att.originalName} style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer' }} onClick={() => setPreviewFile(att)} />
                               ) : (
                                  <div style={{ width: '40px', height: '40px', backgroundColor: 'var(--bg-surface-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', cursor: 'pointer' }} onClick={() => setPreviewFile(att)}>
                                     <FileText size={20} color="var(--text-muted)" />
                                  </div>
                               )}
                               <div style={{ flex: 1, minWidth: 0 }}>
                                 <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '150px' }} title={att.originalName}>{att.originalName}</div>
                               </div>
                               <button onClick={() => removeAttachment(index)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}>
                                 <Trash2 size={16} />
                               </button>
                             </div>
                           ))}
                         </div>
                         <div>
                           <label style={{ display: 'inline-block', padding: '8px 16px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer' }}>
                             + 新增附件
                             <input type="file" multiple style={{ display: 'none' }} onChange={handleFileUpload} />
                           </label>
                         </div>
                       </div>
                    </div>
                 </div>
              ) : (
                 <div style={{ marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '1.1rem', color: 'var(--text-main)', marginBottom: '12px' }}>附件清單</h3>
                    {(() => {
                        let atts = [];
                        try {
                           atts = typeof selectedOrder.attachments === 'string' ? JSON.parse(selectedOrder.attachments || '[]') : (selectedOrder.attachments || []);
                        } catch(e) {}
                        
                        if (atts.length === 0) {
                            return <div style={{ color: 'var(--text-subtle)' }}>無附件</div>;
                        }
                        return (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                              {atts.map((att, index) => (
                                 <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                                   {att.type?.startsWith('image/') ? (
                                      <img src={getMediaSrc(att.fileName)} alt={att.originalName} style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer' }} onClick={() => setPreviewFile(att)} />
                                   ) : (
                                      <div style={{ width: '40px', height: '40px', backgroundColor: 'var(--bg-surface-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', cursor: 'pointer' }} onClick={() => setPreviewFile(att)}>
                                         <FileText size={20} color="var(--text-muted)" />
                                      </div>
                                   )}
                                   <div style={{ flex: 1, minWidth: 0 }}>
                                     <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '150px' }} title={att.originalName}>{att.originalName}</div>
                                   </div>
                                 </div>
                              ))}
                            </div>
                        );
                    })()}
                 </div>
              )}

              <h3 style={{ fontSize: '1.1rem', color: 'var(--text-main)', marginBottom: '12px' }}>進貨項目 (無法修改數量)</h3>
              {isDetailLoading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>正在載入進貨明細資料...</div>
              ) : orderItems.length > 0 ? (
                <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--table-header-bg)', borderBottom: '2px solid var(--border-color)' }}>
                        <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--table-header-text)', fontSize: '0.9rem' }}>入庫品項</th>
                        <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--table-header-text)', fontSize: '0.9rem' }}>類別</th>
                        <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--table-header-text)', fontSize: '0.9rem' }}>來源採購單</th>
                        <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--table-header-text)', fontSize: '0.9rem' }}>硬體序號 (S/N)</th>
                        <th style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 700, color: 'var(--table-header-text)', fontSize: '0.9rem' }}>數量</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderItems.map((item, idx) => (
                        <tr key={item.id} style={{ borderBottom: idx === orderItems.length - 1 ? 'none' : '1px solid var(--table-border)' }}>
                          <td style={{ padding: '16px', verticalAlign: 'top' }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>{[item.brand, item.model, item.specification].filter(Boolean).join(' ') || item.specification || '未知項目'}</div>
                          </td>
                          <td style={{ padding: '16px', verticalAlign: 'top' }}>
                            <span style={{ padding: '4px 8px', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                              {item.category_name || '未分類'}
                            </span>
                          </td>
                          <td style={{ padding: '16px', verticalAlign: 'top', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                            {item.po_order_no || '無 (非採購入庫)'}
                          </td>
                          <td style={{ padding: '16px', verticalAlign: 'top' }}>
                            {item.sn ? (
                              <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#16a34a', backgroundColor: 'rgba(22, 163, 74, 0.15)', padding: '4px 8px', borderRadius: '6px' }}>{item.sn}</span>
                            ) : (
                              <span style={{ color: 'var(--text-subtle)', fontSize: '0.85rem' }}>-</span>
                            )}
                          </td>
                          <td style={{ padding: '16px', textAlign: 'center', verticalAlign: 'top', fontWeight: 800, color: 'var(--text-main)' }}>
                            {item.quantity}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '12px' }}>
                  此查詢單據無可顯示之有效明細或資料已被移除。
                </div>
              )}
            </div>

            <div style={{ padding: '20px 32px', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface-subtle)', display: 'flex', justifyContent: 'flex-end', gap: '12px', borderBottomLeftRadius: '16px', borderBottomRightRadius: '16px' }}>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{ padding: '10px 24px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, color: 'var(--text-main)' }}
              >
                關閉視窗
              </button>
              {isEditing && (
                 <button
                   onClick={handleSaveEdit}
                   disabled={isSaving}
                   style={{ padding: '10px 24px', backgroundColor: '#10b981', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}
                 >
                   <Save size={18} /> {isSaving ? '儲存中...' : '儲存變更'}
                 </button>
              )}
            </div>
          </div>
        </div>
      )}
      {previewFile && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0, 0, 0, 0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100 }} onClick={() => setPreviewFile(null)}>
          <div style={{ backgroundColor: '#fff', padding: '16px', borderRadius: '12px', maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0 }}>預覽附件：{previewFile.originalName}</h3>
              <button onClick={() => setPreviewFile(null)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer' }}>&times;</button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center' }}>
              {previewFile.type?.startsWith('image/') ? (
                <img src={getMediaSrc(previewFile.fileName)} alt={previewFile.originalName} style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }} />
              ) : previewFile.type === 'application/pdf' ? (
                <iframe src={getMediaSrc(previewFile.fileName)} style={{ width: '80vw', height: '70vh', border: 'none' }} title={previewFile.originalName} />
              ) : (
                <div style={{ padding: '40px', color: '#64748b' }}>此檔案類型不支援預覽，請下載後檢視。</div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .btn-refresh-vibrant {
          padding: 8px 16px;
          border-radius: 9999px;
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: white;
          font-weight: 700;
          font-size: 0.95rem;
          display: flex;
          align-items: center;
          gap: 8px;
          border: none;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
        }
        .btn-refresh-vibrant:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(16, 185, 129, 0.4);
        }
        .btn-refresh-vibrant:active {
          transform: translateY(1px);
        }
        .btn-refresh-vibrant:disabled {
          opacity: 0.7;
          cursor: not-allowed;
          transform: none;
        }
        .spin-animation {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
        .row-hover:hover {
          background-color: #f8fafc;
        }
      `}</style>
    </div>
  );
};

export default InboundList;
