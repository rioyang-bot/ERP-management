import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import ConsumableCustomTagsModal from '../components/ConsumableCustomTagsModal';
import ConsumableList from '../pages/ConsumableList';
import { RoleContext } from '../context/RoleContext';
import { useSearchTags, normalizeTags } from '../hooks/useSearchTags';

/**
 * 耗材列表：自訂查詢標籤
 *
 * 常用關鍵字，點一下帶進搜尋框。以前只存在瀏覽器（localStorage），換電腦就沒了；
 * 現在存在登入帳號的個人設定（user_preferences，鍵值 consumableSearchTags），
 * 換電腦登入也看得到。帳號裡還沒設定過時，會把這台瀏覽器裡的舊標籤搬進帳號一次。
 */
const PREF = 'consumableSearchTags';

describe('ConsumableCustomTagsModal 組件測試', () => {
  it('當 isOpen 為 false 時不渲染任何內容', () => {
    const { container } = render(
      <ConsumableCustomTagsModal isOpen={false} onClose={vi.fn()} username="admin" tags={[]} onUpdateTags={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('正確渲染帳號、標籤數量、存在帳號裡的說明與空清單提示', () => {
    render(<ConsumableCustomTagsModal isOpen onClose={vi.fn()} username="manager1" tags={[]} onUpdateTags={vi.fn()} />);
    expect(screen.getByText('manager1')).toBeInTheDocument();
    expect(screen.getByText('0 / 10')).toBeInTheDocument();
    expect(screen.getByText(/存在帳號裡，換電腦登入也看得到/)).toBeInTheDocument();
    expect(screen.getByText(/尚未新增任何自訂標籤/)).toBeInTheDocument();
  });

  it('新增標籤：存進帳號成功才顯示「已存進帳號」並清空輸入', async () => {
    const onUpdateTags = vi.fn().mockResolvedValue({ success: true });
    render(<ConsumableCustomTagsModal isOpen onClose={vi.fn()} username="admin" tags={['METECH']} onUpdateTags={onUpdateTags} />);
    const input = screen.getByPlaceholderText(/輸入自訂標籤文字/);
    fireEvent.change(input, { target: { value: '鏡頭模組' } });
    fireEvent.click(screen.getByRole('button', { name: /新增/i }));

    expect(onUpdateTags).toHaveBeenCalledWith(['METECH', '鏡頭模組']);
    expect(await screen.findByText('已新增標籤「鏡頭模組」，已存進帳號')).toBeInTheDocument();
    expect(input.value).toBe('');
  });

  it('存進帳號失敗：顯示錯誤，輸入保留讓使用者再試', async () => {
    const onUpdateTags = vi.fn().mockResolvedValue({ success: false, error: '儲存個人設定失敗。' });
    render(<ConsumableCustomTagsModal isOpen onClose={vi.fn()} username="admin" tags={[]} onUpdateTags={onUpdateTags} />);
    const input = screen.getByPlaceholderText(/輸入自訂標籤文字/);
    fireEvent.change(input, { target: { value: 'METECH' } });
    fireEvent.click(screen.getByRole('button', { name: /新增/i }));

    expect(await screen.findByText('儲存失敗：儲存個人設定失敗。')).toBeInTheDocument();
    expect(screen.queryByText(/已存進帳號/)).toBeNull();
    expect(input.value).toBe('METECH');
  });

  it('阻擋重複標籤（不分大小寫）並顯示錯誤提示', () => {
    const onUpdateTags = vi.fn();
    render(<ConsumableCustomTagsModal isOpen onClose={vi.fn()} username="admin" tags={['METECH']} onUpdateTags={onUpdateTags} />);
    fireEvent.change(screen.getByPlaceholderText(/輸入自訂標籤文字/), { target: { value: 'metech' } });
    fireEvent.click(screen.getByRole('button', { name: /新增/i }));
    expect(screen.getByText(/標籤「metech」已存在/)).toBeInTheDocument();
    expect(onUpdateTags).not.toHaveBeenCalled();
  });

  it('限制最多 10 筆標籤，滿 10 筆時禁用輸入與按鈕', () => {
    const tenTags = Array.from({ length: 10 }, (_, i) => `標籤${i + 1}`);
    render(<ConsumableCustomTagsModal isOpen onClose={vi.fn()} username="admin" tags={tenTags} onUpdateTags={vi.fn()} />);
    expect(screen.getByText('10 / 10')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/輸入自訂標籤文字/)).toBeDisabled();
    expect(screen.getByRole('button', { name: /新增/i })).toBeDisabled();
  });

  it('刪除標籤並存進帳號', async () => {
    const onUpdateTags = vi.fn().mockResolvedValue({ success: true });
    render(<ConsumableCustomTagsModal isOpen onClose={vi.fn()} username="admin" tags={['METECH', '耗材A', '耗材B']} onUpdateTags={onUpdateTags} />);
    const deleteButtons = screen.getAllByRole('button', { name: /刪除/i });
    expect(deleteButtons.length).toBe(3);
    fireEvent.click(deleteButtons[0]);
    expect(onUpdateTags).toHaveBeenCalledWith(['耗材A', '耗材B']);
    expect(await screen.findByText('已移除標籤「METECH」，已存進帳號')).toBeInTheDocument();
  });
});

describe('useSearchTags：存在帳號的個人設定', () => {
  let stored;
  beforeEach(() => {
    localStorage.clear();
    stored = undefined;
    window.electronAPI = {
      getUserPreference: vi.fn(async () => ({ success: true, value: stored ?? null })),
      setUserPreference: vi.fn(async (key, value) => { stored = value; return { success: true }; }),
    };
  });
  afterEach(() => localStorage.clear());

  const wrapperFor = (user) => ({ children }) => (
    <RoleContext.Provider value={{ authUser: user }}>{children}</RoleContext.Provider>
  );

  it('讀帳號裡的標籤', async () => {
    stored = ['METECH', '光纖'];
    const { result } = renderHook(() => useSearchTags(PREF, 'consumable_custom_tags_'), { wrapper: wrapperFor({ id: 1 }) });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(window.electronAPI.getUserPreference).toHaveBeenCalledWith(PREF);
    expect(result.current.tags).toEqual(['METECH', '光纖']);
  });

  it('儲存寫進帳號（整理過：去空白、去重、最多 10 個）', async () => {
    const { result } = renderHook(() => useSearchTags(PREF), { wrapper: wrapperFor({ id: 1 }) });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => { await result.current.saveTags([' METECH ', 'metech', '光纖']); });
    expect(window.electronAPI.setUserPreference).toHaveBeenCalledWith(PREF, ['METECH', '光纖']);
    expect(result.current.tags).toEqual(['METECH', '光纖']);
  });

  it('儲存失敗：標籤退回原狀並回傳錯誤', async () => {
    stored = ['METECH'];
    const { result } = renderHook(() => useSearchTags(PREF), { wrapper: wrapperFor({ id: 1 }) });
    await waitFor(() => expect(result.current.tags).toEqual(['METECH']));
    window.electronAPI.setUserPreference.mockResolvedValueOnce({ success: false, error: '儲存個人設定失敗。' });
    let res;
    await act(async () => { res = await result.current.saveTags(['METECH', '光纖']); });
    expect(res).toEqual({ success: false, error: '儲存個人設定失敗。' });
    expect(result.current.tags).toEqual(['METECH']);
  });

  it('帳號裡還沒設定過：把這台瀏覽器裡的舊標籤搬進帳號', async () => {
    localStorage.setItem('erp_session', JSON.stringify({ username: 'test_admin' }));
    localStorage.setItem('consumable_custom_tags_test_admin', JSON.stringify(['METECH', '鏡頭']));
    const { result } = renderHook(() => useSearchTags(PREF, 'consumable_custom_tags_'), { wrapper: wrapperFor({ id: 1 }) });
    await waitFor(() => expect(result.current.tags).toEqual(['METECH', '鏡頭']));
    expect(window.electronAPI.setUserPreference).toHaveBeenCalledWith(PREF, ['METECH', '鏡頭']);
  });

  it('帳號裡已經有設定（就算是清空的）：以帳號為準，不再搬舊標籤', async () => {
    stored = [];
    localStorage.setItem('erp_session', JSON.stringify({ username: 'test_admin' }));
    localStorage.setItem('consumable_custom_tags_test_admin', JSON.stringify(['舊的']));
    const { result } = renderHook(() => useSearchTags(PREF, 'consumable_custom_tags_'), { wrapper: wrapperFor({ id: 1 }) });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.tags).toEqual([]);
    expect(window.electronAPI.setUserPreference).not.toHaveBeenCalled();
  });

  it('換人登入就重新讀那個帳號的標籤', async () => {
    window.electronAPI.getUserPreference.mockImplementation(async () => ({ success: true, value: ['A 的標籤'] }));
    let user = { id: 1 };
    const { result, rerender } = renderHook(() => useSearchTags(PREF), {
      wrapper: ({ children }) => <RoleContext.Provider value={{ authUser: user }}>{children}</RoleContext.Provider>,
    });
    await waitFor(() => expect(result.current.tags).toEqual(['A 的標籤']));
    window.electronAPI.getUserPreference.mockImplementation(async () => ({ success: true, value: ['B 的標籤'] }));
    user = { id: 2 };
    rerender();
    await waitFor(() => expect(result.current.tags).toEqual(['B 的標籤']));
  });

  it('normalizeTags 擋掉不是字串的、過長的截到 20 字', () => {
    expect(normalizeTags([null, 3, '', '  ', 'x'.repeat(25), 'OK'])).toEqual(['x'.repeat(20), 'OK']);
    expect(normalizeTags('not array')).toEqual([]);
  });
});

describe('ConsumableList 自訂標籤整合', () => {
  let stored;
  beforeEach(() => {
    localStorage.clear();
    stored = ['METECH', '鏡頭'];
    window.electronAPI = {
      namedQuery: vi.fn().mockResolvedValue({ success: true, rows: [] }),
      getUserPreference: vi.fn(async (key) => ({ success: true, value: key === PREF ? stored : null })),
      setUserPreference: vi.fn(async (key, value) => { if (key === PREF) stored = value; return { success: true }; }),
    };
  });
  afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  const show = () => render(
    <RoleContext.Provider value={{ authUser: { id: 5, username: 'test_admin', full_name: '測試管理員' } }}>
      <BrowserRouter><ConsumableList /></BrowserRouter>
    </RoleContext.Provider>
  );

  it('從帳號讀標籤，在搜尋列左側呈現', async () => {
    show();
    expect(await screen.findByTestId('custom-tag-btn-METECH')).toBeInTheDocument();
    expect(screen.getByTestId('custom-tag-btn-鏡頭')).toBeInTheDocument();
    expect(screen.getByTestId('open-custom-tags-btn')).toHaveTextContent('2');
  });

  it('點選自訂標籤將文字帶入搜尋列，再次點選則取消清除', async () => {
    show();
    const tag = await screen.findByTestId('custom-tag-btn-METECH');
    const searchInput = screen.getByPlaceholderText(/快速搜尋廠牌/);
    expect(searchInput.value).toBe('');
    fireEvent.click(tag);
    expect(searchInput.value).toBe('METECH');
    fireEvent.click(screen.getByTestId('custom-tag-btn-METECH'));
    expect(searchInput.value).toBe('');
  });

  it('從「自訂標籤」新增後存進帳號，列表上馬上出現', async () => {
    show();
    await screen.findByTestId('custom-tag-btn-METECH');
    fireEvent.click(screen.getByTestId('open-custom-tags-btn'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('測試管理員')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByPlaceholderText(/輸入自訂標籤文字/), { target: { value: '光纖' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /新增/i }));

    await waitFor(() => expect(window.electronAPI.setUserPreference).toHaveBeenCalledWith(PREF, ['METECH', '鏡頭', '光纖']));
    expect(await screen.findByTestId('custom-tag-btn-光纖')).toBeInTheDocument();
  });

  it('帳號沒有標籤時不顯示標籤列，只有「自訂標籤」按鈕', async () => {
    stored = [];
    show();
    await waitFor(() => expect(window.electronAPI.getUserPreference).toHaveBeenCalledWith(PREF));
    expect(screen.queryByTestId('custom-tags-container')).toBeNull();
    expect(screen.getByTestId('open-custom-tags-btn')).toBeInTheDocument();
  });
});
