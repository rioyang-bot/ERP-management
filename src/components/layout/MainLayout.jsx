import React, { useContext, useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { RoleContext } from '../../context/RoleContext';
import { useTheme } from '../../context/ThemeContext';
import logo from '../../assets/logo.png';
import { ChevronRight, Key, X, Sun, Moon, LogOut, Plus } from 'lucide-react';
import { hashPassword, validatePassword } from '../../utils/auth';
import LiveEventDrawer from './LiveEventDrawer';
import './MainLayout.css';

const MainLayout = () => {
  const { role, authUser, setAuthUser } = useContext(RoleContext);
  const { theme, isDark, toggleTheme } = useTheme();
  const location = useLocation();

  // --- 即時事件抽屜 (Live Events Drawer) ---
  const [showLiveEvents, setShowLiveEvents] = useState(false);

  // --- 登出確認 (Logout Confirmation) ---
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleLogout = () => {
    setShowLogoutConfirm(false);
    localStorage.removeItem('erp_session');
    setAuthUser(null);
  };

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

    try {
      setIsPwdUpdating(true);
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

      // 1. 驗證原密碼
      const hashedOld = await hashPassword(pwdOld);
      const res = await window.electronAPI.namedQuery('fetchUserById', [authUser.id]);
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

  // --- 選單排序邏輯 ---
  const [menuOrder, setMenuOrder] = useState(() => {
    const saved = localStorage.getItem('sidebar_menu_order');
    return saved ? JSON.parse(saved) : null;
  });
  const [draggingMenuId, setDraggingMenuId] = useState(null);

  const allMenuItems = [
    { id: 'overview', path: '/overview', label: '營運總覽 (Overview)' },
    { id: 'inboundList', path: '/inbound-list', label: '進貨單列表(S/I List)' },
    { id: 'dnList', path: '/dn-list', label: '出貨單列表 (D/N List)' },
    { id: 'lentList', path: '/lent-list', label: '借用列表 (Lent List)' },
    { id: 'repairList', path: '/repair-list', label: '維修單列表 (Repair List)' },
    { id: 'assetList', path: '/device-list', label: '設備列表 (Device List)', hasSub: true },
    { id: 'nic-list', path: '/hw-list', label: '硬體列表 (HW List)', hasSub: true },
    { id: 'consumable-list', path: '/consumable-list', label: '耗材列表 (CSM List)', hasSub: true },
    { id: 'procurementList', path: '/procurement-list', label: '採購單列表 (P/O List)' },
    { id: 'partners', path: '/partners', label: '客戶/廠商管理 (Partners)' },
    { id: 'projects', path: '/projects', label: '專案列表 (Project List)' },
    { id: 'reports', path: '/reports', label: '報表中心 (Reports)', hasSub: true },
    { id: 'settings', path: '/settings', label: '系統管理 (Accounts)' },
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
    const accessAllowed = 
      authUser?.role === 'ADMIN' || 
      authUser?.menu_access?.[item.id] ||
      (item.id === 'overview' && (authUser?.menu_access?.['overview'] !== false)) ||
      (item.id === 'inboundList' && authUser?.menu_access?.['inbound']) ||
      (item.id === 'dnList' && authUser?.menu_access?.['outbound']) ||
      (item.id === 'lentList' && (authUser?.menu_access?.['outbound'] || authUser?.menu_access?.['lentList'])) ||
      (item.id === 'repairList' && (authUser?.menu_access?.['outbound'] || authUser?.menu_access?.['assets'] || authUser?.menu_access?.['repairList'] !== false)) ||
      (item.id === 'assetList' && authUser?.menu_access?.['assets']) ||
      (item.id === 'nic-list' && authUser?.menu_access?.['nic-registration']) ||
      (item.id === 'consumable-list' && (authUser?.menu_access?.['consumables'] || authUser?.menu_access?.['consumableList'])) ||
      (item.id === 'procurementList' && authUser?.menu_access?.['purchasing']);
    return accessAllowed;
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
              <NavLink to={item.path} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{item.label}</span>
                  {item.hasSub && <ChevronRight size={16} opacity={0.5} />}
                </div>
              </NavLink>
            </li>
          ))}
        </ul>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="user-info" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            {/* 日夜模式切換按鈕 */}
            <button 
              onClick={toggleTheme} 
              className="theme-switch-btn"
              title={isDark ? "切換至日間模式 (Light Mode)" : "切換至夜間模式 (Dark Mode)"}
            >
              {isDark ? <Sun size={15} color="#f59e0b" /> : <Moon size={15} color="#6366f1" />}
              <span>{isDark ? '夜間模式' : '日間模式'}</span>
            </button>

            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              嗨，<span style={{ fontWeight: 700, color: 'var(--primary-color)' }}>{authUser?.full_name}</span>！
            </span>
            
            <span style={{ 
              padding: '4px 12px', 
              borderRadius: '20px', 
              fontSize: '0.8rem', 
              fontWeight: 700, 
              backgroundColor: isDark 
                ? (role === 'IT' ? 'rgba(59,130,246,0.2)' : (role === 'ADMIN' ? 'rgba(249,115,22,0.2)' : 'rgba(16,185,129,0.2)'))
                : (role === 'IT' ? '#e3f2fd' : (role === 'ADMIN' ? '#fff3e0' : '#e8f5e9')), 
              color: isDark
                ? (role === 'IT' ? '#60a5fa' : (role === 'ADMIN' ? '#fb923c' : '#34d399'))
                : (role === 'IT' ? '#1976d2' : (role === 'ADMIN' ? '#e65100' : '#2e7d32')),
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'transparent'}`
            }}>
              目前權限: {role}
            </span>

            <button 
              onClick={() => setShowPasswordModal(true)} 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '6px', 
                padding: '6px 12px', 
                borderRadius: '8px', 
                border: '1px solid var(--border-color)', 
                backgroundColor: 'var(--bg-surface-subtle)', 
                color: 'var(--text-main)', 
                cursor: 'pointer', 
                fontSize: '0.85rem', 
                fontWeight: 600 
              }}
            >
              <Key size={14} /> 變更密碼
            </button>

            <button 
              onClick={() => setShowLogoutConfirm(true)} 
              style={{ 
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px', 
                borderRadius: '8px', 
                border: '1px solid var(--border-color)', 
                backgroundColor: 'var(--bg-surface)', 
                color: 'var(--text-main)',
                cursor: 'pointer', 
                fontSize: '0.85rem',
                fontWeight: 600
              }}
            >
              <LogOut size={14} /> 系統登出
            </button>

            {/* 即時事件串流抽屜切換按鈕 (+) */}
            <button 
              onClick={() => setShowLiveEvents(prev => !prev)}
              className="live-events-toggle-btn"
              title="即時事件串流 (Live Event Stream)"
              style={{ 
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                border: showLiveEvents ? '1px solid var(--primary-color)' : '1px solid var(--border-color)',
                backgroundColor: showLiveEvents ? 'var(--primary-color)' : 'var(--bg-surface-subtle)',
                color: showLiveEvents ? '#ffffff' : 'var(--text-main)',
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                position: 'relative',
                boxShadow: showLiveEvents ? '0 0 12px rgba(37, 99, 235, 0.4)' : 'none'
              }}
            >
              <Plus 
                size={20} 
                style={{ 
                  transform: showLiveEvents ? 'rotate(45deg)' : 'rotate(0deg)', 
                  transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)' 
                }} 
              />
              {/* 即時綠色指示點 */}
              <span style={{
                position: 'absolute',
                top: '-2px',
                right: '-2px',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#10b981',
                boxShadow: '0 0 6px #10b981'
              }} />
            </button>
          </div>
        </header>
        <div className="content-area"><Outlet /></div>
      </main>

      {/* 向左攤開的即時事件串流抽屜 */}
      <LiveEventDrawer isOpen={showLiveEvents} onClose={() => setShowLiveEvents(false)} />

      {/* 變更密碼 Modal */}
      {showPasswordModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'var(--bg-modal-overlay)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '28px', width: '400px', boxShadow: 'var(--modal-shadow)', color: 'var(--text-main)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '1.25rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)', fontWeight: 800 }}>
                <Key size={20} color="var(--primary-color)" /> 變更密碼
              </h2>
              <button onClick={() => setShowPasswordModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>
            
            {pwdError && <div style={{ backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#fef2f2', color: isDark ? '#f87171' : '#dc2626', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.85rem', fontWeight: 600 }}>{pwdError}</div>}
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 700 }}>原密碼</label>
                <input type="password" value={pwdOld} onChange={e => setPwdOld(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', fontSize: '0.9rem', boxSizing: 'border-box' }} placeholder="請輸入原密碼" />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 700 }}>新密碼</label>
                <input type="password" value={pwdNew} onChange={e => setPwdNew(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', fontSize: '0.9rem', boxSizing: 'border-box' }} placeholder="請輸入新密碼" />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 700 }}>確認新密碼</label>
                <input type="password" value={pwdConfirm} onChange={e => setPwdConfirm(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', fontSize: '0.9rem', boxSizing: 'border-box' }} placeholder="請再次輸入新密碼" />
              </div>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button 
                onClick={() => setShowPasswordModal(false)}
                style={{ padding: '8px 18px', backgroundColor: 'var(--bg-surface-subtle)', border: '1px solid var(--border-color)', borderRadius: '8px', color: 'var(--text-main)', cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem' }}
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

      {/* 登出確認 Modal */}
      {showLogoutConfirm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          backgroundColor: 'var(--bg-modal-overlay)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            padding: '28px',
            width: '380px',
            maxWidth: '90vw',
            boxShadow: 'var(--modal-shadow)',
            color: 'var(--text-main)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                backgroundColor: 'rgba(239, 68, 68, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ef4444'
              }}>
                <LogOut size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)' }}>確認登出系統</h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>確定要結束目前的作業連線？</span>
              </div>
            </div>

            <p style={{ margin: '0 0 24px 0', fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
              登出後系統將清除當前登入階段，您需要重新輸入帳號與密碼方可再次使用系統。
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setShowLogoutConfirm(false)}
                style={{
                  padding: '8px 18px',
                  backgroundColor: 'var(--bg-surface-subtle)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  color: 'var(--text-main)',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.85rem'
                }}
              >
                取消
              </button>
              <button
                onClick={handleLogout}
                style={{
                  padding: '8px 20px',
                  backgroundColor: '#ef4444',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  boxShadow: '0 2px 8px rgba(239, 68, 68, 0.3)'
                }}
              >
                確認登出
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MainLayout;
