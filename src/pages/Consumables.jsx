import React, { useState, useEffect, useCallback } from 'react';
import ImageModal from '../components/ImageModal';
import { Upload, Plus, Save, Image as ImageIcon, Settings2, Trash2, X } from 'lucide-react';

const Consumables = () => {
  const [items, setItems] = useState([]);
  const [types, setTypes] = useState([]);
  const [brands, setBrands] = useState([]);
  const [showAddType, setShowAddType] = useState(false);
  const [showAddBrand, setShowAddBrand] = useState(false);
  const [showManageType, setShowManageType] = useState(false);
  const [showManageBrand, setShowManageBrand] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [newBrandName, setNewBrandName] = useState('');
  const [formData, setFormData] = useState({ type: '', brand: '', spec: '', unit: '個', safety_stock: 0, image: null, previewUrl: '' });
  const UNIFIED_UNITS = ['個', '台', '盒', '包', '支', '組', '瓶', '卷', '張', '份'];
  const [modalOpen, setModalOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState('');
  const [formKey, setFormKey] = useState(0); // 用於強制重整表單區域
  const fileInputRef = React.useRef(null);

  const fetchConsumables = useCallback(async () => {
    const res = await window.electronAPI.dbQuery(`
      SELECT i.* FROM items i 
      LEFT JOIN categories c ON i.category_id = c.id 
      WHERE c.name = '辦公耗材' 
      ORDER BY i.id DESC
    `);
    if (res.success) {
      setItems(res.rows);
    }
  }, []);

  const fetchTypes = useCallback(async () => {
    const res = await window.electronAPI.dbQuery(`
      SELECT name FROM item_types 
      WHERE category_id = (SELECT id FROM categories WHERE name = '辦公耗材')
      ORDER BY name ASC
    `);
    if (res.success) {
      const typeNames = res.rows.map(r => r.name);
      setTypes(typeNames);
      setFormData(prev => {
        if (!prev.type && typeNames.length > 0) {
          return { ...prev, type: typeNames[0] };
        }
        return prev;
      });
    }
  }, []);

  const fetchBrands = useCallback(async () => {
    const res = await window.electronAPI.dbQuery(`
      SELECT name FROM item_brands 
      WHERE category_id = (SELECT id FROM categories WHERE name = '辦公耗材')
      ORDER BY name ASC
    `);
    if (res.success) {
      const brandNames = res.rows.map(r => r.name);
      setBrands(brandNames);
      setFormData(prev => {
        if (!prev.brand && brandNames.length > 0) {
          return { ...prev, brand: brandNames[0] };
        }
        return prev;
      });
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => {
      fetchConsumables();
      fetchTypes();
      fetchBrands();
    });
  }, [fetchConsumables, fetchTypes, fetchBrands]);

  const handleAddType = async () => {
    const trimmedName = newTypeName.trim();
    if (!trimmedName) return;

    if (types.includes(trimmedName)) {
      setFormData({ ...formData, type: trimmedName });
      setNewTypeName('');
      setShowAddType(false);
      return;
    }

    const res = await window.electronAPI.dbQuery(
      'INSERT INTO item_types (category_id, name) VALUES ((SELECT id FROM categories WHERE name = $1), $2)',
      ['辦公耗材', trimmedName]
    );
    if (res.success) {
      setFormData({ ...formData, type: trimmedName });
      await fetchTypes();
      setNewTypeName('');
      setShowAddType(false);
    } else {
      if (res.error && res.error.includes('duplicate key')) {
        alert('此類型已存在於選單中');
      } else {
        alert('新增類型失敗：' + res.error);
      }
    }
  };

  const handleDeleteType = async (typeName) => {
    if (!confirm(`確定要刪除「${typeName}」嗎？這不會影響現有耗材資料，但選單中將不再出現此選項。`)) return;
    const res = await window.electronAPI.dbQuery(
      'DELETE FROM item_types WHERE name = $1 AND category_id = (SELECT id FROM categories WHERE name = $2)',
      [typeName, '辦公耗材']
    );
    if (res.success) {
      await fetchTypes();
      if (formData.type === typeName) {
        setFormData(prev => ({ ...prev, type: '' }));
      }
    } else {
      alert('刪除失敗：' + res.error);
    }
  };

  const handleAddBrand = async () => {
    const trimmedName = newBrandName.trim();
    if (!trimmedName) return;

    if (brands.includes(trimmedName)) {
      setFormData({ ...formData, brand: trimmedName });
      setNewBrandName('');
      setShowAddBrand(false);
      return;
    }

    const res = await window.electronAPI.dbQuery(
      'INSERT INTO item_brands (category_id, name) VALUES ((SELECT id FROM categories WHERE name = $1), $2)',
      ['辦公耗材', trimmedName]
    );
    if (res.success) {
      setFormData({ ...formData, brand: trimmedName });
      await fetchBrands();
      setNewBrandName('');
      setShowAddBrand(false);
    } else {
      if (res.error && res.error.includes('duplicate key')) {
        alert('此廠牌已存在於選單中');
      } else {
        alert('新增廠牌失敗：' + res.error);
      }
    }
  };

  const handleDeleteBrand = async (brandName) => {
    if (!confirm(`確定要刪除「${brandName}」嗎？這不會影響現有耗材資料，但選單中將不再出現此選項。`)) return;
    const res = await window.electronAPI.dbQuery(
      'DELETE FROM item_brands WHERE name = $1 AND category_id = (SELECT id FROM categories WHERE name = $2)',
      [brandName, '辦公耗材']
    );
    if (res.success) {
      await fetchBrands();
      if (formData.brand === brandName) {
        setFormData(prev => ({ ...prev, brand: '' }));
      }
    } else {
      alert('刪除失敗：' + res.error);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({ ...formData, image: file, previewUrl: reader.result });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddConsumable = async () => {
    if (!formData.type || !formData.brand) return alert('請填寫必填欄位');

    let image_path = null;
    if (formData.image) {
      try {
        const buffer = await formData.image.arrayBuffer();
        const saveRes = await window.electronAPI.saveFile(formData.image.name, buffer);
        if (saveRes.success) {
          image_path = saveRes.fileName;
        }
      } catch (err) {
        console.error('Image upload failed:', err);
      }
    }

    const generatedSN = `CONS-${Date.now()}`;
    // 將「類型 廠牌 (規格)」結合成一個規格描述存入資料庫
    const fullSpec = `${formData.type} ${formData.brand} ${formData.spec ? `(${formData.spec})` : ''}`.trim();

    const res = await window.electronAPI.dbQuery(
      'INSERT INTO items (sn, specification, type, brand, unit, safety_stock, category_id, image_path) VALUES ($1, $2, $3, $4, $5, $6, (SELECT id FROM categories WHERE name = $7), $8)',
      [generatedSN, fullSpec, formData.type, formData.brand, formData.unit, formData.safety_stock || 0, '辦公耗材', image_path]
    );

    if (res.success) {
      alert('耗材建檔成功！');
      await fetchConsumables();
      setFormData({ type: types[0] || '', brand: brands[0] || '', spec: '', unit: '個', safety_stock: 0, image: null, previewUrl: '' });
      if (fileInputRef.current) fileInputRef.current.value = ''; // 徹底清除檔案選擇器
      setFormKey(prev => prev + 1); // 強制重置整個表單區塊元件
    } else {
      alert('建檔失敗：' + res.error);
    }
  };

  const openPreview = (url) => {
    if (!url) return;
    setPreviewImage(url);
    setModalOpen(true);
  };

  return (
    <div className="assets-container">
      <div className="card-surface">
        <h1 className="page-title">耗材建檔 (Consumables Registration)</h1>

        <div key={formKey} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          {/* 左側：表單 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 500 }}>類型 (Type) *</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select name="type" value={formData.type} onChange={handleChange} style={{ flex: 1, padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }}>
                  {types.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <button 
                  onClick={() => { setShowAddType(!showAddType); setShowManageType(false); }}
                  style={{ padding: '0 12px', backgroundColor: '#f0f0f0', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer' }}
                  title="新增類型"
                >
                  <Plus size={18} />
                </button>
                <button 
                  onClick={() => { setShowManageType(!showManageType); setShowAddType(false); }}
                  style={{ padding: '0 12px', backgroundColor: '#f0f0f0', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer' }}
                  title="管理類型"
                >
                  <Settings2 size={18} />
                </button>
              </div>
              
              {showAddType && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px', backgroundColor: '#fffbe6', padding: '8px', borderRadius: '4px', border: '1px solid #ffe58f' }}>
                  <input 
                    type="text" 
                    placeholder="輸入新類型名稱" 
                    value={newTypeName} 
                    onChange={(e) => setNewTypeName(e.target.value)}
                    style={{ flex: 1, padding: '6px', border: '1px solid #ccc', borderRadius: '4px' }}
                  />
                  <button 
                    onClick={handleAddType}
                    style={{ padding: '4px 12px', backgroundColor: '#faad14', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}
                  >
                    新增
                  </button>
                </div>
              )}
              {showManageType && (
                <div style={{ marginTop: '4px', backgroundColor: '#f9f9f9', padding: '8px', borderRadius: '4px', border: '1px solid #eee', maxHeight: '150px', overflowY: 'auto' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', borderBottom: '1px solid #eee', paddingBottom: '4px' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>管理類型清單</span>
                    <X size={14} style={{ cursor: 'pointer' }} onClick={() => setShowManageType(false)} />
                  </div>
                  {types.map(t => (
                    <div key={t} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: '0.85rem' }}>
                      <span>{t}</span>
                      <Trash2 size={14} color="#ff4d4f" style={{ cursor: 'pointer' }} onClick={() => handleDeleteType(t)} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 500 }}>廠牌 (Brand) *</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select name="brand" value={formData.brand} onChange={handleChange} style={{ flex: 1, padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }}>
                  {brands.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
                <button 
                  onClick={() => { setShowAddBrand(!showAddBrand); setShowManageBrand(false); }}
                  style={{ padding: '0 12px', backgroundColor: '#f0f0f0', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer' }}
                  title="新增廠牌"
                >
                  <Plus size={18} />
                </button>
                <button 
                  onClick={() => { setShowManageBrand(!showManageBrand); setShowAddBrand(false); }}
                  style={{ padding: '0 12px', backgroundColor: '#f0f0f0', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer' }}
                  title="管理廠牌"
                >
                  <Settings2 size={18} />
                </button>
              </div>
              {showAddBrand && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px', backgroundColor: '#e6f7ff', padding: '8px', borderRadius: '4px', border: '1px solid #91d5ff' }}>
                  <input 
                    type="text" 
                    placeholder="輸入新廠牌名稱" 
                    value={newBrandName} 
                    onChange={(e) => setNewBrandName(e.target.value)}
                    style={{ flex: 1, padding: '6px', border: '1px solid #ccc', borderRadius: '4px' }}
                  />
                  <button 
                    onClick={handleAddBrand}
                    style={{ padding: '4px 12px', backgroundColor: '#1890ff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}
                  >
                    新增
                  </button>
                </div>
              )}
              {showManageBrand && (
                <div style={{ marginTop: '4px', backgroundColor: '#f9f9f9', padding: '8px', borderRadius: '4px', border: '1px solid #eee', maxHeight: '150px', overflowY: 'auto' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', borderBottom: '1px solid #eee', paddingBottom: '4px' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>管理廠牌清單</span>
                    <X size={14} style={{ cursor: 'pointer' }} onClick={() => setShowManageBrand(false)} />
                  </div>
                  {brands.map(b => (
                    <div key={b} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: '0.85rem' }}>
                      <span>{b}</span>
                      <Trash2 size={14} color="#ff4d4f" style={{ cursor: 'pointer' }} onClick={() => handleDeleteBrand(b)} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 500 }}>規格 (Specification)</label>
              <textarea name="spec" value={formData.spec} onChange={handleChange} style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc', minHeight: '80px', resize: 'vertical' }} placeholder="請輸入詳細規格，例如：藍色、大容量、5% 覆蓋率等" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontWeight: 500 }}>單位 (Unit)</label>
                <select name="unit" value={formData.unit} onChange={handleChange} style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }}>
                  {UNIFIED_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontWeight: 500 }}>安全庫存水位</label>
                <input type="number" name="safety_stock" value={formData.safety_stock} onChange={handleChange} style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }} />
              </div>
            </div>


            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontWeight: 500 }}>耗材圖片上傳</label>
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
                  <input 
                    ref={fileInputRef}
                    type="file" 
                    accept="image/*" 
                    onChange={handleImageChange} 
                    style={{ display: 'none' }} 
                  />
                </label>
                {formData.previewUrl && (
                  <img src={formData.previewUrl} alt="preview" style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer' }} onClick={() => openPreview(formData.previewUrl)} />
                )}
              </div>
            </div>

            <button
              onClick={handleAddConsumable}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                padding: '12px', marginTop: '16px', backgroundColor: 'var(--primary-color)',
                color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600
              }}
            >
              <Save size={18} />
              儲存耗材
            </button>
          </div>

          {/* 右側：列表 */}
          <div>
            <h3 style={{ marginBottom: '16px', color: 'var(--text-main)' }}>已建檔耗材列表</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {items.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', padding: '12px', border: '1px solid #eee', borderRadius: '8px', backgroundColor: '#fafafa' }}>
                  <div
                    onClick={() => openPreview(item.image_path ? window.getMediaUrl(`erp-media:///${item.image_path}`) : null)}
                    style={{
                      width: '48px', height: '48px', borderRadius: '6px', backgroundColor: '#e0e0e0',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: '16px',
                      cursor: item.image_path ? 'pointer' : 'default', overflow: 'hidden'
                    }}
                  >
                    {item.image_path ? (
                      <img src={window.getMediaUrl(`erp-media:///${item.image_path}`)} alt={item.brand} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <ImageIcon color="#aaa" />
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{item.brand || '未指定廠牌'}</div>
                    <div style={{ color: 'var(--text-main)', fontSize: '0.94rem', fontWeight: 500 }}>
                      {item.specification.replace(`${item.type} ${item.brand}`, '').trim().replace(/^\(|\)$/g, '') || '無詳細規格'}
                    </div>
                    <div style={{ color: '#666', fontSize: '0.8rem', marginTop: '4px' }}>
                      <span style={{ backgroundColor: '#f0f0f0', padding: '2px 6px', borderRadius: '4px' }}>{item.type}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                    <div>單位: {item.unit}</div>
                    <div>預警: {item.safety_stock}</div>
                  </div>
                </div>
              ))}
              {items.length === 0 && <p style={{ color: '#aaa', textAlign: 'center', marginTop: '20px' }}>尚無耗材</p>}
            </div>
          </div>
        </div>
      </div>

      <ImageModal isOpen={modalOpen} imageUrl={previewImage} onClose={() => setModalOpen(false)} />
    </div>
  );
};

export default Consumables;
