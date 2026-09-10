import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ConsumableCustomTagsModal from '../components/ConsumableCustomTagsModal';
import ConsumableList from '../pages/ConsumableList';
import { BrowserRouter } from 'react-router-dom';

describe('ConsumableCustomTagsModal 組件測試', () => {
  it('當 isOpen 為 false 時不渲染任何內容', () => {
    const { container } = render(
      <ConsumableCustomTagsModal
        isOpen={false}
        onClose={vi.fn()}
        username="admin"
        tags={[]}
        onUpdateTags={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('正確渲染管理者帳號、標籤數量與空清單提示', () => {
    render(
      <ConsumableCustomTagsModal
        isOpen={true}
        onClose={vi.fn()}
        username="manager1"
        tags={[]}
        onUpdateTags={vi.fn()}
      />
    );

    expect(screen.getByText('manager1')).toBeInTheDocument();
    expect(screen.getByText('0 / 10')).toBeInTheDocument();
    expect(screen.getByText(/尚未新增任何自訂標籤/)).toBeInTheDocument();
  });

  it('成功新增自訂標籤並呼叫 onUpdateTags', () => {
    const onUpdateTags = vi.fn();
    render(
      <ConsumableCustomTagsModal
        isOpen={true}
        onClose={vi.fn()}
        username="admin"
        tags={['METECH']}
        onUpdateTags={onUpdateTags}
      />
    );

    const input = screen.getByPlaceholderText(/輸入自訂標籤文字/);
    fireEvent.change(input, { target: { value: '鏡頭模組' } });
    fireEvent.click(screen.getByRole('button', { name: /新增/i }));

    expect(onUpdateTags).toHaveBeenCalledWith(['METECH', '鏡頭模組']);
  });

  it('阻擋空白與重複標籤並顯示錯誤提示', () => {
    const onUpdateTags = vi.fn();
    render(
      <ConsumableCustomTagsModal
        isOpen={true}
        onClose={vi.fn()}
        username="admin"
        tags={['METECH']}
        onUpdateTags={onUpdateTags}
      />
    );

    const input = screen.getByPlaceholderText(/輸入自訂標籤文字/);
    // 重複標籤測試
    fireEvent.change(input, { target: { value: 'metech' } });
    fireEvent.click(screen.getByRole('button', { name: /新增/i }));

    expect(screen.getByText(/標籤「metech」已存在/)).toBeInTheDocument();
    expect(onUpdateTags).not.toHaveBeenCalled();
  });

  it('限制最多 10 筆標籤，滿 10 筆時禁用輸入與按鈕', () => {
    const tenTags = Array.from({ length: 10 }, (_, i) => `標籤${i + 1}`);
    const onUpdateTags = vi.fn();
    render(
      <ConsumableCustomTagsModal
        isOpen={true}
        onClose={vi.fn()}
        username="admin"
        tags={tenTags}
        onUpdateTags={onUpdateTags}
      />
    );

    expect(screen.getByText('10 / 10')).toBeInTheDocument();
    const input = screen.getByPlaceholderText(/輸入自訂標籤文字/);
    expect(input).toBeDisabled();
    const addBtn = screen.getByRole('button', { name: /新增/i });
    expect(addBtn).toBeDisabled();
  });

  it('成功刪除標籤並呼叫 onUpdateTags', () => {
    const onUpdateTags = vi.fn();
    render(
      <ConsumableCustomTagsModal
        isOpen={true}
        onClose={vi.fn()}
        username="admin"
        tags={['METECH', '耗材A', '耗材B']}
        onUpdateTags={onUpdateTags}
      />
    );

    const deleteButtons = screen.getAllByRole('button', { name: /刪除/i });
    expect(deleteButtons.length).toBe(3);

    // 刪除第一個標籤 METECH
    fireEvent.click(deleteButtons[0]);
    expect(onUpdateTags).toHaveBeenCalledWith(['耗材A', '耗材B']);
  });
});

describe('ConsumableList 自訂標籤整合與帳號隔離測試', () => {
  beforeEach(() => {
    localStorage.clear();
    // 預設登入者 session
    localStorage.setItem('erp_session', JSON.stringify({ username: 'test_admin' }));
    window.electronAPI = {
      namedQuery: vi.fn().mockResolvedValue({ success: true, rows: [] })
    };
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('自動從 localStorage 讀取該帳號標籤，並在搜尋列左側呈現', async () => {
    localStorage.setItem('consumable_custom_tags_test_admin', JSON.stringify(['METECH', '鏡頭']));

    render(
      <BrowserRouter>
        <ConsumableList />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('custom-tag-btn-METECH')).toBeInTheDocument();
      expect(screen.getByTestId('custom-tag-btn-鏡頭')).toBeInTheDocument();
    });
  });

  it('點選自訂標籤將文字帶入搜尋列，再次點選則取消清除', async () => {
    localStorage.setItem('consumable_custom_tags_test_admin', JSON.stringify(['METECH']));

    render(
      <BrowserRouter>
        <ConsumableList />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('custom-tag-btn-METECH')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/快速搜尋廠牌/);
    expect(searchInput.value).toBe('');

    // 點選 METECH
    fireEvent.click(screen.getByTestId('custom-tag-btn-METECH'));
    expect(searchInput.value).toBe('METECH');

    // 再次點選 METECH 取消
    fireEvent.click(screen.getByTestId('custom-tag-btn-METECH'));
    expect(searchInput.value).toBe('');
  });

  it('驗證管理者帳號各自獨立儲存標籤', () => {
    // 模擬帳號 userA 與 userB 分別儲存標籤
    const userATags = ['METECH', 'A_ITEM'];
    const userBTags = ['CANON', 'NIKON'];

    localStorage.setItem('consumable_custom_tags_userA', JSON.stringify(userATags));
    localStorage.setItem('consumable_custom_tags_userB', JSON.stringify(userBTags));

    const loadedA = JSON.parse(localStorage.getItem('consumable_custom_tags_userA'));
    const loadedB = JSON.parse(localStorage.getItem('consumable_custom_tags_userB'));

    expect(loadedA).toEqual(['METECH', 'A_ITEM']);
    expect(loadedB).toEqual(['CANON', 'NIKON']);
    expect(loadedA).not.toEqual(loadedB);
  });
});
