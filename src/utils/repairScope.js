/**
 * 維修單的維修對象
 *
 * 維修單原本一定要填客戶名稱，但庫存裡有數百台設備沒有客戶
 * （公司資產、尚未出貨的一般銷售品）。這些送修時只能硬編一個名字，
 * 客戶清單很快就會混進「本公司」「METECH」「自有」各種寫法。
 *
 * 改為在單上明確區分兩種情形：客戶送修有客戶，公司內部沒有。
 * 顯示時集中在這裡處理，列表、詳情、列印才不會各寫一套。
 */

/** 公司內部維修在畫面上的稱呼 */
export const INTERNAL_LABEL = '公司內部';

/**
 * 這張單要顯示的維修對象。
 *
 * @param {{ is_internal?: boolean, customer_name?: string }} order
 * @returns {string}
 */
export function getRepairScopeLabel(order) {
  if (order?.is_internal) return INTERNAL_LABEL;
  const name = String(order?.customer_name ?? '').trim();
  // 舊資料有可能兩者都沒有；空白比「未指定客戶」更難看懂，仍給一個說法
  return name || '未指定客戶';
}

/** 內部維修沒有客戶聯絡人，相關欄位不該出現 */
export const hasCustomerContact = (order) =>
  !order?.is_internal && Boolean(String(order?.contact_person ?? '').trim());

export default getRepairScopeLabel;
