import React, { useState, useEffect } from 'react';
import { RoleContext } from './context/RoleContext';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import Inventory from './pages/Inventory';
import Inbound from './pages/Inbound';
import Devices from './pages/Devices';
import DeviceList from './pages/DeviceList';
import Partners from './pages/Partners';
import Settings from './pages/Settings';
import ITOutbound from './pages/ITOutbound';
import WarehouseReview from './pages/WarehouseReview';
import Reports from './pages/Reports';
import Login from './pages/Login';
import Consumables from './pages/Consumables';
import Purchasing from './pages/Purchasing';
import ProcurementList from './pages/ProcurementList';
import ConsumableList from './pages/ConsumableList';
import HwRegistration from './pages/HwRegistration';
import HwList from './pages/HwList';
import './index.css';

function App() {
  const [authUser, setAuthUser] = useState(() => {
    // 試圖從 localStorage 恢復連線階段
    const saved = localStorage.getItem('erp_session');
    try {
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      console.error('Failed to parse session:', e);
      return null;
    }
  });

  // 當 authUser 變動時同步到 localStorage
  useEffect(() => {
    if (authUser) {
      localStorage.setItem('erp_session', JSON.stringify(authUser));
    } else {
      localStorage.removeItem('erp_session');
    }
  }, [authUser]);

  // 取得從 authUser 解構出來的 role (如果未登入則是 null)
  const role = authUser?.role;

  return (
    <RoleContext.Provider value={{ role, authUser, setAuthUser }}>
      <Router>
        <Routes>
          <Route path="/login" element={<Login setAuthUser={setAuthUser} />} />
          <Route path="/" element={authUser ? <MainLayout /> : <Navigate to="/login" replace />}>
            <Route index element={<Navigate to="/inventory" replace />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="inbound" element={<Inbound />} />
            <Route path="outbound" element={<ITOutbound />} />
            <Route path="review" element={<WarehouseReview />} />
            <Route path="devices" element={<Devices />} />
            <Route path="device-list" element={<DeviceList />} />
            <Route path="consumables" element={<Consumables />} />
            <Route path="partners" element={<Partners />} />
            <Route path="reports" element={<Reports />} />
            <Route path="purchasing" element={<Purchasing />} />
            <Route path="procurement-list" element={<ProcurementList />} />
            <Route path="consumable-list" element={<ConsumableList />} />
            <Route path="hw-registration" element={<HwRegistration />} />
            <Route path="hw-list" element={<HwList />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </Router>
    </RoleContext.Provider>
  );
}

export default App;
