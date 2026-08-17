import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart2, 
  Search, 
  Filter, 
  Download, 
  RotateCw, 
  Layers, 
  Package, 
  Truck, 
  CheckCircle2, 
  Clock, 
  ChevronDown, 
  ChevronRight, 
  ArrowUpRight,
  TrendingUp,
  Inbox,
  AlertCircle,
  Building2,
  Calendar,
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
  const [selectedCategory, setSelectedCategory] = useState('');
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
        const itemPj = item.project_name || '';
        const matchProject = itemPj === selectedProject || 
                             itemPj.includes(selectedProject) || 
                             (item.project_no && item.project_no === selectedProject);
        if (!matchProject) return false;
      }

      // Filter by Category
      if (selectedCategory && item.category_name !== selectedCategory) {
        return false;
      }

      // Filter by Status
      if (selectedStatus) {
        const inboundQty = Number(item.inbound_quantity || 0);
        const poQty = Number(item.po_quantity || 0);
        const outboundQty = Number(item.outbound_quantity || 0);

        if (selectedStatus === 'COMPLETED_OUTBOUND') {
          // 已全數出貨
          if (outboundQty < poQty || outboundQty === 0) return false;
        } else if (selectedStatus === 'FULLY_INBOUND') {
          // 已完全到貨
          if (inboundQty < poQty) return false;
        } else if (selectedStatus === 'PARTIAL_INBOUND') {
          // 部分到貨
          if (inboundQty === 0 || inboundQty >= poQty) return false;
        } else if (selectedStatus === 'PENDING_INBOUND') {
          // 待進貨 / 採購中
          if (inboundQty > 0) return false;
        }
      }

      // Filter by Date Range (PO created_at)
      if (startDate) {
        const itemDate = item.created_at ? new Date(item.created_at).toISOString().split('T')[0] : '';
        if (itemDate < startDate) return false;
      }
      if (endDate) {
        const itemDate = item.created_at ? new Date(item.created_at).toISOString().split('T')[0] : '';
        if (itemDate > endDate) return false;
      }

      // Filter by Search Term (PO, brand, model, specification, partner)
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const poNo = (item.order_no || '').toLowerCase();
        const brand = (item.brand || '').toLowerCase();
        const model = (item.model || '').toLowerCase();
        const spec = (item.specification || '').toLowerCase();
        const partner = (item.partner_name || '').toLowerCase();
        const pjName = (item.project_name || '').toLowerCase();

        return poNo.includes(term) || 
               brand.includes(term) || 
               model.includes(term) || 
               spec.includes(term) || 
               partner.includes(term) ||
               pjName.includes(term);
      }

      return true;
    });
  }, [data, selectedProject, selectedCategory, selectedStatus, startDate, endDate, searchTerm]);

  // 3. KPI Calculations
  const kpis = useMemo(() => {
    if (!selectedProject) {
      return {
        totalItems: '--',
        totalPoQty: '--',
        totalInboundQty: '--',
        totalOutboundQty: '--',
        stockBalance: '--',
        inboundRate: '--',
        outboundRate: '--'
      };
    }

    let totalPoQty = 0;
    let totalInboundQty = 0;
    let totalOutboundQty = 0;

    filteredData.forEach(item => {
      totalPoQty += Number(item.po_quantity || 0);
      totalInboundQty += Number(item.inbound_quantity || 0);
      totalOutboundQty += Number(item.outbound_quantity || 0);
    });

    const stockBalance = Math.max(0, totalInboundQty - totalOutboundQty);
    const inboundRate = totalPoQty > 0 ? Math.round((totalInboundQty / totalPoQty) * 100) : 0;
    const outboundRate = totalInboundQty > 0 ? Math.round((totalOutboundQty / totalInboundQty) * 100) : 0;

    return {
      totalItems: filteredData.length,
      totalPoQty,
      totalInboundQty,
      totalOutboundQty,
      stockBalance,
      inboundRate,
      outboundRate
    };
  }, [filteredData, selectedProject]);

  // 4. CSV Export
  const handleExportCSV = () => {
    if (filteredData.length === 0) {
      alert('目前篩選條件下無資料可匯出');
      return;
    }

    const headers = [
      '專案編號/名稱',
      '客戶名稱',
      '採購單號',
      '採購日期',
      '供應商',
      '類別',
      '廠牌',
      '型號',
      '規格說明',
      '單位',
      '採購數量',
      '已進貨數量',
      '待進貨數量',
      '已出貨數量',
      '專案在庫餘額',
      '採購狀態'
    ];

    const rows = filteredData.map(item => {
      const poQty = Number(item.po_quantity || 0);
      const inQty = Number(item.inbound_quantity || 0);
      const outQty = Number(item.outbound_quantity || 0);
      const pendingQty = Math.max(0, poQty - inQty);
      const stockBalance = Math.max(0, inQty - outQty);

      return [
        `"${(item.project_name || '-').replace(/"/g, '""')}"`,
        `"${(item.project_customer || '-').replace(/"/g, '""')}"`,
        `"${item.order_no || '-'}"`,
        item.created_at ? new Date(item.created_at).toLocaleDateString() : '-',
        `"${(item.partner_name || '-').replace(/"/g, '""')}"`,
        item.category_name || '-',
        item.brand || '-',
        `"${(item.model || '-').replace(/"/g, '""')}"`,
        `"${(item.specification || '-').replace(/"/g, '""')}"`,
        item.unit || '個',
        poQty,
        inQty,
        pendingQty,
        outQty,
        stockBalance,
        item.po_status || '-'
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const today = new Date().toISOString().slice(0, 10);
    link.setAttribute('href', url);
    link.setAttribute('download', `專案進出報表_PJ_Report_${today}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleResetFilters = () => {
    setSelectedProject('');
    setSearchTerm('');
    setSelectedCategory('');
    setSelectedStatus('');
    setStartDate('');
    setEndDate('');
  };

  // Helper for Status Badge & Progress
  const getItemStatusBadge = (item) => {
    const poQty = Number(item.po_quantity || 0);
    const inQty = Number(item.inbound_quantity || 0);
    const outQty = Number(item.outbound_quantity || 0);

    if (outQty >= poQty && poQty > 0) {
      return <span className="pj-badge pj-badge-purple">已全數出貨</span>;
    }
    if (inQty >= poQty && poQty > 0) {
      if (outQty > 0) {
        return <span className="pj-badge pj-badge-green">備料完成 (部分出貨)</span>;
      }
      return <span className="pj-badge pj-badge-green">備料完成 (待出貨)</span>;
    }
    if (inQty > 0) {
      return <span className="pj-badge pj-badge-amber">部分到貨</span>;
    }
    return <span className="pj-badge pj-badge-blue">採購中 (待進貨)</span>;
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
            <Layers size={28} color="#2563eb" /> 專案進出報表 (PJ Report)
          </h1>
          <p className="pj-subtitle">
            以採購單 (PO) 為核心骨架，整合進貨單 (S/I) 與出貨單 (D/N) 之料件數量、進度與在庫餘額。
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
            <Package size={26} />
          </div>
          <div className="pj-kpi-info">
            <span className="pj-kpi-label">採購總數 (PO Total)</span>
            <span className="pj-kpi-value">{kpis.totalPoQty}</span>
            <span className="pj-kpi-subtext">共 {kpis.totalItems} 項採購項目</span>
          </div>
        </div>

        <div className="pj-kpi-card">
          <div className="pj-kpi-icon-box" style={{ background: '#ecfdf5', color: '#059669' }}>
            <Inbox size={26} />
          </div>
          <div className="pj-kpi-info">
            <span className="pj-kpi-label">累計已進貨 (Inbound)</span>
            <span className="pj-kpi-value" style={{ color: '#059669' }}>{kpis.totalInboundQty}</span>
            <span className="pj-kpi-subtext">到貨達成率 {kpis.inboundRate}%</span>
          </div>
        </div>

        <div className="pj-kpi-card">
          <div className="pj-kpi-icon-box" style={{ background: '#faf5ff', color: '#7c3aed' }}>
            <Truck size={26} />
          </div>
          <div className="pj-kpi-info">
            <span className="pj-kpi-label">累計已出貨 (Outbound)</span>
            <span className="pj-kpi-value" style={{ color: '#7c3aed' }}>{kpis.totalOutboundQty}</span>
            <span className="pj-kpi-subtext">出貨完成率 {kpis.outboundRate}%</span>
          </div>
        </div>

        <div className="pj-kpi-card">
          <div className="pj-kpi-icon-box" style={{ background: '#fffbeb', color: '#d97706' }}>
            <TrendingUp size={26} />
          </div>
          <div className="pj-kpi-info">
            <span className="pj-kpi-label">專案在庫餘額 (Stock Balance)</span>
            <span className="pj-kpi-value" style={{ color: '#d97706' }}>{kpis.stockBalance}</span>
            <span className="pj-kpi-subtext">已進貨尚未出貨數量</span>
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
                <option key={p.id} value={`${p.project_no} ${p.name}`}>
                  [{p.project_no}] {p.name} {p.customer_name ? `(${p.customer_name})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* 關鍵字搜尋 */}
          <div className="pj-filter-item">
            <label className="pj-filter-label">快速搜尋 (PO/廠牌/型號/規格/廠商)</label>
            <input 
              type="text"
              className="pj-input"
              placeholder="輸入關鍵字搜尋..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          {/* 類別篩選 */}
          <div className="pj-filter-item">
            <label className="pj-filter-label">品項類別 (Category)</label>
            <select 
              className="pj-select"
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
            >
              <option value="">-- 全部類別 --</option>
              <option value="設備">設備</option>
              <option value="硬體">硬體</option>
              <option value="耗材">耗材</option>
            </select>
          </div>

          {/* 狀態篩選 */}
          <div className="pj-filter-item">
            <label className="pj-filter-label">進銷狀態 (Status)</label>
            <select 
              className="pj-select"
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
            >
              <option value="">-- 全部狀態 --</option>
              <option value="PENDING_INBOUND">採購中 (待進貨)</option>
              <option value="PARTIAL_INBOUND">部分到貨</option>
              <option value="FULLY_INBOUND">備料完成 (已全到)</option>
              <option value="COMPLETED_OUTBOUND">已全數出貨</option>
            </select>
          </div>

          {/* 採購日期區間 */}
          <div className="pj-filter-item">
            <label className="pj-filter-label">採購日期區間</label>
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
            顯示筆數：<span style={{ color: '#2563eb' }}>{filteredData.length}</span> 筆採購項目
          </div>
          {selectedProject && (
            <div className="pj-badge pj-badge-blue">
              <Building2 size={13} /> 目前專案：{selectedProject}
            </div>
          )}
        </div>

        <div className="pj-table-wrapper">
          <table className="pj-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}></th>
                <th>專案編號 / 名稱</th>
                <th>採購單號 (PO)</th>
                <th>類別 / 廠牌 / 型號</th>
                <th>規格詳細說明</th>
                <th>供應商</th>
                <th style={{ textAlign: 'center' }}>採購數</th>
                <th style={{ textAlign: 'center' }}>已進貨</th>
                <th style={{ textAlign: 'center' }}>待進貨</th>
                <th style={{ textAlign: 'center' }}>已出貨</th>
                <th style={{ textAlign: 'center' }}>專案餘額</th>
                <th style={{ textAlign: 'center' }}>進出進度</th>
                <th style={{ textAlign: 'center' }}>狀態</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan="13">
                    <div className="pj-empty-state">
                      <Inbox size={48} opacity={0.4} />
                      <div>沒有符合篩選條件的專案採購與進出貨資料</div>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredData.map(item => {
                  const poQty = Number(item.po_quantity || 0);
                  const inQty = Number(item.inbound_quantity || 0);
                  const outQty = Number(item.outbound_quantity || 0);
                  const pendingQty = Math.max(0, poQty - inQty);
                  const stockBalance = Math.max(0, inQty - outQty);
                  const isExpanded = !!expandedRows[item.id];

                  // Progress percentage
                  const inPercent = poQty > 0 ? Math.min(100, Math.round((inQty / poQty) * 100)) : 0;

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
                            title={isExpanded ? '收合歷史明細' : '展開進出貨歷史明細'}
                          >
                            {isExpanded ? <ChevronDown size={18} color="#2563eb" /> : <ChevronRight size={18} />}
                          </button>
                        </td>
                        <td>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>
                            {item.project_name || '(一般庫存採購)'}
                          </div>
                          {item.project_customer && (
                            <div style={{ fontSize: '12px', color: '#64748b' }}>
                              客戶: {item.project_customer}
                            </div>
                          )}
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: '#1e293b' }}>{item.order_no}</div>
                          <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                            {item.created_at ? new Date(item.created_at).toLocaleDateString() : '-'}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span className="pj-badge pj-badge-slate">{item.category_name}</span>
                            <span style={{ fontWeight: 600 }}>{item.brand} {item.model}</span>
                          </div>
                          {item.item_type && (
                            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                              類型: {item.item_type}
                            </div>
                          )}
                        </td>
                        <td style={{ maxWidth: '240px', wordBreak: 'break-word', color: '#475569' }}>
                          {item.specification || '-'}
                        </td>
                        <td>
                          <div style={{ color: '#334155' }}>{item.partner_name || '-'}</div>
                          {item.purchaser_name && (
                            <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>採購: {item.purchaser_name}</div>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }} className="pj-num-ordered">
                          {poQty} <span style={{ fontSize: '11px', color: '#94a3b8' }}>{item.unit || '個'}</span>
                        </td>
                        <td style={{ textAlign: 'center' }} className="pj-num-inbound">
                          {inQty}
                        </td>
                        <td style={{ textAlign: 'center' }} className="pj-num-pending">
                          {pendingQty > 0 ? pendingQty : <span style={{ color: '#94a3b8' }}>0</span>}
                        </td>
                        <td style={{ textAlign: 'center' }} className="pj-num-outbound">
                          {outQty}
                        </td>
                        <td style={{ textAlign: 'center' }} className="pj-num-stock">
                          {stockBalance}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div className="pj-progress-container">
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b' }}>
                              <span>到貨</span>
                              <span style={{ fontWeight: 700 }}>{inPercent}%</span>
                            </div>
                            <div className="pj-progress-bar">
                              <div 
                                className="pj-progress-fill" 
                                style={{ 
                                  width: `${inPercent}%`,
                                  backgroundColor: inPercent >= 100 ? '#059669' : '#2563eb'
                                }}
                              />
                            </div>
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {getItemStatusBadge(item)}
                        </td>
                      </tr>

                      {/* 展開之進出貨歷程明細 */}
                      {isExpanded && (
                        <tr>
                          <td colSpan="13" style={{ padding: 0 }}>
                            <div className="pj-detail-box">
                              {/* 📥 進貨單明細歷程 */}
                              <div className="pj-detail-section">
                                <div className="pj-detail-title">
                                  <Inbox size={16} color="#2563eb" /> 進貨入庫歷程 (Inbound Records)
                                </div>
                                {item.inbound_history && item.inbound_history.length > 0 ? (
                                  <table className="pj-history-table">
                                    <thead>
                                      <tr>
                                        <th>進貨單號</th>
                                        <th>進貨日期</th>
                                        <th>序號 (SN)</th>
                                        <th style={{ textAlign: 'right' }}>數量</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {item.inbound_history.map((h, hIdx) => (
                                        <tr key={hIdx}>
                                          <td style={{ fontWeight: 600, color: '#2563eb' }}>{h.inbound_order_no}</td>
                                          <td>{h.order_date ? new Date(h.order_date).toLocaleDateString() : '-'}</td>
                                          <td style={{ fontFamily: 'monospace' }}>{h.sn || '(無序號/耗材)'}</td>
                                          <td style={{ textAlign: 'right', fontWeight: 700 }}>{h.quantity}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                ) : (
                                  <div style={{ color: '#94a3b8', fontSize: '13px', padding: '12px 0' }}>
                                    尚無進貨入庫紀錄
                                  </div>
                                )}
                              </div>

                              {/* 📤 出貨單明細歷程 */}
                              <div className="pj-detail-section">
                                <div className="pj-detail-title">
                                  <Truck size={16} color="#7c3aed" /> 出貨建檔歷程 (Outbound Records)
                                </div>
                                {item.outbound_history && item.outbound_history.length > 0 ? (
                                  <table className="pj-history-table">
                                    <thead>
                                      <tr>
                                        <th>出貨單號</th>
                                        <th>出貨客戶</th>
                                        <th>出貨日期</th>
                                        <th>出貨序號</th>
                                        <th style={{ textAlign: 'right' }}>數量</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {item.outbound_history.map((o, oIdx) => (
                                        <tr key={oIdx}>
                                          <td style={{ fontWeight: 600, color: '#7c3aed' }}>{o.request_no}</td>
                                          <td>{o.customer || '-'}</td>
                                          <td>{o.shipping_date ? new Date(o.shipping_date).toLocaleDateString() : '-'}</td>
                                          <td style={{ fontFamily: 'monospace' }}>{o.sn || '(無序號)'}</td>
                                          <td style={{ textAlign: 'right', fontWeight: 700 }}>{o.quantity}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                ) : (
                                  <div style={{ color: '#94a3b8', fontSize: '13px', padding: '12px 0' }}>
                                    尚未有此料件之專案出貨紀錄
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
    </div>
  );
};

export default PJReport;
