/**
 * 維修單四個階段的資料
 *
 * 詳情彈窗與套印單都要呈現同一份內容 —— 日期、該階段的狀態、以及那一步填的說明。
 * 先前兩邊各寫各的，套印單就少了送修備註、出貨備註與當前狀態，
 * 印出來的東西比畫面上看到的少。集中在這裡，兩邊就不會再各自漂移。
 *
 * 呈現方式仍由各自的元件決定（詳情要能就地編輯、套印要黑白列印得清楚），
 * 這裡只負責「有哪些欄位、內容是什麼」。
 */

/** 四個階段的識別、標題與顏色。顏色兩邊共用，時間軸才對得起來。 */
export const REPAIR_STAGES = [
  { key: 'ON_SITE', title: '現場處理 / 取回', dateField: 'on_site_date', color: '#10b981' },
  { key: 'SEND_OEM', title: '送修原廠', dateField: 'send_oem_date', color: '#d97706' },
  { key: 'OEM_RETURN', title: '原廠返還 / 修復', dateField: 'oem_return_date', color: '#8b5cf6' },
  { key: 'COMPLETED', title: '客戶完工出貨', dateField: 'completion_date', color: '#3b82f6' },
];

/** 每個階段填寫的說明各自一欄，不共用 */
export const STAGE_CONTENT_LABEL = {
  on_site_status: '現場狀況 / 故障描述',
  send_oem_remarks: '送修備註 (Remarks)',
  results: '維修與檢測結果 (Results)',
  completion_remarks: '出貨備註 (Remarks)',
};

/**
 * 依單據算出四個階段要顯示什麼。
 *
 * @returns {Array<{key, title, date, statusDesc, assetStatus, contents}>}
 *          contents 是 [{ field, label, text }]，沒有內容時 text 為空字串
 */
export function getRepairStageRows(order) {
  if (!order) return [];

  // 不送原廠的單，原廠那兩個階段不適用；維修結果改在完工那一步填
  const noOem = !!order.no_oem_required;
  // 直接送原廠的單沒有現場處理那一段：沒有現場日期、卻已經送出原廠
  const skippedOnSite = !order.on_site_date && !!order.send_oem_date;
  // 內部維修沒有客戶可出貨，原廠返還就是終點
  const isInternal = !!order.is_internal;

  const content = (field) => ({ field, label: STAGE_CONTENT_LABEL[field], text: order[field] || '' });

  return [
    {
      key: 'ON_SITE',
      title: skippedOnSite ? '現場處理 / 取回（略過）' : '現場處理 / 取回',
      date: order.on_site_date || '',
      statusDesc: skippedOnSite ? '略過 (未出給客戶，直接送原廠)' : '現場處理 / 取回 (REPAIRING)',
      assetStatus: 'REPAIRING (維修中)',
      contents: skippedOnSite ? [] : [content('on_site_status')],
    },
    {
      key: 'SEND_OEM',
      title: '送修原廠',
      date: order.send_oem_date || '',
      statusDesc: noOem
        ? '不適用 (不需送回原廠)'
        : (order.send_oem_date ? '原廠處理中 (REPAIRING)' : '現場在庫'),
      assetStatus: 'REPAIRING (維修中)',
      contents: [content('send_oem_remarks')],
    },
    {
      key: 'OEM_RETURN',
      title: '原廠返還 / 修復',
      date: order.oem_return_date || '',
      statusDesc: noOem
        ? '不適用 (由 IT 自行處理)'
        : (order.oem_return_date
          ? (isInternal ? '已返還入庫，維修完成 (ACTIVE)' : '已返還，仍為維修中 (REPAIRING)')
          : '原廠處理中'),
      assetStatus: isInternal ? 'ACTIVE (在庫)' : 'REPAIRING (維修中)',
      // 不送原廠的單沒走過這一步，維修結果是在完工那一步填的
      contents: noOem ? [] : [content('results')],
    },
    {
      key: 'COMPLETED',
      title: isInternal ? '客戶完工出貨（不適用）' : (noOem ? '自行維修完工出貨' : '客戶完工出貨'),
      date: order.completion_date || '',
      statusDesc: isInternal
        ? '不適用 (公司內部維修，返還入庫即結案)'
        : (order.completion_date ? '已交付客戶 (SHIPPED)' : '待完工出貨'),
      assetStatus: isInternal ? 'ACTIVE (在庫)' : 'SHIPPED (出庫)',
      contents: noOem
        ? [content('results'), content('completion_remarks')]
        : [content('completion_remarks')],
    },
  ];
}
