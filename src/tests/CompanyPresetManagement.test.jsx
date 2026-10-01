import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CompanyPresetModal from '../components/CompanyPresetModal';
import DeliveryReceiptPrintModal from '../components/DeliveryReceiptPrintModal';
import * as presetsModule from '../utils/companyPresets';
import {
  getCompanyPresets, loadCompanyPresets, saveCompanyPreset, deleteCompanyPreset, __resetCompanyPresetsCache,
} from '../utils/companyPresets';
import { queries } from '../../database/queries';

/**
 * 公司範本（借貨申請單、簽收單的頁首與簽章公司）
 *
 * 範本存在伺服器上、所有人共用一份。先前存在各台電腦的瀏覽器裡：
 * 你改過的別人看不到，沒改過的電腦一直顯示建錯的原廠值。
 */

// 假的伺服器：system_configs 裡 key = company_presets 那一筆
let serverValue;
let calls;
const installServer = () => {
  window.electronAPI.namedQuery.mockImplementation(async (query, params) => {
    calls.push({ query, params });
    if (query === 'fetchCompanyPresets') {
      return { success: true, rows: serverValue === null ? [] : [{ value: serverValue }] };
    }
    if (query === 'saveCompanyPresets') {
      // 前處理會把物件轉成 JSON 字串，這裡照做
      serverValue = typeof params[0] === 'string' ? params[0] : JSON.stringify(params[0]);
      return { success: true, rows: [{ updated_at: '2026-10-01' }] };
    }
    return { success: true, rows: [] };
  });
};
const serverDoc = () => JSON.parse(serverValue);

