import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateNewSn, performInPlaceReplacement, performOneToOneReplacement } from '../utils/rmaService';

describe('rmaService 核心更換服務單元測試', () => {
  const querySpy = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    querySpy.mockClear();

    // Default window.electronAPI mock
    window.electronAPI = {
      namedQuery: vi.fn().mockImplementation((query, params) => {
        querySpy(query, params);
        if (query === 'checkAssetSnExists' || query === 'checkAssetSnExistsExcludeSelf') {
          // If params[0] is 'EXISTING_SN', return duplicate
          if (params[0] === 'EXISTING_SN') {
            return Promise.resolve({ success: true, rows: [{ id: 99, sn: 'EXISTING_SN' }] });
          }
          return Promise.resolve({ success: true, rows: [] });
        }
        if (query === 'updateAssetDetails') {
          return Promise.resolve({ success: true });
        }
        if (query === 'updateAssetStatus') {
          return Promise.resolve({ success: true });
        }
        if (query === 'updateMountedHardwareServerSn') {
          return Promise.resolve({ success: true });
        }
        if (query === 'updateRepairItemsSn' || query === 'updateOutboundItemsSn') {
          return Promise.resolve({ success: true });
        }
        if (query === 'updateAssetStatusAndAttributes') {
          return Promise.resolve({ success: true });
        }
        if (query === 'insertRmaAssetRecord') {
          return Promise.resolve({ success: true, rows: [{ id: 888, sn: params[1], status: 'ACTIVE' }] });
        }
        if (query === 'insertAuditLog') {
          return Promise.resolve({ success: true });
        }
        return Promise.resolve({ success: true, rows: [] });
      })
    };
  });

  describe('validateNewSn 檢核新序號', () => {
    it('若輸入空白序號，應返回 valid: false 與錯誤訊息', async () => {
      const res = await validateNewSn('   ');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('請輸入原廠新品序號');
    });

    it('若新序號已被其他資產使用，應返回重複警告', async () => {
      const res = await validateNewSn('EXISTING_SN');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('已存在於系統中');
    });

    it('若序號未重複，應返回 valid: true', async () => {
      const res = await validateNewSn('BRAND_NEW_SN_123');
      expect(res.valid).toBe(true);
    });
  });

  describe('模式一：performInPlaceReplacement (直接更換序號 / 承接歷程)', () => {
    const mockAsset = {
      id: 42,
      sn: 'OLD_SN_001',
      brand: 'Supermicro',
      model: 'SYS-2029U-TN24R4T',
      client: '台達電子',
      hostname: 'DELTA-SRV-01',
      location: 'A棟3F',
      ownership: 'FOR_SALE',
      status: 'REPAIR',
      custom_attributes: {
        department: '研發處'
      }
    };

    it('應成功更新資產序號為新序號，並將狀態設為 ACTIVE', async () => {
      const result = await performInPlaceReplacement(mockAsset, 'NEW_SN_001', {
        date: '2026-09-09',
        rmaNo: 'RMA-9999',
        remarks: '原廠更換主板與CPU寄回'
      });

      expect(result.success).toBe(true);
      expect(result.mode).toBe('IN_PLACE');
      expect(result.oldSn).toBe('OLD_SN_001');
      expect(result.newSn).toBe('NEW_SN_001');

      // 檢查是否呼叫 updateAssetDetails
      expect(querySpy).toHaveBeenCalledWith(
        'updateAssetDetails',
        expect.arrayContaining(['NEW_SN_001', '台達電子', 'DELTA-SRV-01', 'A棟3F'])
      );

      // 檢查是否設定為 ACTIVE
      expect(querySpy).toHaveBeenCalledWith('updateAssetStatus', ['ACTIVE', 42]);

      // 檢查掛載硬體伺服器序號是否同步連動
      expect(querySpy).toHaveBeenCalledWith('updateMountedHardwareServerSn', ['NEW_SN_001', 'OLD_SN_001']);

      // 檢查維修單明細與出庫單明細連動
      expect(querySpy).toHaveBeenCalledWith('updateRepairItemsSn', ['NEW_SN_001', 'OLD_SN_001']);
      expect(querySpy).toHaveBeenCalledWith('updateOutboundItemsSn', ['NEW_SN_001', 'OLD_SN_001']);
    });

    it('若新序號與既有資產衝突，應拋出錯誤', async () => {
      await expect(
        performInPlaceReplacement(mockAsset, 'EXISTING_SN')
      ).rejects.toThrow('已存在於系統中');
    });
  });

  describe('模式二：performOneToOneReplacement (RMA 一換一更換 / 舊品報廢換出 + 新品入庫承接)', () => {
    const mockAsset = {
      id: 55,
      item_master_id: 12,
      sn: 'OLD_SRV_777',
      brand: 'ASUS',
      model: 'RS720-E9',
      client: '宏碁電腦',
      end_user: '張工程師',
      hostname: 'ACER-TEST-02',
      location: 'B2機房',
      ownership: 'FOR_SALE',
      status: 'REPAIRING',
      custom_attributes: {
        server_rack: 'RACK-08',
        end_user: '張工程師'
      }
    };

    it('應將舊品設為 SCRAPPED，並新增一筆 ACTIVE 的新品資產承接規格與零組件', async () => {
      const result = await performOneToOneReplacement(mockAsset, 'NEW_SRV_888', {
        date: '2026-09-09',
        rmaNo: 'RMA-ASUS-001',
        remarks: '整機換新寄回'
      });

      expect(result.success).toBe(true);
      expect(result.mode).toBe('ONE_TO_ONE');
      expect(result.oldSn).toBe('OLD_SRV_777');
      expect(result.newSn).toBe('NEW_SRV_888');
      expect(result.newAssetId).toBe(888);

      // 1. 檢查舊品是否設為 SCRAPPED 並記錄替換關聯
      expect(querySpy).toHaveBeenCalledWith(
        'updateAssetStatusAndAttributes',
        [
          'SCRAPPED',
          expect.objectContaining({
            rma_status: 'REPLACED_BY_RMA',
            replaced_by_sn: 'NEW_SRV_888'
          }),
          55
        ]
      );

      // 2. 檢查是否呼叫 insertRmaAssetRecord 建立新資產
      expect(querySpy).toHaveBeenCalledWith(
        'insertRmaAssetRecord',
        expect.arrayContaining([
          12,
          'NEW_SRV_888',
          '宏碁電腦',
          '張工程師',
          'ACER-TEST-02',
          'B2機房'
        ])
      );

      // 3. 檢查掛載硬體伺服器序號是否轉移綁定至新設備
      expect(querySpy).toHaveBeenCalledWith('updateMountedHardwareServerSn', ['NEW_SRV_888', 'OLD_SRV_777']);
    });
  });
});
