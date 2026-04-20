import React, { useContext, useState } from 'react';
import { Download, FileText, Filter, FileSpreadsheet, Lock } from 'lucide-react';
import { RoleContext } from '../context/RoleContext';

const Reports = () => {
  const { role } = useContext(RoleContext);
  
  // States for report generation
  const [reportType, setReportType] = useState('INVENTORY');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [includePartner, setIncludePartner] = useState(false);

  const handleExport = () => {
    // Determine what we are actually exporting based on settings
    let exportInfo = `\n報表類型: ${reportType === 'INVENTORY' ? '當前實體庫存盤點表' : '進出貨歷史總表'}`;
    
    if (includePartner) exportInfo += `\n附加資料: 包含進貨來源/出貨對象`;

    if (dateRange.start && dateRange.end) {
      exportInfo += `\n日期區間: ${dateRange.start} ~ ${dateRange.end}`;
    } else {
      exportInfo += `\n日期區間: 全部時期`;
    }

    alert(`檔案準備下載... (Demo)\n\n--- 產出條件設定 ---${exportInfo}\n\n資產單價與總額欄位已被系統移除。`);
  };

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: '24px' }}>報表與分析中心 (Reports)</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: '24px' }}>
        
        {/* 左側：設定表單卡片 */}
        <div className="card-surface" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid #eee', paddingBottom: '16px' }}>
            <Filter color="var(--primary-color)" />
            <h3 style={{ margin: 0, color: 'var(--primary-color)' }}>匯出條件設定</h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: 600, fontSize: '0.95rem' }}>1. 選擇報表類型</label>
            <select 
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #d0d0d0', backgroundColor: '#f8f9fa' }}
            >
              <option value="INVENTORY">當前實體庫存盤點表 (Inventory Count)</option>
              {role === 'WAREHOUSE' && (
                <option value="FLOW_HISTORY">進出貨歷史稽核總表 (Audit Logs & Flow)</option>
              )}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontWeight: 600, fontSize: '0.95rem' }}>2. 選擇日期區間</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input 
                type="date" 
                value={dateRange.start}
                onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
                style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #d0d0d0' }} 
              />
              <span style={{ color: '#888' }}>至</span>
              <input 
                type="date" 
                value={dateRange.end}
                onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
                style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #d0d0d0' }} 
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label style={{ fontWeight: 600, fontSize: '0.95rem' }}>3. 進階匯出選項</label>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', backgroundColor: '#f0f4f8', padding: '16px', borderRadius: '8px', border: '1px solid #d0e0ed' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#333', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={includePartner}
                  onChange={(e) => setIncludePartner(e.target.checked)}
                  style={{ width: '16px', height: '16px' }}
                />
                匯出內容包含「進貨供應商」資訊
              </label>
            </div>
          </div>

          <button 
            onClick={handleExport}
            style={{ 
              marginTop: '16px', padding: '14px', backgroundColor: 'var(--primary-color)', color: 'white', 
              border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '1rem', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              transition: 'background-color 0.2s', boxShadow: '0 4px 12px rgba(27, 54, 93, 0.2)'
            }}
          >
            <Download size={20} />
            生成並匯出 CSV 報表
          </button>
        </div>

        {/* 右側：資料預覽與說明 */}
        <div className="card-surface" style={{ display: 'flex', flexDirection: 'column', gap: '16px', backgroundColor: '#fdfdfd' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <FileText color="#555" />
            <h3 style={{ margin: 0, color: '#333' }}>匯出內容預覽說明</h3>
          </div>
          
          <div style={{ padding: '16px', border: '1px dashed #ccc', borderRadius: '8px', backgroundColor: '#fff', opacity: 0.8 }}>
            <p style={{ color: '#555', marginBottom: '12px', fontSize: '0.9rem', lineHeight: 1.6 }}>
              匯出的資料將會包含以下欄位：<br/>
              <strong>品項編號 (SN)</strong>、<strong>品項名稱</strong>、<strong>安全水位預警</strong>、<strong style={{ color: '#2e7d32' }}>可動用數量 (Available Qty)</strong> 以及 <strong>當前實體庫存在庫數 (Physical Qty)</strong>。
            </p>
            
            {includePartner && (
              <p style={{ color: '#1976d2', marginBottom: '0', fontSize: '0.9rem', fontWeight: 500 }}>
                🏢 包含進銷來源：紀錄該批物品之原始進貨供應商名稱。
              </p>
            )}
          </div>
          
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc' }}>
            <div style={{ textAlign: 'center' }}>
              <FileSpreadsheet size={64} style={{ marginBottom: '16px' }} />
              <div>設定好左側條件後，點擊匯出按鈕以獲取檔案。</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Reports;
