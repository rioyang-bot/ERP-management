import logoImg from '../assets/logo.png';

export const DEFAULT_BUILTIN_PRESETS = {
  PRESET_B: {
    id: 'PRESET_B',
    label: '版本 B (台灣公司 / 竣喆國際)',
    logo: logoImg,
    headerRight: `竣喆國際有限公司\nDREAMJET INTERNATIONAL`,
    companySignName: '竣喆國際有限公司',
    dealerName: '竣喆國際有限公司',
    dealerSales: '業務專員',
    dealerPhone: '02-8765-4321',
    dealerAddress: '台北市內湖區',
    isBuiltin: true
  },
  PRESET_A: {
    id: 'PRESET_A',
    label: '版本 A (澳洲總部 / METECH)',
    logo: logoImg,
    headerRight: `METECH GLOBAL CONSULTANT PTY LTD\nDREAMJET INTERNATIONAL`,
    companySignName: 'METECH GLOBAL CONSULTANT PTY LTD',
    dealerName: 'METECH GLOBAL CONSULTANT PTY LTD',
    dealerSales: 'METECH Sales Rep',
    dealerPhone: '+61 2 XXXX XXXX',
    dealerAddress: 'Sydney, Australia',
    isBuiltin: true
  }
};

const STORAGE_KEY = 'erp_custom_company_presets';
const BUILTIN_OVERRIDES_KEY = 'erp_builtin_company_overrides';

/**
 * 取得所有公司範本 (包含內建已修改與自訂範本)
 */
export const getCompanyPresets = () => {
  const presetsMap = {};

  // 1. 載入內建範本 (支援使用者編輯修改後的覆蓋值)
  let builtinOverrides = {};
  try {
    const rawOverrides = localStorage.getItem(BUILTIN_OVERRIDES_KEY);
    if (rawOverrides) {
      builtinOverrides = JSON.parse(rawOverrides) || {};
    }
  } catch (err) {
    console.error('Failed to load builtin company overrides', err);
  }

  Object.entries(DEFAULT_BUILTIN_PRESETS).forEach(([key, defaultPreset]) => {
    if (builtinOverrides[key]) {
      presetsMap[key] = {
        ...defaultPreset,
        ...builtinOverrides[key],
        id: key,
        logo: builtinOverrides[key].logo || defaultPreset.logo,
        isBuiltin: true,
        isModified: true
      };
    } else {
      presetsMap[key] = { ...defaultPreset, isModified: false };
    }
  });

  // 2. 載入使用者新增的自訂範本
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const customList = JSON.parse(raw);
      if (Array.isArray(customList)) {
        customList.forEach(preset => {
          if (preset && preset.id) {
            presetsMap[preset.id] = {
              ...preset,
              logo: preset.logo || logoImg,
              isBuiltin: false
            };
          }
        });
      }
    }
  } catch (err) {
    console.error('Failed to load custom company presets from localStorage', err);
  }
  return presetsMap;
};

/**
 * 儲存或更新公司範本 (支援內建範本與自訂範本編輯)
 */
export const saveCompanyPreset = (presetData) => {
  try {
    const isBuiltin = Boolean(DEFAULT_BUILTIN_PRESETS[presetData.id]);

    if (isBuiltin) {
      // 儲存內建範本的修改
      const rawOverrides = localStorage.getItem(BUILTIN_OVERRIDES_KEY);
      let builtinOverrides = rawOverrides ? JSON.parse(rawOverrides) : {};
      builtinOverrides[presetData.id] = {
        label: presetData.label,
        logo: presetData.logo || logoImg,
        headerRight: presetData.headerRight || '',
        companySignName: presetData.companySignName || '',
        dealerName: presetData.dealerName || '',
        dealerSales: presetData.dealerSales || '',
        dealerPhone: presetData.dealerPhone || '',
        dealerAddress: presetData.dealerAddress || ''
      };
      localStorage.setItem(BUILTIN_OVERRIDES_KEY, JSON.stringify(builtinOverrides));
      return {
        ...DEFAULT_BUILTIN_PRESETS[presetData.id],
        ...builtinOverrides[presetData.id],
        id: presetData.id,
        isBuiltin: true,
        isModified: true
      };
    }

    // 自訂範本
    const raw = localStorage.getItem(STORAGE_KEY);
    let customList = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(customList)) customList = [];

    const isEdit = Boolean(presetData.id);
    const presetId = isEdit ? presetData.id : `CUSTOM_${Date.now()}`;

    const newPreset = {
      ...presetData,
      id: presetId,
      logo: presetData.logo || logoImg,
      isBuiltin: false
    };

    if (isEdit) {
      customList = customList.map(p => p.id === presetId ? newPreset : p);
    } else {
      customList.push(newPreset);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(customList));
    return newPreset;
  } catch (err) {
    console.error('Failed to save company preset', err);
    throw err;
  }
};

/**
 * 還原內建範本為原廠預設值
 */
export const resetBuiltinCompanyPreset = (presetId) => {
  if (!DEFAULT_BUILTIN_PRESETS[presetId]) {
    throw new Error('不是系統內建範本，無法還原');
  }
  try {
    const rawOverrides = localStorage.getItem(BUILTIN_OVERRIDES_KEY);
    if (rawOverrides) {
      const builtinOverrides = JSON.parse(rawOverrides) || {};
      delete builtinOverrides[presetId];
      localStorage.setItem(BUILTIN_OVERRIDES_KEY, JSON.stringify(builtinOverrides));
    }
    return DEFAULT_BUILTIN_PRESETS[presetId];
  } catch (err) {
    console.error('Failed to reset builtin company preset', err);
    throw err;
  }
};

/**
 * 刪除自訂公司範本 (內建範本不可刪除)
 */
export const deleteCompanyPreset = (presetId) => {
  if (DEFAULT_BUILTIN_PRESETS[presetId]) {
    throw new Error('系統內建範本不可刪除');
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    let customList = raw ? JSON.parse(raw) : [];
    if (Array.isArray(customList)) {
      customList = customList.filter(p => p.id !== presetId);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(customList));
    }
  } catch (err) {
    console.error('Failed to delete company preset', err);
    throw err;
  }
};
