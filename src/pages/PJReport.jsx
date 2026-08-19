import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart2, 
  Search, 
  Download, 
  RotateCw, 
  Layers, 
  Package, 
  Truck, 
  ChevronDown, 
  ChevronRight, 
  TrendingUp,
  Inbox,
  Building2,
  X
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './PJReport.css';

const PJReport = () => {
  const navigate = useNavigate();
  const [data, setData] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters State
  const [selectedProject, setSelectedProject] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Row Expand State
  const [expandedRows, setExpandedRows] = useState({});

  // 1. Fetch Report Data & Projects
  const fetchReport = async () => {
    setLoading(true);
    try {
      const [reportRes, projRes] = await Promise.all([
        window.electronAPI.namedQuery('fetchPJReportData'),
        window.electronAPI.namedQuery('fetchProjects')
      ]);

      if (reportRes.success) {
        setData(reportRes.rows || []);
      }
      if (projRes.success) {
        setProjects(projRes.rows || []);
      }
    } catch (err) {
      console.error('Failed to load PJ Report data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, []);

  const toggleRowExpand = (id) => {
    setExpandedRows(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // 2. Filter Logic
  const filteredData = useMemo(() => {
    return data.filter(item => {
      // Filter by Project
      if (selectedProject) {
        const itemPjName = item.project_name || '';
        const matchProject = itemPjName === selectedProject || 
                             itemPjName.includes(selectedProject) || 
                             (item.project_no && item.project_no === selectedProject);
        if (!matchProject) return false;
      }

      // Filter by Status (Outbound status)
      if (selectedStatus) {
        const allocated = Number(item.allocated_assets || 0);
        const outbound = Number(item.outbound_quantity || 0);

        if (selectedStatus === 'FULLY_OUTBOUND') {
          if (allocated === 0 || outbound < allocated) return false;
        } else if (selectedStatus === 'PARTIAL_OUTBOUND') {
          if (outbound === 0 || outbound >= allocated) return false;
        } else if (selectedStatus === 'NO_OUTBOUND') {
          if (outbound > 0) return false;
        }
      }

      // Filter by Date Range (Project created_at)
      if (startDate) {
        const itemDate = item.created_at ? new Date(item.created_at).toISOString().split('T')[0] : '';
        if (itemDate < startDate) return false;
      }
      if (endDate) {
        const itemDate = item.created_at ? new Date(item.created_at).toISOString().split('T')[0] : '';
        if (itemDate > endDate) return false;
      }

      // Filter by Search Term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const pjNo = (item.project_no || '').toLowerCase();
        const pjName = (item.project_name || '').toLowerCase();
        const customer = (item.project_customer || '').toLowerCase();

        return pjNo.includes(term) || 
               pjName.includes(term) || 
               customer.includes(term);
      }

      return true;
    });
  }, [data, selectedProject, selectedStatus, startDate, endDate, searchTerm]);

  // 3. KPI Calculations
  const kpis = useMemo(() => {
    if (filteredData.length === 0) {
      return {
        totalProjects: 0,
        totalAllocated: 0,
        totalOutbound: 0,
        stockBalance: 0,
        outboundRate: 0
      };
    }

    let totalAllocated = 0;
    let totalOutbound = 0;

    filteredData.forEach(item => {
      totalAllocated += Number(item.allocated_assets || 0);
      totalOutbound += Number(item.outbound_quantity || 0);
    });

    const stockBalance = Math.max(0, totalAllocated - totalOutbound);
    const outboundRate = totalAllocated > 0 ? Math.round((totalOutbound / totalAllocated) * 100) : 0;

    return {
      totalProjects: filteredData.length,
      totalAllocated,
      totalOutbound,
      stockBalance,
      outboundRate
    };
  }, [filteredData]);

  // 4. CSV Export
  const handleExportCSV = () => {
    if (filteredData.length === 0) {
      alert('目前篩選條件下無資料可匯出');
      return;
    }

    const headers = [
      '專案編號',
      '專案名稱',
      '客戶名稱',
      '建立日期',
      '專案總分配資產數',
      '已出庫數量',
      '未出庫庫存數',
      '出庫進度'
    ];

    const rows = filteredData.map(item => {
      const allocated = Number(item.allocated_assets || 0);
      const outbound = Number(item.outbound_quantity || 0);
      const balance = Math.max(0, allocated - outbound);
      const rate = allocated > 0 ? Math.round((outbound / allocated) * 100) : 0;

      return [
        `"${item.project_no || '-'}"`,
        `"${(item.project_name || '-').replace(/"/g, '""')}"`,
        `"${(item.project_customer || '-').replace(/"/g, '""')}"`,
        item.created_at ? new Date(item.created_at).toLocaleDateString() : '-',
        allocated,
        outbound,
        balance,
        `${rate}%`
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const today = new Date().toISOString().slice(0, 10);
    link.setAttribute('href', url);
    link.setAttribute('download', `專案報表_PJ_Report_${today}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleResetFilters = () => {
    setSelectedProject('');
    setSearchTerm('');
    setSelectedStatus('');
    setStartDate('');
    setEndDate('');
  };

  // Helper for Status Badge & Progress
  const getItemStatusBadge = (item) => {
    const allocated = Number(item.allocated_assets || 0);
    const outbound = Number(item.outbound_quantity || 0);

    if (allocated === 0) {
      return <span className="pj-badge pj-badge-slate">無分配資產</span>;
    }
    if (outbound >= allocated) {
      return <span className="pj-badge pj-badge-purple">已全數出貨</span>;
    }
    if (outbound > 0) {
      return <span className="pj-badge pj-badge-amber">部分出貨</span>;
    }
    return <span className="pj-badge pj-badge-blue">未出貨</span>;
  };

  return (
    <div className="pj-report-container">
      {/* 麵包屑導航 */}
      <div className="pj-breadcrumb">
        <span 
          className="pj-breadcrumb-link" 
          onClick={() => navigate('/reports')}
        >
          <BarChart2 size={15} /> 報表中心
        </span>
        <ChevronRight size={14} />
        <span>專案報表 (PJ Report)</span>
      </div>

      {/* 標題與操作列 */}
      <div className="pj-header-row">
        <div>
          <h1 className="pj-title">
            <Layers size={28} color="#2563eb" /> 專案報表 (PJ Report)
          </h1>
          <p className="pj-subtitle">
            以專案 (Project) 為核心，追蹤分配給專案的資產設備以及出貨進度。
          </p>
        </div>
        <div className="pj-header-actions">
          <button 
            type="button" 
            className="pj-btn pj-btn-outline" 
            onClick={fetchReport}
            disabled={loading}
            title="重新載入資料"
          >
            <RotateCw size={16} className={loading ? 'spin' : ''} /> 重新整理
          </button>
          <button 
            type="button" 
            className="pj-btn pj-btn-primary" 
            onClick={handleExportCSV}
          >
            <Download size={16} /> 匯出 CSV 報表
          </button>
        </div>
      </div>

      {/* 頂部 KPI 統計摘要卡片 */}
      <div className="pj-kpi-grid">
        <div className="pj-kpi-card">
          <div className="pj-kpi-icon-box" style={{ background: '#eff6ff', color: '#2563eb' }}>
            <Building2 size={26} />
          </div>
          <div className="pj-kpi-info">
            <span className="pj-kpi-label">專案總數</span>
            <span className="pj-kpi-value">{kpis.totalProjects}</span>
            <span className="pj-kpi-subtext">篩選條件下符合的專案數量</span>
          </div>
        </div>

        <div className="pj-kpi-card">
          <div className="pj-kpi-icon-box" style={{ background: '#ecfdf5', color: '#059669' }}>
            <Package size={26} />
          </div>
          <div className="pj-kpi-info">
            <span className="pj-kpi-label">專案分配資產總數</span>
            <span className="pj-kpi-value" style={{ color: '#059669' }}>{kpis.totalAllocated}</span>
            <span className="pj-kpi-subtext">加入專案的設備與硬體</span>
          </div>
        </div>

        <div className="pj-kpi-card">
          <div className="pj-kpi-icon-box" style={{ background: '#faf5ff', color: '#7c3aed' }}>
            <Truck size={26} />
          </div>
          <div className="pj-kpi-info">
            <span className="pj-kpi-label">已出貨總數</span>
            <span className="pj-kpi-value" style={{ color: '#7c3aed' }}>{kpis.totalOutbound}</span>
            <span className="pj-kpi-subtext">整體出貨達成率 {kpis.outboundRate}%</span>
          </div>
        </div>

        <div className="pj-kpi-card">
          <div className="pj-kpi-icon-box" style={{ background: '#fffbeb', color: '#d97706' }}>
            <TrendingUp size={26} />
          </div>
          <div className="pj-kpi-info">
            <span className="pj-kpi-label">未出貨庫存數</span>
            <span className="pj-kpi-value" style={{ color: '#d97706' }}>{kpis.stockBalance}</span>
            <span className="pj-kpi-subtext">已分配但尚未出貨的設備</span>
          </div>
        </div>
      </div>

      {/* 篩選條件卡片 */}
      <div className="pj-filter-card">
        <div className="pj-filter-grid">
          {/* 專案選擇 */}
          <div className="pj-filter-item">
            <label className="pj-filter-label">選擇專案 (Project)</label>
            <select 
              className="pj-select"
              value={selectedProject}
              onChange={e => setSelectedProject(e.target.value)}
            >
              <option value="">-- 全部專案 (All Projects) --</option>
              {projects.map(p => (
                <option key={p.id} value={`${p.name}`}>
                  [{p.project_no}] {p.name} {p.customer_name ? `(${p.customer_name})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* 關鍵字搜尋 */}
          <div className="pj-filter-item">
            <label className="pj-filter-label">快速搜尋 (專案編號/名稱/客戶)</label>
            <input 
              type="text"
              className="pj-input"
              placeholder="輸入關鍵字搜尋..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          {/* 狀態篩選 */}
          <div className="pj-filter-item">
            <label className="pj-filter-label">出貨狀態 (Status)</label>
            <select 
              className="pj-select"
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
            >
              <option value="">-- 全部狀態 --</option>
              <option value="NO_OUTBOUND">未出貨</option>
              <option value="PARTIAL_OUTBOUND">部分出貨</option>
              <option value="FULLY_OUTBOUND">已全數出貨</option>
            </select>
          </div>

          {/* 專案日期區間 */}
          <div className="pj-filter-item">
            <label className="pj-filter-label">專案建立區間</label>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <input 
                type="date" 
                className="pj-input" 
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                style={{ flex: 1 }}
              />
              <span style={{ color: '#94a3b8' }}>~</span>
              <input 
                type="date" 
                className="pj-input" 
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                style={{ flex: 1 }}
              />
            </div>
          </div>

          {/* 重設篩選 */}
          <div className="pj-filter-actions">
            <button 
              type="button" 
              className="pj-btn pj-btn-outline" 
              onClick={handleResetFilters}
              style={{ width: '100%' }}
            >
              <X size={16} /> 清除篩選
            </button>
          </div>
        </div>
      </div>

      {/* 主數據報表表格 */}
      <div className="pj-table-card">
        <div className="pj-table-header-bar">
          <div className="pj-table-count">
            顯示筆數：<span style={{ color: '#2563eb' }}>{filteredData.length}</span> 個專案
          </div>
          {selectedProject && (
            <div className="pj-badge pj-badge-blue">
              <Building2 size={13} /> 目前選擇：{selectedProject}
            </div>
          )}
        </div>

        <div className="pj-table-wrapper">
          <table className="pj-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}></th>
                <th>專案編號 / 名稱</th>
                <th>客戶資訊</th>
                <th style={{ textAlign: 'center' }}>專案總資產</th>
                <th style={{ textAlign: 'center' }}>已出庫</th>
                <th style={{ textAlign: 'center' }}>未出庫庫存</th>
                <th style={{ textAlign: 'center' }}>出庫進度</th>
                <th style={{ textAlign: 'center' }}>狀態</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan="8">
                    <div className="pj-empty-state">
                      <Inbox size={48} opacity={0.4} />
                      <div>沒有符合篩選條件的專案資料</div>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredData.map(item => {
                  const allocated = Number(item.allocated_assets || 0);
                  const outbound = Number(item.outbound_quantity || 0);
                  const stockBalance = Math.max(0, allocated - outbound);
                  const isExpanded = !!expandedRows[item.id];

                  // Progress percentage
                  const outPercent = allocated > 0 ? Math.min(100, Math.round((outbound / allocated) * 100)) : 0;

                  return (
                    <React.Fragment key={item.id}>
                      <tr className={isExpanded ? 'expanded' : ''}>
                        <td style={{ textAlign: 'center' }}>
                          <button 
                            type="button"
                            onClick={() => toggleRowExpand(item.id)}
                            style={{ 
                              background: 'none', 
                              border: 'none', 
                              cursor: 'pointer', 
                              color: '#64748b',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: '4px'
                            }}
                            title={isExpanded ? '收合明細' : '展開明細'}
                          >
                            {isExpanded ? <ChevronDown size={18} color="#2563eb" /> : <ChevronRight size={18} />}
                          </button>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: '#1e293b' }}>{item.project_no}</div>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>
                            {item.project_name}
                          </div>
                          <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                            建立: {item.created_at ? new Date(item.created_at).toLocaleDateString() : '-'}
                          </div>
                        </td>
                        <td>
                          <div style={{ color: '#334155' }}>{item.project_customer || '-'}</div>
                          {item.project_contact && (
                            <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>窗口: {item.project_contact}</div>
                          )}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 'bold' }}>
                          {allocated}
                        </td>
                        <td style={{ textAlign: 'center', color: '#7c3aed', fontWeight: 'bold' }}>
                          {outbound}
                        </td>
                        <td style={{ textAlign: 'center', color: '#d97706', fontWeight: 'bold' }}>
                          {stockBalance}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div className="pj-progress-container">
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b' }}>
                              <span>出庫</span>
                              <span style={{ fontWeight: 700 }}>{outPercent}%</span>
                            </div>
                            <div className="pj-progress-bar">
                              <div 
                                className="pj-progress-fill" 
                                style={{ 
                                  width: `${outPercent}%`,
                                  backgroundColor: outPercent >= 100 ? '#7c3aed' : '#2563eb'
                                }}
                              />
                            </div>
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {getItemStatusBadge(item)}
                        </td>
                      </tr>

                      {/* 展開之歷程明細 */}
                      {isExpanded && (
                        <tr>
                          <td colSpan="8" style={{ padding: 0 }}>
                            <div className="pj-detail-box">
                              
                              <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
                                {/* 📥 分配資產清單 */}
                                <div className="pj-detail-section" style={{ flex: 1 }}>
                                  <div className="pj-detail-title">
                                    <Package size={16} color="#059669" /> 硬體設備清單 ({item.allocated_assets_history?.length || 0})
                                  </div>
                                  {item.allocated_assets_history && item.allocated_assets_history.length > 0 ? (
                                    <table className="pj-history-table">
                                      <thead>
                                        <tr>
                                          <th>序號 (SN)</th>
                                          <th>設備品名</th>
                                          <th>狀態</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {item.allocated_assets_history.map((a, aIdx) => (
                                          <tr key={aIdx}>
                                            <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{a.sn || '-'}</td>
                                            <td>
                                              {a.category_name && (
                                                <span className="pj-badge pj-badge-slate" style={{ marginRight: '6px', fontSize: '10px', padding: '2px 6px' }}>
                                                  {a.category_name}
                                                </span>
                                              )}
                                              {a.item_name}
                                            </td>
                                            <td>
                                              {(() => {
                                                const statusConfig = {
                                                  ACTIVE: { label: '在庫', color: '#047857', bgColor: '#dcfce7', borderColor: '#bbf7d0' },
                                                  REPAIRING: { label: '維修中', color: '#fa8c16', bgColor: '#fff7e6', borderColor: '#ffd591' },
                                                  PENDING_SCRAP: { label: '待報廢', color: '#595959', bgColor: '#f5f5f5', borderColor: '#d9d9d9' },
                                                  SCRAPPED: { label: '已報廢', color: '#f5222d', bgColor: '#fff1f0', borderColor: '#ffccc7' },
                                                  SHIPPED: { label: '已出貨', color: '#1d4ed8', bgColor: '#dbeafe', borderColor: '#bfdbfe' },
                                                  LENT: { label: '借出/借用', color: '#b45309', bgColor: '#fef3c7', borderColor: '#fde68a' }
                                                };
                                                const config = statusConfig[a.status] || { label: a.status, color: '#334155', bgColor: '#f8fafc', borderColor: '#cbd5e1' };
                                                return (
                                                  <span style={{ 
                                                    padding: '2px 8px', 
                                                    borderRadius: '4px', 
                                                    fontSize: '0.85rem', 
                                                    fontWeight: 600,
                                                    color: config.color,
                                                    backgroundColor: config.bgColor,
                                                    border: `1px solid ${config.borderColor}`,
                                                    display: 'inline-block'
                                                  }}>
                                                    {config.label}
                                                  </span>
                                                );
                                              })()}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  ) : (
                                    <div style={{ color: '#94a3b8', fontSize: '13px', padding: '12px 0' }}>
                                      目前無分配任何資產
                                    </div>
                                  )}
                                </div>

                                {/* 📤 出貨單明細歷程 */}
                                <div className="pj-detail-section" style={{ flex: 1 }}>
                                  <div className="pj-detail-title">
                                    <Truck size={16} color="#7c3aed" /> 出貨建檔歷程 ({item.outbound_history?.length || 0})
                                  </div>
                                  {item.outbound_history && item.outbound_history.length > 0 ? (
                                    <table className="pj-history-table">
                                      <thead>
                                        <tr>
                                          <th>出貨單號</th>
                                          <th>出貨日期</th>
                                          <th>出貨序號</th>
                                          <th>設備品名</th>
                                          <th style={{ textAlign: 'right' }}>數量</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {item.outbound_history.map((o, oIdx) => (
                                          <tr key={oIdx}>
                                            <td style={{ fontWeight: 600, color: '#7c3aed' }}>{o.request_no}</td>
                                            <td>{o.shipping_date ? new Date(o.shipping_date).toLocaleDateString() : '-'}</td>
                                            <td style={{ fontFamily: 'monospace' }}>{o.sn || '(無序號)'}</td>
                                            <td>{o.item_name}</td>
                                            <td style={{ textAlign: 'right', fontWeight: 700 }}>{o.quantity}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  ) : (
                                    <div style={{ color: '#94a3b8', fontSize: '13px', padding: '12px 0' }}>
                                      尚未有出貨紀錄
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default PJReport;
