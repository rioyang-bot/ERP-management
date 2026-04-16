import React, { useContext } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { RoleContext } from '../../context/RoleContext';
import logo from '../../assets/logo.png';
import './MainLayout.css';

const MainLayout = () => {
  const { role, authUser, setAuthUser } = useContext(RoleContext);

  const allMenuItems = [
    { id: 'inventory', path: '/inventory', label: '庫存查閱 (Inventory)' },
    { id: 'inbound', path: '/inbound', label: '進貨入庫 (Inbound)' },
    { id: 'outbound', path: '/outbound', label: '出貨進銷 (Cart)' },
    { id: 'review', path: '/review', label: '出貨審核 (Review)' },
    { id: 'assets', path: '/assets', label: '資產建檔 (Asset)' },
    { id: 'assetList', path: '/asset-list', label: '資產列表 (Asset List)' },
    { id: 'consumables', path: '/consumables', label: '耗材建檔 (Items)' },
    { id: 'purchasing', path: '/purchasing', label: '採購建檔 (Procurement)' },
    { id: 'procurementList', path: '/procurement-list', label: '採購列表 (Procurement list)' },
    { id: 'partners', path: '/partners', label: '客戶/廠商管理 (Partners)' },
    { id: 'reports', path: '/reports', label: '報表匯出 (Reports)' },
    { id: 'settings', path: '/settings', label: '系統管理 (Accounts)' },
  ];

  const menuItems = allMenuItems.filter(item => authUser?.menu_access?.[item.id]);

  // (Removed unused pageTitle derivation)

  return (
    <div className="layout-container">
      {/* 側邊欄 */}
      <aside className="sidebar">
        <div className="sidebar-header" style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '24px' }}>
          <img src={logo} alt="Logo" style={{ width: '36px', height: '36px' }} />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1.2' }}>
            <span style={{ fontSize: '1.2rem', fontWeight: '800', letterSpacing: '1px' }}>METECH ERP</span>
            <span style={{ fontSize: '0.75rem', fontWeight: '400', opacity: '0.8', marginTop: '4px' }}>資產進銷存系統</span>
          </div>
        </div>
        <ul className="sidebar-nav">
          {menuItems.map(item => (
            <li key={item.id}>
              <NavLink
                to={item.path}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </aside>

      {/* 右側主要區域 */}
      <main className="main-content">
        <header className="topbar">
          <div className="user-info" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: '0.9rem', color: '#555' }}>
              嗨，<span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{authUser?.full_name}</span>！
            </span>
            <span style={{
              padding: '4px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600,
              backgroundColor: role === 'IT' ? '#e3f2fd' : (role === 'ADMIN' ? '#fff3e0' : '#e8f5e9'),
              color: role === 'IT' ? '#1976d2' : (role === 'ADMIN' ? '#e65100' : '#2e7d32')
            }}>
              目前權限: {role}
            </span>
            <button
              onClick={() => setAuthUser(null)}
              style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #ccc', backgroundColor: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              系統登出
            </button>
          </div>
        </header>

        {/* 實際內容 */}
        <div className="content-area">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default MainLayout;
