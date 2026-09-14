import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCardLayout, useCardLayoutByMode } from '../hooks/useCardLayout';
import { RoleContext } from '../context/RoleContext';

/**
 * 卡片排列改為「各帳號各自一份」
 *
 * 原本排列放在 localStorage：同一台電腦換人登入會看到別人排好的位置，
 * 換一台電腦登入則整個排列消失。改為與每頁筆數、自訂顯示欄位相同的做法，
 * 以登入身分為範圍存在伺服器端。
 */
describe('卡片排列：以登入帳號為範圍', () => {
  const getPref = vi.fn();
  const setPref = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    getPref.mockResolvedValue({ success: true, value: null });
    setPref.mockResolvedValue({ success: true });
    window.electronAPI = { getUserPreference: getPref, setUserPreference: setPref };
  });

  const wrapperFor = (username) => ({ children }) => (
    <RoleContext.Provider value={{ role: 'ADMIN', authUser: { id: 1, username }, setAuthUser: vi.fn() }}>
      {children}
    </RoleContext.Provider>
  );

  const renderLayout = (username = 'alice', prefKey = 'cardLayout:deviceList', def = {}, legacy) =>
    renderHook(() => useCardLayout(prefKey, def, legacy), { wrapper: wrapperFor(username) });

  it('套用伺服器上存的排列', async () => {
    getPref.mockResolvedValue({ success: true, value: { 0: 'B', 1: 'A' } });
    const { result } = renderLayout();

    await waitFor(() => expect(result.current[0]).toEqual({ 0: 'B', 1: 'A' }));
    expect(getPref).toHaveBeenCalledWith('cardLayout:deviceList');
  });

  it('尚未設定過時使用預設值', async () => {
    const { result } = renderLayout();
    await waitFor(() => expect(result.current[2]).toBe(true));
    expect(result.current[0]).toEqual({});
  });

  it('拖曳後把排列存回伺服器', async () => {
    const { result } = renderLayout();
    await waitFor(() => expect(result.current[2]).toBe(true));

    act(() => result.current[1]({ 0: 'A', 3: 'B' }));

    expect(result.current[0]).toEqual({ 0: 'A', 3: 'B' });
    expect(setPref).toHaveBeenCalledWith('cardLayout:deviceList', { 0: 'A', 3: 'B' });
  });

  it('不同帳號各自一份，不會沿用上一位使用者的排列', async () => {
    getPref.mockResolvedValue({ success: true, value: { 0: 'ALICE-CARD' } });
    const alice = renderLayout('alice');
    await waitFor(() => expect(alice.result.current[0]).toEqual({ 0: 'ALICE-CARD' }));
    alice.unmount();

    // 換人登入：伺服器上這個帳號還沒有設定，畫面不該留著上一位的排列
    getPref.mockResolvedValue({ success: true, value: null });
    const bob = renderLayout('bob');
    await waitFor(() => expect(bob.result.current[2]).toBe(true));
    expect(bob.result.current[0]).toEqual({});
  });

  it('伺服器回應前就拖曳，回來的舊值不會蓋掉剛排好的位置', async () => {
    let resolvePref;
    getPref.mockReturnValue(new Promise((r) => { resolvePref = r; }));
    const { result } = renderLayout();

    act(() => result.current[1]({ 0: 'JUST-MOVED' }));
    await act(async () => { resolvePref({ success: true, value: { 0: 'OLD' } }); });

    expect(result.current[0]).toEqual({ 0: 'JUST-MOVED' });
  });

  it('形狀不符的設定值當作沒設定過，不會讓卡片區空掉', async () => {
    getPref.mockResolvedValue({ success: true, value: ['A', 'B'] });
    const { result } = renderLayout();
    await waitFor(() => expect(result.current[2]).toBe(true));
    expect(result.current[0]).toEqual({});
  });

  describe('沿用改版前排好的位置', () => {
    it('帳號還沒存過時，把本機既有的排列帶上伺服器', async () => {
      localStorage.setItem('device_list_layout_map', JSON.stringify({ 2: 'OLD-CARD' }));
      const { result } = renderLayout('alice', 'cardLayout:deviceList', {}, 'device_list_layout_map');

      await waitFor(() => expect(result.current[2]).toBe(true));
      expect(result.current[0]).toEqual({ 2: 'OLD-CARD' });
      expect(setPref).toHaveBeenCalledWith('cardLayout:deviceList', { 2: 'OLD-CARD' });
    });

    it('伺服器上已有排列時以伺服器為準', async () => {
      localStorage.setItem('device_list_layout_map', JSON.stringify({ 2: 'OLD-CARD' }));
      getPref.mockResolvedValue({ success: true, value: { 5: 'SERVER-CARD' } });
      const { result } = renderLayout('alice', 'cardLayout:deviceList', {}, 'device_list_layout_map');

      await waitFor(() => expect(result.current[0]).toEqual({ 5: 'SERVER-CARD' }));
      expect(setPref).not.toHaveBeenCalled();
    });
  });

  describe('依聚合維度各記一份排列', () => {
    const renderByMode = (mode) =>
      renderHook(({ m }) => useCardLayoutByMode('cardLayout:deviceList', m, 'device_list_layout_map'), {
        wrapper: wrapperFor('alice'),
        initialProps: { m: mode },
      });

    it('切到別的維度不會看到前一個維度排好的位置', async () => {
      getPref.mockResolvedValue({ success: true, value: { SPEC: { 0: 'S1' }, BRAND: { 3: 'B1' } } });
      const { result, rerender } = renderByMode('SPEC');

      await waitFor(() => expect(result.current[0]).toEqual({ 0: 'S1' }));
      rerender({ m: 'BRAND' });
      expect(result.current[0]).toEqual({ 3: 'B1' });
    });

    it('存檔時只動到目前維度，其他維度的排列保留', async () => {
      getPref.mockResolvedValue({ success: true, value: { SPEC: { 0: 'S1' }, BRAND: { 3: 'B1' } } });
      const { result } = renderByMode('SPEC');
      await waitFor(() => expect(result.current[0]).toEqual({ 0: 'S1' }));

      act(() => result.current[1]({ 1: 'S1' }));

      expect(setPref).toHaveBeenCalledWith('cardLayout:deviceList', { SPEC: { 1: 'S1' }, BRAND: { 3: 'B1' } });
    });

    it('改版前只存一份的排列視為依規格的排列', async () => {
      // 舊資料是 slot → cardKey 的扁平結構，當時只有依規格一種維度
      localStorage.setItem('device_list_layout_map', JSON.stringify({ 0: 'LEGACY' }));
      const { result, rerender } = renderByMode('SPEC');

      await waitFor(() => expect(result.current[2]).toBe(true));
      expect(result.current[0]).toEqual({ 0: 'LEGACY' });
      rerender({ m: 'BRAND' });
      expect(result.current[0]).toEqual({});
    });
  });
});
