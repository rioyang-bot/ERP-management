import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Settings from '../pages/Settings';
import CompanyPresetModal from '../components/CompanyPresetModal';
import { RoleContext } from '../context/RoleContext';
import { __resetCompanyPresetsCache, saveCompanyPreset, DEFAULT_LOGO_NAME } from '../utils/companyPresets';

/**
 * 系統管理與公司範本的欄位變更紀錄
 *
 * 帳號權限、密碼原則、公司範本改了什麼，事件查詢要看得到「欄位：舊 → 新」；
 * 刪除要留下刪除前的內容；LOGO 記檔名（舊檔名 → 新檔名）。
 */

const auditLogs = () => window.electronAPI.namedQuery.mock.calls
  .filter(([q]) => q === 'insertAuditLog')
  .map(([, p]) => ({ action: p[3], module: p[4], targetId: p[6], summary: p[8], details: p[9] }));

describe('帳號權限與密碼原則', () => {
  const ADMIN = { id: 1, username: 'METECH', full_name: '系統管理員', role: 'ADMIN' };
  // 舊格式的 Key（inbound、assets）：比對時要先對齊，不能被當成有變動
  const AMY = { id: 2, username: 'amy', full_name: '李小美', role: 'IT', is_active: true, menu_access: { inbound: true, assets: true } };
  let policy;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    policy = { enabled: false, minLength: 8, requireUppercase: true, requireLowercase: true, requireNumber: true, requireSpecialChar: true };
    window.electronAPI.namedQuery.mockImplementation(async (query) => {
      if (query === 'fetchUsers') return { success: true, rows: [AMY] };
      if (query === 'getSystemSetting') return { success: true, rows: [{ value: policy }] };
      return { success: true, rows: [] };
    });
  });

  const renderPage = () => render(
    <RoleContext.Provider value={{ authUser: ADMIN, role: 'ADMIN', setAuthUser: vi.fn() }}>
      <Settings />
    </RoleContext.Provider>
  );

  it('選單權限：逐項記有權限／無權限的變更前 → 變更後；舊格式 Key 不會被當成有變動', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTitle(/設定功能權限/));
    await screen.findByRole('heading', { name: '權限設定', level: 2 });

    // 進貨單列表是舊 Key（inbound）帶出來的，取消勾選；報表中心原本沒有，勾起來
    await user.click(screen.getByText('進貨單列表 (S/I List)').parentElement);
    await user.click(screen.getByText('報表中心 (Reports)').parentElement);
    await user.click(screen.getByRole('checkbox', { name: '可簽核：機房管理員' }));
    await user.click(screen.getByText(/儲存權限設定/));

    await waitFor(() => expect(auditLogs()).toHaveLength(1));
    const [log] = auditLogs();
    expect(log).toMatchObject({ action: 'UPDATE', module: 'USER', targetId: 'amy' });
    expect(log.summary).toContain('進貨單列表 (S/I List)：有權限 → 無權限');
    expect(log.summary).toContain('報表中心 (Reports)：無權限 → 有權限');
    expect(log.summary).toContain('可簽（機房管理員）：無權限 → 有權限');
    expect(log.details.changes).toEqual([
      { field: 'inboundList', label: '進貨單列表 (S/I List)', from: '有權限', to: '無權限' },
      { field: 'reports', label: '報表中心 (Reports)', from: '無權限', to: '有權限' },
      { field: 'isoSignRoomAdmin', label: '可簽（機房管理員）', from: '無權限', to: '有權限' },
    ]);
    // 原本的內容（未對齊前）也留著
    expect(log.details.before.menu_access).toEqual({ inbound: true, assets: true });
  });

  it('刪除帳號：留下刪除前的姓名、角色、狀態與權限', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByTitle('刪除人員帳號'));

    await waitFor(() => expect(auditLogs()).toHaveLength(1));
    const [log] = auditLogs();
    expect(log.action).toBe('DELETE');
    expect(log.summary).toContain('刪除使用者帳號 [amy]');
    expect(log.summary).toContain('姓名：李小美；角色：IT；狀態：啟用');
    expect(log.summary).toContain('設備列表 (Device List)');
    expect(log.details).toMatchObject({
      id: 2, username: 'amy',
      before: { username: 'amy', full_name: '李小美', role: 'IT', is_active: true, menu_access: { inbound: true, assets: true } },
    });
    expect(log.details.before.permissions).toEqual(expect.arrayContaining(['營運總覽 (Overview)', '進貨單列表 (S/I List)', '設備列表 (Device List)']));
  });

  it('密碼原則：逐項記變更前 → 變更後；儲存失敗不記', async () => {
    const user = userEvent.setup();
    renderPage();
    // 等帳號清單與密碼原則都讀進來
    await screen.findByText('李小美');
    const enabled = screen.getByRole('checkbox', { name: '啟用複雜密碼檢查' });
    await waitFor(() => expect(window.electronAPI.namedQuery).toHaveBeenCalledWith('getSystemSetting', ['password_policy']));
    expect(enabled).not.toBeChecked();
    await user.click(enabled);
    await user.click(screen.getByRole('checkbox', { name: '必須包含特殊符號' }));
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '12' } });
    await user.click(screen.getByRole('button', { name: /儲存安全原則/ }));

    await waitFor(() => expect(auditLogs()).toHaveLength(1));
    const [log] = auditLogs();
    expect(log.summary).toBe('更新系統密碼安全性原則：啟用複雜密碼檢查：停用 → 啟用；最少字元長度：8 → 12；必須包含特殊符號：啟用 → 停用');
    expect(log.details.changes).toEqual([
      { field: 'enabled', label: '啟用複雜密碼檢查', from: '停用', to: '啟用' },
      { field: 'minLength', label: '最少字元長度', from: '8', to: '12' },
      { field: 'requireSpecialChar', label: '必須包含特殊符號', from: '啟用', to: '停用' },
    ]);
    expect(log.details.before).toMatchObject({ enabled: false, minLength: 8 });

    // 再存一次：變更前換成剛存進去的那份；儲存失敗則不記
    window.electronAPI.namedQuery.mockImplementation(async (query) => (
      query === 'upsertSystemSetting' ? { success: false, error: 'boom' } : { success: true, rows: [] }
    ));
    await user.click(screen.getByRole('checkbox', { name: '必須包含數字' }));
    await user.click(screen.getByRole('button', { name: /儲存安全原則/ }));
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith('儲存失敗'));
    expect(auditLogs()).toHaveLength(1);
  });
});

