import { describe, it, expect, vi } from 'vitest';
import { isUnsafeName, validateName } from '../utils/nameValidation';
import { sanitizeParams } from '../../server/sanitize';

/**
 * 名稱輸入檢查
 *
 * 起因：類型 `SATA 2.5" SSD` 是用匯入建的（匯入不經過表單檢查），
 * 之後要建同一種硬體時，下拉選單挑得到、按下建立卻跳出
 *「包含不合規的安全規則字元」。原因是前端黑名單多擋了雙引號，
 * 而伺服器的 sanitizeParams 刻意排除雙引號以支援 JSON —— 兩邊規則不一致，
 * 就會出現「存得進去、選不出來」的死結。
 */
describe('名稱輸入檢查', () => {
  it('前端擋下的字元，伺服器也會濾掉', () => {
    for (const ch of ['|', '&', ';', '$', '%', '@', "'", '\\', '(', ')', '+']) {
      const name = `AB${ch}CD`;
      expect(isUnsafeName(name), `字元 ${ch}`).toBe(true);
      expect(sanitizeParams([name])[0], `字元 ${ch}`).not.toContain(ch);
    }
  });

  it('伺服器放行的雙引號，前端也要放行', () => {
    expect(sanitizeParams(['SATA 2.5" SSD'])[0]).toBe('SATA 2.5" SSD');
    expect(isUnsafeName('SATA 2.5" SSD')).toBe(false);
    expect(validateName('SATA 2.5" SSD', '類型')).toBe('SATA 2.5" SSD');
  });

  it('以吋數命名的常見名稱都能建立', () => {
    for (const name of ['3.5" HDD', '19" Rack', 'M.2 NVMe SSD', '2.5 inch SSD']) {
      expect(isUnsafeName(name), name).toBe(false);
    }
  });

  it('SQL 關鍵字仍然擋下', () => {
    expect(isUnsafeName('Drop Table')).toBe(true);
    const notify = vi.fn();
    expect(validateName('Drop Table', '類型', notify)).toBeNull();
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('類型'));
  });

  it('合規的名稱去掉前後空白後回傳', () => {
    expect(validateName('  Intel X710  ', '型號')).toBe('Intel X710');
  });

  it('空值原樣回傳，不跳警告', () => {
    const notify = vi.fn();
    expect(validateName('', '規格', notify)).toBe('');
    expect(validateName(undefined, '規格', notify)).toBeUndefined();
    expect(notify).not.toHaveBeenCalled();
  });
});
