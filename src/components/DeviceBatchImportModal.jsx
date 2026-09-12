import React, { useState, useRef, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { 
  X, UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle, 
  XCircle, Filter, Layers, Database, ArrowRight, RefreshCw, Info, Download
} from 'lucide-react';
import { logEvent, ACTION_TYPES, MODULE_MAP } from '../utils/auditLogger';
import { parseSpreadsheetFile, fixMojibake } from '../utils/encoding';
import { matchPartnerContact } from '../utils/partnerMatcher';
import { normalizeMasterName } from '../utils/normalizeMasterData';

const DeviceBatchImportModal = ({ isOpen, onClose, onSuccess, existingBrands = [] }) => {
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [typeInput, setTypeInput] = useState(''); // 類型 (Type) - 匯入參數設定 (無預設值)
  const [brandInput, setBrandInput] = useState(''); // 廠牌 (Brand) - 無預設值
  const [existingTypes, setExistingTypes] = useState([]);
  const [rawJsonData, setRawJsonData] = useState([]);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'valid', 'skipped', 'duplicate'
  const [existingSns, setExistingSns] = useState(new Set());
  const [partners, setPartners] = useState([]);
  const [importResult, setImportResult] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  // 自訂欄位與對應狀態
  const [customFieldDefs, setCustomFieldDefs] = useState([]);
  const [fileHeaders, setFileHeaders] = useState([]);
  const [customFieldMapping, setCustomFieldMapping] = useState({});
  const [fileDuplicateHeaders, setFileDuplicateHeaders] = useState([]);

  const fileInputRef = useRef(null);

  // 取得資料庫中現有的所有序號、設備類型與自訂欄位定義 (用於防重複檢核與欄位對應)
  useEffect(() => {
    if (!isOpen) {
      resetState();
      return;
    }
    const loadInitialData = async () => {
      try {
        const [snsRes, typesRes, defsRes, partnersRes] = await Promise.all([
          window.electronAPI.namedQuery('fetchAssetSns'),
          window.electronAPI.namedQuery('fetchDeviceTypes'),
          window.electronAPI.namedQuery('getSystemSetting', ['customFieldDefinitions']),
          window.electronAPI.namedQuery('fetchPartners')
        ]);
        if (snsRes.success && snsRes.rows) {
          const snSet = new Set(snsRes.rows.map(r => (r.sn || '').trim().toUpperCase()).filter(Boolean));
          setExistingSns(snSet);
        }
        if (typesRes && typesRes.success && typesRes.rows) {
          setExistingTypes(typesRes.rows);
        }
        if (partnersRes && partnersRes.success && partnersRes.rows) {
          setPartners(partnersRes.rows);
        }
        if (defsRes && defsRes.success && defsRes.rows.length > 0) {
          const allDefs = defsRes.rows[0].value || [];
          const nativeIds = ['hostname', 'sn', 'specification', 'client', 'location', 'installed_date', 'system_date', 'warranty_expire', 'customer_warranty_expire'];
          const customOnly = allDefs.filter(d => d && d.id && !nativeIds.includes(d.id));
          setCustomFieldDefs(customOnly);
        }
      } catch (err) {
        console.error('Failed to load initial data for batch import:', err);
      }
    };
    loadInitialData();
  }, [isOpen]);

  const resetState = () => {
    setFile(null);
    setFileName('');
    setTypeInput('');
    setBrandInput('');
    setRawJsonData([]);
    setFileHeaders([]);
    setCustomFieldMapping({});
    setFileDuplicateHeaders([]);
    setIsProcessingFile(false);
    setIsImporting(false);
    setImportProgress(0);
    setActiveTab('all');
    setImportResult(null);
  };

  // 智慧比對自訂欄位與檔案表頭 (嚴格隔離 OS Type，避免誤對應至設備類型)
  const findMatchingHeader = (headers, field) => {
    if (!headers || headers.length === 0 || !field) return '';
    const normalize = (str) => String(str || '').trim().toLowerCase().replace(/[\s_\(\)\-\[\]\/\\:]/g, '');
    const normLabel = normalize(field.label);
    const normId = normalize(field.id);
    const isTypeField = normLabel === 'type' || normLabel === '類型' || normId === 'type';

    // 1. 精準比對 (對應 label 或 id)
    for (const h of headers) {
      const nh = normalize(h);
      // 若為設備類型欄位，排除包含 os 或 作業系統 的表頭
      if (isTypeField && (nh.includes('os') || nh.includes('作業系統'))) continue;
      if (nh && (nh === normLabel || nh === normId)) {
        return h;
      }
    }

    // 2. 寬鬆比對 (包含關係，字元數大於等於 2)
    if (normLabel.length >= 2) {
      for (const h of headers) {
        const nh = normalize(h);
        if (isTypeField && (nh.includes('os') || nh.includes('作業系統'))) continue;
        if (nh && (nh.includes(normLabel) || normLabel.includes(nh))) {
          return h;
        }
      }
    }

    return '';
  };

  // 標準化日期解析函式 (支援 DD/MM/YYYY, YYYY-MM-DD, YYYY/MM/DD, Excel 序列數字與數值字串)
  const parseNormalizedDate = (rawVal) => {
    if (rawVal === undefined || rawVal === null || rawVal === '') return null;

    // 1. Date 物件 (使用本地年月日時區，避免 toISOString() 造成日期被減一天)
    if (rawVal instanceof Date && !isNaN(rawVal.getTime())) {
      const y = rawVal.getFullYear();
      const m = String(rawVal.getMonth() + 1).padStart(2, '0');
      const d = String(rawVal.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    // 2. 如果是 Excel 序列日期數字或純數字字串 (例如 45484 或 '45484')
    const strVal = String(rawVal).trim();
    const isPureNum = typeof rawVal === 'number' || (/^\d{4,6}(\.\d+)?$/.test(strVal) && !strVal.includes('/') && !strVal.includes('-'));
    if (isPureNum) {
      const numVal = Number(rawVal);
      if (!isNaN(numVal) && numVal >= 1000 && numVal <= 100000) {
        try {
          const dateObj = XLSX.SSF.parse_date_code(numVal);
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
    }

    if (!strVal) return null;

    // 清除時間部分 (例如 '2024-07-10 00:00:00' 或 '26/05/2023 14:30:00')
    const dateStr = strVal.replace(/T.*$/, '').split(/\s+/)[0];

    // 3. 如果是 DD/MM/YYYY 或 D/M/YYYY
    const dmyMatch = dateStr.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
    if (dmyMatch) {
      const d = String(dmyMatch[1]).padStart(2, '0');
      const m = String(dmyMatch[2]).padStart(2, '0');
      let y = dmyMatch[3];
      if (y.length === 2) {
        y = Number(y) > 50 ? '19' + y : '20' + y;
      }
      return `${y}-${m}-${d}`;
    }

    // 4. 如果是 YYYY/MM/DD 或 YYYY-MM-DD
    const ymdMatch = dateStr.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
    if (ymdMatch) {
      const y = ymdMatch[1];
      const m = String(ymdMatch[2]).padStart(2, '0');
      const d = String(ymdMatch[3]).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    // 5. JS Date 物件嘗試轉換 (限制合理年份 1970 ~ 2100，避免年份誤轉為 +045359)
    const parsed = new Date(strVal);
    if (!isNaN(parsed.getTime()) && parsed.getFullYear() >= 1970 && parsed.getFullYear() <= 2100) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const d = String(parsed.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    return null;
  };

  // 智慧匹配欄位名稱 (支援排除指定關鍵字，如尋找 Type 時排除 OS Type)
  const findColumnValue = (rowObj, possibleKeys, excludedKeywords = []) => {
    if (!rowObj) return '';
    // 1. 精準比對 (忽略空格、大小寫、符號等)
    for (const key of Object.keys(rowObj)) {
      const normalizedKey = key.trim().toLowerCase().replace(/[\s_\(\)\-\[\]\/\\:]/g, '');
      if (excludedKeywords.some(ex => normalizedKey.includes(ex.toLowerCase()))) continue;
      for (const pk of possibleKeys) {
        const normalizedPk = pk.trim().toLowerCase().replace(/[\s_\(\)\-\[\]\/\\:]/g, '');
        if (normalizedKey === normalizedPk) {
          const val = rowObj[key];
          if (val === undefined || val === null || val === '') return '';
          return typeof val === 'number' ? val : fixMojibake(String(val).trim());
        }
      }
    }
    // 2. 寬鬆包含比對 (例如標題包含 "spec" 或 "規格")
    for (const key of Object.keys(rowObj)) {
      const normalizedKey = key.trim().toLowerCase().replace(/[\s_\(\)\-\[\]\/\\:]/g, '');
      if (excludedKeywords.some(ex => normalizedKey.includes(ex.toLowerCase()))) continue;
      for (const pk of possibleKeys) {
        const normalizedPk = pk.trim().toLowerCase().replace(/[\s_\(\)\-\[\]\/\\:]/g, '');
        if (normalizedPk.length >= 2 && normalizedKey.includes(normalizedPk)) {
          const val = rowObj[key];
          if (val !== undefined && val !== null && val !== '' && String(val).trim() !== '') {
            return typeof val === 'number' ? val : fixMojibake(String(val).trim());
          }
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

      const headers = Object.keys(rawJson[0] || {});
      setFileHeaders(headers);

      // 檢查上傳檔案中是否有相同名稱的表頭欄位
      const dupHeaders = rawJson._duplicateHeaders || [];
      setFileDuplicateHeaders(dupHeaders);
      if (dupHeaders.length > 0) {
        alert(`【欄位重複告警】上傳檔案中檢測到相同名稱的欄位表頭：「${dupHeaders.join('、')}」！\n同名欄位可能導致資料覆蓋或對應混淆，請確認檔案欄位名稱是否正確。`);
      }

      // 自動匹配自訂欄位
      const initialMapping = {};
      customFieldDefs.forEach(field => {
        const matched = findMatchingHeader(headers, field);
        if (matched) initialMapping[field.id] = matched;
      });
      setCustomFieldMapping(initialMapping);

      setRawJsonData(rawJson);
    } catch (err) {
      console.error('File parsing error:', err);
      alert('解析檔案失敗，請確認檔案格式是否正確：' + err.message);
    } finally {
      setIsProcessingFile(false);
    }
  };

  // 當表頭或自訂欄位載入後，補充尚未配對的欄位
  useEffect(() => {
    if (fileHeaders.length === 0 || customFieldDefs.length === 0) return;
    setCustomFieldMapping(prev => {
      let changed = false;
      const updated = { ...prev };
      customFieldDefs.forEach(field => {
        if (updated[field.id] === undefined) {
          const matched = findMatchingHeader(fileHeaders, field);
          if (matched) {
            updated[field.id] = matched;
            changed = true;
          } else {
            updated[field.id] = '';
          }
        }
      });
      return changed ? updated : prev;
    });
  }, [fileHeaders, customFieldDefs]);

  // 重新自動對應
  const handleAutoDetectMapping = () => {
    if (!fileHeaders || fileHeaders.length === 0) return;
    const newMapping = {};
    customFieldDefs.forEach(field => {
      const matched = findMatchingHeader(fileHeaders, field);
      newMapping[field.id] = matched || '';
    });
    setCustomFieldMapping(newMapping);
  };

  // 下載設備匯入範本 (動態包含自訂欄位)
  const handleDownloadTemplate = () => {
    const sampleRow = {
      'Customer': '元大Yuanta',
      'End-user': '範例使用者',
      'Contact': 'Niky',
      'HostName': 'HFT24C-16',
      'System Type': 'Server',
      'Brand': 'BlackCore',
      'Model': 'BCHFT-1PC',
      'Specification': 'Intel Xeon 24C / 128G RAM',
      'Location': 'BQDC-Rack01',
      'Serial Number ( Current )': 'SN-SAMPLE-001',
      'Project Date ( Installed )': '2024-07-11',
      'Customer Warranty Expire': '2027-06-20',
      'BlackCore System Date': '2024-07-11',
      'BlackCore Warranty Expire': '2027-06-20',
      'Status': 'ACTIVE'
    };

    // 動態附加上自訂欄位
    customFieldDefs.forEach(f => {
      sampleRow[f.label] = `範例${f.label}`;
    });

    const sampleData = [
      sampleRow,
      {
        ...sampleRow,
        'HostName': 'HFT24C-17',
        'Serial Number ( Current )': 'SN-SAMPLE-002',
        'Status': 'SHIPPED'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Devices_Import_Template');
    XLSX.writeFile(wb, '設備清單批次匯入範本.xlsx');
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
      const endUser = findColumnValue(row, [
        'End-user', 'End user', 'EndUser', 'End_user',
        '最終使用者', '最終客戶', '終端使用者', '終端客戶', '使用者',
        'End Customer', 'EndCustomer'
      ]);
      const rawContact = findColumnValue(row, [
        'Contact', 'Contact Person', 'ContactPerson', '聯絡人', '窗口',
        '客戶聯絡人', '廠商聯絡人', '聯絡窗口', '窗口人員', '負責人', 'Contact Name'
      ]);
      const hostname = findColumnValue(row, ['HostName', '主機名稱', 'Hostname', 'Host Name']);
      const rawSystemType = findColumnValue(
        row,
        ['System Type', 'Type', '類型', '系統類型', 'SystemType'],
        ['os', 'ostype', '作業系統', 'operatingsystem']
      );
      const systemType = (rawSystemType || typeInput || '').trim();
      const model = findColumnValue(row, ['Model', '型號', '設備型號']);
      const location = findColumnValue(row, ['Location', '地點', '位置', '機房']);
      const sn = findColumnValue(row, ['Serial Number ( Current )', 'Serial Number (Current)', 'Serial Number', 'SerialNumber', '序號', 'SN', 'S/N']);
      const rawBrand = findColumnValue(row, ['Brand', '廠牌', '品牌']);
      const brand = (rawBrand || brandInput || '').trim();

      const rawSpec = findColumnValue(row, ['Specification', 'Spec', '規格', '設備規格', '規格內容', '產品規格', '硬體規格', '規格描述', '詳細規格', '規格說明']);
      const spec = (rawSpec || '').trim();

      // 智慧匹配 4 種日期欄位 (支援各種別名、空格與英文字母拼寫)
      const installedDateRaw = 
        row['Project Date ( Installedl )'] ||
        row['Project Date (Installedl)'] ||
        row['Project Date ( Installed )'] || 
        row['Project Date( Installed )'] || 
        row['Project Date (Installed)'] || 
        findColumnValue(row, [
          'Project Date ( Installedl )', 'Project Date (Installedl)',
          'Project Date ( Installed )', 'Project Date (Installed)', 'Project Date( Installed )',
          'Installed Date', 'InstalledDate', 'Installed', '安裝日期', '專案安裝日期', '安裝日', 'Project Date', 'ProjectDate'
        ]);

      const customerWarrantyRaw = 
        row['Customer Warranty Expire'] || 
        row['Customer Warranty Expiry'] || 
        row['Customer Warranty'] || 
        findColumnValue(row, [
          'Customer Warranty Expire', 'Customer Warranty Expiry', 'Customer Warranty', 
          '客戶保固到期', '客戶保固', '客戶保固日', 'Cust Warranty Expire', 'Cust Warranty', 'CustomerWarrantyExpire'
        ]);

      const systemDateRaw = 
        row['BlackCore System Date'] || 
        row['System Date'] || 
        findColumnValue(row, [
          'BlackCore System Date', 'Black Core System Date', 'System Date', 'SystemDate', 
          '原廠系統日期', '原廠系統日', '系統日期', '系統日', 'BC System Date'
        ]);

      const warrantyExpireRaw = 
        row['BlackCore Warranty Expire'] || 
        row['BlackCore Warranty Expiry'] || 
        row['Warranty Expire'] || 
        findColumnValue(row, [
          'BlackCore Warranty Expire', 'Black Core Warranty Expire', 'BlackCore Warranty Expiry', 'BlackCore Warranty', 
          'Warranty Expire', 'Warranty Expiry', '原廠保固到期', '原廠保固', '保固到期', '保固到期日', 'BC Warranty Expire'
        ]);

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

      // 規則 1：類型 / 廠牌 / 型號 缺一不建立
      if (!systemType) {
        status = 'SKIPPED';
        skipReason = '缺少類型 (Type)';
      } else if (!brand) {
        status = 'SKIPPED';
        skipReason = '缺少廠牌 (Brand)';
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

      // 提取自訂欄位數值
      const rowCustomAttrs = {};
      let customContactVal = '';
      customFieldDefs.forEach(f => {
        const mappedCol = customFieldMapping[f.id];
        if (mappedCol && row[mappedCol] !== undefined && row[mappedCol] !== null) {
          const v = String(row[mappedCol]).trim();
          if (v !== '') {
            rowCustomAttrs[f.id] = fixMojibake(v);
            if (f.id === 'contact_person' || (f.label && f.label.includes('聯絡人'))) {
              customContactVal = v;
            }
          }
        }
      });

      // 智慧客戶與聯絡人比對 (支援模糊比對，如 Niky imc -> Niky)
      const inputContact = (rawContact || customContactVal || '').trim();
      const contactMatch = matchPartnerContact(inputContact, customer, partners);
      const finalContact = contactMatch.contact_person;
      const finalPhone = contactMatch.contact_phone;
      const finalClient = (customer || '').trim() || contactMatch.client;

      if (finalContact) {
        rowCustomAttrs.contact_person = finalContact;
      }
      if (finalPhone) {
        rowCustomAttrs.contact_phone = finalPhone;
      }
      if (contactMatch.isFuzzy && inputContact) {
        rowCustomAttrs.raw_contact_person = inputContact;
      }
      if (contactMatch.matched_project || contactMatch.matched_relation) {
        const matchedRel = contactMatch.matched_relation || contactMatch.matched_project;
        if (!rowCustomAttrs.related_info) rowCustomAttrs.related_info = matchedRel;
        if (!rowCustomAttrs.關聯) rowCustomAttrs.關聯 = matchedRel;
        if (!rowCustomAttrs.關聯資訊) rowCustomAttrs.關聯資訊 = matchedRel;
      }

      if (endUser && String(endUser).trim()) {
        rowCustomAttrs.end_user = String(endUser).trim();
      }

      processed.push({
        rowIndex: index + 2, // 包含標題列的行號 (Excel 1-based)
        brand,
        type: (systemType || '').trim(),
        model: (model || '').trim(),
        specification: spec,
        sn: (sn || '').trim(),
        client: finalClient,
        end_user: (endUser || '').trim(),
        contact_person: finalContact,
        contact_phone: finalPhone,
        contactMatch,
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
        rawWarrantyExpire: warrantyExpireRaw,
        custom_attributes: rowCustomAttrs
      });
    });

    return processed;
  }, [rawJsonData, typeInput, brandInput, existingSns, customFieldMapping, customFieldDefs, partners]);

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

  // 檢查自訂欄位對應中是否有衝突（多個欄位同時對應至相同檔案欄位）
  const duplicateMappings = useMemo(() => {
    const counts = {};
    Object.entries(customFieldMapping).forEach(([fieldId, colName]) => {
      if (colName && colName.trim()) {
        counts[colName] = (counts[colName] || []).concat(fieldId);
      }
    });
    return Object.entries(counts)
      .filter(([_, fieldIds]) => fieldIds.length > 1)
      .map(([colName, fieldIds]) => ({
        colName,
        fieldIds,
        fieldLabels: fieldIds.map(fid => customFieldDefs.find(d => d.id === fid)?.label || fid)
      }));
  }, [customFieldMapping, customFieldDefs]);

  // 檢查檔案中是否同時包含 Type 與 OS Type
  const hasTypeAndOsType = useMemo(() => {
    if (!fileHeaders || fileHeaders.length === 0) return false;
    const lower = fileHeaders.map(h => h.trim().toLowerCase().replace(/[\s_\(\)\-\[\]\/\\:]/g, ''));
    const hasType = lower.some(h => h === 'type' || h === 'systemtype' || h === '類型' || h === '系統類型');
    const hasOsType = lower.some(h => h.includes('ostype') || h === 'os' || h.includes('作業系統'));
    return hasType && hasOsType;
  }, [fileHeaders]);

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
    if (duplicateMappings.length > 0) {
      const details = duplicateMappings
        .map(d => `• 檔案欄位「${d.colName}」被多個欄位同時對應：[${d.fieldLabels.join(' 與 ')}]`)
        .join('\n');
      alert(`【欄位對應衝突告警】\n檢測到有相同名稱的欄位對應！多個欄位不可同時對應至同一檔案欄位：\n\n${details}\n\n請調整對應設定為不同欄位後再執行匯入。`);
      return;
    }

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
      const typeSet = new Set();
      const modelSet = new Set(); // `${brand}___${model}`
      const clientSet = new Set();

      validItems.forEach(item => {
        if (item.brand) brandSet.add(item.brand);
        if (item.type) typeSet.add(item.type);
        if (item.brand && item.model) modelSet.add(`${item.brand}___${item.model}`);
        if (item.client) clientSet.add(item.client);
      });

      // 自動補齊 廠牌 (Brand)
      for (const brand of brandSet) {
        await window.electronAPI.namedQuery('insertDeviceBrand', ['設備', normalizeMasterName(brand)]);
      }

      // 自動補齊 類型 (Type) - 通用庫
      for (const type of typeSet) {
        await window.electronAPI.namedQuery('insertDeviceType', ['設備', normalizeMasterName(type)]);
      }

      // 自動補齊 型號 (Model) - 隸屬於廠牌
      for (const bm of modelSet) {
        const [brand, model] = bm.split('___');
        await window.electronAPI.namedQuery('insertDeviceModel', [normalizeMasterName(brand), normalizeMasterName(model), '設備']);
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
      const masterCache = new Map(); // `${normBrand}___${normType}___${normModel}___${normSpec}` -> masterId

      for (let i = 0; i < validItems.length; i++) {
        const item = validItems[i];
        const safeBrand = (item.brand || '').trim();
        const safeType = (item.type || '').trim();
        const safeModel = (item.model || '').trim();
        const safeSpec = (item.specification || '').trim();
        const masterKey = `${safeBrand.toLowerCase()}___${safeType.toLowerCase()}___${safeModel.toLowerCase()}___${safeSpec.toLowerCase()}`;

        try {
          // 每一列各自一個交易：品項主檔與資產實體同進同退。
          // 先前是分開送出，主檔建立成功但資產寫入失敗時會留下孤立的主檔。
          // 匯入本身維持「可部分成功」的設計，逐列統計成功與失敗。
          let masterId = masterCache.get(masterKey);
          if (!masterId) {
            const findRes = await window.electronAPI.namedQuery('findItemMaster', [item.specification || '', item.type, item.brand, item.model]);
            if (findRes.success && findRes.rows.length > 0) {
              masterId = findRes.rows[0].id;
              masterCache.set(masterKey, masterId);
            }
          }

          const customAttributes = {
            batch_imported: true,
            import_file: fileName,
            import_date: new Date().toISOString(),
            ...(item.contact_person ? { contact_person: item.contact_person } : {}),
            ...(item.contact_phone ? { contact_phone: item.contact_phone } : {}),
            ...(item.end_user ? { end_user: item.end_user } : {}),
            ...(item.custom_attributes || {})
          };

          const steps = [];
          // 主檔不存在時於同一交易內建立，其 id 以 $ref 供資產步驟取用
          if (!masterId) {
            steps.push({
              id: 'master',
              queryName: 'insertItemMaster',
              params: [item.specification || '', item.type, item.brand, item.model, '台', '設備'],
            });
          }
          steps.push({
            queryName: 'insertAssetRecord',
            params: [
              masterId || { $ref: 'master.rows.0.id' },
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
            ],
          });

          const txRes = await window.electronAPI.runTransaction(steps);

          if (txRes.success) {
            if (!masterId && txRes.results?.master?.rows?.[0]?.id) {
              masterCache.set(masterKey, txRes.results.master.rows[0].id);
            }
            successCount++;
          } else {
            failCount++;
            errors.push(`序號 [${item.sn || '無'}] 寫入失敗，該列已取消：${txRes.error}`);
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
      padding: '10px'
    }}>
      <div style={{
        backgroundColor: 'var(--bg-surface)',
        borderRadius: '16px',
        width: '96%',
        maxWidth: '1360px',
        height: parsedRows.length > 0 ? '96vh' : 'auto',
        maxHeight: 'calc(100vh - 16px)',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: 'var(--modal-shadow)',
        border: '1px solid var(--border-color)',
        overflow: 'hidden',
        animation: 'fadeIn 0.2s ease-out'
      }}>
        {/* Header */}
        <div style={{
          padding: '10px 18px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'var(--bg-surface-subtle)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#10b981'
            }}>
              <FileSpreadsheet size={18} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: 'var(--text-main)' }}>
                設備清單批次匯入 (Excel / CSV Batch Import)
              </h2>
              <p style={{ margin: '1px 0 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                支援設備清單自動解析、主檔層級建立（類型/廠牌/型號）與序號防重複檢核
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
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '8px 16px', overflowY: parsedRows.length > 0 ? 'hidden' : 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          
          {/* 上傳與設定區域 */}
          {!importResult && (
            parsedRows.length === 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr', gap: '16px' }}>
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

                {/* 類型 (Type) * */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px' }}>
                    類型 (Type) *
                  </label>
                  <input
                    type="text"
                    value={typeInput}
                    onChange={(e) => setTypeInput(e.target.value)}
                    placeholder="請輸入或選擇類型 (例: Server, Switch)"
                    list="batch-import-types-list"
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
                  <datalist id="batch-import-types-list">
                    {existingTypes.map(t => (
                      <option key={t.id || t.name} value={t.name} />
                    ))}
                  </datalist>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                    若檔案中無「類型」欄位，將以此處填寫之類型建檔；若檔案與此處皆未填寫，將判定為缺少類型並略過。
                  </span>
                </div>

                {/* 廠牌 (Brand) * */}
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px' }}>
                    廠牌 (Brand) *
                  </label>
                  <input
                    type="text"
                    value={brandInput}
                    onChange={(e) => setBrandInput(e.target.value)}
                    placeholder="請輸入或選擇廠牌 (例: Dell, Supermicro)"
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
                  padding: '12px 14px',
                  backgroundColor: 'rgba(234, 88, 12, 0.08)',
                  borderRadius: '8px',
                  border: '1px solid rgba(234, 88, 12, 0.2)',
                  fontSize: '12px',
                  color: '#ea580c',
                  lineHeight: '1.5'
                }}>
                  <div style={{ fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                    <Info size={14} /> 內控規則檢核提醒：
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <li>
                      <b>類型／廠牌／型號 缺一不建立</b>：清單或左側參數設定需完整指定「類型」與「廠牌」，且清單中「型號」不得空白，任一缺少系統將自動略過。
                    </li>
                    <li>
                      <b>階層架構對應</b>：類型為通用分類池，型號則直接歸屬至指定廠牌旗下建立主檔。
                    </li>
                    <li>
                      <b>序號防重複檢核</b>：檔案內重複出現或已存在於系統設備清冊之序號，將自動標記為重複並阻擋重複建檔。
                    </li>
                  </ul>
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

                <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownloadTemplate();
                    }}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--primary-color)',
                      fontSize: '12px',
                      fontWeight: '700',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <Download size={14} /> 下載匯入範本 (含自訂欄位)
                  </button>

                  {fileName && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        resetState();
                      }}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '8px',
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
            </div>
            ) : (
            /* 解析完成後的精簡資訊列 (Compact Bar) - 專為 1080P 筆電最佳化 */
            <div style={{
              backgroundColor: 'var(--bg-surface-subtle)',
              padding: '6px 14px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px'
            }}>
              {/* 檔案資訊與按鈕 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '700', color: 'var(--text-main)' }}>
                  <FileSpreadsheet size={16} color="#10b981" />
                  <span>{fileName || '已載入檔案'}</span>
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => e.target.files && handleFileProcess(e.target.files[0])}
                  accept=".xlsx, .xls, .csv"
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-main)',
                    fontSize: '11px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  重新選檔
                </button>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--primary-color)',
                    fontSize: '11px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Download size={12} /> 範本
                </button>
              </div>

              {/* 橫向並排之 類型 (Type) 與 廠牌 (Brand) 輸入框 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
                    類型 (Type) *
                  </label>
                  <input
                    type="text"
                    value={typeInput}
                    onChange={(e) => setTypeInput(e.target.value)}
                    placeholder="請輸入或選擇類型 (例: Server, Switch)"
                    list="batch-import-types-list-compact"
                    style={{
                      width: '180px',
                      padding: '5px 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--input-border)',
                      backgroundColor: 'var(--input-bg)',
                      color: 'var(--input-text)',
                      fontSize: '12px'
                    }}
                  />
                  <datalist id="batch-import-types-list-compact">
                    {existingTypes.map(t => (
                      <option key={t.id || t.name} value={t.name} />
                    ))}
                  </datalist>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
                    廠牌 (Brand) *
                  </label>
                  <input
                    type="text"
                    value={brandInput}
                    onChange={(e) => setBrandInput(e.target.value)}
                    placeholder="請輸入或選擇廠牌 (例: Dell, Supermicro)"
                    list="batch-import-brands-list-compact"
                    style={{
                      width: '180px',
                      padding: '5px 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--input-border)',
                      backgroundColor: 'var(--input-bg)',
                      color: 'var(--input-text)',
                      fontSize: '12px'
                    }}
                  />
                  <datalist id="batch-import-brands-list-compact">
                    {existingBrands.map(b => (
                      <option key={b.id || b.name} value={b.name} />
                    ))}
                  </datalist>
                </div>

                <div style={{
                  fontSize: '11px',
                  color: '#ea580c',
                  backgroundColor: 'rgba(234, 88, 12, 0.08)',
                  padding: '4px 8px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  whiteSpace: 'nowrap'
                }}>
                  <Info size={12} />
                  <span>缺一不建立 (Model 為空將自動略過)</span>
                </div>
              </div>
            </div>
            )
          )}

          {/* 檔案欄位重複告警 */}
          {!importResult && fileDuplicateHeaders.length > 0 && (
            <div style={{
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid #ef4444',
              borderRadius: '8px',
              padding: '8px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: '#ef4444',
              fontSize: '12px',
              fontWeight: '700'
            }}>
              <AlertTriangle size={16} />
              <span>
                【檔案欄位重複告警】上傳檔案中檢測到相同名稱的欄位表頭：<strong>{fileDuplicateHeaders.join('、')}</strong>！
                同名欄位可能導致資料覆蓋或對應混淆，請確認檔案格式。
              </span>
            </div>
          )}

          {/* Type 與 OS Type 同時存在之隔離提示 */}
          {!importResult && hasTypeAndOsType && (
            <div style={{
              backgroundColor: 'rgba(59, 130, 246, 0.08)',
              border: '1px solid #3b82f6',
              borderRadius: '8px',
              padding: '8px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: 'var(--text-main)',
              fontSize: '12px'
            }}>
              <Info size={16} color="#3b82f6" />
              <span>
                <strong>【欄位檢核通知】</strong>檢測到檔案同時包含「Type」與「OS Type」欄位。
                系統已自動隔離防呆，「OS Type」<strong>不會被寫入</strong>為設備類型 (Type)。
              </span>
            </div>
          )}

          {/* 自訂欄位對應面板 - 專為 1080P 筆電最佳化緊湊高度 */}
          {!importResult && customFieldDefs.length > 0 && (
            <div style={{
              backgroundColor: 'var(--bg-surface-subtle)',
              padding: '8px 14px',
              borderRadius: '10px',
              border: duplicateMappings.length > 0 ? '1.5px solid #ef4444' : '1px solid var(--border-color)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                <h4 style={{ margin: 0, fontSize: '13px', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Layers size={15} color="var(--primary-color)" />
                  自訂欄位對應 (Custom Fields Mapping)
                  <span style={{ fontSize: '11px', fontWeight: 'normal', color: 'var(--text-muted)' }}>
                    （系統已載入 {customFieldDefs.length} 個自訂欄位，可指定與 Excel 檔案表頭之對應）
                  </span>
                </h4>
                {fileHeaders.length > 0 && (
                  <button
                    type="button"
                    onClick={handleAutoDetectMapping}
                    style={{
                      padding: '3px 8px',
                      fontSize: '11px',
                      fontWeight: '600',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-surface)',
                      color: 'var(--primary-color)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <RefreshCw size={11} /> 重新自動匹配
                  </button>
                )}
              </div>

              {/* 相同名稱的欄位對應衝突告警 */}
              {duplicateMappings.length > 0 && (
                <div style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid #ef4444',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#ef4444',
                  fontSize: '11px',
                  fontWeight: '700'
                }}>
                  <AlertTriangle size={14} />
                  <span>
                    【欄位對應衝突告警】檢測到有相同名稱的欄位對應！
                    {duplicateMappings.map(d => `檔案欄位「${d.colName}」同時被對應至 [${d.fieldLabels.join(' 與 ')}]`).join('；')}。
                    多個欄位不可同時對應至相同欄位，請調整以避免資料覆蓋或誤寫入！
                  </span>
                </div>
              )}

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: '8px',
                maxHeight: '115px',
                overflowY: 'auto'
              }}>
                {customFieldDefs.map(field => {
                  const mappedCol = customFieldMapping[field.id] || '';
                  const isMatched = Boolean(mappedCol);
                  const isDuplicate = isMatched && duplicateMappings.some(d => d.colName === mappedCol);
                  return (
                    <div key={field.id} style={{
                      padding: '6px 10px',
                      backgroundColor: isDuplicate ? 'rgba(239, 68, 68, 0.05)' : 'var(--bg-surface)',
                      border: isDuplicate ? '1.5px solid #ef4444' : (isMatched ? '1px solid #10b981' : '1px solid var(--border-color)'),
                      borderRadius: '6px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: '700',
                          color: field.color || 'var(--text-main)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}>
                          <span style={{
                            width: '7px',
                            height: '7px',
                            borderRadius: '50%',
                            backgroundColor: field.color || '#3b82f6',
                            display: 'inline-block'
                          }} />
                          {field.label}
                        </span>
                        {isDuplicate ? (
                          <span style={{ fontSize: '10px', color: '#ef4444', fontWeight: '800' }}>⚠️ 重複對應衝突</span>
                        ) : isMatched ? (
                          <span style={{ fontSize: '10px', color: '#10b981', fontWeight: '700' }}>✓ 已對應: {mappedCol}</span>
                        ) : (
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>未對應</span>
                        )}
                      </div>

                      <select
                        aria-label={`自訂欄位對應: ${field.label}`}
                        value={mappedCol}
                        onChange={(e) => setCustomFieldMapping(prev => ({ ...prev, [field.id]: e.target.value }))}
                        style={{
                          width: '100%',
                          padding: '4px 6px',
                          borderRadius: '5px',
                          border: isDuplicate ? '1.5px solid #ef4444' : '1px solid var(--input-border)',
                          backgroundColor: 'var(--input-bg)',
                          color: 'var(--input-text)',
                          fontSize: '11px',
                          cursor: 'pointer'
                        }}
                      >
                        <option value="">-- 未對應 (不匯入) --</option>
                        {fileHeaders.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minHeight: 0 }}>
              {/* 統計與頁籤切換列 */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '8px',
                borderBottom: '1px solid var(--border-color)',
                paddingBottom: '8px'
              }}>
                {/* 頁籤 */}
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => setActiveTab('all')}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: activeTab === 'all' ? 'var(--primary-color)' : 'var(--bg-surface-subtle)',
                      color: activeTab === 'all' ? '#fff' : 'var(--text-main)',
                      fontWeight: '700',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    全部項目 ({stats.total})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('valid')}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: activeTab === 'valid' ? '#10b981' : 'var(--bg-surface-subtle)',
                      color: activeTab === 'valid' ? '#fff' : 'var(--text-main)',
                      fontWeight: '700',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    ✅ 待建立 ({stats.valid})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('skipped')}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: activeTab === 'skipped' ? '#f59e0b' : 'var(--bg-surface-subtle)',
                      color: activeTab === 'skipped' ? '#fff' : 'var(--text-main)',
                      fontWeight: '700',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    ⚠️ 略過項目 ({stats.skipped})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('duplicate')}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: activeTab === 'duplicate' ? '#ef4444' : 'var(--bg-surface-subtle)',
                      color: activeTab === 'duplicate' ? '#fff' : 'var(--text-main)',
                      fontWeight: '700',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    ❌ 序號重複 ({stats.duplicate})
                  </button>
                </div>

                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  預計將寫入 <b style={{ color: '#10b981', fontSize: '14px' }}>{stats.valid}</b> 台設備
                </div>
              </div>

              {/* 預覽表格容器 - 1080P 自適應彈性填滿 */}
              <div style={{
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                backgroundColor: 'var(--bg-surface)',
                flex: 1,
                minHeight: '260px',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
              }}>
                <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                    <thead style={{
                      position: 'sticky',
                      top: 0,
                      backgroundColor: 'var(--bg-surface-subtle)',
                      borderBottom: '2px solid var(--border-color)',
                      zIndex: 10
                    }}>
                      <tr>
                        <th style={{ padding: '8px 12px', fontWeight: '700', color: 'var(--text-muted)' }}>行號</th>
                        <th style={{ padding: '8px 12px', fontWeight: '700', color: 'var(--text-muted)' }}>檢核狀態</th>
                        <th style={{ padding: '8px 12px', fontWeight: '700', color: 'var(--text-muted)' }}>初始狀態</th>
                        <th style={{ padding: '8px 12px', fontWeight: '700', color: 'var(--text-muted)' }}>設備序號 (SN)</th>
                        <th style={{ padding: '8px 12px', fontWeight: '700', color: 'var(--text-muted)' }}>客戶 (Customer)</th>
                        <th style={{ padding: '8px 12px', fontWeight: '700', color: 'var(--text-muted)' }}>End-user</th>
                        <th style={{ padding: '8px 12px', fontWeight: '700', color: 'var(--text-muted)' }}>聯絡人 (Contact)</th>
                        <th style={{ padding: '8px 12px', fontWeight: '700', color: 'var(--text-muted)' }}>主機名稱 (HostName)</th>
                        <th style={{ padding: '8px 12px', fontWeight: '700', color: 'var(--text-muted)' }}>廠牌 (Brand)</th>
                        <th style={{ padding: '8px 12px', fontWeight: '700', color: 'var(--text-muted)' }}>類型 (Type)</th>
                        <th style={{ padding: '8px 12px', fontWeight: '700', color: 'var(--text-muted)' }}>型號 (Model)</th>
                        <th style={{ padding: '8px 12px', fontWeight: '700', color: 'var(--text-muted)' }}>規格 (Spec)</th>
                        <th style={{ padding: '8px 12px', fontWeight: '700', color: 'var(--text-muted)' }}>地點 (Location)</th>
                        <th style={{ padding: '8px 12px', fontWeight: '700', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>安裝日期</th>
                        <th style={{ padding: '8px 12px', fontWeight: '700', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>客戶保固到期</th>
                        <th style={{ padding: '8px 12px', fontWeight: '700', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>系統日期</th>
                        <th style={{ padding: '8px 12px', fontWeight: '700', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>原廠保固到期</th>
                        {customFieldDefs.filter(f => customFieldMapping[f.id]).map(f => (
                          <th key={f.id} style={{ padding: '8px 12px', fontWeight: '700', color: f.color || 'var(--primary-color)', whiteSpace: 'nowrap' }}>
                            {f.label} <span style={{ fontSize: '10px', opacity: 0.8 }}>(自訂)</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {displayedRows.length === 0 ? (
                        <tr>
                          <td colSpan={17 + customFieldDefs.filter(f => customFieldMapping[f.id]).length} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>
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
                                  {row.itemStatus === 'SHIPPED' ? '📦 已出貨' : '🟢 在庫' }
                                </span>
                              </td>
                              <td style={{ padding: '8px 12px', fontWeight: '700', fontFamily: 'monospace', color: 'var(--text-main)' }}>
                                {row.sn || '<無序號>'}
                              </td>
                              <td style={{ padding: '8px 12px', color: 'var(--text-main)' }}>{row.client || '-'}</td>
                              <td style={{ padding: '8px 12px', color: 'var(--text-main)' }}>{row.end_user || '-'}</td>
                              <td style={{ padding: '8px 12px' }}>
                                {row.contact_person ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <span style={{ fontWeight: '600', color: 'var(--text-main)' }}>
                                      {row.contact_person}
                                    </span>
                                    {row.contactMatch?.isFuzzy && (
                                      <span style={{
                                        fontSize: '10px',
                                        color: '#10b981',
                                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                                        padding: '1px 5px',
                                        borderRadius: '4px',
                                        display: 'inline-block',
                                        width: 'fit-content'
                                      }} title={`原文字串: ${row.contactMatch?.raw_contact || row.contactMatch?.raw_client || ''}`}>
                                        🔗 已帶入: {row.contact_person}
                                      </span>
                                    )}
                                    {(row.contactMatch?.matched_project || row.contactMatch?.matched_relation) && (
                                      <span style={{
                                        fontSize: '10px',
                                        color: '#8b5cf6',
                                        backgroundColor: 'rgba(139, 92, 246, 0.12)',
                                        border: '1px solid rgba(139, 92, 246, 0.25)',
                                        padding: '1px 5px',
                                        borderRadius: '4px',
                                        display: 'inline-block',
                                        width: 'fit-content'
                                      }}>
                                        🏷️ 關聯: {row.contactMatch.matched_relation || row.contactMatch.matched_project}
                                      </span>
                                    )}
                                    {row.contact_phone && (
                                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                        📞 {row.contact_phone}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span style={{ color: 'var(--text-muted)' }}>-</span>
                                )}
                              </td>
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
                              <td style={{ padding: '8px 12px', color: 'var(--text-main)', maxWidth: '220px' }}>
                                {row.specification ? (
                                  <span style={{ fontSize: '11px', color: 'var(--text-main)', fontWeight: '600', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', display: 'block' }} title={row.specification}>
                                    {row.specification}
                                  </span>
                                ) : (
                                  <span style={{ color: 'var(--text-subtle)', fontSize: '11px' }}>-</span>
                                )}
                              </td>
                              <td style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>{row.location || '-'}</td>
                              <td style={{ padding: '8px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{row.installed_date || '-'}</td>
                              <td style={{ padding: '8px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{row.customer_warranty_expire || '-'}</td>
                              <td style={{ padding: '8px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{row.system_date || '-'}</td>
                              <td style={{ padding: '8px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{row.warranty_expire || '-'}</td>
                              {customFieldDefs.filter(f => customFieldMapping[f.id]).map(f => (
                                <td key={f.id} style={{ padding: '8px 12px', color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
                                  {row.custom_attributes?.[f.id] || <span style={{ color: 'var(--text-muted)' }}>--</span>}
                                </td>
                              ))}
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
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
          padding: '8px 16px',
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
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={onClose}
              disabled={isImporting}
              style={{
                padding: '7px 16px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-main)',
                fontWeight: '600',
                fontSize: '12px',
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
                  padding: '7px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: stats.valid > 0 ? '#10b981' : '#9ca3af',
                  color: '#fff',
                  fontWeight: '700',
                  fontSize: '12px',
                  cursor: (isImporting || stats.valid === 0) ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: stats.valid > 0 ? '0 2px 8px rgba(16, 185, 129, 0.3)' : 'none'
                }}
              >
                {isImporting ? (
                  <>
                    <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> 匯入建檔中...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={15} /> 確認匯入 ({stats.valid} 筆可建立)
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
