/**
 * ISO 27001「S-408-02 設備攜出入單」依月份預覽並下載 PDF
 *
 * 版面照公司的範本（S-408-02設備攜出入單_v1.0_改.docx）畫成 A4 橫式（見 components/IsoEquipmentSheet.jsx）：
 *   - 頁首：文件編號、文件名稱、LOGO、發布日期、版次（FORM_META）
 *   - 標題「設備攜出入單」與「115年OO月份」
 *   - 表格：日期、設備名稱、序號、用途、原因、供應商/客戶；每頁 10 列，不足補空白列
 *   - 頁尾：頁碼、機房管理員／權責主管（線上簽核過的放簽名圖與日期）、機密等級
 *
 * 只算類別為「設備」的（硬體、耗材不列），一台設備一列、列出序號（查詢見 fetchEquipmentMovements）。
 *
 *   來源                 用途   原因       供應商/客戶
 *   進貨單               攜入   進貨       供應商
 *   出貨單               攜出   出貨       客戶（換貨單產生的＝換貨、維修以庫存換貨的＝維修換貨）
 *   借用單借出           攜出   借出       客戶
 *   借用單歸還           攜入   歸還       客戶
 *   換貨單換回           攜入   換貨       客戶
 *   維修現場取回         攜入   維修取回   客戶
 *   送修原廠／原廠返還   攜出／攜入  送修原廠／原廠返還  原廠（維修單上的供應商）
 *   維修完工交回客戶     攜出   維修完工   客戶（以庫存換貨的故障機留在公司，不算）
 *
 * 簽核在伺服器（server/isoSignatureRoutes.js）；簽核後資料有異動的簽名不印。
 */

/** 頁首的文件資訊，照範本頁首（範本頁首誤植 S-406-02，依檔名用 S-408-02） */
export const FORM_META = {
  docNo: 'S-408-02',
  docName: '設備攜出入單',
  publishDate: '115/06/01',
  version: 'v1.0',
  confidentiality: '內部使用',
};

/** 範本一頁的資料列數；不足補空白列，維持表單的樣子 */
export const ROWS_PER_PAGE = 10;

export const SIGN_ROLES = [
  { role: 'ROOM_ADMIN', label: '機房管理員' },
  { role: 'SUPERVISOR', label: '權責主管' },
];

export const rocYear = (year) => Number(year) - 1911;

/** 2026-10-05 → 115/10/05 */
export const formatRocDate = (ymd) => {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${rocYear(m[1])}/${m[2]}/${m[3]}` : '';
};

/** 簽核時間點 → 民國 115/10/31（本機時區） */
export const rocDateOf = (ts) => {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${rocYear(d.getFullYear())}/${p(d.getMonth() + 1)}/${p(d.getDate())}`;
};

/** 這個月的起日（含）與下個月 1 號（不含），給 fetchEquipmentMovements */
export const monthRange = (year, month) => {
  const pad = (n) => String(n).padStart(2, '0');
  const ny = month === 12 ? year + 1 : year;
  const nm = month === 12 ? 1 : month + 1;
  return [`${year}-${pad(month)}-01`, `${ny}-${pad(nm)}-01`];
};

/** 查詢結果 → 表單的列 */
export const toFormRows = (movements = []) => movements.map((m) => ({
  date: formatRocDate(m.move_date),
  name: [m.brand, m.model, m.specification].map((s) => String(s || '').trim()).filter(Boolean).join(' '),
  sn: String(m.sn || '').trim(),
  direction: m.direction === 'IN' ? 'IN' : 'OUT',
  reason: m.reason || '',
  vendor: m.vendor || '',
}));

/** 分頁：每頁 ROWS_PER_PAGE 列，最後一頁補空白列（null）；沒有資料也有一頁空白表單 */
export const paginate = (rows = [], perPage = ROWS_PER_PAGE) => {
  const pages = [];
  for (let i = 0; i < Math.max(rows.length, 1); i += perPage) {
    const page = rows.slice(i, i + perPage);
    while (page.length < perPage) page.push(null);
    pages.push(page);
  }
  return pages;
};

/** 檔名：S-408-02設備攜出入單_115年10月.pdf */
export const formFileName = (year, month) => `S-408-02設備攜出入單_${rocYear(year)}年${String(month).padStart(2, '0')}月.pdf`;
