import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  ShoppingCart, 
  ArrowDownToLine, 
  Truck, 
  Clock, 
  AlertTriangle, 
  FolderGit2, 
  RefreshCw, 
  ExternalLink, 
  Search, 
  CheckCircle2, 
  Package, 
  ArrowRight, 
  Plus, 
  Eye, 
  AlertCircle,
  TrendingDown,
  Layers,
  FileText
} from 'lucide-react';
import './Overview.css';

const Overview = () => {
  const navigate = useNavigate();

  // 狀態管理
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  // 統計與清單資料
  const [stats, setStats] = useState({
    pending_purchases_count: 0,
    draft_inbounds_count: 0,
    pending_outbounds_count: 0,
    active_lents_count: 0,
    overdue_lents_count: 0,
    low_stock_consumables_count: 0,
    active_projects_count: 0
  });

  const [pendingPurchases, setPendingPurchases] = useState([]);
  const [draftInbounds, setDraftInbounds] = useState([]);
  const [pendingOutbounds, setPendingOutbounds] = useState([]);
  const [activeLents, setActiveLents] = useState([]);
  const [lowStockConsumables, setLowStockConsumables] = useState([]);

  // 篩選與搜尋
  const [docTab, setDocTab] = useState('ALL'); // 'ALL' | 'PO' | 'INBOUND' | 'OUTBOUND' | 'LENT'
  const [docSearch, setDocSearch] = useState('');
  const [stockSearch, setStockSearch] = useState('');

  // 載入資料
  const fetchOverviewData = useCallback(async () => {
    try {
      const [
        statsRes,
        purchasesRes,
        inboundsRes,
        outboundsRes,
        lentsRes,
        consumablesRes
      ] = await Promise.all([
        window.electronAPI.namedQuery('fetchOverviewStats'),
        window.electronAPI.namedQuery('fetchOverviewPendingPurchases'),
        window.electronAPI.namedQuery('fetchOverviewDraftInbounds'),
        window.electronAPI.namedQuery('fetchOverviewPendingOutbounds'),
        window.electronAPI.namedQuery('fetchOverviewActiveLents'),
        window.electronAPI.namedQuery('fetchOverviewLowStockConsumables')
      ]);

      if (statsRes.success && statsRes.rows.length > 0) {
        setStats(statsRes.rows[0]);
      }
      if (purchasesRes.success) setPendingPurchases(purchasesRes.rows || []);
      if (inboundsRes.success) setDraftInbounds(inboundsRes.rows || []);
      if (outboundsRes.success) setPendingOutbounds(outboundsRes.rows || []);
      if (lentsRes.success) setActiveLents(lentsRes.rows || []);
      if (consumablesRes.success) setLowStockConsumables(consumablesRes.rows || []);

      setLastUpdated(new Date());
    } catch (err) {
      console.error('Fetch Overview Data Error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchOverviewData();
  }, [fetchOverviewData]);

  const handleManualRefresh = () => {
    setRefreshing(true);
    fetchOverviewData();
  };

  // 聚合未完成單據清單 (依分類建立統一物件模型)
  const allPendingDocs = React.useMemo(() => {
    const list = [];

    // 採購單 (PO)
    pendingPurchases.forEach(p => {
      list.push({
        id: `PO-${p.id}`,
        docType: 'PO',
        typeLabel: '採購單 (P/O)',
        orderNo: p.order_no,
        partner: p.partner_name || '未指定廠商',
        date: p.created_at ? p.created_at.slice(0, 10) : '--',
        badge: p.status === 'PARTIAL' ? '部分到貨' : '採購待交',
        badgeColor: p.status === 'PARTIAL' ? '#f59e0b' : '#3b82f6',
        badgeBg: p.status === 'PARTIAL' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(59, 130, 246, 0.15)',
        summary: `${p.brand || ''} ${p.model || ''} ${p.specification ? `(${p.specification})` : ''} - 數量: ${p.quantity}`,
        itemCount: p.quantity,
        targetPath: '/procurement-list',
        raw: p
      });
    });

    // 進貨單 (S/I)
    draftInbounds.forEach(i => {
      list.push({
        id: `IN-${i.id}`,
        docType: 'INBOUND',
        typeLabel: '進貨單 (S/I)',
        orderNo: i.order_no,
        partner: i.partner_name || '未指定廠商',
        date: i.order_date ? i.order_date.slice(0, 10) : (i.created_at ? i.created_at.slice(0, 10) : '--'),
        badge: '草稿待核銷',
        badgeColor: '#10b981',
        badgeBg: 'rgba(16, 185, 129, 0.15)',
        summary: `發票: ${i.invoice_no || '無'} · 包含 ${i.item_count || 0} 項物料`,
        itemCount: i.total_quantity || i.item_count || 0,
        targetPath: '/inbound-list',
        raw: i
      });
    });

    // 出貨單 (D/N)
    pendingOutbounds.forEach(o => {
      list.push({
        id: `OUT-${o.id}`,
        docType: 'OUTBOUND',
        typeLabel: '出貨單 (D/N)',
        orderNo: o.request_no,
        partner: o.customer || '未指定客戶',
        date: o.shipping_date ? o.shipping_date.slice(0, 10) : (o.created_at ? o.created_at.slice(0, 10) : '--'),
        badge: '待出貨確認',
        badgeColor: '#ec4899',
        badgeBg: 'rgba(236, 72, 153, 0.15)',
        summary: `地點: ${o.location || '未指定'} · 包含 ${o.item_count || 0} 件出庫物料`,
        itemCount: o.total_quantity || o.item_count || 0,
        targetPath: '/dn-list',
        raw: o
      });
    });

    // 借用單 (Lent)
    activeLents.forEach(l => {
      list.push({
        id: `LENT-${l.id}`,
        docType: 'LENT',
        typeLabel: '借用單 (Lent)',
        orderNo: l.request_no,
        partner: l.customer || '未指定借用人/客戶',
        date: l.shipping_date ? l.shipping_date.slice(0, 10) : '--',
        badge: l.is_overdue ? '🚨 借用已逾期' : '借出未歸還',
        badgeColor: l.is_overdue ? '#ef4444' : '#8b5cf6',
        badgeBg: l.is_overdue ? 'rgba(239, 68, 68, 0.18)' : 'rgba(139, 92, 246, 0.15)',
        summary: `預計歸還: ${l.expected_return_date ? l.expected_return_date.slice(0, 10) : '未指定'} · ${l.item_summary || `${l.item_count || 0} 件設備`}`,
        itemCount: l.item_count || 0,
        targetPath: '/lent-list',
        raw: l
      });
    });

    // 依單號或日期排序 (最新的在最前)
    return list.sort((a, b) => (b.date > a.date ? 1 : -1));
  }, [pendingPurchases, draftInbounds, pendingOutbounds, activeLents]);

  // 篩選後之待辦單據
  const filteredDocs = React.useMemo(() => {
    return allPendingDocs.filter(doc => {
      if (docTab !== 'ALL' && doc.docType !== docTab) return false;
      if (docSearch.trim()) {
        const q = docSearch.toLowerCase().trim();
        return (
          doc.orderNo.toLowerCase().includes(q) ||
          doc.partner.toLowerCase().includes(q) ||
          doc.summary.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [allPendingDocs, docTab, docSearch]);

  // 篩選後之耗材庫存預警清單
  const filteredConsumables = React.useMemo(() => {
    return lowStockConsumables.filter(item => {
      if (stockSearch.trim()) {
        const q = stockSearch.toLowerCase().trim();
        return (
          (item.brand || '').toLowerCase().includes(q) ||
          (item.model || '').toLowerCase().includes(q) ||
          (item.type || '').toLowerCase().includes(q) ||
          (item.specification || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [lowStockConsumables, stockSearch]);

  // 跳轉至採購建檔並帶入品項
  const handleQuickPurchase = (item) => {
    navigate('/purchasing', {
      state: {
        prefillItem: {
          brand: item.brand,
          model: item.model,
          type: item.type,
          specification: item.specification,
          quantity: Math.max(1, Number(item.shortage_qty || 1)),
          unit: item.unit || '個'
        }
      }
    });
  };

  return (
    <div className="overview-container">
      {/* 頁面標題與操作區 */}
      <header className="overview-header">
        <div className="overview-title-group">
          <div className="overview-title-icon">
            <LayoutDashboard size={24} />
          </div>
          <div>
            <h1 className="overview-title">營運總覽 (Operations Overview)</h1>
            <p className="overview-subtitle">集中監控全系統未完成單據流向與耗材安全水位警報</p>
          </div>
        </div>

        <div className="overview-actions">
          {lastUpdated && (
            <span className="overview-timestamp">
              最後更新：{lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button 
            className="overview-refresh-btn" 
            onClick={handleManualRefresh}
            disabled={refreshing}
            title="手動重新整理營運總覽資料"
          >
            <RefreshCw size={15} className={refreshing ? 'spin-animation' : ''} />
            <span>{refreshing ? '重新整理中...' : '重新整理'}</span>
          </button>
        </div>
      </header>

      {/* 頂部 KPI 數據統計卡片 */}
      <div className="overview-kpi-grid">
        {/* 1. 採購單 (PO) */}
        <div 
          className="overview-kpi-card" 
          style={{ '--kpi-accent': '#3b82f6', '--kpi-bg': 'rgba(59, 130, 246, 0.12)', '--kpi-border': 'rgba(59, 130, 246, 0.25)' }}
          onClick={() => { setDocTab('PO'); }}
          title="點選切換檢視未完成採購單"
        >
          <div className="overview-kpi-card-header">
            <div className="overview-kpi-icon-wrap">
              <ShoppingCart size={20} />
            </div>
            <span className="overview-kpi-badge">採購中</span>
          </div>
          <div>
            <div className="overview-kpi-title">待交貨採購單</div>
            <div className="overview-kpi-number">
              {Number(stats.pending_purchases_count || 0)}
              <span className="overview-kpi-unit">筆</span>
            </div>
          </div>
          <div className="overview-kpi-footer">
            <span>前往採購列表</span>
            <ArrowRight size={14} onClick={(e) => { e.stopPropagation(); navigate('/procurement-list'); }} />
          </div>
        </div>

        {/* 2. 進貨單 (S/I) */}
        <div 
          className="overview-kpi-card" 
          style={{ '--kpi-accent': '#10b981', '--kpi-bg': 'rgba(16, 185, 129, 0.12)', '--kpi-border': 'rgba(16, 185, 129, 0.25)' }}
          onClick={() => { setDocTab('INBOUND'); }}
          title="點選切換檢視草稿進貨單"
        >
          <div className="overview-kpi-card-header">
            <div className="overview-kpi-icon-wrap">
              <ArrowDownToLine size={20} />
            </div>
            <span className="overview-kpi-badge">待核銷</span>
          </div>
          <div>
            <div className="overview-kpi-title">草稿進貨單</div>
            <div className="overview-kpi-number">
              {Number(stats.draft_inbounds_count || 0)}
              <span className="overview-kpi-unit">筆</span>
            </div>
          </div>
          <div className="overview-kpi-footer">
            <span>前往進貨列表</span>
            <ArrowRight size={14} onClick={(e) => { e.stopPropagation(); navigate('/inbound-list'); }} />
          </div>
        </div>

        {/* 3. 出貨單 (D/N) */}
        <div 
          className="overview-kpi-card" 
          style={{ '--kpi-accent': '#ec4899', '--kpi-bg': 'rgba(236, 72, 153, 0.12)', '--kpi-border': 'rgba(236, 72, 153, 0.25)' }}
          onClick={() => { setDocTab('OUTBOUND'); }}
          title="點選切換檢視待出貨出庫單"
        >
          <div className="overview-kpi-card-header">
            <div className="overview-kpi-icon-wrap">
              <Truck size={20} />
            </div>
            <span className="overview-kpi-badge">待出庫</span>
          </div>
          <div>
            <div className="overview-kpi-title">待確認出貨單</div>
            <div className="overview-kpi-number">
              {Number(stats.pending_outbounds_count || 0)}
              <span className="overview-kpi-unit">筆</span>
            </div>
          </div>
          <div className="overview-kpi-footer">
            <span>前往出貨列表</span>
            <ArrowRight size={14} onClick={(e) => { e.stopPropagation(); navigate('/dn-list'); }} />
          </div>
        </div>

        {/* 4. 借用單 (Lent) */}
        <div 
          className="overview-kpi-card" 
          style={{ '--kpi-accent': '#8b5cf6', '--kpi-bg': 'rgba(139, 92, 246, 0.12)', '--kpi-border': 'rgba(139, 92, 246, 0.25)' }}
          onClick={() => { setDocTab('LENT'); }}
          title="點選切換檢視借出中借用單"
        >
          <div className="overview-kpi-card-header">
            <div className="overview-kpi-icon-wrap">
              <Clock size={20} />
            </div>
            {Number(stats.overdue_lents_count || 0) > 0 ? (
              <span className="overview-kpi-badge" style={{ backgroundColor: 'rgba(239, 68, 68, 0.18)', color: '#ef4444' }}>
                {stats.overdue_lents_count} 筆逾期
              </span>
            ) : (
              <span className="overview-kpi-badge">借出中</span>
            )}
          </div>
          <div>
            <div className="overview-kpi-title">借出中借用單</div>
            <div className="overview-kpi-number">
              {Number(stats.active_lents_count || 0)}
              <span className="overview-kpi-unit">筆</span>
            </div>
          </div>
          <div className="overview-kpi-footer">
            <span>前往借用列表</span>
            <ArrowRight size={14} onClick={(e) => { e.stopPropagation(); navigate('/lent-list'); }} />
          </div>
        </div>

        {/* 5. 耗材庫存預警 (Consumables Low Stock) */}
        <div 
          className="overview-kpi-card" 
          style={{ '--kpi-accent': '#f59e0b', '--kpi-bg': 'rgba(245, 158, 11, 0.12)', '--kpi-border': 'rgba(245, 158, 11, 0.25)' }}
          onClick={() => {
            const el = document.getElementById('low-stock-section');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}
          title="點選定位至耗材安全庫存預警表"
        >
          <div className="overview-kpi-card-header">
            <div className="overview-kpi-icon-wrap">
              <AlertTriangle size={20} />
            </div>
            <span className="overview-kpi-badge" style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}>
              水位告急
            </span>
          </div>
          <div>
            <div className="overview-kpi-title">低於安全水位耗材</div>
            <div className="overview-kpi-number" style={{ color: Number(stats.low_stock_consumables_count || 0) > 0 ? '#ef4444' : 'var(--text-main)' }}>
              {Number(stats.low_stock_consumables_count || 0)}
              <span className="overview-kpi-unit">種品項</span>
            </div>
          </div>
          <div className="overview-kpi-footer">
            <span>前往耗材列表</span>
            <ArrowRight size={14} onClick={(e) => { e.stopPropagation(); navigate('/consumable-list'); }} />
          </div>
        </div>

        {/* 6. 進行中專案 (Projects) */}
        <div 
          className="overview-kpi-card" 
          style={{ '--kpi-accent': '#06b6d4', '--kpi-bg': 'rgba(6, 182, 212, 0.12)', '--kpi-border': 'rgba(6, 182, 212, 0.25)' }}
          onClick={() => navigate('/projects')}
          title="點選前往專案列表"
        >
          <div className="overview-kpi-card-header">
            <div className="overview-kpi-icon-wrap">
              <FolderGit2 size={20} />
            </div>
            <span className="overview-kpi-badge">進行中</span>
          </div>
          <div>
            <div className="overview-kpi-title">進行中專案</div>
            <div className="overview-kpi-number">
              {Number(stats.active_projects_count || 0)}
              <span className="overview-kpi-unit">項</span>
            </div>
          </div>
          <div className="overview-kpi-footer">
            <span>前往專案管理</span>
            <ArrowRight size={14} />
          </div>
        </div>
      </div>

      {/* 主版面兩大區塊：未完成單據看板 + 耗材安全庫存預警 */}
      <div className="overview-main-layout">
        {/* 左側：未完成單據看板 */}
        <section className="overview-section-card">
          <div className="overview-section-header">
            <div className="overview-section-title-wrap">
              <h2 className="overview-section-title">
                <Layers size={20} color="var(--primary-color)" />
                待辦單據集中看板
              </h2>
              <span className="overview-count-pill">{filteredDocs.length} 筆</span>
            </div>

            {/* 搜尋列 */}
            <div style={{ position: 'relative', minWidth: '180px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input 
                type="text" 
                placeholder="搜尋單號、夥伴..."
                value={docSearch}
                onChange={(e) => setDocSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 12px 6px 30px',
                  borderRadius: '8px',
                  border: '1px solid var(--input-border, var(--border-color))',
                  backgroundColor: 'var(--input-bg, var(--bg-surface-subtle))',
                  color: 'var(--input-text, var(--text-main))',
                  fontSize: '0.8rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          {/* 單據分類頁籤 */}
          <div className="overview-tab-group">
            <button 
              className={`overview-tab-btn ${docTab === 'ALL' ? 'active' : ''}`}
              onClick={() => setDocTab('ALL')}
            >
              全部 ({allPendingDocs.length})
            </button>
            <button 
              className={`overview-tab-btn ${docTab === 'PO' ? 'active' : ''}`}
              onClick={() => setDocTab('PO')}
            >
              <ShoppingCart size={13} /> 採購單 ({pendingPurchases.length})
            </button>
            <button 
              className={`overview-tab-btn ${docTab === 'INBOUND' ? 'active' : ''}`}
              onClick={() => setDocTab('INBOUND')}
            >
              <ArrowDownToLine size={13} /> 進貨單 ({draftInbounds.length})
            </button>
            <button 
              className={`overview-tab-btn ${docTab === 'OUTBOUND' ? 'active' : ''}`}
              onClick={() => setDocTab('OUTBOUND')}
            >
              <Truck size={13} /> 出貨單 ({pendingOutbounds.length})
            </button>
            <button 
              className={`overview-tab-btn ${docTab === 'LENT' ? 'active' : ''}`}
              onClick={() => setDocTab('LENT')}
            >
              <Clock size={13} /> 借用單 ({activeLents.length})
            </button>
          </div>

          {/* 單據清單內容 */}
          <div className="overview-doc-list">
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>資料載入中...</div>
            ) : filteredDocs.length === 0 ? (
              <div className="overview-empty-state">
                <div className="overview-empty-icon">
                  <CheckCircle2 size={24} />
                </div>
                <div className="overview-empty-text">目前沒有待辦的未完成單據</div>
                <div className="overview-empty-subtext">所有採購、進貨、出貨與借用流程皆已處理完畢</div>
              </div>
            ) : (
              filteredDocs.map(doc => (
                <div 
                  key={doc.id} 
                  className="overview-doc-item"
                  onClick={() => navigate(doc.targetPath)}
                  title={`點選前往 ${doc.typeLabel}`}
                >
                  <div className="overview-doc-item-top">
                    <span className="overview-doc-no">
                      <FileText size={15} />
                      {doc.orderNo}
                    </span>
                    <span 
                      className="overview-doc-status-badge"
                      style={{ backgroundColor: doc.badgeBg, color: doc.badgeColor }}
                    >
                      {doc.badge}
                    </span>
                  </div>

                  <div className="overview-doc-item-body">
                    <span className="overview-doc-partner">
                      {doc.partner}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {doc.summary}
                    </span>
                  </div>

                  <div className="overview-doc-item-footer">
                    <span>單據類別：{doc.typeLabel}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--primary-color)', fontWeight: 700 }}>
                      進入所屬清單 <ExternalLink size={12} />
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* 右側：耗材安全庫存預警中心 */}
        <section className="overview-section-card" id="low-stock-section">
          <div className="overview-section-header">
            <div className="overview-section-title-wrap">
              <h2 className="overview-section-title">
                <AlertTriangle size={20} color="#f59e0b" />
                耗材低於安全庫存預警
              </h2>
              <span 
                className="overview-count-pill" 
                style={{ 
                  backgroundColor: filteredConsumables.length > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                  color: filteredConsumables.length > 0 ? '#ef4444' : '#10b981'
                }}
              >
                {filteredConsumables.length} 個品項預警
              </span>
            </div>

            {/* 搜尋列與前往清單按鈕 */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div style={{ position: 'relative', minWidth: '160px' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input 
                  type="text" 
                  placeholder="搜尋耗材規格、廠牌..."
                  value={stockSearch}
                  onChange={(e) => setStockSearch(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 12px 6px 30px',
                    borderRadius: '8px',
                    border: '1px solid var(--input-border, var(--border-color))',
                    backgroundColor: 'var(--input-bg, var(--bg-surface-subtle))',
                    color: 'var(--input-text, var(--text-main))',
                    fontSize: '0.8rem',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <button
                onClick={() => navigate('/consumable-list')}
                className="overview-quick-action-btn"
                style={{ whiteSpace: 'nowrap', padding: '6px 12px' }}
                title="前往完整耗材列表"
              >
                耗材列表 <ExternalLink size={12} />
              </button>
            </div>
          </div>

          {/* 耗材表格 */}
          <div className="overview-stock-table-wrap">
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>資料載入中...</div>
            ) : filteredConsumables.length === 0 ? (
              <div className="overview-empty-state">
                <div className="overview-empty-icon">
                  <CheckCircle2 size={24} />
                </div>
                <div className="overview-empty-text">耗材庫存狀態健康充足</div>
                <div className="overview-empty-subtext">全品項耗材皆在安全庫存水位之上，無缺料風險</div>
              </div>
            ) : (
              <table className="overview-stock-table">
                <thead>
                  <tr>
                    <th>廠牌 / 型號 / 規格</th>
                    <th style={{ textAlign: 'center' }}>Stock</th>
                    <th style={{ textAlign: 'center' }}>LAB</th>
                    <th style={{ textAlign: 'center' }}>總庫存</th>
                    <th style={{ textAlign: 'center' }}>安全水位</th>
                    <th style={{ textAlign: 'center', color: '#ef4444' }}>缺口數量</th>
                    <th style={{ textAlign: 'center' }}>預警狀態</th>
                    <th style={{ textAlign: 'center' }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredConsumables.map(item => {
                    const total = Number(item.total_qty || 0);
                    const isOutOfStock = total === 0;
                    return (
                      <tr 
                        key={item.id} 
                        style={{ cursor: 'pointer' }}
                        onClick={() => navigate('/consumable-list')}
                        title="點選前往耗材清單檢視此品項"
                      >
                        <td>
                          <div style={{ fontWeight: 800, color: 'var(--text-main)' }}>
                            {item.brand} {item.model}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {item.type} · {item.specification || '無規格描述'}
                          </div>
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--primary-color)' }}>
                          {item.stock_qty || 0}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 700, color: '#a855f7' }}>
                          {item.lab_qty || 0}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 900, color: isOutOfStock ? '#ef4444' : '#f59e0b' }}>
                          {total}
                        </td>
                        <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600 }}>
                          {item.safety_stock}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 800, color: '#ef4444' }}>
                          -{Number(item.shortage_qty || 0)} {item.unit || '個'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {isOutOfStock ? (
                            <span className="overview-stock-pill out">
                              🚨 庫存歸零
                            </span>
                          ) : (
                            <span className="overview-stock-pill low">
                              ⚠️ 低於安全水位
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleQuickPurchase(item);
                            }}
                            className="overview-quick-action-btn"
                            title="一鍵將此耗材帶入採購單建立需求"
                          >
                            <Plus size={12} /> 一鍵採購
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default Overview;
