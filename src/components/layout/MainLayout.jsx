import React, { useContext, useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { RoleContext } from '../../context/RoleContext';
import logo from '../../assets/logo.png';
import { ChevronDown, ChevronRight, Edit3, List, LayoutGrid, Key, X } from 'lucide-react';
import { hashPassword, validatePassword } from '../../utils/auth';
import './MainLayout.css';

const MainLayout = () => {
  const { role, authUser, setAuthUser } = useContext(RoleContext);
  const [deviceBrands, setDeviceBrands] = useState([]);
  const [consumableTypes, setConsumableTypes] = useState([]);
  const [nicTypes, setNicTypes] = useState([]);
  const location = useLocation();
  const [isDeviceListExpanded, setIsDeviceListExpanded] = useState(location.pathname === '/device-list');
  const [isConsumableListExpanded, setIsConsumableListExpanded] = useState(location.pathname === '/consumable-list');
  const [isNicListExpanded, setIsNicListExpanded] = useState(location.pathname === '/hw-list');
  const [isReportsExpanded, setIsReportsExpanded] = useState(location.pathname === '/reports' || location.pathname === '/pj-report');
  const [prevPath, setPrevPath] = useState(location.pathname);

  // --- 變更密碼 (Change Password) ---
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pwdOld, setPwdOld] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [pwdConfirm, setPwdConfirm] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [isPwdUpdating, setIsPwdUpdating] = useState(false);

  const handlePasswordUpdate = async () => {
    setPwdError('');
    if (!pwdOld || !pwdNew || !pwdConfirm) {
      setPwdError('所有欄位皆為必填');
      return;
    }
    if (pwdNew !== pwdConfirm) {
      setPwdError('新密碼與確認密碼不一致');
      return;
    }
    setIsPwdUpdating(true);
    try {
      // 0. 拿取最新的密碼安全原則，如果系統已設定原則則進行驗證
      const policyRes = await window.electronAPI.namedQuery('getSystemSetting', ['password_policy']);
      if (policyRes.success && policyRes.rows.length > 0) {
        const policy = policyRes.rows[0].value;
        if (policy?.enabled) {
          const { isValid, message } = validatePassword(pwdNew, policy);
          if (!isValid) {
            setPwdError('密碼不符合安全性原則：' + message);
            setIsPwdUpdating(false);
            return;
          }
        }
      }

      // 1. 驗證舊密碼
      const hashedOld = await hashPassword(pwdOld);
      const res = await window.electronAPI.authLogin(authUser.username);
      if (res.success && res.rows.length > 0) {
        if (res.rows[0].password_hash !== hashedOld) {
          setPwdError('原密碼錯誤');
          setIsPwdUpdating(false);
          return;
        }
      } else {
        setPwdError('無法驗證原密碼');
        setIsPwdUpdating(false);
        return;
      }
      
      // 2. 更新為新密碼
      const hashedNew = await hashPassword(pwdNew);
      const updateRes = await window.electronAPI.namedQuery('updateUserPassword', [hashedNew, authUser.id]);
      if (updateRes.success) {
        alert('密碼變更成功，下次登入請使用新密碼。');
        setShowPasswordModal(false);
        setPwdOld('');
        setPwdNew('');
        setPwdConfirm('');
      } else {
        setPwdError('變更密碼失敗：' + updateRes.error);
      }
    } catch (err) {
      console.error(err);
      setPwdError('處理過程中發生錯誤');
    } finally {
      setIsPwdUpdating(false);
    }
  };

  // --- 全域導航列模式 (Global Sidebar Mode) ---
  const [sidebarMode, setSidebarMode] = useState(() => {
    return localStorage.getItem('erp_sidebar_mode') || 'all'; // 'registration', 'list', 'all'
  });

  useEffect(() => {
    localStorage.setItem('erp_sidebar_mode', sidebarMode);
  }, [sidebarMode]);

  // --- 選單自動同步邏輯 (在渲染期間處理，避免 useEffect 連鎖渲染) ---
  if (location.pathname !== prevPath) {
    setPrevPath(location.pathname);
    if (location.pathname === '/device-list') {
      setIsDeviceListExpanded(true);
      setIsConsumableListExpanded(false);
      setIsNicListExpanded(false);
    } else if (location.pathname === '/consumable-list') {
      setIsConsumableListExpanded(true);
      setIsDeviceListExpanded(false);
      setIsNicListExpanded(false);
    } else if (location.pathname === '/hw-list') {
      setIsNicListExpanded(true);
      setIsDeviceListExpanded(false);
      setIsConsumableListExpanded(false);
    } else if (location.pathname === '/reports' || location.pathname === '/pj-report' || location.pathname === '/stocktaking') {
      setIsReportsExpanded(true);
    }
  }

  // --- 選單排序邏輯 ---
  const [menuOrder, setMenuOrder] = useState(() => {
    const saved = localStorage.getItem('sidebar_menu_order');
    return saved ? JSON.parse(saved) : null;
  });
  const [draggingMenuId, setDraggingMenuId] = useState(null);

  useEffect(() => {
    const fetchMenuData = async () => {
      // 讀取汰舊狀態
      const deviceRetired = JSON.parse(localStorage.getItem('device_list_retired_keys') || '[]');
      const hwRetired = JSON.parse(localStorage.getItem('hw_list_retired_keys') || '[]');
      const csmRetired = JSON.parse(localStorage.getItem('consumable_list_retired_keys') || '[]');

      // 1. 處理設備選單 (以 Brand 分類)
      const devRes = await window.electronAPI.namedQuery('fetchFullDeviceStructure');
      if (devRes.success) {
        const brands = [...new Set(devRes.rows.map(r => r.brand))].sort();
        const activeBrands = brands.filter(b => {
          const items = devRes.rows.filter(r => r.brand === b);
          // 只要有一款型號沒被汰舊，就顯示該品牌
          return items.some(i => !deviceRetired.includes(`${i.brand} - ${i.type} - ${i.model}`));
        });
        setDeviceBrands(activeBrands);
      }

      // 2. 處理耗材選單 (以 Type 分類)
      const csmRes = await window.electronAPI.namedQuery('fetchFullConsumableStructure');
      if (csmRes.success) {
        const types = [...new Set(csmRes.rows.map(r => r.type))].sort();
        const activeTypes = types.filter(t => {
          const items = csmRes.rows.filter(r => r.type === t);
          return items.some(i => !csmRetired.includes(`${i.brand} - ${i.type} - ${i.model}`));
        });
        setConsumableTypes(activeTypes);
      }

      // 3. 處理硬體選單 (以 Type 分類)
      const hwRes = await window.electronAPI.namedQuery('fetchFullNicStructure');
      if (hwRes.success) {
        const types = [...new Set(hwRes.rows.map(r => r.type))].sort();
        const activeTypes = types.filter(t => {
          const items = hwRes.rows.filter(r => r.type === t);
          return items.some(i => !hwRetired.includes(`${i.brand} - ${i.type} - ${i.model}`));
        });
        setNicTypes(activeTypes);
      }
    };
    
    fetchMenuData();

    const handleUpdate = () => fetchMenuData();
    window.addEventListener('db-update', handleUpdate);
    window.addEventListener('retired-update', handleUpdate);
    return () => {
      window.removeEventListener('db-update', handleUpdate);
      window.removeEventListener('retired-update', handleUpdate);
    };
  }, [location.pathname]); // 僅在路徑變動時執行資料獲取與狀態同步


  const allMenuItems = [
    { id: 'inbound', path: '/inbound', label: '進貨入庫(S/I Reg)', category: 'registration' },
    { id: 'inboundList', path: '/inbound-list', label: '進貨單列表(S/I List)', category: 'list' },
    { id: 'outbound', path: '/outbound', label: '出貨建檔 (D/N Reg)', category: 'registration' },
    { id: 'dnList', path: '/dn-list', label: '出貨單列表 (D/N List)', category: 'list' },
    { id: 'lentList', path: '/lent-list', label: '借用列表 (Lent List)', category: 'list' },
    { id: 'assets', path: '/devices', label: '設備建檔 (Device Reg)', category: 'registration' },
    { id: 'assetList', path: '/device-list', label: '設備列表 (Device List)', hasSub: true, category: 'list' },
    { id: 'nic-registration', path: '/hw-registration', label: '硬體建檔 (HW Reg)', category: 'registration' },
    { id: 'nic-list', path: '/hw-list', label: '硬體列表 (HW List)', hasSub: true, category: 'list' },
    { id: 'consumables', path: '/consumables', label: '耗材建檔 (CSM Reg)', category: 'registration' },
    { id: 'consumableList', path: '/consumable-list', label: '耗材列表 (CSM List)', hasSub: true, category: 'list' },
    { id: 'purchasing', path: '/purchasing', label: '採購建檔 (P/O Reg)', category: 'registration' },
    { id: 'procurementList', path: '/procurement-list', label: '採購單列表 (P/O List)', category: 'list' },
    { id: 'partners', path: '/partners', label: '客戶/廠商管理 (Partners)', category: 'shared' },
    { id: 'projects', path: '/projects', label: '專案列表 (Project List)', category: 'shared' },
    { id: 'reports', path: '/reports', label: '報表中心 (Reports)', hasSub: true, category: 'shared' },
    { id: 'settings', path: '/settings', label: '系統管理 (Accounts)', category: 'shared' },
  ];

  // 排序並過濾選單
  const sortedAllItems = [...allMenuItems];
  if (menuOrder) {
    sortedAllItems.sort((a, b) => {
      const idxA = menuOrder.indexOf(a.id);
      const idxB = menuOrder.indexOf(b.id);
      if (idxA === -1 && idxB === -1) return 0;
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });
  }
  const menuItems = sortedAllItems.filter(item => {
    const accessAllowed = authUser?.role === 'ADMIN' || authUser?.menu_access?.[item.id];
    if (!accessAllowed) return false;
    
    if (sidebarMode === 'all' || item.category === 'shared') return true;
    return item.category === sidebarMode;
  });

  // --- 選單拖曳事件 ---
  const handleMenuDragStart = (e, id) => {
    setDraggingMenuId(id);
    e.dataTransfer.setData('menuId', id);
    e.currentTarget.style.opacity = '0.4';
  };

  const handleMenuDragEnd = (e) => {
    setDraggingMenuId(null);
    e.currentTarget.style.opacity = '1';
  };

  const handleMenuDragOver = (e) => {
    e.preventDefault();
  };

  const handleMenuDrop = (e, targetId) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('menuId');
    if (sourceId === targetId) return;

    const currentOrder = menuOrder || allMenuItems.map(i => i.id);
    const newOrder = [...currentOrder];
    
    // 如果來源 ID 字串不在清單中（例如新功能），先補進去
    if (!newOrder.includes(sourceId)) newOrder.push(sourceId);
    if (!newOrder.includes(targetId)) newOrder.push(targetId);

    const sourceIdx = newOrder.indexOf(sourceId);
    const targetIdx = newOrder.indexOf(targetId);

    newOrder.splice(sourceIdx, 1);
    newOrder.splice(targetIdx, 0, sourceId);

    setMenuOrder(newOrder);
    localStorage.setItem('sidebar_menu_order', JSON.stringify(newOrder));
  };

  return (
    <div className="layout-container">
      <aside className="sidebar">
        <div className="sidebar-header" style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '24px' }}>
          <img src={logo} alt="Logo" style={{ width: '36px', height: '36px' }} />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1.2' }}>
            <span style={{ fontSize: '1.2rem', fontWeight: '800', letterSpacing: '1px' }}>METECH ERP</span>
            <span style={{ fontSize: '0.75rem', fontWeight: '400', opacity: '0.8', marginTop: '4px' }}>設備進銷存系統</span>
          </div>
        </div>
        <ul className="sidebar-nav">
          {menuItems.map(item => (
            <li 
              key={item.id} 
              draggable 
              onDragStart={(e) => handleMenuDragStart(e, item.id)}
              onDragEnd={handleMenuDragEnd}
              onDragOver={handleMenuDragOver}
              onDrop={(e) => handleMenuDrop(e, item.id)}
              style={{ cursor: 'move', transition: 'all 0.2s', borderLeft: draggingMenuId === item.id ? '2px solid var(--primary-color)' : 'none' }}
            >
              {item.id === 'assetList' ? (
                <>
                  <div onClick={() => {
                    const next = !isDeviceListExpanded;
                    setIsDeviceListExpanded(next);
                    if (next) { setIsConsumableListExpanded(false); setIsNicListExpanded(false); }
                  }} className={`nav-item ${location.pathname === '/device-list' ? 'active' : ''}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                    <NavLink to="/device-list" onClick={(e) => {
                      e.stopPropagation();
                      if (!isDeviceListExpanded) {
                        setIsDeviceListExpanded(true);
                        setIsConsumableListExpanded(false);
                        setIsNicListExpanded(false);
                      }
                    }} style={{ flex: 1, color: 'inherit', textDecoration: 'none' }}>{item.label}</NavLink>
                    {isDeviceListExpanded ? <ChevronDown size={16} opacity={0.5} /> : <ChevronRight size={16} opacity={0.5} />}
                  </div>
                  {isDeviceListExpanded && (
                    <ul style={{ listStyle: 'none', paddingLeft: '12px', marginTop: '4px' }}>
                      {deviceBrands.map(brand => (
                        <li key={brand}><NavLink to={`/device-list?brand=${encodeURIComponent(brand)}`} className={({ isActive }) => `nav-sub-item ${isActive && location.search.includes(brand) ? 'active' : ''}`}>• {brand}</NavLink></li>
                      ))}
                    </ul>
                  )}
                </>
              ) : item.id === 'consumableList' ? (
                <>
                  <div onClick={() => {
                    const next = !isConsumableListExpanded;
                    setIsConsumableListExpanded(next);
                    if (next) { setIsDeviceListExpanded(false); setIsNicListExpanded(false); }
                  }} className={`nav-item ${location.pathname === '/consumable-list' ? 'active' : ''}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                    <NavLink to="/consumable-list" onClick={(e) => {
                      e.stopPropagation();
                      if (!isConsumableListExpanded) {
                        setIsConsumableListExpanded(true);
                        setIsDeviceListExpanded(false);
                        setIsNicListExpanded(false);
                      }
                    }} style={{ flex: 1, color: 'inherit', textDecoration: 'none' }}>{item.label}</NavLink>
                    {isConsumableListExpanded ? <ChevronDown size={16} opacity={0.5} /> : <ChevronRight size={16} opacity={0.5} />}
                  </div>
                  {isConsumableListExpanded && (
                    <ul style={{ listStyle: 'none', paddingLeft: '12px', marginTop: '4px' }}>
                      {consumableTypes.map(type => (
                        <li key={type}><NavLink to={`/consumable-list?type=${encodeURIComponent(type)}`} className={({ isActive }) => `nav-sub-item ${isActive && location.search.includes(type) ? 'active' : ''}`}>• {type}</NavLink></li>
                      ))}
                    </ul>
                  )}
                </>
              ) : item.id === 'nic-list' ? (
                <>
                  <div onClick={() => {
                    const next = !isNicListExpanded;
                    setIsNicListExpanded(next);
                    if (next) { setIsDeviceListExpanded(false); setIsConsumableListExpanded(false); }
                  }} className={`nav-item ${location.pathname === '/hw-list' ? 'active' : ''}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                    <NavLink to="/hw-list" onClick={(e) => {
                      e.stopPropagation();
                      if (!isNicListExpanded) {
                        setIsNicListExpanded(true);
                        setIsDeviceListExpanded(false);
                        setIsConsumableListExpanded(false);
                      }
                    }} style={{ flex: 1, color: 'inherit', textDecoration: 'none' }}>{item.label}</NavLink>
                    {isNicListExpanded ? <ChevronDown size={16} opacity={0.5} /> : <ChevronRight size={16} opacity={0.5} />}
                  </div>
                  {isNicListExpanded && (
                    <ul style={{ listStyle: 'none', paddingLeft: '12px', marginTop: '4px' }}>
                      {nicTypes.map(type => (
                        <li key={type}><NavLink to={`/hw-list?type=${encodeURIComponent(type)}`} className={({ isActive }) => `nav-sub-item ${isActive && location.search.includes(type) ? 'active' : ''}`}>• {type}</NavLink></li>
                      ))}
                    </ul>
                  )}
                </>
              ) : item.id === 'reports' ? (
                <>
                  <div onClick={() => {
                    const next = !isReportsExpanded;
                    setIsReportsExpanded(next);
                  }} className={`nav-item ${location.pathname === '/reports' || location.pathname === '/pj-report' || location.pathname === '/stocktaking' ? 'active' : ''}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                    <NavLink to="/reports" onClick={(e) => {
                      e.stopPropagation();
                      if (!isReportsExpanded) {
                        setIsReportsExpanded(true);
                      }
                    }} style={{ flex: 1, color: 'inherit', textDecoration: 'none' }}>{item.label}</NavLink>
                    {isReportsExpanded ? <ChevronDown size={16} opacity={0.5} /> : <ChevronRight size={16} opacity={0.5} />}
                  </div>
                  {isReportsExpanded && (
                    <ul style={{ listStyle: 'none', paddingLeft: '12px', marginTop: '4px' }}>
                      <li>
                        <NavLink to="/pj-report" className={({ isActive }) => `nav-sub-item ${isActive ? 'active' : ''}`}>
                          • 專案報表 (PJ Report)
                        </NavLink>
                      </li>
                      <li>
                        <NavLink to="/stocktaking" className={({ isActive }) => `nav-sub-item ${isActive ? 'active' : ''}`}>
                          • 庫存盤點總表 (Stocktaking)
                        </NavLink>
                      </li>
                    </ul>
                  )}
                </>
              ) : (
                <NavLink to={item.path} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>{item.label}</NavLink>
              )}
            </li>
          ))}
        </ul>
        
        {/* 全域模式切換區塊 */}
        <div className="sidebar-footer">
          <div className="mode-toggle-group">
            <button 
              className={`mode-toggle-btn ${sidebarMode === 'registration' ? 'active' : ''}`}
              onClick={() => setSidebarMode('registration')}
              title="僅顯示建檔功能"
            >
              <Edit3 size={14} /> 建檔
            </button>
            <button 
              className={`mode-toggle-btn ${sidebarMode === 'list' ? 'active' : ''}`}
              onClick={() => setSidebarMode('list')}
              title="僅顯示清單功能"
            >
              <List size={14} /> 清單
            </button>
            <button 
              className={`mode-toggle-btn ${sidebarMode === 'all' ? 'active' : ''}`}
              onClick={() => setSidebarMode('all')}
              title="顯示所有功能"
            >
              <LayoutGrid size={14} /> 全部
            </button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="user-info" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: '0.9rem', color: '#555' }}>嗨，<span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{authUser?.full_name}</span>！</span>
            <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600, backgroundColor: role === 'IT' ? '#e3f2fd' : (role === 'ADMIN' ? '#fff3e0' : '#e8f5e9'), color: role === 'IT' ? '#1976d2' : (role === 'ADMIN' ? '#e65100' : '#2e7d32') }}>目前權限: {role}</span>
            <button onClick={() => setShowPasswordModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', color: '#475569', cursor: 'pointer', fontSize: '0.85rem', transition: 'all 0.2s', fontWeight: 600 }}>
              <Key size={14} /> 變更密碼
            </button>
            <button onClick={() => setAuthUser(null)} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #ccc', backgroundColor: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}>系統登出</button>
          </div>
        </header>
        <div className="content-area"><Outlet /></div>
      </main>

      {/* 變更密碼 Modal */}
      {showPasswordModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '24px', width: '380px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '1.25rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}><Key size={20} color="#059669" /> 變更密碼</h2>
              <button onClick={() => setShowPasswordModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={20} /></button>
            </div>
            
            {pwdError && <div style={{ backgroundColor: '#fef2f2', color: '#dc2626', padding: '10px', borderRadius: '6px', marginBottom: '16px', fontSize: '0.85rem' }}>{pwdError}</div>}
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem', color: '#475569', fontWeight: 600 }}>原密碼</label>
                <input type="password" value={pwdOld} onChange={e => setPwdOld(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', boxSizing: 'border-box' }} placeholder="請輸入原密碼" />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem', color: '#475569', fontWeight: 600 }}>新密碼</label>
                <input type="password" value={pwdNew} onChange={e => setPwdNew(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', boxSizing: 'border-box' }} placeholder="請輸入新密碼" />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85rem', color: '#475569', fontWeight: 600 }}>確認新密碼</label>
                <input type="password" value={pwdConfirm} onChange={e => setPwdConfirm(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', boxSizing: 'border-box' }} placeholder="請再次輸入新密碼" />
              </div>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button 
                onClick={() => setShowPasswordModal(false)}
                style={{ padding: '8px 16px', backgroundColor: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', color: '#475569', cursor: 'pointer', fontWeight: 600 }}
              >
                取消
              </button>
              <button 
                onClick={handlePasswordUpdate}
                disabled={isPwdUpdating}
                style={{ padding: '8px 16px', backgroundColor: '#059669', border: 'none', borderRadius: '6px', color: '#fff', cursor: isPwdUpdating ? 'not-allowed' : 'pointer', fontWeight: 600 }}
              >
                {isPwdUpdating ? '儲存中...' : '確認變更'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MainLayout;
