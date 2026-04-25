import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Search, Edit2, Trash2, ShieldAlert, X, Save, Wrench, PauseCircle, ShoppingBag, Layers } from 'lucide-react';

const AssetList = () => {
  const [items, setItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const brandFilter = searchParams.get('brand');
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Modal states
  const [editItem, setEditItem] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [brandFieldConfigs, setBrandFieldConfigs] = useState({});
  const [customFieldDefs, setCustomFieldDefs] = useState([
    { id: 'hostname', label: '主機名稱 (HostName)', isNative: true },
    { id: 'os', label: '作業系統 (OS)', isNative: true },
    { id: 'nic', label: '網路介面卡 (NIC)', isNative: true }
  ]);

  // Status mapping for colors and labels
  const statusConfig = {
    ACTIVE: { label: '正常在庫', color: '#1890ff', bgColor: '#e6f7ff', borderColor: '#91d5ff' },
    REPAIRING: { label: '異常/維修中', color: '#fa8c16', bgColor: '#fff7e6', borderColor: '#ffd591' },
    PENDING_SCRAP: { label: '停用/待報廢', color: '#595959', bgColor: '#f5f5f5', borderColor: '#d9d9d9' },
    SCRAPPED: { label: '已報廢', color: '#f5222d', bgColor: '#fff1f0', borderColor: '#ffccc7' },
    SHIPPED: { label: '已出貨', color: '#722ed1', bgColor: '#f9f0ff', borderColor: '#d3adf7' }
  };

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    let res;
    if (brandFilter) {
      res = await window.electronAPI.namedQuery('fetchAssetsListByBrand', [brandFilter]);
    } else {
      res = await window.electronAPI.namedQuery('fetchAssetsList');
    }
    
    if (res.success) {
      setItems(res.rows);
    }
    setLoading(false);
  }, [brandFilter]);

  const fetchCustomers = useCallback(async () => {
    const res = await window.electronAPI.namedQuery('fetchCustomers');
    if (res.success) {
      setCustomers(res.rows.map(r => r.name));
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    const res = await window.electronAPI.namedQuery('getSystemSetting', ['brandFieldConfigs']);
    if (res.success && res.rows.length > 0) {
      setBrandFieldConfigs(res.rows[0].value || {});
    }
    const defsRes = await window.electronAPI.namedQuery('getSystemSetting', ['customFieldDefinitions']);
    if (defsRes.success && defsRes.rows.length > 0) {
      setCustomFieldDefs(defsRes.rows[0].value || [
        { id: 'hostname', label: '主機名稱 (HostName)', isNative: true },
        { id: 'os', label: '作業系統 (OS)', isNative: true },
        { id: 'nic', label: '網路介面卡 (NIC)', isNative: true }
      ]);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => {
      fetchAssets();
      fetchCustomers();
      fetchSettings();
      setCurrentPage(1); // Reset page when filter changes
    });
  }, [fetchAssets, fetchCustomers, fetchSettings]);

  const isFieldVisible = (brand, fieldName) => {
    if (!brand) return true;
    const config = brandFieldConfigs[brand] || {};
    if (config[fieldName] !== undefined) return config[fieldName];
    if (brand.toLowerCase().includes('cisco') && fieldName === 'nic') return false;
    return true;
  };

  const handleDelete = async (id, sn) => {
    if (!window.confirm(`確定要刪除設備 [${sn}] 嗎？此操作不可逆，將會移除所有紀錄。`)) return;
    
    const res = await window.electronAPI.namedQuery('deleteAsset', [id]);
    if (res.success) {
      alert('刪除成功');
      window.dispatchEvent(new Event('db-update'));
      
      const newItems = items.filter(i => i.id !== id);
      if (brandFilter && newItems.length === 0) {
        navigate('/asset-list');
      } else {
        // Adjust pagination if the current page becomes empty
        const newTotalPages = Math.ceil(newItems.length / itemsPerPage);
        if (currentPage > newTotalPages && newTotalPages > 0) {
          setCurrentPage(newTotalPages);
        }
        fetchAssets();
      }
    } else {
      alert('刪除失敗：' + res.error);
    }
  };

  const handleUpdateStatus = async (id, sn, newStatus, label) => {
    if (!window.confirm(`確定要將設備 [${sn}] 變更為「${label}」狀態嗎？`)) return;
    
    const res = await window.electronAPI.namedQuery('updateAssetStatus', [newStatus, id]);
    if (res.success) {
      alert(`已成功變更為 ${label}`);
      fetchAssets();
    } else {
      alert('操作失敗：' + res.error);
    }
  };

  const handleUpdate = async () => {
    if (!editItem.specification) return alert('請填寫必填欄位');
    
    await window.electronAPI.namedQuery('updateItemMasterSpecs', [editItem.specification, editItem.model, editItem.item_master_id]);
    
    const res = await window.electronAPI.namedQuery('updateAssetDetails', [
        editItem.sn, editItem.client, 
        editItem.hostname, editItem.location, editItem.installed_date,
        editItem.customer_warranty_expire, editItem.system_date, editItem.warranty_expire,
        editItem.os, editItem.nic, editItem.custom_attributes || null, editItem.id
    ]);

    if (res.success) {
      alert('更新成功');
      setShowEditModal(false);
      fetchAssets();
    } else {
      alert('更新失敗：' + res.error);
    }
  };

  const filteredItems = items.filter(item => {
    const search = searchTerm.toLowerCase();
    const sn = (item.sn || '').toLowerCase();
    const spec = (item.specification || '').toLowerCase();
    const host = (item.hostname || '').toLowerCase();
    const brand = (item.brand || '').toLowerCase();
    const model = (item.model || '').toLowerCase();
    const client = (item.client || '').toLowerCase();
    const loc = (item.location || '').toLowerCase();

    return sn.includes(search) ||
           spec.includes(search) ||
           host.includes(search) ||
           brand.includes(search) ||
           model.includes(search) ||
           client.includes(search) ||
           loc.includes(search);
  });

  // Pagination logic
  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const paginatedItems = filteredItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1); // Reset to first page on search
  };

  return (
    <div className="asset-list-container">
      <div className="card-surface">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h1 className="page-title" style={{ marginBottom: '4px' }}>
              {brandFilter ? `${brandFilter} - 設備清單` : '設備列表 (Equipment List)'}
            </h1>
            <p style={{ color: '#666', fontSize: '0.9rem' }}>
              {brandFilter ? `顯示廠牌為 ${brandFilter} 的所有資訊設備。` : '管理系統內所有資訊設備資產狀態與詳細資料。'}
            </p>
          </div>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <button 
              onClick={() => setShowConfigModal(true)}
              style={{ padding: '10px 16px', backgroundColor: '#f5f5f5', color: '#555', border: '1px solid #ddd', marginRight: '16px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', fontWeight: 600 }}
            >
              <Wrench size={16} style={{ marginRight: '6px' }} />
              自訂設備欄位
            </button>
            <div style={{ position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#999' }} />
              <input 
                type="text" 
                placeholder="搜尋序號、規格、客戶、HostName、位置..." 
                value={searchTerm}
                onChange={handleSearchChange}
                style={{ 
                  padding: '10px 12px 10px 40px', 
                  borderRadius: '8px', 
                  border: '1px solid #ddd', 
                  width: '320px',
                  fontSize: '0.95rem'
                }}
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '100px', color: 'var(--primary-color)' }}>載入中...</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1200px' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid #eee', color: '#444' }}>
                  <th style={{ padding: '8px 12px' }}>廠牌 / 類型 / 型號</th>
                  <th style={{ padding: '8px 12px' }}>規格內容</th>
                  <th style={{ padding: '8px 12px' }}>序號 / SN</th>
                  <th style={{ padding: '8px 12px' }}>客戶 / 位置</th>
                  <th style={{ padding: '8px 12px' }}>關鍵日期 (Timeline)</th>
                  <th style={{ padding: '8px 12px' }}>自訂欄位(Custom fields)</th>
                  <th style={{ padding: '8px 12px' }}>狀態</th>
                  <th style={{ padding: '8px 12px', textAlign: 'center' }}>功能</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map(item => {
                  const config = statusConfig[item.status] || statusConfig['ACTIVE'];
                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid #f5f5f5', transition: 'background-color 0.2s' }}>
                      <td style={{ padding: '8px 12px' }}>
                        <div style={{ fontWeight: 700, color: 'var(--primary-color)' }}>{item.brand || '--'}</div>
                        <div style={{ fontSize: '0.75rem', color: '#888' }}>{item.type || '--'}</div>
                        <div style={{ fontSize: '0.8rem', color: '#666', fontWeight: 600 }}>{item.model || '--'}</div>
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <div style={{ fontSize: '0.8rem', color: '#555', maxWidth: '300px', whiteSpace: 'normal', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.specification}>
                          {item.specification}
                        </div>
                      </td>
                      <td style={{ padding: '8px 12px', fontWeight: 600, fontFamily: 'monospace', color: '#333' }}>{item.sn}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <div style={{ color: '#722ed1', fontWeight: 700 }}>{item.client || '--'}</div>
                        <div style={{ fontSize: '0.75rem', color: '#666' }}>{item.location || '--'}</div>
                      </td>
                      <td style={{ padding: '8px 12px', fontSize: '0.75rem', lineHeight: '1.4' }}>
                        <div title="專案安裝日期 (Project Date)" style={{ color: '#000' }}>P: {item.installed_date ? new Date(item.installed_date).toLocaleDateString() : '--'}</div>
                        <div title="系統日期 (System Date)" style={{ color: '#000' }}>S: {item.system_date ? new Date(item.system_date).toLocaleDateString() : '--'}</div>
                        <div title="原廠保固(Warranty Expire)" style={{ color: '#1890ff' }}>W: {item.warranty_expire ? new Date(item.warranty_expire).toLocaleDateString() : '--'}</div>
                        <div title="客戶保固(Customer Warranty)" style={{ color: '#d46b08' }}>C: {item.customer_warranty_expire ? new Date(item.customer_warranty_expire).toLocaleDateString() : '--'}</div>
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        {customFieldDefs.filter(f => isFieldVisible(item.brand, f.id)).map((f, idx) => {
                          const isFirst = idx === 0;
                          let customAttrs = {};
                          try { 
                            customAttrs = typeof item.custom_attributes === 'string' ? JSON.parse(item.custom_attributes) : (item.custom_attributes || {}); 
                          } catch (e) {
                            customAttrs = {}; 
                          }
                          const value = f.isNative ? item[f.id] : customAttrs[f.id];
                          return (
                            <div key={f.id} style={{ fontSize: isFirst ? '0.9rem' : '0.8rem', color: isFirst ? '#1890ff' : '#666', marginTop: isFirst ? '0' : '4px' }}>
                              {f.label.split(' ')[0]}: <span style={{ fontWeight: 600, color: '#444' }}>{value || '--'}</span>
                            </div>
                          );
                        })}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ 
                          padding: '6px 14px', borderRadius: '30px', fontSize: '0.75rem', fontWeight: 700,
                          backgroundColor: config.bgColor,
                          color: config.color,
                          border: `1px solid ${config.borderColor}`,
                          whiteSpace: 'nowrap'
                        }}>
                          {config.label}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '6px' }}>
                          <button 
                            onClick={() => { 
                              // 轉換日期格式以便 input type="date" 讀取
                              const formattedItem = { ...item };
                              ['installed_date', 'customer_warranty_expire', 'system_date', 'warranty_expire'].forEach(key => {
                                if (formattedItem[key]) formattedItem[key] = new Date(formattedItem[key]).toISOString().split('T')[0];
                              });
                              setEditItem(formattedItem); 
                              setShowEditModal(true); 
                            }}
                            style={actionButtonStyle}
                            title="詳細修改"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button 
                            onClick={() => handleUpdateStatus(item.id, item.sn, 'SHIPPED', '已出貨')}
                            style={{ ...actionButtonStyle, color: '#722ed1' }}
                            title="已出貨"
                          >
                            <ShoppingBag size={16} />
                          </button>
                          <button 
                            onClick={() => handleUpdateStatus(item.id, item.sn, 'REPAIRING', '異常/維修中')}
                            style={{ ...actionButtonStyle, color: '#fa8c16' }}
                            title="維修中"
                          >
                            <Wrench size={16} />
                          </button>
                          <button 
                            onClick={() => handleUpdateStatus(item.id, item.sn, 'SCRAPPED', '已報廢')}
                            disabled={item.status === 'SCRAPPED'}
                            style={{ 
                              ...actionButtonStyle, 
                              color: item.status === 'SCRAPPED' ? '#ccc' : '#f5222d',
                              cursor: item.status === 'SCRAPPED' ? 'not-allowed' : 'pointer'
                            }}
                            title="報廢"
                          >
                            <ShieldAlert size={16} />
                          </button>
                          <button 
                            onClick={() => handleDelete(item.id, item.sn)}
                            style={{ ...actionButtonStyle, color: '#f5222d', opacity: 0.5 }}
                            title="刪除"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            
            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '32px', paddingBottom: '20px' }}>
                <button 
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  style={pageNavButtonStyle}
                >
                  上一頁
                </button>
                {[...Array(totalPages)].map((_, i) => (
                  <button 
                    key={i + 1}
                    onClick={() => setCurrentPage(i + 1)}
                    style={{ 
                      width: '38px', height: '38px', borderRadius: '8px', border: 'none',
                      backgroundColor: currentPage === i + 1 ? 'var(--primary-color)' : '#eee',
                      color: currentPage === i + 1 ? 'white' : '#666',
                      fontWeight: 700, cursor: 'pointer'
                    }}
                  >
                    {i + 1}
                  </button>
                ))}
                <button 
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  style={pageNavButtonStyle}
                >
                  下一頁
                </button>
              </div>
            )}
            {paginatedItems.length === 0 && <div style={{ textAlign: 'center', padding: '60px', color: '#999' }}>查無相符結果</div>}
          </div>
        )}
      </div>

      {/* 編輯設備 Modal */}
      {showEditModal && editItem && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div className="card-surface" style={{ width: '650px', padding: '32px', borderRadius: '16px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '1.25rem', color: '#333', fontWeight: 800 }}>修改詳細設備資訊</h2>
              <X size={24} style={{ cursor: 'pointer', color: '#999' }} onClick={() => setShowEditModal(false)} />
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div><label style={editLabelStyle}>序號 / SN</label><input type="text" value={editItem.sn || ''} onChange={(e) => setEditItem({...editItem, sn: e.target.value})} style={editInputStyle} placeholder="序號 (選填)" /></div>
                <div><label style={editLabelStyle}>廠牌 / 類型 / 型號</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input type="text" value={editItem.brand || ''} readOnly style={{ ...editInputStyle, backgroundColor: '#f5f5f5', width: '30%' }} />
                    <input type="text" value={editItem.type || ''} readOnly style={{ ...editInputStyle, backgroundColor: '#f5f5f5', width: '30%' }} />
                    <input type="text" value={editItem.model || ''} onChange={(e) => setEditItem({...editItem, model: e.target.value})} style={{ ...editInputStyle, flex: 1 }} placeholder="型號" />
                  </div>
                </div>
              </div>

              <div><label style={editLabelStyle}>規格 (Specification)</label><textarea value={editItem.specification} onChange={(e) => setEditItem({...editItem, specification: e.target.value})} style={{ ...editInputStyle, minHeight: '60px' }} /></div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={editLabelStyle}>客戶名稱</label>
                  <select 
                    value={editItem.client || ''} 
                    onChange={(e) => setEditItem({...editItem, client: e.target.value})} 
                    style={editInputStyle}
                  >
                    <option value="">請選擇客戶</option>
                    {customers.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div><label style={editLabelStyle}>放置位置 (Location)</label><input type="text" value={editItem.location || ''} onChange={(e) => setEditItem({...editItem, location: e.target.value})} style={editInputStyle} placeholder="例如: 1F A機櫃" /></div>
              </div>

              <div style={{ borderTop: '1px solid #eee', paddingTop: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div>
                  <label style={editLabelStyle}>安裝日期 (Project Date)</label>
                  <input type="date" value={editItem.installed_date || ''} onChange={(e) => setEditItem({...editItem, installed_date: e.target.value})} style={editInputStyle} />
                </div>
                <div>
                  <label style={editLabelStyle}>系統日期 (System Date)</label>
                  <input type="date" value={editItem.system_date || ''} onChange={(e) => setEditItem({...editItem, system_date: e.target.value})} style={editInputStyle} />
                </div>
                <div>
                  <label style={editLabelStyle}>原廠保固到期 (Warranty Expire)</label>
                  <input type="date" value={editItem.warranty_expire || ''} onChange={(e) => setEditItem({...editItem, warranty_expire: e.target.value})} style={editInputStyle} />
                </div>
                <div>
                  <label style={editLabelStyle}>客戶保固到期 (Cust Warranty)</label>
                  <input type="date" value={editItem.customer_warranty_expire || ''} onChange={(e) => setEditItem({...editItem, customer_warranty_expire: e.target.value})} style={editInputStyle} />
                </div>
              </div>

              {customFieldDefs.filter(f => isFieldVisible(editItem.brand, f.id)).length > 0 && (
                <div style={{ borderTop: '1px solid #eee', paddingTop: '20px' }}>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#1890ff', marginBottom: '16px' }}>自訂設備屬性</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    {customFieldDefs.filter(f => isFieldVisible(editItem.brand, f.id)).map(f => {
                      let customAttrs = {};
                      try { 
                        customAttrs = typeof editItem.custom_attributes === 'string' ? JSON.parse(editItem.custom_attributes) : (editItem.custom_attributes || {}); 
                      } catch (e) {
                        customAttrs = {};
                      }
                      const value = f.isNative ? editItem[f.id] : customAttrs[f.id];
                      
                      return (
                        <div key={f.id}>
                          <label style={editLabelStyle}>{f.label}</label>
                          <input type="text" value={value || ''} onChange={(e) => {
                            if (f.isNative) {
                              setEditItem({...editItem, [f.id]: e.target.value});
                            } else {
                              const newAttrs = { ...customAttrs, [f.id]: e.target.value };
                              setEditItem({...editItem, custom_attributes: newAttrs });
                            }
                          }} style={editInputStyle} placeholder={`輸入 ${f.label}`} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px', borderTop: '1px solid #eee', paddingTop: '24px' }}>
                <button onClick={handleUpdate} style={{ flex: 1, padding: '14px', backgroundColor: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 700 }}>確認儲存變更</button>
                <button onClick={() => setShowEditModal(false)} style={{ padding: '14px 32px', backgroundColor: '#f0f0f0', color: '#666', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 600 }}>取消</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* 欄位自訂設定 Modal */}
      {showConfigModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div className="card-surface" style={{ width: '500px', padding: '32px', borderRadius: '16px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '1.25rem', color: '#333', fontWeight: 800 }}>自訂廠牌顯示欄位</h2>
              <X size={24} style={{ cursor: 'pointer', color: '#999' }} onClick={() => setShowConfigModal(false)} />
            </div>
            <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '24px' }}>請配置系統可用的進階屬性，並針對各廠牌勾選在「列表與編輯」時需要顯示的對應項目。</p>
            
            <div style={{ marginBottom: '32px', paddingBottom: '24px', borderBottom: '1px solid #eee' }}>
               <h3 style={{ fontSize: '1.05rem', color: '#1890ff', marginBottom: '16px', fontWeight: 800 }}>1. 系統欄位字典管理</h3>
               <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                 {customFieldDefs.map((def, i) => (
                   <div key={def.id} style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                     <input type="text" value={def.label} onChange={(e) => {
                         const newDefs = [...customFieldDefs];
                         newDefs[i].label = e.target.value;
                         setCustomFieldDefs(newDefs);
                     }} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #ccc', width: '250px', backgroundColor: '#fff' }} title={'編輯欄位顯示名稱'} placeholder="顯示名稱" />
                     {!def.isNative && (
                       <button onClick={() => {
                         if(window.confirm('確定移除此自訂屬性？(資料庫對應內容不會刪除，但不會再顯示於前端)')) {
                           setCustomFieldDefs(customFieldDefs.filter(d => d.id !== def.id));
                         }
                       }} style={{ backgroundColor: '#fff1f0', color: '#f5222d', border: '1px solid #ffa39e', borderRadius: '4px', padding: '6px 10px', cursor: 'pointer', fontSize: '0.85rem' }}>刪除欄位</button>
                     )}
                   </div>
                 ))}
                 <button onClick={() => {
                   const newId = 'custom_' + Date.now();
                   setCustomFieldDefs([...customFieldDefs, { id: newId, label: '新增的欄位', isNative: false }]);
                 }} style={{ alignSelf: 'flex-start', border: '1px dashed #1890ff', background: '#e6f7ff', color: '#1890ff', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', marginTop: '8px', fontWeight: 600 }}>+ 新增自訂屬性</button>
               </div>
            </div>

            <h3 style={{ fontSize: '1.05rem', color: '#1890ff', marginBottom: '16px', fontWeight: 800 }}>2. 各廠牌適用欄位對應</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {Array.from(new Set(items.map(i => i.brand).filter(Boolean))).map(brand => {
                return (
                  <div key={brand} style={{ border: '1px solid #eee', padding: '16px', borderRadius: '8px', backgroundColor: '#fcfcfc' }}>
                    <div style={{ fontWeight: 800, marginBottom: '12px', color: 'var(--primary-color)', fontSize: '1.05rem' }}>{brand}</div>
                    <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                      {customFieldDefs.map(def => {
                        const isVisible = isFieldVisible(brand, def.id);
                        return (
                          <label key={def.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.95rem' }}>
                            <input type="checkbox" checked={isVisible} onChange={(e) => {
                              const newConfig = { ...brandFieldConfigs };
                              if (!newConfig[brand]) newConfig[brand] = {};
                              newConfig[brand][def.id] = e.target.checked;
                              setBrandFieldConfigs(newConfig);
                            }} style={{ width: '18px', height: '18px' }} /> {def.label}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            
            <div style={{ display: 'flex', gap: '12px', marginTop: '32px' }}>
              <button 
                onClick={async () => {
                  try {
                    const res1 = await window.electronAPI.namedQuery('upsertSystemSetting', ['customFieldDefinitions', customFieldDefs]);
                    const res2 = await window.electronAPI.namedQuery('upsertSystemSetting', ['brandFieldConfigs', brandFieldConfigs]);
                    
                    if (res1.success && res2.success) {
                      alert('欄位設定與定義已成功儲存！');
                      setShowConfigModal(false);
                      fetchSettings();
                    } else {
                      alert('儲存失敗：' + (res1.error || res2.error));
                    }
                  } catch(e) {
                    alert('發生不明錯誤：' + e.message);
                  }
                }} 
                style={{ flex: 1, padding: '14px', backgroundColor: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 700 }}>
                儲存這些設定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const actionButtonStyle = { padding: '8px', borderRadius: '8px', border: '1px solid #eee', backgroundColor: '#fff', cursor: 'pointer', color: '#1890ff', display: 'flex' };
const pageNavButtonStyle = { padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: '#f5f5f5', cursor: 'pointer', color: '#666', fontWeight: 600 };
const editLabelStyle = { display: 'block', fontWeight: 700, fontSize: '0.85rem', marginBottom: '8px', color: '#666' };
const editInputStyle = { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', boxSizing: 'border-box', outline: 'none' };

export default AssetList;
