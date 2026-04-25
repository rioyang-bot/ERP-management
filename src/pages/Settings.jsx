import React, { useState, useEffect, useCallback, useContext } from 'react';
import { RoleContext } from '../context/RoleContext';
import { hashPassword } from '../utils/auth';
import { Shield, User, Settings as SettingsIcon, CheckSquare, Square, X, Save, Key } from 'lucide-react';

const MENU_OPTIONS = [
  { id: 'inventory', label: '庫存查閱 (Inventory)' },
  { id: 'inbound', label: '進貨入庫 (Inbound)' },
  { id: 'outbound', label: '出貨進銷 (Cart)' },
  { id: 'review', label: '出貨審核 (Review)' },
  { id: 'assets', label: '設備建檔 (Device)' },
  { id: 'assetList', label: '設備列表 (Equipments)' },
  { id: 'consumables', label: '耗材建檔 (Items)' },
  { id: 'consumableList', label: '耗材列表 (Items List)' },
  { id: 'purchasing', label: '採購建檔 (Procurement)' },
  { id: 'procurementList', label: '採購列表 (Procurement list)' },
  { id: 'partners', label: '客戶/廠商管理 (Partners)' },
  { id: 'reports', label: '報表匯出 (Reports)' },
  { id: 'settings', label: '系統管理 (Accounts)' },
];

