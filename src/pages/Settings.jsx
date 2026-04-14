import React, { useState } from 'react';

const Settings = () => {
  // DB Config State
  const [dbConfig, setDbConfig] = useState({
    host: 'localhost',
    port: '5432',
    user: 'postgres',
    password: '',
    database: 'ERP_db'
  });
  const [status, setStatus] = useState('');

  // User Management State
  const [users, setUsers] = useState([
    { id: 1, username: 'admin', role: 'ADMIN', full_name: '系統管理員', is_active: true },
    { id: 2, username: 'wang_sh', role: 'WAREHOUSE', full_name: '王小華 (總倉管)', is_active: true },
    { id: 3, username: 'chen_it', role: 'IT', full_name: '陳大文 (IT專員)', is_active: true }
  ]);
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'IT', full_name: '' });

  const handleChange = (e) => {
    setDbConfig({ ...dbConfig, [e.target.name]: e.target.value });
  };

  const handleUserChange = (e) => {
    setNewUser({ ...newUser, [e.target.name]: e.target.value });
  };

  const handleAddUser = () => {
    if (!newUser.username || !newUser.password) return alert('帳號密碼為必填');
    setUsers([...users, { id: Date.now(), ...newUser, is_active: true }]);
    setNewUser({ username: '', password: '', role: 'IT', full_name: '' });
    alert('帳號已新增 (同步寫入 users 資料表)');
  };

  const handleToggleActive = (id) => {
    setUsers(users.map(u => u.id === id ? { ...u, is_active: !u.is_active } : u));
  };

  const handleDeleteUser = (id) => {
    if (id === 1) return alert('系統管理員帳號不可刪除'); // 保護 Admin
    if (window.confirm('確定要永久刪除此帳號嗎？此動作無法復原。')) {
      setUsers(users.filter(u => u.id !== id));
    }
  };

  const handleConnect = async () => {
    setStatus('testing');
    // Simulate connection delay
    setTimeout(() => {
      setStatus('success');
    }, 1000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '40px' }}>
      
      {/* 區塊 1: 帳號管理 */}
      <div className="card-surface">
        <h1 className="page-title">帳號權限管理 (User Management)</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>新增與維護系統操作人員帳號，並指派適當的存取權限角色。</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: '24px' }}>
          {/* 左方 新增帳號 */}
          <div style={{ backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '8px', border: '1px solid #eee' }}>
            <h3 style={{ marginBottom: '16px', color: 'var(--primary-color)' }}>新增系統帳號</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '4px' }}>員工姓名</label>
                <input type="text" name="full_name" value={newUser.full_name} onChange={handleUserChange} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '4px' }}>登入帳號 *</label>
                <input type="text" name="username" value={newUser.username} onChange={handleUserChange} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '4px' }}>登入密碼 *</label>
                <input type="password" name="password" value={newUser.password} onChange={handleUserChange} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '4px' }}>指派角色 (Role) *</label>
                <select name="role" value={newUser.role} onChange={handleUserChange} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}>
                  <option value="IT">IT 系統端 (僅查詢庫存與申請出庫)</option>
                  <option value="WAREHOUSE">WAREHOUSE 倉儲端 (全功能含金額管理)</option>
                  <option value="ADMIN">ADMIN 管理端 (僅帳號與連線設定)</option>
                </select>
              </div>
              <button onClick={handleAddUser} style={{ padding: '10px', marginTop: '8px', backgroundColor: 'var(--accent-color)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>
                建立帳號
              </button>
            </div>
          </div>

          {/* 右方 帳號列表 */}
          <div>
            <h3 style={{ marginBottom: '16px', color: 'var(--text-main)' }}>現有帳號列表</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f1f3f4', textAlign: 'left' }}>
                  <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>帳號 / 姓名</th>
                  <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>系統角色</th>
                  <th style={{ padding: '12px', borderBottom: '2px solid #ddd', textAlign: 'center' }}>狀態</th>
                  <th style={{ padding: '12px', borderBottom: '2px solid #ddd', textAlign: 'center' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} style={{ borderBottom: '1px solid #eee', opacity: u.is_active ? 1 : 0.6 }}>
                    <td style={{ padding: '12px' }}>
                      <div style={{ fontWeight: 600 }}>{u.username}</div>
                      <div style={{ fontSize: '0.85rem', color: '#666' }}>{u.full_name}</div>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <span style={{ 
                        padding: '4px 8px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 600,
                        backgroundColor: u.role === 'IT' ? '#e3f2fd' : (u.role === 'ADMIN' ? '#fff3e0' : '#e8f5e9'),
                        color: u.role === 'IT' ? '#1976d2' : (u.role === 'ADMIN' ? '#e65100' : '#2e7d32')
                      }}>
                        {u.role}
                      </span>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      {u.is_active ? <span style={{ color: '#2e7d32' }}>啟用中</span> : <span style={{ color: '#d32f2f' }}>已停用</span>}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <button 
                          onClick={() => handleToggleActive(u.id)} 
                          style={{ 
                            padding: '6px 12px', backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer',
                            fontSize: '0.85rem'
                          }}
                        >
                          {u.is_active ? '停用' : '啟用'}
                        </button>
                        <button 
                          onClick={() => handleDeleteUser(u.id)} 
                          style={{ 
                            padding: '6px 12px', backgroundColor: '#fff0f0', border: '1px solid #ffcccc', borderRadius: '4px', cursor: 'pointer',
                            color: '#d32f2f', fontSize: '0.85rem'
                          }}
                        >
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

      {/* 區塊 2: 資料庫連線 */}
      <div className="card-surface">
        <h1 className="page-title">連線與底層設定 (System Config)</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>設定 PostgreSQL 伺服器主機連線，需擁有超級管理員權限。</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', maxWidth: '600px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontWeight: 500 }}>Host (主機位址)</label>
          <input 
            type="text" 
            name="host" 
            value={dbConfig.host} 
            onChange={handleChange}
            style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }}
          />
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontWeight: 500 }}>Port (連接埠)</label>
          <input 
            type="text" 
            name="port" 
            value={dbConfig.port} 
            onChange={handleChange}
            style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontWeight: 500 }}>Database (資料庫名稱)</label>
          <input 
            type="text" 
            name="database" 
            value={dbConfig.database} 
            onChange={handleChange}
            style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontWeight: 500 }}>User (使用者帳號)</label>
          <input 
            type="text" 
            name="user" 
            value={dbConfig.user} 
            onChange={handleChange}
            style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontWeight: 500 }}>Password (密碼)</label>
          <input 
            type="password" 
            name="password" 
            value={dbConfig.password} 
            onChange={handleChange}
            style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }}
          />
        </div>

        <button 
          onClick={handleConnect}
          style={{ 
            marginTop: '16px', 
            padding: '12px', 
            backgroundColor: 'var(--primary-color)', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px', 
            cursor: 'pointer',
            fontWeight: 600
          }}
        >
          {status === 'testing' ? '測試連線中...' : '測試連線並儲存'}
        </button>

        {status === 'success' && (
          <div style={{ padding: '12px', backgroundColor: '#e6f4ea', color: '#137333', borderRadius: '4px', marginTop: '16px', gridColumn: '1 / -1' }}>
            連線成功！設定已儲存。
          </div>
        )}
      </div>
      </div>
    </div>
  );
};

export default Settings;
