import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  ShieldCheck, 
  Search, 
  RefreshCw, 
  Filter, 
  Download, 
  Calendar, 
  User, 
  Layers, 
  FileText, 
  PlusCircle, 
  Edit, 
  Trash2, 
  ArrowRightLeft, 
  Eye, 
  Clock, 
  CheckCircle,
  AlertTriangle,
  X,
  Copy,
  Check,
  ChevronDown
} from 'lucide-react';
import { MODULE_MAP, ACTION_TYPES } from '../utils/auditLogger';

const EventLogs = () => {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // 篩選狀態
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModule, setSelectedModule] = useState('ALL');
  const [selectedAction, setSelectedAction] = useState('ALL');
  const [selectedUser, setSelectedUser] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // 分頁
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(15);
  
  // 明細彈窗
  const [selectedLog, setSelectedLog] = useState(null);
  const [isCopied, setIsCopied] = useState(false);

  // 取得所有日誌資料
  const fetchLogs = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setRefreshing(true);
    try {
      if (window.electronAPI && typeof window.electronAPI.namedQuery === 'function') {
        const [logsRes, statsRes] = await Promise.all([
          window.electronAPI.namedQuery('fetchAuditLogs'),
          window.electronAPI.namedQuery('fetchAuditLogStats')
        ]);

        if (logsRes.success) {
          setLogs(logsRes.rows || []);
        }
        if (statsRes.success && statsRes.rows?.length > 0) {
          setStats(statsRes.rows[0]);
        }
      }
    } catch (err) {
      console.error('[EventLogs] Failed to fetch logs:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // 重設分頁
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedModule, selectedAction, selectedUser, startDate, endDate]);

  // 取得唯一操作者列表
  const uniqueUsers = useMemo(() => {
    const set = new Set();
    logs.forEach(l => {
      if (l.user_name) set.add(l.user_name);
    });
    return Array.from(set);
  }, [logs]);

  // 快速日期範圍設定
  const handleQuickDate = (type) => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    if (type === 'TODAY') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (type === 'WEEK') {
      const past7 = new Date();
      past7.setDate(past7.getDate() - 7);
      setStartDate(past7.toISOString().split('T')[0]);
      setEndDate(todayStr);
    } else if (type === 'MONTH') {
      const past30 = new Date();
      past30.setDate(past30.getDate() - 30);
      setStartDate(past30.toISOString().split('T')[0]);
      setEndDate(todayStr);
    } else if (type === 'ALL') {
      setStartDate('');
      setEndDate('');
    }
  };

  // 篩選後的日誌
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      // 模組過濾
      if (selectedModule !== 'ALL' && log.module !== selectedModule) {
        return false;
      }
      // 動作類型過濾
      if (selectedAction !== 'ALL') {
        if (selectedAction === 'UPDATE' && log.action_type !== 'UPDATE' && log.action_type !== 'STATUS_CHANGE') {
          return false;
        } else if (selectedAction !== 'UPDATE' && log.action_type !== selectedAction) {
          return false;
        }
      }
      // 操作者過濾
      if (selectedUser !== 'ALL' && log.user_name !== selectedUser) {
        return false;
      }
      // 日期區間過濾
      if (startDate || endDate) {
        const logDate = new Date(log.timestamp);
        logDate.setHours(0, 0, 0, 0);
        if (startDate) {
          const s = new Date(startDate);
          s.setHours(0, 0, 0, 0);
          if (logDate < s) return false;
        }
        if (endDate) {
          const e = new Date(endDate);
          e.setHours(0, 0, 0, 0);
          if (logDate > e) return false;
        }
      }
      // 關鍵字搜尋
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const summaryMatch = (log.summary || '').toLowerCase().includes(term);
        const targetIdMatch = (log.target_id || '').toLowerCase().includes(term);
        const targetNameMatch = (log.target_name || '').toLowerCase().includes(term);
        const userMatch = (log.user_name || '').toLowerCase().includes(term);
        const moduleMatch = (log.module_label || '').toLowerCase().includes(term);
        if (!summaryMatch && !targetIdMatch && !targetNameMatch && !userMatch && !moduleMatch) {
          return false;
        }
      }
      return true;
    });
  }, [logs, selectedModule, selectedAction, selectedUser, startDate, endDate, searchTerm]);

  // 分頁計算
  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage) || 1;
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredLogs.slice(start, start + itemsPerPage);
  }, [filteredLogs, currentPage, itemsPerPage]);

  // 動作類型視覺呈現
  const getActionBadge = (actionType) => {
    switch (actionType) {
      case 'CREATE':
        return {
          label: '新增',
          icon: <PlusCircle size={14} />,
          bg: 'rgba(16, 185, 129, 0.12)',
          color: '#10b981',
          border: '1px solid rgba(16, 185, 129, 0.25)'
        };
      case 'UPDATE':
        return {
          label: '變更',
          icon: <Edit size={14} />,
          bg: 'rgba(59, 130, 246, 0.12)',
          color: '#3b82f6',
          border: '1px solid rgba(59, 130, 246, 0.25)'
        };
      case 'DELETE':
        return {
          label: '移除',
          icon: <Trash2 size={14} />,
          bg: 'rgba(239, 68, 68, 0.12)',
          color: '#ef4444',
          border: '1px solid rgba(239, 68, 68, 0.25)'
        };
      case 'STATUS_CHANGE':
        return {
          label: '狀態',
          icon: <ArrowRightLeft size={14} />,
          bg: 'rgba(245, 158, 11, 0.15)',
          color: '#f59e0b',
          border: '1px solid rgba(245, 158, 11, 0.3)'
        };
      case 'BATCH_IMPORT':
        return {
          label: '批次',
          icon: <Layers size={14} />,
          bg: 'rgba(139, 92, 246, 0.15)',
          color: '#8b5cf6',
          border: '1px solid rgba(139, 92, 246, 0.3)'
        };
      default:
        return {
          label: actionType || '操作',
          icon: <FileText size={14} />,
          bg: 'var(--bg-surface-subtle)',
          color: 'var(--text-muted)',
          border: '1px solid var(--border-color)'
        };
    }
  };

  // 模組視覺呈現
  const getModuleBadge = (moduleKey, moduleLabel) => {
    const colors = {
      DEVICE: '#2563eb',
      HARDWARE: '#7c3aed',
      CONSUMABLE: '#059669',
      PURCHASE: '#ea580c',
      INBOUND: '#0d9488',
      OUTBOUND: '#2563eb',
      LENT: '#d97706',
      PARTNER: '#6366f1',
      PROJECT: '#ec4899',
      USER: '#475569',
      SETTING: '#64748b'
    };
    const c = colors[moduleKey] || '#64748b';
    return (
      <span style={{ 
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 8px',
        borderRadius: '6px',
        fontSize: '0.8rem',
        fontWeight: 700,
        backgroundColor: 'var(--bg-surface-subtle)',
        border: '1px solid var(--border-color)',
        color: c
      }}>
        {moduleLabel || moduleKey}
      </span>
    );
  };

  // 匯出 CSV
  const handleExportCSV = () => {
    if (filteredLogs.length === 0) {
      alert('目前篩選條件下無任何事件資料可供匯出。');
      return;
    }

    const headers = ['紀錄編號', '時間戳記', '操作者', '權限角色', '動作類型', '功能模組', '標的識別碼 (SN/單號)', '標的名稱', '操作摘要', '詳細參數'];
    const rows = filteredLogs.map(l => [
      l.id,
      new Date(l.timestamp).toLocaleString('zh-TW'),
      `"${(l.user_name || '').replace(/"/g, '""')}"`,
      l.user_role || '',
      l.action_type || '',
      l.module_label || l.module || '',
      `"${(l.target_id || '').replace(/"/g, '""')}"`,
      `"${(l.target_name || '').replace(/"/g, '""')}"`,
      `"${(l.summary || '').replace(/"/g, '""')}"`,
      `"${JSON.stringify(l.details || {}).replace(/"/g, '""')}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `ERP_Audit_Logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 複製 JSON 詳情
  const handleCopyDetails = (details) => {
    try {
      navigator.clipboard.writeText(JSON.stringify(details, null, 2));
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="page-container" style={{ padding: '24px', maxWidth: '1600px', margin: '0 auto' }}>
      {/* 頂部 Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: '900', margin: 0, display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-main)' }}>
            <ShieldCheck size={30} color="#f59e0b" /> 事件紀錄查詢 (Event Log Query)
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '6px', marginBottom: 0 }}>
            全系統資料異動與稽核軌跡日誌，完整記錄設備、硬體、耗材、採購、進出貨與系統設定之新增、變更與刪除事件。
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            onClick={() => fetchLogs(true)}
            disabled={refreshing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              color: 'var(--text-main)',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: refreshing ? 'not-allowed' : 'pointer',
              boxShadow: 'var(--card-shadow)'
            }}
          >
            <RefreshCw size={15} className={refreshing ? 'spin' : ''} />
            {refreshing ? '重新整理中...' : '重新整理'}
          </button>

          <button
            onClick={handleExportCSV}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 18px',
              backgroundColor: 'var(--primary-color)',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)'
            }}
          >
            <Download size={15} /> 匯出 CSV 報表
          </button>
        </div>
      </div>

      {/* KPI 統計卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ backgroundColor: 'var(--bg-surface)', padding: '16px 20px', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: 'var(--card-shadow)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '6px' }}>歷史事件總筆數</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--text-main)' }}>
            {stats?.total_count || logs.length}
            <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-muted)', marginLeft: '6px' }}>筆</span>
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--bg-surface)', padding: '16px 20px', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: 'var(--card-shadow)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '6px' }}>今日新增異動</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#f59e0b' }}>
            {stats?.today_count || 0}
            <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-muted)', marginLeft: '6px' }}>筆</span>
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--bg-surface)', padding: '16px 20px', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: 'var(--card-shadow)' }}>
          <div style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: 700, marginBottom: '6px' }}>新增建立 (CREATE)</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#10b981' }}>
            {stats?.create_count || 0}
            <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-muted)', marginLeft: '6px' }}>筆</span>
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--bg-surface)', padding: '16px 20px', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: 'var(--card-shadow)' }}>
          <div style={{ fontSize: '0.8rem', color: '#3b82f6', fontWeight: 700, marginBottom: '6px' }}>資料變更 (UPDATE)</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#3b82f6' }}>
            {stats?.update_count || 0}
            <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-muted)', marginLeft: '6px' }}>筆</span>
          </div>
        </div>

        <div style={{ backgroundColor: 'var(--bg-surface)', padding: '16px 20px', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: 'var(--card-shadow)' }}>
          <div style={{ fontSize: '0.8rem', color: '#ef4444', fontWeight: 700, marginBottom: '6px' }}>刪除移除 (DELETE)</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#ef4444' }}>
            {stats?.delete_count || 0}
            <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-muted)', marginLeft: '6px' }}>筆</span>
          </div>
        </div>
      </div>

      {/* 篩選與過濾工具列 */}
      <div style={{ backgroundColor: 'var(--bg-surface)', borderRadius: '14px', border: '1px solid var(--border-color)', padding: '20px', marginBottom: '24px', boxShadow: 'var(--card-shadow)' }}>
        {/* 動作類型藥丸標籤列 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-muted)', marginRight: '4px' }}>動作篩選:</span>
          {[
            { key: 'ALL', label: '全部動作' },
            { key: 'CREATE', label: '新增 (Create)', color: '#10b981' },
            { key: 'UPDATE', label: '變更 (Update)', color: '#3b82f6' },
            { key: 'DELETE', label: '移除 (Delete)', color: '#ef4444' },
            { key: 'STATUS_CHANGE', label: '狀態流轉', color: '#f59e0b' }
          ].map(action => (
            <button
              key={action.key}
              onClick={() => setSelectedAction(action.key)}
              style={{
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
                border: selectedAction === action.key ? '1px solid var(--primary-color)' : '1px solid var(--border-color)',
                backgroundColor: selectedAction === action.key ? 'var(--primary-color)' : 'var(--bg-surface-subtle)',
                color: selectedAction === action.key ? '#fff' : 'var(--text-main)',
                transition: 'all 0.15s ease'
              }}
            >
              {action.label}
            </button>
          ))}
        </div>

        {/* 複合條件篩選區 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', alignItems: 'center' }}>
          {/* 模組選擇 */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>功能模組</label>
            <select
              value={selectedModule}
              onChange={e => setSelectedModule(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--input-border)',
                backgroundColor: 'var(--input-bg)',
                color: 'var(--input-text)',
                fontSize: '0.85rem'
              }}
            >
              <option value="ALL">全部模組</option>
              {Object.values(MODULE_MAP).map(m => (
                <option key={m.key} value={m.key}>{m.label} ({m.key})</option>
              ))}
            </select>
          </div>

          {/* 操作人員 */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>操作人員</label>
            <select
              value={selectedUser}
              onChange={e => setSelectedUser(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--input-border)',
                backgroundColor: 'var(--input-bg)',
                color: 'var(--input-text)',
                fontSize: '0.85rem'
              }}
            >
              <option value="ALL">全部操作者</option>
              {uniqueUsers.map(u => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>

          {/* 日期區間 */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>
              日期區間
              <span style={{ float: 'right', fontWeight: 400 }}>
                <span onClick={() => handleQuickDate('TODAY')} style={{ cursor: 'pointer', color: 'var(--primary-color)', marginRight: '6px' }}>今日</span>
                <span onClick={() => handleQuickDate('WEEK')} style={{ cursor: 'pointer', color: 'var(--primary-color)', marginRight: '6px' }}>本週</span>
                <span onClick={() => handleQuickDate('ALL')} style={{ cursor: 'pointer', color: 'var(--text-muted)' }}>清除</span>
              </span>
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                style={{
                  flex: 1,
                  padding: '7px 8px',
                  borderRadius: '8px',
                  border: '1px solid var(--input-border)',
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--input-text)',
                  fontSize: '0.8rem'
                }}
              />
              <span style={{ color: 'var(--text-subtle)' }}>-</span>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                style={{
                  flex: 1,
                  padding: '7px 8px',
                  borderRadius: '8px',
                  border: '1px solid var(--input-border)',
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--input-text)',
                  fontSize: '0.8rem'
                }}
              />
            </div>
          </div>

          {/* 關鍵字搜尋 */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>全域搜尋 (SN/單號/摘要)</label>
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
              <input
                type="text"
                placeholder="搜尋序號、單號、操作摘要..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px 8px 34px',
                  borderRadius: '8px',
                  border: '1px solid var(--input-border)',
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--input-text)',
                  fontSize: '0.85rem'
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 資料列表 */}
      <div style={{ backgroundColor: 'var(--bg-surface)', borderRadius: '14px', border: '1px solid var(--border-color)', overflow: 'hidden', boxShadow: 'var(--card-shadow)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--table-header-bg)', borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                <th style={{ padding: '14px 16px', fontSize: '0.85rem', color: 'var(--table-header-text)', fontWeight: 800, width: '170px' }}>時間戳記</th>
                <th style={{ padding: '14px 16px', fontSize: '0.85rem', color: 'var(--table-header-text)', fontWeight: 800, width: '90px' }}>動作</th>
                <th style={{ padding: '14px 16px', fontSize: '0.85rem', color: 'var(--table-header-text)', fontWeight: 800, width: '120px' }}>功能模組</th>
                <th style={{ padding: '14px 16px', fontSize: '0.85rem', color: 'var(--table-header-text)', fontWeight: 800, width: '180px' }}>標的識別 (SN/單號)</th>
                <th style={{ padding: '14px 16px', fontSize: '0.85rem', color: 'var(--table-header-text)', fontWeight: 800 }}>操作摘要與異動內容</th>
                <th style={{ padding: '14px 16px', fontSize: '0.85rem', color: 'var(--table-header-text)', fontWeight: 800, width: '130px' }}>操作人員</th>
                <th style={{ padding: '14px 16px', fontSize: '0.85rem', color: 'var(--table-header-text)', fontWeight: 800, textAlign: 'center', width: '90px' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                      <RefreshCw size={24} className="spin" />
                      <span>正在讀取事件紀錄資料庫...</span>
                    </div>
                  </td>
                </tr>
              ) : paginatedLogs.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                    <ShieldCheck size={36} color="var(--text-subtle)" style={{ marginBottom: '10px' }} />
                    <div style={{ fontSize: '1rem', fontWeight: 600 }}>查無匹配之事件稽核紀錄</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-subtle)', marginTop: '4px' }}>請嘗試調整篩選條件或清除關鍵字搜尋</div>
                  </td>
                </tr>
              ) : (
                paginatedLogs.map(log => {
                  const actionStyle = getActionBadge(log.action_type);
                  return (
                    <tr 
                      key={log.id} 
                      className="row-hover"
                      style={{ borderBottom: '1px solid var(--table-border)', color: 'var(--text-main)' }}
                    >
                      {/* 時間 */}
                      <td style={{ padding: '12px 16px', fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                          {new Date(log.timestamp).toLocaleDateString('zh-TW')}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
                          {new Date(log.timestamp).toLocaleTimeString('zh-TW', { hour12: false })}
                        </div>
                      </td>

                      {/* 動作 */}
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          backgroundColor: actionStyle.bg,
                          color: actionStyle.color,
                          border: actionStyle.border
                        }}>
                          {actionStyle.icon} {actionStyle.label}
                        </span>
                      </td>

                      {/* 模組 */}
                      <td style={{ padding: '12px 16px' }}>
                        {getModuleBadge(log.module, log.module_label)}
                      </td>

                      {/* 標的 */}
                      <td style={{ padding: '12px 16px' }}>
                        {log.target_id ? (
                          <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.85rem', color: 'var(--primary-color)' }}>
                            {log.target_id}
                          </div>
                        ) : null}
                        {log.target_name && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '170px' }} title={log.target_name}>
                            {log.target_name}
                          </div>
                        )}
                        {!log.target_id && !log.target_name && (
                          <span style={{ color: 'var(--text-subtle)', fontSize: '0.8rem' }}>--</span>
                        )}
                      </td>

                      {/* 摘要 */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: '1.4' }}>
                          {log.summary}
                        </div>
                      </td>

                      {/* 操作者 */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <User size={14} color="var(--text-muted)" />
                          <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-main)' }}>
                            {log.user_name || '系統'}
                          </span>
                        </div>
                        {log.user_role && (
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-subtle)', paddingLeft: '20px' }}>
                            ({log.user_role})
                          </span>
                        )}
                      </td>

                      {/* 操作 */}
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <button
                          onClick={() => setSelectedLog(log)}
                          title="查看詳細異動 Payload"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '5px 10px',
                            backgroundColor: 'var(--primary-bg)',
                            color: 'var(--primary-color)',
                            border: '1px solid rgba(59, 130, 246, 0.25)',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: 600
                          }}
                        >
                          <Eye size={14} /> 檢視
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 分頁列 */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface-subtle)', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              顯示第 <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{(currentPage - 1) * itemsPerPage + 1}</span> 至 <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{Math.min(currentPage * itemsPerPage, filteredLogs.length)}</span> 筆 (共 {filteredLogs.length} 筆)
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                style={{
                  padding: '6px 14px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  backgroundColor: currentPage === 1 ? 'var(--bg-surface-subtle)' : 'var(--bg-surface)',
                  color: currentPage === 1 ? 'var(--text-subtle)' : 'var(--text-main)',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  fontSize: '0.85rem'
                }}
              >
                上一頁
              </button>

              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)', padding: '0 8px' }}>
                {currentPage} / {totalPages}
              </span>

              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                style={{
                  padding: '6px 14px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  backgroundColor: currentPage === totalPages ? 'var(--bg-surface-subtle)' : 'var(--bg-surface)',
                  color: currentPage === totalPages ? 'var(--text-subtle)' : 'var(--text-main)',
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  fontSize: '0.85rem'
                }}
              >
                下一頁
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 異動明細彈窗 */}
      {selectedLog && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'var(--bg-modal-overlay)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
          padding: '20px'
        }} onClick={() => setSelectedLog(null)}>
          <div style={{
            backgroundColor: 'var(--bg-surface)',
            color: 'var(--text-main)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            boxShadow: 'var(--modal-shadow)',
            width: '750px',
            maxWidth: '95vw',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }} onClick={e => e.stopPropagation()}>
            {/* 彈窗 Header */}
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'var(--bg-surface-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <ShieldCheck size={22} color="var(--primary-color)" />
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-main)' }}>事件紀錄詳情 #{selectedLog.id}</h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {new Date(selectedLog.timestamp).toLocaleString('zh-TW')}
                  </span>
                </div>
              </div>
              <button 
                onClick={() => setSelectedLog(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* 彈窗 Body */}
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
              {/* 核心資訊卡 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px', backgroundColor: 'var(--bg-surface-subtle)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>動作類型</span>
                  <div style={{ marginTop: '4px' }}>
                    {(() => {
                      const b = getActionBadge(selectedLog.action_type);
                      return (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 700, backgroundColor: b.bg, color: b.color, border: b.border }}>
                          {b.icon} {b.label} ({selectedLog.action_type})
                        </span>
                      );
                    })()}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>功能模組</span>
                  <div style={{ marginTop: '4px' }}>
                    {getModuleBadge(selectedLog.module, selectedLog.module_label)}
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>操作人員</span>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '2px' }}>
                    {selectedLog.user_name} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)' }}>({selectedLog.user_role || 'USER'})</span>
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', fontWeight: 600 }}>標的編號 / SN</span>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--primary-color)', marginTop: '2px', fontFamily: 'monospace' }}>
                    {selectedLog.target_id || '--'}
                  </div>
                </div>
              </div>

              {/* 摘要 */}
              <div style={{ marginBottom: '20px' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)', display: 'block', marginBottom: '6px' }}>操作摘要</span>
                <div style={{ padding: '12px 16px', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }}>
                  {selectedLog.summary}
                </div>
              </div>

              {/* 結構化 Payload / Details */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)' }}>異動參數與詳情 (Payload Details)</span>
                  <button
                    onClick={() => handleCopyDetails(selectedLog.details)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-surface)',
                      color: isCopied ? '#10b981' : 'var(--text-muted)',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      fontWeight: 600
                    }}
                  >
                    {isCopied ? <Check size={13} /> : <Copy size={13} />}
                    {isCopied ? '已複製 JSON' : '複製 JSON'}
                  </button>
                </div>
                <pre style={{
                  padding: '16px',
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--text-main)',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  fontSize: '0.8rem',
                  fontFamily: 'monospace',
                  overflowX: 'auto',
                  maxHeight: '260px',
                  margin: 0
                }}>
                  {JSON.stringify(selectedLog.details || {}, null, 2)}
                </pre>
              </div>
            </div>

            {/* 彈窗 Footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', backgroundColor: 'var(--bg-surface-subtle)' }}>
              <button
                onClick={() => setSelectedLog(null)}
                style={{
                  padding: '8px 20px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-main)',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.85rem'
                }}
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default EventLogs;
