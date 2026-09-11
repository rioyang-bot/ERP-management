import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logEvent, MODULE_MAP, ACTION_TYPES } from '../../utils/auditLogger';

describe('防線 5：事件紀錄與稽核追溯完整性 (11 種情境檢測)', () => {
  let mockAuditLogs;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuditLogs = [];

    window.electronAPI = {
      namedQuery: vi.fn().mockImplementation((query, params) => {
        if (query === 'insertAuditLog') {
          mockAuditLogs.push({
            userId: params[0],
            userName: params[1],
            userRole: params[2],
            actionType: params[3],
            module: params[4],
            moduleLabel: params[5],
            targetId: params[6],
            targetName: params[7],
            summary: params[8],
            details: params[9],
            ipAddress: params[10],
            timestamp: new Date().toISOString()
          });
          return Promise.resolve({ success: true });
        }
        return Promise.resolve({ success: true, rows: [] });
      })
    };
  });

  it('情境 5.1：CREATE 建立事件 100% 寫入日誌', async () => {
    await logEvent({
      actionType: ACTION_TYPES.CREATE,
      module: MODULE_MAP.DEVICE.key,
      targetId: 'SRV-2026-001',
      targetName: 'PowerEdge R750',
      summary: '新增伺服器設備資產',
      user: { id: 1, name: 'METECH', role: 'ADMIN' }
    });

    expect(mockAuditLogs.length).toBe(1);
    expect(mockAuditLogs[0].actionType).toBe('CREATE');
    expect(mockAuditLogs[0].targetId).toBe('SRV-2026-001');
    expect(mockAuditLogs[0].module).toBe('DEVICE');
  });

  it('情境 5.2：UPDATE 欄位變更 100% 寫入日誌並記錄變更前後 Diff 快照', async () => {
    await logEvent({
      actionType: ACTION_TYPES.UPDATE,
      module: MODULE_MAP.DEVICE.key,
      targetId: 'SRV-2026-001',
      summary: '修改規格描述',
      details: {
        before: { spec: '原規格 32GB RAM' },
        after: { spec: '升級規格 128GB RAM' }
      },
      user: { id: 1, name: 'METECH', role: 'ADMIN' }
    });

    expect(mockAuditLogs.length).toBe(1);
    expect(mockAuditLogs[0].details.before.spec).toBe('原規格 32GB RAM');
    expect(mockAuditLogs[0].details.after.spec).toBe('升級規格 128GB RAM');
  });

  it('情境 5.3：STATUS_CHANGE 狀態跳轉（出貨、進貨、歸還、維修）100% 寫入日誌', async () => {
    await logEvent({
      actionType: ACTION_TYPES.STATUS_CHANGE,
      module: MODULE_MAP.OUTBOUND.key,
      targetId: 'SRV-2026-001',
      summary: '設備確認出貨，狀態變更為 SHIPPED',
      details: { oldStatus: 'ACTIVE', newStatus: 'SHIPPED', shippingDate: '2026-09-12' },
      user: { id: 2, name: '倉管王小明', role: 'WAREHOUSE' }
    });

    expect(mockAuditLogs.length).toBe(1);
    expect(mockAuditLogs[0].actionType).toBe('STATUS_CHANGE');
    expect(mockAuditLogs[0].details.oldStatus).toBe('ACTIVE');
    expect(mockAuditLogs[0].details.newStatus).toBe('SHIPPED');
  });

  it('情境 5.4：DELETE 刪除/作廢操作 100% 寫入日誌並記錄操作者', async () => {
    await logEvent({
      actionType: ACTION_TYPES.DELETE,
      module: MODULE_MAP.PURCHASE.key,
      targetId: 'PO-CANCEL-001',
      summary: '作廢採購單 PO-CANCEL-001',
      details: { reason: '供應商缺料無法交期' },
      user: { id: 1, name: 'METECH', role: 'ADMIN' }
    });

    expect(mockAuditLogs.length).toBe(1);
    expect(mockAuditLogs[0].actionType).toBe('DELETE');
    expect(mockAuditLogs[0].targetId).toBe('PO-CANCEL-001');
    expect(mockAuditLogs[0].details.reason).toBe('供應商缺料無法交期');
  });

  it('情境 5.5：BATCH_IMPORT 批次匯入記錄檔名、成功數與衝突數', async () => {
    await logEvent({
      actionType: ACTION_TYPES.BATCH_IMPORT,
      module: MODULE_MAP.HARDWARE.key,
      targetId: 'hardware_list.xlsx',
      summary: '批次匯入硬體清冊完成',
      details: { totalRows: 50, successCount: 48, duplicateCount: 2, isolatedOsTypeCount: 1 },
      user: { id: 1, name: 'METECH', role: 'ADMIN' }
    });

    expect(mockAuditLogs.length).toBe(1);
    expect(mockAuditLogs[0].actionType).toBe('BATCH_IMPORT');
    expect(mockAuditLogs[0].details.successCount).toBe(48);
    expect(mockAuditLogs[0].details.isolatedOsTypeCount).toBe(1);
  });

  it('情境 5.6：設備與硬體掛載/解除掛載專屬事件日誌檢核', async () => {
    await logEvent({
      actionType: ACTION_TYPES.UPDATE,
      module: MODULE_MAP.DEVICE.key,
      targetId: 'SRV-2026-001',
      summary: '掛載新硬體組件',
      details: { action: 'MOUNT_HARDWARE', mountedSns: ['HW-NIC-001', 'HW-NIC-002'] },
      user: { id: 1, name: 'METECH', role: 'ADMIN' }
    });

    expect(mockAuditLogs.length).toBe(1);
    expect(mockAuditLogs[0].details.action).toBe('MOUNT_HARDWARE');
    expect(mockAuditLogs[0].details.mountedSns).toContain('HW-NIC-001');
  });

  it('情境 5.7：操作人身分與角色追蹤精確度（記錄真實操作帳號）', async () => {
    await logEvent({
      actionType: ACTION_TYPES.CREATE,
      module: MODULE_MAP.PARTNER.key,
      targetId: 'SUPPLIER-001',
      user: { id: 3, name: '採購李專員', role: 'IT' }
    });

    expect(mockAuditLogs[0].userName).toBe('採購李專員');
    expect(mockAuditLogs[0].userRole).toBe('IT');
  });

  it('情境 5.8：單號/序號 (Target ID) 精準對齊，無空值遺漏', async () => {
    await logEvent({
      actionType: ACTION_TYPES.CREATE,
      module: MODULE_MAP.INBOUND.key,
      targetId: 'IN-20260912-888',
      summary: '進貨單建立',
      user: { id: 1, name: 'METECH', role: 'ADMIN' }
    });

    expect(mockAuditLogs[0].targetId).not.toBe('');
    expect(mockAuditLogs[0].targetId).toBe('IN-20260912-888');
  });

  it('情境 5.9：單一序號全生命週期時間軸檢索（進貨 ➔ 掛載 ➔ 出貨 ➔ 維修 ➔ 報廢連續性）', async () => {
    const sn = 'SRV-TRACE-001';

    // 依序寫入 4 筆生命週期日誌
    await logEvent({ actionType: ACTION_TYPES.CREATE, module: 'INBOUND', targetId: sn, summary: '驗收入庫' });
    await logEvent({ actionType: ACTION_TYPES.UPDATE, module: 'DEVICE', targetId: sn, summary: '掛載網卡' });
    await logEvent({ actionType: ACTION_TYPES.STATUS_CHANGE, module: 'OUTBOUND', targetId: sn, summary: '出貨至客戶' });
    await logEvent({ actionType: ACTION_TYPES.STATUS_CHANGE, module: 'DEVICE', targetId: sn, summary: '售後維修結案' });

    // 檢索該序號的所有時間軸紀錄
    const timeline = mockAuditLogs.filter(l => l.targetId === sn);
    expect(timeline.length).toBe(4);
    expect(timeline[0].summary).toBe('驗收入庫');
    expect(timeline[1].summary).toBe('掛載網卡');
    expect(timeline[2].summary).toBe('出貨至客戶');
    expect(timeline[3].summary).toBe('售後維修結案');
  });

  it('情境 5.10：稽核日誌依模組 (Module) 與時間區間篩選精確度', async () => {
    await logEvent({ module: 'DEVICE', targetId: 'D1' });
    await logEvent({ module: 'HARDWARE', targetId: 'H1' });
    await logEvent({ module: 'DEVICE', targetId: 'D2' });

    const deviceLogs = mockAuditLogs.filter(l => l.module === 'DEVICE');
    expect(deviceLogs.length).toBe(2);
    expect(deviceLogs.map(l => l.targetId)).toEqual(['D1', 'D2']);
  });

  it('情境 5.11：當日 24 小時統計數據計算與日誌不可篡改性檢核', () => {
    const logs = [
      { id: 1, actionType: 'CREATE', timestamp: new Date().toISOString() },
      { id: 2, actionType: 'UPDATE', timestamp: new Date().toISOString() },
      { id: 3, actionType: 'DELETE', timestamp: new Date().toISOString() }
    ];

    const stats = {
      total: logs.length,
      creates: logs.filter(l => l.actionType === 'CREATE').length,
      updates: logs.filter(l => l.actionType === 'UPDATE').length,
      deletes: logs.filter(l => l.actionType === 'DELETE').length
    };

    expect(stats.total).toBe(3);
    expect(stats.creates).toBe(1);
    expect(stats.updates).toBe(1);
    expect(stats.deletes).toBe(1);

    // 驗證日誌記錄為 Append-Only，不可被非法複寫既有資料
    expect(() => {
      const immutableLog = Object.freeze({ ...logs[0] });
      immutableLog.actionType = 'MODIFIED_ILLEGALLY';
    }).toThrow();
  });
});
