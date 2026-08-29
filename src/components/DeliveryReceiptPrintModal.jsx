import React, { useState, useEffect, useRef } from 'react';
import { Printer, Download, X, Edit3, Check, RefreshCw, Building, Image as ImageIcon, Plus, Trash2, Loader2, Settings } from 'lucide-react';
import html2canvas from 'html2canvas';
import { getCompanyPresets, DEFAULT_BUILTIN_PRESETS } from '../utils/companyPresets';
import CompanyPresetModal from './CompanyPresetModal';
import logoImg from '../assets/logo.png';
import './DeliveryReceiptPrintModal.css';

const formatDateSlash = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    // 若本來就是 YYYY-MM-DD 或 YYYY.MM.DD 格式
    const parts = String(dateStr).split(/[-./]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
      }
    }
    return String(dateStr);
  }
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

const getMinguoDateParts = (dateStr) => {
  const d = dateStr ? new Date(dateStr) : new Date();
  const validDate = isNaN(d.getTime()) ? new Date() : d;
  const year = validDate.getFullYear() - 1911;
  const month = String(validDate.getMonth() + 1).padStart(2, '0');
  const day = String(validDate.getDate()).padStart(2, '0');
  return { year: String(year), month, day };
};

const DeliveryReceiptPrintModal = ({ isOpen, onClose, dnData, items = [] }) => {
  const [isEditMode, setIsEditMode] = useState(false);
  const [presetsMap, setPresetsMap] = useState(() => getCompanyPresets());
  const [selectedPreset, setSelectedPreset] = useState('PRESET_B');
  const [isPresetModalOpen, setIsPresetModalOpen] = useState(false);
  const [headerLayout, setHeaderLayout] = useState('STANDARD'); // 'STANDARD' | 'LEFT_COMPACT' | 'CENTER_ROW' | 'CENTERED' | 'REVERSE'

  // 公司抬頭 (單一文字框)
  const [currentLogo, setCurrentLogo] = useState(() => getCompanyPresets().PRESET_B?.logo || logoImg);
  const [headerRightText, setHeaderRightText] = useState(() => getCompanyPresets().PRESET_B?.headerRight || '');
  const [companySignName, setCompanySignName] = useState(() => getCompanyPresets().PRESET_B?.companySignName || '');

  const getHeaderTextAlign = () => {
    if (headerLayout === 'LEFT_COMPACT' || headerLayout === 'REVERSE' || headerLayout === 'CENTER_ROW') return 'left';
    if (headerLayout === 'CENTERED') return 'center';
    return 'right';
  };

  // 案名與客戶資訊
  const [customerName, setCustomerName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [confirmText, setConfirmText] = useState('惠請確認後簽名。謝謝');

  // 明細表格資料 (支援同設備多序號合併)
  const [tableRows, setTableRows] = useState([]);

  // 頁尾民國年日期
  const [dateYear, setDateYear] = useState('');
  const [dateMonth, setDateMonth] = useState('');
  const [dateDay, setDateDay] = useState('');

  // 狀態管理
  const [isPrinting, setIsPrinting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const fileInputRef = useRef(null);
  const sheetRef = useRef(null);

  // 初始化載入資料
  useEffect(() => {
    if (!isOpen || !dnData) return;

    // 1. 設定客戶名稱與案名
    const cust = dnData.customer || '';
    setCustomerName(cust);

    // 尋找關聯專案名稱
    const proj = dnData.project_name || dnData.remarks || '專案設備';
    setProjectName(proj.startsWith('案名：') ? proj.replace('案名：', '').trim() : proj);

    // 2. 設定民國年
    const minguo = getMinguoDateParts(dnData.shipping_date);
    setDateYear(minguo.year);
    setDateMonth(minguo.month);
    setDateDay(minguo.day);

    // 3. 品項群組化與維護期間規則處理
    // 規則：
    // - 設備：起始日抓 system_date (若無則抓出貨日)，到期日抓 customer_warranty_expire
    // - 硬體與耗材：起始日與到期日留空
    const groupedMap = new Map();

    (items || []).forEach((item, index) => {
      // 產生設備顯示名稱，例如 Cisco (N3K-C3548P-XL) 或 ADVA 10G-SR GBIC
      let devName = '';
      if (item.brand && item.model) {
        if (item.model.startsWith('(') || item.brand.includes('(')) {
          devName = `${item.brand} ${item.model}`;
        } else {
          devName = `${item.brand} (${item.model})`;
        }
      } else {
        devName = item.model || item.brand || `品項 #${index + 1}`;
      }

      // 群組 key：以 item_id + 維護起迄日合併
      const isDevice = item.category_name === '設備';
      const startDate = isDevice ? formatDateSlash(item.system_date || dnData.shipping_date) : '';
      const endDate = isDevice ? formatDateSlash(item.customer_warranty_expire || item.warranty_expire) : '';
      const groupKey = `${item.item_id || devName}_${startDate}_${endDate}`;

      const snVal = item.sn ? String(item.sn).trim() : (item.quantity ? `數量: ${item.quantity}` : '--');

      if (groupedMap.has(groupKey)) {
        const existing = groupedMap.get(groupKey);
        if (!existing.sns.includes(snVal)) {
          existing.sns.push(snVal);
        }
      } else {
        groupedMap.set(groupKey, {
          id: item.id || `group_${index}`,
          category: item.category_name,
          deviceName: devName,
          sns: [snVal],
          startDate,
          endDate
        });
      }
    });

    const parsedRows = Array.from(groupedMap.values()).map((row, idx) => ({
      ...row,
      index: idx + 1
    }));

    // 若筆數較少，補足至至少 4 列以維持 A4 視覺平衡
    while (parsedRows.length < 4) {
      parsedRows.push({
        id: `empty_${parsedRows.length + 1}`,
        index: parsedRows.length + 1,
        category: '',
        deviceName: '',
        sns: [''],
        startDate: '',
        endDate: ''
      });
    }

    setTableRows(parsedRows);
  }, [isOpen, dnData, items]);

  // 監聽 Modal 開啟載入最新自訂範本
  useEffect(() => {
    if (!isOpen) return;
    const allPresets = getCompanyPresets();
    setPresetsMap(allPresets);
    if (!allPresets[selectedPreset]) {
      setSelectedPreset('PRESET_B');
      const fallback = allPresets.PRESET_B || Object.values(allPresets)[0];
      if (fallback) {
        setCurrentLogo(fallback.logo);
        setHeaderRightText(fallback.headerRight);
        setCompanySignName(fallback.companySignName);
      }
    }
  }, [isOpen]);

  // 切換公司預設
  const handlePresetChange = (presetKey) => {
    setSelectedPreset(presetKey);
    const preset = presetsMap[presetKey];
    if (preset) {
      setCurrentLogo(preset.logo);
      setHeaderRightText(preset.headerRight);
      setCompanySignName(preset.companySignName);
    }
  };

  // 當範本管理彈窗新增/編輯/刪除完成時回調
  const handlePresetsUpdated = (newActiveId) => {
    const allPresets = getCompanyPresets();
    setPresetsMap(allPresets);
    const targetId = newActiveId && allPresets[newActiveId] ? newActiveId : (allPresets[selectedPreset] ? selectedPreset : 'PRESET_B');
    setSelectedPreset(targetId);
    const activePreset = allPresets[targetId];
    if (activePreset) {
      setCurrentLogo(activePreset.logo);
      setHeaderRightText(activePreset.headerRight);
      setCompanySignName(activePreset.companySignName);
    }
  };

  // 自訂 Logo 上傳
  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setCurrentLogo(event.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // 表格列操作 (新增列)
  const handleAddRow = () => {
    setTableRows(prev => [
      ...prev,
      {
        id: `custom_${Date.now()}`,
        index: prev.length + 1,
        category: '',
        deviceName: '',
        sns: [''],
        startDate: '',
        endDate: ''
      }
    ]);
  };

  // 表格列操作 (刪除列)
  const handleDeleteRow = (indexToRemove) => {
    setTableRows(prev => prev.filter((_, idx) => idx !== indexToRemove).map((row, idx) => ({ ...row, index: idx + 1 })));
  };

  // 表格列內容變更
  const handleRowChange = (idx, field, value) => {
    setTableRows(prev => {
      const updated = [...prev];
      if (field === 'snsText') {
        // 多行序號解析
        const parsedSns = value.split('\n');
        updated[idx] = { ...updated[idx], sns: parsedSns.length > 0 ? parsedSns : [''] };
      } else {
        updated[idx] = { ...updated[idx], [field]: value };
      }
      return updated;
    });
  };

  // 🖨️ 獨立沙盒 Iframe 列印 (避免直接 window.print() 造成的排版空白與頂部位移)
  const handlePrint = () => {
    if (!sheetRef.current) return;
    setIsPrinting(true);

    try {
      let iframe = document.getElementById('dr-print-iframe');
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'dr-print-iframe';
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);
      }

      const doc = iframe.contentWindow.document;
      doc.open();
      doc.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>交貨簽收單 - ${customerName || '列印'}</title>
          <meta charset="utf-8" />
          <style>
            @page {
              size: A4 portrait;
              margin: 15mm 15mm 15mm 15mm;
            }
            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            body {
              margin: 0;
              padding: 0;
              background: #ffffff;
              color: #000000;
              font-family: "PingFang TC", "Microsoft JhengHei", "Heiti TC", sans-serif;
            }
            .delivery-receipt-sheet {
              width: 100%;
              padding: 0;
            }
            .dr-header {
              gap: 16px;
              margin-bottom: 20px;
            }
            .dr-header.layout-STANDARD {
              display: flex;
              align-items: flex-start;
              justify-content: space-between;
            }
            .dr-header.layout-STANDARD .dr-company-title {
              display: flex;
              flex-direction: column;
              align-items: flex-end;
              text-align: right;
            }
            .dr-header.layout-LEFT_COMPACT {
              display: flex;
              align-items: center;
              justify-content: flex-start;
              gap: 20px;
            }
            .dr-header.layout-LEFT_COMPACT .dr-company-title {
              display: flex;
              flex-direction: column;
              align-items: flex-start;
              text-align: left;
            }
            .dr-header.layout-CENTERED {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              gap: 10px;
            }
            .dr-header.layout-CENTERED .dr-company-title {
              display: flex;
              flex-direction: column;
              align-items: center;
              text-align: center;
            }
            .dr-header.layout-CENTER_ROW {
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 20px;
            }
            .dr-header.layout-CENTER_ROW .dr-company-title {
              display: flex;
              flex-direction: column;
              align-items: flex-start;
              text-align: left;
            }
            .dr-header.layout-REVERSE {
              display: flex;
              flex-direction: row-reverse;
              align-items: flex-start;
              justify-content: space-between;
            }
            .dr-header.layout-REVERSE .dr-company-title {
              display: flex;
              flex-direction: column;
              align-items: flex-start;
              text-align: left;
            }
            .dr-logo-img {
              height: 48px;
              max-width: 160px;
              object-fit: contain;
            }
            .dr-company-title {
              display: flex;
              flex-direction: column;
            }
            .dr-company-name-zh {
              font-size: 17px;
              font-weight: 900;
              letter-spacing: 2px;
            }
            .dr-company-name-en {
              font-size: 13px;
              font-weight: 800;
              letter-spacing: 1px;
            }
            .dr-main-title {
              text-align: center;
              font-size: 22px;
              font-weight: 900;
              letter-spacing: 6px;
              margin: 10px 0 16px 0;
            }
            .dr-meta-section {
              display: flex;
              flex-direction: column;
              gap: 5px;
              font-size: 13px;
              margin-bottom: 12px;
            }
            .dr-meta-row {
              display: flex;
              align-items: center;
              gap: 8px;
            }
            .dr-meta-label {
              font-weight: 800;
            }
            .dr-meta-value {
              font-weight: 700;
            }
            .dr-table {
              width: 100%;
              border-collapse: collapse;
              border: 1.5px solid #000000;
              font-size: 12px;
              margin-bottom: 14px;
            }
            .dr-table th {
              background-color: #fef3c7;
              border: 1px solid #000000;
              padding: 5px 6px;
              font-weight: 800;
              text-align: center;
            }
            .dr-table td {
              border: 1px solid #000000;
              padding: 5px 6px;
              vertical-align: middle;
            }
            .dr-confirm-note {
              margin: 14px 0 10px 0;
              font-size: 13px;
              font-weight: 800;
            }
            .dr-signature-table {
              width: 100%;
              border-collapse: collapse;
              border: 1.5px solid #000000;
              margin-bottom: 20px;
              background-color: #ffffff !important;
            }
            .dr-signature-table thead tr {
              background-color: #ffffff !important;
            }
            .dr-signature-table th {
              background-color: #ffffff !important;
              color: #000000 !important;
              border: 1px solid #000000;
              padding: 6px 10px;
              font-weight: 800;
              font-size: 13px;
              text-align: center;
              width: 50%;
            }
            .dr-signature-table td {
              background-color: #ffffff !important;
              color: #000000 !important;
              border: 1px solid #000000;
              height: 120px;
              vertical-align: bottom;
              padding: 8px;
            }
            .dr-footer-date {
              text-align: center;
              font-size: 13px;
              font-weight: 800;
              letter-spacing: 6px;
              margin-top: 14px;
              color: #000000 !important;
            }
          </style>
        </head>
        <body>
          ${sheetRef.current.innerHTML}
        </body>
        </html>
      `);
      doc.close();

      setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setIsPrinting(false);
      }, 500);

    } catch (err) {
      console.error('Print error:', err);
      window.print();
      setIsPrinting(false);
    }
  };

  // 📥 高清晰匯出下載 (html2canvas)
  const handleDownload = async () => {
    if (!sheetRef.current) return;
    setIsDownloading(true);

    try {
      // 暫時收合編輯框樣式以截圖
      const canvas = await html2canvas(sheetRef.current, {
        scale: 2.5,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false
      });

      const imgData = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      const filename = `交貨簽收單_${customerName || '客戶'}_${dnData?.request_no || 'DN'}.png`;
      link.href = imgData;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    } catch (err) {
      console.error('Download error:', err);
      alert('匯出圖檔失敗：' + err.message);
    } finally {
      setIsDownloading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="delivery-receipt-modal-overlay">
      <div className="delivery-receipt-modal-container">
        
        {/* 頂部操作工具列 */}
        <div className="dr-toolbar">
          <div className="dr-toolbar-group">
            <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-muted)' }}>公司範本：</span>
            <select 
              value={selectedPreset} 
              onChange={(e) => handlePresetChange(e.target.value)}
              className="dr-select"
            >
              {Object.values(presetsMap).map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>

            <button
              onClick={() => setIsPresetModalOpen(true)}
              className="dr-btn dr-btn-secondary"
              title="管理與新增自訂公司範本"
              style={{ padding: '6px 8px' }}
            >
              <Settings size={13} /> 管理範本
            </button>

            <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-muted)' }}>頁首版型：</span>
            <select 
              value={headerLayout} 
              onChange={(e) => setHeaderLayout(e.target.value)}
              className="dr-select"
              title="自訂頁首 LOGO 與公司文字排列方式"
            >
              <option value="STANDARD">標準商務 (Logo左 / 文字右)</option>
              <option value="LEFT_COMPACT">左側並列 (Logo左 / 文字左)</option>
              <option value="CENTER_ROW">品牌置中 (Logo左 / 文字右)</option>
              <option value="CENTERED">品牌置中 (Logo中 / 文字中 - 上下)</option>
              <option value="REVERSE">現代反向 (Logo右 / 文字左)</option>
            </select>

            <button 
              onClick={() => fileInputRef.current?.click()}
              className="dr-btn dr-btn-secondary"
              title="更換單據 Logo 圖檔"
            >
              <ImageIcon size={14} /> 更換 Logo
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleLogoUpload} 
              accept="image/*" 
              style={{ display: 'none' }} 
            />
          </div>

          <div className="dr-toolbar-group">
            <button 
              onClick={() => setIsEditMode(!isEditMode)} 
              className={`dr-btn ${isEditMode ? 'dr-btn-success' : 'dr-btn-secondary'}`}
            >
              {isEditMode ? <Check size={14} /> : <Edit3 size={14} />}
              {isEditMode ? '完成編輯' : '編輯內容'}
            </button>

            <button 
              onClick={handlePrint} 
              disabled={isPrinting}
              className="dr-btn dr-btn-primary"
            >
              {isPrinting ? <Loader2 size={14} className="spinner" /> : <Printer size={14} />}
              列印單據
            </button>

            <button 
              onClick={handleDownload} 
              disabled={isDownloading}
              className="dr-btn dr-btn-success"
            >
              {isDownloading ? <Loader2 size={14} className="spinner" /> : <Download size={14} />}
              下載圖檔
            </button>

            <button 
              onClick={onClose} 
              className="dr-btn dr-btn-secondary"
              style={{ padding: '6px' }}
              title="關閉預覽"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* A4 單據本體 (可即時編輯與列印) */}
        <div className="delivery-receipt-sheet" ref={sheetRef}>
          
          {/* 頁首：Logo 與公司名稱 (依頁首版型動態排列) */}
          <div className={`dr-header layout-${headerLayout}`}>
            {currentLogo && <img src={currentLogo} alt="Logo" className="dr-logo-img" />}
            <div className="dr-company-title">
              {isEditMode ? (
                <textarea 
                  rows={2}
                  value={headerRightText} 
                  onChange={(e) => setHeaderRightText(e.target.value)} 
                  className="dr-meta-input"
                  style={{ 
                    fontSize: '15px', 
                    fontWeight: 900, 
                    textAlign: getHeaderTextAlign(), 
                    width: '340px', 
                    lineHeight: '1.4',
                    border: '1px dashed #3b82f6', 
                    backgroundColor: '#eff6ff', 
                    color: '#1e3a8a', 
                    padding: '4px 8px', 
                    borderRadius: '4px', 
                    resize: 'none', 
                    fontFamily: 'inherit' 
                  }} 
                />
              ) : (
                <div style={{ 
                  whiteSpace: 'pre-line', 
                  textAlign: getHeaderTextAlign(), 
                  fontWeight: 900, 
                  fontSize: '16px', 
                  lineHeight: '1.4', 
                  color: '#000000', 
                  letterSpacing: '1px' 
                }}>
                  {headerRightText}
                </div>
              )}
            </div>
          </div>

          {/* 單據主標題 */}
          <div className="dr-main-title">交 貨 簽 收 單</div>

          {/* 案名與客戶資訊 */}
          <div className="dr-meta-section">
            <div className="dr-meta-row">
              <span className="dr-meta-label">客戶名稱：</span>
              {isEditMode ? (
                <input 
                  type="text" 
                  value={customerName} 
                  onChange={(e) => setCustomerName(e.target.value)} 
                  className="dr-meta-input" 
                />
              ) : (
                <span className="dr-meta-value">{customerName || '--'}</span>
              )}
            </div>
            <div className="dr-meta-row">
              <span className="dr-meta-label">案　　名：</span>
              {isEditMode ? (
                <input 
                  type="text" 
                  value={projectName} 
                  onChange={(e) => setProjectName(e.target.value)} 
                  className="dr-meta-input" 
                />
              ) : (
                <span className="dr-meta-value">{projectName || '--'}</span>
              )}
            </div>
            <div className="dr-meta-row">
              <span className="dr-meta-label">交付品項：</span>
            </div>
          </div>

          {/* 主明細表格 */}
          <table className="dr-table">
            <thead>
              <tr>
                <th style={{ width: '45px' }} rowSpan={2}>項次</th>
                <th style={{ width: '230px' }} rowSpan={2}>設備</th>
                <th style={{ width: '200px' }} rowSpan={2}>序號</th>
                <th colSpan={2} style={{ width: '220px' }}>維護期間</th>
                {isEditMode && <th style={{ width: '50px' }} rowSpan={2}>操作</th>}
              </tr>
              <tr>
                <th style={{ width: '110px' }}>起始日</th>
                <th style={{ width: '110px' }}>到期日</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, rIdx) => {
                const snCount = row.sns && row.sns.length > 0 ? row.sns.length : 1;

                if (isEditMode) {
                  return (
                    <tr key={row.id || rIdx}>
                      <td style={{ textAlign: 'center', fontWeight: 700 }}>{row.index}</td>
                      <td>
                        <input 
                          type="text" 
                          value={row.deviceName || ''} 
                          onChange={(e) => handleRowChange(rIdx, 'deviceName', e.target.value)}
                          placeholder="例如 Cisco (N3K-C3548P-XL)"
                          className="dr-table-input" 
                        />
                      </td>
                      <td>
                        <textarea 
                          value={(row.sns || []).join('\n')} 
                          onChange={(e) => handleRowChange(rIdx, 'snsText', e.target.value)}
                          placeholder="多組序號請換行輸入"
                          className="dr-table-textarea"
                        />
                      </td>
                      <td>
                        <input 
                          type="text" 
                          value={row.startDate || ''} 
                          onChange={(e) => handleRowChange(rIdx, 'startDate', e.target.value)}
                          placeholder="DD/MM/YYYY"
                          className="dr-table-input"
                          style={{ textAlign: 'center' }} 
                        />
                      </td>
                      <td>
                        <input 
                          type="text" 
                          value={row.endDate || ''} 
                          onChange={(e) => handleRowChange(rIdx, 'endDate', e.target.value)}
                          placeholder="DD/MM/YYYY"
                          className="dr-table-input"
                          style={{ textAlign: 'center' }} 
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button 
                          onClick={() => handleDeleteRow(rIdx)}
                          className="dr-btn dr-btn-danger"
                          style={{ padding: '4px 6px' }}
                          title="刪除此項"
                        >
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                }

                // 檢視 / 列印模式 (支援同品項多序號分行結構)
                return row.sns.map((sn, sIdx) => (
                  <tr key={`${row.id}_${sIdx}`}>
                    {sIdx === 0 && (
                      <td 
                        rowSpan={snCount} 
                        style={{ textAlign: 'center', fontWeight: 700 }}
                      >
                        {row.deviceName || sn ? row.index : ''}
                      </td>
                    )}
                    {sIdx === 0 && (
                      <td 
                        rowSpan={snCount} 
                        style={{ textAlign: 'center', fontWeight: 700 }}
                      >
                        {row.deviceName || ''}
                      </td>
                    )}
                    <td style={{ textAlign: 'center', fontFamily: 'monospace, sans-serif', fontSize: '12px' }}>
                      {sn || ''}
                    </td>
                    {sIdx === 0 && (
                      <td 
                        rowSpan={snCount} 
                        style={{ textAlign: 'center', fontSize: '12px' }}
                      >
                        {row.startDate || ''}
                      </td>
                    )}
                    {sIdx === 0 && (
                      <td 
                        rowSpan={snCount} 
                        style={{ textAlign: 'center', fontSize: '12px' }}
                      >
                        {row.endDate || ''}
                      </td>
                    )}
                  </tr>
                ));
              })}
            </tbody>
          </table>

          {/* 編輯模式下的新增品項按鈕 */}
          {isEditMode && (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
              <button 
                onClick={handleAddRow}
                className="dr-btn dr-btn-secondary"
                style={{ borderStyle: 'dashed' }}
              >
                <Plus size={14} /> 新增品項明細
              </button>
            </div>
          )}

          {/* 惠請確認後簽名提示列 (可編輯) */}
          <div className="dr-confirm-note">
            {isEditMode ? (
              <input 
                type="text" 
                value={confirmText} 
                onChange={(e) => setConfirmText(e.target.value)} 
                className="dr-confirm-input"
              />
            ) : (
              <div>{confirmText}</div>
            )}
          </div>

          {/* 簽名印鑑區塊 (左側公司，右側客戶) */}
          <table className="dr-signature-table" style={{ backgroundColor: '#ffffff', color: '#000000', border: '1.5px solid #000000' }}>
            <thead style={{ backgroundColor: '#ffffff' }}>
              <tr style={{ backgroundColor: '#ffffff' }}>
                <th style={{ backgroundColor: '#ffffff', color: '#000000', border: '1px solid #000000' }}>
                  {isEditMode ? (
                    <input 
                      type="text" 
                      value={companySignName} 
                      onChange={(e) => setCompanySignName(e.target.value)} 
                      className="dr-table-input"
                      style={{ textAlign: 'center', fontWeight: 800 }}
                    />
                  ) : (
                    companySignName
                  )}
                </th>
                <th style={{ backgroundColor: '#ffffff', color: '#000000', border: '1px solid #000000' }}>
                  {isEditMode ? (
                    <input 
                      type="text" 
                      value={customerName} 
                      onChange={(e) => setCustomerName(e.target.value)} 
                      className="dr-table-input"
                      style={{ textAlign: 'center', fontWeight: 800 }}
                    />
                  ) : (
                    customerName || '客戶公司'
                  )}
                </th>
              </tr>
            </thead>
            <tbody style={{ backgroundColor: '#ffffff' }}>
              <tr style={{ backgroundColor: '#ffffff' }}>
                <td style={{ backgroundColor: '#ffffff', color: '#000000', border: '1px solid #000000' }}></td>
                <td style={{ backgroundColor: '#ffffff', color: '#000000', border: '1px solid #000000' }}></td>
              </tr>
            </tbody>
          </table>

          {/* 頁尾民國年日期列 */}
          <div className="dr-footer-date">
            {isEditMode ? (
              <div className="dr-date-input-group">
                <span>中 華 民 國</span>
                <input 
                  type="text" 
                  value={dateYear} 
                  onChange={(e) => setDateYear(e.target.value)} 
                  className="dr-date-input" 
                />
                <span>年</span>
                <input 
                  type="text" 
                  value={dateMonth} 
                  onChange={(e) => setDateMonth(e.target.value)} 
                  className="dr-date-input" 
                />
                <span>月</span>
                <input 
                  type="text" 
                  value={dateDay} 
                  onChange={(e) => setDateDay(e.target.value)} 
                  className="dr-date-input" 
                />
                <span>日</span>
              </div>
            ) : (
              <span>
                中 華 民 國 &nbsp; {dateYear} &nbsp; 年 &nbsp; {dateMonth} &nbsp; 月 &nbsp; {dateDay} &nbsp; 日
              </span>
            )}
          </div>

        </div>

      </div>

      {/* 公司範本自訂管理彈窗 */}
      <CompanyPresetModal
        isOpen={isPresetModalOpen}
        onClose={() => setIsPresetModalOpen(false)}
        onPresetsUpdated={handlePresetsUpdated}
      />
    </div>
  );
};

export default DeliveryReceiptPrintModal;
