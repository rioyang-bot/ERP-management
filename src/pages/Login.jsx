import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LockKeyhole } from 'lucide-react';
import logo from '../assets/logo.png';
import './Login.css';


const Login = ({ setAuthUser }) => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      setError('請輸入帳號與密碼');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // 密碼一律送到伺服器端驗證。前端不再取得 password_hash，也不做任何比對。
      const res = await window.electronAPI.authLogin(username, password);

      if (res.success && res.user) {
        setAuthUser(res.user);
        navigate('/device-list');
      } else {
        setError(res.error || '帳號或密碼錯誤');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(`系統連線異常: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        
        <div className="login-header">
          <div className="login-logo" style={{ background: 'none' }}>
            <img src={logo} alt="Logo" style={{ width: '80px', height: '80px' }} />
          </div>
          <h1 className="login-title">METECH ERP 設備進銷存系統</h1>
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
              placeholder="請輸入密碼"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          <button type="submit" className="login-button" disabled={loading}>
            <LockKeyhole size={20} />
            {loading ? '驗證中...' : '系統登入'}
          </button>
        </form>


      </div>
    </div>
  );
};

export default Login;