const Settings = () => {
  const { authUser, setAuthUser } = useContext(RoleContext);


  // User Management State
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'IT', full_name: '' });

  // Permission Modal State
  const [editingUser, setEditingUser] = useState(null);
  const [showPermissionModal, setShowPermissionModal] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    const res = await window.electronAPI.namedQuery('fetchUsers');
    if (res.success) {
      setUsers(res.rows);
    }
    setLoadingUsers(false);
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => fetchUsers());
  }, [fetchUsers]);

  const handleUserChange = (e) => {
    setNewUser({ ...newUser, [e.target.name]: e.target.value });
  };

  const handleAddUser = async () => {
    if (!newUser.username || !newUser.password) return alert('帳號密碼為必填');
    
    try {
      const hashedPassword = await hashPassword(newUser.password);
      
      // 根據角色給予預設權限
      const defaultAccess = 
        newUser.role === 'IT' ? { inventory: true, outbound: true, reports: true } :
        (newUser.role === 'WAREHOUSE' ? { inventory: true, review: true, inbound: true, assets: true, assetList: true, consumables: true, consumableList: true, partners: true, reports: true } :
        (newUser.role === 'PURCHASING' ? { inventory: true, purchasing: true, reports: true } : 
        { settings: true, inventory: true, inbound: true, outbound: true, review: true, assets: true, assetList: true, consumables: true, consumableList: true, purchasing: true, procurementList: true, partners: true, reports: true }));

      const res = await window.electronAPI.namedQuery(
        'insertUser',
        [newUser.username, hashedPassword, newUser.role, newUser.full_name, JSON.stringify(defaultAccess)]
      );

      if (res.success) {
        alert('控制台：帳號已成功寫入資料庫');
        await fetchUsers();
        setNewUser({ username: '', password: '', role: 'IT', full_name: '' });
      } else {
        alert('新增失敗：' + res.error);
      }
    } catch (err) {
      alert('處理失敗：' + err.message);
    }
  };

  const handleToggleActive = async (id, currentStatus) => {
    const res = await window.electronAPI.namedQuery('updateUserActive', [!currentStatus, id]);
    if (res.success) {
      await fetchUsers();
    }
  };

  const handleDeleteUser = async (id, username) => {
    if (username === 'admin') return alert('系統管理員帳號不可刪除'); 
    if (window.confirm(`確定要永久刪除帳號 [${username}] 嗎？此動作無法復原。`)) {
      const res = await window.electronAPI.namedQuery('deleteUser', [id]);
      if (res.success) {
        await fetchUsers();
      }
    }
  };

  const handleOpenPermissions = (user) => {
    setEditingUser({
      ...user,
      menu_access: user.menu_access || {}
    });
    setShowPermissionModal(true);
  };

  const handleTogglePermission = (menuId) => {
    setEditingUser(prev => ({
      ...prev,
      menu_access: {
        ...prev.menu_access,
        [menuId]: !prev.menu_access[menuId]
      }
    }));
  };

  const handleSavePermissions = async () => {
    const res = await window.electronAPI.namedQuery(
      'updateUserAccess',
      [JSON.stringify(editingUser.menu_access), editingUser.id]
    );

    if (res.success) {
      alert('權限更新成功');
      
      // 如果更新的是當前登入者，同步更新 Session
      if (editingUser.id === authUser.id) {
        setAuthUser({
          ...authUser,
          menu_access: editingUser.menu_access
        });
      }

      setShowPermissionModal(false);
      await fetchUsers();
    } else {
      alert('更新失敗：' + res.error);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', paddingBottom: '60px' }}>
      
      {/* 帳號權限管理 */}
      <div className="card-surface" style={{ padding: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '8px' }}>
          <h1 className="page-title" style={{ margin: 0 }}>帳號權限管理</h1>
          <span style={{ fontSize: '0.9rem', color: '#888' }}>(User Access Control)</span>
        </div>
        <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>管理人員可在此新增帳號，並透過「權限設定」針對每個使用者單獨開啟或關閉選單功能。</p>

        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '32px' }}>
          {/* 新增帳號表單 */}
          <div style={{ backgroundColor: '#fcfcfc', padding: '24px', borderRadius: '12px', border: '1px solid #eee', alignSelf: 'start' }}>
            <h3 style={{ marginBottom: '20px', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <User size={18} color="var(--primary-color)" /> 新增系統帳號
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="input-label">員工姓名</label>
                <input type="text" name="full_name" value={newUser.full_name} onChange={handleUserChange} className="settings-input" placeholder="例如：王小明" />
              </div>
              <div>
                <label className="input-label">登入帳號 *</label>
                <input type="text" name="username" value={newUser.username} onChange={handleUserChange} className="settings-input" />
              </div>
              <div>
                <label className="input-label">預設密碼 *</label>
                <input type="password" name="password" value={newUser.password} onChange={handleUserChange} className="settings-input" />
              </div>
              <div>
                <label className="input-label">類別角色 (Role) *</label>
                <select name="role" value={newUser.role} onChange={handleUserChange} className="settings-input">
                  <option value="IT">IT 系統端</option>
                  <option value="WAREHOUSE">WAREHOUSE 倉儲端</option>
                  <option value="PURCHASING">PURCHASING 採購端</option>
                  <option value="ADMIN">ADMIN 管理端</option>
                </select>
                <p style={{ fontSize: '0.75rem', color: '#999', marginTop: '4px' }}>角色僅決定預設權限，後續可微調。</p>
              </div>
              <button onClick={handleAddUser} className="btn-primary" style={{ marginTop: '8px', padding: '12px' }}>
                建立帳號
              </button>
            </div>
          </div>

          {/* 帳號列表 */}
          <div>
            <h3 style={{ marginBottom: '16px', fontSize: '1.1rem' }}>人員清單</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8f9fa', textAlign: 'left' }}>
                    <th className="th-cell">人員資訊</th>
                    <th className="th-cell">角色</th>
                    <th className="th-cell" style={{ textAlign: 'center' }}>目前權限</th>
                    <th className="th-cell" style={{ textAlign: 'center' }}>狀態</th>
                    <th className="th-cell" style={{ textAlign: 'center' }}>管理</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingUsers ? (
                    <tr><td colSpan="5" style={{ textAlign: 'center', padding: '40px' }}>載入中...</td></tr>
                  ) : users.map(u => (
                    <tr key={u.id} style={{ borderBottom: '1px solid #f0f0f0', opacity: u.is_active ? 1 : 0.6 }} className="row-hover">
                      <td style={{ padding: '16px 12px' }}>
                        <div style={{ fontWeight: 700 }}>{u.full_name || u.username}</div>
                        <div style={{ fontSize: '0.8rem', color: '#888' }}>ID: {u.username}</div>
                      </td>
                      <td style={{ padding: '16px 12px' }}>
                        <span style={{ 
                          padding: '4px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700,
                          backgroundColor: '#f0f0f0', color: '#555'
                        }}>
                          {u.role}
                        </span>
                      </td>
                      <td style={{ padding: '16px 12px', textAlign: 'center' }}>
                        <button 
                          onClick={() => handleOpenPermissions(u)}
                          className="btn-secondary"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 12px', fontSize: '0.85rem' }}
                        >
                          <Shield size={14} /> 設定權限
                        </button>
                      </td>
                      <td style={{ padding: '16px 12px', textAlign: 'center' }}>
                        <span style={{ color: u.is_active ? '#2e7d32' : '#d32f2f', fontWeight: 600, fontSize: '0.9rem' }}>
                          {u.is_active ? '啟用' : '停用'}
                        </span>
                      </td>
                      <td style={{ padding: '16px 12px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                          <button onClick={() => handleToggleActive(u.id, u.is_active)} className="btn-icon">
                            {u.is_active ? '停用' : '啟用'}
                          </button>
                          <button onClick={() => handleDeleteUser(u.id, u.username)} className="btn-icon-danger">
                            刪除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* 權限設定 Modal */}
      {showPermissionModal && editingUser && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div className="card-surface" style={{ width: '550px', padding: '32px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', color: 'var(--primary-color)', margin: 0 }}>權限設定</h2>
                <div style={{ fontSize: '0.9rem', color: '#666', marginTop: '4px' }}>使用者：<span style={{ fontWeight: 600 }}>{editingUser.full_name} ({editingUser.username})</span></div>
              </div>
              <X size={24} style={{ cursor: 'pointer', color: '#999' }} onClick={() => setShowPermissionModal(false)} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '32px' }}>
              {MENU_OPTIONS.map(opt => (
                <div 
                  key={opt.id} 
                  onClick={() => handleTogglePermission(opt.id)}
                  style={{ 
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', 
                    borderRadius: '8px', border: '1px solid #eee', cursor: 'pointer',
                    backgroundColor: editingUser.menu_access[opt.id] ? '#f0f7ff' : '#fff',
                    transition: 'all 0.2s'
                  }}
                >
                  {editingUser.menu_access[opt.id] ? <CheckSquare size={18} color="var(--primary-color)" /> : <Square size={18} color="#ccc" />}
                  <span style={{ fontSize: '0.9rem', fontWeight: editingUser.menu_access[opt.id] ? 600 : 400 }}>{opt.label}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={handleSavePermissions} className="btn-primary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <Save size={18} /> 儲存權限設定
              </button>
              <button onClick={() => setShowPermissionModal(false)} className="btn-secondary" style={{ padding: '12px 24px' }}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 樣式 */}
      <style>{`
        .input-label { display: block; fontSize: 0.85rem; fontWeight: 600; color: #555; marginBottom: 6px; }
        .settings-input { width: 100%; padding: 10px; border: 1px solid #ddd; borderRadius: 8px; outline: none; }
        .settings-input:focus { border-color: var(--primary-color); }
        .th-cell { padding: 14px 12px; border-bottom: 2px solid #eee; font-weight: 600; color: #666; font-size: 0.85rem; }
        .row-hover:hover { background-color: #fcfdfe; }
        .btn-icon { padding: 6px 12px; border: 1px solid #ddd; background: #fff; borderRadius: 6px; cursor: pointer; font-size: 0.85rem; }
        .btn-icon:hover { border-color: var(--primary-color); color: var(--primary-color); }
        .btn-icon-danger { padding: 6px 12px; border: 1px solid #ffcccc; background: #fff5f5; borderRadius: 6px; cursor: pointer; color: #d32f2f; font-size: 0.85rem; }
        .btn-icon-danger:hover { background: #fee2e2; }
      `}</style>
    </div>
  );
};

export default Settings;
