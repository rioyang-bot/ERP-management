import logoImg from '../assets/logo.png';

/**
 * 公司範本（借貨申請單、簽收單的頁首 LOGO、頁首文字與簽章公司名稱）
 *
 * 範本存在伺服器的 system_configs（key = company_presets），所有人共用同一份。
 * 先前存在各台電腦的瀏覽器裡，你改過的內容別人看不到，沒改過的電腦一直顯示建錯的原廠值。
 *
 * 伺服器上存一份文件：
 *   { builtinOverrides: { PRESET_A: {...}, PRESET_B: {...} }, custom: [ {...}, ... ] }
 *
 * 內建範本只是第一次使用時的起點。改過之後一律以改過的為準：原廠值當初就建錯了，
 * 因此不提供「還原原廠預設」。經銷商不屬於公司範本 —— 借貨申請單上的經銷商從
 * 「客戶/廠商管理」挑選，沒選之前留空。
 *
 * 搬遷：伺服器上還沒有範本時，把這台瀏覽器裡改過的範本（舊的 localStorage）
 * 上傳一次，之後就以伺服器為準。
 */
export const DEFAULT_BUILTIN_PRESETS = {
  PRESET_B: {
    id: 'PRESET_B',
    label: '版本 B (台灣公司 / 竣喆國際)',
    logo: logoImg,
    headerRight: `竣喆國際有限公司\nDREAMJET INTERNATIONAL`,
    companySignName: '竣喆國際有限公司',
    isBuiltin: true
  },
  PRESET_A: {
    id: 'PRESET_A',
    label: '版本 A (澳洲總部 / METECH)',
    logo: logoImg,
    headerRight: `METECH GLOBAL CONSULTANT PTY LTD\nDREAMJET INTERNATIONAL`,
    companySignName: 'METECH GLOBAL CONSULTANT PTY LTD',
    isBuiltin: true
  }
};

/** 舊版存在瀏覽器裡的位置，只在搬遷到伺服器時讀一次 */
const LEGACY_CUSTOM_KEY = 'erp_custom_company_presets';
const LEGACY_OVERRIDES_KEY = 'erp_builtin_company_overrides';

/** 上傳的 LOGO 上限。範本整份存成一筆文字，圖片太大會拖慢每一次讀取 */
export const MAX_LOGO_BYTES = 1024 * 1024;

const emptyDoc = () => ({ builtinOverrides: {}, custom: [] });

// 最近一次從伺服器讀到的範本；還沒讀到之前用內建範本
let cachedDoc = null;

/**
 * LOGO 只存使用者上傳的圖片（data: 網址）。
 * 預設 LOGO 是打包後的檔案路徑，每次部署檔名都會變，存下來下次就找不到，因此存成 null。
 */
const storableLogo = (logo) => (typeof logo === 'string' && logo.startsWith('data:') ? logo : null);

const normalizeDoc = (raw) => {
  const doc = emptyDoc();
  if (raw && typeof raw === 'object') {
    if (raw.builtinOverrides && typeof raw.builtinOverrides === 'object') doc.builtinOverrides = raw.builtinOverrides;
    if (Array.isArray(raw.custom)) doc.custom = raw.custom.filter((p) => p && p.id);
  }
  return doc;
};

/** 由範本文件組出畫面用的 { id: 範本 } */
const buildPresetsMap = (doc) => {
  const presetsMap = {};
  Object.entries(DEFAULT_BUILTIN_PRESETS).forEach(([key, defaultPreset]) => {
    const override = doc.builtinOverrides[key];
    presetsMap[key] = override
      ? { ...defaultPreset, ...override, id: key, logo: override.logo || defaultPreset.logo, isBuiltin: true, isModified: true }
      : { ...defaultPreset, isModified: false };
  });
  doc.custom.forEach((preset) => {
    presetsMap[preset.id] = { ...preset, logo: preset.logo || logoImg, isBuiltin: false };
  });
  return presetsMap;
};

