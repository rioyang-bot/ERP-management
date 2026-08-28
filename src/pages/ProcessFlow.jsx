import React, { useState, useMemo } from 'react';
import { 
  Network, 
  Layers, 
  ArrowRight, 
  ArrowLeft, 
  CheckCircle2, 
  FileText, 
  ShoppingCart, 
  Package, 
  Truck, 
  BarChart2, 
  ShieldCheck, 
  Cpu, 
  RotateCw, 
  Search, 
  ExternalLink, 
  Sparkles, 
  Info, 
  Users, 
  Tag, 
  Database, 
  Clock, 
  Boxes, 
  FolderGit2, 
  KeyRound, 
  ChevronRight,
  Zap,
  HelpCircle,
  X
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './ProcessFlow.css';

const ProcessFlow = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('MODULE_BLOCKS'); // 'MODULE_BLOCKS' | 'E2E_FLOW' | 'STATE_MACHINE' | 'ROLE_GUIDE'
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [flowStreamType, setFlowStreamType] = useState('ALL'); // 'ALL' | 'DOC' | 'ASSET' | 'REPORT'
  const [selectedRole, setSelectedRole] = useState('IT'); // 'ADMIN' | 'IT' | 'USER'

  // --- 1. 全模組方塊資料清單 ---
  const modulesData = useMemo(() => [
    {
      id: 'master-data',
      blockIndex: '01',
      title: '關係主體 (Party Data)',
      category: 'BASE',
      color: '#4f46e5',
      badge: '系統基石',
      icon: <Database size={24} />,
      desc: '維護客戶廠商資料與系統帳號權限，為全系統單據與安全提供標準化主體資料來源。',
      subModules: [
        { name: '客戶 / 廠商管理 (Partners)', path: '/partners', desc: '維護供應商與客戶聯絡資訊、地址與統編' },
        { name: '權限管理 (User Access Control)', path: '/settings', desc: '維護系統帳號、使用者模組存取權限與密碼安全原則' }
      ],
      inputs: ['外部廠商資訊', '客戶聯絡名冊', '系統操作人員名冊'],
      outputs: ['合作夥伴主檔 (Partners)', '系統使用者與權限原則 (RBAC)'],
      businessRules: [
        '所有單據（採購、進貨、出貨）皆需指定有效之合作夥伴（客戶或廠商）。',
        '系統依據使用者角色與權限設定，嚴格控管各功能模組之讀取與異動權限。'
      ]
    },
    {
      id: 'procurement',
      blockIndex: '02',
      title: '採購管理 (Procurement / PO)',
      category: 'FLOW',
      color: '#2563eb',
      badge: '單據源頭',
      icon: <ShoppingCart size={24} />,
      desc: '向供應商建立 P/O 採購單，記錄預計採購品項規格、採購數量、預計交期與附件憑證。',
      subModules: [
        { name: '採購登記 (Purchasing)', path: '/purchasing', desc: '建立新採購單，設定料件規格、數量與預計到貨量' },
        { name: '採購單列表 (P/O List)', path: '/procurement-list', desc: '清單檢視、篩選與到貨狀態追蹤' }
      ],
      inputs: ['專案料件需求', '供應商報價單', '內部庫存補貨提醒'],
      outputs: ['採購單號 (PO-YYYYMMDD-XX)', '待到貨料件清單', '採購附件憑證'],
      businessRules: [
        '支援多料件同時採購，可隨時追蹤「待進貨」、「部分進貨」與「已結案」狀態。',
        '採購單建立後可直接於進貨時一鍵轉單，核對各品項進貨與在途數量。'
      ]
    },
    {
      id: 'inbound',
      blockIndex: '03',
      title: '進貨驗收與序號登記 (Inbound / SI)',
      category: 'FLOW',
      color: '#059669',
      badge: '實物入庫',
      icon: <Boxes size={24} />,
      desc: '實體貨品到港後進行點收驗收，可直接自 P/O 轉單，並支援單機設備、硬體模組手動建檔（規格必填）與 Excel/CSV 批次快速匯入。',
      subModules: [
        { name: '進貨單建立 (Inbound)', path: '/inbound', desc: '核對送貨單據，一鍵展開每台設備之專屬 SN 序號' },
        { name: '進貨單列表 (S/I List)', path: '/inbound-list', desc: '查詢歷史進貨單據、供應商與進貨批號' },
        { name: '設備建檔 (Device Reg)', path: '/devices', desc: '伺服器、主機、交換器等單機設備建檔（規格必填，右上角支援 Excel/CSV 批次匯入）' },
        { name: '硬體建檔 (HW Reg)', path: '/hw-registration', desc: '網卡、加速卡等模組規格登記（規格必填，右上角支援 Excel/CSV 批次匯入）' },
        { name: '耗材建檔 (Consumables)', path: '/consumables', desc: '耗材與配件建檔（規格必填、無單位設定、依廠牌+類型+型號+規格四欄唯一識別）' }
      ],
      inputs: ['實體到貨料件', '原廠外箱序號 (SN)', '供應商送貨/進貨單', '關聯 P/O 採購單', '外部 Excel / CSV 設備與硬體資產清冊'],
      outputs: ['進貨單 (IN-YYYYMMDD-XX)', '單機/模組資產實體 (ACTIVE/SHIPPED)', '品項進貨履歷', '批次匯入稽核紀錄'],
      businessRules: [
        '「設備建檔」與「硬體建檔」支援唯一 SN 序號管控，進貨時可一鍵展開分別填寫獨立序號。',
        '卡片聚合規則：設備與硬體以「廠牌 + 類型 + 型號 + 規格」四欄完全一致作為同一張卡片的聚合條件，任一欄位不同即會自動生成獨立卡片。',
        '欄位必填與唯一性：設備、硬體與耗材建檔之「規格 (Specification)」皆為必填欄位；耗材品項全面移除單位設定，由 (廠牌, 類型, 型號, 規格) 四欄共同識別唯一物料。',
        '支援「Excel / CSV 批次匯入」：具備中文字元編碼自動校正 (Mojibake Fix)、重複序號阻擋與廠牌/類型/型號缺一不建檢核，移除資產隸屬選擇（一律預設為一般銷售），並直接依檔案內 Status 欄位自動判定「已出貨 (SHIPPED)」或「在庫 (ACTIVE)」。',
        '完成進貨驗收與設備/硬體建檔（含批次匯入）後，庫存池狀態立即同步更新，並自動發送即時事件與稽核日誌。'
      ]
    },
    {
      id: 'inventory-pool',
      blockIndex: '04',
      title: '在庫資產池與盤點 (Inventory Pool)',
      category: 'CORE',
      color: '#d97706',
      badge: '核心樞紐',
      icon: <Package size={24} />,
      desc: '維護全廠設備、硬體模組與耗材之即時在線量，提供品項台帳歷程與定期盤點機制。',
      subModules: [
        { name: '設備列表 (Device List)', path: '/device-list', desc: '伺服器/主機資產清冊、四欄聚合卡片、狀態過濾與規格檢視' },
        { name: '硬體列表 (HW List)', path: '/hw-list', desc: '網卡、模組等硬體庫存、四欄聚合卡片與規格搜尋清單' },
        { name: '耗材列表 (Consumable List)', path: '/consumable-list', desc: '耗材現存量、安全水位警戒、調撥與品項規格管理（已完全移除單位）' },
        { name: '實體庫存盤點 (Stocktaking)', path: '/stocktaking', desc: '定期盤點全廠資產，支援內部公司資產核對' }
      ],
      inputs: ['進貨驗收完成資產', '借用歸還驗收合格品', '盤點實盤數據'],
      outputs: ['在庫可用資產清單', '品項異動台帳 (Item Ledger)', '盤點實盤比對總表'],
      businessRules: [
        '每件設備/硬體具備唯一生命週期狀態：在庫 (ACTIVE) / 借出 (LENT) / 已出貨 (SHIPPED) / 維修 (REPAIRING) / 報廢 (SCRAPPED)。',
        '儀表板卡片依「廠牌 + 類型 + 型號 + 規格」即時聚合統計各狀態數量，點擊卡片可精確篩選該規格之設備/硬體序號。',
        '支援資產歸屬切換（公司資產 COMPANY ➔ 一般銷售 FOR_SALE）與搭載硬體狀態同步聯動（設備出貨/入庫時同步更新其搭載硬體）。',
        '點選任一資產即可開啟「品項台帳 (Ledger)」，完整追溯其入庫、借還與出貨全歷史。'
      ]
    },
    {
      id: 'outbound',
      blockIndex: '05',
      title: '出庫交付與借用調撥 (Outbound & Lent)',
      category: 'FLOW',
      color: '#ea580c',
      badge: '物料交付',
      icon: <Truck size={24} />,
      desc: '處理專案銷貨出庫（扣庫結案）或設備借出調撥（追蹤歸還期與驗收復庫），出貨單列表支援狀態即時查詢。',
      subModules: [
        { name: '出貨單建立 (Outbound)', path: '/outbound', desc: '建立 D/N 單，掃描/選擇在庫 SN，指派客戶與專案' },
        { name: '出貨單列表 (D/N List)', path: '/dn-list', desc: '搜尋列新增狀態查詢欄位 (全部 / 待出貨 / 已出貨 / 已歸還)，支援銷貨單總覽與列印/PDF' },
        { name: '設備/硬體借用列表 (Device/HW Lent List)', path: '/lent-list', desc: '追蹤借出設備與硬體、預計歸還日、逾期警示與一鍵歸還驗收' }
      ],
      inputs: ['客戶/專案出貨需求', '內部/外部借用申請', '在庫狀態設備/硬體/耗材'],
      outputs: ['出貨單 (DN-YYYYMMDD-XX)', '資產狀態轉移 (SHIPPED/LENT)', '專案庫存扣減'],
      businessRules: [
        '單據類型為 SALE (銷貨) 時：庫存狀態變更為 SHIPPED (已出貨)，數據自動送至專案進銷存報表。',
        '單據類型為 LENT (借用) 時：庫存狀態變更為 LENT (借出中)，歸還時進行驗收並自動恢復 ACTIVE。',
        '當設備狀態變更為出貨 (SHIPPED) 或在庫 (ACTIVE) 時，系統自動連動更新其搭載硬體 (Mounted HW) 為同步狀態。',
        '出貨單列表支援以「狀態 (Status)」進行快速篩選（待出貨 PENDING、已出貨 SHIPPED、已歸還 RETURNED）。'
      ]
    },
    {
      id: 'reports-analytics',
      blockIndex: '06',
      title: '專案進銷存與營運報表 (Reports & Analytics)',
      category: 'ANALYTICS',
      color: '#db2777',
      badge: '價值呈現',
      icon: <BarChart2 size={24} />,
      desc: '管理專案立案與代碼，並自動交叉比對採購、進貨與出貨單據，即時產出專案到貨達成率、進出貨歷程與庫存統計報表。',
      subModules: [
        { name: '專案列表 (Projects)', path: '/projects', desc: '建立與追蹤專案名稱、代碼及執行狀態' },
        { name: '專案報表 (PJ Report)', path: '/pj-report', desc: '專案進銷存主軸：採購數、到貨達成率、出貨數與庫存餘額' },
        { name: '報表中心 (Reports)', path: '/reports', desc: '全方位的營運數據總覽與多維度卡片導覽' },
        { name: '進出貨日誌 (Flow History)', path: '/flow-history', desc: '按時間序列追蹤全廠料件進出與異動流水' }
      ],
      inputs: ['專案立案與代碼', '採購單預計量', '進貨單實際到貨量', '出貨單專案交付量'],
      outputs: ['專案清冊與狀態追蹤', '專案到貨達成率分析', '料件庫存餘額表', 'CSV / Excel 報表匯出'],
      businessRules: [
        '出貨單 (D/N) 綁定專案後，其品項料件將自動納入專案報表 (PJ Report) 進行進銷存扣減與追蹤。',
        '專案進銷存公式：到貨率 = (已進貨數量 / 採購總數量) × 100%，庫存餘額 = 進貨量 - 出貨量。',
        '支援多層級展開，可直探至各筆採購明細與出貨單對應關聯。'
      ]
    }
  ], []);

  // --- 2. 跨模組底層支援方塊 ---
  const infraModules = useMemo(() => [
    {
      id: 'live-events',
      title: '即時事件串流 (Live Event Stream)',
      icon: <Zap size={18} color="#10b981" />,
      desc: '右上角「+」按鈕隨時展開，全天候廣播最新進出貨、建檔與借還即時動態。'
    },
    {
      id: 'event-logs',
      title: '稽核日誌 (Event Logs)',
      icon: <ShieldCheck size={18} color="#ea580c" />,
      path: '/event-logs',
      desc: '完整記錄全系統新增、修改、刪除操作者與時間戳記，確保內控與資安合規。'
    },
    {
      id: 'security-rbac',
      title: '帳號權限與密碼原則 (RBAC & Policy)',
      icon: <KeyRound size={18} color="#6366f1" />,
      path: '/settings',
      desc: '嚴格控管 ADMIN、IT、USER 三級權限，提供 SHA-256 密碼加密與密碼複雜度原則。'
    }
  ], []);

  // 篩選方塊
  const filteredBlocks = useMemo(() => {
    if (!searchTerm.trim()) return modulesData;
    const term = searchTerm.toLowerCase();
    return modulesData.filter(b => 
      b.title.toLowerCase().includes(term) ||
      b.desc.toLowerCase().includes(term) ||
      b.subModules.some(s => s.name.toLowerCase().includes(term) || s.desc.toLowerCase().includes(term))
    );
  }, [modulesData, searchTerm]);

  return (
    <div className="process-flow-container">
      {/* 頂部導航列 */}
      <div className="process-flow-header">
        <div className="header-left">
          <button 
            className="back-to-reports-btn"
            onClick={() => navigate('/reports')}
            title="返回報表中心"
          >
            <ArrowLeft size={18} /> 返回報表中心
          </button>
          <div className="title-wrapper">
            <h1 className="main-title">
              <Network size={28} color="var(--primary-color)" />
              系統架構與流程導覽 (System Process Map)
            </h1>
            <span className="subtitle">
              全方位掌握 METECH ERP 的「單據流」、「物料流」與「專案進銷存」核心架構
            </span>
          </div>
        </div>

        {/* 搜尋與篩選 */}
        <div className="header-search">
          <Search size={16} color="var(--text-muted)" />
          <input 
            type="text"
            placeholder="搜尋功能方塊、SN 序號、盤點..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button className="clear-search-btn" onClick={() => setSearchTerm('')}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* 視圖模式切換籤頁 (View Mode Tabs) */}
      <div className="view-mode-tabs">
        <button 
          className={`view-tab-btn ${activeTab === 'MODULE_BLOCKS' ? 'active' : ''}`}
          onClick={() => setActiveTab('MODULE_BLOCKS')}
        >
          <Boxes size={18} />
          <span>全模組架構方塊 (Module Blocks)</span>
        </button>

        <button 
          className={`view-tab-btn ${activeTab === 'E2E_FLOW' ? 'active' : ''}`}
          onClick={() => setActiveTab('E2E_FLOW')}
        >
          <RotateCw size={18} />
          <span>業務生命週期流 (End-to-End Flow)</span>
        </button>

        <button 
          className={`view-tab-btn ${activeTab === 'STATE_MACHINE' ? 'active' : ''}`}
          onClick={() => setActiveTab('STATE_MACHINE')}
        >
          <Sparkles size={18} />
          <span>資產狀態生命週期 (Asset State)</span>
        </button>

        <button 
          className={`view-tab-btn ${activeTab === 'ROLE_GUIDE' ? 'active' : ''}`}
          onClick={() => setActiveTab('ROLE_GUIDE')}
        >
          <Users size={18} />
          <span>角色作業指南 (Role Guide)</span>
        </button>
      </div>

      {/* =========================================================
          視圖 1：全模組架構方塊圖 (Module Blocks View)
          ========================================================= */}
      {activeTab === 'MODULE_BLOCKS' && (
        <div className="blocks-view-layout">
          {/* 主流程方塊網格 */}
          <div className="module-blocks-grid">
            {filteredBlocks.map((block) => {
              const isSelected = selectedBlock?.id === block.id;
              return (
                <div 
                  key={block.id}
                  className={`module-block-card ${isSelected ? 'selected' : ''}`}
                  style={{ '--block-accent': block.color }}
                  onClick={() => setSelectedBlock(block)}
                >
                  <div className="card-top-bar">
                    <div className="block-number-badge">方塊 {block.blockIndex}</div>
                    <span className="block-category-pill" style={{ borderColor: block.color, color: block.color }}>
                      {block.badge}
                    </span>
                  </div>

                  <div className="card-title-row">
                    <div className="block-icon" style={{ backgroundColor: `${block.color}18`, color: block.color }}>
                      {block.icon}
                    </div>
                    <h2 className="block-title">{block.title}</h2>
                  </div>

                  <p className="block-description">{block.desc}</p>

                  <div className="submodules-list">
                    <div className="submodules-label">涵蓋頁面與功能：</div>
                    <div className="submodules-pills">
                      {block.subModules.map((sub, sIdx) => (
                        <button
                          key={sIdx}
                          className="submodule-pill-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (sub.path) navigate(sub.path);
                          }}
                          title={`點擊直接前往：${sub.name}`}
                        >
                          <span>{sub.name}</span>
                          <ExternalLink size={12} className="pill-arrow-icon" />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="card-footer-action">
                    <span>查看輸入/輸出與業務規則</span>
                    <ChevronRight size={16} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* 橫切底層支撐方塊 */}
          <div className="infra-support-card">
            <div className="infra-header">
              <ShieldCheck size={20} color="#2563eb" />
              <span>【底層支援：稽核日誌與系統安全 (Infrastructure & Governance)】</span>
            </div>
            <div className="infra-items-grid">
              {infraModules.map(infra => (
                <div 
                  key={infra.id}
                  className={`infra-item ${infra.path ? 'clickable' : ''}`}
                  onClick={() => infra.path && navigate(infra.path)}
                >
                  <div className="infra-icon">{infra.icon}</div>
                  <div className="infra-content">
                    <div className="infra-title">
                      {infra.title}
                      {infra.path && <ExternalLink size={12} style={{ marginLeft: 4, opacity: 0.7 }} />}
                    </div>
                    <div className="infra-desc">{infra.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          視圖 2：業務生命週期流程 (End-to-End Business Flow)
          ========================================================= */}
      {activeTab === 'E2E_FLOW' && (
        <div className="e2e-flow-container">
          <div className="flow-filter-bar">
            <span className="filter-title">選擇流向視角：</span>
            <div className="stream-selector-pills">
              <button 
                className={`stream-pill ${flowStreamType === 'ALL' ? 'active' : ''}`}
                onClick={() => setFlowStreamType('ALL')}
              >
                全部流向整合
              </button>
              <button 
                className={`stream-pill ${flowStreamType === 'DOC' ? 'active' : ''}`}
                onClick={() => setFlowStreamType('DOC')}
              >
                📄 單據流 (PO ➔ SI ➔ DN)
              </button>
              <button 
                className={`stream-pill ${flowStreamType === 'ASSET' ? 'active' : ''}`}
                onClick={() => setFlowStreamType('ASSET')}
              >
                📦 實體物料/序號流 (在途 ➔ 在庫 ➔ 出庫)
              </button>
              <button 
                className={`stream-pill ${flowStreamType === 'REPORT' ? 'active' : ''}`}
                onClick={() => setFlowStreamType('REPORT')}
              >
                📊 專案進銷存流 (立案 ➔ 驗收 ➔ 結案統計)
              </button>
            </div>
          </div>

          <div className="timeline-flow-track">
            {/* 步驟 1 */}
            <div className="flow-step-node">
              <div className="step-badge">階段 1</div>
              <div className="step-card">
                <div className="step-card-header">
                  <div className="step-icon-box" style={{ background: '#2563eb' }}>
                    <ShoppingCart size={20} color="#fff" />
                  </div>
                  <div>
                    <h3 className="step-name">1. 採購需求與下單 (P/O)</h3>
                    <span className="step-tag">發起採購</span>
                  </div>
                </div>
                <div className="step-body">
                  <p>向合格供應商建立採購單據，明定品項、規格、採購數量及預計交期。</p>
                  {(flowStreamType === 'ALL' || flowStreamType === 'DOC') && (
                    <div className="stream-item doc">
                      <strong>📄 單據流：</strong> 產出 <code>PO-YYYYMMDD-XX</code> (狀態: 待進貨)
                    </div>
                  )}
                  {(flowStreamType === 'ALL' || flowStreamType === 'ASSET') && (
                    <div className="stream-item asset">
                      <strong>📦 物料流：</strong> 標記為「在途預計到貨量」
                    </div>
                  )}
                  {(flowStreamType === 'ALL' || flowStreamType === 'REPORT') && (
                    <div className="stream-item report">
                      <strong>📊 進銷存流：</strong> 建立專案採購基準規格與預計訂購量
                    </div>
                  )}
                </div>
                <div className="step-action-row">
                  <button className="step-nav-btn" onClick={() => navigate('/purchasing')}>
                    前往建立採購單 <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            </div>

            <div className="flow-connector"><ArrowRight size={24} /></div>

            {/* 步驟 2 */}
            <div className="flow-step-node">
              <div className="step-badge">階段 2</div>
              <div className="step-card">
                <div className="step-card-header">
                  <div className="step-icon-box" style={{ background: '#059669' }}>
                    <Boxes size={20} color="#fff" />
                  </div>
                  <div>
                    <h3 className="step-name">2. 貨到驗收與 SN 建檔 (S/I & Batch Import)</h3>
                    <span className="step-tag">入庫與批次匯入</span>
                  </div>
                </div>
                <div className="step-body">
                  <p>實體貨品抵達後進行驗收與序號展開，亦可透過 Excel/CSV 批次匯入整批設備與硬體，自動識別已出貨或在庫狀態。</p>
                  {(flowStreamType === 'ALL' || flowStreamType === 'DOC') && (
                    <div className="stream-item doc">
                      <strong>📄 單據流：</strong> 產出進貨單 <code>IN-YYYYMMDD-XX</code>（結案 P/O）或記錄批次匯入稽核日誌
                    </div>
                  )}
                  {(flowStreamType === 'ALL' || flowStreamType === 'ASSET') && (
                    <div className="stream-item asset">
                      <strong>📦 物料流：</strong> 建立單機與模組資產，依檔案標記為 <code>AVAILABLE (在庫)</code> 或 <code>SHIPPED (已出貨)</code>
                    </div>
                  )}
                  {(flowStreamType === 'ALL' || flowStreamType === 'REPORT') && (
                    <div className="stream-item report">
                      <strong>📊 進銷存流：</strong> 寫入進貨與資產履歷，即時同步專案到貨達成率與庫存池
                    </div>
                  )}
                </div>
                <div className="step-action-row" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button className="step-nav-btn" onClick={() => navigate('/inbound')}>
                    前往進貨單登記 <ArrowRight size={14} />
                  </button>
                  <button className="step-nav-btn" onClick={() => navigate('/devices')} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-main)' }}>
                    設備建檔/匯入 <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            </div>

            <div className="flow-connector"><ArrowRight size={24} /></div>

            {/* 步驟 3 */}
            <div className="flow-step-node">
              <div className="step-badge">階段 3</div>
              <div className="step-card">
                <div className="step-card-header">
                  <div className="step-icon-box" style={{ background: '#d97706' }}>
                    <Package size={20} color="#fff" />
                  </div>
                  <div>
                    <h3 className="step-name">3. 在庫池維護與盤點</h3>
                    <span className="step-tag">倉庫管理</span>
                  </div>
                </div>
                <div className="step-body">
                  <p>隨時掌握在席設備、硬體模組與耗材現存量，定期執行庫存盤點與台帳追溯。</p>
                  {(flowStreamType === 'ALL' || flowStreamType === 'DOC') && (
                    <div className="stream-item doc">
                      <strong>📄 單據流：</strong> 產出庫存台帳 (Ledger) 與盤點清單
                    </div>
                  )}
                  {(flowStreamType === 'ALL' || flowStreamType === 'ASSET') && (
                    <div className="stream-item asset">
                      <strong>📦 物料流：</strong> 設備於庫位就緒，耗材維持安全水位
                    </div>
                  )}
                  {(flowStreamType === 'ALL' || flowStreamType === 'REPORT') && (
                    <div className="stream-item report">
                      <strong>📊 進銷存流：</strong> 產出品項台帳歷程，即時監控在線安全存量
                    </div>
                  )}
                </div>
                <div className="step-action-row">
                  <button className="step-nav-btn" onClick={() => navigate('/stocktaking')}>
                    庫存盤點表 (Stocktaking) <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            </div>

            <div className="flow-connector"><ArrowRight size={24} /></div>

            {/* 步驟 4 */}
            <div className="flow-step-node">
              <div className="step-badge">階段 4</div>
              <div className="step-card">
                <div className="step-card-header">
                  <div className="step-icon-box" style={{ background: '#ea580c' }}>
                    <Truck size={20} color="#fff" />
                  </div>
                  <div>
                    <h3 className="step-name">4. 出庫交付 / 借出歸還 (D/N)</h3>
                    <span className="step-tag">銷貨調撥</span>
                  </div>
                </div>
                <div className="step-body">
                  <p>依據客戶需求開立出貨單，選擇「專案銷貨」扣庫或「設備借用」調撥。</p>
                  {(flowStreamType === 'ALL' || flowStreamType === 'DOC') && (
                    <div className="stream-item doc">
                      <strong>📄 單據流：</strong> 產出出貨單 <code>DN-YYYYMMDD-XX</code>
                    </div>
                  )}
                  {(flowStreamType === 'ALL' || flowStreamType === 'ASSET') && (
                    <div className="stream-item asset">
                      <strong>📦 物料流：</strong> 銷貨轉 <code>SHIPPED</code>；借出轉 <code>LENT</code>
                    </div>
                  )}
                  {(flowStreamType === 'ALL' || flowStreamType === 'REPORT') && (
                    <div className="stream-item report">
                      <strong>📊 進銷存流：</strong> 記錄出貨交付時間，扣減專案在庫數量
                    </div>
                  )}
                </div>
                <div className="step-action-row">
                  <button className="step-nav-btn" onClick={() => navigate('/outbound')}>
                    建立出貨單 (D/N) <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            </div>

            <div className="flow-connector"><ArrowRight size={24} /></div>

            {/* 步驟 5 */}
            <div className="flow-step-node">
              <div className="step-badge">階段 5</div>
              <div className="step-card">
                <div className="step-card-header">
                  <div className="step-icon-box" style={{ background: '#db2777' }}>
                    <BarChart2 size={20} color="#fff" />
                  </div>
                  <div>
                    <h3 className="step-name">5. 專案進銷存分析 (PJ Report)</h3>
                    <span className="step-tag">進銷存統計</span>
                  </div>
                </div>
                <div className="step-body">
                  <p>自動整合專案採購、進貨與出貨數據，即時分析專案到貨達成率與物料庫存餘額。</p>
                  {(flowStreamType === 'ALL' || flowStreamType === 'DOC') && (
                    <div className="stream-item doc">
                      <strong>📄 單據流：</strong> 專案結案報表、匯出 CSV / Excel
                    </div>
                  )}
                  {(flowStreamType === 'ALL' || flowStreamType === 'ASSET') && (
                    <div className="stream-item asset">
                      <strong>📦 物料流：</strong> 確認專案料件出清無庫存餘額
                    </div>
                  )}
                  {(flowStreamType === 'ALL' || flowStreamType === 'REPORT') && (
                    <div className="stream-item report">
                      <strong>📊 進銷存流：</strong> 產出各專案完整採購、進貨、出貨明細與未到貨/庫存餘額
                    </div>
                  )}
                </div>
                <div className="step-action-row">
                  <button className="step-nav-btn" onClick={() => navigate('/pj-report')}>
                    進入 PJ 專案報表 <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          視圖 3：資產狀態生命週期 (Asset State Machine)
          ========================================================= */}
      {activeTab === 'STATE_MACHINE' && (
        <div className="state-machine-container">
          <div className="state-intro-card">
            <Info size={20} color="#2563eb" />
            <div>
              <strong>METECH ERP 資產狀態轉移與連動準則：</strong>
              全系統單機設備 (Devices) 與硬體零組件 (HW) 均嚴格遵循以下狀態機生命週期，並支援「搭載硬體自動連動 (Mounted HW Sync)」與「資產歸屬切換 (COMPANY ➔ FOR_SALE)」，確保帳實相符與流向透明。
            </div>
          </div>

          <div className="states-grid">
            <div className="state-box state-available">
              <div className="state-header">
                <span className="state-dot available" />
                <h3>ACTIVE (在庫可用)</h3>
              </div>
              <p className="state-desc">貨品已入庫驗收完畢，實體存放於庫位，可供隨時調撥、銷貨、借用或組裝搭載。</p>
              <div className="state-transitions">
                <div className="trans-title">可轉入狀態：</div>
                <ul>
                  <li>➔ <strong>SHIPPED (已出貨)</strong>：開立銷貨出貨單 (SALE)，連動更新搭載硬體</li>
                  <li>➔ <strong>LENT (借出中)</strong>：開立借用調撥單 (LENT)</li>
                  <li>➔ <strong>REPAIRING (維修中)</strong>：設備故障送修檢測</li>
                  <li>➔ <strong>SCRAPPED (報廢)</strong>：損壞無法修復或過期汰除</li>
                </ul>
              </div>
            </div>

            <div className="state-box state-lent">
              <div className="state-header">
                <span className="state-dot lent" />
                <h3>LENT (借出調撥中)</h3>
              </div>
              <p className="state-desc">設備已借予專案客戶或工程團隊，受借用清單 (Lent List) 與預計歸還日追蹤。</p>
              <div className="state-transitions">
                <div className="trans-title">可轉入狀態：</div>
                <ul>
                  <li>➔ <strong>ACTIVE (在庫)</strong>：執行歸還驗收合格，連動復庫</li>
                  <li>➔ <strong>OVERDUE (逾期警示)</strong>：超過預計歸還日自動標註</li>
                </ul>
              </div>
            </div>

            <div className="state-box state-shipped">
              <div className="state-header">
                <span className="state-dot shipped" />
                <h3>SHIPPED (已出貨銷貨)</h3>
              </div>
              <p className="state-desc">設備已交付客戶並完成專案扣庫，正式離開庫存池，其出貨紀錄納入專案統計，其搭載硬體同步標記為已出貨。</p>
              <div className="state-transitions">
                <div className="trans-title">可轉入狀態：</div>
                <ul>
                  <li>➔ <strong>結案存檔</strong>：納入 PJ 專案報表進銷存統計</li>
                  <li>➔ <strong>台帳追溯</strong>：可永久由 Item Ledger 查詢去向與出貨單號</li>
                  <li>➔ <strong>ACTIVE (在庫)</strong>：若出貨單撤銷或變更為在庫，連動復庫搭載硬體</li>
                </ul>
              </div>
            </div>

            <div className="state-box state-repair">
              <div className="state-header">
                <span className="state-dot" style={{ backgroundColor: '#ef4444' }} />
                <h3>REPAIRING (維修檢測中)</h3>
              </div>
              <p className="state-desc">設備或硬體發生故障，暫時脫離可用庫存池，進行原廠送修或內部除錯檢測。</p>
              <div className="state-transitions">
                <div className="trans-title">可轉入狀態：</div>
                <ul>
                  <li>➔ <strong>ACTIVE (在庫)</strong>：維修完成驗收合格回庫</li>
                  <li>➔ <strong>SCRAPPED (報廢)</strong>：判定無法修復轉報廢</li>
                </ul>
              </div>
            </div>

            <div className="state-box state-scrapped">
              <div className="state-header">
                <span className="state-dot" style={{ backgroundColor: '#6b7280' }} />
                <h3>SCRAPPED (報廢汰除)</h3>
              </div>
              <p className="state-desc">經評估已無法使用或過保損壞之資產，完成報廢核准程序，封存除役。</p>
              <div className="state-transitions">
                <div className="trans-title">可轉入狀態：</div>
                <ul>
                  <li>➔ <strong>永久除役存檔</strong>：保留歷程供盤點與稽核查詢</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          視圖 4：角色作業指南 (Role-Based Operational Guide)
          ========================================================= */}
      {activeTab === 'ROLE_GUIDE' && (
        <div className="role-guide-container">
          <div className="role-selector-tabs">
            <button 
              className={`role-tab-btn ${selectedRole === 'ADMIN' ? 'active' : ''}`}
              onClick={() => setSelectedRole('ADMIN')}
            >
              👑 系統管理員 (ADMIN)
            </button>
            <button 
              className={`role-tab-btn ${selectedRole === 'IT' ? 'active' : ''}`}
              onClick={() => setSelectedRole('IT')}
            >
              🛠️ 工程與倉庫主管 (IT)
            </button>
            <button 
              className={`role-tab-btn ${selectedRole === 'USER' ? 'active' : ''}`}
              onClick={() => setSelectedRole('USER')}
            >
              👤 一般業務與同仁 (USER)
            </button>
          </div>

          <div className="role-content-card">
            {selectedRole === 'ADMIN' && (
              <div className="role-panel">
                <h3 className="role-panel-title">系統管理員 (ADMIN) 核心職責與操作指南</h3>
                <p className="role-panel-desc">負責全系統架構安全、用戶權限配置、專案進銷存進度與稽核日誌監督。</p>
                <div className="role-checklist">
                  <div className="checklist-item">
                    <CheckCircle2 size={18} color="#2563eb" />
                    <div>
                      <strong>系統帳號與權限分配：</strong>
                      前往 <button className="inline-link" onClick={() => navigate('/settings')}>系統設定 (Settings)</button> 設定使用者帳號與密碼原則。
                    </div>
                  </div>
                  <div className="checklist-item">
                    <CheckCircle2 size={18} color="#2563eb" />
                    <div>
                      <strong>專案進銷存與達成率檢視：</strong>
                      定期進入 <button className="inline-link" onClick={() => navigate('/pj-report')}>PJ 專案報表</button> 核對各專案之採購到貨達成率與出貨進度。
                    </div>
                  </div>
                  <div className="checklist-item">
                    <CheckCircle2 size={18} color="#2563eb" />
                    <div>
                      <strong>安全稽核與日誌追蹤：</strong>
                      於 <button className="inline-link" onClick={() => navigate('/event-logs')}>事件紀錄查詢 (Event Logs)</button> 審查全系統異動。
                    </div>
                  </div>
                </div>
              </div>
            )}

            {selectedRole === 'IT' && (
              <div className="role-panel">
                <h3 className="role-panel-title">工程與倉庫主管 (IT) 核心職責與操作指南</h3>
                <p className="role-panel-desc">負責採購發起、進貨單驗收與序號展開、規格填寫、在庫資產盤點及出貨單開立。</p>
                <div className="role-checklist">
                  <div className="checklist-item">
                    <CheckCircle2 size={18} color="#059669" />
                    <div>
                      <strong>貨到驗收、序號建檔與批次匯入：</strong>
                      進入 <button className="inline-link" onClick={() => navigate('/inbound')}>進貨登記</button> 點選「展開明細」，或透過 <button className="inline-link" onClick={() => navigate('/devices')}>設備建檔</button>、<button className="inline-link" onClick={() => navigate('/hw-registration')}>硬體建檔</button> 右上角之「📊 批次匯入 (Excel/CSV)」功能快速導入資產（規格為必填欄位，匯入一律預設為一般銷售並自動依檔案判斷出貨/在庫狀態）。
                    </div>
                  </div>
                  <div className="checklist-item">
                    <CheckCircle2 size={18} color="#059669" />
                    <div>
                      <strong>出貨單與借用追蹤：</strong>
                      建立 <button className="inline-link" onClick={() => navigate('/outbound')}>出貨單 (D/N)</button>，並在 <button className="inline-link" onClick={() => navigate('/dn-list')}>出貨單列表</button> 透過新增之狀態欄位 (全部/待出貨/已出貨/已歸還) 快速查詢，於 <button className="inline-link" onClick={() => navigate('/lent-list')}>設備/硬體借用列表</button> 掌握逾期與驗收歸還。
                    </div>
                  </div>
                  <div className="checklist-item">
                    <CheckCircle2 size={18} color="#059669" />
                    <div>
                      <strong>四欄聚合卡片與定期實體盤點：</strong>
                      使用 <button className="inline-link" onClick={() => navigate('/device-list')}>設備列表</button> / <button className="inline-link" onClick={() => navigate('/hw-list')}>硬體列表</button> 依「廠牌+類型+型號+規格」檢視各規格庫存，並使用 <button className="inline-link" onClick={() => navigate('/stocktaking')}>庫存盤點 (Stocktaking)</button> 檢查在線數量與安全水位。
                    </div>
                  </div>
                </div>
              </div>
            )}

            {selectedRole === 'USER' && (
              <div className="role-panel">
                <h3 className="role-panel-title">一般業務與同仁 (USER) 操作指南</h3>
                <p className="role-panel-desc">查詢可用庫存現狀、了解專案料件備貨狀況及查詢借用設備。</p>
                <div className="role-checklist">
                  <div className="checklist-item">
                    <CheckCircle2 size={18} color="#d97706" />
                    <div>
                      <strong>查詢在席設備：</strong>
                      於 <button className="inline-link" onClick={() => navigate('/device-list')}>設備列表</button> 檢視目前是否有足額 AVAILABLE 設備。
                    </div>
                  </div>
                  <div className="checklist-item">
                    <CheckCircle2 size={18} color="#d97706" />
                    <div>
                      <strong>追蹤專案進度：</strong>
                      在 <button className="inline-link" onClick={() => navigate('/projects')}>專案列表</button> 查閱指派設備之出貨狀況。
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================
          選中方塊詳細 Modal (Block Details Drawer / Modal)
          ========================================================= */}
      {selectedBlock && (
        <div className="block-detail-overlay" onClick={() => setSelectedBlock(null)}>
          <div className="block-detail-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-top-bar">
              <div className="modal-title-box">
                <div className="modal-icon" style={{ backgroundColor: `${selectedBlock.color}20`, color: selectedBlock.color }}>
                  {selectedBlock.icon}
                </div>
                <div>
                  <div className="modal-badge" style={{ color: selectedBlock.color }}>
                    方塊 {selectedBlock.blockIndex} • {selectedBlock.badge}
                  </div>
                  <h2 className="modal-title">{selectedBlock.title}</h2>
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setSelectedBlock(null)}>
                <X size={20} />
              </button>
            </div>

            <p className="modal-desc">{selectedBlock.desc}</p>

            {/* 快速前往頁面按鈕 */}
            <div className="modal-section">
              <h4 className="section-heading">🔗 快速前往對應功能頁面：</h4>
              <div className="modal-quick-links">
                {selectedBlock.subModules.map((sub, idx) => (
                  <button 
                    key={idx}
                    className="modal-link-btn"
                    onClick={() => {
                      setSelectedBlock(null);
                      if (sub.path) navigate(sub.path);
                    }}
                  >
                    <div className="link-title">{sub.name}</div>
                    <div className="link-desc">{sub.desc}</div>
                    <ArrowRight size={16} className="link-arrow" />
                  </button>
                ))}
              </div>
            </div>

            {/* 輸入與輸出 */}
            <div className="modal-io-grid">
              <div className="io-box inputs">
                <h4 className="io-heading">📥 核心輸入 (Inputs)</h4>
                <ul>
                  {selectedBlock.inputs.map((inp, idx) => (
                    <li key={idx}>{inp}</li>
                  ))}
                </ul>
              </div>
              <div className="io-box outputs">
                <h4 className="io-heading">📤 核心產出 (Outputs)</h4>
                <ul>
                  {selectedBlock.outputs.map((out, idx) => (
                    <li key={idx}>{out}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* 業務規則 */}
            <div className="modal-section">
              <h4 className="section-heading">⚡ 業務邏輯與內控規則：</h4>
              <ul className="modal-rules-list">
                {selectedBlock.businessRules.map((rule, idx) => (
                  <li key={idx}>{rule}</li>
                ))}
              </ul>
            </div>

            <div className="modal-footer">
              <button className="modal-done-btn" onClick={() => setSelectedBlock(null)}>
                關閉導覽
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProcessFlow;
