import React, { useState, useEffect, useCallback } from 'react';
import { Search, Edit2, X, Server, User, MapPin, MoreHorizontal, Trash2, ShoppingBag, AlertTriangle, CheckCircle, Save, Monitor, Settings, ShieldAlert } from 'lucide-react';

const NicList = () => {
  const [nics, setNics] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [showServerDetails, setShowServerDetails] = useState(true);
  
  const [showSyncConfig, setShowSyncConfig] = useState(false);
  const [availableFieldDefs, setAvailableFieldDefs] = useState([]);
  const [selectedSyncFields, setSelectedSyncFields] = useState(['hostname', 'os']);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editItem, setEditItem] = useState(null);

  const fetchNics = useCallback(async () => {
    const res = await window.electronAPI.namedQuery('fetchNicList');
    if (res.success) setNics(res.rows);
  }, []);

  const fetchCustomers = useCallback(async () => {
    const res = await window.electronAPI.namedQuery('fetchCustomers');
    if (res.success) setCustomers(res.rows.map(r => r.name));
  }, []);

  const fetchSettings = useCallback(async () => {
    const defsRes = await window.electronAPI.namedQuery('getSystemSetting', ['customFieldDefinitions']);
    if (defsRes.success && defsRes.rows.length > 0) setAvailableFieldDefs(defsRes.rows[0].value || []);
    const prefRes = await window.electronAPI.namedQuery('getSystemSetting', ['nicSyncFieldPreference']);
    if (prefRes.success && prefRes.rows.length > 0) setSelectedSyncFields(prefRes.rows[0].value || ['hostname', 'os']);
  }, []);

  useEffect(() => {
    fetchNics(); fetchCustomers(); fetchSettings();
  }, [fetchNics, fetchCustomers, fetchSettings]);

  const handleEdit = (nic) => {
    setEditItem({
      ...nic,
      temp_server_sn: nic.custom_attributes?.server_sn || '',
      temp_order_date: nic.custom_attributes?.order_date || ''
    });
    setShowEditModal(true);
    setActiveMenuId(null);
  };

  const handleSave = async () => {
    if (!editItem) return;
    const res = await window.electronAPI.namedQuery('updateNicDetails', [
      editItem.sn ? editItem.sn.trim() : null,
      editItem.client || null,
      editItem.location || null,
      editItem.temp_server_sn ? editItem.temp_server_sn.trim() : null,
      editItem.temp_order_date || null,
      parseInt(editItem.id, 10)
    ]);
    if (res.success) { setShowEditModal(false); fetchNics(); }
    else alert('儲存失敗：' + res.error);
  };

  const handleSaveSyncPreference = async () => {
    const res = await window.electronAPI.namedQuery('upsertSystemSetting', ['nicSyncFieldPreference', selectedSyncFields]);
    if (res.success) { alert('同步設定已儲存！'); setShowSyncConfig(false); }
  };

  const toggleSyncField = (fieldId) => {
    if (selectedSyncFields.includes(fieldId)) setSelectedSyncFields(selectedSyncFields.filter(id => id !== fieldId));
    else setSelectedSyncFields([...selectedSyncFields, fieldId]);
  };

  const handleUpdateStatus = async (id, sn, newStatus, label) => {
    if (!confirm(`確定變更狀態為 [${label}] 嗎？`)) return;
    await window.electronAPI.namedQuery('updateAssetStatus', [newStatus, id]);
    fetchNics(); setActiveMenuId(null);
  };

  const handleDelete = async (id, sn) => {
    if (!confirm(`確定要刪除網卡 [${sn || '未設定'}] 嗎？`)) return;
    await window.electronAPI.namedQuery('deleteAsset', [id]);
    fetchNics(); setActiveMenuId(null);
  };

  const getStatusConfig = (status) => {
    switch (status) {
      case 'SHIPPED': return { label: '已出貨', color: '#1d4ed8', bgColor: '#dbeafe', borderColor: '#bfdbfe' };
      case 'REPAIR': return { label: '故障', color: '#b91c1c', bgColor: '#fee2e2', borderColor: '#fecaca' };
      case 'SCRAPPED': return { label: '已報廢', color: '#595959', bgColor: '#f5f5f5', borderColor: '#d9d9d9' };
      default: return { label: '在庫', color: '#047857', bgColor: '#dcfce7', borderColor: '#bbf7d0' };
    }
  };

  const containerStyle = { padding: '24px', backgroundColor: '#f1f5f9', minHeight: '100vh' };
  const cardStyle = { backgroundColor: 'white', borderRadius: '16px', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' };
  const thStyle = { textAlign: 'left', padding: '14px', borderBottom: '2px solid #f1f5f9', color: '#475569', fontSize: '13px', fontWeight: '800', backgroundColor: '#f8fafc' };
  const tdStyle = { padding: '14px', borderBottom: '1px solid #f1f5f9', fontSize: '12px' };
  const editLabelStyle = { display: 'block', fontWeight: '800', fontSize: '13px', marginBottom: '6px', color: '#475569' };
  const editInputStyle = { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '13px' };

  // 狀態優先權：故障 (1) > 在庫 (2) > 已出貨 (3) > 報廢 (4)
  const statusPriority = { 'REPAIR': 1, 'ACTIVE': 2, 'SHIPPED': 3, 'SCRAPPED': 4 };

  const filteredNics = nics
    .filter(n => 
      (n.sn || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (n.brand || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (n.model || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (n.custom_attributes?.server_sn || '').toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => (statusPriority[a.status] || 99) - (statusPriority[b.status] || 99));

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '24px', fontWeight: '900', color: '#1e293b' }}>網卡列表 (NIC List)</h2>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input type="checkbox" id="showServerDetails" checked={showServerDetails} onChange={(e) => setShowServerDetails(e.target.checked)} style={{ cursor: 'pointer' }} />
              <label htmlFor="showServerDetails" style={{ fontSize: '13px', fontWeight: '700', color: '#64748b', cursor: 'pointer' }}>顯示伺服器同步資訊</label>
            </div>
            <button onClick={() => setShowSyncConfig(true)} style={{ padding: '10px 16px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', fontWeight: '700', color: '#475569', gap: '6px' }}>
              <Settings size={16}/> 同步欄位設定
            </button>
            <div style={{ position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input type="text" placeholder="搜尋..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ padding: '10px 12px 10px 42px', borderRadius: '30px', border: '1.5px solid #e2e8f0', width: '200px' }} />
            </div>
          </div>
        </div>

        <div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>廠牌 / 型號</th>
                <th style={thStyle}>網卡序號 (SN)</th>
                <th style={thStyle}>訂單日期</th>
                <th style={thStyle}>對應伺服器</th>
                {showServerDetails && <th style={thStyle}>伺服器屬性</th>}
                <th style={thStyle}>客戶名稱</th>
                <th style={thStyle}>狀態</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>功能</th>
              </tr>
            </thead>
            <tbody>
              {filteredNics.map(nic => {
                const cfg = getStatusConfig(nic.status);
                let serverAttrs = {};
                try { serverAttrs = typeof nic.server_custom_attributes === 'string' ? JSON.parse(nic.server_custom_attributes) : (nic.server_custom_attributes || {}); } catch(e) {}
                
                return (
                  <tr key={nic.id} style={{ borderBottom: '1px solid #f1f5f9', opacity: nic.status === 'SCRAPPED' ? 0.6 : 1 }}>
                    <td style={tdStyle}><b>{nic.brand}</b><br/><span style={{ color: '#64748b', fontSize: '11px' }}>{nic.model}</span></td>
                    <td style={{ ...tdStyle, fontWeight: 800 }}>{nic.sn || '(未設定)'}</td>
                    <td style={tdStyle}>{nic.custom_attributes?.order_date || '--'}</td>
                    <td style={tdStyle}><div style={{ color: '#6366f1', fontWeight: 700 }}><Server size={12}/> {nic.custom_attributes?.server_sn || '--'}</div></td>
                    {showServerDetails && (
                      <td style={tdStyle}>
                        <div style={{ fontSize: '11px' }}>
                          <div style={{ color: '#1e40af', fontWeight: 800 }}>{nic.server_location || '未設定'}</div>
                          {selectedSyncFields.map(id => {
                            if (id === 'hostname' && nic.server_hostname) return <div key={id}>HostName: <b>{nic.server_hostname}</b></div>;
                            if (id === 'os' && nic.server_os) return <div key={id}>OS: <b>{nic.server_os}</b></div>;
                            const def = availableFieldDefs.find(d => d.id === id);
                            return serverAttrs[id] ? <div key={id} style={{ color: def?.color }}>{def?.label.split(' ')[0]}: <b>{serverAttrs[id]}</b></div> : null;
                          })}
                        </div>
                      </td>
                    )}
                    <td style={tdStyle}><div style={{ fontWeight: 700, color: '#1e40af' }}>{nic.server_client || nic.client || '--'}</div></td>
                    <td style={tdStyle}><span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '800', backgroundColor: cfg.bgColor, color: cfg.color, border: `1px solid ${cfg.borderColor}` }}>{cfg.label}</span></td>
                    <td style={{ ...tdStyle, textAlign: 'center', position: 'relative' }}>
                      <button onClick={() => setActiveMenuId(activeMenuId === nic.id ? null : nic.id)} style={{ border: 'none', background: 'none', color: '#64748b' }}><MoreHorizontal size={20} /></button>
                      {activeMenuId === nic.id && (
                        <div style={{ position: 'absolute', right: 0, top: '100%', backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.2)', zIndex: 9999, padding: '8px', minWidth: '150px', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                          <button onClick={() => handleEdit(nic)} style={menuButtonStyle}><Edit2 size={14}/> 編輯詳細資訊</button>
                          <div style={{ height: '1px', backgroundColor: '#f1f5f9', margin: '4px 0' }} />
                          <button onClick={() => handleUpdateStatus(nic.id, nic.sn, 'ACTIVE', '在庫')} style={{ ...menuButtonStyle, color: '#047857' }}><CheckCircle size={14}/> 標記為在庫</button>
                          <button onClick={() => handleUpdateStatus(nic.id, nic.sn, 'SHIPPED', '已出貨')} style={{ ...menuButtonStyle, color: '#1d4ed8' }}><ShoppingBag size={14}/> 標記為出貨</button>
                          <button onClick={() => handleUpdateStatus(nic.id, nic.sn, 'REPAIR', '故障')} style={{ ...menuButtonStyle, color: '#b91c1c' }}><AlertTriangle size={14}/> 標記為故障</button>
                          <button onClick={() => handleUpdateStatus(nic.id, nic.sn, 'SCRAPPED', '已報廢')} style={{ ...menuButtonStyle, color: '#e11d48' }}><ShieldAlert size={14}/> 標記為報廢</button>
                          <div style={{ height: '1px', backgroundColor: '#f1f5f9', margin: '4px 0' }} />
                          <button onClick={() => handleDelete(nic.id, nic.sn)} style={{ ...menuButtonStyle, color: '#f43f5e', backgroundColor: '#fff1f2' }}><Trash2 size={14}/> 刪除紀錄</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showSyncConfig && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div style={{ backgroundColor: 'white', width: '450px', padding: '32px', borderRadius: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '900' }}>屬性同步設定</h2>
              <X size={20} style={{ cursor: 'pointer' }} onClick={() => setShowSyncConfig(false)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '400px', overflowY: 'auto' }}>
              {['hostname', 'os', ...availableFieldDefs.filter(d => !d.isNative).map(d => d.id)].map(id => {
                const label = id === 'hostname' ? '主機名稱 (HostName)' : (id === 'os' ? '作業系統 (OS)' : availableFieldDefs.find(d => d.id === id)?.label);
                return (
                  <label key={id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={selectedSyncFields.includes(id)} onChange={() => toggleSyncField(id)} />
                    <span style={{ fontSize: '14px' }}>{label}</span>
                  </label>
                );
              })}
            </div>
            <button onClick={handleSaveSyncPreference} style={{ width: '100%', padding: '12px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 700, marginTop: '24px' }}>儲存設定</button>
          </div>
        </div>
      )}

      {showEditModal && editItem && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', width: '500px', padding: '32px', borderRadius: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}><h2>修改網卡資訊</h2><X size={24} style={{ cursor: 'pointer' }} onClick={() => setShowEditModal(false)} /></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <label style={editLabelStyle}>網卡序號<input type="text" value={editItem.sn || ''} onChange={(e) => setEditItem({...editItem, sn: e.target.value})} style={editInputStyle} /></label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <label style={editLabelStyle}>訂單日期<input type="date" value={editItem.temp_order_date || ''} onChange={(e) => setEditItem({...editItem, temp_order_date: e.target.value})} style={editInputStyle} /></label>
                <label style={editLabelStyle}>伺服器 SN<input type="text" value={editItem.temp_server_sn || ''} onChange={(e) => setEditItem({...editItem, temp_server_sn: e.target.value})} style={editInputStyle} /></label>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}><button onClick={handleSave} style={{ flex: 1, padding: '14px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 700 }}><Save size={18}/> 儲存變更</button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const menuButtonStyle = { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', border: 'none', background: 'none', fontSize: '12px', fontWeight: '600', color: '#475569', borderRadius: '8px', textAlign: 'left' };
const editLabelStyle = { display: 'block', fontWeight: '800', fontSize: '13px', marginBottom: '6px', color: '#475569' };
const editInputStyle = { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', outline: 'none', fontSize: '13px' };

export default NicList;
