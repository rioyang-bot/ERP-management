import React, { useState, useEffect, useCallback } from 'react';
import { UserPlus, Trash2, Edit2, Search, X, Save, UserCheck, Truck, Users } from 'lucide-react';
import { logCreate, logUpdate, logDelete, logStatusChange } from '../utils/auditLogger';

const Partners = () => {
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({ type: 'CUSTOMER', name: '', contact: '', phone: '' });
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Edit State
  const [editingItem, setEditingItem] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const fetchPartners = useCallback(async () => {
    setLoading(true);
    // 嘗試建立欄位 (如果已存在則會報錯但不影響後續)
    try { await window.electronAPI.namedQuery('migratePartnersActive'); } catch(e) {}
    // 確保現有資料的 is_active 不是 NULL
    try { await window.electronAPI.namedQuery('initPartnersActive'); } catch(e) {}
    
    const res = await window.electronAPI.namedQuery('fetchPartners');
    if (res.success) setPartners(res.rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchPartners();
  }, [fetchPartners]);

  // 安全過濾器：移除可能導致 XSS 或 SQLi 的字元片段
  const sanitizeValue = (val) => {
    if (typeof val !== 'string') return val;
    return val
      .trim()
      .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "") // 移除 Script
      .replace(/[<>'"\\;\%]/g, "") // 移除特殊字元
      .substring(0, 200); // 限制長度防止惡意攻擊
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value }); // UI 即時顯示不變，送交前才過濾
  };

  const handleAdd = async () => {
    const cleanName = sanitizeValue(formData.name);
    if (!cleanName) return alert('請填寫有效的夥伴名稱');
    
    setLoading(true);
    const res = await window.electronAPI.namedQuery(
      'insertPartner',
      [
        formData.type, 
        cleanName, 
        sanitizeValue(formData.contact), 
        sanitizeValue(formData.phone)
      ]
    );

    if (res.success) {
      logCreate('PARTNER', cleanName, formData.type === 'CUSTOMER' ? '客戶' : '供應商', `新增夥伴 [${cleanName}] 類別: ${formData.type === 'CUSTOMER' ? '客戶' : '供應商'}`, { type: formData.type, name: cleanName, contact: formData.contact, phone: formData.phone });
      await fetchPartners();
      setFormData({ type: 'CUSTOMER', name: '', contact: '', phone: '' });
    } else {
      alert('系統訊息：資料庫寫入失敗，請檢查資料格式或聯絡系統管理員。');
    }
    setLoading(false);
  };

  const handleToggleActive = async (id, currentStatus) => {
    const res = await window.electronAPI.namedQuery('updatePartnerActive', [!currentStatus, id]);
    if (res.success) {
      const p = partners.find(item => item.id === id);
      logStatusChange('PARTNER', id, p?.name || '夥伴', currentStatus ? '啟用' : '停用', !currentStatus ? '啟用' : '停用', `${!currentStatus ? '啟用' : '停用'}夥伴 [${p?.name || id}]`, { id, name: p?.name, newStatus: !currentStatus });
      await fetchPartners();
    } else {
      alert('系統訊息：狀態更新失敗。');
    }
  };

  const handleUpdate = async () => {
    const cleanName = sanitizeValue(editingItem.name);
    if (!cleanName) return alert('夥伴名稱不可為空且不能包含非法字元');
    
    const res = await window.electronAPI.namedQuery(
      'updatePartner',
      [
        editingItem.type, 
        cleanName, 
        sanitizeValue(editingItem.contact), 
        sanitizeValue(editingItem.phone), 
        editingItem.id
      ]
    );
    if (res.success) {
      logUpdate('PARTNER', editingItem.id, cleanName, `編輯夥伴資料 [${cleanName}]`, {
        type: editingItem.type,
        name: cleanName,
        contact: editingItem.contact,
        phone: editingItem.phone
      });
      setShowEditModal(false);
      await fetchPartners();
    } else {
      alert('系統訊息：更新作業失敗。');
    }
  };

  const handleDelete = async (id, name) => {
    if (window.confirm(`確定要徹底刪除夥伴 [${name}] 嗎？`)) {
      const res = await window.electronAPI.namedQuery('deletePartner', [id]);
      if (res.success) {
        logDelete('PARTNER', id, name, `刪除夥伴 [${name}]`, { id, name });
        await fetchPartners();
      } else {
        // 安全原則：不揭露資料庫關聯錯誤細節，但引導使用者解決問題
        alert(`系統訊息：無法刪除此對象，原因可能是該夥伴已在系統中擁有交易紀錄。\n\n建議您改為執行「停用」功能。`);
        await handleToggleActive(id, true);
      }
    }
  };

  const filteredPartners = partners.filter(p => {
    const s = searchTerm.toLowerCase();
    return (p.name || '').toLowerCase().includes(s) || 
           (p.contact || '').toLowerCase().includes(s) || 
           (p.phone || '').toLowerCase().includes(s);
  });

  const totalPages = Math.ceil(filteredPartners.length / itemsPerPage);
  const paginatedPartners = filteredPartners.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const cardStyle = { backgroundColor: 'var(--bg-surface)', borderRadius: '16px', padding: '24px', boxShadow: 'var(--card-shadow)', border: '1px solid var(--border-color)', color: 'var(--text-main)' };
  const thStyle = { textAlign: 'left', padding: '14px', borderBottom: '2px solid var(--border-color)', color: 'var(--table-header-text)', fontSize: '12px', fontWeight: '700', backgroundColor: 'var(--table-header-bg)' };
  const tdStyle = { padding: '14px', fontSize: '13px', color: 'var(--text-main)', borderBottom: '1px solid var(--table-border)' };

  return (
    <div style={{ padding: '24px', backgroundColor: 'var(--bg-app)', minHeight: '100vh' }}>
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
          <h1 style={{ fontSize: '24px', fontWeight: '900', margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-main)' }}>
            <Users size={26} color="var(--primary-color)" /> 客戶/廠商管理 (Partners)
          </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px', marginBottom: 0 }}>管理合作夥伴的基本資料，以便在進出貨時快速帶入功能。</p>
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
            <input 
              type="text" 
              placeholder="搜尋夥伴名稱、聯絡人..." 
              value={searchTerm}
              onChange={(e) => {setSearchTerm(e.target.value); setCurrentPage(1);}}
              style={{ padding: '10px 12px 10px 42px', borderRadius: '30px', border: '1.5px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', width: '300px', outline: 'none' }}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '32px' }}>
          {/* 左側：新增表單 */}
          <div style={{ backgroundColor: 'var(--bg-surface-subtle)', padding: '24px', borderRadius: '16px', border: '1px solid var(--border-color)', alignSelf: 'start' }}>
            <h3 style={{ marginBottom: '20px', fontSize: '16px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)' }}>
              <UserPlus size={18} color="var(--primary-color)" /> 新增夥伴
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={labelStyle}>夥伴類型</label>
                <select name="type" value={formData.type} onChange={handleChange} style={inputStyle}>
                  <option value="CUSTOMER">客戶 (Customer)</option>
                  <option value="SUPPLIER">供應商 (Supplier)</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>名稱 *</label>
                <input type="text" name="name" value={formData.name} onChange={handleChange} placeholder="公司或人員名稱" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>聯絡人</label>
                <input type="text" name="contact" value={formData.contact} onChange={handleChange} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>聯絡電話</label>
                <input type="text" name="phone" value={formData.phone} onChange={handleChange} style={inputStyle} />
              </div>
              <button 
                onClick={handleAdd}
                style={{ marginTop: '8px', padding: '14px', backgroundColor: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)' }}
              >
                儲存至資料庫
              </button>
            </div>
          </div>

          {/* 右側：清單 */}
          <div>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '100px', color: 'var(--text-muted)' }}>載入中...</div>
            ) : (
              <>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>夥伴類型</th>
                      <th style={thStyle}>名稱 (Name)</th>
                      <th style={thStyle}>聯絡資訊</th>
                      <th style={{ ...thStyle, textAlign: 'center' }}>狀態</th>
                      <th style={{ ...thStyle, textAlign: 'center', width: '100px' }}>管理</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedPartners.map(p => (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--table-border)', opacity: p.is_active ? 1 : 0.5, transition: 'all 0.3s' }} className="row-hover">
                        <td style={tdStyle}>
                          <span style={{ 
                            padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '4px',
                            backgroundColor: p.type === 'CUSTOMER' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(249, 115, 22, 0.15)',
                            color: p.type === 'CUSTOMER' ? '#60a5fa' : '#fb923c',
                            border: p.type === 'CUSTOMER' ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid rgba(249, 115, 22, 0.3)'
                          }}>
                            {p.type === 'CUSTOMER' ? <UserCheck size={12} /> : <Truck size={12} />}
                            {p.type === 'CUSTOMER' ? '客戶' : '供應商'}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, fontWeight: '700', color: 'var(--text-main)' }}>{p.name}</td>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: '600', color: 'var(--text-main)' }}>{p.contact || '--'}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{p.phone || '--'}</div>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <button 
                            onClick={() => handleToggleActive(p.id, p.is_active)}
                            style={{ 
                              padding: '4px 12px', borderRadius: '20px', cursor: 'pointer', fontSize: '11px', fontWeight: '800',
                              backgroundColor: p.is_active ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                              color: p.is_active ? '#10b981' : '#ef4444',
                              border: `1px solid ${p.is_active ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
                            }}
                          >
                            {p.is_active ? '使用中' : '已停用'}
                          </button>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                            <button onClick={() => { setEditingItem({ ...p }); setShowEditModal(true); }} style={actionButtonStyle} title="修改"><Edit2 size={16} /></button>
                            <button onClick={() => handleDelete(p.id, p.name)} style={{ ...actionButtonStyle, color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }} title="刪除"><Trash2 size={16} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {totalPages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '24px' }}>
                    <button disabled={currentPage === 1} onClick={() => setCurrentPage(prev => prev - 1)} style={pageButtonStyle}>上一頁</button>
                    <span style={{ display: 'flex', alignItems: 'center', fontWeight: '800', color: 'var(--text-muted)', fontSize: '13px' }}>{currentPage} / {totalPages}</span>
                    <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(prev => prev + 1)} style={pageButtonStyle}>下一頁</button>
                  </div>
                )}
                {paginatedPartners.length === 0 && <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>尚無符合條件的夥伴</div>}
              </>
            )}
          </div>
        </div>
      </div>

      {/* 編輯 Modal */}
      {showEditModal && editingItem && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'var(--bg-modal-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-main)', width: '450px', padding: '32px', borderRadius: '16px', boxShadow: 'var(--modal-shadow)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '900', color: 'var(--text-main)', margin: 0 }}>修改夥伴資訊</h2>
              <X size={24} style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setShowEditModal(false)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={labelStyle}>夥伴類型</label>
                <select value={editingItem.type} onChange={(e) => setEditingItem({...editingItem, type: e.target.value})} style={inputStyle}>
                  <option value="CUSTOMER">客戶 (Customer)</option>
                  <option value="SUPPLIER">供應商 (Supplier)</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>名稱 *</label>
                <input type="text" value={editingItem.name} onChange={(e) => setEditingItem({...editingItem, name: e.target.value})} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>聯絡人</label>
                <input type="text" value={editingItem.contact || ''} onChange={(e) => setEditingItem({...editingItem, contact: e.target.value})} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>聯絡電話</label>
                <input type="text" value={editingItem.phone || ''} onChange={(e) => setEditingItem({...editingItem, phone: e.target.value})} style={inputStyle} />
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button onClick={handleUpdate} style={{ flex: 1, padding: '14px', backgroundColor: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <Save size={18} /> 更新資料
                </button>
                <button onClick={() => setShowEditModal(false)} style={{ padding: '14px 24px', backgroundColor: 'var(--bg-surface-subtle)', border: '1px solid var(--border-color)', borderRadius: '10px', fontWeight: '600', color: 'var(--text-main)', cursor: 'pointer' }}>取消</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .row-hover:hover { background-color: var(--table-row-hover); }
      `}</style>
    </div>
  );
};

const labelStyle = { display: 'block', fontWeight: '800', fontSize: '13px', marginBottom: '6px', color: 'var(--text-muted)' };
const inputStyle = { width: '100%', padding: '12px', borderRadius: '8px', border: '1.5px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', outline: 'none', fontSize: '14px', boxSizing: 'border-box' };
const actionButtonStyle = { backgroundColor: 'var(--bg-surface-subtle)', border: '1px solid var(--border-color)', padding: '8px', borderRadius: '8px', color: 'var(--primary-color)', cursor: 'pointer', display: 'flex' };
const pageButtonStyle = { padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-main)', cursor: 'pointer', fontWeight: '700', fontSize: '13px' };

export default Partners;
