import React, { useState, useEffect, useMemo } from 'react';
import { Download, ClipboardList, RotateCw, Server, Package, Cpu } from 'lucide-react';
import './Stocktaking.css';

const Stocktaking = () => {
  const [activeTab, setActiveTab] = useState('devices'); // 'devices', 'hardware', 'consumables', 'company'
  
  const [assets, setAssets] = useState([]); // Contains both devices and hardware
  const [consumables, setConsumables] = useState([]);
  const [companyAssets, setCompanyAssets] = useState([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');

  // 取得資料
  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'devices' || activeTab === 'hardware') {
        const res = await window.electronAPI.namedQuery('fetchStocktakingAssets');
        if (res.success) {
          setAssets(res.rows);
        }
      } else if (activeTab === 'company') {
        const res = await window.electronAPI.namedQuery('fetchCompanyAssets');
        if (res.success) {
          setCompanyAssets(res.rows);
        }
      } else {
        const res = await window.electronAPI.namedQuery('fetchStocktakingConsumables');
        if (res.success) {
          setConsumables(res.rows);
        }
      }
    } catch (err) {
      console.error('Fetch error:', err);
      alert('無法取得盤點資料');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  // 篩選資料
  const filteredData = useMemo(() => {
    if (activeTab === 'devices' || activeTab === 'hardware') {
      const targetCategory = activeTab === 'devices' ? '設備' : '硬體';
      return assets.filter(item => {
        if (item.category_name !== targetCategory) return false;
        if (searchTerm) {
          const term = searchTerm.toLowerCase();
          return (
            (item.brand || '').toLowerCase().includes(term) ||
            (item.model || '').toLowerCase().includes(term) ||
            (item.type || '').toLowerCase().includes(term) ||
            (item.specification || '').toLowerCase().includes(term)
          );
        }
        return true;
      });
    } else if (activeTab === 'company') {
      return companyAssets.filter(item => {
        if (searchTerm) {
          const term = searchTerm.toLowerCase();
          return (
            (item.brand || '').toLowerCase().includes(term) ||
            (item.model || '').toLowerCase().includes(term) ||
            (item.sn || '').toLowerCase().includes(term) ||
            (item.category_name || '').toLowerCase().includes(term)
          );
        }
        return true;
      });
    } else {
      return consumables.filter(item => {
        if (searchTerm) {
          const term = searchTerm.toLowerCase();
          return (
            (item.brand || '').toLowerCase().includes(term) ||
            (item.model || '').toLowerCase().includes(term) ||
            (item.type || '').toLowerCase().includes(term) ||
            (item.specification || '').toLowerCase().includes(term)
          );
        }
        return true;
      });
    }
  }, [assets, consumables, companyAssets, activeTab, searchTerm]);

  // 匯出 CSV 盤點單
  const handleExportCSV = () => {
    const today = new Date().toISOString().split('T')[0];
    let headers = [];
    let csvRows = [];
    let filename = '';

    if (filteredData.length === 0) return alert('沒有資料可匯出');

    if (activeTab === 'devices' || activeTab === 'hardware') {
      filename = `${activeTab === 'devices' ? '設備' : '硬體'}盤點單_${today}.csv`;
      headers = ['分類', '類型', '廠牌', '型號', '規格說明', '系統庫存總數', '實盤總數量', '盤點備註'];
      
      csvRows = filteredData.map(item => [
        item.category_name || '',
        item.type || '',
        item.brand || '',
        item.model || '',
        (item.specification || '').replace(/,/g, '，').replace(/\n/g, ' '),
        item.stock_qty || 0,
        '', // 留空給現場人員填寫
        ''  // 留空給現場人員填寫
      ]);
    } else if (activeTab === 'company') {
      filename = `公司資產盤點單_${today}.csv`;
      headers = ['資產分類', '廠牌', '型號', '序號(S/N)', '狀態', '存放地點', '實盤確認', '盤點備註'];
      
      csvRows = filteredData.map(item => [
        item.category_name || '',
        item.brand || '',
        item.model || '',
        item.sn || '',
        item.status === 'ACTIVE' ? '在庫' : (item.status === 'LENT' ? '借出' : item.status),
        (item.location || '').replace(/,/g, '，'),
        '', // 留空給現場人員填寫
        ''  // 留空給現場人員填寫
      ]);
    } else {
      filename = `耗材盤點單_${today}.csv`;
      headers = ['分類', '類型', '廠牌', '型號', '規格說明', '系統庫存量', '實驗室暫存量', '實盤總數量', '盤點備註'];
      
      csvRows = filteredData.map(item => [
        item.category_name || '',
        item.type || '',
        item.brand || '',
        item.model || '',
        (item.specification || '').replace(/,/g, '，').replace(/\n/g, ' '),
        item.stock_qty || 0,
        item.lab_qty || 0,
        '', // 留空給現場人員填寫
        ''  // 留空給現場人員填寫
      ]);
    }

    // 加上 BOM 避免 Excel 中文亂碼
    const BOM = '\uFEFF';
    const csvContent = BOM + [
      headers.join(','),
      ...csvRows.map(r => r.map(field => `"${field}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="st-container">
      {/* Header */}
      <div className="st-header-row">
        <div>
          <div className="pj-breadcrumb">
            <span>庫存管理</span>
            <span>/</span>
            <span style={{ color: '#0f172a', fontWeight: '600' }}>實體庫存盤點總表</span>
          </div>
          <h1 className="st-title">
            <ClipboardList size={28} color="#2563eb" /> 實體庫存盤點總表
          </h1>
          <p className="st-subtitle">匯出目前系統在庫清單，方便進行現場實物盤點核對。</p>
        </div>
        <div className="st-header-actions">
          <button className="st-btn st-btn-outline" onClick={fetchData} disabled={loading}>
            <RotateCw size={16} className={loading ? 'spin' : ''} /> 重新整理
          </button>
          <button className="st-btn st-btn-primary" onClick={handleExportCSV}>
            <Download size={16} /> 下載 CSV 盤點單
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="st-tabs">
        <div 
          className={`st-tab ${activeTab === 'devices' ? 'active' : ''}`}
          onClick={() => { setActiveTab('devices'); setSearchTerm(''); }}
        >
          <Server size={16} style={{ position: 'relative', top: '3px', marginRight: '6px' }} />
          設備盤點
        </div>
        <div 
          className={`st-tab ${activeTab === 'hardware' ? 'active' : ''}`}
          onClick={() => { setActiveTab('hardware'); setSearchTerm(''); }}
        >
          <Cpu size={16} style={{ position: 'relative', top: '3px', marginRight: '6px' }} />
          硬體盤點
        </div>
        <div 
          className={`st-tab ${activeTab === 'consumables' ? 'active' : ''}`}
          onClick={() => { setActiveTab('consumables'); setSearchTerm(''); }}
        >
          <Package size={16} style={{ position: 'relative', top: '3px', marginRight: '6px' }} />
          耗材盤點
        </div>
        <div 
          className={`st-tab ${activeTab === 'company' ? 'active' : ''}`}
          onClick={() => { setActiveTab('company'); setSearchTerm(''); }}
        >
          <Server size={16} style={{ position: 'relative', top: '3px', marginRight: '6px' }} />
          公司資產盤點
        </div>
      </div>

      {/* Filters */}
      <div className="st-filter-card">
        <div className="st-filter-grid">
          <div className="st-filter-item" style={{ flex: 1 }}>
            <label className="st-filter-label">關鍵字搜尋</label>
            <input 
              type="text" 
              className="st-input"
              placeholder="搜尋廠牌、型號、類型、規格..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="st-table-card">
        <div className="st-table-header">
          <div className="st-table-title">
            {activeTab === 'devices' ? '庫存設備清單' : activeTab === 'hardware' ? '庫存硬體清單' : activeTab === 'company' ? '公司資產清單' : '庫存耗材清單'}
            <span className="st-badge">
              共 {filteredData.length} 筆
            </span>
          </div>
        </div>
        
        <div className="st-table-wrapper">
          <table className="st-table">
            <thead>
              {activeTab === 'company' ? (
                <tr>
                  <th style={{ width: '150px' }}>資產分類</th>
                  <th style={{ width: '200px' }}>廠牌 / 型號</th>
                  <th style={{ width: '200px' }}>序號 (S/N)</th>
                  <th style={{ width: '100px', textAlign: 'center' }}>狀態</th>
                  <th>存放地點</th>
                  <th style={{ width: '120px', textAlign: 'center' }}>實盤總數</th>
                  <th style={{ width: '150px' }}>盤點備註</th>
                </tr>
              ) : (
                <tr>
                  <th style={{ width: '150px' }}>分類 / 類型</th>
                  <th style={{ width: '200px' }}>廠牌 / 型號</th>
                  <th>規格說明</th>
                  <th style={{ width: '100px', textAlign: 'right' }}>系統庫存</th>
                  {activeTab === 'consumables' && (
                    <th style={{ width: '100px', textAlign: 'right' }}>實驗室庫存</th>
                  )}
                  <th style={{ width: '120px', textAlign: 'center' }}>實盤總數</th>
                  <th style={{ width: '150px' }}>盤點備註</th>
                </tr>
              )}
            </thead>
            <tbody>
              {filteredData.length > 0 ? (
                filteredData.map((item, index) => {
                  if (activeTab === 'company') {
                    return (
                      <tr key={`company-${item.sn}-${index}`}>
                        <td>{item.category_name}</td>
                        <td>
                          <div className="st-brand-model">
                            <span className="st-brand">{item.brand}</span>
                            <span className="st-model">{item.model}</span>
                          </div>
                        </td>
                        <td style={{ fontFamily: 'monospace' }}>{item.sn}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`st-status-badge ${item.status === 'ACTIVE' ? 'status-active' : 'status-lent'}`}>
                            {item.status === 'ACTIVE' ? '在庫' : (item.status === 'LENT' ? '借出' : item.status)}
                          </span>
                        </td>
                        <td style={{ fontSize: '13px', color: '#475569' }}>{item.location}</td>
                        <td style={{ textAlign: 'center' }}><span className="st-print-blank"></span></td>
                        <td><span className="st-print-blank" style={{ width: '100%' }}></span></td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={`${item.brand}-${item.model}-${index}`}>
                      <td>
                        <div className="st-brand-model">
                          <span className="st-brand">{item.category_name}</span>
                          <span className="st-model">{item.type}</span>
                        </div>
                      </td>
                      <td>
                        <div className="st-brand-model">
                          <span className="st-brand">{item.brand}</span>
                          <span className="st-model">{item.model}</span>
                        </div>
                      </td>
                      <td style={{ fontSize: '12px', color: '#64748b', maxWidth: '300px' }}>
                        {item.specification}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: '700', color: '#0f172a' }}>
                        {item.stock_qty} {item.unit || ''}
                      </td>
                      {activeTab === 'consumables' && (
                        <td style={{ textAlign: 'right', fontWeight: '600', color: '#64748b' }}>
                          {item.lab_qty} {item.unit || ''}
                        </td>
                      )}
                      <td style={{ textAlign: 'center' }}><span className="st-print-blank"></span></td>
                      <td><span className="st-print-blank" style={{ width: '100%' }}></span></td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={activeTab === 'consumables' ? 7 : (activeTab === 'company' ? 7 : 6)} className="st-empty">
                    {`沒有符合的${activeTab === 'devices' ? '設備' : activeTab === 'hardware' ? '硬體' : activeTab === 'company' ? '公司資產' : '耗材'}`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Stocktaking;
