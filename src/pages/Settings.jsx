import React, { useState, useEffect, useCallback, useContext } from 'react';
import { RoleContext } from '../context/RoleContext';
import { hashPassword, validatePassword } from '../utils/auth';
import { Shield, User, Settings as SettingsIcon, CheckSquare, Square, X, Save, Key, Lock } from 'lucide-react';
import { logCreate, logUpdate, logDelete, logStatusChange } from '../utils/auditLogger';

const MENU_OPTIONS = [
  { id: 'inboundList', label: '進貨單列表 (S/I List)' },
  { id: 'dnList', label: '出貨單列表 (D/N List)' },
  { id: 'lentList', label: '借用列表 (Lent List)' },
  { id: 'assetList', label: '設備列表 (Device List)' },
  { id: 'nic-list', label: '硬體列表 (HW List)' },
  { id: 'consumable-list', label: '耗材列表 (CSM List)' },
  { id: 'procurementList', label: '採購單列表 (P/O List)' },
  { id: 'partners', label: '客戶/廠商管理 (Partners)' },
  { id: 'projects', label: '專案列表 (Project List)' },
  { id: 'reports', label: '報表中心 (Reports)' },
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
  
  // Admin Reset Password State
  const [resetUser, setResetUser] = useState(null);
  const [adminResetPwd, setAdminResetPwd] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  // Password Policy State
  const defaultPolicy = { enabled: false, minLength: 8, requireUppercase: true, requireLowercase: true, requireNumber: true, requireSpecialChar: true };
  const [passwordPolicy, setPasswordPolicy] = useState(defaultPolicy);
  const [isSavingPolicy, setIsSavingPolicy] = useState(false);

  const fetchSettings = useCallback(async () => {
    const res = await window.electronAPI.namedQuery('getSystemSetting', ['password_policy']);
    if (res.success && res.rows.length > 0) {
      setPasswordPolicy(res.rows[0].value || defaultPolicy);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    const res = await window.electronAPI.namedQuery('fetchUsers');
    if (res.success) {
      setUsers(res.rows);
    }
    setLoadingUsers(false);
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => {
      fetchSettings();
      fetchUsers();
    });
  }, [fetchUsers, fetchSettings]);

  const handleUserChange = (e) => {
    setNewUser({ ...newUser, [e.target.name]: e.target.value });
  };

  const handleAddUser = async () => {
    if (!newUser.username || !newUser.password) return alert('帳號密碼為必填');
    
    if (passwordPolicy.enabled) {
      const { isValid, message } = validatePassword(newUser.password, passwordPolicy);
      if (!isValid) return alert('密碼不符合安全性原則：\n' + message);
    }

    try {
      const hashedPassword = await hashPassword(newUser.password);
      
      // 根據角色給予預設權限
      let defaultAccess = {};
      if (newUser.role === 'ADMIN') {
        MENU_OPTIONS.forEach(opt => {
          defaultAccess[opt.id] = true;
        });
      } else if (newUser.role === 'IT') {
        defaultAccess = { dnList: true, lentList: true, assetList: true, 'nic-list': true, 'consumable-list': true, reports: true };
      } else if (newUser.role === 'WAREHOUSE') {
        defaultAccess = { inboundList: true, dnList: true, assetList: true, 'nic-list': true, 'consumable-list': true, partners: true, reports: true };
      } else if (newUser.role === 'PURCHASING') {
        defaultAccess = { procurementList: true, partners: true, reports: true };
      }

      const res = await window.electronAPI.namedQuery(
        'insertUser',
        [newUser.username, hashedPassword, newUser.role, newUser.full_name, defaultAccess]
      );

      if (res.success) {
        logCreate('USER', newUser.username, newUser.full_name || newUser.username, `建立使用者帳號 [${newUser.username}] (${newUser.role})`, {
          username: newUser.username,
          full_name: newUser.full_name,
          role: newUser.role,
          menu_access: defaultAccess
        });
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
      const u = users.find(item => item.id === id);
      logStatusChange('USER', id, u?.username || '帳號', currentStatus ? '啟用' : '停用', !currentStatus ? '啟用' : '停用', `${!currentStatus ? '啟用' : '停用'}使用者帳號 [${u?.username || id}]`, { id, username: u?.username, newStatus: !currentStatus });
      await fetchUsers();
    }
  };

  const handleDeleteUser = async (id, username) => {
    if (username === 'METECH') return alert('系統管理員帳號不可刪除'); 
    if (window.confirm(`確定要永久刪除帳號 [${username}] 嗎？此動作無法復原。`)) {
      const res = await window.electronAPI.namedQuery('deleteUser', [id]);
      if (res.success) {
        logDelete('USER', username, '使用者帳號', `刪除使用者帳號 [${username}]`, { id, username });
        await fetchUsers();
      }
    }
  };

  const handleOpenPermissions = (user) => {
    const rawAccess = user.menu_access || {};
    // 相容舊格式 Key 並對齊目前列表模組
    const access = {
      ...rawAccess,
      inboundList: rawAccess.inboundList ?? rawAccess.inbound ?? false,
      dnList: rawAccess.dnList ?? rawAccess.outbound ?? false,
      assetList: rawAccess.assetList ?? rawAccess.assets ?? false,
      'nic-list': rawAccess['nic-list'] ?? rawAccess['nic-registration'] ?? false,
      'consumable-list': rawAccess['consumable-list'] ?? rawAccess.consumableList ?? rawAccess.consumables ?? false,
      procurementList: rawAccess.procurementList ?? rawAccess.purchasing ?? false,
    };
    if (user.role === 'ADMIN') {
      MENU_OPTIONS.forEach(opt => {
        access[opt.id] = true;
      });
    }
    setEditingUser({
      ...user,
      menu_access: access
    });
    setShowPermissionModal(true);
  };

  const handleTogglePermission = (menuId) => {
    if (editingUser.role === 'ADMIN') {
      return;
    }
    setEditingUser(prev => ({
      ...prev,
      menu_access: {
        ...prev.menu_access,
        [menuId]: !prev.menu_access[menuId]
      }
    }));
  };

  const handleSavePermissions = async () => {
    const updatedAccess = { ...editingUser.menu_access };
    if (editingUser.role === 'ADMIN') {
      MENU_OPTIONS.forEach(opt => {
        updatedAccess[opt.id] = true;
      });
    }
    const res = await window.electronAPI.namedQuery(
      'updateUserAccess',
      [updatedAccess, editingUser.id]
    );

    if (res.success) {
      logUpdate('USER', editingUser.username, editingUser.full_name || editingUser.username, `修改使用者 [${editingUser.username}] 選單權限設定`, {
        username: editingUser.username,
        menu_access: updatedAccess
      });
      alert('權限更新成功');
      
      // 如果更新的是當前登入者，同步更新 Session
      if (editingUser.id === authUser.id) {
        setAuthUser({
          ...authUser,
          menu_access: updatedAccess
        });
      }

      setShowPermissionModal(false);
      await fetchUsers();
    } else {
      alert('更新失敗：' + res.error);
    }
  };

  const handleAdminResetPassword = async () => {
    if (!adminResetPwd) return alert('新密碼不能為空');
    
    if (passwordPolicy.enabled) {
      const { isValid, message } = validatePassword(adminResetPwd, passwordPolicy);
      if (!isValid) return alert('密碼不符合安全性原則：\n' + message);
    }
    
    setIsResetting(true);
    try {
      const hashedNew = await hashPassword(adminResetPwd);
      const updateRes = await window.electronAPI.namedQuery('updateUserPassword', [hashedNew, resetUser.id]);
      if (updateRes.success) {
        logUpdate('USER', resetUser.username, '重設密碼', `管理員重設使用者 [${resetUser.username}] 登入密碼`, { username: resetUser.username });
        alert(`已經成功將使用者 [${resetUser.username}] 的密碼重設！`);
        setResetUser(null);
        setAdminResetPwd('');
      } else {
        alert('變更密碼失敗：' + updateRes.error);
      }
    } catch (err) {
      console.error(err);
      alert('處理失敗：' + err.message);
    } finally {
      setIsResetting(false);
    }
  };

  const togglePolicy = (field) => {
    setPasswordPolicy(prev => ({ ...prev, [field]: !prev[field] }));
  };
  
  const savePolicy = async () => {
    setIsSavingPolicy(true);
    try {
      await window.electronAPI.namedQuery('upsertSystemSetting', ['password_policy', passwordPolicy]);
      logUpdate('SETTING', 'password_policy', '密碼原則設定', '更新系統密碼安全性原則', passwordPolicy);
      alert('密碼安全原則已儲存');
    } catch(err) {
      alert('儲存失敗');
    }
    setIsSavingPolicy(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', paddingBottom: '60px' }}>
      
      {/* 帳號權限管理 */}
      <div className="card-surface" style={{ padding: '32px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '16px', boxShadow: 'var(--card-shadow)' }}>
        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: '900', margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-main)' }}>
              <SettingsIcon size={26} color="var(--primary-color)" /> 帳號權限管理
            </h1>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>(User Access Control)</span>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px', marginBottom: 0 }}>管理人員可在此新增帳號，並針對每個使用者單獨開啟或關閉各模組功能。</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '32px' }}>
          {/* 新增帳號表單 */}
          <div style={{ backgroundColor: 'var(--bg-surface-subtle)', padding: '24px', borderRadius: '16px', border: '1px solid var(--border-color)', alignSelf: 'start' }}>
            <h3 style={{ marginBottom: '20px', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)', fontWeight: '800' }}>
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
                <p style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', marginTop: '4px' }}>角色僅決定預設權限，後續可微調。</p>
              </div>
              <button onClick={handleAddUser} className="btn-primary" style={{ marginTop: '8px', padding: '12px', backgroundColor: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)' }}>
                建立帳號
              </button>
            </div>
          </div>

          {/* 帳號列表 */}
          <div>
            <h3 style={{ marginBottom: '16px', fontSize: '1.1rem', color: 'var(--text-main)', fontWeight: '800' }}>人員清單</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--table-header-bg)', textAlign: 'left', borderBottom: '2px solid var(--border-color)' }}>
                    <th className="th-cell">人員資訊</th>
                    <th className="th-cell">角色</th>
                    <th className="th-cell" style={{ textAlign: 'center' }}>目前權限</th>
                    <th className="th-cell" style={{ textAlign: 'center' }}>狀態</th>
                    <th className="th-cell" style={{ textAlign: 'center' }}>管理</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingUsers ? (
                    <tr><td colSpan="5" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>載入中...</td></tr>
                  ) : users.map(u => (
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--table-border)', opacity: u.is_active ? 1 : 0.6 }} className="row-hover">
                      <td style={{ padding: '16px 12px' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{u.full_name || u.username}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ID: {u.username}</div>
                      </td>
                      <td style={{ padding: '16px 12px' }}>
                        <span style={{ 
                          padding: '4px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700,
                          backgroundColor: u.role === 'ADMIN' ? 'rgba(139, 92, 246, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                          color: u.role === 'ADMIN' ? '#a78bfa' : '#60a5fa',
                          border: `1px solid ${u.role === 'ADMIN' ? 'rgba(139, 92, 246, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`
                        }}>
                          {u.role}
                        </span>
                      </td>
                      <td style={{ padding: '16px 12px', textAlign: 'center' }}>
                        <button 
                          onClick={() => handleOpenPermissions(u)}
                          style={{ 
                            display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 12px', fontSize: '0.85rem',
                            backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--primary-color)', border: '1px solid var(--border-color)',
                            borderRadius: '8px', cursor: 'pointer', fontWeight: 600
                          }}
                        >
                          <Shield size={14} /> 設定權限
                        </button>
                      </td>
                      <td style={{ padding: '16px 12px', textAlign: 'center' }}>
                        <span style={{ color: u.is_active ? '#10b981' : '#ef4444', fontWeight: 700, fontSize: '0.9rem' }}>
                          {u.is_active ? '啟用' : '停用'}
                        </span>
                      </td>
                      <td style={{ padding: '16px 12px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                          <button onClick={() => handleToggleActive(u.id, u.is_active)} className="btn-icon">
                            {u.is_active ? '停用' : '啟用'}
                          </button>
                          <button onClick={() => setResetUser(u)} className="btn-icon">
                            重設密碼
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
      
      {/* 密碼安全原則設定 */}
      <div className="card-surface" style={{ padding: '32px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '16px', boxShadow: 'var(--card-shadow)' }}>
        <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h2 style={{ fontSize: '1.25rem', color: 'var(--text-main)', margin: 0, display: 'flex', alignItems: 'center', gap: '10px', fontWeight: '800' }}>
            <Lock size={22} color="#10b981" /> 密碼安全原則設定
          </h2>
          <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>(強制套用於新帳號建立與密碼變更作業)</span>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '600px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '8px', fontWeight: 700, fontSize: '1rem', color: 'var(--text-main)' }}>
              <input type="checkbox" checked={passwordPolicy.enabled} onChange={() => togglePolicy('enabled')} style={{ transform: 'scale(1.2)' }} />
              啟用複雜密碼檢查
            </label>
          </div>
          
          <div style={{ padding: '20px', border: '1px solid var(--border-color)', borderRadius: '12px', backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-main)', opacity: passwordPolicy.enabled ? 1 : 0.6, pointerEvents: passwordPolicy.enabled ? 'auto' : 'none', transition: 'all 0.3s' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
              <label style={{ fontWeight: 600, fontSize: '0.9rem', width: '120px', color: 'var(--text-main)' }}>最少字元長度</label>
              <input type="number" min="4" max="32" value={passwordPolicy.minLength} onChange={e => setPasswordPolicy(prev => ({ ...prev, minLength: parseInt(e.target.value) || 8 }))} className="settings-input" style={{ width: '80px', padding: '6px 10px' }} />
            </div>
            
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '6px', fontSize: '0.9rem', color: 'var(--text-main)' }}>
                <input type="checkbox" checked={passwordPolicy.requireUppercase} onChange={() => togglePolicy('requireUppercase')} />
                必須包含大寫英文字母
              </label>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '6px', fontSize: '0.9rem', color: 'var(--text-main)' }}>
                <input type="checkbox" checked={passwordPolicy.requireLowercase} onChange={() => togglePolicy('requireLowercase')} />
                必須包含小寫英文字母
              </label>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '6px', fontSize: '0.9rem', color: 'var(--text-main)' }}>
                <input type="checkbox" checked={passwordPolicy.requireNumber} onChange={() => togglePolicy('requireNumber')} />
                必須包含數字
              </label>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '6px', fontSize: '0.9rem', color: 'var(--text-main)' }}>
                <input type="checkbox" checked={passwordPolicy.requireSpecialChar} onChange={() => togglePolicy('requireSpecialChar')} />
                必須包含特殊符號
              </label>
            </div>
            
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
              <button 
                onClick={savePolicy} 
                disabled={isSavingPolicy}
                className="btn-primary" 
                style={{ padding: '8px 24px', backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '700', cursor: 'pointer', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)' }}
              >
                <Save size={16} /> {isSavingPolicy ? '儲存中...' : '儲存安全原則'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 權限設定 Modal */}
      {showPermissionModal && editingUser && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'var(--bg-modal-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div className="card-surface" style={{ width: '550px', padding: '32px', maxHeight: '90vh', overflowY: 'auto', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '16px', boxShadow: 'var(--modal-shadow)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', color: 'var(--primary-color)', margin: 0, fontWeight: '800' }}>權限設定</h2>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '4px' }}>使用者：<span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{editingUser.full_name} ({editingUser.username})</span></div>
              </div>
              <X size={24} style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setShowPermissionModal(false)} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '32px' }}>
              {MENU_OPTIONS.map(opt => {
                const isAdminUser = editingUser.role === 'ADMIN';
                const isChecked = isAdminUser ? true : !!editingUser.menu_access[opt.id];
                return (
                  <div 
                    key={opt.id} 
                    onClick={() => {
                      if (!isAdminUser) handleTogglePermission(opt.id);
                    }}
                    style={{ 
                      display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', 
                      borderRadius: '8px', border: '1px solid var(--border-color)', 
                      cursor: isAdminUser ? 'not-allowed' : 'pointer',
                      backgroundColor: isChecked ? 'var(--primary-bg)' : 'var(--bg-surface-subtle)',
                      color: 'var(--text-main)',
                      opacity: isAdminUser ? 0.75 : 1,
                      transition: 'all 0.2s'
                    }}
                  >
                    {isChecked ? <CheckSquare size={18} color="var(--primary-color)" /> : <Square size={18} color="var(--text-subtle)" />}
                    <span style={{ fontSize: '0.9rem', fontWeight: isChecked ? 600 : 400 }}>{opt.label}</span>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={handleSavePermissions} className="btn-primary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', backgroundColor: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)' }}>
                <Save size={18} /> 儲存權限設定
              </button>
              <button onClick={() => setShowPermissionModal(false)} className="btn-secondary" style={{ padding: '12px 24px', backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 重設密碼 Modal (管理者強制) */}
      {resetUser && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'var(--bg-modal-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div className="card-surface" style={{ width: '400px', padding: '24px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '16px', boxShadow: 'var(--modal-shadow)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '1.25rem', color: 'var(--text-main)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '800' }}><Key size={20} color="#eab308" /> 強制重設密碼</h2>
              <X size={20} style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => { setResetUser(null); setAdminResetPwd(''); }} />
            </div>
            
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
              即將為使用者 <strong style={{ color: 'var(--text-main)' }}>{resetUser.full_name || resetUser.username}</strong> 重新設定密碼。<br/>
              如果啟用了密碼安全原則，新設定密碼仍需受到原則規範限制。
            </p>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)' }}>新密碼設定</label>
              <input 
                type="text" 
                value={adminResetPwd} 
                onChange={e => setAdminResetPwd(e.target.value)} 
                className="settings-input" 
                placeholder="請為此帳號輸入欲設定的新密碼..." 
              />
            </div>
            
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => { setResetUser(null); setAdminResetPwd(''); }} 
                className="btn-secondary" 
                style={{ padding: '8px 16px', backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
              >
                取消
              </button>
              <button 
                onClick={handleAdminResetPassword} 
                disabled={isResetting}
                className="btn-primary" 
                style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)' }}
              >
                {isResetting ? '儲存中...' : '確認變更'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 樣式 */}
      <style>{`
        .input-label { display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-muted); margin-bottom: 6px; }
        .settings-input { width: 100%; padding: 10px; border: 1px solid var(--input-border); background-color: var(--input-bg); color: var(--input-text); border-radius: 8px; outline: none; }
        .settings-input:focus { border-color: var(--primary-color); }
        .th-cell { padding: 14px 12px; border-bottom: 2px solid var(--border-color); font-weight: 600; color: var(--table-header-text); font-size: 0.85rem; }
        .row-hover:hover { background-color: var(--table-row-hover); }
        .btn-icon { padding: 6px 12px; border: 1px solid var(--border-color); background: var(--bg-surface-subtle); color: var(--text-main); border-radius: 6px; cursor: pointer; font-size: 0.85rem; }
        .btn-icon:hover { border-color: var(--primary-color); color: var(--primary-color); background: var(--bg-surface-hover); }
        .btn-icon-danger { padding: 6px 12px; border: 1px solid rgba(244,63,94,0.3); background: rgba(244,63,94,0.15); border-radius: 6px; cursor: pointer; color: #f43f5e; font-size: 0.85rem; }
        .btn-icon-danger:hover { background: rgba(244,63,94,0.25); }
      `}</style>
    </div>
  );
};

export default Settings;
