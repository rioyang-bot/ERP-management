/**
 * 上傳檔案的讀取
 *
 * /uploads 在伺服器端是擋在 requireAuth 後面的，而驗證是看 Authorization 標頭。
 * 瀏覽器的 <img src="/uploads/x.jpg"> 不會帶標頭，直接拿只會收到 401 ——
 * 圖顯示不出來、下載下來的是一份錯誤訊息。
 *
 * 因此網頁版一律透過帶標頭的請求把檔案抓成 blob 再用。
 * 桌面版（Electron）走 erp-media:// 自訂協定，不經過 HTTP，可以直接當網址用。
 */

/** 檔名轉成可直接放進 src/href 的網址（僅桌面版可用） */
export function mediaUrl(fileName) {
  if (!fileName) return null;
  const raw = `erp-media:///${encodeURIComponent(fileName)}`;
  return typeof window !== 'undefined' && window.getMediaUrl ? window.getMediaUrl(raw) : raw;
}

/**
 * 取得可直接使用的網址：網頁版回傳 blob 網址，桌面版回傳 erp-media 網址。
 *
 * 回傳 blob 網址時，呼叫端用完要自己 URL.revokeObjectURL()，
 * 否則整批縮圖會一直佔著記憶體。
 *
 * @returns {Promise<{ url: string, revoke: boolean } | { error: string }>}
 */
export async function resolveMediaUrl(fileName) {
  if (!fileName) return { error: '沒有檔名' };

  const api = typeof window !== 'undefined' ? window.electronAPI : null;
  if (api && typeof api.loadMedia === 'function') {
    const res = await api.loadMedia(fileName);
    if (!res?.success || !res.blob) return { error: res?.error || '讀取檔案失敗' };
    return { url: URL.createObjectURL(res.blob), revoke: true };
  }

  return { url: mediaUrl(fileName), revoke: false };
}

/**
 * 把檔案存下來。
 *
 * 用 <a download> 而不是開新分頁：開新分頁在網頁版會變成瀏覽 blob 網址，
 * 存檔時檔名是一串亂碼，使用者根本認不出這是哪一張照片。
 */
export async function downloadMedia(fileName, originalName) {
  const resolved = await resolveMediaUrl(fileName);
  if (resolved.error) return { success: false, error: resolved.error };

  const a = document.createElement('a');
  a.href = resolved.url;
  a.download = originalName || fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();

  // 立刻回收會讓部分瀏覽器來不及開始下載
  if (resolved.revoke) setTimeout(() => URL.revokeObjectURL(resolved.url), 60_000);
  return { success: true };
}

export default { mediaUrl, resolveMediaUrl, downloadMedia };
