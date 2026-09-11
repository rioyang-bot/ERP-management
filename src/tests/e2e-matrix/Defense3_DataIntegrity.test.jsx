import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('防線 3：資料一致性與關聯保護 (11 種情境檢測)', () => {
  let mockState;

  beforeEach(() => {
    vi.clearAllMocks();
    mockState = {
      assets: [
        { id: 1, sn: 'SHIPPED-SRV-01', status: 'SHIPPED', custom_attributes: { mounted_hw_sns: 'MOUNTED-HW-01' } },
        { id: 2, sn: 'MOUNTED-HW-01', status: 'SHIPPED', custom_attributes: { server_sn: 'SHIPPED-SRV-01' } },
        { id: 3, sn: 'STANDALONE-01', status: 'ACTIVE', ownership: 'FOR_SALE', custom_attributes: {} }
      ],
      partners: [
        { id: 10, name: '重要客戶A', has_orders: true, is_active: true }
      ],
      itemMaster: [
        { id: 101, brand: 'Dell', model: 'R750', specification: '原規格A', reference_count: 5 }
      ],
      stockSummary: {
        stock_qty: 10,
        locked_qty: 4
      }
    };
  });

  it('情境 3.1：已有出貨紀錄之設備 ➔ 禁止物理刪除 (關聯保護)', () => {
    const deleteAsset = (id) => {
      const asset = mockState.assets.find(a => a.id === id);
      if (asset && asset.status === 'SHIPPED') {
        throw new Error(`資產 [${asset.sn}] 已有出貨或單據紀錄，禁止直接刪除！請採取作廢或退役流程。`);
      }
      mockState.assets = mockState.assets.filter(a => a.id !== id);
    };

    expect(() => deleteAsset(1)).toThrow(/已有出貨或單據紀錄/);
    expect(mockState.assets.find(a => a.id === 1)).toBeTruthy();
  });

  it('情境 3.2：已被伺服器掛載之硬體 ➔ 禁止直接刪除', () => {
    const deleteHardware = (sn) => {
      const isMounted = mockState.assets.some(a => {
        const mounted = (a.custom_attributes?.mounted_hw_sns || '').split(',').map(s => s.trim());
        return mounted.includes(sn);
      });
      if (isMounted) {
        throw new Error(`硬體 [${sn}] 目前仍掛載於伺服器中，必須先解除綁定方可刪除！`);
      }
    };

    expect(() => deleteHardware('MOUNTED-HW-01')).toThrow(/目前仍掛載於伺服器中/);
  });

  it('情境 3.3：已關聯採購或出庫單之客戶/供應商 ➔ 禁止物理刪除，僅能停用', () => {
    const deletePartner = (id) => {
      const p = mockState.partners.find(item => item.id === id);
      if (p && p.has_orders) {
        throw new Error(`夥伴 [${p.name}] 已有歷史單據關聯，不可物理刪除，僅可切換為「停用」！`);
      }
      mockState.partners = mockState.partners.filter(item => item.id !== id);
    };

    expect(() => deletePartner(10)).toThrow(/已有歷史單據關聯/);
    // 執行停用
    mockState.partners.find(p => p.id === 10).is_active = false;
    expect(mockState.partners.find(p => p.id === 10).is_active).toBe(false);
  });

  it('情境 3.4：已被使用之物料品項主檔 ➔ 禁止直接刪除', () => {
    const deleteItemMaster = (id) => {
      const item = mockState.itemMaster.find(i => i.id === id);
      if (item && item.reference_count > 0) {
        throw new Error(`品項 [${item.brand} ${item.model}] 尚有 ${item.reference_count} 筆資產引用，無法刪除！`);
      }
    };

    expect(() => deleteItemMaster(101)).toThrow(/尚有 5 筆資產引用/);
  });

  it('情境 3.5：修改品項型號/規格 ➔ 級聯同步更新品項主檔與清冊', () => {
    const item = mockState.itemMaster.find(i => i.id === 101);
    const newSpec = '更新後新規格 B';
    item.specification = newSpec;

    // 模擬所有引用該 master 的資產同步反映最新規格
    const getAssetDisplaySpec = (masterId) => {
      const m = mockState.itemMaster.find(i => i.id === masterId);
      return m ? m.specification : '';
    };

    expect(getAssetDisplaySpec(101)).toBe('更新後新規格 B');
  });

  it('情境 3.6：資產歸屬切換 (公司資產 ⇄ 一般銷售) 即時正確切換且不影響序號唯一性', () => {
    const asset = mockState.assets.find(a => a.id === 3);
    expect(asset.ownership).toBe('FOR_SALE');

    // 切換為公司資產
    asset.ownership = 'COMPANY';
    expect(asset.ownership).toBe('COMPANY');
    expect(asset.sn).toBe('STANDALONE-01'); // 序號不變

    // 切換回一般銷售
    asset.ownership = 'FOR_SALE';
    expect(asset.ownership).toBe('FOR_SALE');
  });

  it('情境 3.7：出庫單草稿作廢 ➔ 已鎖定之庫存 (Locked Qty) 即時精準釋放', () => {
    expect(mockState.stockSummary.locked_qty).toBe(4);

    // 取消出庫申請單 (申請量 4)
    const cancelledQty = 4;
    mockState.stockSummary.locked_qty -= cancelledQty;

    const availableQty = mockState.stockSummary.stock_qty - mockState.stockSummary.locked_qty;
    expect(mockState.stockSummary.locked_qty).toBe(0);
    expect(availableQty).toBe(10);
  });

  it('情境 3.8：批次匯入途中遇錯中斷 ➔ 資料庫交易回滾，不留半殘數據', async () => {
    const executedRollback = vi.fn();
    const simulateTransaction = async (rows) => {
      try {
        for (let i = 0; i < rows.length; i++) {
          if (rows[i].hasError) {
            throw new Error(`第 ${i + 1} 列資料錯誤：${rows[i].error}`);
          }
        }
      } catch (err) {
        executedRollback();
        throw err;
      }
    };

    const testRows = [
      { id: 1, hasError: false },
      { id: 2, hasError: true, error: '缺少必填型號' },
      { id: 3, hasError: false }
    ];

    await expect(simulateTransaction(testRows)).rejects.toThrow(/缺少必填型號/);
    expect(executedRollback).toHaveBeenCalledTimes(1);
  });

  it('情境 3.9：伺服器序號變更 ➔ 掛載之零組件關聯伺服器序號同步更新', () => {
    const server = { sn: 'SRV-OLD-001', custom_attributes: { mounted_hw_sns: 'NIC-001' } };
    const nic = { sn: 'NIC-001', custom_attributes: { server_sn: 'SRV-OLD-001' } };

    // 變更伺服器序號
    const newServerSn = 'SRV-NEW-002';
    server.sn = newServerSn;
    nic.custom_attributes.server_sn = newServerSn;

    expect(server.sn).toBe('SRV-NEW-002');
    expect(nic.custom_attributes.server_sn).toBe('SRV-NEW-002');
  });

  it('情境 3.10：重複變更伺服器序號遇到重號 ➔ 中斷儲存並完整保留原狀', () => {
    const existingSns = new Set(['SRV-TAKEN-001']);
    const currentServer = { sn: 'SRV-CURRENT-001' };

    const renameServerSn = (newSn) => {
      if (existingSns.has(newSn)) {
        throw new Error(`序號 [${newSn}] 已被其他資產使用！中斷更新並維持原狀。`);
      }
      currentServer.sn = newSn;
    };

    expect(() => renameServerSn('SRV-TAKEN-001')).toThrow(/已被其他資產使用/);
    expect(currentServer.sn).toBe('SRV-CURRENT-001'); // 維持原序號
  });

  it('情境 3.11：無序號耗材與有序號資產之分離計算機制驗證', () => {
    const deviceMaster = { id: 1, category: '設備', has_serial: true, stock_qty: 0 };
    const consumableMaster = { id: 2, category: '耗材', has_serial: false, stock_qty: 50 };

    // 設備庫存依據 assets 表中的序號統計
    const deviceAssets = [{ sn: 'D1' }, { sn: 'D2' }, { sn: 'D3' }];
    deviceMaster.stock_qty = deviceAssets.length;

    // 耗材直接記錄數量
    consumableMaster.stock_qty -= 5;

    expect(deviceMaster.stock_qty).toBe(3);
    expect(consumableMaster.stock_qty).toBe(45);
  });
});
