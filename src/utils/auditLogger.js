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
  logStatusChange,
  getCurrentUser
};
