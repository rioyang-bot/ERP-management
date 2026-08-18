import React, { useState, useEffect, useCallback } from 'react';
import { History, Search, RefreshCw, Filter, ArrowDownToLine, ArrowUpFromLine, ArrowRightLeft, FileSpreadsheet } from 'lucide-react';

const FlowHistory = () => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL'); // ALL, INBOUND, OUTBOUND_SALE, OUTBOUND_LEND
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  const [dateRange, setDateRange] = useState({
    start: '',
    end: ''
  });

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await window.electronAPI.namedQuery('fetchFlowHistory');
      if (res.success) {
        setRecords(res.rows || []);
      } else {
        console.error('Fetch flow history failed:', res.error);
        alert('載入歷史紀錄失敗');
      }
    } catch (err) {
      console.error('Error fetching flow history:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, typeFilter, dateRange]);

  const filteredRecords = records.filter(rec => {
    // 類型過濾
    if (typeFilter !== 'ALL' && rec.transaction_type !== typeFilter) {
      return false;
    }

    // 日期過濾
    if (dateRange.start || dateRange.end) {
      // transaction_date 可能是 Date 或字串
      const txDateStr = rec.transaction_date ? new Date(rec.transaction_date).toISOString().split('T')[0] : '';
      if (txDateStr) {
        if (dateRange.start && txDateStr < dateRange.start) return false;
        if (dateRange.end && txDateStr > dateRange.end) return false;
      } else {
        return false; // 沒有日期的紀錄如果有篩選日期就過濾掉
      }
    }

    // 關鍵字搜尋
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      return (
        (rec.order_no || '').toLowerCase().includes(term) ||
        (rec.partner_name || '').toLowerCase().includes(term) ||
        (rec.sn || '').toLowerCase().includes(term) ||
        (rec.model || '').toLowerCase().includes(term) ||
        (rec.brand || '').toLowerCase().includes(term) ||
        (rec.specification || '').toLowerCase().includes(term)
      );
    }

    return true;
  });

  const totalPages = Math.ceil(filteredRecords.length / itemsPerPage) || 1;
  const paginatedRecords = filteredRecords.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // 取得交易類型的 UI 呈現
  const getTypeDisplay = (type) => {
    switch (type) {
      case 'INBOUND':
        return { label: '進貨入庫', icon: <ArrowDownToLine size={16} />, color: '#10b981', bg: '#d1fae5' };
      case 'OUTBOUND_SALE':
        return { label: '出貨發貨', icon: <ArrowUpFromLine size={16} />, color: '#3b82f6', bg: '#dbeafe' };
      case 'OUTBOUND_LEND':
        return { label: '設備借出', icon: <ArrowRightLeft size={16} />, color: '#d97706', bg: '#fef3c7' };
      default:
        return { label: '未知', icon: <History size={16} />, color: '#64748b', bg: '#f1f5f9' };
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleDateString('zh-TW');
    } catch (e) {
      return dateStr;
    }
  };

  const tableStyles = `
    .modern-table {
      width: 100%;
      border-collapse: collapse;
      background: white;
    }
    .modern-table th {
      text-align: left;
      padding: 16px;
      font-weight: 800;
      color: #1e293b;
      border-bottom: 2px solid #e2e8f0;
      background-color: #f8fafc;
    }
    .modern-table td {
      padding: 16px;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: middle;
      color: #334155;
    }
    .modern-table tr:hover td {
      background-color: #fbfbfb;
    }
  `;

  const navBtnStyle = { padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', backgroundColor: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#475569' };

  return (
    <div style={{ padding: '24px', backgroundColor: '#f8fafc', minHeight: '100vh', boxSizing: 'border-box' }}>
      <style>{tableStyles}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ padding: '12px', backgroundColor: '#7c3aed', borderRadius: '12px', color: '#fff', boxShadow: '0 4px 6px rgba(124, 58, 237, 0.2)' }}>
            <History size={24} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>進出貨日誌 Stock In/Out Log</h1>
            <p style={{ color: '#64748b', fontSize: '13px', marginTop: '4px', marginBottom: 0 }}>
              按時間序列追蹤所有進貨入庫、出貨發貨、借用與異動軌跡。
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={fetchRecords} className="btn-refresh-vibrant">
            <RefreshCw size={18} className={loading ? 'spinner' : ''} /> 重新整理
          </button>
        </div>
      </div>

      <div className="card-surface" style={{ padding: '0', overflow: 'hidden' }}>
        {/* Toolbar */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #eee', display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center', backgroundColor: '#fff' }}>
          
          <div className="search-box-vibrant" style={{ flex: 1, minWidth: '300px', display: 'flex', alignItems: 'center' }}>
            <Search size={18} style={{ color: '#94a3b8' }} />
            <input 
              type="text" 
              placeholder="搜尋單號、客戶/供應商、品項規格、設備序號 (S/N)..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ flex: 1, border: 'none', outline: 'none', padding: '8px', backgroundColor: 'transparent' }}
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')} 
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px', display: 'flex', alignItems: 'center' }}
              >
                ✕
              </button>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#f1f5f9', padding: '4px', borderRadius: '8px' }}>
            <button
              onClick={() => setTypeFilter('ALL')}
              style={{ padding: '6px 12px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px', backgroundColor: typeFilter === 'ALL' ? '#fff' : 'transparent', color: typeFilter === 'ALL' ? '#0f172a' : '#64748b', boxShadow: typeFilter === 'ALL' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
            >
              全部
            </button>
            <button
              onClick={() => setTypeFilter('INBOUND')}
              style={{ padding: '6px 12px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px', backgroundColor: typeFilter === 'INBOUND' ? '#fff' : 'transparent', color: typeFilter === 'INBOUND' ? '#10b981' : '#64748b', boxShadow: typeFilter === 'INBOUND' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
            >
              進貨入庫
            </button>
            <button
              onClick={() => setTypeFilter('OUTBOUND_SALE')}
              style={{ padding: '6px 12px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px', backgroundColor: typeFilter === 'OUTBOUND_SALE' ? '#fff' : 'transparent', color: typeFilter === 'OUTBOUND_SALE' ? '#3b82f6' : '#64748b', boxShadow: typeFilter === 'OUTBOUND_SALE' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
            >
              出貨發貨
            </button>
            <button
              onClick={() => setTypeFilter('OUTBOUND_LEND')}
              style={{ padding: '6px 12px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px', backgroundColor: typeFilter === 'OUTBOUND_LEND' ? '#fff' : 'transparent', color: typeFilter === 'OUTBOUND_LEND' ? '#d97706' : '#64748b', boxShadow: typeFilter === 'OUTBOUND_LEND' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
            >
              設備借出
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>日期區間：</span>
            <input 
              type="date" 
              value={dateRange.start}
              onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
              style={{ padding: '8px', border: '1px solid #e2e8f0', borderRadius: '8px', outline: 'none', color: '#0f172a', fontSize: '13px' }}
            />
            <span style={{ color: '#94a3b8' }}>-</span>
            <input 
              type="date" 
              value={dateRange.end}
              onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
              style={{ padding: '8px', border: '1px solid #e2e8f0', borderRadius: '8px', outline: 'none', color: '#0f172a', fontSize: '13px' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#64748b', marginLeft: 'auto' }}>
            顯示
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', backgroundColor: '#fff', cursor: 'pointer' }}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            筆/頁
          </div>
        </div>

        {/* Table */}
        <div className="table-responsive">
          <table className="modern-table">
            <thead>
              <tr>
                <th style={{ width: '10%' }}>異動日期</th>
                <th style={{ width: '10%' }}>交易類型</th>
                <th style={{ width: '15%' }}>單號</th>
                <th style={{ width: '15%' }}>關聯對象 (客戶/供應商)</th>
                <th style={{ width: '30%' }}>品項資訊</th>
                <th style={{ width: '15%' }}>設備序號 (S/N)</th>
                <th style={{ width: '5%', textAlign: 'right' }}>數量</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                    <RefreshCw className="spinner" size={24} style={{ marginBottom: '8px', color: '#7c3aed' }} /><br/>
                    載入中...
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                    找不到符合的歷史紀錄
                  </td>
                </tr>
              ) : (
                paginatedRecords.map((rec, index) => {
                  const display = getTypeDisplay(rec.transaction_type);
                  return (
                    <tr key={`${rec.order_no}-${rec.sn}-${index}`}>
                      <td style={{ fontWeight: 500, color: '#334155' }}>
                        {formatDate(rec.transaction_date)}
                      </td>
                      <td>
                        <span style={{ 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          gap: '6px', 
                          padding: '4px 10px', 
                          borderRadius: '20px', 
                          backgroundColor: display.bg, 
                          color: display.color, 
                          fontWeight: 700, 
                          fontSize: '12px' 
                        }}>
                          {display.icon} {display.label}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600, color: '#0f172a' }}>{rec.order_no}</td>
                      <td>{rec.partner_name || '-'}</td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontWeight: 600, color: '#334155' }}>
                            {rec.brand && rec.model ? `${rec.brand} ${rec.model}` : (rec.brand || rec.model || '-')}
                          </span>
                          <span style={{ fontSize: '12px', color: '#64748b' }}>{rec.specification}</span>
                        </div>
                      </td>
                      <td>
                        {rec.sn ? (
                          <span style={{ fontFamily: 'monospace', padding: '2px 6px', backgroundColor: '#f1f5f9', borderRadius: '4px', fontSize: '13px' }}>
                            {rec.sn}
                          </span>
                        ) : '-'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                        {rec.quantity}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', padding: '20px', borderTop: '1px solid #e2e8f0', backgroundColor: '#fff' }}>
            <button disabled={currentPage === 1} onClick={() => setCurrentPage(prev => prev - 1)} style={{ ...navBtnStyle, opacity: currentPage === 1 ? 0.5 : 1 }}>上一頁</button>
            <span style={{ display: 'flex', alignItems: 'center', fontWeight: '800', color: '#475569', fontSize: '13px' }}>第 {currentPage} 頁 / 共 {totalPages} 頁</span>
            <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(prev => prev + 1)} style={{ ...navBtnStyle, opacity: currentPage === totalPages ? 0.5 : 1 }}>下一頁</button>
          </div>
        )}
        
        {/* Footer info */}
        {!loading && filteredRecords.length > 0 && (
          <div style={{ padding: '16px 24px', backgroundColor: '#f8fafc', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#64748b' }}>
              顯示 <strong>{filteredRecords.length}</strong> 筆紀錄
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default FlowHistory;
