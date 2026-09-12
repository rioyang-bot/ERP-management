import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { 
  X, UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle, 
  XCircle, Filter, Layers, Database, ArrowRight, RefreshCw, Info, Download, Package, Plus, Check, Edit3
} from 'lucide-react';
import { logEvent, ACTION_TYPES, MODULE_MAP } from '../utils/auditLogger';
import { parseSpreadsheetFile, fixMojibake } from '../utils/encoding';
import { normalizeMasterName } from '../utils/normalizeMasterData';

// 常見廠牌關鍵字特徵表，用於智慧推導
const KNOWN_BRANDS = [
  'Cisco/Exablaze', 'Exablaze', 'Cisco', 'Solarflare', 'SF', 'Mellanox', 'Intel', 
  'GigaIO', 'TimeBeat', 'Panduit', 'FS', 'COMMSCOPE', 'CORNING', 'LDA', 
  'AFL', '10GTek', 'FINISAR', 'ARISTA', 'Fortinet', 'Micron', 'BlackCore', 
  'ASUS', 'V-Color', 'MICROCHIP', 'Kingston', 'Samsung', 'Dell', 'HP', 'Lenovo', 'METECH'
];

/**
 * 智慧從品項字串推導 (Brand, Model, Spec)
 */
function parseItemInfo(rawName, defaultType = '') {
  const cleanName = (rawName || '').trim();
  if (!cleanName) return { brand: '', model: '', spec: cleanName };

  let brand = '';
  let model = cleanName;
  const spec = cleanName;

  // 1. 檢查結尾或內嵌括號中的廠牌，例如: "10G-SR(CISCO)" -> brand: CISCO, "DAC-40G-SR(3M) (MEtech)" -> brand: METECH
  const bracketMatches = cleanName.match(/\(([^)]+)\)/g);
  if (bracketMatches && bracketMatches.length > 0) {
    for (let i = bracketMatches.length - 1; i >= 0; i--) {
      const inside = bracketMatches[i].slice(1, -1).trim();
      const matchedKnown = KNOWN_BRANDS.find(kb => kb.toLowerCase() === inside.toLowerCase());
      if (matchedKnown) {
        brand = matchedKnown;
        break;
      }
    }
  }

  // 2. 檢查前綴廠牌，例如: "Cisco/Exablaze X10", "Intel 4 port", "SF 2522-Plus"
  if (!brand) {
    for (const kb of KNOWN_BRANDS) {
      if (cleanName.toLowerCase().startsWith(kb.toLowerCase())) {
        brand = kb;
        break;
      }
    }
  }

  // 3. 特殊縮寫修正 (例如 SF -> Solarflare)
  if (brand.toUpperCase() === 'SF') {
    brand = 'Solarflare';
  } else if (brand.toUpperCase() === 'METECH') {
    brand = 'METECH';
  }

  // 4. 若無明確廠牌，則保留為空，由匯入檢核程序檢查有無輸入廠牌
  if (!brand) {
    brand = '';
  }

  // 型號處理：如果型號開頭包含廠牌前綴，提取主體型號
  if (brand && cleanName.toLowerCase().startsWith(brand.toLowerCase()) && cleanName.length > brand.length) {
    model = cleanName.slice(brand.length).trim().replace(/^[-_\s/]+/, '');
  }
  if (!model) {
    model = cleanName;
  }

  return { brand, model, spec };
}

/**
 * 根據 Type 給予預設計量單位
 */
function getSuggestedUnit(typeStr) {
  const t = (typeStr || '').toLowerCase();
  if (t.includes('cable') || t.includes('fiber') || t.includes('cord') || t.includes('utp') || t.includes('線')) return '條';
  if (t.includes('server') || t.includes('switch') || t.includes('主機') || t.includes('交換器')) return '台';
  if (t.includes('disk') || t.includes('ssd') || t.includes('card') || t.includes('nic') || t.includes('gbic') || t.includes('模組')) return '個';
  return '個';
}

