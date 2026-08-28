import React, { useState, useRef, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { 
  X, UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle, 
  XCircle, Filter, Layers, Database, ArrowRight, RefreshCw, Info, Download
} from 'lucide-react';
import { logEvent, ACTION_TYPES, MODULE_MAP } from '../utils/auditLogger';
import { parseSpreadsheetFile, fixMojibake } from '../utils/encoding';

const DeviceBatchImportModal = ({ isOpen, onClose, onSuccess, existingBrands = [] }) => {
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [brandInput, setBrandInput] = useState(''); // 廠牌 (Brand) - 無預設值
  const [rawJsonData, setRawJsonData] = useState([]);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'valid', 'skipped', 'duplicate'
  const [existingSns, setExistingSns] = useState(new Set());
  const [importResult, setImportResult] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef(null);

  // 取得資料庫中現有的所有序號 (用於防重複檢核)
  useEffect(() => {
    if (!isOpen) {
      resetState();
      return;
    }
    const loadExistingSns = async () => {
      try {
        const res = await window.electronAPI.namedQuery('fetchAssetSns');
        if (res.success && res.rows) {
          const snSet = new Set(res.rows.map(r => (r.sn || '').trim().toUpperCase()).filter(Boolean));
          setExistingSns(snSet);
        }
      } catch (err) {
        console.error('Failed to load existing SNs:', err);
      }
    };
    loadExistingSns();
  }, [isOpen]);

  const resetState = () => {
    setFile(null);
    setFileName('');
    setBrandInput('');
    setRawJsonData([]);
    setIsProcessingFile(false);
    setIsImporting(false);
    setImportProgress(0);
    setActiveTab('all');
    setImportResult(null);
  };

  // 標準化日期解析函式 (支援 DD/MM/YYYY, YYYY-MM-DD, YYYY/MM/DD, Excel 序列數字)
  const parseNormalizedDate = (rawVal) => {
    if (rawVal === undefined || rawVal === null || rawVal === '') return null;

    // 1. 如果是 Excel 序列日期數字 (如 45484)
    if (typeof rawVal === 'number' && !isNaN(rawVal)) {
      try {
        const dateObj = XLSX.SSF.parse_date_code(rawVal);
        if (dateObj && dateObj.y && dateObj.m && dateObj.d) {
          const y = String(dateObj.y).padStart(4, '0');
          const m = String(dateObj.m).padStart(2, '0');
          const d = String(dateObj.d).padStart(2, '0');
          return `${y}-${m}-${d}`;
        }
      } catch (e) {
        console.warn('Excel date parsing error:', e);
      }
    }

    const str = String(rawVal).trim();
    if (!str) return null;

    // 2. 如果是 DD/MM/YYYY 或 D/M/YYYY
    const dmyMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    if (dmyMatch) {
      const d = String(dmyMatch[1]).padStart(2, '0');
      const m = String(dmyMatch[2]).padStart(2, '0');
      const y = dmyMatch[3];
      return `${y}-${m}-${d}`;
    }

    // 3. 如果是 YYYY/MM/DD 或 YYYY-MM-DD
    const ymdMatch = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
    if (ymdMatch) {
      const y = ymdMatch[1];
      const m = String(ymdMatch[2]).padStart(2, '0');
      const d = String(ymdMatch[3]).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    // 4. JS Date 物件嘗試轉換
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      try {
        return parsed.toISOString().split('T')[0];
      } catch {
        return null;
      }
    }

    return null;
  };

  // 智慧匹配欄位名稱
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
        alert('檔案內容為空，請確認上傳之 Excel / CSV 檔案包含設備資料。');
        setIsProcessingFile(false);
        return;
      }

      setRawJsonData(rawJson);
    } catch (err) {
      console.error('File parsing error:', err);
      alert('解析檔案失敗，請確認檔案格式是否正確：' + err.message);
    } finally {
      setIsProcessingFile(false);
    }
  };

  // 動態即時解析並檢核每一筆資料 (依據 rawJsonData 與 brandInput)
  const parsedRows = useMemo(() => {
    if (!rawJsonData || rawJsonData.length === 0) return [];

    const fileSnCounts = {};
    const processed = [];

    rawJsonData.forEach((row, index) => {
      // 判斷整行是否為空
      const values = Object.values(row).map(v => String(v).trim()).filter(Boolean);
      if (values.length === 0) return; // 略過全空行

      const customer = findColumnValue(row, ['Customer', '客戶', 'Client', '客戶名稱']);
      const hostname = findColumnValue(row, ['HostName', '主機名稱', 'Hostname', 'Host Name']);
      const systemType = findColumnValue(row, ['System Type', 'Type', '類型', '系統類型', 'SystemType']);
      const model = findColumnValue(row, ['Model', '型號', '設備型號']);
      const location = findColumnValue(row, ['Location', '地點', '位置', '機房']);
      const sn = findColumnValue(row, ['Serial Number ( Current )', 'Serial Number (Current)', 'Serial Number', 'SerialNumber', '序號', 'SN', 'S/N']);
      const rawBrand = findColumnValue(row, ['Brand', '廠牌', '品牌']);
      const brand = (rawBrand || brandInput || '').trim();

      const rawSpec = findColumnValue(row, ['Specification', 'Spec', '規格', '設備規格', '規格內容']);
      const spec = (rawSpec || '').trim();

      const installedDateRaw = row['Project Date ( Installed )'] || row['Project Date( Installed )'] || row['Project Date (Installed)'] || findColumnValue(row, ['Project Date ( Installed )', 'Installed Date', '安裝日期', 'Project Date']);
      const customerWarrantyRaw = row['Customer Warranty Expire'] || findColumnValue(row, ['Customer Warranty Expire', 'Customer Warranty', '客戶保固到期', '客戶保固']);
      const systemDateRaw = row['BlackCore System Date'] || findColumnValue(row, ['BlackCore System Date', 'System Date', '系統日期', '原廠系統日期']);
      const warrantyExpireRaw = row['BlackCore Warranty Expire'] || findColumnValue(row, ['BlackCore Warranty Expire', 'Warranty Expire', '原廠保固到期', '原廠保固', '保固到期']);

      const installedDate = parseNormalizedDate(installedDateRaw);
      const customerWarrantyExpire = parseNormalizedDate(customerWarrantyRaw);
      const systemDate = parseNormalizedDate(systemDateRaw);
      const warrantyExpire = parseNormalizedDate(warrantyExpireRaw);

      // 解析出貨狀態：直接依據上傳 Excel/CSV 中 Status/狀態 欄位判定（預設為 ACTIVE）
      const rowStatusRaw = findColumnValue(row, ['Status', '狀態', '資產狀態', '出貨狀態', '設備狀態']);
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

      // 規則 1：廠牌 / 型號 / 類型 缺一不建立
      if (!brand) {
        status = 'SKIPPED';
        skipReason = '缺少廠牌 (Brand)';
      } else if (!systemType || !systemType.trim()) {
        status = 'SKIPPED';
        skipReason = '缺少類型 (System Type)';
      } else if (!model || !model.trim()) {
        status = 'SKIPPED';
        skipReason = '缺少型號 (Model)';
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
          skipReason = '此序號已存在於系統設備清冊中';
        }
      }

      processed.push({
        rowIndex: index + 2, // 包含標題列的行號 (Excel 1-based)
        brand,
        type: (systemType || '').trim(),
        model: (model || '').trim(),
        specification: spec,
        sn: (sn || '').trim(),
        client: (customer || '').trim(),
        hostname: (hostname || '').trim(),
        location: (location || '').trim(),
        installed_date: installedDate,
        customer_warranty_expire: customerWarrantyExpire,
        system_date: systemDate,
        warranty_expire: warrantyExpire,
        itemStatus,
        status,
        skipReason,
        rawInstalledDate: installedDateRaw,
        rawWarrantyExpire: warrantyExpireRaw
      });
    });

    return processed;
  }, [rawJsonData, brandInput, existingSns]);

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

  // 過濾後的顯示列表
  const displayedRows = useMemo(() => {
    if (activeTab === 'valid') return parsedRows.filter(r => r.status === 'VALID');
    if (activeTab === 'skipped') return parsedRows.filter(r => r.status === 'SKIPPED');
    if (activeTab === 'duplicate') return parsedRows.filter(r => r.status === 'DUPLICATE');
    return parsedRows;
  }, [parsedRows, activeTab]);

  // 執行批次匯入
  const handleExecuteImport = async () => {
    const validItems = parsedRows.filter(r => r.status === 'VALID');
    if (validItems.length === 0) {
      alert('目前沒有符合建立條件的設備資料（請確認是否已填寫廠牌、型號與類型，或檢查是否序號重複）。');
      return;
    }

    if (!window.confirm(`確定要將 ${validItems.length} 筆設備資料匯入建立至系統設備庫存嗎？`)) {
      return;
    }

    setIsImporting(true);
    setImportProgress(0);

    let successCount = 0;
    let failCount = 0;
    const errors = [];

    try {
      // 1. 預先收集所有 distinct (brand, type, model) 與客戶，確保主檔存在
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
        await window.electronAPI.namedQuery('insertDeviceBrand', ['設備', brand]);
      }

      // 自動補齊 類型 (Type)
      for (const [brand, types] of typeMap.entries()) {
        for (const type of types) {
          await window.electronAPI.namedQuery('insertDeviceType', ['設備', brand, type]);
        }
      }

      // 自動補齊 型號 (Model)
      for (const [key, models] of modelMap.entries()) {
        const [brand, type] = key.split('___');
        for (const model of models) {
          await window.electronAPI.namedQuery('insertDeviceModel', [brand, type, '設備', model]);
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
        const masterKey = `${item.brand}___${item.type}___${item.model}___${item.specification || ''}`;

        try {
          let masterId = masterCache.get(masterKey);
          if (!masterId) {
            const findRes = await window.electronAPI.namedQuery('findItemMaster', [item.specification || '', item.type, item.brand, item.model]);
            if (findRes.success && findRes.rows.length > 0) {
              masterId = findRes.rows[0].id;
            } else {
              const createMasterRes = await window.electronAPI.namedQuery('insertItemMaster', [item.specification || '', item.type, item.brand, item.model, '台', '設備']);
              if (createMasterRes.success && createMasterRes.rows.length > 0) {
                masterId = createMasterRes.rows[0].id;
              }
            }
            if (masterId) masterCache.set(masterKey, masterId);
          }

          if (!masterId) {
            throw new Error(`無法建立或找到物料主檔 [${item.brand} ${item.model}]`);
          }

          // 寫入 Asset 實體
          const customAttributes = {
            batch_imported: true,
            import_file: fileName,
            import_date: new Date().toISOString()
          };

          const insertAssetRes = await window.electronAPI.namedQuery('insertAssetRecord', [
            masterId,
            item.sn || null,
            item.client || null,
            item.hostname || null,
            item.location || null,
            item.installed_date,
            item.customer_warranty_expire,
            item.system_date,
            item.warranty_expire,
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
        module: MODULE_MAP.DEVICE.key,
        moduleLabel: MODULE_MAP.DEVICE.label,
        targetId: fileName,
        targetName: `${brandInput || '批次'} 設備批次匯入`,
        summary: `批次匯入 ${fileName}：成功建立 ${successCount} 筆設備，略過 ${stats.skipped} 筆，衝突 ${stats.duplicate} 筆`,
        details: {
          fileName,
          totalRows: parsedRows.length,
          successCount,
          failCount,
          skippedCount: stats.skipped,
          duplicateCount: stats.duplicate,
          brand: brandInput,
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
      console.error('Batch Import Error:', err);
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
        width: '95%',
        maxWidth: '1200px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: 'var(--modal-shadow)',
        border: '1px solid var(--border-color)',
        overflow: 'hidden',
        animation: 'fadeIn 0.2s ease-out'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
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
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#10b981'
            }}>
              <FileSpreadsheet size={22} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: 'var(--text-main)' }}>
                設備清單批次匯入 (Excel / CSV Batch Import)
              </h2>
              <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                支援設備清單自動解析、主檔層級建立（廠牌/類型/型號）與序號防重複檢核
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

        {/* Modal Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* 上傳與設定區域 */}
          {!importResult && (
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr', gap: '20px' }}>
              {/* 參數設定卡片 */}
              <div style={{
                backgroundColor: 'var(--bg-surface-subtle)',
                padding: '16px',
                borderRadius: '12px',
                border: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px'
              }}>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Layers size={16} color="var(--primary-color)" /> 匯入參數設定
                </h4>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px' }}>
                    廠牌 (Brand)
                  </label>
                  <input
                    type="text"
                    value={brandInput}
                    onChange={(e) => setBrandInput(e.target.value)}
                    placeholder="請輸入或選擇廠牌 (例: BlackCore)"
                    list="batch-import-brands-list"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--input-border)',
                      backgroundColor: 'var(--input-bg)',
                      color: 'var(--input-text)',
                      fontSize: '13px',
                      boxSizing: 'border-box'
                    }}
                  />
                  <datalist id="batch-import-brands-list">
                    {existingBrands.map(b => (
                      <option key={b.id || b.name} value={b.name} />
                    ))}
                  </datalist>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                    若檔案中無「廠牌」欄位，將以此處填寫之廠牌建檔；若檔案與此處皆未填寫，將判定為缺少廠牌並略過。
                  </span>
                </div>

                {/* 規則說明小提示 */}
                <div style={{
                  padding: '10px 12px',
                  backgroundColor: 'rgba(234, 88, 12, 0.08)',
                  borderRadius: '8px',
                  border: '1px solid rgba(234, 88, 12, 0.2)',
                  fontSize: '12px',
                  color: '#ea580c',
                  lineHeight: '1.4'
                }}>
                  <div style={{ fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                    <Info size={14} /> 內控規則檢核提醒：
                  </div>
                  <b>廠牌／型號／類型 缺一不建立</b>。若清單中該行未填寫 Model（如 Model 欄為空白），系統將自動判定為略過且不建立。
                </div>
              </div>

              {/* 拖曳上傳卡片 */}
              <div 
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: isDragging ? '2px dashed var(--primary-color)' : '2px dashed var(--border-color)',
                  backgroundColor: isDragging ? 'rgba(37, 99, 235, 0.05)' : 'var(--bg-surface-subtle)',
                  borderRadius: '12px',
                  padding: '30px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  position: 'relative'
                }}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => e.target.files && handleFileProcess(e.target.files[0])}
                  accept=".xlsx, .xls, .csv"
                  style={{ display: 'none' }}
                />
                
                <div style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(37, 99, 235, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--primary-color)',
                  marginBottom: '12px'
                }}>
                  <UploadCloud size={30} />
                </div>

                <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '4px' }}>
                  {fileName ? `已選取：${fileName}` : '點擊選取或拖曳 Excel / CSV 檔案至此處'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  支援 .xlsx, .xls, .csv 格式 (自動比對 Customer, HostName, System Type, Model, SN 等欄位)
                </div>

                {fileName && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      resetState();
                    }}
                    style={{
                      marginTop: '12px',
                      padding: '4px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--text-muted)',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    重新選擇檔案
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 匯入完成成功畫面 */}
          {importResult && (
            <div style={{
              padding: '32px 24px',
              backgroundColor: 'rgba(16, 185, 129, 0.08)',
              borderRadius: '12px',
              border: '1px solid rgba(16, 185, 129, 0.2)',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px'
            }}>
              <CheckCircle2 size={48} color="#10b981" />
              <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: '#10b981' }}>
                批次匯入作業完成！
              </h3>
              <div style={{ fontSize: '14px', color: 'var(--text-main)', display: 'flex', gap: '20px', marginTop: '8px' }}>
                <span>✅ 成功建立：<b>{importResult.successCount}</b> 筆</span>
                <span>⚠️ 自動略過（缺型號/類型/廠牌）：<b>{importResult.skippedCount}</b> 筆</span>
                <span>❌ 序號重複：<b>{importResult.duplicateCount}</b> 筆</span>
                {importResult.failCount > 0 && <span style={{ color: '#ef4444' }}>❌ 失敗：<b>{importResult.failCount}</b> 筆</span>}
              </div>
              {importResult.errors && importResult.errors.length > 0 && (
                <div style={{
                  marginTop: '12px',
                  padding: '12px',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: '#ef4444',
                  textAlign: 'left',
                  maxHeight: '120px',
                  overflowY: 'auto',
                  width: '100%',
                  maxWidth: '600px'
                }}>
                  {importResult.errors.map((err, idx) => (
                    <div key={idx}>• {err}</div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                <button
                  onClick={onClose}
                  style={{
                    padding: '10px 24px',
                    borderRadius: '8px',
                    backgroundColor: '#10b981',
                    color: '#fff',
                    border: 'none',
                    fontWeight: '700',
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  完成並返回
                </button>
              </div>
            </div>
          )}

          {/* 解析後的即時預覽與檢核區域 */}
          {parsedRows.length > 0 && !importResult && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1 }}>
              {/* 統計與頁籤切換列 */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
                borderBottom: '1px solid var(--border-color)',
                paddingBottom: '12px'
              }}>
                {/* 頁籤 */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setActiveTab('all')}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '8px',
                      border: 'none',
                      backgroundColor: activeTab === 'all' ? 'var(--primary-color)' : 'var(--bg-surface-subtle)',
                      color: activeTab === 'all' ? '#fff' : 'var(--text-main)',
                      fontWeight: '700',
                      fontSize: '13px',
                      cursor: 'pointer'
                    }}
                  >
                    全部項目 ({stats.total})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('valid')}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '8px',
                      border: 'none',
                      backgroundColor: activeTab === 'valid' ? '#10b981' : 'var(--bg-surface-subtle)',
                      color: activeTab === 'valid' ? '#fff' : 'var(--text-main)',
                      fontWeight: '700',
                      fontSize: '13px',
                      cursor: 'pointer'
                    }}
                  >
                    ✅ 待建立 ({stats.valid})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('skipped')}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '8px',
                      border: 'none',
                      backgroundColor: activeTab === 'skipped' ? '#f59e0b' : 'var(--bg-surface-subtle)',
                      color: activeTab === 'skipped' ? '#fff' : 'var(--text-main)',
                      fontWeight: '700',
                      fontSize: '13px',
                      cursor: 'pointer'
                    }}
                  >
                    ⚠️ 略過項目 ({stats.skipped})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('duplicate')}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '8px',
                      border: 'none',
                      backgroundColor: activeTab === 'duplicate' ? '#ef4444' : 'var(--bg-surface-subtle)',
                      color: activeTab === 'duplicate' ? '#fff' : 'var(--text-main)',
                      fontWeight: '700',
                      fontSize: '13px',
                      cursor: 'pointer'
                    }}
                  >
                    ❌ 序號重複 ({stats.duplicate})
                  </button>
                </div>

                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  預計將寫入 <b style={{ color: '#10b981', fontSize: '15px' }}>{stats.valid}</b> 台設備
                </div>
              </div>

              {/* 預覽表格 */}
              <div style={{
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                overflow: 'auto',
                maxHeight: '380px',
                backgroundColor: 'var(--bg-surface)'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                  <thead style={{
                    position: 'sticky',
                    top: 0,
                    backgroundColor: 'var(--bg-surface-subtle)',
                    borderBottom: '2px solid var(--border-color)',
                    zIndex: 10
                  }}>
                    <tr>
                      <th style={{ padding: '10px 12px', fontWeight: '700', color: 'var(--text-muted)' }}>行號</th>
                      <th style={{ padding: '10px 12px', fontWeight: '700', color: 'var(--text-muted)' }}>檢核狀態</th>
                      <th style={{ padding: '10px 12px', fontWeight: '700', color: 'var(--text-muted)' }}>初始狀態</th>
                      <th style={{ padding: '10px 12px', fontWeight: '700', color: 'var(--text-muted)' }}>設備序號 (SN)</th>
                      <th style={{ padding: '10px 12px', fontWeight: '700', color: 'var(--text-muted)' }}>客戶 (Customer)</th>
                      <th style={{ padding: '10px 12px', fontWeight: '700', color: 'var(--text-muted)' }}>主機名稱 (HostName)</th>
                      <th style={{ padding: '10px 12px', fontWeight: '700', color: 'var(--text-muted)' }}>廠牌 (Brand)</th>
                      <th style={{ padding: '10px 12px', fontWeight: '700', color: 'var(--text-muted)' }}>類型 (Type)</th>
                      <th style={{ padding: '10px 12px', fontWeight: '700', color: 'var(--text-muted)' }}>型號 (Model)</th>
                      <th style={{ padding: '10px 12px', fontWeight: '700', color: 'var(--text-muted)' }}>地點 (Location)</th>
                      <th style={{ padding: '10px 12px', fontWeight: '700', color: 'var(--text-muted)' }}>安裝日期</th>
                      <th style={{ padding: '10px 12px', fontWeight: '700', color: 'var(--text-muted)' }}>保固到期</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedRows.length === 0 ? (
                      <tr>
                        <td colSpan={12} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
                          此分類目前無資料
                        </td>
                      </tr>
                    ) : (
                      displayedRows.map((row, idx) => {
                        let badgeBg = 'rgba(16, 185, 129, 0.1)';
                        let badgeColor = '#10b981';
                        let badgeText = '可建立';

                        if (row.status === 'SKIPPED') {
                          badgeBg = 'rgba(245, 158, 11, 0.15)';
                          badgeColor = '#f59e0b';
                          badgeText = row.skipReason || '略過';
                        } else if (row.status === 'DUPLICATE') {
                          badgeBg = 'rgba(239, 68, 68, 0.15)';
                          badgeColor = '#ef4444';
                          badgeText = row.skipReason || '重複序號';
                        }

                        return (
                          <tr key={idx} style={{
                            borderBottom: '1px solid var(--border-color)',
                            backgroundColor: row.status === 'SKIPPED' ? 'rgba(245, 158, 11, 0.02)' : (row.status === 'DUPLICATE' ? 'rgba(239, 68, 68, 0.02)' : 'transparent'),
                            opacity: row.status !== 'VALID' ? 0.75 : 1
                          }}>
                            <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>#{row.rowIndex}</td>
                            <td style={{ padding: '8px 12px' }}>
                              <span style={{
                                padding: '3px 8px',
                                borderRadius: '12px',
                                fontSize: '11px',
                                fontWeight: '700',
                                backgroundColor: badgeBg,
                                color: badgeColor,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}>
                                {row.status === 'VALID' && <CheckCircle2 size={12} />}
                                {row.status === 'SKIPPED' && <AlertTriangle size={12} />}
                                {row.status === 'DUPLICATE' && <XCircle size={12} />}
                                {badgeText}
                              </span>
                            </td>
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
                            <td style={{ padding: '8px 12px', fontWeight: '700', fontFamily: 'monospace', color: 'var(--text-main)' }}>
                              {row.sn || '<無序號>'}
                            </td>
                            <td style={{ padding: '8px 12px', color: 'var(--text-main)' }}>{row.client || '-'}</td>
                            <td style={{ padding: '8px 12px', color: 'var(--text-main)' }}>{row.hostname || '-'}</td>
                            <td style={{ padding: '8px 12px', color: 'var(--text-main)' }}>
                              {row.brand ? (
                                row.brand
                              ) : (
                                <span style={{ color: '#ef4444', fontWeight: '700' }}>[未填廠牌]</span>
                              )}
                            </td>
                            <td style={{ padding: '8px 12px', color: 'var(--text-main)' }}>
                              {row.type ? (
                                <span style={{ padding: '2px 6px', borderRadius: '4px', backgroundColor: 'var(--bg-surface-subtle)', fontWeight: '600' }}>
                                  {row.type}
                                </span>
                              ) : (
                                <span style={{ color: '#ef4444', fontWeight: '700' }}>[空白]</span>
                              )}
                            </td>
                            <td style={{ padding: '8px 12px', color: 'var(--text-main)' }}>
                              {row.model ? (
                                <span style={{ padding: '2px 6px', borderRadius: '4px', backgroundColor: 'var(--bg-surface-subtle)', fontWeight: '600' }}>
                                  {row.model}
                                </span>
                              ) : (
                                <span style={{ color: '#ef4444', fontWeight: '700' }}>[空白]</span>
                              )}
                            </td>
                            <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{row.location || '-'}</td>
                            <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{row.installed_date || '-'}</td>
                            <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{row.warranty_expire || '-'}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 進度條 */}
          {isImporting && (
            <div style={{ marginTop: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: '600', marginBottom: '6px', color: 'var(--text-main)' }}>
                <span>正在寫入設備資料庫與主檔階層...</span>
                <span>{importProgress}%</span>
              </div>
              <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${importProgress}%`, height: '100%', backgroundColor: 'var(--primary-color)', transition: 'width 0.2s' }} />
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'var(--bg-surface-subtle)'
        }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {parsedRows.length > 0 && !importResult && (
              <span>已載入 <b>{parsedRows.length}</b> 筆設備紀錄</span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={onClose}
              disabled={isImporting}
              style={{
                padding: '8px 18px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-main)',
                fontWeight: '600',
                fontSize: '13px',
                cursor: isImporting ? 'not-allowed' : 'pointer'
              }}
            >
              取消
            </button>
            {parsedRows.length > 0 && !importResult && (
              <button
                onClick={handleExecuteImport}
                disabled={isImporting || stats.valid === 0}
                style={{
                  padding: '8px 22px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: stats.valid > 0 ? '#10b981' : '#9ca3af',
                  color: '#fff',
                  fontWeight: '700',
                  fontSize: '13px',
                  cursor: (isImporting || stats.valid === 0) ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: stats.valid > 0 ? '0 2px 8px rgba(16, 185, 129, 0.3)' : 'none'
                }}
              >
                {isImporting ? (
                  <>
                    <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} /> 匯入建檔中...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={16} /> 確認匯入 ({stats.valid} 筆可建立)
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeviceBatchImportModal;
