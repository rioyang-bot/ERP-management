import React, { useState, useEffect, useContext } from 'react';
import { ClipboardList, Search, Plus, Trash2, Send, Calendar, MapPin, User, Package, Cpu, ChevronRight, AlertCircle, Loader2, Truck } from 'lucide-react';
import { RoleContext } from '../context/RoleContext';
import { useNavigate } from 'react-router-dom';
import { logCreate } from '../utils/auditLogger';
import DeliveryReceiptPrintModal from '../components/DeliveryReceiptPrintModal';
import './Outbound.css';

const Outbound = ({ isSplitMode = false, isModalMode = false, onClose = null }) => {
  const { authUser } = useContext(RoleContext) || {};
  const navigate = useNavigate();
  
  // --- 單據標頭狀態 (從 localStorage 初始化) ---
  const [header, setHeader] = useState(() => {
    const saved = localStorage.getItem('dn_draft_header');
    return saved ? JSON.parse(saved) : {
      customer: '',
      contact_info: '',
      location: '',
      date: new Date().toISOString().split('T')[0],
      project_name: ''
    };
  });

  // --- 搜尋與列表狀態 (從 localStorage 初始化) ---
  const [deviceSnInput, setDeviceSnInput] = useState('');
  const [hwSnInput, setHwSnInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // 自動補全相關狀態
  const [activeAssets, setActiveAssets] = useState([]);
  const [showDeviceDropdown, setShowDeviceDropdown] = useState(false);
  const [showHwDropdown, setShowHwDropdown] = useState(false);
  const [outboundItems, setOutboundItems] = useState(() => {
    const saved = localStorage.getItem('dn_draft_items');
    return saved ? JSON.parse(saved) : [];
  });
  const [customers, setCustomers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [consumables, setConsumables] = useState([]);
  const [deliveryReceiptModal, setDeliveryReceiptModal] = useState({ show: false, dn: null, items: [] });
  
  const [csmSearchTerm, setCsmSearchTerm] = useState('');
  const [csmFilterBrand, setCsmFilterBrand] = useState('');
  const [csmFilterType, setCsmFilterType] = useState('');
  const [csmFilterModel, setCsmFilterModel] = useState('');
  const [dnNo, setDnNo] = useState('');

  // 取得下一個出貨單號 (DN-YYYYMMDD-01)
  const fetchNextDnNo = async (targetDate) => {
    try {
      const dStr = (targetDate || new Date().toISOString().split('T')[0]).replace(/-/g, '');
      const prefix = `DN-${dStr}-`;
      const countRes = await window.electronAPI.namedQuery('countOutboundRequests', [prefix]);
      if (countRes.success && countRes.rows.length > 0) {
        const nextNum = (parseInt(countRes.rows[0].count) || 1).toString().padStart(2, '0');
        return `DN-${dStr}-${nextNum}`;
      }
    } catch (e) {
      console.error('Failed to fetch next dn no:', e);
    }
    const dStr = (targetDate || new Date().toISOString().split('T')[0]).replace(/-/g, '');
    return `DN-${dStr}-01`;
  };

  const handleDateChange = async (newDate) => {
    setHeader(prev => ({ ...prev, date: newDate }));
    const nextNo = await fetchNextDnNo(newDate);
    if (nextNo) setDnNo(nextNo);
  };

  // --- 持久化同步 ---
  useEffect(() => {
    localStorage.setItem('dn_draft_header', JSON.stringify(header));
  }, [header]);

  useEffect(() => {
    localStorage.setItem('dn_draft_items', JSON.stringify(outboundItems));
  }, [outboundItems]);

  // --- 初始化資料 ---
  useEffect(() => {
    const initData = async () => {
      const initialDate = header.date || new Date().toISOString().split('T')[0];
      fetchNextDnNo(initialDate).then(no => {
        if (no) setDnNo(no);
      });

      // 獲取客戶清單
      const custRes = await window.electronAPI.namedQuery('fetchCustomers');
      if (custRes.success) setCustomers(custRes.rows || []);

      // 獲取耗材清單
      const csmRes = await window.electronAPI.namedQuery('fetchConsumablesList');
      if (csmRes.success) setConsumables(csmRes.rows || []);

      // 獲取所有啟用中的資產以便提供即時搜尋選項
      const assetRes = await window.electronAPI.namedQuery('searchActiveAssetSNs');
      if (assetRes.success) setActiveAssets(assetRes.rows || []);

      // 獲取進行中的專案
      const projRes = await window.electronAPI.namedQuery('fetchActiveProjects');
      if (projRes.success) setProjects(projRes.rows || []);
    };
    initData();
  }, []);

  // --- 專案選擇邏輯 ---
  const handleProjectSelect = async (e) => {
    const selectedProject = e.target.value;
    setHeader({ ...header, project_name: selectedProject });
    
    if (selectedProject) {
      try {
        const res = await window.electronAPI.namedQuery('fetchAssetsByProject', [selectedProject]);
        if (res.success && res.rows.length > 0) {
          const newItems = res.rows.map(item => ({
            ...item,
            tempId: Date.now() + Math.random(),
            qty: 1,
            isSerialized: true,
            location: header.location,
            components: item.components || []
          }));
          
          setOutboundItems(prev => {
            const existingSns = new Set(prev.map(i => i.sn));
            const filteredNewItems = newItems.filter(i => !existingSns.has(i.sn));
            
            if (filteredNewItems.length > 0) {
              alert(`已從專案 [${selectedProject}] 自動帶入 ${filteredNewItems.length} 項資產。`);
              return [...prev, ...filteredNewItems];
            } else if (res.rows.length > 0) {
              alert(`專案 [${selectedProject}] 的所有在庫資產已在出貨清單中。`);
            }
            return prev;
          });
        } else if (res.success && res.rows.length === 0) {
          alert(`專案 [${selectedProject}] 目前沒有任何在庫 (ACTIVE) 的資產。`);
        }
      } catch (err) {
        console.error('Fetch project assets error:', err);
      }
    }
  };

  // --- 序號查詢邏輯 ---
  const handleSnSearch = async (e, type) => {
    if (e) e.preventDefault();
    const inputVal = type === 'device' ? deviceSnInput : hwSnInput;
    if (!inputVal.trim()) return;

    setIsSearching(true);
    try {
      const res = await window.electronAPI.namedQuery('fetchAssetDetailBySN', [inputVal.trim()]);
      if (res.success && res.rows.length > 0) {
        const item = res.rows[0];
        
        // 分類驗證
        const categoryMatch = (type === 'device' && item.category_name === '設備') || (type === 'hw' && item.category_name === '硬體');
        
        if (!categoryMatch) {
            alert(type === 'device' ? '此序號屬於「硬體」，請改用下方的硬體搜尋列！' : '此序號屬於「設備」，請改用上方的設備搜尋列！');
            return;
        }

        // 檢查是否已在清單中
        if (outboundItems.some(i => i.sn === item.sn)) {
          alert('此序號已在出貨清單中');
          if (type === 'device') setDeviceSnInput(''); else setHwSnInput('');
          return;
        }

        // 建立主品項
        const newItem = {
          ...item,
          tempId: Date.now(),
          qty: 1,
          isSerialized: true,
          location: header.location,
          components: item.components || [] // 搭載的硬體
        };

        setOutboundItems(prev => [...prev, newItem]);
        if (type === 'device') {
          setDeviceSnInput('');
          setShowDeviceDropdown(false);
        } else {
          setHwSnInput('');
          setShowHwDropdown(false);
        }
      } else {
        alert('找不到該序號的資產');
      }
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setIsSearching(false);
    }
  };

  // --- 耗材快選邏輯 ---
  const addConsumable = (csm) => {
    // 檢查是否已在清單中
    const existIdx = outboundItems.findIndex(i => i.item_id === csm.item_id && !i.isSerialized);
    if (existIdx >= 0) {
      const newItems = [...outboundItems];
      newItems[existIdx].qty += 1;
      setOutboundItems(newItems);
    } else {
      setOutboundItems(prev => [...prev, {
        ...csm,
        tempId: Date.now(),
        qty: 1,
        isSerialized: false,
        location: header.location,
        sn: ''
      }]);
    }
  };

  const removeItem = (tempId) => {
    setOutboundItems(prev => prev.filter(i => i.tempId !== tempId));
  };

  const updateQty = (tempId, newQty) => {
    setOutboundItems(prev => prev.map(i => 
      i.tempId === tempId ? { ...i, qty: Math.max(1, newQty) } : i
    ));
  };

  const updateLocation = (tempId, newLoc) => {
    setOutboundItems(prev => prev.map(i => 
      i.tempId === tempId ? { ...i, location: newLoc } : i
    ));
  };

  const handleSubmit = async () => {
    if (!header.customer) return alert('請選擇客戶');
    if (outboundItems.length === 0) return alert('清單中無任何項目');

    setIsSubmitting(true);
    try {
      // 1. 產生 D/N 單號 (DN-YYYYMMDD-XX)
      const dateStr = header.date.replace(/-/g, '');
      const prefix = `DN-${dateStr}-`;
      const countRes = await window.electronAPI.namedQuery('countOutboundRequests', [prefix]);
      const nextNum = (parseInt(countRes.rows[0].count) || 1).toString().padStart(2, '0');
      const dnNumber = `DN-${dateStr}-${nextNum}`;

      // 2. 建立出貨單標頭 (Outbound Request) - 一律為一般出貨 'SALE'
      const reqRes = await window.electronAPI.namedQuery('insertOutboundRequest', [
        dnNumber,
        header.customer,
        header.location,
        header.date,
        authUser?.id || null,
        header.contact_info,
        'SALE',
        null
      ]);

      if (reqRes.success) {
        const requestId = reqRes.rows[0].id;

        // 3. 建立出貨明細 (Outbound Items)
        // 注意：這裡需要處理主設備及其搭載硬體
        for (const item of outboundItems) {
          // 加入主項
          await window.electronAPI.namedQuery('insertOutboundItem', [
            requestId,
            item.item_id || item.item_master_id,
            item.sn,
            item.qty,
            item.location || header.location
          ]);

          // 如果有搭載硬體，也要一併加入明細
          if (item.components && item.components.length > 0) {
            for (const comp of item.components) {
              await window.electronAPI.namedQuery('insertOutboundItem', [
                requestId,
                comp.item_master_id, 
                comp.sn,
                1,
                item.location || header.location
              ]);
            }
          }
        }

        logCreate(
          'OUTBOUND',
          dnNumber,
          header.customer || '出貨單',
          `建立出貨申請單 [${dnNumber}] 對象: ${header.customer} 共 ${outboundItems.length} 個品項 (一般銷貨)`,
          { dnNumber, customer: header.customer, location: header.location, request_type: 'SALE', itemsCount: outboundItems.length, items: outboundItems.map(i => ({ model: i.model, brand: i.brand, sn: i.sn, qty: i.qty })) }
        );

        const dnData = {
          id: requestId,
          request_no: dnNumber,
          customer: header.customer,
          contact_info: header.contact_info,
          location: header.location,
          shipping_date: header.date,
          project_name: header.project_name,
          creator_name: authUser?.full_name
        };
        const currentItems = [...outboundItems];

        // 清除清單與快取
        setOutboundItems([]);
        setHeader({
          customer: '',
          contact_info: '',
          location: '',
          date: new Date().toISOString().split('T')[0],
          project_name: ''
        });
        localStorage.removeItem('dn_draft_items');
        localStorage.removeItem('dn_draft_header');

        setDeliveryReceiptModal({ show: true, dn: dnData, items: currentItems });
      } else {
        alert('建立出貨單失敗: ' + reqRes.error);
      }
    } catch (err) {
      console.error('Submit error:', err);
      alert('發生非預期錯誤');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 取得建議清單
  const getDeviceSuggestions = () => {
    if (!deviceSnInput.trim()) return [];
    return activeAssets
      .filter(a => a.category_name === '設備' && a.sn.toLowerCase().includes(deviceSnInput.toLowerCase()))
      .slice(0, 5);
  };

  const getHwSuggestions = () => {
    if (!hwSnInput.trim()) return [];
    return activeAssets
      .filter(a => a.category_name === '硬體' && a.sn.toLowerCase().includes(hwSnInput.toLowerCase()))
      .slice(0, 5);
  };

  // 耗材篩選邏輯
  const csmBrands = [...new Set(consumables.map(c => c.brand).filter(Boolean))];
  const csmTypes = [...new Set(consumables.filter(c => !csmFilterBrand || c.brand === csmFilterBrand).map(c => c.type).filter(Boolean))];
  const csmModels = [...new Set(consumables.filter(c => (!csmFilterBrand || c.brand === csmFilterBrand) && (!csmFilterType || c.type === csmFilterType)).map(c => c.model).filter(Boolean))];

  const hasCsmFilter = Boolean(csmFilterBrand || csmFilterType || csmFilterModel || csmSearchTerm.trim());

  const filteredConsumables = hasCsmFilter ? consumables.filter(c => {
    if (csmFilterBrand && c.brand !== csmFilterBrand) return false;
    if (csmFilterType && c.type !== csmFilterType) return false;
    if (csmFilterModel && c.model !== csmFilterModel) return false;
    if (csmSearchTerm) {
      const term = csmSearchTerm.toLowerCase();
      return (c.brand || '').toLowerCase().includes(term) ||
             (c.model || '').toLowerCase().includes(term) ||
             (c.type || '').toLowerCase().includes(term) ||
             (c.specification || '').toLowerCase().includes(term);
    }
    return true;
  }) : [];

  return (
    <div className="outbound-page-container" style={isSplitMode ? { padding: 0, minHeight: 'auto', backgroundColor: 'transparent' } : {}}>
      {/* 頂部標題 */}
      {!isModalMode && (
        <div className="outbound-page-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h1 style={{ fontSize: '24px', fontWeight: '900', margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-main)' }}>
                <Truck size={26} color="var(--primary-color)" /> 出貨單建檔 (Delivery Note Registration)
              </h1>
              {dnNo && (
                <span style={{
                  padding: '4px 12px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(37, 99, 235, 0.12)',
                  color: 'var(--primary-color)',
                  fontWeight: 800,
                  fontSize: '14px',
                  border: '1px solid rgba(37, 99, 235, 0.3)'
                }}>
                  單號: {dnNo}
                </span>
              )}
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px', marginBottom: 0 }}>建立新的出貨申請單（一般銷貨），支援設備序號自動導出與耗材選取。</p>
          </div>
          {!isSplitMode && (
            <div style={{ display: 'flex', backgroundColor: 'var(--bg-surface-subtle)', padding: '4px', borderRadius: '10px' }}>
              <button style={{ padding: '6px 14px', backgroundColor: 'var(--bg-surface)', color: 'var(--primary-color)', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '800', boxShadow: 'var(--card-shadow)', cursor: 'default' }}>
                📝 建檔
              </button>
              <button onClick={() => navigate('/outbound-split')} style={{ padding: '6px 14px', backgroundColor: 'transparent', color: 'var(--text-muted)', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s' }}>
                ◫ 雙開
              </button>
              <button onClick={() => navigate('/dn-list')} style={{ padding: '6px 14px', backgroundColor: 'transparent', color: 'var(--text-muted)', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s' }}>
                📋 清單
              </button>
            </div>
          )}
        </div>
      )}

      <div className="dn-content-layout">
        {/* 左側：單據標頭與選取區 */}
        <div className="dn-left-panel">
          {/* 標頭資訊卡 */}
          <div className="dn-card">
            <div className="dn-card-header">
              <User size={18} /> <span>單據基本資訊</span>
            </div>
            <div className="dn-form-grid">
              {/* 出貨單號 (鎖定唯讀) */}
              <div className="dn-field">
                <label>
                  出貨單號 (D/N No.) <span style={{ fontSize: '11px', color: 'var(--primary-color)', fontWeight: 600 }}>[系統自動編號 · 鎖定]</span>
                </label>
                <div className="input-with-icon">
                  <ClipboardList size={16} />
                  <input 
                    type="text" 
                    readOnly 
                    value={dnNo || '計算中...'} 
                    style={{
                      backgroundColor: 'var(--bg-surface-subtle)',
                      color: 'var(--text-muted)',
                      fontWeight: 700,
                      cursor: 'not-allowed'
                    }}
                    title="出貨單號依日期由系統自動編排產生，無法手動修改"
                  />
                </div>
              </div>

              <div className="dn-field">
                <label>出貨對象 (客戶) *</label>
                <div className="select-wrapper">
                  <select 
                    value={header.customerId || customers.find(c => c.name === header.customer)?.id || ''} 
                    onChange={e => {
                      const selectedId = e.target.value;
                      const customerData = customers.find(c => c.id.toString() === selectedId);
                      if (customerData) {
                        const contactStr = `${customerData.contact || ''} ${customerData.phone || ''}`.trim();
                        setHeader({
                          ...header, 
                          customerId: selectedId,
                          customer: customerData.name,
                          contact_info: contactStr,
                          location: customerData.address || header.location || ''
                        });
                      } else {
                        setHeader({
                          ...header, 
                          customerId: '',
                          customer: '',
                          contact_info: '',
                          location: ''
                        });
                      }
                    }}
                  >
                    <option value="">請選擇客戶...</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.contact ? `(${c.contact})` : ''} {c.address ? ` - ${c.address}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="dn-field">
                <label>出貨日期</label>
                <div className="input-with-icon">
                  <Calendar size={16} />
                  <input 
                    type="date" 
                    value={header.date} 
                    onChange={e => handleDateChange(e.target.value)}
                  />
                </div>
              </div>
              <div className="dn-field">
                <label>聯絡資訊 (自動帶出)</label>
                <div className="input-with-icon">
                  <User size={16} />
                  <input 
                    type="text" 
                    placeholder="系統自動帶出..."
                    value={header.contact_info} 
                    readOnly
                    style={{ backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-muted)', cursor: 'not-allowed' }}
                  />
                </div>
              </div>

              <div className="dn-field">
                <label>出貨專案 (自動帶入資產)</label>
                <div className="select-wrapper">
                  <select 
                    value={header.project_name || ''} 
                    onChange={handleProjectSelect}
                  >
                    <option value="">無 (不指定)</option>
                    {projects.map(p => (
                      <option key={p.project_no} value={p.project_name}>
                        {p.project_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="dn-field">
                <label>出貨地點 / 備註</label>
                <div className="input-with-icon">
                  <MapPin size={16} />
                  <input 
                    type="text" 
                    placeholder="出貨地點 / 備註"
                    value={header.location}
                    onChange={e => setHeader({...header, location: e.target.value})}
                  />
                </div>
              </div>
            </div>
          </div>
          {/* 資產序號搜尋 */}
          <div className="dn-card">
            <div className="dn-card-header">
              <Cpu size={18} /> <span>資產序號匯入 (S/N Scan)</span>
            </div>
            
            <form className="sn-search-box" style={{ marginBottom: '12px', position: 'relative' }} onSubmit={(e) => handleSnSearch(e, 'device')}>
              <input 
                type="text" 
                placeholder="輸入設備序號 (Device S/N)"
                value={deviceSnInput}
                onChange={e => {
                  setDeviceSnInput(e.target.value);
                  setShowDeviceDropdown(true);
                }}
                onFocus={() => setShowDeviceDropdown(true)}
                onBlur={() => setTimeout(() => setShowDeviceDropdown(false), 200)}
              />
              <button type="submit" disabled={isSearching}>
                {isSearching ? <Loader2 className="spinner" size={14} /> : <Search size={14} />}
                加入設備
              </button>
              
              {showDeviceDropdown && getDeviceSuggestions().length > 0 && (
                <div className="autocomplete-dropdown">
                  {getDeviceSuggestions().map(suggestion => (
                    <div 
                      key={suggestion.sn} 
                      className="autocomplete-item"
                      onClick={() => setDeviceSnInput(suggestion.sn)}
                    >
                      <span className="ac-sn">{suggestion.sn}</span>
                      <span className="ac-desc">{suggestion.brand} {suggestion.model}</span>
                    </div>
                  ))}
                </div>
              )}
            </form>

            <form className="sn-search-box" style={{ position: 'relative' }} onSubmit={(e) => handleSnSearch(e, 'hw')}>
              <input 
                type="text" 
                placeholder="輸入硬體序號 (Hardware S/N)"
                value={hwSnInput}
                onChange={e => {
                  setHwSnInput(e.target.value);
                  setShowHwDropdown(true);
                }}
                onFocus={() => setShowHwDropdown(true)}
                onBlur={() => setTimeout(() => setShowHwDropdown(false), 200)}
              />
              <button type="submit" disabled={isSearching}>
                {isSearching ? <Loader2 className="spinner" size={14} /> : <Search size={14} />}
                加入硬體
              </button>

              {showHwDropdown && getHwSuggestions().length > 0 && (
                <div className="autocomplete-dropdown">
                  {getHwSuggestions().map(suggestion => (
                    <div 
                      key={suggestion.sn} 
                      className="autocomplete-item"
                      onClick={() => setHwSnInput(suggestion.sn)}
                    >
                      <span className="ac-sn">{suggestion.sn}</span>
                      <span className="ac-desc">{suggestion.brand} {suggestion.model}</span>
                    </div>
                  ))}
                </div>
              )}
            </form>
          </div>

          {/* 耗材庫存快選 */}
          <div className="dn-card">
            <div className="dn-card-header">
              <Package size={18} /> <span>耗材庫存快選 (Consumables)</span>
            </div>
            
            {/* 耗材篩選列 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', padding: '0 18px 12px' }}>
              <select 
                value={csmFilterBrand} 
                onChange={e => { setCsmFilterBrand(e.target.value); setCsmFilterType(''); setCsmFilterModel(''); }}
                style={{ padding: '7px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-main)', outline: 'none' }}
              >
                <option value="">廠牌 (未選擇)</option>
                {csmBrands.map(b => <option key={b} value={b}>{b}</option>)}
              </select>

              <select 
                value={csmFilterType} 
                onChange={e => { setCsmFilterType(e.target.value); setCsmFilterModel(''); }}
                style={{ padding: '7px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-main)', outline: 'none' }}
              >
                <option value="">類型 (未選擇)</option>
                {csmTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>

              <select 
                value={csmFilterModel} 
                onChange={e => setCsmFilterModel(e.target.value)}
                style={{ padding: '7px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-main)', outline: 'none' }}
              >
                <option value="">型號 (未選擇)</option>
                {csmModels.map(m => <option key={m} value={m}>{m}</option>)}
              </select>

              <input 
                type="text" 
                placeholder="搜尋耗材..." 
                value={csmSearchTerm}
                onChange={e => setCsmSearchTerm(e.target.value)}
                style={{ padding: '7px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-main)', outline: 'none' }}
              />
            </div>

            <div className="consumables-scroll-box">
              {!hasCsmFilter ? (
                <div className="empty-hint" style={{ padding: '24px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                  <Package size={28} style={{ opacity: 0.35, color: 'var(--text-muted)' }} />
                  <div style={{ fontWeight: 600 }}>請先選擇廠牌 / 類型 / 型號，或輸入關鍵字搜尋耗材</div>
                  <div style={{ fontSize: '12px', opacity: 0.7 }}>選取條件後將自動顯示對應的耗材庫存卡片供快速點選</div>
                </div>
              ) : filteredConsumables.length === 0 ? (
                <div className="empty-hint">無符合篩選條件之耗材</div>
              ) : (
                <div className="consumables-grid">
                  {filteredConsumables.map(csm => (
                    <div key={csm.item_id} className="csm-btn" onClick={() => addConsumable(csm)}>
                      <div className="csm-btn-header">
                        <span className="csm-brand">{csm.brand}</span>
                        <span className="csm-stock">存: {csm.stock_qty}</span>
                      </div>
                      <div className="csm-model">{csm.model}</div>
                      <div className="csm-spec">{csm.specification}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 右側：出貨清單與提交區 */}
        <div className="dn-right-panel">
          <div className="dn-card dn-items-card">
            <div className="dn-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ClipboardList size={18} /> <span>已排定出貨品項 ({outboundItems.length})</span>
              </div>
              {outboundItems.length > 0 && (
                <button 
                  onClick={() => setOutboundItems([])}
                  style={{ border: 'none', background: 'none', color: '#ef4444', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}
                >
                  清空品項
                </button>
              )}
            </div>

            <div className="dn-items-container">
              {outboundItems.length === 0 ? (
                <div className="empty-outbound-hint">
                  <AlertCircle size={32} />
                  <p>目前尚未加入任何出貨品項</p>
                  <span>請從左側掃描/輸入設備與硬體序號，或點選耗材加入。</span>
                </div>
              ) : (
                outboundItems.map((item, idx) => (
                  <div key={item.tempId || idx} className="outbound-item-row">
                    <div className="item-row-left">
                      <span className={`cat-pill cat-${item.category_name === '設備' ? 'device' : (item.category_name === '硬體' ? 'hw' : 'csm')}`}>
                        {item.category_name || '耗材'}
                      </span>
                      <div className="item-main-info">
                        <div className="item-title">{item.brand} {item.model}</div>
                        <div className="item-subtitle">{item.specification}</div>
                        {item.sn && (
                          <div className="item-sn">S/N: <strong>{item.sn}</strong></div>
                        )}
                      </div>
                    </div>

                    {/* 搭載硬體展開 */}
                    {item.components && item.components.length > 0 && (
                      <div className="item-components-box">
                        <div className="components-title">搭載硬體 ({item.components.length}):</div>
                        <div className="components-list">
                          {item.components.map((comp, cIdx) => (
                            <div key={cIdx} className="comp-badge">
                              <span>{comp.type} - {comp.brand} {comp.model}</span>
                              <strong>{comp.sn}</strong>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="item-row-right">
                      {item.isSerialized ? (
                        <span className="qty-tag">1 台/件</span>
                      ) : (
                        <div className="qty-control">
                          <button onClick={() => updateQty(item.tempId, item.qty - 1)}>-</button>
                          <input 
                            type="number" 
                            value={item.qty} 
                            onChange={e => updateQty(item.tempId, parseInt(e.target.value) || 1)}
                          />
                          <button onClick={() => updateQty(item.tempId, item.qty + 1)}>+</button>
                        </div>
                      )}

                      <input 
                        type="text" 
                        className="item-loc-input"
                        placeholder="出貨地點"
                        value={item.location || ''}
                        onChange={e => updateLocation(item.tempId, e.target.value)}
                      />

                      <button className="btn-del-item" onClick={() => removeItem(item.tempId)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="dn-card-footer">
              <button 
                className="btn-submit-dn" 
                onClick={handleSubmit} 
                disabled={isSubmitting || outboundItems.length === 0}
              >
                <Send size={18} /> 送出並建立出貨單 (D/N)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 交貨簽收單列印/預覽 Modal */}
      {deliveryReceiptModal.show && deliveryReceiptModal.dn && (
        <DeliveryReceiptPrintModal
          isOpen={deliveryReceiptModal.show}
          onClose={() => {
            setDeliveryReceiptModal({ show: false, dn: null, items: [] });
            if (onClose) {
              onClose();
            } else if (!isSplitMode) {
              navigate('/dn-list');
            }
          }}
          dnData={deliveryReceiptModal.dn}
          items={deliveryReceiptModal.items}
        />
      )}
    </div>
  );
};

export default Outbound;