describe('公司範本', () => {
  let serverValue;
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    __resetCompanyPresetsCache();
    serverValue = null;
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    window.electronAPI.namedQuery.mockImplementation(async (query, params) => {
      if (query === 'fetchCompanyPresets') return { success: true, rows: serverValue === null ? [] : [{ value: serverValue }] };
      if (query === 'saveCompanyPresets') {
        serverValue = typeof params[0] === 'string' ? params[0] : JSON.stringify(params[0]);
        return { success: true, rows: [] };
      }
      return { success: true, rows: [] };
    });
  });

  /** 換 LOGO：FileReader 讀出來的 data: 網址 */
  const uploadLogo = async (name, dataUrl) => {
    vi.stubGlobal('FileReader', class { readAsDataURL() { setTimeout(() => this.onload({ target: { result: dataUrl } })); } });
    const file = new File(['x'], name, { type: 'image/png' });
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByAltText('Logo Preview')).toHaveAttribute('src', dataUrl));
    vi.unstubAllGlobals();
  };

  it('上傳的 LOGO 存下原始檔名；修改時記各欄位與 LOGO 檔名的變更前 → 變更後', async () => {
    // 舊範本：有上傳的 LOGO 但沒存檔名
    serverValue = JSON.stringify({
      builtinOverrides: {},
      custom: [{ id: 'CUSTOM_1', label: '香港', headerRight: 'HK', companySignName: 'HK Ltd', logo: 'data:image/png;base64,T0xE' }],
    });
    render(<CompanyPresetModal isOpen onClose={vi.fn()} onPresetsUpdated={vi.fn()} />);
    await screen.findByText('香港');
    fireEvent.click(screen.getAllByText('編輯')[2]);
    const label = screen.getByText('範本名稱 *').parentElement.querySelector('input');
    expect(label).toHaveValue('香港');
    fireEvent.change(label, { target: { value: '香港分公司' } });
    await uploadLogo('hk-logo.png', 'data:image/png;base64,TkVX');
    fireEvent.click(screen.getByRole('button', { name: /儲存範本/ }));

    await waitFor(() => expect(auditLogs()).toHaveLength(1));
    let [log] = auditLogs();
    // 舊範本沒有檔名：第一次更換時變更前是空白
    expect(log.summary).toBe('修改公司範本 [香港分公司]：範本名稱：香港 → 香港分公司；LOGO：（空白） → hk-logo.png');
    expect(log.details.changes).toEqual([
      { field: 'label', label: '範本名稱', from: '香港', to: '香港分公司' },
      { field: 'logo', label: 'LOGO', from: '', to: 'hk-logo.png', kind: 'file' },
    ]);
    expect(log.details.before).toEqual({ label: '香港', headerRight: 'HK', companySignName: 'HK Ltd', logoName: '' });
    expect(JSON.parse(serverValue).custom[0]).toMatchObject({ logo: 'data:image/png;base64,TkVX', logoName: 'hk-logo.png' });
    // 事件紀錄不放圖片本身
    expect(JSON.stringify(log.details)).not.toContain('base64');

    // 再換一次：記舊檔名 → 新檔名
    window.electronAPI.namedQuery.mockClear();
    await screen.findByText('香港分公司');
    fireEvent.click(screen.getAllByText('編輯')[2]);
    await uploadLogo('hk-logo-2026.png', 'data:image/png;base64,TkVXMg==');
    fireEvent.change(screen.getByText('頁首公司資訊 (支援換行)').parentElement.querySelector('textarea'), { target: { value: 'HK\nCentral' } });
    fireEvent.click(screen.getByRole('button', { name: /儲存範本/ }));
    await waitFor(() => expect(auditLogs()).toHaveLength(1));
    [log] = auditLogs();
    expect(log.summary).toContain('LOGO：hk-logo.png → hk-logo-2026.png');
    expect(log.details.changes).toContainEqual({ field: 'headerRight', label: '頁首公司資訊', from: 'HK', to: 'HK\nCentral' });
  });

  it('還原預設 LOGO 記「預設 LOGO」；刪除範本留下刪除前的內容與 LOGO 檔名', async () => {
    const saved = await saveCompanyPreset({ label: '新加坡', headerRight: 'SG', companySignName: 'SG Pte', logo: 'data:image/png;base64,U0c=', logoName: 'sg.png' });
    expect(JSON.parse(serverValue).custom[0].logoName).toBe('sg.png');

    render(<CompanyPresetModal isOpen onClose={vi.fn()} onPresetsUpdated={vi.fn()} />);
    await screen.findByText('新加坡');
    fireEvent.click(screen.getAllByText('編輯')[2]);
    fireEvent.click(screen.getByRole('button', { name: '還原預設 LOGO' }));
    fireEvent.click(screen.getByRole('button', { name: /儲存範本/ }));
    await waitFor(() => expect(auditLogs()).toHaveLength(1));
    expect(auditLogs()[0].details.changes).toEqual([{ field: 'logo', label: 'LOGO', from: 'sg.png', to: DEFAULT_LOGO_NAME, kind: 'file' }]);
    expect(JSON.parse(serverValue).custom[0]).toMatchObject({ logo: null, logoName: null });

    window.electronAPI.namedQuery.mockClear();
    fireEvent.click(await screen.findByTitle('刪除此範本'));
    await waitFor(() => expect(auditLogs()).toHaveLength(1));
    const [log] = auditLogs();
    expect(log).toMatchObject({ action: 'DELETE', targetId: saved.id, summary: '刪除公司範本 [新加坡]' });
    expect(log.details.before).toEqual({ label: '新加坡', headerRight: 'SG', companySignName: 'SG Pte', logoName: DEFAULT_LOGO_NAME });
  });
});
