import React, { useState } from 'react';
import { RoleContext } from './context/RoleContext';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import Inventory from './pages/Inventory';
import Inbound from './pages/Inbound';
import Assets from './pages/Assets';
import AssetList from './pages/AssetList';
import Partners from './pages/Partners';
import Settings from './pages/Settings';
import ITOutbound from './pages/ITOutbound';
import WarehouseReview from './pages/WarehouseReview';
import Reports from './pages/Reports';
import Login from './pages/Login';
import Consumables from './pages/Consumables';
import Purchasing from './pages/Purchasing';
import ProcurementList from './pages/ProcurementList';
import './index.css';

// 全域角色 Context
// RoleContext moved to ./context/RoleContext.jsx

function App() {
  const [authUser, setAuthUser] = useState(null); 
  
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
            <Route path="assets" element={<Assets />} />
            <Route path="asset-list" element={<AssetList />} />
            <Route path="consumables" element={<Consumables />} />
            <Route path="partners" element={<Partners />} />
            <Route path="reports" element={<Reports />} />
            <Route path="purchasing" element={<Purchasing />} />
            <Route path="procurement-list" element={<ProcurementList />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </Router>
    </RoleContext.Provider>
  );
}

export default App;
