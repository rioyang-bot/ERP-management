import '@testing-library/jest-dom';
import { vi } from 'vitest';
import { createRunTransactionMock } from './helpers/mockTransaction';

// 模擬 Electron API，這是整合測試的關鍵
// 讓前端元件以為它真的在 Electron 裡面跑
const namedQuery = vi.fn();

global.window.electronAPI = {
  namedQuery,
  // 多步驟交易的預設替身：把每一步轉發給 namedQuery，行為與伺服器端一致
  //（含 $ref 步驟參照與 expectRows 的最少異動筆數檢查）。
  // 測試若自行整組覆寫 window.electronAPI，仍需自行掛上 runTransaction。
  runTransaction: createRunTransactionMock((...args) => window.electronAPI.namedQuery(...args)),
  getDashboardStats: vi.fn(),
};
