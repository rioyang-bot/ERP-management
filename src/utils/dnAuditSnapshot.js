/**
 * 出貨單／借用單事件紀錄用的快照
 *
 * 刪單之後資料就不在了，事件紀錄要留下「刪掉的是什麼」：單頭的欄位與每一行明細。
 * 簽收單據換檔、刪檔記的是檔名（使用者看到的原始檔名；沒有時退回存檔名稱）。
 */
import { fileNameOf } from './auditLogger';
import { toLocalYmd } from './lentReturnDate';

/** 簽收單據顯示用的檔名 */
export const signedDocName = (dn) => String(dn?.signed_doc_name || fileNameOf(dn?.signed_doc_url) || '').trim();

/** 單頭快照（刪單時寫進 details） */
export const dnHeaderSnapshot = (dn = {}) => ({
  requestNo: dn.request_no || null,
  status: dn.status || null,
  customer: dn.customer || null,
  location: dn.location || null,
  shippingDate: toLocalYmd(dn.shipping_date),
  expectedReturnDate: toLocalYmd(dn.expected_return_date),
  contactInfo: dn.contact_info || null,
  projectName: dn.project_name || null,
  endUser: dn.end_user || null,
  signedDocName: signedDocName(dn) || null,
  signedDocFile: dn.signed_doc_url || null,
});

/** 明細快照：每一行的品項、序號、數量、發送位置與用途 */
export const dnLineSnapshot = (items = []) => (items || []).map((i) => ({
  itemId: i.item_id ?? null,
  category: i.category_name || null,
  brand: i.brand || null,
  type: i.type || null,
  model: i.model || null,
  specification: i.specification || null,
  sn: i.sn || null,
  qty: i.quantity ?? null,
  location: i.location || null,
  purpose: i.purpose || null,
}));

/** 明細的一行文字：「廠牌 型號 [序號]」或「廠牌 型號 ×數量」 */
export const dnLineText = (i) => {
  const name = [i.brand, i.model].filter(Boolean).join(' ') || '品項';
  return i.sn ? `${name} [${i.sn}]` : `${name} ×${i.quantity ?? i.qty ?? 1}`;
};

/** 刪單敘述後面接的重點：客戶、日期與明細 */
export const dnDeleteSummaryTail = (dn = {}, items = []) => {
  const parts = [];
  if (dn.customer) parts.push(`客戶：${dn.customer}`);
  const date = toLocalYmd(dn.shipping_date);
  if (date) parts.push(`日期：${date}`);
  if (dn.location) parts.push(`地點：${dn.location}`);
  if (items.length) parts.push(`明細 ${items.length} 項：${items.map(dnLineText).join('、')}`);
  return parts.length ? `（${parts.join('；')}）` : '';
};
