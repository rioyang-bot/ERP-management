import React, { useState, useEffect } from 'react';
import { UserPlus, Trash2, Edit2, Search } from 'lucide-react';

const Partners = () => {
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({ type: 'CUSTOMER', name: '', contact: '', phone: '' });

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      setLoading(true);
      const res = await window.electronAPI.namedQuery('fetchPartners');
      if (!ignore && res.success) {
        setPartners(res.rows);
      }
      if (!ignore) setLoading(false);
    };
    load();
    return () => { ignore = true; };
  }, []);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleAdd = async () => {
    if (!formData.name) return;
    const res = await window.electronAPI.namedQuery(
      'insertPartner',
      [formData.type, formData.name, formData.contact, formData.phone]
    );

    if (res.success) {
      // 重新整理列表
      const refresh = await window.electronAPI.namedQuery('fetchPartners');
      if (refresh.success) setPartners(refresh.rows);
      
      setFormData({ type: 'CUSTOMER', name: '', contact: '', phone: '' });
    } else {
      alert('新增失敗：' + res.error);
    }
  };

  const handleDelete = async (id) => {
    if(window.confirm('確定要刪除這筆資料嗎？')) {
      const res = await window.electronAPI.namedQuery('deletePartner', [id]);
      if (res.success) {
        // 重新整理列表
        const refresh = await window.electronAPI.namedQuery('fetchPartners');
        if (refresh.success) setPartners(refresh.rows);
      } else {
        alert('刪除失敗：' + res.error);
      }
    }
  };

  return (
    <div className="card-surface">
      <h1 className="page-title">客戶/廠商管理 (Partners)</h1>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
        {/* 左側：新增表單 */}
        <div style={{ backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '8px', border: '1px solid #eee' }}>
          <h3 style={{ marginBottom: '16px', color: 'var(--primary-color)' }}>新增夥伴</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '4px' }}>類型</label>
              <select name="type" value={formData.type} onChange={handleChange} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}>
                <option value="CUSTOMER">客戶 (Customer)</option>
                <option value="SUPPLIER">供應商 (Supplier)</option>
              </select>
            </div>
            
            <div>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '4px' }}>名稱 *</label>
              <input type="text" name="name" value={formData.name} onChange={handleChange} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '4px' }}>聯絡人</label>
              <input type="text" name="contact" value={formData.contact} onChange={handleChange} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '4px' }}>電話</label>
              <input type="text" name="phone" value={formData.phone} onChange={handleChange} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }} />
            </div>

            <button 
              onClick={handleAdd}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '8px', padding: '10px', backgroundColor: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              <UserPlus size={16} /> 新增
            </button>
          </div>
        </div>

        {/* 右側：列表 */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ color: 'var(--text-main)' }}>夥伴列表</h3>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', backgroundColor: '#fff', padding: '6px 12px', border: '1px solid #ddd', borderRadius: '20px' }}>
              <Search size={16} color="#888" />
              <input type="text" placeholder="搜尋..." style={{ border: 'none', outline: 'none', fontSize: '0.9rem' }} />
            </div>
          </div>
          
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f1f3f4', textAlign: 'left' }}>
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>類型</th>
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>名稱</th>
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>聯絡人</th>
                <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {!loading && partners.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '12px' }}>
                    <span style={{ 
                      padding: '4px 8px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600,
                      backgroundColor: p.type === 'CUSTOMER' ? '#e3f2fd' : '#fbe9e7',
                      color: p.type === 'CUSTOMER' ? '#1976d2' : '#d32f2f'
                    }}>
                      {p.type === 'CUSTOMER' ? '客戶' : '供應商'}
                    </span>
                  </td>
                  <td style={{ padding: '12px', fontWeight: 500 }}>{p.name}</td>
                  <td style={{ padding: '12px' }}>{p.contact} <br/><span style={{ fontSize: '0.8rem', color: '#888' }}>{p.phone}</span></td>
                  <td style={{ padding: '12px' }}>
                    <button onClick={() => handleDelete(p.id)} style={{ background: 'none', border: 'none', color: '#d32f2f', cursor: 'pointer' }}>
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
              {loading && (
                <tr>
                   <td colSpan="4" style={{ textAlign: 'center', padding: '24px', color: '#999' }}>資料載入中...</td>
                </tr>
              )}
              {!loading && partners.length === 0 && (
                <tr>
                  <td colSpan="4" style={{ textAlign: 'center', padding: '24px', color: '#999' }}>尚無資料</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Partners;
