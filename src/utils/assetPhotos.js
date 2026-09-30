/**
 * 主機照片的挑選規則
 *
 * 與畫面分開放：規則要能單獨測，元件裡只負責顯示。
 */

/** 單張照片的上限。手機直出的照片約 3–8 MB，10 MB 夠用又不至於把磁碟塞爆 */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export function formatFileSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '--';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * 挑出可以上傳的檔案。
 *
 * 不是圖片、或太大的，各自說明原因而不是默默略過 ——
 * 使用者選了五張只上傳三張、卻沒說原因，等於是壞掉。
 *
 * @returns {{ accepted: File[], rejected: { name: string, reason: string }[] }}
 */
export function screenPhotoFiles(files, maxBytes = MAX_PHOTO_BYTES) {
  const accepted = [];
  const rejected = [];
  for (const file of files || []) {
    if (!String(file?.type || '').startsWith('image/')) {
      rejected.push({ name: file?.name || '未命名', reason: '不是圖片檔' });
    } else if (Number(file.size) > maxBytes) {
      rejected.push({
        name: file.name,
        reason: `超過 ${Math.round(maxBytes / 1024 / 1024)} MB（${formatFileSize(file.size)}）`,
      });
    } else {
      accepted.push(file);
    }
  }
  return { accepted, rejected };
}

export default { MAX_PHOTO_BYTES, formatFileSize, screenPhotoFiles };
