/**
 * 主機照片：用貼上的方式上傳
 *
 * 截圖、從聊天軟體複製的照片，不必先存成檔案再選。兩種貼法：
 *   - 點選拍照項目那一列後按 Ctrl+V（paste 事件，不需要權限）
 *   - 按「貼上」鈕（navigator.clipboard.read，瀏覽器第一次會詢問權限）
 *
 * 剪貼簿的圖片檔名幾乎都是 image.png，貼了好幾張分不出誰是誰，
 * 因此依設備序號、拍照項目與時間重新命名。
 */

const pad = (n) => String(n).padStart(2, '0');

/** 圖片類型 → 副檔名 */
const extOf = (type) => ({
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp',
}[type] || 'png');

/**
 * 依設備序號、拍照項目與時間重新命名。檔名裡不留斜線、冒號這類存檔會出問題的字元。
 * @param {Blob} blob
 * @param {{ sn?: string, itemName?: string, index?: number, now?: Date }} opts
 * @returns {File}
 */
export function namePastedImage(blob, { sn = '', itemName = '', index = 0, now = new Date() } = {}) {
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const clean = (s) => String(s || '').trim().replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '');
  const parts = [clean(sn), clean(itemName) || '貼上', stamp].filter(Boolean);
  const name = `${parts.join('_')}${index > 0 ? `-${index + 1}` : ''}.${extOf(blob.type)}`;
  return new File([blob], name, { type: blob.type || 'image/png' });
}

/**
 * 從 paste 事件取出圖片（Ctrl+V）。沒有圖片回傳空陣列，讓一般文字照常貼上。
 * @param {ClipboardEvent} e
 * @returns {Blob[]}
 */
export function imagesFromPasteEvent(e) {
  const data = e?.clipboardData;
  if (!data) return [];
  const fromItems = [...(data.items || [])]
    .filter((it) => it.kind === 'file' && String(it.type).startsWith('image/'))
    .map((it) => it.getAsFile())
    .filter(Boolean);
  if (fromItems.length > 0) return fromItems;
  return [...(data.files || [])].filter((f) => String(f.type).startsWith('image/'));
}

/**
 * 按「貼上」鈕時讀剪貼簿。
 * @returns {Promise<Blob[]>}
 * @throws 瀏覽器不支援或使用者拒絕權限時，帶一段可以直接顯示給使用者的說明
 */
export async function readClipboardImages(clipboard = globalThis.navigator?.clipboard) {
  if (!clipboard?.read) {
    throw new Error('這個瀏覽器不支援讀取剪貼簿。請點選要貼上的拍照項目那一列，再按 Ctrl+V。');
  }
  let entries;
  try {
    entries = await clipboard.read();
  } catch {
    throw new Error('瀏覽器沒有允許讀取剪貼簿。請點選要貼上的拍照項目那一列，再按 Ctrl+V；或在網址列旁的權限設定允許「剪貼簿」。');
  }
  const blobs = [];
  for (const entry of entries || []) {
    const type = (entry.types || []).find((t) => String(t).startsWith('image/'));
    if (type) blobs.push(await entry.getType(type));
  }
  return blobs;
}
