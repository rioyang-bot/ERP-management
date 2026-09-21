import React, { useState, useEffect, useMemo } from 'react';
import { Download, ClipboardList, RotateCw, Server, Package, Cpu } from 'lucide-react';
import { usePageSize } from '../utils/usePageSize';
import PageSizeSelector from '../components/common/PageSizeSelector';
import { getBalanceMonths, indexBalances, getBalance } from '../utils/monthlyBalanceView';
import './Stocktaking.css';

const Stocktaking = () => {
  const [activeTab, setActiveTab] = useState('devices'); // 'devices', 'hardware', 'consumables', 'company'

  const [assets, setAssets] = useState([]); // Contains both devices and hardware
  const [consumables, setConsumables] = useState([]);
  const [companyAssets, setCompanyAssets] = useState([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  // 只看近三個月有出貨異動的品項：盤點時通常先清這些
  const [onlyRecentOutbound, setOnlyRecentOutbound] = useState(false);

  // 近三個月的月結存（每月 1 日由伺服器記錄上個月的結餘）
  const [balanceRows, setBalanceRows] = useState([]);
  const balanceMonths = useMemo(() => getBalanceMonths(balanceRows), [balanceRows]);
  const balances = useMemo(() => indexBalances(balanceRows), [balanceRows]);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = usePageSize('stocktaking', 10);

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

      // 公司資產是逐台列序號的清單，沒有「每月幾個」可言
      if (activeTab !== 'company') {
        const bal = await window.electronAPI.namedQuery('fetchRecentMonthlyBalances');
        setBalanceRows(bal.success ? bal.rows : []);
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
        if (onlyRecentOutbound && !item.has_recent_outbound) return false;
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
            (item.asset_no || '').toLowerCase().includes(term) ||
            (item.category_name || '').toLowerCase().includes(term)
          );
        }
        return true;
      });
    } else {
      return consumables.filter(item => {
        if (onlyRecentOutbound && !item.has_recent_outbound) return false;
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
  }, [assets, consumables, companyAssets, activeTab, searchTerm, onlyRecentOutbound]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchTerm, onlyRecentOutbound]);

  const totalPages = Math.ceil(filteredData.length / itemsPerPage) || 1;
  const paginatedData = filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const navBtnStyle = { padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', backgroundColor: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#475569' };

  // 匯出 CSV 盤點單
  const handleExportCSV = () => {
    const today = new Date().toISOString().split('T')[0];
    let headers = [];
    let csvRows = [];
    let filename = '';

    if (filteredData.length === 0) return alert('沒有資料可匯出');

    if (activeTab === 'devices' || activeTab === 'hardware') {
      filename = `${activeTab === 'devices' ? '設備' : '硬體'}盤點單_${today}.csv`;
      headers = ['分類', '類型', '廠牌', '型號', '規格說明', '系統庫存總數',
        ...balanceMonths.map((m) => `${m} 結餘`), '近期異動', '實盤總數量', '盤點備註'];

      csvRows = filteredData.map(item => [
        item.category_name || '',
        item.type || '',
        item.brand || '',
        item.model || '',
        (item.specification || '').replace(/,/g, '，').replace(/\n/g, ' '),
        item.stock_qty || 0,
        ...balanceMonths.map((m) => {
          const qty = getBalance(balances, item.item_master_id, m);
          return qty === null ? '' : qty;
        }),
        item.has_recent_outbound ? '是' : '',
        '', // 留空給現場人員填寫
        ''  // 留空給現場人員填寫
      ]);
    } else if (activeTab === 'company') {
      filename = `公司資產盤點單_${today}.csv`;
      headers = ['資產分類', '廠牌', '型號', '資產序號(Asset No)', '序號(S/N)', '狀態', '存放地點', '實盤確認', '盤點備註'];

      csvRows = filteredData.map(item => [
        item.category_name || '',
        item.brand || '',
        item.model || '',
        item.asset_no || '',
        item.sn || '',
        item.status === 'ACTIVE' ? '在庫' : (item.status === 'LENT' ? '借出' : item.status),
        (item.location || '').replace(/,/g, '，'),
        '', // 留空給現場人員填寫
        ''  // 留空給現場人員填寫
      ]);
    } else {
      filename = `耗材盤點單_${today}.csv`;
      headers = ['分類', '類型', '廠牌', '型號', '規格說明', '系統庫存量', '實驗室暫存量',
        ...balanceMonths.map((m) => `${m} 結餘`), '近期異動', '實盤總數量', '盤點備註'];

      csvRows = filteredData.map(item => [
        item.category_name || '',
        item.type || '',
        item.brand || '',
        item.model || '',
        (item.specification || '').replace(/,/g, '，').replace(/\n/g, ' '),
        item.stock_qty || 0,
        item.lab_qty || 0,
        ...balanceMonths.map((m) => {
          const qty = getBalance(balances, item.item_master_id, m);
          return qty === null ? '' : qty;
        }),
        item.has_recent_outbound ? '是' : '',
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
            <span style={{ color: 'var(--text-main)', fontWeight: '600' }}>庫存盤點表(Stocktaking)</span>
          </div>
          <h1 className="st-title">
            <ClipboardList size={28} color="#2563eb" /> 庫存盤點表(Stocktaking)
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
          {/* 公司資產是逐台列序號的清單，沒有品項層級的出貨統計 */}
          {activeTab !== 'company' && (
            <div className="st-filter-item">
              <label className="st-filter-label">異動篩選</label>
              <label className="st-checkbox">
                <input
                  type="checkbox"
                  checked={onlyRecentOutbound}
                  onChange={(e) => setOnlyRecentOutbound(e.target.checked)}
                />
                <span>只看近三個月有出貨異動</span>
              </label>
            </div>
          )}
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
          <PageSizeSelector pageSize={itemsPerPage} onChange={(newSize) => { setItemsPerPage(newSize); setCurrentPage(1); }} />
        </div>

        <div className="st-table-wrapper">
          <table className="st-table">
            <thead>
              {activeTab === 'company' ? (
                <tr>
                  <th style={{ width: '150px' }}>資產分類</th>
                  <th style={{ width: '200px' }}>廠牌 / 型號</th>
                  <th style={{ width: '170px' }}>資產序號 (Asset No)</th>
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
                  {/* 每月 1 日記錄的上個月結餘；尚未累積到的月份不會出現欄位 */}
                  {balanceMonths.map((m) => (
                    <th key={m} style={{ width: '90px', textAlign: 'right' }} className="st-month-col">
                      {m} 結餘
                    </th>
                  ))}
                  <th style={{ width: '120px', textAlign: 'center' }}>實盤總數</th>
                  <th style={{ width: '150px' }}>盤點備註</th>
                </tr>
              )}
            </thead>
            <tbody>
              {filteredData.length > 0 ? (
                paginatedData.map((item, index) => {
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
                        {/* 財產清冊對的是資產序號；還沒編號的要看得出來，不能只是空白 */}
                        <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                          {item.asset_no || <span style={{ color: '#94a3b8', fontWeight: 400 }}>未編號</span>}
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
                        {item.has_recent_outbound && (
                          <span className="st-recent-tag" title="近三個月內有出貨或借還異動">近期異動</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: '700', color: 'var(--text-main)' }}>
                        {item.stock_qty}
                      </td>
                      {activeTab === 'consumables' && (
                        <td style={{ textAlign: 'right', fontWeight: '600', color: '#64748b' }}>
                          {item.lab_qty}
                        </td>
                      )}
                      {balanceMonths.map((m) => {
                        const qty = getBalance(balances, item.item_master_id, m);
                        return (
                          <td key={m} style={{ textAlign: 'right', color: '#64748b' }} className="st-month-col">
                            {/* 還沒開始記錄的月份顯示破折號；顯示 0 會被誤讀成當時庫存為零 */}
                            {qty === null ? <span style={{ color: '#cbd5e1' }}>—</span> : qty}
                          </td>
                        );
                      })}
                      <td style={{ textAlign: 'center' }}><span className="st-print-blank"></span></td>
                      <td><span className="st-print-blank" style={{ width: '100%' }}></span></td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={(activeTab === 'consumables' ? 7 : (activeTab === 'company' ? 8 : 6)) + (activeTab === 'company' ? 0 : balanceMonths.length)} className="st-empty">
                    {`沒有符合的${activeTab === 'devices' ? '設備' : activeTab === 'hardware' ? '硬體' : activeTab === 'company' ? '公司資產' : '耗材'}`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', padding: '20px', borderTop: '1px solid #e2e8f0', backgroundColor: '#fff', borderBottomLeftRadius: '16px', borderBottomRightRadius: '16px' }}>
            <button disabled={currentPage === 1} onClick={() => setCurrentPage(prev => prev - 1)} style={{ ...navBtnStyle, opacity: currentPage === 1 ? 0.5 : 1 }}>上一頁</button>
            <span style={{ display: 'flex', alignItems: 'center', fontWeight: '800', color: '#475569', fontSize: '13px' }}>第 {currentPage} 頁 / 共 {totalPages} 頁</span>
            <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(prev => prev + 1)} style={{ ...navBtnStyle, opacity: currentPage === totalPages ? 0.5 : 1 }}>下一頁</button>
          </div>
        )}
      </div>

      {/* 頁面說明：印出來的表要怎麼用、欄位各自代表什麼 */}
      <div className="st-notes">
        <div className="st-notes-title">實體庫存盤點表說明</div>
        <div className="st-notes-body">
          <div>
            • <b>系統庫存</b>：目前系統帳面上的數量。設備與硬體算的是狀態為「在庫」的台數，
            耗材算的是庫存數量，實驗室暫存量另外一欄。
          </div>
          <div>
            • <b>每月結餘</b>：每月 1 日由系統記下上個月底的庫存，作為對帳用的歷史基準。
            系統沒有逐筆的異動流水可以回推，因此這些數字是從啟用這項功能之後才開始累積的，
            先前的月份會是「—」，不是 0。若伺服器在月初幾天沒有開機，該月的數字會是實際記錄當下的庫存，
            與月底會有幾天的落差。
          </div>
          <div>
            • <b>近期異動</b>：近三個月內有出貨或借還紀錄的品項。上方可勾選只顯示這些品項，
            盤點時通常先清這一批。
          </div>
          <div>
            • <b>實盤總數與盤點備註</b>：這兩欄<b>刻意留白，供列印後手寫</b>。
            系統不會儲存這兩欄的內容，畫面上也不能輸入 ——
            盤點結果請在紙本上填寫，若要更正系統庫存，回到各自的列表修改。
          </div>
          <div>
            • <b>匯出</b>：右上角可匯出 CSV，欄位與畫面一致，同樣保留實盤與備註兩個空欄。
          </div>
        </div>
      </div>
    </div>
  );
};

export default Stocktaking;
