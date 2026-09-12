import React, { useState, useEffect, useCallback, useContext } from 'react';
import { Plus, Search, FileText, ShoppingCart, CheckCircle, Clock, AlertCircle, Trash2, DollarSign, Package, Tag, Filter, X, Save, Settings2, Trash } from 'lucide-react';
import PurchaseItemSelectModal from '../components/PurchaseItemSelectModal';
import { RoleContext } from '../context/RoleContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { logCreate, logUpdate } from '../utils/auditLogger';

const ProcurementRegistration = ({ editMode = false, isModalMode = false, initOrderNo = null, onClose = null, isSplitMode = false }) => {
  const { authUser } = useContext(RoleContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [purchaseRecords, setPurchaseRecords] = useState([]);
  const [partners, setPartners] = useState([]);
  const [categories, setCategories] = useState([]);
  
  // Options state for selects
  const [options, setOptions] = useState({
    types: {},
    brands: {},
    models: {}
  });

  const [loading, setLoading] = useState(true);

  // PO Header states
  const [orderNo, setOrderNo] = useState('');
  const [remarks, setRemarks] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [previewFile, setPreviewFile] = useState(null);

  // Items in this PO
  const [items, setItems] = useState([
    { id: 'initial-row', category_id: '', partner_id: '', item_type: '', brand: '', model: '', specification: '', unit: '個', unit_price: '', quantity: 1 }
  ]);

  // 品項庫挑選彈窗狀態
  const [availableItems, setAvailableItems] = useState([]);
  const [showItemModal, setShowItemModal] = useState(false);
  const [replaceRowId, setReplaceRowId] = useState(null);

  // Quick Add UI states
  const [quickAdd, setQuickAdd] = useState({ show: false, type: '', rowId: null, catId: null });
  const [newName, setNewName] = useState('');

  const fetchOptions = useCallback(async (catId) => {
    if (!catId) return;
    const [brandsRes, typesRes, modelsRes] = await Promise.all([
      window.electronAPI.namedQuery("fetchBrandsByCategory", [catId]),
      window.electronAPI.namedQuery("fetchTypesByCategory", [catId]),
      window.electronAPI.namedQuery("fetchModelsByCategory", [catId])
    ]);
    
    setOptions(prev => ({
      ...prev,
      brands: { ...prev.brands, [catId]: brandsRes.success ? brandsRes.rows.map(r => r.name) : [] },
      types: { ...prev.types, [catId]: typesRes.success ? typesRes.rows : [] },
      models: { ...prev.models, [catId]: modelsRes.success ? modelsRes.rows : [] }
    }));
  }, []);

  const fetchData = useCallback(async (forceNewOrderNo = false) => {
    setLoading(true);
    try {
      const [recordsRes, partnersRes, catsRes, itemsRes] = await Promise.all([
        window.electronAPI.namedQuery('fetchPurchasingRecords'),
        window.electronAPI.namedQuery('fetchSuppliers'),
        window.electronAPI.namedQuery('fetchCategories'),
        window.electronAPI.namedQuery('fetchInboundItemMaster')
      ]);

      if (recordsRes.success) setPurchaseRecords(recordsRes.rows);
      if (partnersRes.success) setPartners(partnersRes.rows);
      if (itemsRes && itemsRes.success) setAvailableItems(itemsRes.rows);
      if (catsRes.success) {
        setCategories(catsRes.rows);
        for (const cat of catsRes.rows) {
          await fetchOptions(cat.id);
        }
        
        if (editMode && initOrderNo) {
          setOrderNo(initOrderNo);
          const detailRes = await window.electronAPI.namedQuery('fetchPurchaseRecordsByOrder', [initOrderNo]);
          if (detailRes.success && detailRes.rows.length > 0) {
           setRemarks(detailRes.rows[0].remarks || '');
           const existingAtt = detailRes.rows[0].attachments;
           setAttachments(Array.isArray(existingAtt) ? existingAtt : (existingAtt ? JSON.parse(existingAtt) : []));
             setItems(detailRes.rows.map(r => ({
               id: r.id, 
               category_id: r.category_id.toString(),
               partner_id: r.partner_id ? r.partner_id.toString() : '',
               item_type: r.item_type || '',
               brand: r.brand || '',
               model: r.model || '',
               specification: r.specification || '',
               unit: r.unit || '個',
               quantity: r.quantity,
               status: r.status
             })));
          }
        } else {
          // Generate initial PO status if empty
          const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
          const poCountRes = await window.electronAPI.namedQuery(
            "countPurchaseOrders",
            [`PO-${today}-`]
          );
          const nextNum = poCountRes.success ? Number(poCountRes.rows[0].count) : 1;
          const paddedNum = nextNum.toString().padStart(2, '0');
          
          if (forceNewOrderNo) {
            setOrderNo(`PO-${today}-${paddedNum}`);
          } else {
            setOrderNo(prev => prev || `PO-${today}-${paddedNum}`);
          }
  
          const prefill = location.state?.prefillItem;
          // Only init items if they are empty
          setItems(prev => {
            if (prefill) {
              const csmCat = catsRes.rows.find(c => c.name === '耗材') || catsRes.rows[0];
              return [{ 
                id: Date.now(), 
                category_id: csmCat ? csmCat.id.toString() : (catsRes.rows[0]?.id.toString() || ''), 
                partner_id: '', 
                item_type: prefill.type || '', 
                brand: prefill.brand || '', 
                model: prefill.model || '', 
                specification: prefill.specification || '', 
                unit: prefill.unit || '個', 
                quantity: prefill.quantity || 1 
              }];
            }
            if (prev.length === 0 || (prev.length === 1 && !prev[0].specification)) {
               return [{ id: Date.now(), category_id: catsRes.rows[0].id.toString(), partner_id: '', item_type: '', brand: '', model: '', specification: '', unit: '個', quantity: 1 }];
            }
            return prev;
          });
        }
      }
    } catch (err) {
      console.error("Fetch Data Error:", err);
    } finally {
      setLoading(false);
    }
  }, [fetchOptions]);

  useEffect(() => {
    Promise.resolve().then(() => {
      fetchData();
    });
  }, [fetchData]);

  const handleAddItem = () => {
    const lastItem = items[items.length - 1];
    setItems([
      ...items,
      { 
        id: Date.now(), 
        category_id: lastItem?.category_id || categories[0]?.id.toString() || '', 
        partner_id: lastItem?.partner_id || '',
        item_type: '', 
        brand: '', 
        model: '', 
        specification: '', 
        unit: '個', 
        quantity: 1 
      }
    ]);
  };

  const handleBatchAddItems = (selectedList) => {
    if (!selectedList || selectedList.length === 0) return;

    setItems((prevItems) => {
      // 若當前只有一筆初始空白列，則替換之；否則追加
      const isInitialEmpty = prevItems.length === 1 && !prevItems[0].model && !prevItems[0].specification && !prevItems[0].brand;
      const baseItems = isInitialEmpty ? [] : [...prevItems];

      const newRows = selectedList.map((item, idx) => {
        const catObj = categories.find(c => c.name === item.cat_name) || categories[0];
        return {
          id: Date.now() + idx,
          category_id: (item.category_id || catObj?.id || '').toString(),
          partner_id: '',
          item_type: item.type || '',
          brand: item.brand || '',
          model: item.model || '',
          specification: item.specification || '',
          unit: item.unit || '個',
          quantity: item.quantity || 1
        };
      });

      return [...baseItems, ...newRows];
    });
  };

  const handleSingleAddItem = (item, quantity) => {
    if (replaceRowId) {
      // 替換現有列
      const catObj = categories.find(c => c.name === item.cat_name) || categories[0];
      setItems((prevItems) => prevItems.map((r) => r.id === replaceRowId ? {
        ...r,
        category_id: (item.category_id || catObj?.id || r.category_id || '').toString(),
        item_type: item.type || '',
        brand: item.brand || '',
        model: item.model || '',
        specification: item.specification || '',
        unit: item.unit || r.unit || '個',
        quantity: quantity || r.quantity || 1
      } : r));
      setReplaceRowId(null);
    } else {
      handleBatchAddItems([{ ...item, quantity }]);
    }
  };

  const handleRemoveItem = (id) => {
    if (items.length === 1) {
      setItems([{
        id: Date.now(),
        category_id: categories[0]?.id?.toString() || '',
        partner_id: '',
        item_type: '',
        brand: '',
        model: '',
        specification: '',
        unit: '個',
        quantity: 1
      }]);
      return;
    }
    setItems(items.filter(item => item.id !== id));
  };

  const handleClearItem = (rowId) => {
    setItems(items.map(row => row.id === rowId ? {
      ...row,
      brand: '',
      model: '',
      item_type: '',
      specification: '',
      unit: '個'
    } : row));
  };

  const handleItemChange = (id, field, value) => {
    setItems(items.map(item => {
      if (item.id === id) {
        if (field === 'category_id') {
          return { ...item, [field]: value, item_type: '', brand: '', model: '', specification: '' };
        }
        if (field === 'brand') {
          return { ...item, brand: value, item_type: '', model: '' };
        }
        if (field === 'item_type') {
          return { ...item, item_type: value, model: '' };
        }
        if (field === 'model' && value !== '') {
          // Auto-fill from model data or availableItems
          const catModels = options.models[item.category_id] || [];
          let selectedModel = catModels.find(m => m.model === value);
          if (!selectedModel) {
            selectedModel = availableItems.find(i => i.model === value);
          }
          if (selectedModel) {
            return { 
              ...item, 
              model: value, 
              item_type: selectedModel.type || item.item_type || '', 
              brand: selectedModel.brand || item.brand || '', 
              specification: selectedModel.specification || '',
              unit: selectedModel.unit || item.unit || '個'
            };
          }
        }
        return { ...item, [field]: value };
      }
      return item;
    }));
  };

  const openQuickAdd = (rowId, catId, type) => {
    setQuickAdd({ show: true, type, rowId, catId });
    setNewName('');
  };

  const handleQuickAddSave = async () => {
    if (!newName.trim()) return;
    const queryName = quickAdd.type === 'type' ? 'insertItemType' : 'insertItemBrand';
    const res = await window.electronAPI.namedQuery(
      queryName,
      [quickAdd.catId, newName.trim()]
    );

    if (res.success) {
      await fetchOptions(quickAdd.catId);
      handleItemChange(quickAdd.rowId, quickAdd.type === 'type' ? 'item_type' : 'brand', newName.trim());
      setQuickAdd({ show: false, type: '', rowId: null, catId: null });
    } else {
      alert('新增失敗：' + res.error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (items.some(i => !i.category_id || String(i.quantity).trim() === '' || Number(i.quantity) <= 0)) {
      return alert('請填寫完整的品項資訊且數量需大於0');
    }

    setLoading(true);
    try {
      const attachmentsJson = JSON.stringify(attachments);
      if (editMode && initOrderNo) {
         const existRes = await window.electronAPI.namedQuery('fetchPurchaseRecordsByOrder', [initOrderNo]);
         if (!existRes.success) throw new Error('獲取原始訂單失敗');
         
         const existingIds = existRes.rows.map(r => r.id);
         const existingById = new Map(existRes.rows.map(r => [r.id, r]));
         const currentIds = items.map(i => i.id).filter(id => id < 1000000000000); 
         const removedIds = existingIds.filter(exId => !currentIds.includes(exId));

         // 已到貨的明細不得經編輯流程移除，否則 inbound_items.purchase_record_id 會失去對應；
         // 先全數檢查再執行刪除，避免中途失敗留下半套資料
         for (const exId of removedIds) {
           const exRow = existingById.get(exId);
           const receivedQty = Number(exRow?.received_quantity || 0);
           if (receivedQty > 0) {
             const specLabel = [exRow.brand, exRow.model, exRow.specification].filter(Boolean).join(' ') || '未命名項目';
             throw new Error(`採購明細 [${specLabel}] 已到貨 ${receivedQty} 件，無法移除；如需終止未交貨數量請改以結案或註記處理。`);
           }
         }

         // 刪除、新增、更新併為單一交易：任一步失敗即全部回滾，
         // 避免出現「舊明細已刪但新明細沒寫進去」這類半套結果。
         const steps = [];
         for (const exId of removedIds) {
           steps.push({ id: `del_${exId}`, queryName: 'deletePurchaseRecordById', params: [exId] });
         }
         for (const item of items) {
           if (item.id > 1000000000000) {
             steps.push({
               queryName: 'insertPurchaseRecord',
               params: [initOrderNo, item.partner_id ? parseInt(item.partner_id) : null, parseInt(item.category_id), item.item_type, item.brand, item.model, item.specification || null, item.unit, parseInt(item.quantity), authUser?.id, 'ORDERED', remarks, null, attachmentsJson],
             });
           } else {
             steps.push({
               queryName: 'updatePurchaseRecordFull',
               params: [item.partner_id ? parseInt(item.partner_id) : null, parseInt(item.category_id), item.item_type, item.brand, item.model, item.specification || null, item.unit, parseInt(item.quantity), remarks, null, attachmentsJson, item.id],
             });
           }
         }

         const txRes = await window.electronAPI.runTransaction(steps);
         if (!txRes.success) throw new Error(`修改失敗，所有變更已取消：${txRes.error || '未知錯誤'}`);

         // 刪除步驟若沒有實際刪到列，代表該明細在此期間已產生到貨紀錄（由伺服器端守衛擋下）
         for (const exId of removedIds) {
           const delOutcome = txRes.results?.[`del_${exId}`];
           if (!delOutcome || !delOutcome.rows || delOutcome.rows.length === 0) {
             throw new Error('移除採購明細失敗：該明細已有到貨紀錄，請重新整理後再試。');
           }
         }
         logUpdate(
           'PURCHASE',
           initOrderNo,
           '採購單',
           `修改採購單 [${initOrderNo}] 共 ${items.length} 個品項`,
           { orderNo: initOrderNo, itemsCount: items.length, items: items.map(i => ({ model: i.model, brand: i.brand, qty: i.quantity })), remarks }
         );
         alert('採購單修改成功！');
         if (onClose) onClose();
      } else {
         // 整張採購單的所有品項併為單一交易，避免只寫入一半的品項
         const createSteps = items.map((item) => ({
           queryName: 'insertPurchaseRecord',
           params: [
             orderNo, item.partner_id ? parseInt(item.partner_id) : null, item.category_id, item.item_type, item.brand, item.model,
             item.specification || null, item.unit, item.quantity, authUser?.id, 'ORDERED', remarks, null, attachmentsJson,
           ],
         }));
         const createRes = await window.electronAPI.runTransaction(createSteps);
         if (!createRes.success) throw new Error(`儲存失敗，所有變更已取消：${createRes.error || '未知錯誤'}`);
         logCreate(
           'PURCHASE',
           orderNo,
           '採購單',
           `建立採購單 [${orderNo}] 共 ${items.length} 個品項`,
           { orderNo, itemsCount: items.length, items: items.map(i => ({ model: i.model, brand: i.brand, qty: i.quantity })), remarks }
         );
         alert('採購建檔成功！');
         setRemarks('');
         setItems([]); 
         await fetchData(true);
         if (onClose) onClose();
      }
    } catch (err) {
      console.error("Submit Error:", err);
      alert('儲存失敗：' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const statusColors = {
    'ORDERED': { bg: '#e3f2fd', color: '#1976d2', label: '已下單' },
    'PARTIAL': { bg: '#fff3e0', color: '#e65100', label: '部分入庫' },
    'COMPLETED': { bg: '#e8f5e9', color: '#2e7d32', label: '結案' }
  };

  const UNIFIED_UNITS = ['個', '台', '盒', '包', '支', '組', '瓶', '卷', '張', '份'];

  const handleFileUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setLoading(true);
    try {
      const newAttachments = [...attachments];
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
      setAttachments(newAttachments);
    } catch (err) {
      console.error(err);
      alert('上傳發生錯誤');
    } finally {
      setLoading(false);
      e.target.value = ''; // clear input
    }
  };

  const removeAttachment = (index) => {
    const newAtt = [...attachments];
    newAtt.splice(index, 1);
    setAttachments(newAtt);
  };

  const getMediaSrc = (fileName) => {
    const rawUrl = `erp-media:///${encodeURIComponent(fileName)}`;
    return window.getMediaUrl ? window.getMediaUrl(rawUrl) : rawUrl;
  };

  const containerStyle = editMode ? { padding: 0 } : {
    padding: isSplitMode ? '0' : 'var(--content-padding, 16px)',
    backgroundColor: isSplitMode ? 'transparent' : 'var(--bg-app)',
    minHeight: isSplitMode ? 'auto' : 'calc(100vh - var(--topbar-height, 56px) - 40px)',
    display: 'flex',
    flexDirection: isSplitMode ? 'column' : 'row',
    gap: 'var(--spacing-md, 16px)'
  };
  const leftSectionStyle = editMode ? { width: '100%' } : (isSplitMode ? { width: '100%' } : { flex: '0 0 60%' });
  const rightSectionStyle = isSplitMode ? { width: '100%' } : { flex: '1' };
  const cardStyle = editMode ? {} : {
    backgroundColor: 'var(--bg-surface)',
    borderRadius: '12px',
    padding: 'var(--card-padding, 16px)',
    boxShadow: 'var(--card-shadow)',
    border: '1px solid var(--border-color)',
    marginBottom: isSplitMode ? '0' : 'var(--spacing-md, 16px)',
    color: 'var(--text-main)'
  };

  return (
    <div style={containerStyle}>
      <div style={leftSectionStyle}>
        <div style={cardStyle}>
          {!editMode && !isModalMode && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h1 style={{ fontSize: '24px', fontWeight: '900', margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-main)' }}>
                  <ShoppingCart size={26} color="var(--primary-color)" /> 採購建檔(Purchase Order Registration )
                </h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px', marginBottom: 0 }}>建立與申請新的採購單，設定專案與供應商訂購細節。</p>
              </div>
              {!isSplitMode && (
                <div style={{ display: 'flex', backgroundColor: 'var(--bg-surface-subtle)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                  <button style={{ padding: '6px 14px', backgroundColor: 'var(--bg-surface)', color: 'var(--primary-color)', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '800', boxShadow: 'var(--card-shadow)', cursor: 'default' }}>
                    📝 建檔
                  </button>
                  <button onClick={() => navigate('/procurement-split')} style={{ padding: '6px 14px', backgroundColor: 'transparent', color: 'var(--text-muted)', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s' }}>
                    ◫ 雙開
                  </button>
                  <button onClick={() => navigate('/procurement-list')} style={{ padding: '6px 14px', backgroundColor: 'transparent', color: 'var(--text-muted)', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s' }}>
                    📋 清單
                  </button>
                </div>
              )}
            </div>
          )}

        <form onSubmit={handleSubmit}>
          {/* Header Section */}
          <div className="card-surface" style={{ backgroundColor: 'var(--bg-surface-subtle)', marginBottom: '24px', padding: '24px', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px', marginBottom: '16px' }}>
              <div>
                <label style={labelStyle}>採購單號 (PO No.)</label>
                <input value={orderNo} readOnly style={{ ...inputStyle, backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-muted)', fontWeight: 'bold' }} />
              </div>
              <div>
                <label style={labelStyle}>採購人員 (Purchaser)</label>
                <input disabled value={authUser?.full_name || '--'} style={{ ...inputStyle, backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-muted)' }} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>採購備註 (PO Remarks)</label>
              <textarea 
                value={remarks} 
                onChange={e => setRemarks(e.target.value)} 
                placeholder="請輸入此採購案的備註說明（選填）..."
                style={{ ...inputStyle, minHeight: '40px', height: '40px', resize: 'none' }}
              />
            </div>
            <div style={{ marginTop: '16px' }}>
              <label style={labelStyle}>相關附件 (報價單、規格書等)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <label style={{ 
                  padding: '8px 16px', backgroundColor: 'var(--primary-color)', color: '#fff', 
                  borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' 
                }}>
                  上傳檔案
                  <input type="file" multiple onChange={handleFileUpload} style={{ display: 'none' }} accept="image/png, image/jpeg, application/pdf" />
                </label>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>支援 PNG, JPG, PDF (可直接點擊檢視)</span>
              </div>
              {attachments.length > 0 && (
                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {attachments.map((file, idx) => (
                    <div key={idx} style={{ 
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                      backgroundColor: 'var(--bg-surface)', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-color)' 
                    }}>
                      <div 
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--primary-color)' }}
                        onClick={() => setPreviewFile(file)}
                      >
                        <FileText size={16} />
                        <span style={{ fontSize: '13px', fontWeight: 600 }}>{file.originalName}</span>
                      </div>
                      <button type="button" onClick={() => removeAttachment(idx)} style={{ background: 'none', border: 'none', color: '#ff4d4f', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Items Section */}
          <div className="card-surface" style={{ padding: '0', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--table-header-bg)', textAlign: 'left' }}>
                  <th style={thStyle}>採購品項項目</th>
                  <th style={{ ...thStyle, width: '90px' }}>類別</th>
                  <th style={{ ...thStyle, width: '180px' }}>供應商</th>
                  <th style={{ ...thStyle, width: '110px' }}>數量</th>
                  <th style={{ ...thStyle, width: '60px', textAlign: 'center' }}>移除</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const isReadonly = row.status && row.status !== 'ORDERED';
                  const hasItem = !!(row.model || row.specification || row.brand);
                  const catObj = categories.find(c => c.id?.toString() === row.category_id?.toString());
                  const catName = catObj?.name || row.cat_name || '';

                  return (
                    <tr key={row.id} style={{ borderBottom: '1px solid var(--table-border)' }}>
                      {/* 採購品項項目 (與進貨單一致之卡片/選取按鈕) */}
                      <td style={tdStyle}>
                        {hasItem ? (
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            backgroundColor: 'rgba(37, 99, 235, 0.08)',
                            border: '1px solid rgba(37, 99, 235, 0.3)',
                            gap: '8px'
                          }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span>{[row.brand, row.model].filter(Boolean).join(' ') || '(未指定型號)'}</span>
                                {row.item_type && (
                                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
                                    ({row.item_type})
                                  </span>
                                )}
                              </div>
                              {row.specification && (
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }} title={row.specification}>
                                  {row.specification}
                                </div>
                              )}
                            </div>
                            {!isReadonly && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReplaceRowId(row.id);
                                    setShowItemModal(true);
                                  }}
                                  style={{
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--border-color)',
                                    backgroundColor: 'var(--bg-surface)',
                                    color: 'var(--primary-color)',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                  }}
                                  title="重新選擇品項"
                                  data-testid={`change-item-btn-${row.id}`}
                                >
                                  更換
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleClearItem(row.id)}
                                  style={{
                                    padding: '4px 6px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    backgroundColor: 'transparent',
                                    color: '#ef4444',
                                    fontSize: '14px',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                  }}
                                  title="清除品項"
                                  data-testid={`clear-item-btn-${row.id}`}
                                >
                                  ×
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setReplaceRowId(row.id);
                              setShowItemModal(true);
                            }}
                            style={{
                              width: '100%',
                              padding: '10px 14px',
                              borderRadius: '8px',
                              border: '1.5px dashed var(--primary-color)',
                              backgroundColor: 'rgba(37, 99, 235, 0.04)',
                              color: 'var(--primary-color)',
                              fontSize: '13px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '8px',
                              transition: 'all 0.15s ease'
                            }}
                            data-testid={`open-purchase-item-btn-${row.id}`}
                          >
                            <Search size={15} /> 🔍 點擊選取採購品項...
                          </button>
                        )}
                      </td>

                      {/* 類別徽章 */}
                      <td style={tdStyle}>
                        {catName ? (
                          <span style={{ padding: '4px 10px', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '6px', fontSize: '0.8rem', color: 'var(--text-main)', border: '1px solid var(--border-color)', fontWeight: 600 }}>
                            {catName}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-subtle)', fontSize: '0.8rem' }}>--</span>
                        )}
                      </td>

                      {/* 供應商下拉選單 */}
                      <td style={tdStyle}>
                        <select 
                          value={row.partner_id || ''} 
                          onChange={e => handleItemChange(row.id, 'partner_id', e.target.value)}
                          style={inputStyle}
                          disabled={isReadonly}
                        >
                          <option value="">(選填供應商)</option>
                          {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </td>

                      {/* 數量 */}
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <input 
                            type="number" 
                            value={row.quantity} 
                            onChange={e => handleItemChange(row.id, 'quantity', e.target.value)}
                            style={{ ...inputStyle, width: '65px', textAlign: 'center' }}
                            min="1"
                            disabled={isReadonly}
                          />
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{row.unit || '個'}</span>
                        </div>
                      </td>

                      {/* 移除 */}
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {!isReadonly ? (
                          <button 
                            type="button" 
                            onClick={() => handleRemoveItem(row.id)} 
                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', padding: '6px', opacity: 0.8 }} 
                            title="刪除此項"
                          >
                            <Trash2 size={18} />
                          </button>
                        ) : (
                          <span style={{ fontSize: '0.7rem', color: '#ccc', display: 'block', lineHeight: 1.2 }}>已入庫<br/>鎖定</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            
            <div style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-surface-subtle)', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <button 
                  type="button" 
                  onClick={() => {
                    setReplaceRowId(null);
                    setShowItemModal(true);
                  }}
                  style={{ 
                    display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 18px', 
                    backgroundColor: 'var(--primary-color)', color: '#ffffff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 800, fontSize: '13px',
                    boxShadow: '0 4px 10px rgba(37, 99, 235, 0.25)'
                  }}
                  data-testid="open-purchase-item-modal-btn"
                >
                  <Package size={16} /> 📦 從品項庫挑選 (可批次勾選加入)
                </button>
                <button 
                  type="button" 
                  onClick={handleAddItem} 
                  style={{ 
                    display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', 
                    backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, color: 'var(--text-main)', fontSize: '13px'
                  }}
                  data-testid="add-blank-row-btn"
                >
                  <Plus size={16} /> 新增空白列
                </button>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--primary-color)' }}>
                  採購品項: {items.length} 筆
                </span>
              </div>
            </div>
          </div>

          <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '16px' }}>
            {editMode ? (
              <>
                <button type="button" onClick={onClose} style={{ 
                  padding: '14px 32px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '10px', fontWeight: 600, cursor: 'pointer' 
                }}>取消編輯</button>
                <button type="submit" disabled={loading} className="btn-primary" style={{ 
                  padding: '14px 48px', borderRadius: '10px', fontSize: '1.1rem', fontWeight: 700, boxShadow: '0 4px 12px rgba(27, 54, 93, 0.2)'
                }}>
                  {loading ? '儲存中...' : '儲存修改'}
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => fetchData(false)} style={{ 
                  padding: '14px 32px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '10px', fontWeight: 600, cursor: 'pointer' 
                }}>取消並重設</button>
                <button type="submit" disabled={loading} className="btn-primary" style={{ 
                  padding: '14px 48px', borderRadius: '10px', fontSize: '1.1rem', fontWeight: 700, boxShadow: '0 4px 12px rgba(27, 54, 93, 0.2)'
                }}>
                  {loading ? '儲存中...' : '確認提交採購單'}
                </button>
              </>
            )}
          </div>
        </form>
        </div>
      </div>

      {!editMode && (
        <div style={rightSectionStyle}>
          <div style={cardStyle}>
            <h3 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)' }}>
              <Clock size={18} color="var(--text-muted)" /> 最新 10 筆建檔記錄
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {loading && purchaseRecords.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>載入中...</p>
              ) : purchaseRecords.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>尚無採購紀錄</p>
              ) : (
                purchaseRecords.map(record => (
                  <div key={record.id} style={{ padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface-subtle)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 700, color: 'var(--primary-color)', fontSize: '13px' }}>{record.order_no}</span>
                      <span style={{ 
                        padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                        backgroundColor: statusColors[record.status]?.bg, color: statusColors[record.status]?.color
                      }}>{statusColors[record.status]?.label}</span>
                    </div>
                    <div style={{ fontWeight: '800', fontSize: '13px', color: 'var(--text-main)', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {record.specification}
                      {record.model && <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500, marginLeft: '6px' }}>({record.model})</span>}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                      <span style={{ color: 'var(--text-subtle)' }}>{record.partner_name}</span> · 
                      <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{record.quantity}</span>
                    </div>
                    {record.project_name && (
                      <div style={{ marginBottom: '4px', fontSize: '12px', color: 'var(--primary-color)', fontWeight: 600 }}>
                        專案: {record.project_name}
                      </div>
                    )}
                    {record.remarks && (
                      <div style={{ marginBottom: '8px', padding: '4px 8px', backgroundColor: 'var(--bg-surface)', borderRadius: '4px', fontSize: '11px', color: 'var(--text-muted)', borderLeft: '3px solid var(--primary-color)' }}>
                        備註: {record.remarks}
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-subtle)', borderTop: '1px solid var(--border-color)', paddingTop: '8px' }}>
                      <span>採購人: {record.purchaser_name || '--'}</span>
                      <span>{new Date(record.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick Add Popover/Modal */}
      {quickAdd.show && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'var(--bg-modal-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '16px', boxShadow: 'var(--modal-shadow)', width: '360px', padding: '24px' }}>
            <h3 style={{ marginBottom: '16px', color: 'var(--text-main)' }}>新增{quickAdd.type === 'type' ? '類型' : '廠牌'}</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px' }}>類別: {categories.find(c => c.id.toString() === quickAdd.catId.toString())?.name}</p>
            <input 
              autoFocus
              value={newName} 
              onChange={e => setNewName(e.target.value)} 
              placeholder="輸入名稱..." 
              style={{ ...inputStyle, marginBottom: '20px' }}
              onKeyDown={e => e.key === 'Enter' && handleQuickAddSave()}
            />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setQuickAdd({ show: false, type: '', rowId: null, catId: null })} style={{ padding: '8px 16px', border: '1px solid var(--border-color)', borderRadius: '6px', background: 'var(--bg-surface)', color: 'var(--text-main)', cursor: 'pointer' }}>取消</button>
              <button onClick={handleQuickAddSave} style={{ padding: '8px 24px', backgroundColor: 'var(--primary-color)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>儲存</button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewFile && (
        <div style={{ 
          position: 'fixed', inset: 0, backgroundColor: 'var(--bg-modal-overlay)', 
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: '24px', backdropFilter: 'blur(5px)' 
        }}>
          <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-main)', width: '80vw', height: '80vh', borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: 'var(--modal-shadow)' }}>
            <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--text-main)' }}>{previewFile.originalName}</h3>
              <button onClick={() => setPreviewFile(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={24} /></button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-surface-subtle)' }}>
              {previewFile.type === 'application/pdf' ? (
                <iframe 
                  src={getMediaSrc(previewFile.fileName)} 
                  style={{ width: '100%', height: '100%', border: 'none' }} 
                  title="PDF Preview"
                />
              ) : (
                <img 
                  src={getMediaSrc(previewFile.fileName)} 
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} 
                  alt="Preview"
                />
              )}
            </div>
          </div>
        </div>
      )}
      {/* 採購品項庫挑選視窗 */}
      <PurchaseItemSelectModal
        isOpen={showItemModal}
        onClose={() => {
          setShowItemModal(false);
          setReplaceRowId(null);
        }}
        items={availableItems}
        isSingleSelect={!!replaceRowId}
        onBatchAdd={handleBatchAddItems}
        onSingleAdd={handleSingleAddItem}
        onItemDeleted={(deletedId) => {
          setAvailableItems((prev) => prev.filter((i) => i.id !== deletedId));
        }}
        onOpenQuickAdd={() => {
          setQuickAdd({ show: true, type: 'type', rowId: null, catId: categories[0]?.id });
        }}
      />
    </div>
  );
};

const labelStyle = { display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px' };
const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--input-border)', fontSize: '0.95rem', outline: 'none', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', boxSizing: 'border-box' };
const thStyle = { padding: '12px 16px', borderBottom: '2px solid var(--border-color)', fontWeight: 600, color: 'var(--table-header-text)', backgroundColor: 'var(--table-header-bg)', fontSize: '0.85rem' };
const tdStyle = { padding: '12px 16px', verticalAlign: 'middle', borderBottom: '1px solid var(--table-border)', color: 'var(--text-main)' };
const smallIconButtonStyle = { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', backgroundColor: 'var(--bg-surface-subtle)', border: '1px solid var(--border-color)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text-main)' };

export default ProcurementRegistration; 
