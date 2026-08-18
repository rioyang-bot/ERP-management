import React, { useState } from 'react';
import { 
  BarChart2, 
  Layers, 
  PackageCheck, 
  History, 
  Building2, 
  ArrowRight, 
  Search, 
  Sparkles,
  TrendingUp,
  FileSpreadsheet
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './Reports.css';

const Reports = () => {
  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // 報表卡片設定清單
  const reportCards = [
    {
      id: 'pj-report',
      title: '專案報表 (PJ Report)',
      category: 'PROJECT',
      categoryLabel: '專案進銷存',
      icon: <Layers size={28} />,
      iconBg: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
      status: 'ACTIVE',
      statusText: '已上線',
      desc: '以採購單 (PO) 為主軸核心，深度整合進貨單 (S/I) 與出貨單 (D/N)，即時掌控專案採購數、到貨達成率、出貨數與庫存餘額。',
      tags: ['採購進銷存', '專案進度追蹤', '料件庫存餘額', '明細序號展開', 'CSV 匯出'],
      path: '/pj-report'
    },
    {
      id: 'inventory-audit',
      title: '實體庫存盤點總表',
      category: 'INVENTORY',
      categoryLabel: '庫存盤點',
      icon: <PackageCheck size={28} />,
      iconBg: 'linear-gradient(135deg, #059669, #047857)',
      status: 'ACTIVE',
      statusText: '已上線',
      desc: '針對全廠設備、硬體零組件與耗材進行全方位即時盤點，支援安全水位警示與多倉庫存狀況總覽。',
      tags: ['即時在線庫存', '安全水位警示', '盤點查核', '零組件總覽'],
      path: '/stocktaking'
    },
    {
      id: 'flow-history',
      title: '進出貨日誌 Stock In/Out Log',
      category: 'AUDIT',
      categoryLabel: '歷史稽核',
      icon: <History size={28} />,
      iconBg: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
      status: 'ACTIVE',
      statusText: '已上線',
      desc: '按時間序列追蹤所有進貨入庫、出庫發貨、借用撥轉與異動軌跡，提供完整歷史紀錄與稽核報表。',
      tags: ['進出歷史流水', '時間序列追蹤', '出庫稽核', '操作軌跡'],
      path: '/flow-history'
    },
    {
      id: 'client-delivery',
      title: '客戶專案交付分析',
      category: 'PROJECT',
      categoryLabel: '專案進銷存',
      icon: <Building2 size={28} />,
      iconBg: 'linear-gradient(135deg, #ea580c, #c2410c)',
      status: 'UPCOMING',
      statusText: '即將推出',
      desc: '分析各客戶專案設備之履約交付狀態、保固到期追蹤與待交付設備清單。',
      tags: ['客戶交付履約', '保固期追蹤', '專案結案分析'],
      path: null
    }
  ];

  const filteredReports = reportCards.filter(card => {
    if (selectedCategory !== 'ALL' && card.category !== selectedCategory) {
      return false;
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const titleMatch = card.title.toLowerCase().includes(term);
      const descMatch = card.desc.toLowerCase().includes(term);
      const tagsMatch = card.tags.some(t => t.toLowerCase().includes(term));
      return titleMatch || descMatch || tagsMatch;
    }
    return true;
  });

  return (
    <div className="reports-hub-container">
      {/* 頂部標題 */}
      <div className="reports-hub-header">
        <h1 className="reports-hub-title">
          <BarChart2 size={32} color="#2563eb" /> 報表中心 (Report Center)
        </h1>
        <p className="reports-hub-subtitle">
          全方位的專案進銷存、庫存盤點與營運數據分析總覽，點選報表卡片即可進入專屬分析檢視。
        </p>
      </div>

      {/* 工具列：分類選擇與搜尋 */}
      <div className="reports-hub-toolbar">
        <div className="reports-category-pills">
          <button 
            type="button" 
            className={`category-pill ${selectedCategory === 'ALL' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('ALL')}
          >
            全部報表
          </button>
          <button 
            type="button" 
            className={`category-pill ${selectedCategory === 'PROJECT' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('PROJECT')}
          >
            專案進銷存
          </button>
          <button 
            type="button" 
            className={`category-pill ${selectedCategory === 'INVENTORY' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('INVENTORY')}
          >
            庫存盤點
          </button>
          <button 
            type="button" 
            className={`category-pill ${selectedCategory === 'AUDIT' ? 'active' : ''}`}
            onClick={() => setSelectedCategory('AUDIT')}
          >
            歷史稽核
          </button>
        </div>

        <div className="reports-search-box">
          <Search size={16} color="#94a3b8" />
          <input 
            type="text"
            className="reports-search-input"
            placeholder="搜尋報表名稱、標籤或關鍵字..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* 報表卡片網格 */}
      <div className="reports-cards-grid">
        {filteredReports.map(card => {
          const isActive = card.status === 'ACTIVE';

          return (
            <div 
              key={card.id} 
              className={`report-card ${isActive ? 'active-report' : 'disabled-report'}`}
              onClick={() => {
                if (isActive && card.path) {
                  navigate(card.path);
                }
              }}
            >
              <div className="report-card-top">
                <div className="report-icon-wrapper" style={{ background: card.iconBg }}>
                  {card.icon}
                </div>
                <span className={`report-badge-status ${isActive ? 'report-badge-active' : 'report-badge-upcoming'}`}>
                  {card.statusText}
                </span>
              </div>

              <h2 className="report-card-title">
                {card.title}
              </h2>

              <p className="report-card-desc">
                {card.desc}
              </p>

              <div className="report-tags">
                {card.tags.map((tag, idx) => (
                  <span key={idx} className="report-tag">
                    #{tag}
                  </span>
                ))}
              </div>

              <div className="report-card-footer">
                <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>
                  分類：{card.categoryLabel}
                </span>
                {isActive ? (
                  <span className="report-enter-btn">
                    進入專屬報表 <ArrowRight size={16} />
                  </span>
                ) : (
                  <span className="report-disabled-btn">
                    功能規劃中
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Reports;
