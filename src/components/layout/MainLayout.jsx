import React, { useContext } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { RoleContext } from '../../App';
import logo from '../../assets/logo.png';
import './MainLayout.css';

const MainLayout = () => {
  const { role, authUser, setAuthUser } = useContext(RoleContext);

  const itMenu = [
    { id: 'inventory', path: '/inventory', label: '庫存查閱 (Inventory)' },
    { id: 'outbound', path: '/outbound', label: '出貨申請 (Cart)' },
    { id: 'reports', path: '/reports', label: '報表匯出 (Reports)' },
  ];

  const warehouseMenu = [
    { id: 'inventory', path: '/inventory', label: '庫存總表 (Inventory)' },
    { id: 'review', path: '/review', label: '出貨審核 (Review)' },
    { id: 'inbound', path: '/inbound', label: '進貨入庫 (Inbound)' },
    { id: 'assets', path: '/assets', label: '資產建檔 (Items)' },
    { id: 'partners', path: '/partners', label: '客戶/廠商管理 (Partners)' },
    { id: 'reports', path: '/reports', label: '報表匯出 (Reports)' },
  ];

  const adminMenu = [
    { id: 'settings', path: '/settings', label: '系統與帳號管理 (Accounts)' },
  ];

  const menuItems = role === 'IT' ? itMenu : (role === 'ADMIN' ? adminMenu : warehouseMenu);

  // (Removed unused pageTitle derivation)

  return (
    <div className="layout-container">
      {/* 側邊欄 */}
      <aside className="sidebar">
        <div className="sidebar-header" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img src={logo} alt="Logo" style={{ width: '32px', height: '32px' }} />
          ERP 系統
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