describe('公司資訊範本 (Company Presets)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    __resetCompanyPresetsCache();
    serverValue = null;
    calls = [];
    installServer();
  });

  it('應正確提供預設內建範本 (版本 A 與 版本 B)', () => {
    const presets = getCompanyPresets();
    expect(presets.PRESET_A.isBuiltin).toBe(true);
    expect(presets.PRESET_B.isBuiltin).toBe(true);
  });

  it('CompanyPresetModal 應正確列出內建範本，且說明範本是所有人共用', async () => {
    render(<CompanyPresetModal isOpen onClose={vi.fn()} onPresetsUpdated={vi.fn()} />);

    expect(screen.getByText('公司資訊範本管理')).toBeInTheDocument();
    expect(screen.getByText('版本 A (澳洲總部 / METECH)')).toBeInTheDocument();
    expect(screen.getByText('版本 B (台灣公司 / 竣喆國際)')).toBeInTheDocument();
    expect(screen.getByText(/所有人共用同一份/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('新增公司範本'));
    expect(screen.getByText('範本名稱 *')).toBeInTheDocument();
    expect(screen.getByText('頁首公司資訊 (支援換行)')).toBeInTheDocument();
    expect(screen.getByText('單據簽名/受款公司全稱')).toBeInTheDocument();
  });

  it('新增的自訂範本存到伺服器，不是瀏覽器', async () => {
    const saved = await saveCompanyPreset({
      label: '版本 C (香港分公司)',
      headerRight: 'DREAMJET HONG KONG LTD\nHong Kong Central',
      companySignName: '竣喆國際香港分公司',
    });
    expect(saved.isBuiltin).toBe(false);
    expect(serverDoc().custom.map((p) => p.label)).toEqual(['版本 C (香港分公司)']);
    expect(localStorage.getItem('erp_custom_company_presets')).toBeNull();
    expect(getCompanyPresets()[saved.id].label).toBe('版本 C (香港分公司)');
  });

  it('別台電腦存的範本，這台打開時讀得到', async () => {
    serverValue = JSON.stringify({
      builtinOverrides: { PRESET_A: { label: '版本 A (正確)', headerRight: 'METECH 正確抬頭', companySignName: 'METECH 正確', logo: null } },
      custom: [],
    });
    const presets = await loadCompanyPresets();
    expect(presets.PRESET_A.label).toBe('版本 A (正確)');
    expect(presets.PRESET_A.headerRight).toBe('METECH 正確抬頭');
    // 沒存 LOGO 時用預設 LOGO
    expect(presets.PRESET_A.logo).toBeTruthy();
  });

  it('伺服器上還沒有範本時，把這台瀏覽器改過的範本搬上去一次', async () => {
    localStorage.setItem('erp_builtin_company_overrides', JSON.stringify({
      PRESET_B: { label: '版本 B (改過的)', headerRight: '改過的抬頭', companySignName: '改過的公司', logo: '/assets/logo-abc123.png' },
    }));
    localStorage.setItem('erp_custom_company_presets', JSON.stringify([
      { id: 'CUSTOM_1', label: '香港', headerRight: 'HK', companySignName: 'HK Ltd', logo: 'data:image/png;base64,AAA+/=' },
    ]));

    const presets = await loadCompanyPresets();
    expect(presets.PRESET_B.label).toBe('版本 B (改過的)');
    const doc = serverDoc();
    expect(doc.builtinOverrides.PRESET_B.headerRight).toBe('改過的抬頭');
    // 打包後的 LOGO 路徑每次部署都會變，不搬；上傳的圖片（data: 網址）完整搬過去
    expect(doc.builtinOverrides.PRESET_B.logo).toBeNull();
    expect(doc.custom[0].logo).toBe('data:image/png;base64,AAA+/=');
  });

  it('伺服器上已經有範本時，不會被這台瀏覽器的舊資料蓋掉', async () => {
    serverValue = JSON.stringify({ builtinOverrides: { PRESET_B: { label: '伺服器上的', headerRight: '', companySignName: '' } }, custom: [] });
    localStorage.setItem('erp_builtin_company_overrides', JSON.stringify({ PRESET_B: { label: '舊瀏覽器的' } }));

    const presets = await loadCompanyPresets();
    expect(presets.PRESET_B.label).toBe('伺服器上的');
    expect(calls.filter((c) => c.query === 'saveCompanyPresets')).toHaveLength(0);
  });

  it('儲存前先讀伺服器上最新的一份，不會蓋掉別人剛存的其他範本', async () => {
    await saveCompanyPreset({ label: '我的範本', headerRight: 'A' });
    // 別人在這之間存了另一個
    const doc = serverDoc();
    doc.custom.push({ id: 'CUSTOM_OTHER', label: '別人的範本', headerRight: 'B' });
    serverValue = JSON.stringify(doc);

    await saveCompanyPreset({ id: 'PRESET_A', label: '版本 A 改', headerRight: 'X', companySignName: 'Y' });
    expect(serverDoc().custom.map((p) => p.label)).toEqual(['我的範本', '別人的範本']);
  });

  it('簽收單選得到伺服器上的自訂範本', async () => {
    const customPreset = await saveCompanyPreset({
      label: '版本 C (香港分公司)',
      headerRight: 'DREAMJET HONG KONG LTD\nHong Kong Central',
      companySignName: '竣喆國際香港分公司',
    });

    render(<DeliveryReceiptPrintModal isOpen onClose={vi.fn()} dnData={{ id: 1, request_no: 'DN202602001', customer: '香港測試客戶', project_name: 'HK Project', shipping_date: '2026-02-06' }} items={[]} />);
    await screen.findByRole('option', { name: '版本 C (香港分公司)' });
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: customPreset.id } });

    expect(screen.getAllByText((c) => c.includes('DREAMJET HONG KONG LTD')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText((c) => c.includes('竣喆國際香港分公司')).length).toBeGreaterThanOrEqual(1);
  });

  it('刪除自訂範本後從伺服器移除，內建範本不可刪除', async () => {
    const customPreset = await saveCompanyPreset({ label: '臨時公司範本', headerRight: 'TEMP CO' });
    expect(getCompanyPresets()[customPreset.id]).toBeDefined();

    await deleteCompanyPreset(customPreset.id);
    expect(getCompanyPresets()[customPreset.id]).toBeUndefined();
    expect(serverDoc().custom).toHaveLength(0);

    await expect(deleteCompanyPreset('PRESET_B')).rejects.toThrow('系統內建範本不可刪除');
  });

  /**
   * 內建範本的原廠值當初建錯了，改過之後一律以改過的為準，不提供還原。
   * 經銷商不屬於公司範本，借貨申請單上另外從客戶/廠商管理挑選。
   */
  it('可以修改系統內建範本，改過的就是準的，沒有還原原廠預設', async () => {
    await saveCompanyPreset({
      id: 'PRESET_B',
      label: '版本 B (竣喆國際 - 台北總部)',
      headerRight: '竣喆國際有限公司 台北總部\nTEL: 02-9999-8888',
      companySignName: '竣喆國際有限公司 台北總部',
    });

    const modifiedPresets = getCompanyPresets();
    expect(modifiedPresets.PRESET_B.label).toBe('版本 B (竣喆國際 - 台北總部)');
    expect(modifiedPresets.PRESET_B.isModified).toBe(true);
    expect(modifiedPresets.PRESET_B.isBuiltin).toBe(true);
    expect(presetsModule.resetBuiltinCompanyPreset).toBeUndefined();
  });

  it('範本管理視窗儲存時寫到伺服器並留下事件紀錄', async () => {
    render(<CompanyPresetModal isOpen onClose={vi.fn()} onPresetsUpdated={vi.fn()} />);
    fireEvent.click(screen.getByText('新增公司範本'));
    const label = screen.getByText('範本名稱 *').parentElement.querySelector('input');
    fireEvent.change(label, { target: { value: '新加坡分公司' } });
    fireEvent.click(screen.getByRole('button', { name: /儲存範本/ }));

    await waitFor(() => expect(serverDoc().custom.map((p) => p.label)).toEqual(['新加坡分公司']));
    await waitFor(() => expect(calls.find((c) => c.query === 'insertAuditLog')?.params[8]).toContain('新增公司範本 [新加坡分公司]'));
  });

  it('LOGO 超過 1 MB 不收', async () => {
    render(<CompanyPresetModal isOpen onClose={vi.fn()} onPresetsUpdated={vi.fn()} />);
    fireEvent.click(screen.getByText('新增公司範本'));
    const input = document.querySelector('input[type="file"]');
    const big = new File(['x'], 'big.png', { type: 'image/png' });
    Object.defineProperty(big, 'size', { value: 2 * 1024 * 1024 });
    fireEvent.change(input, { target: { files: [big] } });
    expect(await screen.findByText(/LOGO 圖片不可超過 1 MB/)).toBeInTheDocument();
  });

  it('公司範本不再帶經銷商資料', () => {
    Object.values(presetsModule.DEFAULT_BUILTIN_PRESETS).forEach((p) => {
      expect(p.dealerName).toBeUndefined();
      expect(p.dealerPhone).toBeUndefined();
    });
  });
});

describe('範本的伺服器查詢', () => {
  it('存在 system_configs 的 company_presets，所有人共用一筆', () => {
    expect(queries.fetchCompanyPresets).toContain("WHERE key = 'company_presets'");
    expect(queries.saveCompanyPresets).toContain('ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value');
  });

  it('伺服器收得下含 LOGO 的範本', () => {
    const server = require('fs').readFileSync('server.js', 'utf8');
    expect(server).toContain("app.use(express.json({ limit: '5mb' }));");
  });
});
