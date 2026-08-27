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
  X,
  Camera
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import html2canvas from 'html2canvas';
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

  // Image Export State
  const [exportingId, setExportingId] = useState(null);
  const [exportingProject, setExportingProject] = useState(null);

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

  // Dropdown options for Projects, filtered by selectedStatus
  const availableProjectsForDropdown = useMemo(() => {
    return data.filter(item => {
      if (!selectedStatus) return true;
      const allocated = Number(item.allocated_assets || 0);
      const outbound = Number(item.outbound_quantity || 0);

      if (selectedStatus === 'FULLY_OUTBOUND') {
        return (allocated > 0 && outbound >= allocated);
      } else if (selectedStatus === 'PARTIAL_OUTBOUND') {
        return (outbound > 0 && outbound < allocated);
      } else if (selectedStatus === 'NO_OUTBOUND') {
        return (outbound === 0);
      }
      return true;
    });
  }, [data, selectedStatus]);



  // 4. CSV Export
  const handleExportCSV = () => {
    if (filteredData.length === 0) {
      alert('目前篩選條件下無資料可匯出');
      return;
    }

    const statusConfig = {
      ACTIVE: { label: '在庫' },
      REPAIRING: { label: '維修中' },
      PENDING_SCRAP: { label: '待報廢' },
      SCRAPPED: { label: '已報廢' },
      SHIPPED: { label: '已出貨' },
      LENT: { label: '借出/借用' }
    };

    // Header definition
    const headers = [
      '專案編號',
      '專案名稱',
      '客戶名稱',
      '專案窗口',
      '專案建立日期',
      '專案總分配資產數',
      '已出庫總數',
      '未出庫庫存餘額',
      '出庫進度率(%)',
      '出庫狀態',
      '明細類別',
      '單據/SN',
      '分類/廠牌/型號',
      '明細狀態/數量',
      '明細日期'
    ];

    const rows = [];

    filteredData.forEach(item => {
      const allocated = Number(item.allocated_assets || 0);
      const outbound = Number(item.outbound_quantity || 0);
      const stockBalance = Math.max(0, allocated - outbound);
      const outPercent = allocated > 0 ? Math.min(100, Math.round((outbound / allocated) * 100)) : 0;

      let statusLabel = '未出貨';
      if (allocated === 0) statusLabel = '無分配資產';
      else if (outbound >= allocated) statusLabel = '已全數出貨';
      else if (outbound > 0) statusLabel = '部分出貨';

      const baseRow = [
        `"${item.project_no || ''}"`,
        `"${(item.project_name || '').replace(/"/g, '""')}"`,
        `"${(item.project_customer || '').replace(/"/g, '""')}"`,
        `"${(item.project_contact || '').replace(/"/g, '""')}"`,
        `"${item.created_at ? new Date(item.created_at).toLocaleDateString() : ''}"`,
        allocated,
        outbound,
        stockBalance,
        `"${outPercent}%"`,
        `"${statusLabel}"`
      ];

      // Summary row
      rows.push([...baseRow, '"專案總覽"', '""', '""', '""', '""'].join(','));

      // Allocated assets history
      if (item.allocated_assets_history && item.allocated_assets_history.length > 0) {
        item.allocated_assets_history.forEach(a => {
          const aStatus = statusConfig[a.status]?.label || a.status || '';
          const aDesc = `${a.category_name || ''} / ${a.brand || ''} / ${a.model || ''}`;
          rows.push([
            ...baseRow,
            '"分配資產"',
            `"${a.sn || ''}"`,
            `"${aDesc.replace(/"/g, '""')}"`,
            `"${aStatus}"`,
            '""'
          ].join(','));
        });
      }

      // Outbound history
      if (item.outbound_history && item.outbound_history.length > 0) {
        item.outbound_history.forEach(o => {
          const oDesc = `${o.category_name || ''} / ${o.brand || ''} / ${o.model || ''}`;
          const oDate = o.shipping_date ? new Date(o.shipping_date).toLocaleDateString() : '';
          rows.push([
            ...baseRow,
            '"出庫歷程"',
            `"${o.request_no || ''} (${o.sn || '無SN'})"`,
            `"${oDesc.replace(/"/g, '""')}"`,
            `"出貨數量: ${o.quantity}"`,
            `"${oDate}"`
          ].join(','));
        });
      }
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const today = new Date().toISOString().split('T')[0];
    link.setAttribute('download', `專案報表_PJ_Report_${today}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 5. Single Project Export as PNG Image
  const handleExportProjectImage = async (projectItem) => {
    if (!projectItem) return;
    setExportingProject(projectItem);
    setExportingId(projectItem.id);

    setTimeout(async () => {
      try {
        const cardElem = document.getElementById('pj-export-card-active');
        if (!cardElem) {
          alert('無法取得專案圖檔節點，請重試。');
          return;
        }

        const canvas = await html2canvas(cardElem, {
          scale: 2, // High resolution (2x Retina)
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff',
          logging: false,
          windowWidth: 1200
        });

        const imgData = canvas.toDataURL('image/png');
        const safeProjectNo = (projectItem.project_no || 'PROJECT').replace(/[/\\?%*:|"<>]/g, '_');
        const safeProjectName = (projectItem.project_name || '').replace(/[/\\?%*:|"<>]/g, '_');
        const fileName = `${safeProjectNo}_${safeProjectName}_專案報表.png`;

        const link = document.createElement('a');
        link.href = imgData;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (err) {
        console.error('Export project image failed:', err);
        alert('匯出圖片時發生錯誤：' + err.message);
      } finally {
        setExportingId(null);
        setExportingProject(null);
      }
    }, 120);
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



      {/* 篩選條件卡片 */}
      <div className="pj-filter-card">
        <div className="pj-filter-grid">
          {/* 狀態篩選 (Moved to front) */}
          <div className="pj-filter-item">
            <label className="pj-filter-label">出貨狀態 (Status)</label>
            <select 
              className="pj-select"
              value={selectedStatus}
              onChange={e => {
                setSelectedStatus(e.target.value);
                setSelectedProject(''); // Reset project when status changes
              }}
            >
              <option value="">-- 全部狀態 --</option>
              <option value="NO_OUTBOUND">未出貨</option>
              <option value="PARTIAL_OUTBOUND">部分出貨</option>
              <option value="FULLY_OUTBOUND">已全數出貨</option>
            </select>
          </div>

          {/* 專案選擇 */}
          <div className="pj-filter-item">
            <label className="pj-filter-label">選擇專案 (Project)</label>
            <select 
              className="pj-select"
              value={selectedProject}
              onChange={e => setSelectedProject(e.target.value)}
            >
              <option value="">-- 全部專案 (All Projects) --</option>
              {availableProjectsForDropdown.map(p => (
                <option key={p.id || p.project_no} value={`${p.project_name}`}>
                  [{p.project_no}] {p.project_name} {p.project_customer ? `(${p.project_customer})` : ''}
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
                <th style={{ textAlign: 'center', width: '110px' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan="9">
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
                          <div style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{item.project_no}</div>
                          <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>
                            {item.project_name}
                          </div>
                          <div style={{ fontSize: '11.5px', color: 'var(--text-subtle)' }}>
                            建立: {item.created_at ? new Date(item.created_at).toLocaleDateString() : '-'}
                          </div>
                        </td>
                        <td>
                          <div style={{ color: 'var(--text-main)', fontWeight: 600 }}>{item.project_customer || '-'}</div>
                          {item.project_contact && (
                            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>窗口: {item.project_contact}</div>
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
                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleExportProjectImage(item);
                            }}
                            disabled={exportingId === item.id}
                            className="pj-btn-capture"
                            title="匯出此專案圖檔 (PNG)"
                          >
                            {exportingId === item.id ? (
                              <>
                                <RotateCw size={13} className="spin" />
                                <span>產生中</span>
                              </>
                            ) : (
                              <>
                                <Camera size={13} />
                                <span>匯出圖片</span>
                              </>
                            )}
                          </button>
                        </td>
                      </tr>

                      {/* 展開之歷程明細 */}
                      {isExpanded && (
                        <tr>
                          <td colSpan="9" style={{ padding: 0 }}>
                            <div className="pj-detail-box">
                              {/* 明細頂部功能條 */}
                              <div className="pj-detail-header-bar">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <Layers size={18} color="#2563eb" />
                                  <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                                    [{item.project_no}] {item.project_name} 專案進銷存明細
                                  </span>
                                  {getItemStatusBadge(item)}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleExportProjectImage(item)}
                                  disabled={exportingId === item.id}
                                  className="pj-btn pj-btn-primary"
                                  style={{ padding: '6px 14px', fontSize: '13px' }}
                                >
                                  {exportingId === item.id ? (
                                    <>
                                      <RotateCw size={14} className="spin" />
                                      <span>產生圖片中...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Camera size={14} />
                                      <span>匯出專案圖檔 (PNG)</span>
                                    </>
                                  )}
                                </button>
                              </div>

                              {/* 📥 分配資產清單 */}
                              <div className="pj-detail-section" style={{ minWidth: 0, overflowX: 'auto' }}>
                                <div className="pj-detail-title">
                                  <Package size={16} color="#059669" /> 硬體設備清單 ({item.allocated_assets_history?.length || 0})
                                </div>
                                {item.allocated_assets_history && item.allocated_assets_history.length > 0 ? (
                                  <table className="pj-history-table">
                                    <thead>
                                      <tr>
                                        <th>序號 (SN)</th>
                                        <th>分類</th>
                                        <th>廠牌</th>
                                        <th>類型</th>
                                        <th>型號</th>
                                        <th>狀態</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {item.allocated_assets_history.map((a, aIdx) => (
                                        <tr key={aIdx}>
                                          <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{a.sn || '-'}</td>
                                          <td>
                                            {a.category_name ? (
                                              <span className="pj-badge pj-badge-slate" style={{ fontSize: '10px', padding: '2px 6px' }}>
                                                {a.category_name}
                                              </span>
                                            ) : '-'}
                                          </td>
                                          <td>{a.brand || '-'}</td>
                                          <td>{a.type || '-'}</td>
                                          <td>{a.model || '-'}</td>
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
                              <div className="pj-detail-section" style={{ minWidth: 0, overflowX: 'auto' }}>
                                <div className="pj-detail-title">
                                  <Truck size={16} color="#7c3aed" /> 出貨建檔歷程 ({item.outbound_history?.length || 0})
                                </div>
                                {item.outbound_history && item.outbound_history.length > 0 ? (
                                  <table className="pj-history-table">
                                    <thead>
                                      <tr>
                                        <th>出貨單號</th>
                                        <th>出貨日期</th>
                                        <th>序號(SN)</th>
                                        <th>分類</th>
                                        <th>廠牌</th>
                                        <th>類型</th>
                                        <th>型號</th>
                                        <th style={{ textAlign: 'right' }}>數量</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {item.outbound_history.map((o, oIdx) => (
                                        <tr key={oIdx}>
                                          <td style={{ fontWeight: 600, color: '#7c3aed' }}>{o.request_no}</td>
                                          <td>{o.shipping_date ? new Date(o.shipping_date).toLocaleDateString() : '-'}</td>
                                          <td style={{ fontFamily: 'monospace' }}>{o.sn || '(無序號)'}</td>
                                          <td>
                                            {o.category_name ? (
                                              <span className="pj-badge pj-badge-slate" style={{ fontSize: '10px', padding: '2px 6px' }}>
                                                {o.category_name}
                                              </span>
                                            ) : '-'}
                                          </td>
                                          <td>{o.brand || '-'}</td>
                                          <td>{o.type || '-'}</td>
                                          <td>{o.model || '-'}</td>
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

      {/* 專案圖片匯出專用隱藏渲染節點 (Off-screen Capture Template) */}
      {exportingProject && (
        <div className="pj-export-capture-container">
          <div id="pj-export-card-active" className="pj-export-card">
            {/* 1. Header */}
            <div className="pj-export-header">
              <div className="pj-export-title-group">
                <div className="pj-export-system-tag">
                  <Layers size={16} color="#2563eb" /> METECH ERP 企業管理系統
                </div>
                <h1 className="pj-export-main-title">
                  專案進銷存與資產報表 (Project Report)
                </h1>
              </div>
              <div className="pj-export-meta-group">
                <div>產出時間：{new Date().toLocaleString('zh-TW')}</div>
                <div>文件編號：RPT-{exportingProject.project_no || 'PJ'}-{new Date().toISOString().slice(0, 10).replace(/-/g, '')}</div>
              </div>
            </div>

            {/* 2. Project Profile Info Grid */}
            <div className="pj-export-info-grid">
              <div className="pj-export-info-item">
                <span className="pj-export-info-label">專案編號</span>
                <span className="pj-export-info-value" style={{ color: '#2563eb', fontFamily: 'monospace' }}>
                  {exportingProject.project_no || '-'}
                </span>
              </div>
              <div className="pj-export-info-item">
                <span className="pj-export-info-label">專案名稱</span>
                <span className="pj-export-info-value">{exportingProject.project_name || '-'}</span>
              </div>
              <div className="pj-export-info-item">
                <span className="pj-export-info-label">客戶名稱 / 窗口</span>
                <span className="pj-export-info-value">
                  {exportingProject.project_customer || '-'} {exportingProject.project_contact ? `(${exportingProject.project_contact})` : ''}
                </span>
              </div>
              <div className="pj-export-info-item">
                <span className="pj-export-info-label">出庫狀態</span>
                <div>{getItemStatusBadge(exportingProject)}</div>
              </div>
            </div>

            {/* 3. KPI Metrics Row */}
            {(() => {
              const allocated = Number(exportingProject.allocated_assets || 0);
              const outbound = Number(exportingProject.outbound_quantity || 0);
              const stockBalance = Math.max(0, allocated - outbound);
              const outPercent = allocated > 0 ? Math.min(100, Math.round((outbound / allocated) * 100)) : 0;

              return (
                <div className="pj-export-kpi-row">
                  <div className="pj-export-kpi-box">
                    <div className="pj-export-kpi-title">專案分配總資產</div>
                    <div className="pj-export-kpi-num" style={{ color: '#0f172a' }}>
                      {allocated} <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>台/件</span>
                    </div>
                  </div>
                  <div className="pj-export-kpi-box">
                    <div className="pj-export-kpi-title">已出庫數量</div>
                    <div className="pj-export-kpi-num" style={{ color: '#7c3aed' }}>
                      {outbound} <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>台/件</span>
                    </div>
                  </div>
                  <div className="pj-export-kpi-box">
                    <div className="pj-export-kpi-title">在庫未出庫餘額</div>
                    <div className="pj-export-kpi-num" style={{ color: '#d97706' }}>
                      {stockBalance} <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>台/件</span>
                    </div>
                  </div>
                  <div className="pj-export-kpi-box">
                    <div className="pj-export-kpi-title">出庫達成率</div>
                    <div className="pj-export-kpi-num" style={{ color: outPercent >= 100 ? '#7c3aed' : '#2563eb' }}>
                      {outPercent}%
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* 4. Table 1: 分配硬體設備清單 */}
            <div className="pj-export-section-card">
              <div className="pj-export-section-title">
                <Package size={17} color="#059669" />
                <span>硬體設備分配清單 ({exportingProject.allocated_assets_history?.length || 0})</span>
              </div>
              {exportingProject.allocated_assets_history && exportingProject.allocated_assets_history.length > 0 ? (
                <table className="pj-export-table">
                  <thead>
                    <tr>
                      <th>序號 (SN)</th>
                      <th>分類</th>
                      <th>廠牌</th>
                      <th>類型</th>
                      <th>型號</th>
                      <th>目前狀態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exportingProject.allocated_assets_history.map((a, idx) => (
                      <tr key={idx}>
                        <td style={{ fontFamily: 'monospace', fontWeight: 700, color: '#2563eb' }}>{a.sn || '-'}</td>
                        <td>{a.category_name || '-'}</td>
                        <td>{a.brand || '-'}</td>
                        <td>{a.type || '-'}</td>
                        <td>{a.model || '-'}</td>
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
                            const cfg = statusConfig[a.status] || { label: a.status || '-', color: '#334155', bgColor: '#f8fafc', borderColor: '#cbd5e1' };
                            return (
                              <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11.5px', fontWeight: 700, color: cfg.color, backgroundColor: cfg.bgColor, border: `1px solid ${cfg.borderColor}` }}>
                                {cfg.label}
                              </span>
                            );
                          })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ padding: '20px', color: '#94a3b8', textAlign: 'center', fontSize: '13px' }}>
                  目前無分配任何硬體設備資產
                </div>
              )}
            </div>

            {/* 5. Table 2: 出貨建檔歷程 */}
            <div className="pj-export-section-card">
              <div className="pj-export-section-title">
                <Truck size={17} color="#7c3aed" />
                <span>出貨建檔與交付歷程 ({exportingProject.outbound_history?.length || 0})</span>
              </div>
              {exportingProject.outbound_history && exportingProject.outbound_history.length > 0 ? (
                <table className="pj-export-table">
                  <thead>
                    <tr>
                      <th>出貨單號</th>
                      <th>出貨日期</th>
                      <th>序號 (SN)</th>
                      <th>分類</th>
                      <th>廠牌 / 型號</th>
                      <th style={{ textAlign: 'right' }}>出貨數量</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exportingProject.outbound_history.map((o, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 700, color: '#7c3aed', fontFamily: 'monospace' }}>{o.request_no}</td>
                        <td>{o.shipping_date ? new Date(o.shipping_date).toLocaleDateString('zh-TW') : '-'}</td>
                        <td style={{ fontFamily: 'monospace' }}>{o.sn || '(無序號)'}</td>
                        <td>{o.category_name || '-'}</td>
                        <td>{o.brand ? `${o.brand} ${o.model || ''}` : (o.model || '-')}</td>
                        <td style={{ textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>{o.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ padding: '20px', color: '#94a3b8', textAlign: 'center', fontSize: '13px' }}>
                  尚未有任何出貨單據紀錄
                </div>
              )}
            </div>

            {/* 6. Footer */}
            <div className="pj-export-footer">
              <div>METECH ERP 企業專案營運進銷存系統 • 專案報表</div>
              <div>機密文件 • 僅供內部與專案客戶核對使用</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PJReport;

