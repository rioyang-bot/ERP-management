import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import InboundList from '../../pages/InboundList';

/**
 * 進貨單列表預設停在「已建立 (待確認)」。
 * 已入庫（COMPLETED）的單在「已進貨 (歷史紀錄)」，測這些單的明細時先切過去。
 */
export const renderInboundHistory = () => {
  const r = render(<MemoryRouter><InboundList /></MemoryRouter>);
  fireEvent.click(screen.getByTestId('inbound-tab-history'));
  return r;
};
