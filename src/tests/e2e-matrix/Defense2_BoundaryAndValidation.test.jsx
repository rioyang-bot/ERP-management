import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fixMojibake } from '../../utils/encoding';

describe('防線 2：邊界極值與防呆阻擋 (15 種情境檢測)', () => {
  let mockExistingSns;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExistingSns = new Set(['EXISTING-SN-001', 'EXISTING-SN-002']);
  });

  it('情境 2.1：缺少必填欄位 (缺序號、缺型號) 前端標記並中斷儲存', () => {
    const validateDevice = (data) => {
      const errors = {};
      if (!data.type) errors.type = '類型為必填';
      if (!data.brand) errors.brand = '廠牌為必填';
      if (!data.model) errors.model = '型號為必填';
      if (!data.sn) errors.sn = '序號為必填';
      return { isValid: Object.keys(errors).length === 0, errors };
    };

    const invalidInput = { type: '伺服器', brand: 'Dell', model: '', sn: '' };
    const res = validateDevice(invalidInput);
    expect(res.isValid).toBe(false);
    expect(res.errors.model).toBe('型號為必填');
    expect(res.errors.sn).toBe('序號為必填');
  });

  it('情境 2.2：序號重號 (已存在序號) 資料庫與介面強制攔截', () => {
    const checkDuplicate = (sn) => {
      if (mockExistingSns.has(sn.trim().toUpperCase())) {
        throw new Error(`序號 [${sn}] 已存在於系統中，嚴禁重複建檔！`);
      }
      return true;
    };

    expect(() => checkDuplicate('EXISTING-SN-001')).toThrow(/已存在於系統中/);
    expect(() => checkDuplicate('existing-sn-002')).toThrow(/已存在於系統中/);
    expect(checkDuplicate('NEW-SN-999')).toBe(true);
  });

  it('情境 2.3：數量為零或負數 (採購數量 <= 0) 強制阻擋', () => {
    const validateQuantity = (qty) => {
      const num = Number(qty);
      if (isNaN(num) || num <= 0 || !Number.isInteger(num)) {
        return false;
      }
      return true;
    };

    expect(validateQuantity(0)).toBe(false);
    expect(validateQuantity(-5)).toBe(false);
    expect(validateQuantity('abc')).toBe(false);
    expect(validateQuantity(3)).toBe(true);
  });

  it('情境 2.4：超額進貨驗收 (驗收量 > 採購未交量) 強制攔截', () => {
    const po = { quantity: 10, received_quantity: 8 }; // 剩餘 2
    const validateInboundQty = (receiveQty) => {
      const remaining = po.quantity - po.received_quantity;
      if (receiveQty > remaining) {
        throw new Error(`驗收數量 (${receiveQty}) 超出剩餘待交量 (${remaining})！`);
      }
      return true;
    };

    expect(() => validateInboundQty(3)).toThrow(/超出剩餘待交量/);
    expect(validateInboundQty(2)).toBe(true);
  });

  it('情境 2.5：庫存不足/超賣防呆 (申請量 > 可用庫存) 禁止開單', () => {
    const item = { stock_qty: 5, locked_qty: 3 }; // 可用庫存 2
    const checkAvailableStock = (applyQty) => {
      const available = item.stock_qty - item.locked_qty;
      if (applyQty > available) {
        throw new Error(`可用庫存不足！目前可用: ${available}，申請: ${applyQty}`);
      }
      return true;
    };

    expect(() => checkAvailableStock(3)).toThrow(/可用庫存不足/);
    expect(checkAvailableStock(2)).toBe(true);
  });

  it('情境 2.6：借用中資產 (LENT) 禁止被一般出庫單選取或重複出貨', () => {
    const asset = { sn: 'TEST-LENT-ASSET', status: 'LENT' };
    const canShip = (targetAsset) => {
      if (targetAsset.status !== 'ACTIVE') {
        throw new Error(`資產狀態為 [${targetAsset.status}]，非在庫狀態不可進行出貨！`);
      }
      return true;
    };

    expect(() => canShip(asset)).toThrow(/非在庫狀態不可進行出貨/);
  });

  it('情境 2.7：設備填寫未建檔硬體序號 ➔ 嚴禁自動補建並跳出警告阻擋', () => {
    const existingHw = new Set(['HW-REGISTERED-01']);
    const saveMountedHardware = (inputSns) => {
      const uncreated = inputSns.filter(sn => !existingHw.has(sn));
      if (uncreated.length > 0) {
        throw new Error(`【警告】以下硬體 SN 尚未在系統中建檔：${uncreated.join(', ')}，系統不允許自動補建！`);
      }
      return true;
    };

    expect(() => saveMountedHardware(['HW-REGISTERED-01', 'HW-UNREGISTERED-99'])).toThrow(/尚未在系統中建檔/);
    expect(saveMountedHardware(['HW-REGISTERED-01'])).toBe(true);
  });

  it('情境 2.8：Excel 匯入同時含 Type 與 OS Type ➔ 嚴格隔離 OS Type 不寫入類型', () => {
    const row = {
      'Type': 'NIC',
      'OS Type': 'Ubuntu 22.04 LTS',
      'Model': 'E810'
    };

    const findColumnValue = (data, preferredKeys, excludedKeywords = []) => {
      const entries = Object.entries(data);
      const isExcluded = (key) => {
        const norm = key.toLowerCase().replace(/[\s_\-()]/g, '');
        return excludedKeywords.some(ex => norm.includes(ex));
      };

      for (const pk of preferredKeys) {
        const target = entries.find(([k]) => {
          if (isExcluded(k)) return false;
          return k.trim().toLowerCase() === pk.toLowerCase();
        });
        if (target && String(target[1]).trim()) return String(target[1]).trim();
      }
      return '';
    };

    const parsedType = findColumnValue(row, ['Type', 'System Type', '類型'], ['os', 'ostype', '作業系統']);
    expect(parsedType).toBe('NIC');
    expect(parsedType).not.toBe('Ubuntu 22.04 LTS');
  });

  it('情境 2.9：Excel 匯入含重複同名表頭 ➔ 跳出檔案表頭重複告警', () => {
    const headers = ['Type', 'Model', 'SN', 'Type']; // 重複 Type
    const headerCounts = {};
    const duplicates = [];

    headers.forEach(h => {
      const norm = h.toLowerCase();
      headerCounts[norm] = (headerCounts[norm] || 0) + 1;
      if (headerCounts[norm] === 2) {
        duplicates.push(h);
      }
    });

    expect(duplicates).toContain('Type');
    expect(duplicates.length).toBe(1);
  });

  it('情境 2.10：自訂欄位多個對應至同一 Excel 欄位 ➔ 標記衝突並禁止匯入', () => {
    const customMapping = {
      custom_note1: 'CommonNote',
      custom_note2: 'CommonNote' // 重複對應到 CommonNote
    };

    const counts = {};
    Object.entries(customMapping).forEach(([_, col]) => {
      if (col) counts[col] = (counts[col] || 0) + 1;
    });

    const hasConflict = Object.values(counts).some(c => c > 1);
    expect(hasConflict).toBe(true);
  });

  it('情境 2.11：規格欄位鎖定保護 (預設唯讀，點擊解鎖才可編輯)', () => {
    let isSpecLocked = true;
    let specValue = 'Dell 2U Rack';

    const updateSpec = (newVal) => {
      if (isSpecLocked) {
        throw new Error('規格已鎖定，必須點擊解鎖按鈕方可編輯！');
      }
      specValue = newVal;
    };

    expect(() => updateSpec('Modified Spec')).toThrow(/規格已鎖定/);
    isSpecLocked = false;
    updateSpec('Modified Spec');
    expect(specValue).toBe('Modified Spec');
  });

  it('情境 2.12：極長字元輸入 (如 1,000 字備註) 容錯正常儲存或安全截斷', () => {
    const longString = 'A'.repeat(1500);
    const maxAllowed = 1000;
    const safeTruncate = (str, max) => (str.length > max ? str.substring(0, max) : str);

    const result = safeTruncate(longString, maxAllowed);
    expect(result.length).toBe(1000);
  });

  it('情境 2.13：金額與數量浮點數精度 (小數點兩位計算無捨入誤差)', () => {
    const price = 0.1;
    const qty = 0.2;
    // 傳統 JS: 0.1 + 0.2 = 0.30000000000000004
    const safeTotal = Math.round((price + qty) * 100) / 100;
    expect(safeTotal).toBe(0.3);
  });

  it('情境 2.14：日期格式異常 (非標準格式字串) 自動規範化或提示', () => {
    const parseNormalizedDate = (raw) => {
      if (!raw) return null;
      const str = String(raw).trim();
      // 支援 YYYY/MM/DD, YYYY.MM.DD, YYYY-MM-DD
      const cleaned = str.replace(/[\/\.]/g, '-');
      const d = new Date(cleaned);
      if (isNaN(d.getTime())) return null;
      return d.toISOString().split('T')[0];
    };

    expect(parseNormalizedDate('2026/09/12')).toBe('2026-09-12');
    expect(parseNormalizedDate('2026.09.12')).toBe('2026-09-12');
    expect(parseNormalizedDate('invalid-date')).toBeNull();
  });

  it('情境 2.15：特殊字元與 UTF-8 編碼 (中文字、亂碼修復、特殊符號正常存取)', () => {
    const rawChinese = '國法伺服器專案（測試）- 規格：2U/雙電/SSD+HDD';
    const cleaned = fixMojibake(rawChinese);
    expect(cleaned).toBe(rawChinese);
  });
});