const ConsumableBatchImportModal = ({ isOpen, onClose, onSuccess, existingTypes = [] }) => {
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  
  // 覆蓋/預設設定
  const [overrideBrand, setOverrideBrand] = useState('');
  const [overrideType, setOverrideType] = useState('');
  const [duplicateMode, setDuplicateMode] = useState('REPLACE'); // 'REPLACE' (覆蓋總數) or 'ADD' (累加庫存)

  const [rawJsonData, setRawJsonData] = useState([]);
  const [fileHeaders, setFileHeaders] = useState([]);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'valid', 'skipped', 'existing'
  const [existingItemsMap, setExistingItemsMap] = useState(new Map());
  const [importResult, setImportResult] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [editingRowIndex, setEditingRowIndex] = useState(null);
  const [customEdits, setCustomEdits] = useState({}); // rowIndex -> { brand, type, model, spec, quantity, unit }

  const fileInputRef = useRef(null);

  // 載入既有耗材品項快取 (用於比對是否存在)
  const loadInitialData = useCallback(async () => {
    try {
      const res = await window.electronAPI.namedQuery('fetchConsumablesList');
      if (res.success && res.rows) {
        const itemMap = new Map();
        res.rows.forEach(r => {
          const key = `${(r.brand || '').trim().toLowerCase()}___${(r.type || '').trim().toLowerCase()}___${(r.model || '').trim().toLowerCase()}___${(r.specification || '').trim().toLowerCase()}`;
          itemMap.set(key, r);
        });
        setExistingItemsMap(itemMap);
      }
    } catch (err) {
      console.error('Failed to load initial Consumables data:', err);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      resetState();
      return;
    }
    loadInitialData();
  }, [isOpen, loadInitialData]);

  const resetState = () => {
    setFile(null);
    setFileName('');
    setOverrideBrand('');
    setOverrideType('');
    setDuplicateMode('REPLACE');
    setRawJsonData([]);
    setFileHeaders([]);
    setIsProcessingFile(false);
    setIsImporting(false);
    setImportProgress(0);
    setActiveTab('all');
    setImportResult(null);
    setEditingRowIndex(null);
    setCustomEdits({});
  };

  // 判斷上傳檔案表頭是否有明確的廠牌欄位
  const hasBrandHeader = useMemo(() => {
    if (!fileHeaders || fileHeaders.length === 0) return true;
    return fileHeaders.some(h => {
      const lh = h.toLowerCase().replace(/[\s_\(\)\-]/g, '');
      return lh.includes('brand') || lh.includes('廠牌') || lh.includes('品牌');
    });
  }, [fileHeaders]);

  // 解析 Excel / CSV 為原始物件資料
  const handleFileProcess = async (selectedFile) => {
    if (!selectedFile) return;
    setIsProcessingFile(true);
    setFileName(selectedFile.name);
    setFile(selectedFile);
    setImportResult(null);
    setCustomEdits({});

    try {
      const rawJson = await parseSpreadsheetFile(selectedFile);

      if (!rawJson || rawJson.length === 0) {
        alert('檔案內容為空，請確認上傳之 Excel / CSV 包含耗材資料。');
        setIsProcessingFile(false);
        return;
      }

      const headers = Object.keys(rawJson[0] || {});
      setFileHeaders(headers);
      setRawJsonData(rawJson);
    } catch (err) {
      console.error('Consumable File parsing error:', err);
      alert('解析檔案失敗，請確認檔案格式是否正確：' + err.message);
    } finally {
      setIsProcessingFile(false);
    }
  };

  // 智慧解析原始資料為耗材項目
  const parsedRows = useMemo(() => {
    if (!rawJsonData || rawJsonData.length === 0) return [];

    const processed = [];
    let currentSectionType = overrideType || 'NIC';

    rawJsonData.forEach((row, index) => {
      // 排除全空行
      const entries = Object.entries(row).map(([k, v]) => [k.trim(), String(v !== undefined && v !== null ? v : '').trim()]);
      const nonEmpty = entries.filter(([k, v]) => v !== '');
      if (nonEmpty.length === 0) return;

      // 檢查標準欄位
      let brandVal = '';
      let typeVal = '';
      let modelVal = '';
      let specVal = '';
      let qtyVal = '';
      let unitVal = '';

      for (const [k, v] of entries) {
        const lk = k.toLowerCase().replace(/[\s_\(\)\-]/g, '');
        if (lk.includes('brand') || lk.includes('廠牌') || lk.includes('品牌')) brandVal = v;
        else if (!lk.includes('os') && !lk.includes('作業系統') && (lk.includes('type') || lk.includes('類型'))) typeVal = v;
        else if (lk.includes('model') || lk.includes('型號')) modelVal = v;
        else if (lk.includes('remark') || lk.includes('備註') || lk.includes('note') || lk.includes('spec') || lk.includes('規格') || lk.includes('品項') || lk.includes('名稱')) specVal = v;
        else if (lk.includes('total') || lk.includes('總數') || lk.includes('數量') || lk.includes('stock') || lk.includes('庫存')) {
          if (!qtyVal) qtyVal = v;
        } else if (lk.includes('unit') || lk.includes('單位')) unitVal = v;
      }

      // 如果是階層/分組式結構（例如第一欄為品項名稱或類型標題）
      const firstEntryKey = entries[0] ? entries[0][0] : '';
      const firstEntryVal = entries[0] ? entries[0][1] : '';

      // 檢查第二欄數量
      const secondEntryVal = entries[1] ? entries[1][1] : '';

      // 判斷是否為分類標題列 (例如 "NIC", "DAC Cable", "GBIC", "Fiber" 等，後面欄位皆為空)
      const otherValuesEmpty = entries.slice(1).every(([k, v]) => v === '' || v === '0' || isNaN(Number(v)));
      const isHeadingPattern = ['nic', 'dac cable', 'gbic', 'fiber', 'utp', 'power cord', 'server', 'switch', 'ssd disk', 'lda', 'scerect', 'raid card cable', 'other'].includes(firstEntryVal.toLowerCase()) ||
        (!qtyVal && otherValuesEmpty && firstEntryVal && !/[0-9]/.test(firstEntryVal) && firstEntryVal.length < 30);

      if (isHeadingPattern && (!qtyVal || qtyVal === '')) {
        currentSectionType = firstEntryVal || currentSectionType;
        return; // 標題列跳過，不作為物料
      }

      // 提取品項名稱與規格/備註
      const rawItemName = specVal || firstEntryVal;
      if (!rawItemName && !modelVal) return;

      const activeType = overrideType || typeVal || currentSectionType || '未分類耗材';

      // 提取數量
      let rawQty = qtyVal || secondEntryVal;
      const qtyNum = parseInt(String(rawQty).replace(/[^0-9-]/g, ''), 10);
      const quantity = isNaN(qtyNum) ? 0 : Math.max(0, qtyNum);

      // 智慧推導廠牌與型號
      const derived = parseItemInfo(rawItemName, activeType);
      const brand = (brandVal || overrideBrand || derived.brand || '').trim();
      const model = (modelVal || derived.model || '').trim();
      const spec = specVal !== undefined && specVal !== '' ? specVal : (rawItemName || '');
      const unit = unitVal || getSuggestedUnit(activeType);

      let status = 'VALID';
      let skipReason = '';

      if (!brand) {
        status = 'SKIPPED';
        skipReason = '缺少廠牌';
      } else if (!model) {
        status = 'SKIPPED';
        skipReason = '缺少型號/規格';
      }

      const matchKey = `${brand.toLowerCase()}___${activeType.toLowerCase()}___${model.toLowerCase()}___${(spec || '').toLowerCase()}`;
      const existingRecord = existingItemsMap.get(matchKey);
      const isExisting = !!existingRecord;

      processed.push({
        rowIndex: index + 2,
        brand,
        type: activeType,
        model,
        specification: spec,
        quantity,
        safetyStock: 0,
        unit,
        isExisting,
        existingStock: existingRecord ? existingRecord.stock_qty : 0,
        existingLab: existingRecord ? existingRecord.lab_qty : 0,
        status: status === 'VALID' ? (isExisting ? 'EXISTING' : 'VALID') : status,
        skipReason
      });
    });

    // 套用使用者在前端表格自訂編輯的資料
    return processed.map((item, idx) => {
      const edit = customEdits[idx];
      if (edit) {
        const brand = (edit.brand !== undefined ? edit.brand : item.brand).trim();
        const type = (edit.type !== undefined ? edit.type : item.type).trim();
        const model = (edit.model !== undefined ? edit.model : item.model).trim();
        const specification = (edit.specification !== undefined ? edit.specification : item.specification).trim();
        const quantity = edit.quantity !== undefined ? edit.quantity : item.quantity;
        const unit = edit.unit !== undefined ? edit.unit : item.unit;

        let status = 'VALID';
        let skipReason = '';

        if (!brand) {
          status = 'SKIPPED';
          skipReason = '缺少廠牌';
        } else if (!model) {
          status = 'SKIPPED';
          skipReason = '缺少型號/規格';
        }

        const matchKey = `${brand.toLowerCase()}___${type.toLowerCase()}___${model.toLowerCase()}___${specification.toLowerCase()}`;
        const existingRecord = existingItemsMap.get(matchKey);
        const isExisting = !!existingRecord;

        return {
          ...item,
          brand,
          type,
          model,
          specification,
          quantity,
          unit,
          isExisting,
          existingStock: existingRecord ? existingRecord.stock_qty : 0,
          existingLab: existingRecord ? existingRecord.lab_qty : 0,
          status: status === 'VALID' ? (isExisting ? 'EXISTING' : 'VALID') : status,
          skipReason
        };
      }
      return item;
    });
  }, [rawJsonData, overrideBrand, overrideType, existingItemsMap, customEdits]);

  // 統計數據
  const stats = useMemo(() => {
    const total = parsedRows.length;
    const validNew = parsedRows.filter(r => r.status === 'VALID').length;
    const existing = parsedRows.filter(r => r.status === 'EXISTING').length;
    const skipped = parsedRows.filter(r => r.status === 'SKIPPED').length;
    const totalQuantity = parsedRows.filter(r => r.status === 'VALID' || r.status === 'EXISTING').reduce((sum, r) => sum + (r.quantity || 0), 0);
    return { total, validNew, existing, skipped, totalQuantity };
  }, [parsedRows]);

  // Tab 篩選清單
  const displayRows = useMemo(() => {
    if (activeTab === 'valid') return parsedRows.filter(r => r.status === 'VALID');
    if (activeTab === 'existing') return parsedRows.filter(r => r.status === 'EXISTING');
    if (activeTab === 'skipped') return parsedRows.filter(r => r.status === 'SKIPPED');
    return parsedRows;
  }, [parsedRows, activeTab]);

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => { setIsDragging(false); };
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  // 下載範本 (提供標準欄位與階層分組式雙工作表)
  const handleDownloadTemplate = () => {
    // 工作表 1：標準欄位清單 (明確包含廠牌)
    const standardData = [
      ['廠牌', '類型', '型號/規格', '備註', 'Total 數量', '單位'],
      ['Cisco', '線材', 'SFP-10G-SR', '10G 光纖跳線 3M', 25, '個'],
      ['Solarflare', '網卡', 'SF 2522-Plus', 'Dual-Port 10/25GbE', 10, '個'],
      ['METECH', '模組', 'DAC-40G-SR(3M)', '40G 直連銅纜', 50, '條'],
      ['Intel', '網卡', 'X520-DA2', '10G 雙埠網卡', 8, '張'],
      ['Mellanox', '網卡', 'CX6-DX', 'ConnectX-6 Dx 100G', 4, '張']
    ];

    // 工作表 2：階層分組式範本
    const sampleData = [
      ['型號/規格 / 備註', 'Total', 'Stock', 'LAB'],
      ['NIC', '', '', ''],
      ['Cisco/Exablaze X10', 1, 1, ''],
      ['Cisco/Exablaze X25 (DDR)', 5, 4, 1],
      ['SF 2522-Plus', 2, 1, 1],
      ['Intel 4 port', 1, 1, ''],
      ['Mellanox CX6', 4, 4, ''],
      ['', '', '', ''],
      ['DAC Cable', '', '', ''],
      ['DAC-40G-SR(3M) (MEtech)', 59, 59, ''],
      ['DAC-10G (1M) (METECH)', 96, 96, ''],
      ['', '', '', ''],
      ['GBIC', '', '', ''],
      ['QSFP-40G-SR4 (METECH)', 8, 8, ''],
      ['10G-SR(CISCO)', 5, 4, 1],
      ['', '', '', ''],
      ['Fiber', '', '', ''],
      ['Panduit OM4 1M Fiber', 19, 19, ''],
      ['100G QSFP28 AOC (METECH)', 12, 10, 2]
    ];

    const wb = XLSX.utils.book_new();
    const wsStandard = XLSX.utils.aoa_to_sheet(standardData);
    const wsGrouped = XLSX.utils.aoa_to_sheet(sampleData);

    XLSX.utils.book_append_sheet(wb, wsStandard, '標準欄位範本(推薦)');
    XLSX.utils.book_append_sheet(wb, wsGrouped, '階層分組式範本');
    XLSX.writeFile(wb, '耗材批次匯入範本.xlsx');
  };

  // 執行批次寫入資料庫
  const executeImport = async () => {
    const importableItems = parsedRows.filter(r => r.status === 'VALID' || r.status === 'EXISTING');
    if (importableItems.length === 0) {
      alert('目前沒有符合匯入條件的耗材資料。');
      return;
    }

    if (!window.confirm(`確定要將 ${importableItems.length} 筆耗材資料（總計 ${stats.totalQuantity} 件庫存）匯入系統庫存嗎？`)) {
      return;
    }

    setIsImporting(true);
    setImportProgress(0);

    let successCount = 0;
    let failCount = 0;
    let createdCount = 0;
    let updatedCount = 0;
    const errors = [];

    try {
      // 1. 收集 distinct (brand, type, model) 自動補齊主檔分類
      const brandSet = new Set();
      const typeMap = new Map(); // brand -> Set of types
      const modelMap = new Map(); // `${brand}___${type}` -> Set of models

      importableItems.forEach(item => {
        if (item.brand) {
          brandSet.add(item.brand);
          if (item.type) {
            if (!typeMap.has(item.brand)) typeMap.set(item.brand, new Set());
            typeMap.get(item.brand).add(item.type);

            const key = `${item.brand}___${item.type}`;
            if (!modelMap.has(key)) modelMap.set(key, new Set());
            if (item.model) modelMap.get(key).add(item.model);
          }
        }
      });

      // 自動補齊 廠牌 (Brand)
      for (const brand of brandSet) {
        await window.electronAPI.namedQuery('insertDeviceBrand', ['耗材', normalizeMasterName(brand)]);
      }

      // 自動補齊 類型 (Type)
      for (const types of typeMap.values()) {
        for (const type of types) {
          await window.electronAPI.namedQuery('insertDeviceType', ['耗材', normalizeMasterName(type)]);
        }
      }

      // 自動補齊 型號 (Model)
      for (const [key, models] of modelMap.entries()) {
        const [brand] = key.split('___');
        for (const model of models) {
          await window.electronAPI.namedQuery('insertDeviceModel', [normalizeMasterName(brand), normalizeMasterName(model), '耗材']);
        }
      }

      // 2. 逐筆寫入或更新 item_master
      for (let i = 0; i < importableItems.length; i++) {
        const item = importableItems[i];
        try {
          // 檢查是否已存在
          const findRes = await window.electronAPI.namedQuery('findConsumableMaster', [
            item.brand,
            item.type,
            item.model,
            item.specification
          ]);

          if (findRes.success && findRes.rows && findRes.rows.length > 0) {
            // 品項已存在 -> 依重複模式處理。
            // 累加模式交由資料庫自行加總（stock_qty = stock_qty + 數量），
            // 不再「先讀出目前庫存、前端算好再寫回」—— 那種寫法在兩份匯入
            // 同時進行時會互相覆蓋，後寫入的會把前一筆的加總結果蓋掉。
            const existingId = findRes.rows[0].id;
            const isAddMode = duplicateMode === 'ADD';
            const stockRes = await window.electronAPI.namedQuery(
              isAddMode ? 'incrementConsumableStockQtyOnImport' : 'updateConsumableStockQtyOnImport',
              [Number(item.quantity || 0), existingId]
            );

            if (stockRes.success && stockRes.rows && stockRes.rows.length > 0) {
              updatedCount++;
              successCount++;
            } else {
              failCount++;
              errors.push(`[第 ${item.rowIndex} 行] ${item.specification} 庫存更新失敗: ${stockRes.error || '查無此品項'}`);
            }
          } else {
            // 全新品項 -> 建立新主檔
            const insertRes = await window.electronAPI.namedQuery('insertConsumableMaster', [
              item.specification,
              item.type,
              item.brand,
              item.model,
              item.unit || '個',
              Number(item.safetyStock || 0),
              Number(item.quantity || 0),
              '耗材'
            ]);

            if (insertRes.success) {
              createdCount++;
              successCount++;
            } else {
              failCount++;
              errors.push(`[第 ${item.rowIndex} 行] ${item.specification} 寫入失敗: ${insertRes.error}`);
            }
          }
        } catch (itemErr) {
          failCount++;
          errors.push(`[第 ${item.rowIndex} 行] ${item.specification} 處理異常: ${itemErr.message}`);
        }

        setImportProgress(Math.round(((i + 1) / importableItems.length) * 100));
      }

      // 3. 稽核日誌紀錄
      await logEvent({
        actionType: ACTION_TYPES.BATCH_IMPORT,
        module: MODULE_MAP.CONSUMABLE.key,
        moduleLabel: MODULE_MAP.CONSUMABLE.label,
        targetId: fileName,
        targetName: `耗材批次匯入 (${fileName})`,
        summary: `批次匯入耗材 ${fileName}：成功處理 ${successCount} 筆（新建 ${createdCount} 筆，更新庫存 ${updatedCount} 筆），總數量 ${stats.totalQuantity}`,
        details: {
          fileName,
          totalRows: parsedRows.length,
          successCount,
          createdCount,
          updatedCount,
          failCount,
          totalQuantity: stats.totalQuantity,
          duplicateMode,
          errors
        }
      });

      setImportResult({
        success: true,
        successCount,
        createdCount,
        updatedCount,
        failCount,
        totalQuantity: stats.totalQuantity,
        errors
      });

      // 觸發全域資料庫更新事件
      window.dispatchEvent(new CustomEvent('db-update'));
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error('Batch import fatal error:', err);
      alert('批次匯入過程發生未預期錯誤：' + err.message);
    } finally {
      setIsImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'var(--bg-modal-overlay)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      backdropFilter: 'blur(6px)',
      padding: 'clamp(8px, 1.5vh, 16px)'
    }}>
      <div style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-color)',
        borderRadius: '16px',
        width: '94vw',
        maxWidth: '1320px',
        height: rawJsonData.length > 0 ? '96vh' : 'auto',
        maxHeight: 'calc(100vh - 16px)',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: 'var(--modal-shadow)',
        overflow: 'hidden',
        color: 'var(--text-main)'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 18px',
          borderBottom: '1px solid var(--border-color)',
          backgroundColor: 'var(--bg-surface)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              backgroundColor: 'var(--primary-bg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--primary-color)'
            }}>
              <Package size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 800, margin: 0 }}>耗材清冊批次匯入 (Batch Consumables Import)</h2>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '1px 0 0 0' }}>
                支援分類分組清單（NIC、DAC Cable、GBIC 等）與標準 Excel/CSV 格式，自動建立主檔與 Total 總庫存。
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isImporting}
            style={{
              background: 'none',
              border: 'none',
              cursor: isImporting ? 'not-allowed' : 'pointer',
              color: 'var(--text-subtle)',
              padding: '6px',
              borderRadius: '8px'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '8px 16px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', minHeight: 0 }}>
          
          {/* 匯入完成成功狀態視窗 */}
          {importResult && (
            <div style={{
              backgroundColor: 'var(--bg-surface-subtle)',
              border: '1.5px solid #10b981',
              borderRadius: '16px',
              padding: '20px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#10b981', fontSize: '18px', fontWeight: 800 }}>
                <CheckCircle2 size={24} />
                耗材批次匯入完成！
              </div>
              <div style={{ fontSize: '14px', color: 'var(--text-main)', lineHeight: 1.6 }}>
                • 成功處理總品項數：<strong>{importResult.successCount}</strong> 筆<br/>
                • 全新建立品項主檔：<strong>{importResult.createdCount}</strong> 筆<br/>
                • 更新既有庫存數量：<strong>{importResult.updatedCount}</strong> 筆<br/>
                • 總入庫數量：<strong>{importResult.totalQuantity}</strong> 件
                {importResult.failCount > 0 && (
                  <span style={{ color: '#ef4444', display: 'block', marginTop: '4px' }}>
                    • 失敗筆數：{importResult.failCount} 筆
                  </span>
                )}
              </div>
              {importResult.errors.length > 0 && (
                <div style={{
                  backgroundColor: '#fee2e2',
                  color: '#b91c1c',
                  padding: '12px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  maxHeight: '120px',
                  overflowY: 'auto'
                }}>
                  {importResult.errors.map((e, idx) => <div key={idx}>{e}</div>)}
                </div>
              )}
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button
                  onClick={() => { resetState(); loadInitialData(); }}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: 'var(--primary-color)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: '13px'
                  }}
                >
                  繼續匯入其他檔案
                </button>
                <button
                  onClick={onClose}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-main)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '13px'
                  }}
                >
                  關閉視窗
                </button>
              </div>
            </div>
          )}

          {!importResult && (
            <>
              {/* 隱藏原生 File Input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleFileProcess(e.target.files[0]);
                  }
                }}
              />

              {/* 上傳與設定卡片 */}
              {rawJsonData.length === 0 ? (
                /* 尚未上傳檔案時：顯示完整引導大卡片 */
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(300px, 1fr) minmax(320px, 1.2fr)',
                  gap: '16px',
                  alignItems: 'stretch'
                }}>
                  {/* 左側：上傳區塊 */}
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      border: `2px dashed ${isDragging ? 'var(--primary-color)' : 'var(--border-color)'}`,
                      borderRadius: '14px',
                      backgroundColor: isDragging ? 'var(--primary-bg)' : 'var(--bg-surface-subtle)',
                      padding: '24px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      textAlign: 'center',
                      minHeight: '160px'
                    }}
                  >
                    <div style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--bg-surface)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--primary-color)',
                      marginBottom: '10px',
                      boxShadow: 'var(--card-shadow)'
                    }}>
                      <UploadCloud size={24} />
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-main)', marginBottom: '4px' }}>
                      點擊或將 Excel / CSV 檔案拖曳至此
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      支援 .xlsx, .xls, .csv 格式 (自動解析第一欄品項名稱與 Total 數量)
                    </div>
                  </div>

                  {/* 右側：匯入參數與範本下載 */}
                  <div style={{
                    backgroundColor: 'var(--bg-surface-subtle)',
                    borderRadius: '14px',
                    border: '1px solid var(--border-color)',
                    padding: '16px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '12px'
                  }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 800, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Layers size={15} color="var(--primary-color)" /> 匯入規則設定
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
                        {/* 重複品項處理模式 */}
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>
                            若品項已存在時：
                          </label>
                          <select
                            value={duplicateMode}
                            onChange={(e) => setDuplicateMode(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '6px 10px',
                              borderRadius: '6px',
                              border: '1px solid var(--input-border)',
                              backgroundColor: 'var(--input-bg)',
                              color: 'var(--input-text)',
                              fontSize: '12px',
                              fontWeight: 600
                            }}
                          >
                            <option value="REPLACE">覆蓋為檔案中的 Total 庫存</option>
                            <option value="ADD">累加至既有庫存 (+Total)</option>
                          </select>
                        </div>

                        {/* 預設/強制廠牌 (選填) */}
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>
                            預設/強制廠牌 (選填)：
                          </label>
                          <input
                            type="text"
                            placeholder="例如: Cisco (若檔案無廠牌)"
                            value={overrideBrand}
                            onChange={(e) => setOverrideBrand(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '6px 10px',
                              borderRadius: '6px',
                              border: '1px solid var(--input-border)',
                              backgroundColor: 'var(--input-bg)',
                              color: 'var(--input-text)',
                              fontSize: '12px',
                              boxSizing: 'border-box'
                            }}
                          />
                        </div>

                        {/* 強制指定類型 (選填) */}
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>
                            預設/強制類型 (選填)：
                          </label>
                          <input
                            type="text"
                            placeholder="例如: NIC (留空則依檔案標題)"
                            value={overrideType}
                            onChange={(e) => setOverrideType(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '6px 10px',
                              borderRadius: '6px',
                              border: '1px solid var(--input-border)',
                              backgroundColor: 'var(--input-bg)',
                              color: 'var(--input-text)',
                              fontSize: '12px',
                              boxSizing: 'border-box'
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* 範本下載按鈕 */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        首次使用或格式不確定？
                      </div>
                      <button
                        onClick={handleDownloadTemplate}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '5px 12px',
                          backgroundColor: 'var(--bg-surface)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '6px',
                          color: 'var(--text-main)',
                          fontSize: '12px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          boxShadow: 'var(--card-shadow)'
                        }}
                      >
                        <Download size={13} color="var(--primary-color)" /> 下載匯入範本 (Template)
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* 已載入檔案時：轉換為精簡橫向資訊列，騰出高度給表格預覽 */
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(240px, 1fr) 2.2fr',
                  gap: '12px',
                  alignItems: 'center',
                  backgroundColor: 'var(--bg-surface-subtle)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  padding: '8px 14px'
                }}>
                  {/* 左側：精簡檔案資訊標籤 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    <div style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '8px',
                      backgroundColor: 'var(--primary-bg)',
                      color: 'var(--primary-color)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <FileSpreadsheet size={18} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={fileName}>
                        {fileName || '未命名檔案'}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px', marginTop: '1px' }}>
                        <span>共 {stats.total} 筆資料</span>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--primary-color)',
                            fontSize: '11px',
                            cursor: 'pointer',
                            padding: 0,
                            textDecoration: 'underline',
                            fontWeight: 700
                          }}
                        >
                          重新選擇檔案
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 右側：精簡規則設定 (3欄橫排 + 下載範本按鈕) */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr auto', gap: '10px', alignItems: 'center' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '2px' }}>
                        若品項已存在：
                      </label>
                      <select
                        value={duplicateMode}
                        onChange={(e) => setDuplicateMode(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '5px 8px',
                          borderRadius: '6px',
                          border: '1px solid var(--input-border)',
                          backgroundColor: 'var(--input-bg)',
                          color: 'var(--input-text)',
                          fontSize: '12px',
                          fontWeight: 600
                        }}
                      >
                        <option value="REPLACE">覆蓋為 Total 庫存</option>
                        <option value="ADD">累加 (+Total)</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '2px' }}>
                        預設/強制廠牌：
                      </label>
                      <input
                        type="text"
                        placeholder="例如: Cisco (若檔案無廠牌)"
                        value={overrideBrand}
                        onChange={(e) => setOverrideBrand(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '5px 8px',
                          borderRadius: '6px',
                          border: '1px solid var(--input-border)',
                          backgroundColor: 'var(--input-bg)',
                          color: 'var(--input-text)',
                          fontSize: '12px',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '2px' }}>
                        預設/強制類型：
                      </label>
                      <input
                        type="text"
                        placeholder="例如: NIC (留空則依檔案標題)"
                        value={overrideType}
                        onChange={(e) => setOverrideType(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '5px 8px',
                          borderRadius: '6px',
                          border: '1px solid var(--input-border)',
                          backgroundColor: 'var(--input-bg)',
                          color: 'var(--input-text)',
                          fontSize: '12px',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleDownloadTemplate}
                      title="下載範本"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '5px 10px',
                        backgroundColor: 'var(--bg-surface)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        color: 'var(--text-main)',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        marginTop: '16px'
                      }}
                    >
                      <Download size={13} color="var(--primary-color)" /> 範本
                    </button>
                  </div>
                </div>
              )}

              {/* 統計指標 Cards */}
              {rawJsonData.length > 0 && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, 1fr)',
                  gap: '8px'
                }}>
                  <div style={{
                    padding: '6px 12px',
                    borderRadius: '10px',
                    backgroundColor: 'var(--bg-surface-subtle)',
                    border: '1px solid var(--border-color)'
                  }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)' }}>讀取總品項</div>
                    <div style={{ fontSize: '16px', fontWeight: 900, color: 'var(--text-main)', marginTop: '1px' }}>
                      {stats.total} <span style={{ fontSize: '11px', fontWeight: 500 }}>項</span>
                    </div>
                  </div>

                  <div style={{
                    padding: '6px 12px',
                    borderRadius: '10px',
                    backgroundColor: 'rgba(16, 185, 129, 0.08)',
                    border: '1px solid rgba(16, 185, 129, 0.25)'
                  }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#10b981' }}>全新品項 (可建立)</div>
                    <div style={{ fontSize: '16px', fontWeight: 900, color: '#10b981', marginTop: '1px' }}>
                      {stats.validNew} <span style={{ fontSize: '11px', fontWeight: 500 }}>項</span>
                    </div>
                  </div>

                  <div style={{
                    padding: '6px 12px',
                    borderRadius: '10px',
                    backgroundColor: 'rgba(59, 130, 246, 0.08)',
                    border: '1px solid rgba(59, 130, 246, 0.25)'
                  }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#3b82f6' }}>既有品項 (更新庫存)</div>
                    <div style={{ fontSize: '16px', fontWeight: 900, color: '#3b82f6', marginTop: '1px' }}>
                      {stats.existing} <span style={{ fontSize: '11px', fontWeight: 500 }}>項</span>
                    </div>
                  </div>

                  <div style={{
                    padding: '6px 12px',
                    borderRadius: '10px',
                    backgroundColor: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.25)'
                  }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#ef4444' }}>略過品項</div>
                    <div style={{ fontSize: '16px', fontWeight: 900, color: '#ef4444', marginTop: '1px' }}>
                      {stats.skipped} <span style={{ fontSize: '11px', fontWeight: 500 }}>項</span>
                    </div>
                  </div>

                  <div style={{
                    padding: '6px 12px',
                    borderRadius: '10px',
                    backgroundColor: 'var(--primary-bg)',
                    border: '1px solid var(--primary-border)'
                  }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--primary-color)' }}>總入庫數量</div>
                    <div style={{ fontSize: '16px', fontWeight: 900, color: 'var(--primary-color)', marginTop: '1px' }}>
                      {stats.totalQuantity} <span style={{ fontSize: '11px', fontWeight: 500 }}>件</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 預覽表格與檢核清單 */}
              {rawJsonData.length > 0 && (
                <div style={{
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  backgroundColor: 'var(--bg-surface)',
                  flex: 1,
                  minHeight: '260px'
                }}>
                  {/* Tab 篩選列 */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 12px',
                    backgroundColor: 'var(--bg-surface-subtle)',
                    borderBottom: '1px solid var(--border-color)',
                    flexShrink: 0
                  }}>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => setActiveTab('all')}
                        style={{
                          padding: '5px 12px',
                          borderRadius: '6px',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 700,
                          backgroundColor: activeTab === 'all' ? 'var(--primary-color)' : 'transparent',
                          color: activeTab === 'all' ? '#fff' : 'var(--text-muted)'
                        }}
                      >
                        全部 ({stats.total})
                      </button>
                      <button
                        onClick={() => setActiveTab('valid')}
                        style={{
                          padding: '5px 12px',
                          borderRadius: '6px',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 700,
                          backgroundColor: activeTab === 'valid' ? '#10b981' : 'transparent',
                          color: activeTab === 'valid' ? '#fff' : 'var(--text-muted)'
                        }}
                      >
                        全新品項 ({stats.validNew})
                      </button>
                      <button
                        onClick={() => setActiveTab('existing')}
                        style={{
                          padding: '5px 12px',
                          borderRadius: '6px',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 700,
                          backgroundColor: activeTab === 'existing' ? '#3b82f6' : 'transparent',
                          color: activeTab === 'existing' ? '#fff' : 'var(--text-muted)'
                        }}
                      >
                        既有更新 ({stats.existing})
                      </button>
                      <button
                        onClick={() => setActiveTab('skipped')}
                        style={{
                          padding: '5px 12px',
                          borderRadius: '6px',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 700,
                          backgroundColor: activeTab === 'skipped' ? '#ef4444' : 'transparent',
                          color: activeTab === 'skipped' ? '#fff' : 'var(--text-muted)'
                        }}
                      >
                        略過 ({stats.skipped})
                      </button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px', color: 'var(--text-muted)' }}>
                      {!hasBrandHeader && !overrideBrand && (
                        <span style={{ color: '#eab308', fontWeight: 600 }}>
                          ⚠️ 上傳檔案未包含「廠牌」欄位，缺少廠牌的列將被略過 (可於上方輸入「預設/強制廠牌」統一套用)
                        </span>
                      )}
                      <span>💡 點擊品項欄位可直接在預覽中修正</span>
                    </div>
                  </div>

                  {/* 表格內容：flex: 1 彈性自適應高度 */}
                  <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                        <tr style={{
                          backgroundColor: 'var(--bg-surface-subtle)',
                          borderBottom: '1px solid var(--border-color)',
                          color: 'var(--text-muted)',
                          textAlign: 'left'
                        }}>
                          <th style={{ padding: '8px 12px', width: '50px' }}>行號</th>
                          <th style={{ padding: '8px 12px', width: '110px' }}>狀態</th>
                          <th style={{ padding: '8px 12px', width: '110px' }}>類型 (Type)</th>
                          <th style={{ padding: '8px 12px', width: '130px' }}>廠牌 (Brand)</th>
                          <th style={{ padding: '8px 12px', width: '160px' }}>型號/規格 (Model / Spec)</th>
                          <th style={{ padding: '8px 12px' }}>備註 (Remarks)</th>
                          <th style={{ padding: '8px 12px', width: '80px', textAlign: 'right' }}>Total 數量</th>
                          <th style={{ padding: '8px 12px', width: '60px', textAlign: 'center' }}>單位</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayRows.map((row, idx) => (
                          <tr
                            key={idx}
                            style={{
                              borderBottom: '1px solid var(--border-color)',
                              backgroundColor: idx % 2 === 0 ? 'transparent' : 'var(--bg-surface-subtle)',
                              transition: 'background-color 0.15s'
                            }}
                          >
                            <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>#{row.rowIndex}</td>
                            <td style={{ padding: '8px 12px' }}>
                              {row.status === 'VALID' && (
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                  backgroundColor: 'rgba(16, 185, 129, 0.12)',
                                  color: '#10b981',
                                  fontSize: '11px',
                                  fontWeight: 800
                                }}>
                                  <Check size={12} /> 全新建檔
                                </span>
                              )}
                              {row.status === 'EXISTING' && (
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                  backgroundColor: 'rgba(59, 130, 246, 0.12)',
                                  color: '#3b82f6',
                                  fontSize: '11px',
                                  fontWeight: 800
                                }}>
                                  既有更新
                                </span>
                              )}
                              {row.status === 'SKIPPED' && (
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                                  color: '#ef4444',
                                  fontSize: '11px',
                                  fontWeight: 800
                                }} title={row.skipReason}>
                                  略過 {row.skipReason ? `(${row.skipReason})` : ''}
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--primary-color)' }}>
                              {row.type}
                            </td>
                            <td style={{ padding: '8px 12px', fontWeight: 600, color: !row.brand ? '#ef4444' : 'inherit' }}>
                              {row.brand || <span style={{ color: '#ef4444', fontStyle: 'italic', fontSize: '11px' }}>未輸入廠牌</span>}
                            </td>
                            <td style={{ padding: '8px 12px', color: 'var(--text-main)' }}>
                              {row.model}
                            </td>
                            <td style={{ padding: '8px 12px', color: 'var(--text-main)', fontWeight: 500 }}>
                              {row.specification}
                              {row.isExisting && (
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                                  (目前庫存: {row.existingStock} / LAB: {row.existingLab})
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--text-main)' }}>
                              {row.quantity}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--text-muted)' }}>
                              {row.unit}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {/* 匯入進度條 */}
          {isImporting && (
            <div style={{ marginTop: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
                <span>資料庫寫入中，請稍候...</span>
                <span>{importProgress}%</span>
              </div>
              <div style={{
                height: '6px',
                borderRadius: '3px',
                backgroundColor: 'var(--bg-surface-subtle)',
                overflow: 'hidden',
                border: '1px solid var(--border-color)'
              }}>
                <div style={{
                  height: '100%',
                  width: `${importProgress}%`,
                  backgroundColor: 'var(--primary-color)',
                  transition: 'width 0.2s ease'
                }} />
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        {!importResult && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 16px',
            borderTop: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-surface)'
          }}>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              {parsedRows.length > 0 && (
                <span>共準備匯入 <strong>{stats.validNew + stats.existing}</strong> 筆品項，總計 <strong>{stats.totalQuantity}</strong> 件庫存</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={onClose}
                disabled={isImporting}
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-main)',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: isImporting ? 'not-allowed' : 'pointer'
                }}
              >
                取消
              </button>
              <button
                onClick={executeImport}
                disabled={isImporting || parsedRows.filter(r => r.status === 'VALID' || r.status === 'EXISTING').length === 0}
                style={{
                  padding: '8px 22px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: isImporting || parsedRows.filter(r => r.status === 'VALID' || r.status === 'EXISTING').length === 0 ? 'var(--input-border)' : 'var(--primary-color)',
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: '13px',
                  cursor: isImporting || parsedRows.filter(r => r.status === 'VALID' || r.status === 'EXISTING').length === 0 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)'
                }}
              >
                <UploadCloud size={16} />
                {isImporting ? '匯入處理中...' : `確認批次匯入 (${stats.validNew + stats.existing} 筆)`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConsumableBatchImportModal;
