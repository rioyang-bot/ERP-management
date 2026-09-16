import { describe, it, expect } from 'vitest';
import { findColumnValue, normalizeHeader } from '../utils/importColumnMatch';

/** 設備／硬體匯入實際使用的安裝日期別名（由精確到通用） */
const INSTALLED_KEYS = [
  'Project Date ( Installedl )', 'Project Date (Installedl)',
  'Project Date ( Installed )', 'Project Date (Installed)', 'Project Date( Installed )',
  'Installed Date', 'InstalledDate', 'Installed', '安裝日期', '專案安裝日期', '安裝日', 'Project Date', 'ProjectDate',
];

describe('欄位名稱正規化', () => {
  it('忽略大小寫、空白與括號等符號', () => {
    expect(normalizeHeader('安裝日期(Project Date)')).toBe('安裝日期projectdate');
    expect(normalizeHeader('  Serial Number ( Current ) ')).toBe('serialnumbercurrent');
  });

  it('空值不會出錯', () => {
    expect(normalizeHeader(null)).toBe('');
    expect(normalizeHeader(undefined)).toBe('');
  });
});

describe('從匯入檔的一列取出欄位值', () => {
  it('名稱完全相符時直接取用', () => {
    expect(findColumnValue({ 'Project Date': '2026-03-05' }, INSTALLED_KEYS)).toBe('2026-03-05');
  });

  it('名稱包含別名也認得（中英夾雜的表頭）', () => {
    expect(findColumnValue({ '安裝日期(Project Date)': '17/11/2023' }, INSTALLED_KEYS)).toBe('17/11/2023');
    expect(findColumnValue({ '安裝日期（Project Date）': '17/11/2023' }, INSTALLED_KEYS)).toBe('17/11/2023');
    expect(findColumnValue({ '安裝日期 (Project Date)': '17/11/2023' }, INSTALLED_KEYS)).toBe('17/11/2023');
  });

  it('找不到就回傳空字串', () => {
    expect(findColumnValue({ Customer: 'A' }, INSTALLED_KEYS)).toBe('');
    expect(findColumnValue(null, INSTALLED_KEYS)).toBe('');
  });

  it('數字保持原型，Excel 序列日期才不會被轉成字串', () => {
    expect(findColumnValue({ '安裝日期': 45484 }, INSTALLED_KEYS)).toBe(45484);
  });

  it('排除字串可擋掉不該對到的欄位', () => {
    const row = { 'OS Type': 'Windows', 'Type': 'SERVER' };
    expect(findColumnValue(row, ['Type', '類型'], ['os', 'ostype'])).toBe('SERVER');
  });

  /**
   * 使用者回報：表頭同時有一個空白的「Project Date」與有值的「安裝日期(Project Date)」，
   * 匯入後安裝日期整欄是空的。
   *
   * 原因是名稱完全相符但內容為空時就直接回報找不到 —— 空欄位把後面真正有值的
   * 欄位整個擋掉了。空的欄位不該算數。
   */
  describe('空白欄位不可以擋掉真正有值的欄位', () => {
    it('同時有空的英文欄位與有值的中文欄位時，取有值的那個', () => {
      const row = {
        'Customer': '凱基 吳沛恆',
        'Serial Number ( Current )': 'DFE322328070001',
        'Project Date': '',                 // 空欄位
        '安裝日期(Project Date)': '17/11/2023', // 真正有值
      };
      expect(findColumnValue(row, INSTALLED_KEYS)).toBe('17/11/2023');
    });

    it('欄位順序相反時結果一樣', () => {
      const row = { '安裝日期(Project Date)': '17/11/2023', 'Project Date': '' };
      expect(findColumnValue(row, INSTALLED_KEYS)).toBe('17/11/2023');
    });

    it('只有空白字元的欄位同樣不算數', () => {
      const row = { 'Project Date': '   ', '安裝日期(Project Date)': '23/03/2024' };
      expect(findColumnValue(row, INSTALLED_KEYS)).toBe('23/03/2024');
    });

    it('兩個欄位都是空的才回傳空字串', () => {
      expect(findColumnValue({ 'Project Date': '', '安裝日期(Project Date)': '' }, INSTALLED_KEYS)).toBe('');
    });
  });

  describe('別名的先後決定優先，而不是欄位在檔案中的順序', () => {
    it('名稱完全相符的欄位優先於只是包含別名的欄位', () => {
      const row = { '安裝日期(Project Date)': '01/01/2020', '安裝日期': '02/02/2021' };
      expect(findColumnValue(row, INSTALLED_KEYS)).toBe('02/02/2021');
    });

    it('同樣是包含比對時，較前面的別名優先', () => {
      // 安裝日期 排在 Project Date 之前，因此中文欄位優先
      const row = { 'X Project Date': '01/01/2020', 'Y 安裝日期': '02/02/2021' };
      expect(findColumnValue(row, INSTALLED_KEYS)).toBe('02/02/2021');
    });
  });

  describe('使用者實際的表頭全欄位對應', () => {
    const ROW = {
      'Customer': '凱基 吳沛恆',
      'HostName': 'NeoTap',
      'Model': 'NeoTap',
      'Location': 'UAT DC',
      'Serial Number ( Current )': 'DFE322328070001',
      'Project Date': '',
      '安裝日期(Project Date)': '17/11/2023',
      '客戶保固期滿(Cust Warranty)': '17/11/2024',
      'LDA System Date': '18/07/2024',
      'LDA Warranty Expire': '31/12/2026',
      'End-User': '',
      'status': 'SHIPPED',
    };

    const cases = [
      ['安裝日期', INSTALLED_KEYS, '17/11/2023'],
      ['客戶保固到期', ['Customer Warranty Expire', 'Customer Warranty Expiry', 'Customer Warranty', '客戶保固到期', '客戶保固'], '17/11/2024'],
      ['系統日期', ['BlackCore System Date', 'System Date', 'SystemDate', '原廠系統日期', '系統日期', '系統日'], '18/07/2024'],
      ['原廠保固到期', ['BlackCore Warranty Expire', 'BlackCore Warranty', 'Warranty Expire', 'Warranty Expiry', '原廠保固到期', '原廠保固', '保固到期'], '31/12/2026'],
      ['客戶', ['Customer', '客戶', 'Client', '客戶名稱'], '凱基 吳沛恆'],
      ['主機名稱', ['HostName', '主機名稱', 'Hostname', 'Host Name'], 'NeoTap'],
      ['型號', ['Model', '型號', '設備型號'], 'NeoTap'],
      ['地點', ['Location', '地點', '位置'], 'UAT DC'],
      ['狀態', ['Status', '狀態', '資產狀態'], 'SHIPPED'],
    ];

    it.each(cases)('%s 對應得到', (_label, keys, expected) => {
      expect(findColumnValue(ROW, keys)).toBe(expected);
    });

    it('四個日期各自對到不同欄位，不會互相搶', () => {
      const values = cases.slice(0, 4).map(([, keys]) => findColumnValue(ROW, keys));
      expect(new Set(values).size).toBe(4);
    });
  });
});
