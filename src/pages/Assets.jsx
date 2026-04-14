import React, { useState } from 'react';
import ImageModal from '../components/ImageModal';
import { Upload, Plus, Save, Image as ImageIcon } from 'lucide-react';

const Assets = () => {
  const [items, setItems] = useState([
    { id: 1, sn: 'SN-001', name: 'MacBook Pro 16"', safety_stock: 2, image: null, purchase_price: 60000, currency: 'TWD' },
    { id: 2, sn: 'SN-002', name: 'Dell XPS 15', safety_stock: 5, image: null, purchase_price: 55000, currency: 'TWD' },
  ]);

  const [formData, setFormData] = useState({ sn: '', name: '', safety_stock: 0, purchase_price: '', currency: 'TWD', image: null, previewUrl: '' });
  const [modalOpen, setModalOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState('');

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const previewUrl = URL.createObjectURL(file);
      setFormData({ ...formData, image: file, previewUrl });
    }
  };

  const handleAddAsset = () => {
    if (!formData.sn || !formData.name) return alert('請填寫必填欄位');
    
    setItems([
      ...items,
      {
        id: Date.now(),
        sn: formData.sn,
        name: formData.name,
        safety_stock: formData.safety_stock,
        purchase_price: formData.purchase_price,
        currency: formData.currency,
        image: formData.previewUrl, // MOCK: URL for preview
      }
    ]);

    setFormData({ sn: '', name: '', safety_stock: 0, purchase_price: '', currency: 'TWD', image: null, previewUrl: '' });
  };

  const openPreview = (url) => {
    if (!url) return;
    setPreviewImage(url);
    setModalOpen(true);
  };

  return (
    <div className="assets-container">
      <div className="card-surface">
        <h1 className="page-title">資產建檔 (Asset Registration)</h1>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          {/* 左側：表單 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 500 }}>資產編號 / SN *</label>
              <input type="text" name="sn" value={formData.sn} onChange={handleChange} style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} placeholder="請輸入裝備唯一編號" />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 500 }}>資產名稱 *</label>
              <input type="text" name="name" value={formData.name} onChange={handleChange} style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} placeholder="請輸入資產名稱" />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 500 }}>安全庫存水位</label>
              <input type="number" name="safety_stock" value={formData.safety_stock} onChange={handleChange} style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} />
            </div>

            {/* 採購財務資訊區塊 */}
            <div style={{ backgroundColor: '#f0f4f8', padding: '16px', borderRadius: '8px', border: '1px solid #d0e0ed' }}>
              <h4 style={{ marginBottom: '12px', color: 'var(--primary-color)' }}>採購/財務資訊</h4>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                  <label style={{ fontWeight: 500, fontSize: '0.9rem' }}>幣別</label>
                  <select name="currency" value={formData.currency} onChange={handleChange} style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }}>
                    <option value="TWD">TWD (新台幣)</option>
                    <option value="USD">USD (美金)</option>
                    <option value="EUR">EUR (歐元)</option>
                    <option value="JPY">JPY (日幣)</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 2 }}>
                  <label style={{ fontWeight: 500, fontSize: '0.9rem' }}>採購單價</label>
                  <input type="number" name="purchase_price" value={formData.purchase_price} onChange={handleChange} style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} placeholder="0.00" />
                </div>
              </div>
              <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                <input type="checkbox" id="export_price" defaultChecked />
                <label htmlFor="export_price">匯出報表時包含此採購單價資訊</label>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 500 }}>資產圖片上傳</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <label style={{
                  padding: '10px 16px',
                  backgroundColor: '#f1f3f4',
                  border: '1px dashed #aaa',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <Upload size={18} />
                  <span>選擇圖片</span>
                  <input type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
                </label>
                {formData.previewUrl && (
                  <img src={formData.previewUrl} alt="preview" style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer' }} onClick={() => openPreview(formData.previewUrl)} />
                )}
              </div>
            </div>

            <button 
              onClick={handleAddAsset}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                padding: '12px', marginTop: '16px', backgroundColor: 'var(--primary-color)',
                color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600
              }}
            >
              <Save size={18} />
              儲存資產
            </button>
          </div>

          {/* 右側：列表 */}
          <div>
            <h3 style={{ marginBottom: '16px', color: 'var(--text-main)' }}>已建檔資產列表</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {items.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', padding: '12px', border: '1px solid #eee', borderRadius: '8px', backgroundColor: '#fafafa' }}>
                  <div 
                    onClick={() => openPreview(item.image)}
                    style={{ 
                      width: '48px', height: '48px', borderRadius: '6px', backgroundColor: '#e0e0e0',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '16px',
                      cursor: item.image ? 'pointer' : 'default', overflow: 'hidden'
                    }}
                  >
                    {item.image ? (
                      <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <ImageIcon color="#aaa" />
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{item.sn}</div>
                    <div style={{ color: 'var(--text-main)', fontSize: '0.9rem' }}>{item.name}</div>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                    <div>預警: {item.safety_stock}</div>
                    {item.purchase_price && (
                      <div style={{ fontWeight: 600, color: '#2e7d32', marginTop: '4px' }}>
                        {item.currency} {Number(item.purchase_price).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {items.length === 0 && <p style={{ color: '#aaa', textAlign: 'center', marginTop: '20px' }}>尚無資產</p>}
            </div>
          </div>
        </div>
      </div>

      {/* 圖片彈出預覽 Modal */}
      <ImageModal isOpen={modalOpen} imageUrl={previewImage} onClose={() => setModalOpen(false)} />
    </div>
  );
};

export default Assets;
