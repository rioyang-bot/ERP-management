/**
 * 處理規格顯示的格式化工具
 * 若無規格則回傳 '--'
 */
export function formatSpec(spec) {
  if (!spec || spec.trim() === '') return '--';
  return spec.trim();
}
