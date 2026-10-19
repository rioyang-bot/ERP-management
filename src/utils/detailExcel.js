/**
 * 進貨單明細、出貨單明細下載成 Excel
 *
 * 一張單一個工作表：上面是單據資訊（單號、對象、日期…），空一列後是品項表，最後一列合計數量。
 * 欄位與明細視窗上的一致（類型、廠牌、型號、規格分開，誰打錯一眼就看得出來）。
 */
import * as XLSX from 'xlsx';
import { isMountedRow } from './mountedConsumables';

/**
 * 日期一律寫成 YYYY-MM-DD。伺服器把 DATE 欄位原樣回傳成字串（server/pgTypes.js），
 * 但退回用的建立時間是時間點（ISO 字串），要換成本地日期，否則會差一天。
 */
export const ymd = (d) => {
  if (!d) return '';
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const t = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(t.getTime())) return String(d).slice(0, 10);
  const pad = (n) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
};
const qtyOf = (it) => Number(it.quantity) || 0;

/** 進貨單：單據資訊＋品項 */
export function buildInboundSheet(order, items = [], { isDraft = false } = {}) {
  const info = [
    ['進貨單明細', order.order_no || ''],
    ['供應商', order.partner_name || '待補填'],
    ['進貨日期', ymd(order.effective_date || order.order_date || order.created_at)],
    ['發票號碼', order.invoice_no || ''],
    ['狀態', isDraft ? '待確認・尚未入庫' : '已進貨'],
    ['建立者', order.creator_name || ''],
  ];
  const head = ['來源採購單', '類別', '類型', '廠牌', '型號', '規格', '序號 (S/N)', '訂單來源', '備註', '數量'];
  const rows = items.map((it) => [
    it.po_order_no || '無 (非採購入庫)', it.category_name || '未分類', it.type || '', it.brand || '', it.model || '',
    it.specification || '', it.sn || '', it.order_source || '', it.remarks || '', qtyOf(it),
  ]);
  const total = ['合計', '', '', '', '', '', '', '', '', items.reduce((s, it) => s + qtyOf(it), 0)];
  return [...info, [], head, ...rows, total];
}

const DN_STATUS = { PENDING: '待確認・尚未出貨', SHIPPED: '已出貨' };

/** 出貨單：單據資訊＋品項（掛載耗材註明掛在哪台設備） */
export function buildDnSheet(dn, items = []) {
  const info = [
    ['出貨單明細', dn.request_no || ''],
    ['客戶', dn.customer || ''],
    ['聯絡資訊', dn.contact_info || ''],
    ['出貨日期', ymd(dn.shipping_date)],
    ['出貨地點', dn.location || ''],
    ['End-user', dn.end_user || ''],
    ['專案', dn.project_name || ''],
    ['狀態', DN_STATUS[dn.status] || '已結案'],
    ['建立者', dn.creator_name || ''],
  ];
  const head = ['類型', '廠牌', '型號', '規格', '序號 (S/N)', '數量', '發送位置', '備註'];
  const rows = items.map((it) => [
    it.type || '', it.brand || '', it.model || '', it.specification || '', it.sn || '', qtyOf(it), it.location || '',
    isMountedRow(it) ? `掛載於 ${it.lab_device_sn || '設備'}，隨設備出貨（從 LAB 扣）` : '',
  ]);
  const total = ['合計', '', '', '', '', items.reduce((s, it) => s + qtyOf(it), 0), '', ''];
  return [...info, [], head, ...rows, total];
}

/** 欄寬：依每一欄最長的內容（中文字算兩格），夾在 8～50 之間 */
const colWidths = (aoa) => {
  const widths = [];
  for (const row of aoa) {
    row.forEach((v, i) => {
      const w = [...String(v ?? '')].reduce((n, ch) => n + (ch.charCodeAt(0) > 255 ? 2 : 1), 0);
      widths[i] = Math.max(widths[i] || 8, Math.min(w + 2, 50));
    });
  }
  return widths.map((wch) => ({ wch }));
};

/** 檔名不能有的字元換掉 */
export const safeFileName = (s) => String(s || '').replace(/[\\/:*?"<>|]/g, '_').trim();

/** 產生並下載 .xlsx */
export function downloadSheet(aoa, fileName, sheetName = '明細') {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = colWidths(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${safeFileName(fileName)}.xlsx`);
}
