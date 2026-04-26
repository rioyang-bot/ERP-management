import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Edit2, Trash2, ShieldAlert, X, Wrench, ShoppingBag, MoreHorizontal, AlertTriangle, CheckCircle, MapPin, User, Clock, Save } from 'lucide-react';

const AssetList = () => {
  const [items, setItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const [customers, setCustomers] = useState([]);
  const [activeMenuId, setActiveMenuId] = useState(null); 
  const brandFilter = searchParams.get('brand');
  
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const [editItem, setEditItem] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [brandFieldConfigs, setBrandFieldConfigs] = useState({});
  const [customFieldDefs, setCustomFieldDefs] = useState([]);

  const statusConfig = {
    ACTIVE: { label: '在庫', color: '#047857', bgColor: '#dcfce7', borderColor: '#bbf7d0' },
    REPAIRING: { label: '異常/維修中', color: '#fa8c16', bgColor: '#fff7e6', borderColor: '#ffd591' },
    PENDING_SCRAP: { label: '停用/待報廢', color: '#595959', bgColor: '#f5f5f5', borderColor: '#d9d9d9' },
    SCRAPPED: { label: '已報廢', color: '#f5222d', bgColor: '#fff1f0', borderColor: '#ffccc7' },
    SHIPPED: { label: '已出貨', color: '#1d4ed8', bgColor: '#dbeafe', borderColor: '#bfdbfe' }
  };

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    let res = brandFilter 
      ? await window.electronAPI.namedQuery('fetchAssetsListByBrand', [brandFilter])
      : await window.electronAPI.namedQuery('fetchAssetsList');
    
    if (res.success) setItems(res.rows);
    setLoading(false);
  }, [brandFilter]);

  const fetchCustomers = useCallback(async () => {
    const res = await window.electronAPI.namedQuery('fetchCustomers');
    if (res.success) setCustomers(res.rows.map(r => r.name));
  }, []);

  const fetchSettings = useCallback(async () => {
    const res = await window.electronAPI.namedQuery('getSystemSetting', ['brandFieldConfigs']);
    if (res.success && res.rows.length > 0) setBrandFieldConfigs(res.rows[0].value || {});
    const defsRes = await window.electronAPI.namedQuery('getSystemSetting', ['customFieldDefinitions']);
    if (defsRes.success && defsRes.rows.length > 0) setCustomFieldDefs(defsRes.rows[0].value || []);
  }, []);

  useEffect(() => {
    const initPage = async () => {
      setCurrentPage(1);
      await Promise.all([fetchAssets(), fetchCustomers(), fetchSettings()]);
    };
    initPage();
  }, [fetchAssets, fetchCustomers, fetchSettings]);

  const isFieldVisible = (brand, fieldId) => {
    if (!brand) return true;
    const config = brandFieldConfigs[brand] || {};
    return config[fieldId] !== undefined ? config[fieldId] : true;
  };

  const handleEditClick = (item) => {
    const f = { ...item };
    ['installed_date', 'customer_warranty_expire', 'system_date', 'warranty_expire'].forEach(k => {
      if (f[k]) {
        try { f[k] = new Date(f[k]).toISOString().split('T')[0]; } catch { f[k] = ''; }
      } else { f[k] = ''; }
    });
    setEditItem(f);
    setShowEditModal(true);
    setActiveMenuId(null);
  };

  const handleDelete = async (id, sn) => {
    if (!window.confirm(`確定要刪除設備 [${sn}] 嗎？`)) return;
    const res = await window.electronAPI.namedQuery('deleteAsset', [id]);
    if (res.success) { setActiveMenuId(null); fetchAssets(); }
  };

  const handleUpdateStatus = async (id, sn, newStatus, label) => {
    if (!window.confirm(`確定要變更為「${label}」嗎？`)) return;
    const res = await window.electronAPI.namedQuery('updateAssetStatus', [newStatus, id]);
    if (res.success) { setActiveMenuId(null); fetchAssets(); }
  };

  const handleUpdate = async () => {
    if (!editItem.specification) return alert('請填寫規格內容');
    await window.electronAPI.namedQuery('updateItemMasterSpecs', [editItem.specification, editItem.model, editItem.item_master_id]);
    const res = await window.electronAPI.namedQuery('updateAssetDetails', [
        editItem.sn, editItem.client, editItem.hostname, editItem.location, editItem.installed_date || null,
        editItem.customer_warranty_expire || null, editItem.system_date || null, editItem.warranty_expire || null,
        editItem.os, editItem.nic, editItem.custom_attributes || null, editItem.id
    ]);
    if (res.success) { setShowEditModal(false); fetchAssets(); }
  };

  const statusPriority = { 'REPAIRING': 1, 'ACTIVE': 2, 'SHIPPED': 3, 'PENDING_SCRAP': 4, 'SCRAPPED': 5 };

  const sortedItems = items
    .filter(item => {
      const s = searchTerm.toLowerCase();
      return (item.sn || '').toLowerCase().includes(s) || (item.specification || '').toLowerCase().includes(s) ||
             (item.hostname || '').toLowerCase().includes(s) || (item.brand || '').toLowerCase().includes(s) ||
             (item.model || '').toLowerCase().includes(s) || (item.client || '').toLowerCase().includes(s) ||
             (item.location || '').toLowerCase().includes(s);
    })
    .sort((a, b) => (statusPriority[a.status] || 99) - (statusPriority[b.status] || 99));

  const totalPages = Math.ceil(sortedItems.length / itemsPerPage);
  const paginatedItems = sortedItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const containerStyle = { padding: '24px', backgroundColor: '#f1f5f9', minHeight: '100vh' };
  const cardStyle = { backgroundColor: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' };
  const menuButtonStyle = { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '600', color: '#475569', borderRadius: '8px', textAlign: 'left' };
  const editLabelStyle = { display: 'block', fontWeight: 800, fontSize: '13px', marginBottom: '6px', color: '#475569' };
  const editInputStyle = { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '13px' };
  const navBtnStyle = { padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: 'white', cursor: 'pointer', fontWeight: '700' };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '900', color: '#1e293b' }}>
            {brandFilter ? `${brandFilter} - 設備清單` : '設備列表 (Device List)'}
          </h1>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <button onClick={() => setShowConfigModal(true)} style={{ padding: '10px 18px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', fontWeight: '700', color: '#445' }}>
               <Wrench size={16} style={{ marginRight: '6px' }} /> 自訂欄位
            </button>
            <div style={{ position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input type="text" placeholder="快速搜尋..." value={searchTerm} onChange={(e) => {setSearchTerm(e.target.value); setCurrentPage(1);}} style={{ padding: '10px 12px 10px 42px', borderRadius: '30px', border: '1.5px solid #e2e8f0', width: '300px' }} />
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '100px', color: '#64748b' }}>載入中...</div>
        ) : (
          <div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #f1f5f9', color: '#444', backgroundColor: '#f8fafc' }}>
                  <th style={{ padding: '14px' }}>廠牌 / 類型 / 型號</th>
                  <th style={{ padding: '14px' }}>規格內容</th>
                  <th style={{ padding: '14px' }}>序號 / SN</th>
                  <th style={{ padding: '14px' }}>客戶 / 位置</th>
                  <th style={{ padding: '14px' }}>關鍵日期</th>
                  <th style={{ padding: '14px' }}>自訂屬性</th>
                  <th style={{ padding: '14px' }}>狀態</th>
                  <th style={{ padding: '14px', textAlign: 'center' }}>功能</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map(item => {
                  const config = statusConfig[item.status] || statusConfig['ACTIVE'];
                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '14px' }}>
                        <div style={{ fontWeight: 800, color: '#2563eb' }}>{item.brand || '--'}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>{item.type || '--'} / {item.model || '--'}</div>
                      </td>
                      <td style={{ padding: '14px' }}>
                         <div style={{ fontSize: '12px', color: '#475569', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.specification}>{item.specification}</div>
                      </td>
                      <td style={{ padding: '14px', fontWeight: 800, fontFamily: 'monospace' }}>{item.sn}</td>
                      <td style={{ padding: '14px' }}>
                        <div style={{ color: '#722ed1', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}><User size={12}/> {item.client || '--'}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}><MapPin size={11}/> {item.location || '--'}</div>
                      </td>
                      <td style={{ padding: '14px', fontSize: '11px', lineHeight: '1.5' }}>
                        <div style={{ color: '#0f172a' }}>P: {item.installed_date ? new Date(item.installed_date).toLocaleDateString() : '--'}</div>
                        <div style={{ color: '#64748b' }}>S: {item.system_date ? new Date(item.system_date).toLocaleDateString() : '--'}</div>
                        <div style={{ color: '#2563eb' }}>W: {item.warranty_expire ? new Date(item.warranty_expire).toLocaleDateString() : '--'}</div>
                        <div style={{ color: '#d46b08' }}>C: {item.customer_warranty_expire ? new Date(item.customer_warranty_expire).toLocaleDateString() : '--'}</div>
                      </td>
                      <td style={{ padding: '14px' }}>
                        {customFieldDefs.filter(f => isFieldVisible(item.brand, f.id)).map(f => {
                          let attrs = {};
                          try { attrs = typeof item.custom_attributes === 'string' ? JSON.parse(item.custom_attributes) : (item.custom_attributes || {}); } catch { attrs = {}; }
                          const val = f.isNative ? item[f.id] : attrs[f.id];
                          return <div key={f.id} style={{ fontSize: '11px', color: f.color || '#64748b' }}>{f.label.split(' ')[0]}: <b>{val || '--'}</b></div>
                        })}
                      </td>
                      <td style={{ padding: '14px' }}>
                        <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '800', backgroundColor: config.bgColor, color: config.color, border: `1px solid ${config.borderColor}` }}>{config.label}</span>
                      </td>
                      <td style={{ padding: '14px', textAlign: 'center', position: 'relative' }}>
                        <button onClick={() => setActiveMenuId(activeMenuId === item.id ? null : item.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}><MoreHorizontal size={20} /></button>
                        {activeMenuId === item.id && (
                          <div style={{ position: 'absolute', right: 0, top: '100%', backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.2)', zIndex: 9999, padding: '8px', minWidth: '160px', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                            <button onClick={() => handleEditClick(item)} style={menuButtonStyle}><Edit2 size={14}/> 編輯詳細資訊</button>
                            <div style={{ height: '1px', backgroundColor: '#f1f5f9', margin: '4px 0' }} />
                            <button onClick={() => handleUpdateStatus(item.id, item.sn, 'ACTIVE', '在庫')} style={{ ...menuButtonStyle, color: '#047857' }}><CheckCircle size={14}/> 標記為在庫</button>
                            <button onClick={() => handleUpdateStatus(item.id, item.sn, 'SHIPPED', '已出貨')} style={{ ...menuButtonStyle, color: '#1d4ed8' }}><ShoppingBag size={14}/> 標記為出貨</button>
                            <button onClick={() => handleUpdateStatus(item.id, item.sn, 'REPAIRING', '異常/維修中')} style={{ ...menuButtonStyle, color: '#fa8c16' }}><Wrench size={14}/> 標記為維修</button>
                            <button onClick={() => handleUpdateStatus(item.id, item.sn, 'SCRAPPED', '已報廢')} style={{ ...menuButtonStyle, color: '#e11d48' }}><ShieldAlert size={14}/> 標記為報廢</button>
                            <div style={{ height: '1px', backgroundColor: '#f1f5f9', margin: '4px 0' }} />
                            <button onClick={() => handleDelete(item.id, item.sn)} style={{ ...menuButtonStyle, color: '#f43f5e', backgroundColor: '#fff1f2' }}><Trash2 size={14}/> 刪除紀錄</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginTop: '32px' }}>
                <button disabled={currentPage === 1} onClick={() => setCurrentPage(prev => prev - 1)} style={navBtnStyle}>上一頁</button>
                <div style={{ fontSize: '13px', fontWeight: '800' }}>{currentPage} / {totalPages}</div>
                <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(prev => prev + 1)} style={navBtnStyle}>下一頁</button>
              </div>
            )}
          </div>
        )}
      </div>

      {showEditModal && editItem && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div style={{ backgroundColor: 'white', width: '680px', padding: '32px', borderRadius: '16px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '900' }}>修改詳細設備資訊</h2>
              <X size={24} style={{ cursor: 'pointer' }} onClick={() => setShowEditModal(false)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div><label style={editLabelStyle}>序號 / SN</label><input type="text" value={editItem.sn || ''} onChange={(e) => setEditItem({...editItem, sn: e.target.value})} style={editInputStyle} /></div>
                <div><label style={editLabelStyle}>廠牌 / 類型 / 型號</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input type="text" value={editItem.brand || ''} readOnly style={{ ...editInputStyle, backgroundColor: '#f8fafc', width: '30%', color: '#94a3b8' }} />
                    <input type="text" value={editItem.type || ''} readOnly style={{ ...editInputStyle, backgroundColor: '#f8fafc', width: '30%', color: '#94a3b8' }} />
                    <input type="text" value={editItem.model || ''} onChange={(e) => setEditItem({...editItem, model: e.target.value})} style={{ ...editInputStyle, flex: 1 }} />
                  </div>
                </div>
              </div>
              <div><label style={editLabelStyle}>規格 (Specification)</label><textarea value={editItem.specification} onChange={(e) => setEditItem({...editItem, specification: e.target.value})} style={{ ...editInputStyle, minHeight: '80px', lineHeight: '1.5' }} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div><label style={editLabelStyle}>客戶名稱</label><select value={editItem.client || ''} onChange={(e) => setEditItem({...editItem, client: e.target.value})} style={editInputStyle}>{customers.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                <div><label style={editLabelStyle}>放置位置 (Location)</label><input type="text" value={editItem.location || ''} onChange={(e) => setEditItem({...editItem, location: e.target.value})} style={editInputStyle} /></div>
              </div>
              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div><label style={editLabelStyle}>安裝日期 (Project Date)</label><input type="date" value={editItem.installed_date || ''} onChange={(e) => setEditItem({...editItem, installed_date: e.target.value})} style={editInputStyle} /></div>
                <div><label style={editLabelStyle}>系統日期 (System Date)</label><input type="date" value={editItem.system_date || ''} onChange={(e) => setEditItem({...editItem, system_date: e.target.value})} style={editInputStyle} /></div>
                <div><label style={editLabelStyle}>原廠保固到期 (Warranty Expire)</label><input type="date" value={editItem.warranty_expire || ''} onChange={(e) => setEditItem({...editItem, warranty_expire: e.target.value})} style={editInputStyle} /></div>
                <div><label style={editLabelStyle}>客戶保固到期 (Cust Warranty)</label><input type="date" value={editItem.customer_warranty_expire || ''} onChange={(e) => setEditItem({...editItem, customer_warranty_expire: e.target.value})} style={editInputStyle} /></div>
              </div>
              {customFieldDefs.filter(f => isFieldVisible(editItem.brand, f.id)).length > 0 && (
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '20px' }}>
                  <div style={{ fontSize: '15px', fontWeight: '900', color: '#2563eb', marginBottom: '16px' }}>自訂設備屬性</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    {customFieldDefs.filter(f => isFieldVisible(editItem.brand, f.id)).map(f => {
                      let attrs = {};
                      try { attrs = typeof editItem.custom_attributes === 'string' ? JSON.parse(editItem.custom_attributes) : (editItem.custom_attributes || {}); } catch { attrs = {}; }
                      const val = f.isNative ? editItem[f.id] : attrs[f.id];
                      return (
                        <div key={f.id}>
                          <label style={{ ...editLabelStyle, color: f.color || '#475569' }}>{f.label}</label>
                          <input type="text" value={val || ''} onChange={(e) => {
                            if (f.isNative) setEditItem({...editItem, [f.id]: e.target.value});
                            else {
                               const na = { ...attrs, [f.id]: e.target.value };
                               setEditItem({...editItem, custom_attributes: na });
                            }
                          }} style={editInputStyle} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: '12px', marginTop: '12px', borderTop: '1px solid #f1f5f9', paddingTop: '24px' }}>
                <button onClick={handleUpdate} style={{ flex: 1, padding: '14px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}><Save size={18}/> 儲存變更</button>
                <button onClick={() => setShowEditModal(false)} style={{ padding: '14px 24px', backgroundColor: '#f1f5f9', border: 'none', borderRadius: '10px', cursor: 'pointer' }}>取消</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showConfigModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div style={{ backgroundColor: 'white', width: '600px', padding: '32px', borderRadius: '16px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '900' }}>自訂欄位設定</h2>
              <X size={24} style={{ cursor: 'pointer' }} onClick={() => setShowConfigModal(false)} />
            </div>
            
            <div style={{ marginBottom: '32px' }}>
               <h3 style={{ fontSize: '16px', color: '#2563eb', marginBottom: '16px', fontWeight: '900' }}>1. 欄位管理</h3>
               <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                 {customFieldDefs.map((def, i) => (
                   <div key={def.id} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                     <input type="color" value={def.color || '#1890ff'} onChange={(e) => {
                       const newDefs = [...customFieldDefs]; newDefs[i].color = e.target.value; setCustomFieldDefs(newDefs);
                     }} style={{ width: '36px', height: '36px', border: '1px solid #e2e8f0', cursor: 'pointer' }} />
                     <input type="text" value={def.label} onChange={(e) => {
                       const newDefs = [...customFieldDefs]; newDefs[i].label = e.target.value; setCustomFieldDefs(newDefs);
                     }} style={{ ...editInputStyle, flex: 1 }} />
                     {!def.isNative && (
                       <button onClick={() => setCustomFieldDefs(customFieldDefs.filter(d => d.id !== def.id))} style={{ color: '#ef4444', border: 'none', background: 'none' }}><Trash2 size={18}/></button>
                     )}
                   </div>
                 ))}
                 <button onClick={() => setCustomFieldDefs([...customFieldDefs, { id: 'custom_'+Date.now(), label: '新欄位', isNative: false }])} style={{ padding: '10px', border: '2px dashed #e2e8f0', borderRadius: '10px', color: '#2563eb', cursor: 'pointer' }}>+ 新增欄位</button>
               </div>
            </div>

            <div style={{ marginBottom: '32px' }}>
              <h3 style={{ fontSize: '16px', color: '#2563eb', marginBottom: '16px', fontWeight: '900' }}>2. 顯示欄位</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {Array.from(new Set(items.map(i => i.brand).filter(Boolean))).map(brand => (
                  <div key={brand} style={{ padding: '16px', border: '1px solid #f1f5f9', borderRadius: '12px' }}>
                    <div style={{ fontWeight: 900, marginBottom: '8px' }}>{brand}</div>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      {customFieldDefs.map(def => (
                        <label key={def.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}>
                          <input type="checkbox" checked={isFieldVisible(brand, def.id)} onChange={(e) => {
                            const newConfig = { ...brandFieldConfigs };
                            if (!newConfig[brand]) newConfig[brand] = {};
                            newConfig[brand][def.id] = e.target.checked;
                            setBrandFieldConfigs(newConfig);
                          }} /> {def.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={async () => {
                await window.electronAPI.namedQuery('upsertSystemSetting', ['customFieldDefinitions', customFieldDefs]);
                await window.electronAPI.namedQuery('upsertSystemSetting', ['brandFieldConfigs', brandFieldConfigs]);
                alert('設定已儲存'); setShowConfigModal(false); fetchSettings();
              }} style={{ flex: 1, padding: '14px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 700 }}>儲存設定</button>
              <button onClick={() => setShowConfigModal(false)} style={{ padding: '14px 24px', backgroundColor: '#f1f5f9', border: 'none', borderRadius: '10px' }}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssetList;
