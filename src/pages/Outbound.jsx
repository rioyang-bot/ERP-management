import React, { useState, useEffect, useContext } from 'react';
import { ClipboardList, Search, Plus, Trash2, Send, Calendar, MapPin, User, Package, Cpu, ChevronRight, AlertCircle, Loader2, Truck } from 'lucide-react';
import { RoleContext } from '../context/RoleContext';
import { useNavigate } from 'react-router-dom';
import './Outbound.css';

const Outbound = ({ isSplitMode = false }) => {
  const { authUser } = useContext(RoleContext);
  const navigate = useNavigate();
  // --- 單據標頭狀態 (從 localStorage 初始化) ---
  const [header, setHeader] = useState(() => {
    const saved = localStorage.getItem('dn_draft_header');
    return saved ? JSON.parse(saved) : {
      customer: '',
      contact_info: '',
      location: '',
      date: new Date().toISOString().split('T')[0]
    };
  });

  // --- 搜尋與列表狀態 (從 localStorage 初始化) ---
  const [deviceSnInput, setDeviceSnInput] = useState('');
  const [hwSnInput, setHwSnInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  
  // 自動補全相關狀態
  const [activeAssets, setActiveAssets] = useState([]);
  const [showDeviceDropdown, setShowDeviceDropdown] = useState(false);
  const [showHwDropdown, setShowHwDropdown] = useState(false);
  const [outboundItems, setOutboundItems] = useState(() => {
    const saved = localStorage.getItem('dn_draft_items');
    return saved ? JSON.parse(saved) : [];
  });
  const [customers, setCustomers] = useState([]);
  const [consumables, setConsumables] = useState([]);
  const [csmSearchTerm, setCsmSearchTerm] = useState('');
  const [csmFilterBrand, setCsmFilterBrand] = useState('');
  const [csmFilterType, setCsmFilterType] = useState('');
  const [csmFilterModel, setCsmFilterModel] = useState('');

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
      // 獲取客戶清單
      const custRes = await window.electronAPI.namedQuery('fetchCustomers');
      if (custRes.success) setCustomers(custRes.rows);

      // 獲取耗材清單
      const csmRes = await window.electronAPI.namedQuery('fetchConsumablesList');
      if (csmRes.success) setConsumables(csmRes.rows);

      // 獲取所有啟用中的資產以便提供即時搜尋選項
      const assetRes = await window.electronAPI.namedQuery('searchActiveAssetSNs');
      if (assetRes.success) setActiveAssets(assetRes.rows);
    };
    initData();
  }, []);

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

        // 專案混用阻斷邏輯 (Prevent mixed projects)
        const incomingProject = item.custom_attributes?.project_name;
        if (incomingProject) {
           const existingProjects = [...new Set(outboundItems.map(i => i.custom_attributes?.project_name).filter(Boolean))];
           if (existingProjects.length > 0 && !existingProjects.includes(incomingProject)) {
              alert(`此出貨單已包含專案【${existingProjects[0]}】的設備。\n禁止混入專案【${incomingProject}】的設備！\n請您針對該專案另外建立新的出貨單。`);
              return;
           }
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

    try {
      // 1. 產生 D/N 單號 (DN-YYYYMMDD-XX)
      const dateStr = header.date.replace(/-/g, '');
      const prefix = `DN-${dateStr}-`;
      const countRes = await window.electronAPI.namedQuery('countOutboundRequests', [prefix]);
      const nextNum = (parseInt(countRes.rows[0].count) || 1).toString().padStart(2, '0');
      const dnNumber = `DN-${dateStr}-${nextNum}`;

      // 2. 建立出貨單標頭 (Outbound Request)
      const reqRes = await window.electronAPI.namedQuery('insertOutboundRequest', [
        dnNumber,
        header.customer,
        header.location,
        header.date,
        authUser?.id || null,
        header.contact_info
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

        alert(`出貨單 [${dnNumber}] 已成功建立！\n請至 D/N List 查看審核進度。`);
        
        // 清除清單與快取
        setOutboundItems([]);
        setHeader({
          customer: '',
          contact_info: '',
          location: '',
          date: new Date().toISOString().split('T')[0]
        });
        localStorage.removeItem('dn_draft_items');
        localStorage.removeItem('dn_draft_header');
      } else {
        alert('建立失敗：' + reqRes.error);
      }
    } catch (err) {
      console.error('Submit error:', err);
      alert('處理出貨單時發生錯誤，請稍後再試。');
    }
  };

  const filteredConsumables = consumables.filter(c => {
    if (csmFilterBrand && (c.brand || '') !== csmFilterBrand) return false;
    if (csmFilterType && (c.type || '') !== csmFilterType) return false;
    if (csmFilterModel && (c.model || '') !== csmFilterModel) return false;
    if (csmSearchTerm) {
      const search = csmSearchTerm.toLowerCase();
      const name = (c.item_name || '').toLowerCase();
      const model = (c.model || '').toLowerCase();
      const brand = (c.brand || '').toLowerCase();
      return name.includes(search) || model.includes(search) || brand.includes(search);
    }
    return true;
  });

  // 動態篩選選項 (後項根據前項過濾)
  const csmBrands = [...new Set(consumables.map(c => c.brand).filter(Boolean))].sort();
  const csmTypes = [...new Set(consumables.filter(c => !csmFilterBrand || c.brand === csmFilterBrand).map(c => c.type).filter(Boolean))].sort();
  const csmModels = [...new Set(consumables.filter(c => (!csmFilterBrand || c.brand === csmFilterBrand) && (!csmFilterType || c.type === csmFilterType)).map(c => c.model).filter(Boolean))].sort();

  // 幫助過濾的函式
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

  return (
    <div className="outbound-registration-container">
      {/* 1. 頁面標題 */}
      <div className="dn-header-main" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '900', margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: '#1e293b' }}>
            <Truck size={26} color="#2563eb" /> 出貨單建檔 (Delivery Note Registration)
          </h1>
          <p style={{ color: '#64748b', fontSize: '13px', marginTop: '4px', marginBottom: 0 }}>建立新的出貨申請單，支援設備序號自動導出與耗材選取。</p>
        </div>
        {!isSplitMode && (
          <div style={{ display: 'flex', backgroundColor: '#f1f5f9', padding: '4px', borderRadius: '10px' }}>
            <button style={{ padding: '6px 14px', backgroundColor: '#ffffff', color: '#2563eb', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '800', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', cursor: 'default' }}>
              📝 建檔
            </button>
            <button onClick={() => navigate('/outbound-split')} style={{ padding: '6px 14px', backgroundColor: 'transparent', color: '#64748b', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s' }}>
              ◫ 雙開
            </button>
            <button onClick={() => navigate('/dn-list')} style={{ padding: '6px 14px', backgroundColor: 'transparent', color: '#64748b', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s' }}>
              📋 清單
            </button>
          </div>
        )}
      </div>

      <div className="dn-content-layout">
        {/* 左側：單據標頭與選取區 */}
        <div className="dn-left-panel">
          {/* 標頭資訊卡 */}
          <div className="dn-card">
            <div className="dn-card-header">
              <User size={18} /> <span>單據基本資訊</span>
            </div>
            <div className="dn-form-grid">
              <div className="dn-field">
                <label>出貨對象 (客戶) *</label>
                <div className="select-wrapper">
                  <select 
                    value={header.customer} 
                    onChange={e => {
                      const selectedName = e.target.value;
                      const customerData = customers.find(c => c.name === selectedName);
                      const contactStr = customerData ? `${customerData.contact || ''} ${customerData.phone || ''}`.trim() : '';
                      setHeader({
                        ...header, 
                        customer: selectedName,
                        contact_info: contactStr
                      });
                    }}
                  >
                    <option value="">請選擇客戶...</option>
                    {customers.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
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
                    onChange={e => setHeader({...header, date: e.target.value})}
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
                    style={{ backgroundColor: '#f8fafc', color: '#64748b', cursor: 'not-allowed' }}
                  />
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
            
            <p className="dn-hint" style={{ marginTop: '12px' }}>系統會識別資產類別並自動帶出型號、規格與搭載硬體</p>
          </div>

          {/* 耗材快選 (AI 設計) */}
          <div className="dn-card">
            <div className="dn-card-header">
              <Package size={18} /> <span>耗材品項快選 (Consumables)</span>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
              <select
                value={csmFilterBrand}
                onChange={e => { setCsmFilterBrand(e.target.value); setCsmFilterType(''); setCsmFilterModel(''); }}
                style={{ flex: 1, minWidth: '100px', padding: '7px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.85rem', outline: 'none', backgroundColor: '#fff' }}
              >
                <option value="">全部廠牌</option>
                {csmBrands.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              <select
                value={csmFilterType}
                onChange={e => { setCsmFilterType(e.target.value); setCsmFilterModel(''); }}
                style={{ flex: 1, minWidth: '100px', padding: '7px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.85rem', outline: 'none', backgroundColor: '#fff' }}
              >
                <option value="">全部類型</option>
                {csmTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select
                value={csmFilterModel}
                onChange={e => setCsmFilterModel(e.target.value)}
                style={{ flex: 1, minWidth: '100px', padding: '7px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.85rem', outline: 'none', backgroundColor: '#fff' }}
              >
                <option value="">全部型號</option>
                {csmModels.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="csm-search-mini">
              <Search size={14} />
              <input 
                type="text" 
                placeholder="快速搜尋品名..." 
                value={csmSearchTerm}
                onChange={e => setCsmSearchTerm(e.target.value)}
              />
            </div>
            <div className="csm-fast-grid">
              {filteredConsumables.length === 0 ? (
                <div className="csm-empty-hint">
                  <Package size={24} opacity={0.3} />
                  <span>{(!csmFilterBrand && !csmFilterType && !csmFilterModel && !csmSearchTerm) ? '請選擇篩選條件或輸入關鍵字...' : '找不到匹配的品項'}</span>
                </div>
              ) : (
                filteredConsumables.slice(0, 20).map(c => (
                  <div key={c.item_id} className="csm-fast-item" onClick={() => addConsumable(c)}>
                    <div className="csm-fast-name">{c.item_name}</div>
                    <div className="csm-fast-model">{c.brand} / {c.model}</div>
                    <div className="csm-fast-stock">庫存: {c.available_qty}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* 右側：出貨清單預覽 */}
        <div className="dn-right-panel">
          <div className="dn-card list-card">
            <div className="dn-card-header" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ClipboardList size={18} /> <span>出貨單項目清單</span>
              </div>
              <span className="dn-item-count">共 {outboundItems.length} 項</span>
            </div>

            <div className="dn-table-container">
              {outboundItems.length === 0 ? (
                <div className="dn-empty-state">
                  <AlertCircle size={40} />
                  <p>尚未加入任何品項</p>
                  <span>請從左側搜尋序號或選取耗材</span>
                </div>
              ) : (
                <table className="dn-table">
                  <thead>
                    <tr>
                      <th>類別</th>
                      <th>廠牌 / 型號</th>
                      <th>序號 (S/N)</th>
                      <th>數量</th>
                      <th>出貨位置</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outboundItems.map(item => (
                      <React.Fragment key={item.tempId}>
                        <tr className="main-row">
                          <td className="col-type">
                            <span className={`type-badge ${item.isSerialized ? 'serial' : 'cons'}`}>
                              {item.type}
                            </span>
                          </td>
                          <td className="col-model">
                            <div className="model-name">{item.brand} {item.model}</div>
                            <div className="model-specs">{item.specification}</div>
                          </td>
                          <td className="col-sn"><code>{item.sn}</code></td>
                          <td className="col-qty">
                            {item.isSerialized ? (
                              <span>1</span>
                            ) : (
                              <input 
                                type="number" 
                                min="1" 
                                value={item.qty} 
                                onChange={e => updateQty(item.tempId, parseInt(e.target.value))}
                                className="qty-input-small"
                              />
                            )}
                          </td>
                          <td className="col-loc">
                             {item.isSerialized && (
                                <input 
                                  type="text"
                                  value={item.location || ''}
                                  onChange={e => updateLocation(item.tempId, e.target.value)}
                                  style={{ width: '120px', padding: '6px', fontSize: '0.8rem', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                                  placeholder="未指定"
                                />
                             )}
                          </td>
                          <td className="col-actions">
                            <button onClick={() => removeItem(item.tempId)} className="btn-remove">
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                        {/* 搭載元件顯示 */}
                        {item.components && item.components.length > 0 && item.components.map(comp => (
                          <tr key={`${item.tempId}-${comp.sn}`} className="sub-row">
                            <td><div className="sub-line"></div></td>
                            <td><span className="type-badge sub">{comp.type}</span> {comp.brand} {comp.model}</td>
                            <td><code>{comp.sn}</code></td>
                            <td>1</td>
                            <td style={{ fontSize: '0.75rem', color: '#94a3b8' }}>同上</td>
                            <td></td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="dn-footer">
              <button 
                className="btn-dn-submit" 
                onClick={handleSubmit}
                disabled={outboundItems.length === 0}
              >
                <Send size={18} />
                送出出貨單申請 (Submit D/N)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Outbound;
