import React, { useState, useEffect, useRef } from 'react';
import { Printer, Download, X, Edit3, Check, RefreshCw, Building, Image as ImageIcon, FileText, Loader2, Settings } from 'lucide-react';
import html2canvas from 'html2canvas';
import { getCompanyPresets, DEFAULT_BUILTIN_PRESETS } from '../utils/companyPresets';
import CompanyPresetModal from './CompanyPresetModal';
import logoImg from '../assets/logo.png';
import './LentOrderPrintModal.css';

const DEFAULT_TERMS = [
  '貨品借貨人及其公司須對於 MEtech 所出借之貨品具保管責任，並應將貨品完整歸還。如有毀損、被拆解或遺失，請立即與 MEtech 聯絡，其相關費用需由原申請借用公司負責賠償。',
  '一般狀況下，借貨期間最長為一週，如有特殊需求需延長期限，須事先告知並取得 MEtech 同意。',
  '收到此借貨單後，借貨申請人請立即簽名回傳至 contact@metechglobal.com.au。',
  '借貨人及收貨人務必蓋公司章，不接受收發章，以確保是該公司員工所填的申請單，謝謝!!'
];

const DEFAULT_FOOTER_WARNINGS = [
  '※ 借貨期間，如有任何毀損、被拆解或遺失，其相關費用須由原申請借用公司負責賠償【賠償金額以產品定價計算】。',
  '※ 測試機僅限測試使用，嚴禁將測試機銷售於任何第三者。若將 Demo 機販售於任何第三者，則本公司將以本公司販售之定價收取賠償金，不接受以同款商品歸還。'
];

const formatDateDot = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr).replace(/-/g, '.');
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
};

