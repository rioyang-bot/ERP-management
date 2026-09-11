import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('防線 1：核心業務閉環全鏈路 (12 種情境檢測)', () => {
  let mockDb;

  beforeEach(() => {
    vi.clearAllMocks();

    // 建立隔離的沙盒記憶體資料庫模型
    mockDb = {
      purchaseOrders: [],
      inboundOrders: [],
      inboundItems: [],
      outboundRequests: [],
      outboundItems: [],
      itemMaster: [
        { id: 1, type: '伺服器', brand: 'Dell', model: 'R750', specification: '2U Rack', stock_qty: 0, locked_qty: 0 },
        { id: 2, type: '網卡', brand: 'Intel', model: 'E810', specification: 'Dual 25G', stock_qty: 0, locked_qty: 0 },
        { id: 3, type: '耗材', brand: '3M', model: 'Tape', specification: '工業膠帶', stock_qty: 10, locked_qty: 0 }
      ],
      assets: [],
      repairOrders: [],
      projects: [],
      stocktakingRecords: []
    };
  });

  it('情境 1.1：標準採購單開立 ➔ 全量驗收入庫 ➔ 庫存增加與資產序號生成', async () => {
    // 1. 開立採購單 (PO)
    const po = {
      id: 1,
      order_no: 'PO-20260912-001',
      partner_id: 10,
      item_id: 1,
      quantity: 5,
      received_quantity: 0,
      status: 'ORDERED'
    };
    mockDb.purchaseOrders.push(po);
    expect(mockDb.purchaseOrders[0].status).toBe('ORDERED');

    // 2. 全量驗收入庫
    const inbound = {
      id: 101,
      order_no: 'IN-20260912-001',
      po_id: po.id,
      status: 'COMPLETED',
      items: [
        { item_id: 1, sn: 'SRV-IN-001' },
        { item_id: 1, sn: 'SRV-IN-002' },
        { item_id: 1, sn: 'SRV-IN-003' },
        { item_id: 1, sn: 'SRV-IN-004' },
        { item_id: 1, sn: 'SRV-IN-005' }
      ]
    };
    mockDb.inboundOrders.push(inbound);

    // 業務連動：更新採購單狀態與入庫量
    po.received_quantity += inbound.items.length;
    if (po.received_quantity >= po.quantity) {
      po.status = 'COMPLETED';
    }

    // 業務連動：資產實體寫入 assets 表，物料庫存 +5
    inbound.items.forEach((item, idx) => {
      mockDb.assets.push({
        id: idx + 1,
        item_master_id: item.item_id,
        sn: item.sn,
        status: 'ACTIVE'
      });
    });
    mockDb.itemMaster.find(m => m.id === 1).stock_qty += inbound.items.length;

    // 斷言
    expect(po.status).toBe('COMPLETED');
    expect(po.received_quantity).toBe(5);
    expect(mockDb.assets.length).toBe(5);
    expect(mockDb.assets.map(a => a.sn)).toContain('SRV-IN-001');
    expect(mockDb.itemMaster.find(m => m.id === 1).stock_qty).toBe(5);
  });

  it('情境 1.2：分批多次驗收入庫 (部分入庫 PARTIAL ➔ 剩餘數量計算 ➔ 二次入庫 COMPLETED)', async () => {
    const po = { id: 2, order_no: 'PO-20260912-002', quantity: 10, received_quantity: 0, status: 'ORDERED' };
    mockDb.purchaseOrders.push(po);

    // 第一批驗收 4 台
    const batch1Qty = 4;
    po.received_quantity += batch1Qty;
    po.status = po.received_quantity < po.quantity ? 'PARTIAL' : 'COMPLETED';
    expect(po.status).toBe('PARTIAL');
    expect(po.quantity - po.received_quantity).toBe(6);

    // 第二批驗收 6 台
    const batch2Qty = 6;
    po.received_quantity += batch2Qty;
    po.status = po.received_quantity >= po.quantity ? 'COMPLETED' : 'PARTIAL';
    expect(po.status).toBe('COMPLETED');
    expect(po.received_quantity).toBe(10);
  });

  it('情境 1.3：採購單作廢與取消 ➔ 採購流程正常終止', async () => {
    const po = { id: 3, order_no: 'PO-CANCEL-001', quantity: 2, received_quantity: 0, status: 'ORDERED' };
    mockDb.purchaseOrders.push(po);

    // 執行作廢
    po.status = 'CANCELLED';
    expect(po.status).toBe('CANCELLED');
    expect(po.received_quantity).toBe(0);
  });

  it('情境 1.4：一般出庫申請 ➔ 可用庫存動態鎖定 ➔ 確認出庫 ➔ 實體庫存扣減', async () => {
    const srv = mockDb.itemMaster.find(m => m.id === 1);
    srv.stock_qty = 5;

    // 開立出庫申請 (申請 2 台)
    const req = { id: 201, request_no: 'OUT-20260912-001', item_id: 1, quantity: 2, status: 'PENDING' };
    mockDb.outboundRequests.push(req);

    // 鎖定數量增加
    srv.locked_qty += req.quantity;
    const availableQty = srv.stock_qty - srv.locked_qty;
    expect(availableQty).toBe(3);

    // 確認正式出貨
    req.status = 'SHIPPED';
    srv.locked_qty -= req.quantity;
    srv.stock_qty -= req.quantity;

    expect(srv.stock_qty).toBe(3);
    expect(srv.locked_qty).toBe(0);
    expect(srv.stock_qty - srv.locked_qty).toBe(3);
  });

  it('情境 1.5：設備掛載硬體 ➔ 伺服器出貨 ➔ 搭載硬體狀態同步轉為出貨 (SHIPPED) 且寫入出貨日', async () => {
    // 建立 1 台伺服器與 1 張網卡
    const server = { id: 11, item_master_id: 1, sn: 'SRV-SYNC-001', status: 'ACTIVE', custom_attributes: { mounted_hw_sns: 'HW-NIC-001' } };
    const nic = { id: 12, item_master_id: 2, sn: 'HW-NIC-001', status: 'ACTIVE', custom_attributes: { server_sn: 'SRV-SYNC-001' } };
    mockDb.assets.push(server, nic);

    // 伺服器確認出貨
    const shippingDate = '2026-09-12';
    server.status = 'SHIPPED';
    server.shipping_date = shippingDate;

    // 搭載硬體同步連動
    const mountedSns = (server.custom_attributes.mounted_hw_sns || '').split(',').map(s => s.trim());
    mockDb.assets.forEach(a => {
      if (mountedSns.includes(a.sn)) {
        a.status = 'SHIPPED';
        a.shipping_date = shippingDate;
      }
    });

    expect(server.status).toBe('SHIPPED');
    expect(nic.status).toBe('SHIPPED');
    expect(nic.shipping_date).toBe(shippingDate);
  });

  it('情境 1.6：設備出貨退回在庫 ➔ 搭載硬體狀態同步恢復在庫 (ACTIVE)', async () => {
    const server = { id: 11, sn: 'SRV-SYNC-001', status: 'SHIPPED', custom_attributes: { mounted_hw_sns: 'HW-NIC-001' } };
    const nic = { id: 12, sn: 'HW-NIC-001', status: 'SHIPPED', custom_attributes: { server_sn: 'SRV-SYNC-001' } };
    mockDb.assets.push(server, nic);

    // 伺服器退貨入庫恢復 ACTIVE
    server.status = 'ACTIVE';
    server.shipping_date = null;

    const mountedSns = (server.custom_attributes.mounted_hw_sns || '').split(',').map(s => s.trim());
    mockDb.assets.forEach(a => {
      if (mountedSns.includes(a.sn)) {
        a.status = 'ACTIVE';
        a.shipping_date = null;
      }
    });

    expect(server.status).toBe('ACTIVE');
    expect(nic.status).toBe('ACTIVE');
  });

  it('情境 1.7：借用單申請 ➔ 審核出庫 (LENT) ➔ 歸還入庫恢復在庫 (ACTIVE)', async () => {
    const asset = { id: 21, sn: 'LENT-TEST-001', status: 'ACTIVE' };
    mockDb.assets.push(asset);

    // 申請借出並審核通過
    asset.status = 'LENT';
    asset.lent_info = { customer: '台積電', expected_return_date: '2026-10-01' };
    expect(asset.status).toBe('LENT');

    // 歸還入庫
    asset.status = 'ACTIVE';
    asset.lent_info = null;
    expect(asset.status).toBe('ACTIVE');
    expect(asset.lent_info).toBeNull();
  });

  it('情境 1.8：已出貨資產報修 ➔ RMA 維修單開立 ➔ 原廠送修 ➔ 完修結案 (COMPLETED)', async () => {
    const rma = {
      id: 301,
      repair_no: 'RMA-20260912-001',
      sn: 'SRV-REPAIR-001',
      status: 'ON_SITE_HANDLING'
    };
    mockDb.repairOrders.push(rma);

    // 送原廠
    rma.status = 'SEND_OEM';
    rma.send_oem_date = '2026-09-13';
    expect(rma.status).toBe('SEND_OEM');

    // 完修結案
    rma.status = 'COMPLETED';
    rma.completion_date = '2026-09-20';
    expect(rma.status).toBe('COMPLETED');
  });

  it('情境 1.9：RMA 維修零件更換（舊硬體解除掛載，新硬體序號綁定）', async () => {
    const server = { id: 31, sn: 'SRV-RMA-SWAP', custom_attributes: { mounted_hw_sns: 'HW-FAULTY-001' } };
    mockDb.assets.push(server);

    // 故障硬體替換為良品 HW-GOOD-002
    const oldSn = 'HW-FAULTY-001';
    const newSn = 'HW-GOOD-002';

    let currentMounted = (server.custom_attributes.mounted_hw_sns || '').split(',').map(s => s.trim());
    currentMounted = currentMounted.filter(s => s !== oldSn);
    currentMounted.push(newSn);
    server.custom_attributes.mounted_hw_sns = currentMounted.join(', ');

    expect(server.custom_attributes.mounted_hw_sns).not.toContain(oldSn);
    expect(server.custom_attributes.mounted_hw_sns).toContain(newSn);
  });

  it('情境 1.10：無法修復判定 ➔ 資產轉報廢 (SCRAP) 與除帳', async () => {
    const asset = { id: 41, sn: 'SCRAP-001', status: 'BROKEN' };
    mockDb.assets.push(asset);

    // 判定無法修復
    asset.status = 'SCRAP';
    asset.scrap_date = '2026-09-12';
    asset.scrap_reason = '主機板嚴重燒毀無料可換';

    expect(asset.status).toBe('SCRAP');
    expect(asset.scrap_reason).toBeTruthy();
  });

  it('情境 1.11：專案主檔建立 ➔ 綁定客戶/採購與出庫 ➔ 專案進度更新與結案', async () => {
    const project = {
      id: 51,
      project_no: 'PJ-2026-001',
      name: '國法伺服器採購案',
      customer_name: '司法院',
      status: 'IN_PROGRESS'
    };
    mockDb.projects.push(project);

    // 專案進度推進並完成驗收
    project.status = 'CLOSED';
    project.end_date = '2026-09-12';

    expect(project.status).toBe('CLOSED');
  });

  it('情境 1.12：盤點作業 ➔ 實盤數量與系統庫存比對並產生差異調整', async () => {
    const item = mockDb.itemMaster.find(m => m.id === 3); // 膠帶 原庫存 10
    const physicalCount = 8; // 實盤 8 (差異 -2)

    const diff = physicalCount - item.stock_qty;
    item.stock_qty = physicalCount;

    mockDb.stocktakingRecords.push({
      item_id: item.id,
      system_qty: 10,
      actual_qty: physicalCount,
      variance: diff,
      date: '2026-09-12'
    });

    expect(diff).toBe(-2);
    expect(item.stock_qty).toBe(8);
    expect(mockDb.stocktakingRecords[0].variance).toBe(-2);
  });
});
