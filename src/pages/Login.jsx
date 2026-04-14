import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LockKeyhole } from 'lucide-react';
import logo from '../assets/logo.png';
import './Login.css';

const MOCK_ACCOUNTS = {
  'admin': { username: 'admin', role: 'ADMIN', full_name: '系統管理員' },
  'wang_sh': { username: 'wang_sh', role: 'WAREHOUSE', full_name: '王小華 (總倉管)' },
  'chen_it': { username: 'chen_it', role: 'IT', full_name: '陳大文 (IT專員)' }
};

const Login = ({ setAuthUser }) => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    if (!username) {
      setError('請輸入帳號');
      return;
    }

    const matchedUser = MOCK_ACCOUNTS[username];
    if (matchedUser) {
      setAuthUser(matchedUser);
      navigate('/inventory'); // 成功登入後跳轉至預設首頁
    } else {
      setError('帳號或密碼錯誤。提示：請嘗試輸入 admin, wang_sh 或 chen_it');
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        
        <div className="login-header">
          <div className="login-logo" style={{ background: 'none' }}>
            <img src={logo} alt="Logo" style={{ width: '80px', height: '80px' }} />
          </div>
          <h1 className="login-title">ERP 資產進銷存系統</h1>
          <p className="login-subtitle">Asset Management Portal</p>
        </div>

        {error && <div className="login-error">{error}</div>}

        <form className="login-form" onSubmit={handleLogin}>
          <div className="login-input-group">
            <label>登入帳號 (Username)</label>
            <input 
              type="text" 
              className="login-input" 
              placeholder="請輸入測試帳號 (例如: admin)"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="login-input-group">
            <label>密碼 (Password)</label>
            <input 
              type="password" 
              className="login-input" 
              placeholder="請隨意輸入密碼"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button type="submit" className="login-button">
            <LockKeyhole size={20} />
            系統登入
          </button>
        </form>

        <div className="login-footer">
          &copy; 2026 AI Management Solutions. All rights reserved.
        </div>
      </div>
    </div>
  );
};

export default Login;
