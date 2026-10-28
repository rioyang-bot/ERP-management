/**
 * 資產序號（公司財產編號）防重
 *
 * 財產清冊與盤點是用資產序號對實物的，兩台同號就對不起來。
 * 盤點表與設備列表的編輯視窗都會改到資產序號，存檔前都走這裡檢查。
 * 不分大小寫、忽略前後空白；空白（未編號）不檢查。
 */
export const sameAssetNo = (a, b) => String(a || '').trim().toUpperCase() === String(b || '').trim().toUpperCase();

/**
 * 新的資產序號已被其他資產使用時，回傳要給使用者看的訊息；沒問題回傳 null。
 * 查詢失敗時同樣擋下，寧可請使用者再按一次，也不要讓重複的編號存進去。
 */
export const checkDuplicateAssetNo = async (assetNo, selfId) => {
  const no = String(assetNo || '').trim();
  if (!no) return null;
  const res = await window.electronAPI.namedQuery('checkAssetNoExistsExcludeSelf', [no, selfId]);
  if (!res?.success) return `無法檢查資產序號是否重複：${res?.error || '未知錯誤'}`;
  const dup = res.rows?.[0];
  if (!dup) return null;
  const who = [dup.brand, dup.model].filter(Boolean).join(' ');
  return `資產序號「${no}」已被其他設備使用（${who ? `${who}，` : ''}序號 ${dup.sn || '無'}），請勿重複使用！`;
};
