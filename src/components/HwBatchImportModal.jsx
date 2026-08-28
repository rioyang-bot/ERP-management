import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { 
  X, UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle, 
  XCircle, Filter, Layers, Database, ArrowRight, RefreshCw, Info, Download, Cpu, Server, Plus, Check
} from 'lucide-react';
import { logEvent, ACTION_TYPES, MODULE_MAP } from '../utils/auditLogger';
import { parseSpreadsheetFile, fixMojibake } from '../utils/encoding';

const HwBatchImportModal = ({ isOpen, onClose, onSuccess, existingBrands = [] }) => {
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  
  // 硬體主檔設定 (廠牌 / 類型 / 型號 / 規格 / 歸屬)
  const [selectedBrand, setSelectedBrand] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [specification, setSpecification] = useState('');

  // 動態連動資料
  const [brandList, setBrandList] = useState([]);
  const [typeList, setTypeList] = useState([]);
  const [modelList, setModelList] = useState([]);

  const [rawJsonData, setRawJsonData] = useState([]);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'valid', 'skipped', 'duplicate'
  const [existingSns, setExistingSns] = useState(new Set());
  const [importResult, setImportResult] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef(null);

  // 載入既有廠牌清單與序號
  const loadInitialData = useCallback(async () => {
    try {
      const [brandRes, snRes] = await Promise.all([
        window.electronAPI.namedQuery('fetchNicBrands'),
        window.electronAPI.namedQuery('fetchAssetSns')
      ]);

      if (brandRes.success && brandRes.rows) {
        setBrandList(brandRes.rows);
      }
      if (snRes.success && snRes.rows) {
        const snSet = new Set(snRes.rows.map(r => (r.sn || '').trim().toUpperCase()).filter(Boolean));
        setExistingSns(snSet);
      }
    } catch (err) {
      console.error('Failed to load initial HW data:', err);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      resetState();
      return;
    }
    loadInitialData();
  }, [isOpen, loadInitialData]);

  // 當廠牌變動時，查詢連動類型
  const handleBrandChange = async (brandVal) => {
    setSelectedBrand(brandVal);
    setSelectedType('');
    setSelectedModel('');
    setSpecification('');
    setTypeList([]);
    setModelList([]);

    if (brandVal && brandVal.trim()) {
      try {
        const res = await window.electronAPI.namedQuery('fetchNicTypesByBrand', [brandVal.trim()]);
        if (res.success && res.rows) {
          setTypeList(res.rows.map(r => r.name));
        }
      } catch (err) {
        console.error('Fetch types error:', err);
      }
    }
  };

  // 當類型變動時，查詢連動型號
  const handleTypeChange = async (typeVal) => {
    setSelectedType(typeVal);
    setSelectedModel('');
    setSpecification('');
    setModelList([]);

    if (selectedBrand && typeVal && typeVal.trim()) {
      try {
        const res = await window.electronAPI.namedQuery('fetchNicModelsByBrandType', [selectedBrand.trim(), typeVal.trim()]);
        if (res.success && res.rows) {
          setModelList(res.rows.map(r => r.name));
        }
      } catch (err) {
        console.error('Fetch models error:', err);
      }
    }
  };

  // 當型號變動時，自動查詢規格
  const handleModelChange = async (modelVal) => {
    setSelectedModel(modelVal);

    if (selectedBrand && selectedType && modelVal && modelVal.trim()) {
      try {
        const res = await window.electronAPI.namedQuery('fetchNicSpecByBrandTypeModel', [
          selectedBrand.trim(),
          selectedType.trim(),
          modelVal.trim()
        ]);
        if (res.success && res.rows && res.rows.length > 0 && res.rows[0].specification) {
          setSpecification(res.rows[0].specification);
        }
      } catch (err) {
        console.error('Fetch spec error:', err);
      }
    }
  };

  const resetState = () => {
    setFile(null);
    setFileName('');
    setSelectedBrand('');
    setSelectedType('');
    setSelectedModel('');
    setSpecification('');
    setRawJsonData([]);
    setIsProcessingFile(false);
    setIsImporting(false);
    setImportProgress(0);
    setActiveTab('all');
    setImportResult(null);
  };

  // 智慧比對欄位名稱
  const findColumnValue = (rowObj, possibleKeys) => {
    for (const key of Object.keys(rowObj)) {
      const normalizedKey = key.trim().toLowerCase().replace(/[\s_\(\)\-]/g, '');
      for (const pk of possibleKeys) {
        const normalizedPk = pk.trim().toLowerCase().replace(/[\s_\(\)\-]/g, '');
        if (normalizedKey === normalizedPk) {
          const val = rowObj[key];
          return val !== undefined && val !== null ? fixMojibake(String(val).trim()) : '';
        }
      }
    }
    return '';
  };

  // 智慧搜尋硬體序號 (支援如 SF2541 SN, MCX512A SN, Serial Number, SN 等)
  const findSnValue = (rowObj) => {
    // 1. 優先精準別名比對
    const priorityKeys = [
      'Serial Number ( Current )', 'Serial Number', 'SerialNumber', '序號', '硬體序號', 'SN', 'S/N', 'Hw SN'
    ];
    for (const pk of priorityKeys) {
      const val = findColumnValue(rowObj, [pk]);
      if (val) return val;
    }

    // 2. 模糊比對：任何結尾為 'SN' 或包含 'SN' 的欄位（排除 Server-SN / Hostname）
    for (const key of Object.keys(rowObj)) {
      const k = key.trim().toLowerCase();
      if (k.includes('server') || k.includes('host') || k.includes('srv')) continue;
      if (k.endsWith('sn') || k.endsWith('s/n') || k.includes('serial') || k.includes('序號')) {
        const val = rowObj[key];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          return fixMojibake(String(val).trim());
        }
      }
    }

    // 3. 若無匹配，檢查第一欄
    const keys = Object.keys(rowObj);
    if (keys.length > 0) {
      const firstKey = keys[0];
      const k = firstKey.trim().toLowerCase();
      if (!k.includes('server') && !k.includes('host') && !k.includes('customer') && !k.includes('cusomter')) {
        const firstVal = String(rowObj[firstKey] || '').trim();
        if (firstVal) return fixMojibake(firstVal);
      }
    }

    return '';
  };

  // 處理上傳檔案
  const handleFileProcess = async (selectedFile) => {
    if (!selectedFile) return;
    setIsProcessingFile(true);
    setFileName(selectedFile.name);
    setFile(selectedFile);
    setImportResult(null);

    try {
      const rawJson = await parseSpreadsheetFile(selectedFile);

      if (rawJson.length === 0) {
        alert('檔案內容為空，請確認上傳之 Excel / CSV 檔案包含硬體資料。');
        setIsProcessingFile(false);
        return;
      }

      setRawJsonData(rawJson);
    } catch (err) {
      console.error('HW File parsing error:', err);
      alert('解析檔案失敗，請確認檔案格式是否正確：' + err.message);
    } finally {
      setIsProcessingFile(false);
    }
  };

  // 動態即時解析並檢核每一筆資料 (根據 rawJsonData 與上方主檔設定)
  const parsedRows = useMemo(() => {
    if (!rawJsonData || rawJsonData.length === 0) return [];

    const fileSnCounts = {};
    const processed = [];

    rawJsonData.forEach((row, index) => {
      const values = Object.values(row).map(v => String(v).trim()).filter(Boolean);
      if (values.length === 0) return; // 略過全空行

      // 欄位匹配（支援使用者圖片中的 SF2541 SN, Cusomter, Hostname, Server-SN, Order Source）
      const rowBrand = findColumnValue(row, ['Brand', '廠牌', '品牌']);
      const brand = (rowBrand || selectedBrand || '').trim();

      const rowType = findColumnValue(row, ['Type', 'System Type', '類型', '硬體類型', '元件類型']);
      const type = (rowType || selectedType || '').trim();

      const rowModel = findColumnValue(row, ['Model', '型號', '硬體型號', 'Part Number', 'P/N']);
      const model = (rowModel || selectedModel || '').trim();

      const rowSpec = findColumnValue(row, ['Specification', 'Spec', '規格', '硬體規格']);
      const spec = (rowSpec || specification || '').trim();

      const sn = findSnValue(row);
      const customer = findColumnValue(row, ['Customer', 'Cusomter', '客戶', 'Client', '客戶名稱']);
      const hostname = findColumnValue(row, ['Hostname', 'Host Name', 'HostName', '主機名稱']);
      const serverSn = findColumnValue(row, ['Server-SN', 'Server SN', 'Server_SN', 'ServerSN', '對應伺服器', '對應伺服器 SN', '對應設備序號', 'Host SN']);
      const location = findColumnValue(row, ['Location', '地點', '位置', '機房', '放置位置']);
      const orderSource = findColumnValue(row, ['Order Source', 'OrderSource', '訂單來源', 'Order Date', 'Project Name', 'Project', '專案名稱', '專案']);

      // 出貨狀態判定：直接依據上傳 Excel/CSV 內 Status/狀態 欄位判定（預設為 ACTIVE）
      const rowStatusRaw = findColumnValue(row, ['Status', '狀態', '資產狀態', '出貨狀態', '硬體狀態']);
      let itemStatus = 'ACTIVE';
      if (rowStatusRaw) {
        const s = rowStatusRaw.trim().toUpperCase();
        if (s === 'SHIPPED' || s.includes('出貨') || s.includes('已出貨')) {
          itemStatus = 'SHIPPED';
        } else if (s === 'ACTIVE' || s.includes('在庫') || s.includes('庫存')) {
          itemStatus = 'ACTIVE';
        } else if (s === 'LENT' || s.includes('借出')) {
          itemStatus = 'LENT';
        }
      }

      // 檢核狀態判定
      let status = 'VALID';
      let skipReason = '';

      // 規則 1：廠牌 / 類型 / 型號 / 規格 / 序號 缺一不建立
      if (!brand) {
        status = 'SKIPPED';
        skipReason = '缺少廠牌 (Brand)';
      } else if (!type) {
        status = 'SKIPPED';
        skipReason = '缺少類型 (Type)';
      } else if (!model) {
        status = 'SKIPPED';
        skipReason = '缺少型號 (Model)';
      } else if (!spec) {
        status = 'SKIPPED';
        skipReason = '缺少規格 (Specification)';
      } else if (!sn) {
        status = 'SKIPPED';
        skipReason = '缺少硬體序號 (SN)';
      }

      // 規則 2：序號防重複檢核
      const cleanSn = sn ? sn.trim().toUpperCase() : '';
      if (cleanSn) {
        fileSnCounts[cleanSn] = (fileSnCounts[cleanSn] || 0) + 1;
        if (fileSnCounts[cleanSn] > 1) {
          status = 'DUPLICATE';
          skipReason = `檔案內序號重複出現 (第 ${fileSnCounts[cleanSn]} 次)`;
        } else if (existingSns.has(cleanSn)) {
          status = 'DUPLICATE';
          skipReason = '此序號已存在於系統硬體/設備清冊中';
        }
      }

      processed.push({
        rowIndex: index + 2,
        brand,
        type,
        model,
        specification: spec,
        sn: (sn || '').trim(),
        server_sn: (serverSn || '').trim(),
        client: (customer || '').trim(),
        hostname: (hostname || '').trim(),
        location: (location || '').trim(),
        order_source: (orderSource || '').trim(),
        itemStatus,
        status,
        skipReason
      });
    });

    return processed;
  }, [rawJsonData, selectedBrand, selectedType, selectedModel, specification, existingSns]);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };

  // 統計數據
  const stats = useMemo(() => {
    const total = parsedRows.length;
    const valid = parsedRows.filter(r => r.status === 'VALID').length;
    const skipped = parsedRows.filter(r => r.status === 'SKIPPED').length;
    const duplicate = parsedRows.filter(r => r.status === 'DUPLICATE').length;
    return { total, valid, skipped, duplicate };
  }, [parsedRows]);

  // 根據當前 Tab 篩選欲顯示的項目
  const displayRows = useMemo(() => {
    if (activeTab === 'valid') return parsedRows.filter(r => r.status === 'VALID');
    if (activeTab === 'skipped') return parsedRows.filter(r => r.status === 'SKIPPED');
    if (activeTab === 'duplicate') return parsedRows.filter(r => r.status === 'DUPLICATE');
    return parsedRows;
  }, [parsedRows, activeTab]);

  // 下載硬體匯入範本 (與使用者圖片相容的格式)
  const handleDownloadTemplate = () => {
    const sampleData = [
      {
        'SF2541 SN': '254100104110222867100882',
        'Cusomter': 'Yuanta Ryan',
        'Hostname': 'Deliver to Hand',
        'Server-SN': '',
        'Order Source': 'XeAU Nov2022'
      },
      {
        'SF2541 SN': '254100104110222867100780',
        'Cusomter': 'Yuanta Ryan',
        'Hostname': 'HFT50-55',
        'Server-SN': 'X0341561',
        'Order Source': 'XeAU Nov2022'
      },
      {
        'SF2541 SN': '254100104110223557100675',
        'Cusomter': 'Yuanta Ryan',
        'Hostname': 'HFT50-58',
        'Server-SN': 'X0341564',
        'Order Source': 'XeAU Nov2022'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'SF2541_SN_List');
    XLSX.writeFile(wb, '硬體清單批次匯入範本.xlsx');
  };

  // 執行批次寫入資料庫
  const executeImport = async () => {
    const validItems = parsedRows.filter(r => r.status === 'VALID');
    if (validItems.length === 0) {
      alert('目前沒有符合建立條件的硬體資料（請確認是否已填寫廠牌、類型、型號、規格與序號，或檢查是否序號重複）。');
      return;
    }

    if (!window.confirm(`確定要將 ${validItems.length} 筆硬體資料匯入建立至系統庫存嗎？`)) {
      return;
    }

    setIsImporting(true);
    setImportProgress(0);

    let successCount = 0;
    let failCount = 0;
    const errors = [];

    try {
      // 1. 收集 distinct (brand, type, model) 與客戶，自動補齊主檔
      const brandSet = new Set();
      const typeMap = new Map(); // brand -> Set of types
      const modelMap = new Map(); // `${brand}___${type}` -> Set of models
      const clientSet = new Set();

      validItems.forEach(item => {
        brandSet.add(item.brand);
        
        if (!typeMap.has(item.brand)) typeMap.set(item.brand, new Set());
        typeMap.get(item.brand).add(item.type);

        const key = `${item.brand}___${item.type}`;
        if (!modelMap.has(key)) modelMap.set(key, new Set());
        modelMap.get(key).add(item.model);

        if (item.client) clientSet.add(item.client);
      });

      // 自動補齊 廠牌 (Brand)
      for (const brand of brandSet) {
        await window.electronAPI.namedQuery('insertDeviceBrand', ['硬體', brand]);
      }

      // 自動補齊 類型 (Type)
      for (const [brand, types] of typeMap.entries()) {
        for (const type of types) {
          await window.electronAPI.namedQuery('insertDeviceType', ['硬體', brand, type]);
        }
      }

      // 自動補齊 型號 (Model)
      for (const [key, models] of modelMap.entries()) {
        const [brand, type] = key.split('___');
        for (const model of models) {
          await window.electronAPI.namedQuery('insertDeviceModel', [brand, type, '硬體', model]);
        }
      }

      // 自動補齊 客戶 (Partner)
      for (const client of clientSet) {
        try {
          await window.electronAPI.namedQuery('insertCustomerIfNotExist', [client]);
        } catch (e) {
          console.warn('Customer auto-creation note:', e);
        }
      }

      // 2. 逐筆建立 item_master 與 assets
      const masterCache = new Map(); // `${brand}___${type}___${model}___${spec}` -> masterId

      for (let i = 0; i < validItems.length; i++) {
        const item = validItems[i];
        const masterKey = `${item.brand}___${item.type}___${item.model}___${item.specification}`;

        try {
          let masterId = masterCache.get(masterKey);
          if (!masterId) {
            const findRes = await window.electronAPI.namedQuery('findItemMaster', [
              item.specification || '',
              item.type,
              item.brand,
              item.model
            ]);
            if (findRes.success && findRes.rows.length > 0) {
              masterId = findRes.rows[0].id;
            } else {
              const createMasterRes = await window.electronAPI.namedQuery('insertItemMaster', [
                item.specification || '',
                item.type,
                item.brand,
                item.model,
                '個',
                '硬體'
              ]);
              if (createMasterRes.success && createMasterRes.rows.length > 0) {
                masterId = createMasterRes.rows[0].id;
              }
            }
            if (masterId) masterCache.set(masterKey, masterId);
          }

          if (!masterId) {
            throw new Error(`無法建立或找到硬體物料主檔 [${item.brand} ${item.model}]`);
          }

          // 寫入 Asset 實體
          const customAttributes = {
            batch_imported: true,
            import_file: fileName,
            import_date: new Date().toISOString(),
            server_sn: item.server_sn || '',
            order_source: item.order_source || '',
            project_name: item.order_source || ''
          };

          const insertAssetRes = await window.electronAPI.namedQuery('insertAssetRecord', [
            masterId,
            item.sn || null,
            item.client || null,
            item.hostname || null,
            item.location || null,
            null, // installed_date
            null, // customer_warranty_expire
            null, // system_date
            null, // warranty_expire
            null, // os
            null, // nic
            customAttributes,
            'FOR_SALE',
            item.itemStatus || 'ACTIVE'
          ]);

          if (insertAssetRes.success) {
            successCount++;
          } else {
            failCount++;
            errors.push(`序號 [${item.sn || '無'}] 寫入失敗：${insertAssetRes.error}`);
          }
        } catch (itemErr) {
          failCount++;
          errors.push(`第 ${item.rowIndex} 行 [${item.sn || '無'}] 處理異常：${itemErr.message}`);
        }

        setImportProgress(Math.round(((i + 1) / validItems.length) * 100));
      }

      // 3. 稽核日誌紀錄
      await logEvent({
        actionType: ACTION_TYPES.BATCH_IMPORT,
        module: MODULE_MAP.HARDWARE.key,
        moduleLabel: MODULE_MAP.HARDWARE.label,
        targetId: fileName,
        targetName: `${selectedBrand || '批次'} ${selectedModel || '硬體'} 批次匯入`,
        summary: `批次匯入 ${fileName}：成功建立 ${successCount} 筆硬體，略過 ${stats.skipped} 筆，衝突 ${stats.duplicate} 筆`,
        details: {
          fileName,
          totalRows: parsedRows.length,
          successCount,
          failCount,
          skippedCount: stats.skipped,
          duplicateCount: stats.duplicate,
          brand: selectedBrand,
          type: selectedType,
          model: selectedModel,
          spec: specification,
          ownership: 'FOR_SALE',
          errors
        }
      });

      setImportResult({
        success: true,
        successCount,
        failCount,
        skippedCount: stats.skipped,
        duplicateCount: stats.duplicate,
        errors
      });

      if (onSuccess) onSuccess();
    } catch (err) {
      console.error('HW Batch Import Error:', err);
      alert('批次匯入過程發生未預期錯誤：' + err.message);
    } finally {
      setIsImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      backdropFilter: 'blur(5px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'var(--bg-surface)',
        borderRadius: '16px',
        width: '96%',
        maxWidth: '1320px',
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: 'var(--modal-shadow)',
        border: '1px solid var(--border-color)',
        overflow: 'hidden',
        animation: 'fadeIn 0.2s ease-out'
      }}>
        {/* 頂部標題列 */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'var(--bg-surface-subtle)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              backgroundColor: 'rgba(99, 102, 241, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6366f1'
            }}>
              <Cpu size={22} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: 'var(--text-main)' }}>
                硬體清單批次匯入 (Hardware Batch Import)
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                上傳無廠牌型號欄位之序號清單時，請先於下方選擇或建立「廠牌 / 類型 / 型號 / 規格 / 狀態」，清單將自動套用建立。
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '8px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* 內容區塊 */}
        <div style={{
          padding: '20px 24px',
          overflowY: 'auto',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '18px'
        }}>
          {/* 區塊 1：硬體主檔設定區 (廠牌 / 類型 / 型號 / 規格 / 歸屬 / 狀態) */}
          <div style={{
            backgroundColor: 'var(--bg-surface-subtle)',
            padding: '18px 20px',
            borderRadius: '14px',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '800', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={17} color="var(--primary-color)" /> 步驟 1：選擇或建立硬體主檔（整批套用）
              </h4>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                * 若上傳清單本身無廠牌/型號欄位，將全數套用此處之設定
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1.5fr 2.5fr', gap: '12px', alignItems: 'flex-start' }}>
              {/* 廠牌 (Brand) */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '6px' }}>
                  廠牌 (Brand) <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={selectedBrand}
                    onChange={(e) => handleBrandChange(e.target.value)}
                    placeholder="輸入或選取廠牌 (例: Solarflare)"
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1px solid var(--input-border)',
                      backgroundColor: 'var(--input-bg)',
                      color: 'var(--input-text)',
                      fontSize: '13px',
                      outline: 'none'
                    }}
                    list="hw-batch-brands"
                  />
                  <datalist id="hw-batch-brands">
                    {brandList.map(b => (
                      <option key={b.id || b.name} value={b.name} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* 類型 (Type) */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '6px' }}>
                  類型 (Type) <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={selectedType}
                    onChange={(e) => handleTypeChange(e.target.value)}
                    placeholder="輸入或選取類型 (例: NIC)"
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1px solid var(--input-border)',
                      backgroundColor: 'var(--input-bg)',
                      color: 'var(--input-text)',
                      fontSize: '13px',
                      outline: 'none'
                    }}
                    list="hw-batch-types"
                  />
                  <datalist id="hw-batch-types">
                    {typeList.map(t => (
                      <option key={t} value={t} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* 型號 (Model) */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '6px' }}>
                  型號 (Model) <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={selectedModel}
                    onChange={(e) => handleModelChange(e.target.value)}
                    placeholder="輸入或選取型號 (例: SF2541)"
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: '1px solid var(--input-border)',
                      backgroundColor: 'var(--input-bg)',
                      color: 'var(--input-text)',
                      fontSize: '13px',
                      outline: 'none'
                    }}
                    list="hw-batch-models"
                  />
                  <datalist id="hw-batch-models">
                    {modelList.map(m => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* 規格 (Specification) */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '6px' }}>
                  規格 (Specification) <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={specification}
                  onChange={(e) => setSpecification(e.target.value)}
                  placeholder="例: Dual-Port 25GbE SFP28 PCIe"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: '1px solid var(--input-border)',
                    backgroundColor: 'var(--input-bg)',
                    color: 'var(--input-text)',
                    fontSize: '13px',
                    outline: 'none'
                  }}
                />
              </div>
            </div>
          </div>

          {/* 區塊 2：檔案拖曳與上傳區 */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            style={{
              border: `2px dashed ${isDragging ? 'var(--primary-color)' : 'var(--border-color)'}`,
              backgroundColor: isDragging ? 'rgba(99, 102, 241, 0.05)' : 'var(--bg-surface-subtle)',
              borderRadius: '12px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s',
              minHeight: '140px',
              textAlign: 'center'
            }}
          >
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

            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              backgroundColor: 'rgba(99, 102, 241, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6366f1',
              marginBottom: '10px'
            }}>
              <UploadCloud size={24} />
            </div>

            {fileName ? (
              <div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '4px' }}>
                  已載入清單：{fileName}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  點擊或拖曳其他檔案可重新上傳
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '4px' }}>
                  步驟 2：點擊選擇或將硬體清單 Excel / CSV 檔案拖曳至此
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                  支援包含序號 (如 SF2541 SN)、客戶 (Customer / Cusomter)、主機名稱 (Hostname)、伺服器序號 (Server-SN)、訂單來源 (Order Source)
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownloadTemplate();
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '5px 12px',
                    borderRadius: '6px',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--primary-color)',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  <Download size={13} /> 下載硬體匯入範本
                </button>
              </div>
            )}
          </div>

          {/* 區塊 3：解析預覽與檢核分頁 */}
          {rawJsonData.length > 0 && (
            <div style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              borderRadius: '12px',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}>
              {/* 分頁籤與摘要統計 */}
              <div style={{
                padding: '12px 16px',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: 'var(--bg-surface-subtle)',
                flexWrap: 'wrap',
                gap: '10px'
              }}>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => setActiveTab('all')}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: '700',
                      cursor: 'pointer',
                      border: 'none',
                      backgroundColor: activeTab === 'all' ? 'var(--primary-color)' : 'transparent',
                      color: activeTab === 'all' ? '#fff' : 'var(--text-muted)'
                    }}
                  >
                    全部解析 ({stats.total})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('valid')}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: '700',
                      cursor: 'pointer',
                      border: 'none',
                      backgroundColor: activeTab === 'valid' ? '#10b981' : 'transparent',
                      color: activeTab === 'valid' ? '#fff' : '#10b981'
                    }}
                  >
                    <CheckCircle2 size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                    待建立 ({stats.valid})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('skipped')}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: '700',
                      cursor: 'pointer',
                      border: 'none',
                      backgroundColor: activeTab === 'skipped' ? '#f59e0b' : 'transparent',
                      color: activeTab === 'skipped' ? '#fff' : '#f59e0b'
                    }}
                  >
                    <AlertTriangle size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                    略過項目 ({stats.skipped})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('duplicate')}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: '700',
                      cursor: 'pointer',
                      border: 'none',
                      backgroundColor: activeTab === 'duplicate' ? '#ef4444' : 'transparent',
                      color: activeTab === 'duplicate' ? '#fff' : '#ef4444'
                    }}
                  >
                    <XCircle size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                    序號重複 ({stats.duplicate})
                  </button>
                </div>

                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  共 {stats.total} 筆 • 可寫入 <b style={{ color: '#10b981' }}>{stats.valid}</b> 筆
                </div>
              </div>

              {/* 資料表格 */}
              <div style={{ maxHeight: '340px', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                  <thead style={{
                    position: 'sticky',
                    top: 0,
                    backgroundColor: 'var(--table-header-bg)',
                    borderBottom: '2px solid var(--border-color)',
                    zIndex: 1
                  }}>
                    <tr>
                      <th style={{ padding: '10px 12px', color: 'var(--text-muted)', fontWeight: '700', width: '50px' }}>行號</th>
                      <th style={{ padding: '10px 12px', color: 'var(--text-muted)', fontWeight: '700' }}>檢核狀態</th>
                      <th style={{ padding: '10px 12px', color: 'var(--text-muted)', fontWeight: '700' }}>初始狀態</th>
                      <th style={{ padding: '10px 12px', color: 'var(--text-muted)', fontWeight: '700' }}>廠牌 / 類型 / 型號</th>
                      <th style={{ padding: '10px 12px', color: 'var(--text-muted)', fontWeight: '700' }}>硬體序號 (SN)</th>
                      <th style={{ padding: '10px 12px', color: 'var(--text-muted)', fontWeight: '700' }}>對應伺服器 (Server-SN)</th>
                      <th style={{ padding: '10px 12px', color: 'var(--text-muted)', fontWeight: '700' }}>主機名稱 (Hostname)</th>
                      <th style={{ padding: '10px 12px', color: 'var(--text-muted)', fontWeight: '700' }}>客戶 (Customer)</th>
                      <th style={{ padding: '10px 12px', color: 'var(--text-muted)', fontWeight: '700' }}>訂單來源 (Order Source)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayRows.map((row, idx) => {
                      let statusBadge = null;
                      if (row.status === 'VALID') {
                        statusBadge = (
                          <span style={{ padding: '3px 8px', borderRadius: '12px', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontWeight: '700', fontSize: '11px', whiteSpace: 'nowrap' }}>
                            ✓ 可建立
                          </span>
                        );
                      } else if (row.status === 'SKIPPED') {
                        statusBadge = (
                          <span style={{ padding: '3px 8px', borderRadius: '12px', backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', fontWeight: '700', fontSize: '11px', whiteSpace: 'nowrap' }} title={row.skipReason}>
                            ⚠️ 略過：{row.skipReason}
                          </span>
                        );
                      } else {
                        statusBadge = (
                          <span style={{ padding: '3px 8px', borderRadius: '12px', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', fontWeight: '700', fontSize: '11px', whiteSpace: 'nowrap' }} title={row.skipReason}>
                            ❌ 重複：{row.skipReason}
                          </span>
                        );
                      }

                      return (
                        <tr
                          key={idx}
                          style={{
                            borderBottom: '1px solid var(--border-color)',
                            backgroundColor: row.status === 'SKIPPED' ? 'rgba(245, 158, 11, 0.03)' : (row.status === 'DUPLICATE' ? 'rgba(239, 68, 68, 0.03)' : 'transparent')
                          }}
                        >
                          <td style={{ padding: '8px 12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>#{row.rowIndex}</td>
                          <td style={{ padding: '8px 12px' }}>{statusBadge}</td>
                          <td style={{ padding: '8px 12px' }}>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: '700',
                              backgroundColor: row.itemStatus === 'SHIPPED' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                              color: row.itemStatus === 'SHIPPED' ? '#3b82f6' : '#10b981',
                              whiteSpace: 'nowrap'
                            }}>
                              {row.itemStatus === 'SHIPPED' ? '📦 已出貨' : '🟢 在庫'}
                            </span>
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <div style={{ fontWeight: '700', color: 'var(--text-main)' }}>
                              {row.brand || <span style={{ color: '#ef4444' }}>[未填廠牌]</span>}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              {row.type || <span style={{ color: '#ef4444' }}>[未填類型]</span>} - {row.model || <span style={{ color: '#ef4444' }}>[未填型號]</span>}
                            </div>
                            <div style={{ fontSize: '10px', color: row.specification ? 'var(--text-subtle)' : '#ef4444' }}>
                              {row.specification ? `規格: ${row.specification}` : '[未填規格]'}
                            </div>
                          </td>
                          <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontWeight: '700', color: row.sn ? 'var(--primary-color)' : '#ef4444' }}>
                            {row.sn || '[缺少序號]'}
                          </td>
                          <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: '#818cf8', fontWeight: 600 }}>
                            {row.server_sn ? `🖥️ ${row.server_sn}` : '--'}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{row.hostname || '--'}</span>
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{row.client || '--'}</span>
                          </td>
                          <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>
                            {row.order_source || '--'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 匯入進度與結果報告 */}
          {isImporting && (
            <div style={{ backgroundColor: 'var(--bg-surface-subtle)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: '700', marginBottom: '8px', color: 'var(--text-main)' }}>
                <span>正在匯入硬體並建立主檔層級...</span>
                <span>{importProgress}%</span>
              </div>
              <div style={{ height: '8px', backgroundColor: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${importProgress}%`, backgroundColor: '#6366f1', transition: 'width 0.2s ease-out' }} />
              </div>
            </div>
          )}

          {importResult && (
            <div style={{
              backgroundColor: importResult.successCount > 0 ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
              border: `1px solid ${importResult.successCount > 0 ? '#10b981' : '#ef4444'}`,
              borderRadius: '12px',
              padding: '16px'
            }}>
              <div style={{ fontSize: '14px', fontWeight: '800', color: importResult.successCount > 0 ? '#10b981' : '#ef4444', marginBottom: '6px' }}>
                匯入作業完成：成功建立 {importResult.successCount} 筆硬體資料
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                • 成功寫入庫存：<b>{importResult.successCount}</b> 筆<br />
                • 規則略過（缺廠牌/類型/型號/序號）：<b>{importResult.skippedCount}</b> 筆<br />
                • 序號重複阻擋：<b>{importResult.duplicateCount}</b> 筆<br />
                {importResult.failCount > 0 && <span style={{ color: '#ef4444' }}>• 寫入失敗：<b>{importResult.failCount}</b> 筆</span>}
              </div>
            </div>
          )}
        </div>

        {/* 底部按鈕列 */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'var(--bg-surface-subtle)'
        }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {parsedRows.length > 0 && (
              <span>已解析 <b>{parsedRows.length}</b> 筆資料（可匯入: <b style={{ color: '#10b981' }}>{stats.valid}</b> / 略過: <b style={{ color: '#f59e0b' }}>{stats.skipped}</b> / 重複: <b style={{ color: '#ef4444' }}>{stats.duplicate}</b>）</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '9px 18px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-main)',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              {importResult ? '關閉' : '取消'}
            </button>
            <button
              type="button"
              disabled={isImporting || stats.valid === 0}
              onClick={executeImport}
              style={{
                padding: '9px 24px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: (isImporting || stats.valid === 0) ? 'var(--border-color)' : '#6366f1',
                color: '#fff',
                fontSize: '13px',
                fontWeight: '700',
                cursor: (isImporting || stats.valid === 0) ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: (isImporting || stats.valid === 0) ? 'none' : '0 2px 6px rgba(99, 102, 241, 0.35)'
              }}
            >
              <Database size={15} />
              {isImporting ? '匯入處理中...' : `確認批次匯入 (${stats.valid})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HwBatchImportModal;
