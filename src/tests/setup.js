import '@testing-library/jest-dom';
import { vi } from 'vitest';
import { createRunTransactionMock } from './helpers/mockTransaction';

// Node 22 起內建一個實驗性的 localStorage（沒給 --localstorage-file 時是 undefined），
// 會蓋掉 jsdom 的那一個，測試裡 localStorage.getItem 直接拋錯。
// 用不到就補一個存在記憶體裡的 Storage，行為與瀏覽器相同（每個測試檔各自一份）。
const storageWorks = (() => {
  try {
    const s = globalThis.localStorage;
    return !!s && typeof s.getItem === 'function' && typeof s.setItem === 'function';
  } catch {
    return false;
  }
})();
if (!storageWorks) {
  class MemoryStorage {
    #data = new Map();
    get length() { return this.#data.size; }
    key(i) { return [...this.#data.keys()][i] ?? null; }
    getItem(k) { return this.#data.has(String(k)) ? this.#data.get(String(k)) : null; }
    setItem(k, v) { this.#data.set(String(k), String(v)); }
    removeItem(k) { this.#data.delete(String(k)); }
    clear() { this.#data.clear(); }
  }
  for (const name of ['localStorage', 'sessionStorage']) {
    Object.defineProperty(globalThis, name, { value: new MemoryStorage(), configurable: true, writable: true });
  }
}

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
