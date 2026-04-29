import React, { useState, useEffect, useContext } from 'react';
import { 
  ClipboardList, Search, Plus, Trash2, Send, 
  Calendar, MapPin, User, Package, Cpu, 
  ChevronRight, AlertCircle, Loader2
} from 'lucide-react';
import { RoleContext } from '../context/RoleContext';
import './Outbound.css';

const Outbound = () => {
  const { authUser } = useContext(RoleContext);
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
  const [snInput, setSnInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [outboundItems, setOutboundItems] = useState(() => {
    const saved = localStorage.getItem('dn_draft_items');
    return saved ? JSON.parse(saved) : [];
  });
  const [customers, setCustomers] = useState([]);
  const [consumables, setConsumables] = useState([]);
  const [csmSearchTerm, setCsmSearchTerm] = useState('');

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
    };
    initData();
  }, []);

  // --- 序號查詢邏輯 ---
  const handleSnSearch = async (e) => {
    if (e) e.preventDefault();
    if (!snInput.trim()) return;

    setIsSearching(true);
    try {
      const res = await window.electronAPI.namedQuery('fetchAssetDetailBySN', [snInput.trim()]);
      if (res.success && res.rows.length > 0) {
        const item = res.rows[0];
        
        // 檢查是否已在清單中
        if (outboundItems.some(i => i.sn === item.sn)) {
          alert('此序號已在出貨清單中');
          setSnInput('');
          return;
        }

        // 建立主品項
        const newItem = {
          ...item,
          tempId: Date.now(),
          qty: 1,
          isSerialized: true,
          components: item.components || [] // 搭載的硬體
        };

        setOutboundItems(prev => [...prev, newItem]);
        setSnInput('');
      } else {
        alert('找不到該序號的設備或硬體');
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

  const handleSubmit = async () => {
    if (!header.customer) return alert('請選擇客戶');
    if (outboundItems.length === 0) return alert('清單中無任何項目');

    try {
      // 1. 產生 D/N 單號 (DN-YYYYMMDD-XX)
      const dateStr = header.date.replace(/-/g, '');
      const prefix = `DN-${dateStr}-%`;
      const countRes = await window.electronAPI.namedQuery('countOutboundRequests', [prefix]);
      const nextNum = (parseInt(countRes.rows[0].count) + 1).toString().padStart(2, '0');
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
            item.qty
          ]);

          // 如果有搭載硬體，也要一併加入明細
          if (item.components && item.components.length > 0) {
            for (const comp of item.components) {
              await window.electronAPI.namedQuery('insertOutboundItem', [
                requestId,
                comp.item_master_id, 
                comp.sn,
                1
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
    const search = csmSearchTerm.toLowerCase();
    const name = (c.item_name || '').toLowerCase();
    const model = (c.model || '').toLowerCase();
    const brand = (c.brand || '').toLowerCase();
    return name.includes(search) || model.includes(search) || brand.includes(search);
  });

  return (
    <div className="outbound-registration-container">
      {/* 1. 頁面標題 */}
      <div className="dn-header-main">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="icon-box-dn">
            <ClipboardList size={24} color="white" />
          </div>
          <div>
            <h1 className="dn-title">出貨單建檔 (Delivery Note Registration)</h1>
            <p className="dn-subtitle">建立新的出貨申請單，支援設備序號自動導出與耗材選取</p>
          </div>
        </div>
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

          {/* 設備序號搜尋 */}
          <div className="dn-card">
            <div className="dn-card-header">
              <Cpu size={18} /> <span>設備/硬體序號匯入 (S/N Scan)</span>
            </div>
            <form className="sn-search-box" onSubmit={handleSnSearch}>
              <input 
                type="text" 
                placeholder="輸入設備或硬體序號"
                value={snInput}
                onChange={e => setSnInput(e.target.value)}
              />
              <button type="submit" disabled={isSearching}>
                {isSearching ? <Loader2 className="spinner" size={14} /> : <Search size={14} />}
                搜尋並加入
              </button>
            </form>
            <p className="dn-hint">系統會自動識別資產類別並帶出型號、規格與搭載元件</p>
          </div>

          {/* 耗材快選 (AI 設計) */}
          <div className="dn-card">
            <div className="dn-card-header">
              <Package size={18} /> <span>耗材品項快選 (Consumables)</span>
            </div>
            <div className="csm-search-mini">
              <Search size={14} />
              <input 
                type="text" 
                placeholder="快速過濾品項..." 
                value={csmSearchTerm}
                onChange={e => setCsmSearchTerm(e.target.value)}
              />
            </div>
            <div className="csm-fast-grid">
              {!csmSearchTerm ? (
                <div className="csm-empty-hint">
                  <Package size={24} opacity={0.3} />
                  <span>輸入關鍵字搜尋耗材...</span>
                </div>
              ) : filteredConsumables.length === 0 ? (
                <div className="csm-empty-hint">
                  <span>找不到匹配的品項</span>
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
                          <td className="col-actions">
                            <button onClick={() => removeItem(item.tempId)} className="btn-remove">
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                        {/* 搭載元件顯示 */}
                        {item.components && item.components.length > 0 && item.components.map(comp => (
                          <tr key={comp.sn} className="sub-row">
                            <td colSpan="2" className="col-sub-info">
                              <ChevronRight size={14} className="sub-arrow" />
                              <span className="sub-label">搭載硬體</span>
                              <span className="sub-model">{comp.brand} {comp.model} ({comp.type})</span>
                            </td>
                            <td className="col-sn"><code>{comp.sn}</code></td>
                            <td colSpan="2" className="col-sub-note">系統自動帶出</td>
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
