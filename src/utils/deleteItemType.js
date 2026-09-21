/**
 * 刪除品項類型
 *
 * 類型只能在新增品項時順手建立，打錯字之後沒有任何畫面能把它移除，
 * 只能一直留在下拉選單裡。deleteDeviceType 這支查詢雖然存在，
 * 但從來沒有被呼叫過。
 *
 * 刪除的條件是「沒有任何品項在用」。這一點在 SQL 裡也再檢查一次，
 * 不是只靠這裡先查一遍：查詢與刪除之間別人可能剛好建了一筆，
 * 而 item_models.type_id 是 ON DELETE CASCADE ——
 * 誤刪會把該類型底下的型號一起帶走。
 */

/**
 * 刪除一個沒有被使用的類型。
 *
 * @param {object} api          window.electronAPI
 * @param {string} typeName     類型名稱
 * @param {string} categoryName 類別（設備／硬體／耗材）
 * @returns {Promise<{ ok: boolean, message: string, used?: number }>}
 */
export async function deleteItemType(api, typeName, categoryName) {
  const name = String(typeName ?? '').trim();
  if (!name) return { ok: false, message: '請先選擇要移除的類型' };

  const countRes = await api.namedQuery('countItemMasterByType', [name, categoryName]);
  if (!countRes.success) {
    return { ok: false, message: `無法確認使用狀況：${countRes.error || '未知錯誤'}` };
  }
  const used = Number(countRes.rows?.[0]?.used) || 0;
  if (used > 0) {
    return {
      ok: false,
      used,
      message: `類型「${name}」已有 ${used} 筆${categoryName}在使用，無法移除。\n`
        + '請先把那些資料改成其他類型，再回來移除。',
    };
  }

  const delRes = await api.namedQuery('deleteItemTypeIfUnused', [name, categoryName]);
  if (!delRes.success) {
    return { ok: false, message: `移除失敗：${delRes.error || '未知錯誤'}` };
  }
  if (!delRes.rows || delRes.rows.length === 0) {
    // 查詢到刪除之間有人建了資料，或這個類型已經被別人刪掉了
    return { ok: false, message: `類型「${name}」未被移除，可能剛剛已有資料開始使用，或已被其他人移除。請重新整理後確認。` };
  }

  return { ok: true, used: 0, message: `類型「${name}」已移除。` };
}

export default deleteItemType;
