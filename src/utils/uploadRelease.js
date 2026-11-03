/**
 * 不再使用的上傳檔案交回伺服器清掉
 *
 * 刪掉照片、換掉簽收單或預設照片、移除附件之後呼叫。伺服器會先確認資料庫裡
 * 沒有任何紀錄還在用這個檔名（例如複製主項目時兩邊共用同一張預設照片），
 * 才移到回收區（保留 30 天），見 server/uploadCleanup.js。
 *
 * 只是順手清理：失敗不影響原本的操作，也不提示；漏掉的由系統管理的清理工具補清。
 */
export const releaseUploads = async (fileNames) => {
  const files = [...new Set((fileNames || []).filter((f) => typeof f === 'string' && f.trim()))];
  if (files.length === 0 || !window.electronAPI?.releaseUploads) return { released: [], kept: files };
  try {
    const res = await window.electronAPI.releaseUploads(files);
    return res?.success ? { released: res.released || [], kept: res.kept || [] } : { released: [], kept: files };
  } catch {
    return { released: [], kept: files };
  }
};

/** 附件清單（陣列或 JSON 字串）裡的存檔名 */
export const attachmentFileNames = (attachments) => {
  let list = attachments;
  if (typeof list === 'string') {
    try { list = JSON.parse(list || '[]'); } catch { list = []; }
  }
  return Array.isArray(list) ? list.map((a) => a?.fileName).filter(Boolean) : [];
};

/** 儲存前後比對：原本有、現在沒有的附件存檔名 */
export const removedAttachmentFiles = (before, after) => {
  const kept = new Set(attachmentFileNames(after));
  return attachmentFileNames(before).filter((f) => !kept.has(f));
};

/** 1234567 → 1.2 MB（與 server/uploadRoutes.js 的事件紀錄同一種寫法） */
export const formatBytes = (n) => {
  const v = Number(n) || 0;
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  if (v < 1024 * 1024 * 1024) return `${(v / 1024 / 1024).toFixed(1)} MB`;
  return `${(v / 1024 / 1024 / 1024).toFixed(2)} GB`;
};