/** 讀這台瀏覽器裡舊版的範本；沒有改過任何東西就回傳 null */
const readLegacyDoc = () => {
  try {
    const overrides = JSON.parse(localStorage.getItem(LEGACY_OVERRIDES_KEY) || 'null') || {};
    const custom = JSON.parse(localStorage.getItem(LEGACY_CUSTOM_KEY) || 'null') || [];
    const doc = normalizeDoc({ builtinOverrides: overrides, custom });
    // 預設 LOGO 的路徑不能搬過去（見 storableLogo）
    Object.values(doc.builtinOverrides).forEach((o) => { o.logo = storableLogo(o.logo); });
    doc.custom.forEach((p) => { p.logo = storableLogo(p.logo); });
    const hasData = Object.keys(doc.builtinOverrides).length > 0 || doc.custom.length > 0;
    return hasData ? doc : null;
  } catch {
    return null;
  }
};

const fetchDoc = async () => {
  const res = await window.electronAPI.namedQuery('fetchCompanyPresets');
  if (!res.success) throw new Error(res.error || '讀取公司範本失敗');
  const row = res.rows?.[0];
  if (!row) return null;
  try {
    return normalizeDoc(JSON.parse(row.value));
  } catch {
    return emptyDoc();
  }
};

const writeDoc = async (doc) => {
  // 以物件傳入：伺服器的參數過濾只處理字串，物件會原樣轉成 JSON，
  // LOGO 的 data: 網址裡的 ; + 等字元才不會被刪掉
  const res = await window.electronAPI.namedQuery('saveCompanyPresets', [doc]);
  if (!res.success) throw new Error(res.error || '儲存公司範本失敗');
  cachedDoc = doc;
};

/**
 * 從伺服器讀取最新的範本（開啟列印視窗、範本管理時呼叫）。
 * 伺服器上還沒有範本時，把這台瀏覽器裡舊版改過的範本搬上去。
 * 讀不到伺服器時沿用上次讀到的（或內建範本），不擋住列印。
 */
export const loadCompanyPresets = async () => {
  try {
    let doc = await fetchDoc();
    if (!doc) {
      const legacy = readLegacyDoc();
      doc = legacy || emptyDoc();
      if (legacy) await writeDoc(legacy);
    }
    cachedDoc = doc;
  } catch (err) {
    console.error('Failed to load company presets from server', err);
  }
  return getCompanyPresets();
};

/** 目前的範本（同步）。還沒從伺服器讀到之前是內建範本 */
export const getCompanyPresets = () => buildPresetsMap(cachedDoc || emptyDoc());

/**
 * 儲存或更新範本（內建範本的修改與自訂範本）。
 * 先讀伺服器上最新的一份再改，避免蓋掉別人剛存的其他範本。
 */
export const saveCompanyPreset = async (presetData) => {
  const doc = (await fetchDoc()) || emptyDoc();
  const isBuiltin = Boolean(DEFAULT_BUILTIN_PRESETS[presetData.id]);

  if (isBuiltin) {
    doc.builtinOverrides[presetData.id] = {
      label: presetData.label,
      logo: storableLogo(presetData.logo),
      headerRight: presetData.headerRight || '',
      companySignName: presetData.companySignName || ''
    };
    await writeDoc(doc);
    return buildPresetsMap(doc)[presetData.id];
  }

  const presetId = presetData.id || `CUSTOM_${Date.now()}`;
  const newPreset = {
    id: presetId,
    label: presetData.label,
    logo: storableLogo(presetData.logo),
    headerRight: presetData.headerRight || '',
    companySignName: presetData.companySignName || ''
  };
  doc.custom = doc.custom.some((p) => p.id === presetId)
    ? doc.custom.map((p) => (p.id === presetId ? newPreset : p))
    : [...doc.custom, newPreset];
  await writeDoc(doc);
  return buildPresetsMap(doc)[presetId];
};

/** 刪除自訂範本（內建範本不可刪除） */
export const deleteCompanyPreset = async (presetId) => {
  if (DEFAULT_BUILTIN_PRESETS[presetId]) {
    throw new Error('系統內建範本不可刪除');
  }
  const doc = (await fetchDoc()) || emptyDoc();
  doc.custom = doc.custom.filter((p) => p.id !== presetId);
  await writeDoc(doc);
};

/** 測試用：清掉記憶中的範本 */
export const __resetCompanyPresetsCache = () => { cachedDoc = null; };