const LentOrderPrintModal = ({ isOpen, onClose, dnData, items = [] }) => {
  const [isEditMode, setIsEditMode] = useState(false);
  const [presetsMap, setPresetsMap] = useState(() => getCompanyPresets());
  const [selectedPreset, setSelectedPreset] = useState('PRESET_A');
  const [isPresetModalOpen, setIsPresetModalOpen] = useState(false);
  const [headerLayout, setHeaderLayout] = useState('STANDARD'); // 'STANDARD' | 'LEFT_COMPACT' | 'CENTER_ROW' | 'CENTERED' | 'REVERSE'

  // 表頭與經銷商資訊
  const [currentLogo, setCurrentLogo] = useState(() => getCompanyPresets().PRESET_A?.logo || logoImg);
  const [headerRightText, setHeaderRightText] = useState(() => getCompanyPresets().PRESET_A?.headerRight || '');

  const getHeaderTextAlign = () => {
    if (headerLayout === 'LEFT_COMPACT' || headerLayout === 'REVERSE' || headerLayout === 'CENTER_ROW') return 'left';
    if (headerLayout === 'CENTERED') return 'center';
    return 'right';
  };
  const [dealerName, setDealerName] = useState(() => getCompanyPresets().PRESET_A?.dealerName || '');
  const [dealerSales, setDealerSales] = useState(() => getCompanyPresets().PRESET_A?.dealerSales || '');
  const [dealerPhone, setDealerPhone] = useState(() => getCompanyPresets().PRESET_A?.dealerPhone || '');
  const [dealerAddress, setDealerAddress] = useState(() => getCompanyPresets().PRESET_A?.dealerAddress || '');

  // 客戶申請資訊
  const [applyCompany, setApplyCompany] = useState('');
  const [applyDate, setApplyDate] = useState('');
  const [custCompany, setCustCompany] = useState('');
  const [custPerson, setCustPerson] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custAddress, setCustAddress] = useState('');

  // 明細表格
  const [tableRows, setTableRows] = useState([]);

  // 注意事項與頁尾警語
  const [termsList, setTermsList] = useState(DEFAULT_TERMS);
  const [footerWarnings, setFooterWarnings] = useState(DEFAULT_FOOTER_WARNINGS);

  // 狀態管理
  const [isPrinting, setIsPrinting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const fileInputRef = useRef(null);

  // 初始化與資料載入
  useEffect(() => {
    if (!isOpen || !dnData) return;

    // 1. 設定申請公司與經銷商業務
    const companyName = dnData.customer || '';
    setApplyCompany(companyName);
    setCustCompany(companyName);
    setApplyDate(formatDateDot(dnData.shipping_date) || formatDateDot(new Date()));
    if (dnData.creator_name) {
      setDealerSales(dnData.creator_name);
    }

    // 2. 聯絡人、電話、地址剖析
    let parsedContact = '';
    let parsedPhone = '';
    if (dnData.contact_info) {
      // 支援 "David (0918-xxx)" 或 "David 0918-xxx" 格式
      const parts = dnData.contact_info.split(/[\(\)\/\-–]/).map(s => s.trim()).filter(Boolean);
      if (parts.length >= 2) {
        parsedContact = parts[0];
        parsedPhone = parts.slice(1).join('-');
      } else {
        parsedContact = dnData.contact_info;
      }
    }
    setCustPerson(parsedContact);
    setCustPhone(parsedPhone);
    setCustAddress(dnData.location || '');

    // 3. 嘗試由資料庫查詢該客戶最新完整主檔補足聯絡人與地址
    if (window.electronAPI && window.electronAPI.namedQuery) {
      window.electronAPI.namedQuery('fetchCustomers')
        .then(res => {
          if (res.success && res.rows) {
            const matched = res.rows.find(c => c.name === companyName);
            if (matched) {
              if (matched.contact_person) setCustPerson(matched.contact_person);
              if (matched.phone) setCustPhone(matched.phone);
              if (matched.address) setCustAddress(matched.address);
            }
          }
        })
        .catch(err => console.error('Load customer details error:', err));
    }

    // 4. 明細列處理
    const shippingDateStr = formatDateDot(dnData.shipping_date);
    const returnDateStr = formatDateDot(dnData.expected_return_date);

    const formattedItems = (items || []).map(item => {
      const modelText = [item.brand, item.model].filter(Boolean).join(' ') || item.model || '';
      return {
        model: modelText,
        sn: item.sn || '--',
        purpose: item.purpose || '運作測試',
        loanDate: shippingDateStr,
        returnDate: returnDateStr,
        remarks: item.specification || ''
      };
    });

    // 至少補足至 5 列以維持 A4 排版標準
    const rows = [...formattedItems];
    while (rows.length < 5) {
      rows.push({
        model: '',
        sn: '',
        purpose: '',
        loanDate: '',
        returnDate: '',
        remarks: ''
      });
    }
    setTableRows(rows);

  }, [isOpen, dnData, items]);

  // 監聽 Modal 開啟載入最新自訂範本
  useEffect(() => {
    if (!isOpen) return;
    const allPresets = getCompanyPresets();
    setPresetsMap(allPresets);
    if (!allPresets[selectedPreset]) {
      setSelectedPreset('PRESET_A');
      const fallback = allPresets.PRESET_A || Object.values(allPresets)[0];
      if (fallback) {
        setCurrentLogo(fallback.logo);
        setHeaderRightText(fallback.headerRight);
        setDealerName(fallback.dealerName);
        setDealerSales(dnData?.creator_name || fallback.dealerSales);
        setDealerPhone(fallback.dealerPhone);
        setDealerAddress(fallback.dealerAddress);
      }
    }
  }, [isOpen]);

  // 切換公司範本
  const handlePresetChange = (presetKey) => {
    setSelectedPreset(presetKey);
    const preset = presetsMap[presetKey];
    if (preset) {
      setCurrentLogo(preset.logo);
      setHeaderRightText(preset.headerRight);
      setDealerName(preset.dealerName);
      setDealerSales(dnData?.creator_name || preset.dealerSales);
      setDealerPhone(preset.dealerPhone);
      setDealerAddress(preset.dealerAddress);
    }
  };

  // 當範本管理彈窗新增/編輯/刪除完成時回調
  const handlePresetsUpdated = (newActiveId) => {
    const allPresets = getCompanyPresets();
    setPresetsMap(allPresets);
    const targetId = newActiveId && allPresets[newActiveId] ? newActiveId : (allPresets[selectedPreset] ? selectedPreset : 'PRESET_A');
    setSelectedPreset(targetId);
    const activePreset = allPresets[targetId];
    if (activePreset) {
      setCurrentLogo(activePreset.logo);
      setHeaderRightText(activePreset.headerRight);
      setDealerName(activePreset.dealerName);
      setDealerSales(dnData?.creator_name || activePreset.dealerSales);
      setDealerPhone(activePreset.dealerPhone);
      setDealerAddress(activePreset.dealerAddress);
    }
  };

  // 自訂上傳 Logo
  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (uploadEvent) => {
        setCurrentLogo(uploadEvent.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // 🖨️ 列印單據 (使用獨立沙盒 Iframe 列印，確保零上方空白、100% 精準 A4 單頁)
  const handlePrint = () => {
    const printElement = document.getElementById('lent-order-printable-sheet');
    if (!printElement) {
      window.print();
      return;
    }

    setIsPrinting(true);

    // 建立隱藏的專屬列印 iframe
    const iframe = document.createElement('iframe');
    iframe.id = 'lent-print-sandbox-iframe';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.zIndex = '-9999';
    document.body.appendChild(iframe);

    // 收集現有頁面的所有 style 與 link 樣式
    let stylesHtml = '';
    document.querySelectorAll('style, link[rel="stylesheet"]').forEach(el => {
      stylesHtml += el.outerHTML;
    });

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html lang="zh-TW">
        <head>
          <title>借貨申請單_${custCompany || applyCompany || '客戶'}</title>
          <meta charset="utf-8" />
          ${stylesHtml}
          <style>
            @page {
              size: A4 portrait;
              margin: 0;
            }
            *, *::before, *::after {
              box-sizing: border-box !important;
            }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
              color: #000000 !important;
              width: 210mm !important;
              height: auto !important;
              font-family: "PingFang TC", "Microsoft JhengHei", "Heiti TC", sans-serif !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            #lent-order-printable-sheet {
              width: 210mm !important;
              min-height: 297mm !important;
              max-height: 297mm !important;
              padding: 8mm 12mm 8mm 12mm !important;
              margin: 0 auto !important;
              box-shadow: none !important;
              border: none !important;
              background: #ffffff !important;
              color: #000000 !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              page-break-after: avoid !important;
              break-after: avoid !important;
              display: flex !important;
              flex-direction: column !important;
              justify-content: space-between !important;
            }
            .loan-edit-input, .loan-edit-textarea {
              border: none !important;
              background: transparent !important;
              padding: 0 !important;
            }
            .loan-toolbar, .loan-modal-overlay {
              display: none !important;
            }
          </style>
        </head>
        <body>
          ${printElement.outerHTML}
        </body>
      </html>
    `);
    doc.close();

    // 等待 iframe 內容與圖片就緒後觸發列印
    setTimeout(() => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (err) {
        console.error('Iframe print error, fallback to window.print():', err);
        window.print();
      } finally {
        setIsPrinting(false);
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 3000);
      }
    }, 400);
  };

  // 📥 下載單據圖檔 (PNG)
  const handleDownload = async () => {
    const printElement = document.getElementById('lent-order-printable-sheet');
    if (!printElement) {
      alert('無法取得借貨單節點，請重試。');
      return;
    }

    setIsDownloading(true);
    try {
      const canvas = await html2canvas(printElement, {
        scale: 2, // 2x Retina 高解析度
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false
      });

      const imgData = canvas.toDataURL('image/png');
      const safeCompany = (custCompany || applyCompany || '借貨公司').replace(/[/\\?%*:|"<>]/g, '_');
      const safeNo = (dnData?.request_no || 'DN').replace(/[/\\?%*:|"<>]/g, '_');
      const fileName = `借貨申請單_${safeCompany}_${safeNo}.png`;

      const link = document.createElement('a');
      link.href = imgData;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Download error:', err);
      alert('下載單據圖檔時發生錯誤：' + err.message);
    } finally {
      setIsDownloading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="loan-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="loan-modal-container">
        
        {/* 頂部操作與自訂工具列 */}
        <div className="loan-toolbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '14px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FileText size={18} color="#60a5fa" /> 借貨申請單預覽
            </span>

            {/* 公司版本選擇 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Building size={16} color="var(--text-muted)" />
              <select
                value={selectedPreset}
                onChange={(e) => handlePresetChange(e.target.value)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-surface-subtle)',
                  color: 'var(--text-main)',
                  fontSize: '12px',
                  fontWeight: '700',
                  outline: 'none'
                }}
              >
                {Object.values(presetsMap).map(p => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>

              <button
                onClick={() => setIsPresetModalOpen(true)}
                className="loan-toolbar-btn loan-btn-secondary"
                title="管理與新增自訂公司範本"
                style={{ padding: '6px 8px' }}
              >
                <Settings size={13} /> 管理範本
              </button>
            </div>

            {/* 頁首版型切換 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-muted)' }}>頁首版型:</span>
              <select
                value={headerLayout}
                onChange={(e) => setHeaderLayout(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-surface-subtle)',
                  color: 'var(--text-main)',
                  fontSize: '12px',
                  fontWeight: '700',
                  outline: 'none'
                }}
                title="自訂頁首 LOGO 與公司文字排列方式"
              >
                <option value="STANDARD">標準商務 (Logo左 / 文字右)</option>
                <option value="LEFT_COMPACT">左側並列 (Logo左 / 文字左)</option>
                <option value="CENTER_ROW">品牌置中 (Logo左 / 文字右)</option>
                <option value="CENTERED">品牌置中 (Logo中 / 文字中 - 上下)</option>
                <option value="REVERSE">現代反向 (Logo右 / 文字左)</option>
              </select>
            </div>

            {/* 更換 LOGO 按鈕 */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="loan-toolbar-btn loan-btn-secondary"
              title="上傳並更換左上角 LOGO 圖片"
            >
              <ImageIcon size={15} /> 更換 LOGO
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleLogoUpload}
              accept="image/*"
              style={{ display: 'none' }}
            />

            {/* 編輯開關 */}
            <button
              onClick={() => setIsEditMode(!isEditMode)}
              className={`loan-toolbar-btn ${isEditMode ? 'loan-btn-primary' : 'loan-btn-secondary'}`}
            >
              {isEditMode ? <Check size={15} /> : <Edit3 size={15} />}
              {isEditMode ? '完成並鎖定編輯' : '✏️ 進入即時編輯模式'}
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={handlePrint}
              disabled={isPrinting}
              className="loan-toolbar-btn loan-btn-primary"
              title="啟動印表機列印，或在列印視窗中選擇另存為 PDF"
            >
              {isPrinting ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
              {isPrinting ? '準備列印中...' : '🖨️ 列印單據'}
            </button>
            <button
              onClick={handleDownload}
              disabled={isDownloading}
              className="loan-toolbar-btn loan-btn-download"
              title="下載高解析度借貨申請單圖檔 (PNG)"
            >
              {isDownloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              {isDownloading ? '下載生成中...' : '📥 下載圖檔'}
            </button>
            <button
              onClick={onClose}
              className="loan-toolbar-btn loan-btn-secondary"
            >
              <X size={16} /> 關閉
            </button>
          </div>
        </div>

        {/* A4 列印與預覽主紙張 */}
        <div className="loan-a4-preview-wrapper">
          <div className="loan-a4-sheet" id="lent-order-printable-sheet">
            
            {/* 1. 表頭 (Logo + 公司資訊，依頁首版型動態排列) */}
            <div className={`loan-header-top layout-${headerLayout}`}>
              <div className="loan-header-logo">
                <img src={currentLogo} alt="Company Logo" />
              </div>
              <div className="loan-header-info-right">
                {isEditMode ? (
                  <textarea
                    rows={4}
                    value={headerRightText}
                    onChange={(e) => setHeaderRightText(e.target.value)}
                    className="loan-edit-textarea"
                    style={{ textAlign: getHeaderTextAlign(), width: '320px' }}
                  />
                ) : (
                  <div style={{ whiteSpace: 'pre-line', textAlign: getHeaderTextAlign() }}>
                    {headerRightText}
                  </div>
                )}
              </div>
            </div>

            {/* 2. 標題 */}
            <div className="loan-title-wrapper">
              <h1 className="loan-main-title">借 貨 申 請 單</h1>
            </div>

            {/* 3. 頂部申請資訊表格 */}
            <table className="loan-info-table loan-top-meta-table">
              <tbody>
                <tr>
                  <th className="loan-label-cell" style={{ width: '120px' }}>借貸申請公司</th>
                  <td className="loan-value-cell">
                    {isEditMode ? (
                      <input
                        type="text"
                        value={applyCompany}
                        onChange={(e) => setApplyCompany(e.target.value)}
                        className="loan-edit-input"
                        style={{ fontWeight: '800' }}
                      />
                    ) : (
                      <span style={{ fontWeight: '700' }}>{applyCompany || '--'}</span>
                    )}
                  </td>
                </tr>
                <tr>
                  <th className="loan-label-cell" style={{ width: '120px' }}>申請日期</th>
                  <td className="loan-value-cell">
                    {isEditMode ? (
                      <input
                        type="text"
                        value={applyDate}
                        onChange={(e) => setApplyDate(e.target.value)}
                        className="loan-edit-input"
                      />
                    ) : (
                      <span>{applyDate || '--'}</span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* 4. 經銷商 (每項內容一行) */}
            <div className="loan-section-block">
              <div className="loan-section-header-title">經銷商</div>
              <table className="loan-info-table">
                <tbody>
                  <tr>
                    <th className="loan-label-cell" style={{ width: '120px' }}>公司名稱</th>
                    <td className="loan-value-cell">
                      {isEditMode ? (
                        <input type="text" value={dealerName} onChange={(e) => setDealerName(e.target.value)} className="loan-edit-input" />
                      ) : dealerName}
                    </td>
                  </tr>
                  <tr>
                    <th className="loan-label-cell">業　　務</th>
                    <td className="loan-value-cell">
                      {isEditMode ? (
                        <input type="text" value={dealerSales} onChange={(e) => setDealerSales(e.target.value)} className="loan-edit-input" />
                      ) : dealerSales}
                    </td>
                  </tr>
                  <tr>
                    <th className="loan-label-cell">電　　話</th>
                    <td className="loan-value-cell">
                      {isEditMode ? (
                        <input type="text" value={dealerPhone} onChange={(e) => setDealerPhone(e.target.value)} className="loan-edit-input" />
                      ) : dealerPhone}
                    </td>
                  </tr>
                  <tr>
                    <th className="loan-label-cell">地　　址</th>
                    <td className="loan-value-cell">
                      {isEditMode ? (
                        <input type="text" value={dealerAddress} onChange={(e) => setDealerAddress(e.target.value)} className="loan-edit-input" />
                      ) : dealerAddress}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 5. 客戶 (每項內容一行) */}
            <div className="loan-section-block">
              <div className="loan-section-header-title">客戶</div>
              <table className="loan-info-table">
                <tbody>
                  <tr>
                    <th className="loan-label-cell" style={{ width: '120px' }}>公司名稱</th>
                    <td className="loan-value-cell" style={{ fontWeight: '700' }}>
                      {isEditMode ? (
                        <input type="text" value={custCompany} onChange={(e) => setCustCompany(e.target.value)} className="loan-edit-input" />
                      ) : (custCompany || '--')}
                    </td>
                  </tr>
                  <tr>
                    <th className="loan-label-cell">借 貸 人</th>
                    <td className="loan-value-cell">
                      {isEditMode ? (
                        <input type="text" value={custPerson} onChange={(e) => setCustPerson(e.target.value)} className="loan-edit-input" />
                      ) : (custPerson || '--')}
                    </td>
                  </tr>
                  <tr>
                    <th className="loan-label-cell">電　　話</th>
                    <td className="loan-value-cell">
                      {isEditMode ? (
                        <input type="text" value={custPhone} onChange={(e) => setCustPhone(e.target.value)} className="loan-edit-input" />
                      ) : (custPhone || '--')}
                    </td>
                  </tr>
                  <tr>
                    <th className="loan-label-cell">地　　址</th>
                    <td className="loan-value-cell">
                      {isEditMode ? (
                        <input type="text" value={custAddress} onChange={(e) => setCustAddress(e.target.value)} className="loan-edit-input" />
                      ) : (custAddress || '--')}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 6. 設備型號明細表格 */}
            <table className="loan-items-table">
              <thead>
                <tr>
                  <th style={{ width: '22%' }}>型　號</th>
                  <th style={{ width: '22%' }}>序　號</th>
                  <th style={{ width: '14%' }}>用　途</th>
                  <th style={{ width: '14%' }}>借貨日</th>
                  <th style={{ width: '14%' }}>歸還日</th>
                  <th style={{ width: '14%' }}>備　註</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, index) => (
                  <tr key={index}>
                    <td>
                      {isEditMode ? (
                        <input
                          type="text"
                          value={row.model}
                          onChange={(e) => {
                            const newRows = [...tableRows];
                            newRows[index].model = e.target.value;
                            setTableRows(newRows);
                          }}
                          className="loan-edit-input"
                        />
                      ) : (row.model || '')}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {isEditMode ? (
                        <input
                          type="text"
                          value={row.sn}
                          onChange={(e) => {
                            const newRows = [...tableRows];
                            newRows[index].sn = e.target.value;
                            setTableRows(newRows);
                          }}
                          className="loan-edit-input"
                          style={{ textAlign: 'center' }}
                        />
                      ) : (row.sn || '')}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {isEditMode ? (
                        <input
                          type="text"
                          value={row.purpose}
                          onChange={(e) => {
                            const newRows = [...tableRows];
                            newRows[index].purpose = e.target.value;
                            setTableRows(newRows);
                          }}
                          className="loan-edit-input"
                          style={{ textAlign: 'center' }}
                        />
                      ) : (row.purpose || '')}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {isEditMode ? (
                        <input
                          type="text"
                          value={row.loanDate}
                          onChange={(e) => {
                            const newRows = [...tableRows];
                            newRows[index].loanDate = e.target.value;
                            setTableRows(newRows);
                          }}
                          className="loan-edit-input"
                          style={{ textAlign: 'center' }}
                        />
                      ) : (row.loanDate || '')}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {isEditMode ? (
                        <input
                          type="text"
                          value={row.returnDate}
                          onChange={(e) => {
                            const newRows = [...tableRows];
                            newRows[index].returnDate = e.target.value;
                            setTableRows(newRows);
                          }}
                          className="loan-edit-input"
                          style={{ textAlign: 'center' }}
                        />
                      ) : (row.returnDate || '')}
                    </td>
                    <td>
                      {isEditMode ? (
                        <input
                          type="text"
                          value={row.remarks}
                          onChange={(e) => {
                            const newRows = [...tableRows];
                            newRows[index].remarks = e.target.value;
                            setTableRows(newRows);
                          }}
                          className="loan-edit-input"
                        />
                      ) : (row.remarks || '')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* 7. 注意事項 */}
            <div className="loan-notice-box">
              <div className="loan-notice-title">*注意事項：</div>
              <ol className="loan-notice-list">
                {termsList.map((term, tIndex) => (
                  <li key={tIndex}>
                    {isEditMode ? (
                      <textarea
                        rows={2}
                        value={term}
                        onChange={(e) => {
                          const newTerms = [...termsList];
                          newTerms[tIndex] = e.target.value;
                          setTermsList(newTerms);
                        }}
                        className="loan-edit-textarea"
                      />
                    ) : term}
                  </li>
                ))}
              </ol>
            </div>

            {/* 8. 三欄簽章區 (含簽名與蓋章之充足空白欄位) */}
            <table className="loan-signatures-table">
              <thead>
                <tr>
                  <th style={{ width: '34%' }}>借貨申請人簽名[日期]</th>
                  <th style={{ width: '33%' }}>
                    借貨申請人公司章<br />
                    <span className="loan-sig-subtext">( 不得為發票章或收發章 )</span>
                  </th>
                  <th style={{ width: '33%' }}>收貨人簽名[日期]</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="loan-sig-blank-cell"></td>
                  <td className="loan-sig-blank-cell"></td>
                  <td className="loan-sig-blank-cell"></td>
                </tr>
              </tbody>
            </table>

            {/* 9. 頁尾聲明警語 */}
            <div className="loan-footer-warnings">
              {footerWarnings.map((warning, wIndex) => (
                <div key={wIndex}>
                  {isEditMode ? (
                    <input
                      type="text"
                      value={warning}
                      onChange={(e) => {
                        const newWarnings = [...footerWarnings];
                        newWarnings[wIndex] = e.target.value;
                        setFooterWarnings(newWarnings);
                      }}
                      className="loan-edit-input"
                      style={{ marginBottom: '2px' }}
                    />
                  ) : warning}
                </div>
              ))}
            </div>

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

export default LentOrderPrintModal;
