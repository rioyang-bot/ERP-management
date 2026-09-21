import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DeviceBatchImportModal from '../components/DeviceBatchImportModal';
import HwBatchImportModal from '../components/HwBatchImportModal';

/**
 * 「一併補齊既有序號的空白欄位」要看得到
 *
 * 這個選項原本放在預覽區，只有上傳檔案之後才會出現 —— 使用者打開匯入視窗
 * 找不到，等於功能不存在。選項改放在匯入參數設定裡，一打開就看得到。
 */
describe('批次匯入：補齊選項的位置', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    window.electronAPI = {
      namedQuery: vi.fn(() => Promise.resolve({ success: true, rows: [] })),
      runTransaction: vi.fn().mockResolvedValue({ success: true, results: {} }),
      saveFile: vi.fn(),
      getDashboardStats: vi.fn(),
    };
  });

  const NAME = /一併補齊既有序號的空白欄位/;
  const findBox = () => screen.findByRole('checkbox', { name: NAME });

  describe('設備批次匯入', () => {
    const renderModal = () => render(
      <DeviceBatchImportModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} existingBrands={[]} />
    );

    it('還沒上傳檔案就看得到這個選項', async () => {
      renderModal();
      expect(await findBox()).toBeInTheDocument();
    });

    it('預設不勾選：一般匯入的行為不變', async () => {
      renderModal();
      expect(await findBox()).not.toBeChecked();
    });

    it('勾得起來', async () => {
      renderModal();
      const box = await findBox();
      await userEvent.click(box);
      await waitFor(() => expect(box).toBeChecked());
    });

    it('說明講清楚已有值的欄位不會被覆蓋', async () => {
      renderModal();
      expect((await screen.findAllByText(/已經有值的欄位一律不會被覆蓋/)).length).toBeGreaterThan(0);
    });
  });

  describe('硬體批次匯入', () => {
    const renderModal = () => render(
      <HwBatchImportModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />
    );

    it('還沒上傳檔案就看得到這個選項', async () => {
      renderModal();
      expect(await findBox()).toBeInTheDocument();
    });

    it('勾得起來', async () => {
      renderModal();
      const box = await findBox();
      await userEvent.click(box);
      await waitFor(() => expect(box).toBeChecked());
    });
  });
});
