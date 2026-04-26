import React, { useContext, useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { RoleContext } from '../../context/RoleContext';
import logo from '../../assets/logo.png';
import { ChevronDown, ChevronRight } from 'lucide-react';
import './MainLayout.css';

const MainLayout = () => {
  const { role, authUser, setAuthUser } = useContext(RoleContext);
  const [deviceBrands, setDeviceBrands] = useState([]);
  const [consumableTypes, setConsumableTypes] = useState([]);
  const [nicTypes, setNicTypes] = useState([]);
  const [isDeviceListExpanded, setIsDeviceListExpanded] = useState(true);
  const [isConsumableListExpanded, setIsConsumableListExpanded] = useState(true);
  const [isNicListExpanded, setIsNicListExpanded] = useState(true);
  const location = useLocation();

  useEffect(() => {
    const fetchDeviceBrands = async () => {
      const res = await window.electronAPI.namedQuery('fetchMenuAssetBrands');
      if (res.success) setDeviceBrands(res.rows.map(r => r.brand));
    };

    const fetchConsumableTypes = async () => {
      const res = await window.electronAPI.namedQuery('fetchMenuConsumableTypes');
      if (res.success) setConsumableTypes(res.rows.map(r => r.type));
    };

    const fetchNicTypes = async () => {
      const res = await window.electronAPI.namedQuery('fetchMenuNicTypes');
      if (res.success) setNicTypes(res.rows.map(r => r.type));
    };
    
    fetchDeviceBrands();
    fetchConsumableTypes();
    fetchNicTypes();

    const handleDbUpdate = () => {
      fetchDeviceBrands();
      fetchConsumableTypes();
      fetchNicTypes();
    };
    window.addEventListener('db-update', handleDbUpdate);
    return () => window.removeEventListener('db-update', handleDbUpdate);
  }, [location.pathname, location.search]);

  const allMenuItems = [
    { id: 'inventory', path: '/inventory', label: '庫存查閱 (Inventory)' },
    { id: 'inbound', path: '/inbound', label: '進貨入庫 (Inbound)' },
    { id: 'outbound', path: '/outbound', label: '出貨進銷 (Cart)' },
    { id: 'review', path: '/review', label: '出貨審核 (Review)' },
    { id: 'assets', path: '/devices', label: '設備管理 (Device Reg)' },
    { id: 'assetList', path: '/device-list', label: '設備列表 (Device List)', hasSub: true },
    { id: 'nic-registration', path: '/hw-registration', label: '硬體建檔 (HW Reg)' },
    { id: 'nic-list', path: '/hw-list', label: '硬體列表 (HW List)', hasSub: true },
    { id: 'consumables', path: '/consumables', label: '耗材建檔 (Items)' },
    { id: 'consumableList', path: '/consumable-list', label: '耗材列表 (Items List)', hasSub: true },
    { id: 'purchasing', path: '/purchasing', label: '採購建檔 (Procurement)' },
    { id: 'procurementList', path: '/procurement-list', label: '採購列表 (Procurement list)' },
    { id: 'partners', path: '/partners', label: '客戶/廠商管理 (Partners)' },
    { id: 'reports', path: '/reports', label: '報表匯出 (Reports)' },
    { id: 'settings', path: '/settings', label: '系統管理 (Accounts)' },
  ];

  const menuItems = allMenuItems.filter(item => authUser?.menu_access?.[item.id]);

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
            <li key={item.id}>
              {item.id === 'assetList' ? (
                <>
                  <div onClick={() => setIsDeviceListExpanded(!isDeviceListExpanded)} className={`nav-item ${location.pathname === '/device-list' ? 'active' : ''}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                    <NavLink to="/device-list" onClick={(e) => e.stopPropagation()} style={{ flex: 1, color: 'inherit', textDecoration: 'none' }}>{item.label}</NavLink>
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
                  <div onClick={() => setIsConsumableListExpanded(!isConsumableListExpanded)} className={`nav-item ${location.pathname === '/consumable-list' ? 'active' : ''}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                    <NavLink to="/consumable-list" onClick={(e) => e.stopPropagation()} style={{ flex: 1, color: 'inherit', textDecoration: 'none' }}>{item.label}</NavLink>
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
                  <div onClick={() => setIsNicListExpanded(!isNicListExpanded)} className={`nav-item ${location.pathname === '/hw-list' ? 'active' : ''}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                    <NavLink to="/hw-list" onClick={(e) => e.stopPropagation()} style={{ flex: 1, color: 'inherit', textDecoration: 'none' }}>{item.label}</NavLink>
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
              ) : (
                <NavLink to={item.path} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>{item.label}</NavLink>
              )}
            </li>
          ))}
        </ul>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="user-info" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: '0.9rem', color: '#555' }}>嗨，<span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{authUser?.full_name}</span>！</span>
            <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600, backgroundColor: role === 'IT' ? '#e3f2fd' : (role === 'ADMIN' ? '#fff3e0' : '#e8f5e9'), color: role === 'IT' ? '#1976d2' : (role === 'ADMIN' ? '#e65100' : '#2e7d32') }}>目前權限: {role}</span>
            <button onClick={() => setAuthUser(null)} style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #ccc', backgroundColor: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}>系統登出</button>
          </div>
        </header>
        <div className="content-area"><Outlet /></div>
      </main>
    </div>
  );
};

export default MainLayout;
