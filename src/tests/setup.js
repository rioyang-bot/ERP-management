import '@testing-library/jest-dom';
import { vi } from 'vitest';

// 模擬 Electron API，這是整合測試的關鍵
// 讓前端元件以為它真的在 Electron 裡面跑
global.window.electronAPI = {
  namedQuery: vi.fn(),
  getDashboardStats: vi.fn(),
};
