import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LendFlowGuide from '../components/LendFlowGuide';

describe('借用與歸還流程說明', () => {
  it('列出四個階段與各自的單據狀態', () => {
    render(<LendFlowGuide />);

    // 階段名稱在流程表與注意事項中都可能出現，這裡只確認至少寫到
    for (const stage of ['建立借用單', '確認借出', '借出期間', '登記歸還']) {
      expect(screen.getAllByText(new RegExp(stage)).length).toBeGreaterThan(0);
    }

    expect(screen.getByText('已建立 (待借出)')).toBeInTheDocument();
    expect(screen.getAllByText('借出中 (待歸還)').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('已結案 (歷史紀錄)')).toBeInTheDocument();
  });

  it('說明建立借用單不會動到庫存，確認借出才會', () => {
    render(<LendFlowGuide />);

    expect(screen.getByText(/不動任何庫存/)).toBeInTheDocument();
    expect(screen.getByText(/這一步才真正動到庫存/)).toBeInTheDocument();
  });

  it('分別寫明設備硬體改狀態、耗材加減數量', () => {
    render(<LendFlowGuide />);

    expect(screen.getByText(/庫存 −N、借出中 \+N/)).toBeInTheDocument();
    expect(screen.getByText(/庫存 \+N、借出中 −N/)).toBeInTheDocument();
    expect(screen.getByText(/狀態 → 在庫 \(ACTIVE\)、位置清空/)).toBeInTheDocument();
  });

  it('提醒建立時不擋超量，要到確認借出才會被擋', () => {
    render(<LendFlowGuide />);

    expect(screen.getByText(/建立借用單時不會擋超量/)).toBeInTheDocument();
  });

  it('說明借出中不計入 Total 與安全庫存警示', () => {
    render(<LendFlowGuide />);

    expect(screen.getByText(/不計入 Total/)).toBeInTheDocument();
  });
});
