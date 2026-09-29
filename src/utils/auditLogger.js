/**
 * 全系統操作異動稽核日誌工具 (Audit Logger Utility)
 * 用於記錄所有模組之新增 (CREATE)、變更 (UPDATE)、移除 (DELETE) 與狀態流轉 (STATUS_CHANGE)
 */

export const MODULE_MAP = {
  DEVICE: { key: 'DEVICE', label: '設備管理' },
  HARDWARE: { key: 'HARDWARE', label: '硬體零組件' },
  CONSUMABLE: { key: 'CONSUMABLE', label: '耗材物料' },
  PURCHASE: { key: 'PURCHASE', label: '採購管理' },
  INBOUND: { key: 'INBOUND', label: '進貨管理' },
  OUTBOUND: { key: 'OUTBOUND', label: '出貨單據' },
  LENT: { key: 'LENT', label: '借用管理' },
  PARTNER: { key: 'PARTNER', label: '夥伴管理' },
  PROJECT: { key: 'PROJECT', label: '專案管理' },
  USER: { key: 'USER', label: '帳號權限' },
  SETTING: { key: 'SETTING', label: '系統設定' }
};

export const ACTION_TYPES = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  STATUS_CHANGE: 'STATUS_CHANGE',
  BATCH_IMPORT: 'BATCH_IMPORT'
};

/**
 * 取得當前使用者資訊 (從 localStorage 或 Session 快取)
 */
export function getCurrentUser() {
  try {
    const sessionStr = localStorage.getItem('erp_session');
    if (sessionStr) {
      const user = JSON.parse(sessionStr);
      return {
        id: user.id || null,
        name: user.full_name || user.username || '系統操作員',
        role: user.role || 'USER'
      };
    }
  } catch (e) {
    console.warn('[AuditLogger] Failed to parse session:', e);
  }
  return { id: null, name: '系統操作員', role: 'SYSTEM' };
}

/**
 * 核心日誌紀錄函式
 */
export async function logEvent({
  actionType,
  module,
  moduleLabel,
  targetId = '',
  targetName = '',
  summary = '',
  details = {},
  user = null
}) {
  try {
    const currentUser = user || getCurrentUser();
    const resolvedModule = typeof module === 'string' && MODULE_MAP[module] 
      ? MODULE_MAP[module] 
      : { key: module || 'OTHER', label: moduleLabel || module || '其他模組' };

    const payload = {
      userId: currentUser.id || null,
      userName: currentUser.name || '系統',
      userRole: currentUser.role || 'USER',
      actionType: actionType || ACTION_TYPES.UPDATE,
      module: resolvedModule.key,
      moduleLabel: moduleLabel || resolvedModule.label,
      targetId: String(targetId || ''),
      targetName: String(targetName || ''),
      summary: summary || `${actionType} ${resolvedModule.label} - ${targetId || targetName}`,
      details: typeof details === 'object' && details !== null ? details : { raw: details },
      ipAddress: 'Local'
    };

    if (window.electronAPI && typeof window.electronAPI.namedQuery === 'function') {
      await window.electronAPI.namedQuery('insertAuditLog', [
        payload.userId,
        payload.userName,
        payload.userRole,
        payload.actionType,
        payload.module,
        payload.moduleLabel,
        payload.targetId,
        payload.targetName,
        payload.summary,
        payload.details,
        payload.ipAddress
      ]);
    }
  } catch (err) {
    // 日誌記錄失敗不應阻斷使用者主要交易
    console.error('[AuditLogger] Log insertion error:', err);
  }
}

/**
 * 新增動作便捷函式 (CREATE)
 */
export async function logCreate(module, targetId, targetName, summary, details = {}) {
  return logEvent({
    actionType: ACTION_TYPES.CREATE,
    module,
    targetId,
    targetName,
    summary,
    details
  });
}

/**
 * 變更動作便捷函式 (UPDATE)
 */
export async function logUpdate(module, targetId, targetName, summary, details = {}) {
  return logEvent({
    actionType: ACTION_TYPES.UPDATE,
    module,
    targetId,
    targetName,
    summary,
    details
  });
}

/**
 * 序號變更 (UPDATE)
 *
 * 序號會從三個地方被改：設備編輯、硬體編輯、進貨明細單更正。
 * 三邊各寫各的敘述，其中進貨那邊還記在進貨單底下 —— 品項履歷是用序號
 * 接回資產的，記在單號底下就永遠不會出現在那台設備的歷程裡。
 *
 * 一律記在「新序號」名下：改完之後資產上留著的就是新序號，
 * 記在舊序號底下會接不回任何一筆資產。舊序號寫進敘述與 details，
 * 之後要查「這支序號後來變成什麼」仍然找得到。
 *
 * details.snChanged 給履歷分類用 —— 靠敘述比對文字太脆弱。
 */
export async function logSnChange(module, oldSn, newSn, targetName, note = '', details = {}) {
  const from = (oldSn || '').trim() || '無序號';
  const to = (newSn || '').trim() || '無序號';
  return logUpdate(
    module,
    (newSn || '').trim() || oldSn,
    targetName,
    `序號變更：[${from}] → [${to}]${note ? `（${note}）` : ''}`,
    { ...details, oldSn: from, newSn: to, snChanged: true }
  );
}

/**
 * 移除動作便捷函式 (DELETE)
 */
export async function logDelete(module, targetId, targetName, summary, details = {}) {
  return logEvent({
    actionType: ACTION_TYPES.DELETE,
    module,
    targetId,
    targetName,
    summary,
    details
  });
}

/**
 * 狀態流轉便捷函式 (STATUS_CHANGE)
 */
export async function logStatusChange(module, targetId, targetName, oldStatus, newStatus, summary, details = {}) {
  return logEvent({
    actionType: ACTION_TYPES.STATUS_CHANGE,
    module,
    targetId,
    targetName,
    summary: summary || `狀態變更：${oldStatus} ➔ ${newStatus}`,
    details: { oldStatus, newStatus, ...details }
  });
}

export default {
  MODULE_MAP,
  ACTION_TYPES,
  logEvent,
  logCreate,
  logUpdate,
  logDelete,
  logSnChange,
  logStatusChange,
  getCurrentUser
};
