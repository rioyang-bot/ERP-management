import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  X, Wrench, Search, Plus, Trash2, CheckCircle, AlertCircle, 
  Cpu, Monitor, Server, Calendar, Building2, FileText, User
} from 'lucide-react';
import { logStatusChange, logCreate } from '../utils/auditLogger';

const QUICK_STATUS_TAGS = [
  '取回 重灌OS',
  'CPU溫度過高 (水冷正常) 取回 RMA',
  '一直重開 -> 無法開機 (Power supply亮橘燈)',
  '無法過電',
  '網卡無法辨識 / 抓不到 Link',
  '開機無畫面 / 記憶體異常',
  '原廠風扇異音 / 故障'
];

const RepairOrderRegistrationModal = ({ isOpen, onClose, onSuccess }) => {
  const [repairNo, setRepairNo] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [onSiteDate, setOnSiteDate] = useState(new Date().toISOString().split('T')[0]);
  const [onSiteStatus, setOnSiteStatus] = useState('');
  const [remarks, setRemarks] = useState('');
  
  // 設備明細清單
  const [selectedItems, setSelectedItems] = useState([]);
  
  // 系統設備/硬體搜尋清單
  const [availableAssets, setAvailableAssets] = useState([]);
  const [assetSearchTerm, setAssetSearchTerm] = useState('');
  const [customerList, setCustomerList] = useState([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // 產生預設單號
  const generateRepairNo = () => {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(100 + Math.random() * 900);
    return `RMA-${today}-${rand}`;
  };

  // 載入系統資產與客戶
  const loadInitialData = useCallback(async () => {
    setIsLoadingAssets(true);
    try {
      try {
        await window.electronAPI.namedQuery('initRepairTables');
      } catch (e) {
        console.warn('initRepairTables notice:', e);
      }

      const [assetsRes, custRes] = await Promise.all([
        window.electronAPI.namedQuery('fetchAssetsForRepairSelection'),
        window.electronAPI.namedQuery('fetchCustomers')
      ]);

      if (assetsRes.success) {
        setAvailableAssets(assetsRes.rows || []);
      }
      if (custRes.success) {
        setCustomerList(custRes.rows || []);
      }
    } catch (err) {
      console.error('Failed to load assets for repair modal:', err);
    } finally {
      setIsLoadingAssets(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setRepairNo(generateRepairNo());
      setCustomerName('');
      setOnSiteDate(new Date().toISOString().split('T')[0]);
      setOnSiteStatus('');
      setRemarks('');
      setSelectedItems([]);
      setAssetSearchTerm('');
      setFormError('');
      loadInitialData();
    }
  }, [isOpen, loadInitialData]);

  // 過濾搜尋設備/硬體清冊
  const filteredAssets = availableAssets.filter(a => {
    const term = assetSearchTerm.toLowerCase().trim();
    if (!term) {
      // 若有選擇客戶，預設先列出該客戶的設備
      if (customerName) {
        return (a.client || '').toLowerCase().includes(customerName.toLowerCase());
      }
      return true;
    }
    const snMatch = (a.sn || '').toLowerCase().includes(term);
    const modelMatch = (a.model || '').toLowerCase().includes(term);
    const brandMatch = (a.brand || '').toLowerCase().includes(term);
    const clientMatch = (a.client || '').toLowerCase().includes(term);
    const hostMatch = (a.hostname || '').toLowerCase().includes(term);
    return snMatch || modelMatch || brandMatch || clientMatch || hostMatch;
  });

  // 加入設備至維修清單
  const handleAddAsset = (asset) => {
    // 檢查是否已在清單中
    if (selectedItems.some(i => i.sn && i.sn.toLowerCase() === (asset.sn || '').toLowerCase())) {
      alert(`序號 [${asset.sn}] 已在本次維修清單中。`);
      return;
    }

    // 若尚未填寫客戶，自動以該設備的客戶帶入
    if (!customerName && asset.client) {
      setCustomerName(asset.client);
    }

    setSelectedItems(prev => [
      ...prev,
      {
        asset_id: asset.asset_id || null,
        item_master_id: asset.item_master_id || null,
        brand: asset.brand || '',
        type: asset.type || asset.category_name || '設備',
        model: asset.model || '',
        specification: asset.specification || '',
        sn: asset.sn || '',
        original_status: asset.status || 'ACTIVE'
      }
    ]);
  };

  // 手動新增一筆自訂設備
  const handleAddManualItem = () => {
    setSelectedItems(prev => [
      ...prev,
      {
        asset_id: null,
        item_master_id: null,
        brand: '',
        type: '設備',
        model: '',
        specification: '',
        sn: '',
        original_status: 'UNKNOWN'
      }
    ]);
  };

  // 更新自訂項目欄位
  const handleUpdateItemField = (index, field, value) => {
    setSelectedItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  // 移除項目
  const handleRemoveItem = (index) => {
    setSelectedItems(prev => prev.filter((_, i) => i !== index));
  };

  // 提交建檔
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!repairNo.trim()) {
      setFormError('請輸入維修單號');
      return;
    }
    if (!customerName.trim()) {
      setFormError('請填寫客戶名稱 (Customer)');
      return;
    }
    if (!onSiteDate) {
      setFormError('請選擇現場處理日期 (On-site handling Date)');
      return;
    }
    if (!onSiteStatus.trim()) {
      setFormError('請填寫現場處理狀況 / 故障描述 (On-site handling status)');
      return;
    }
    if (selectedItems.length === 0) {
      setFormError('請至少加入一台設備/硬體進行維修建檔');
      return;
    }

    // 檢核明細欄位
    for (let i = 0; i < selectedItems.length; i++) {
      const item = selectedItems[i];
      if (!item.sn || !item.sn.trim()) {
        setFormError(`第 ${i + 1} 項設備缺少序號 (SN)`);
        return;
      }
    }

    try {
      setIsSubmitting(true);

      const userSession = JSON.parse(localStorage.getItem('erp_session') || '{}');
      const creatorId = userSession?.id || null;

      // 1. 建立維修單主檔
      const orderRes = await window.electronAPI.namedQuery('createRepairOrder', [
        repairNo.trim(),
        customerName.trim(),
        onSiteDate,
        onSiteStatus.trim(),
        creatorId,
        remarks.trim() || null
      ]);

      if (!orderRes.success || !orderRes.rows || orderRes.rows.length === 0) {
        throw new Error(orderRes.error || '建立維修單失敗');
      }

      const newRepairOrder = orderRes.rows[0];
      const repairId = newRepairOrder.id;

      // 2. 逐筆寫入維修單設備明細，並將該序號設備狀態連動設為 在庫 (ACTIVE)
      for (const item of selectedItems) {
        await window.electronAPI.namedQuery('createRepairOrderItem', [
          repairId,
          item.asset_id || null,
          item.item_master_id || null,
          item.brand || '',
          item.type || '',
          item.model || '',
          item.specification || '',
          item.sn.trim()
        ]);

        // 連動更新設備/硬體資產狀態為 ACTIVE (在庫)
        if (item.sn) {
          await window.electronAPI.namedQuery('updateAssetStatusBySn', ['ACTIVE', item.sn.trim()]);
          
          // 寫入資產狀態變更日誌
          await logStatusChange('DEVICE', item.sn.trim(), item.sn.trim(), item.original_status || 'UNKNOWN', 'ACTIVE', `建立維修單 [${repairNo}]，自客戶端取回放置在庫檢測`);
        }
      }

      // 3. 記錄維修單主檔建檔日誌
      await logCreate('REPAIR', repairNo, customerName, `建立維修單 [${repairNo}]，客戶: ${customerName}，包含 ${selectedItems.length} 台設備`);

      alert(`✅ 維修單 [${repairNo}] 建立成功！\n已將 ${selectedItems.length} 台設備狀態同步更新為「在庫 (ACTIVE)」。`);
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error('Submit Repair Order error:', err);
      setFormError('建立失敗：' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'var(--bg-modal-overlay)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-color)',
        borderRadius: '20px',
        width: '95vw',
        maxWidth: '1240px',
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: 'var(--modal-shadow)',
        overflow: 'hidden',
        color: 'var(--text-main)'
      }}>
        {/* Modal 頂部標題 */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '20px 28px',
          borderBottom: '1px solid var(--border-color)',
          backgroundColor: 'var(--bg-surface)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              color: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Wrench size={24} />
            </div>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                新增維修單 (Create Repair Order / RMA)
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                自客戶端取回故障設備，建立維修單並自動將設備序號狀態變更為「在庫 (ACTIVE)」。
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-subtle)',
              padding: '8px',
              borderRadius: '8px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal 內容區 */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div style={{ padding: '24px 28px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {formError && (
              <div style={{
                padding: '12px 16px',
                borderRadius: '10px',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#ef4444',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <AlertCircle size={16} />
                {formError}
              </div>
            )}

            {/* 單據基本資訊 */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '16px',
              backgroundColor: 'var(--bg-surface-subtle)',
              padding: '20px',
              borderRadius: '14px',
              border: '1px solid var(--border-color)'
            }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>
                  維修單號 (Repair No.) *
                </label>
                <input
                  type="text"
                  required
                  value={repairNo}
                  onChange={(e) => setRepairNo(e.target.value)}
                  placeholder="RMA-YYYYMMDD-XXX"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-main)',
                    fontWeight: 700,
                    fontSize: '14px'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>
                  客戶名稱 (Customer) *
                </label>
                <input
                  type="text"
                  required
                  list="customer-suggestions"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="例如: Yuanta Ryan"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-main)',
                    fontSize: '14px'
                  }}
                />
                <datalist id="customer-suggestions">
                  {customerList.map((c, i) => (
                    <option key={i} value={c.name} />
                  ))}
                </datalist>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>
                  現場處理/取回日期 (On-site Date) *
                </label>
                <input
                  type="date"
                  required
                  value={onSiteDate}
                  onChange={(e) => setOnSiteDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-main)',
                    fontSize: '14px'
                  }}
                />
              </div>
            </div>

            {/* 現場處理狀況 / 故障描述 */}
            <div style={{
              backgroundColor: 'var(--bg-surface-subtle)',
              padding: '20px',
              borderRadius: '14px',
              border: '1px solid var(--border-color)'
            }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px' }}>
                現場處理狀況 / 故障原因 (On-site handling status) *
              </label>
              <textarea
                rows={2}
                required
                value={onSiteStatus}
                onChange={(e) => setOnSiteStatus(e.target.value)}
                placeholder="例如: 取回 重灌OS / CPU溫度過高 (水冷正常) 取回 RMA / 無法過電"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-main)',
                  fontSize: '13px',
                  resize: 'vertical'
                }}
              />
              
              {/* 常用標籤 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>常用故障描述：</span>
                {QUICK_STATUS_TAGS.map((tag, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setOnSiteStatus(tag)}
                    style={{
                      padding: '3px 8px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--text-muted)',
                      fontSize: '11px',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--primary-color)';
                      e.currentTarget.style.color = 'var(--primary-color)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-color)';
                      e.currentTarget.style.color = 'var(--text-muted)';
                    }}
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* 設備/硬體選取與明細區塊 */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(320px, 1fr) minmax(420px, 1.4fr)',
              gap: '20px'
            }}>
              {/* 左側：從現有設備/硬體清冊快速搜尋加入 */}
              <div style={{
                backgroundColor: 'var(--bg-surface-subtle)',
                padding: '20px',
                borderRadius: '14px',
                border: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '14px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Search size={16} color="var(--primary-color)" /> 從現有設備/硬體中選擇
                  </div>
                  <button
                    type="button"
                    onClick={handleAddManualItem}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--primary-color)',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <Plus size={13} /> 手動自訂項目
                  </button>
                </div>

                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={assetSearchTerm}
                    onChange={(e) => setAssetSearchTerm(e.target.value)}
                    placeholder="搜尋序號 (SN)、型號、廠牌或客戶..."
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      paddingLeft: '32px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--text-main)',
                      fontSize: '13px'
                    }}
                  />
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
                </div>

                {/* 設備清單滾動區 */}
                <div style={{ maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
                  {isLoadingAssets ? (
                    <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '12px' }}>
                      載入資產中...
                    </div>
                  ) : filteredAssets.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '12px' }}>
                      未找到符合條件之設備/硬體
                    </div>
                  ) : (
                    filteredAssets.slice(0, 30).map(a => (
                      <div
                        key={`${a.asset_id}-${a.sn}`}
                        onClick={() => handleAddAsset(a)}
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          padding: '10px 12px',
                          borderRadius: '10px',
                          border: '1px solid var(--border-color)',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          transition: 'all 0.15s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = 'var(--primary-color)';
                          e.currentTarget.style.transform = 'translateX(2px)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = 'var(--border-color)';
                          e.currentTarget.style.transform = 'none';
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ color: 'var(--primary-color)' }}>{a.brand}</span>
                            <span>{a.model}</span>
                            <span style={{
                              fontSize: '10px',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              backgroundColor: a.status === 'SHIPPED' ? 'rgba(59, 130, 246, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                              color: a.status === 'SHIPPED' ? '#3b82f6' : '#10b981',
                              fontWeight: 700
                            }}>
                              {a.status === 'SHIPPED' ? '出貨中' : '在庫'}
                            </span>
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', gap: '8px' }}>
                            <span>序號: <strong>{a.sn}</strong></span>
                            {a.client && <span>客戶: {a.client}</span>}
                          </div>
                        </div>
                        <div style={{ color: 'var(--primary-color)', fontSize: '12px', fontWeight: 700 }}>
                          + 加入
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* 右側：本次維修單已選設備清單 */}
              <div style={{
                backgroundColor: 'var(--bg-surface-subtle)',
                padding: '20px',
                borderRadius: '14px',
                border: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '14px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Server size={16} color="#ef4444" /> 本次維修設備項目 ({selectedItems.length} 台)
                  </div>
                  {selectedItems.length > 0 && (
                    <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 700 }}>
                      建立後將自動設為「在庫 (ACTIVE)」
                    </span>
                  )}
                </div>

                <div style={{ maxHeight: '320px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {selectedItems.length === 0 ? (
                    <div style={{
                      padding: '40px 20px',
                      textAlign: 'center',
                      border: '2px dashed var(--border-color)',
                      borderRadius: '10px',
                      color: 'var(--text-muted)',
                      fontSize: '13px'
                    }}>
                      尚未加入任何設備項目<br />
                      <span style={{ fontSize: '11px' }}>請從左側搜尋選取設備，或點擊「手動自訂項目」</span>
                    </div>
                  ) : (
                    selectedItems.map((item, idx) => (
                      <div
                        key={idx}
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          padding: '12px 14px',
                          borderRadius: '10px',
                          border: '1px solid var(--border-color)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--primary-color)' }}>
                            #{idx + 1} 設備資訊
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: '#ef4444',
                              padding: '2px 4px'
                            }}
                            title="移除此項"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: '8px' }}>
                          <div>
                            <input
                              type="text"
                              required
                              value={item.brand}
                              onChange={(e) => handleUpdateItemField(idx, 'brand', e.target.value)}
                              placeholder="廠牌 (Device，如 BC)"
                              style={{
                                width: '100%',
                                padding: '6px 8px',
                                borderRadius: '6px',
                                border: '1px solid var(--border-color)',
                                backgroundColor: 'var(--bg-surface-subtle)',
                                color: 'var(--text-main)',
                                fontSize: '12px'
                              }}
                            />
                          </div>
                          <div>
                            <input
                              type="text"
                              required
                              value={item.model}
                              onChange={(e) => handleUpdateItemField(idx, 'model', e.target.value)}
                              placeholder="類型/型號 (如 56C H100)"
                              style={{
                                width: '100%',
                                padding: '6px 8px',
                                borderRadius: '6px',
                                border: '1px solid var(--border-color)',
                                backgroundColor: 'var(--bg-surface-subtle)',
                                color: 'var(--text-main)',
                                fontSize: '12px'
                              }}
                            />
                          </div>
                          <div>
                            <input
                              type="text"
                              required
                              value={item.sn}
                              onChange={(e) => handleUpdateItemField(idx, 'sn', e.target.value)}
                              placeholder="序號 (Serial Number) *"
                              style={{
                                width: '100%',
                                padding: '6px 8px',
                                borderRadius: '6px',
                                border: '1px solid var(--border-color)',
                                backgroundColor: 'var(--bg-surface-subtle)',
                                color: 'var(--text-main)',
                                fontWeight: 700,
                                fontSize: '12px'
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* 備註 */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>
                備註說明 (Remarks)
              </label>
              <input
                type="text"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="例如: 聯絡窗口、派工工程師、特殊注意規範等"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-surface-subtle)',
                  color: 'var(--text-main)',
                  fontSize: '13px'
                }}
              />
            </div>
          </div>

          {/* 底部按鈕 */}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            padding: '16px 28px',
            borderTop: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-surface)'
          }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                padding: '10px 20px',
                borderRadius: '10px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-main)',
                fontWeight: 600,
                fontSize: '14px',
                cursor: 'pointer'
              }}
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: '10px 24px',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: '#ef4444',
                color: '#fff',
                fontWeight: 800,
                fontSize: '14px',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(239, 68, 68, 0.35)'
              }}
            >
              <Wrench size={16} />
              {isSubmitting ? '建立中...' : '確認建立維修單 (自動設為在庫)'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RepairOrderRegistrationModal;
