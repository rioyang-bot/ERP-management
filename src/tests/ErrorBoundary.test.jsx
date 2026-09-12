import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ErrorBoundary from '../components/ErrorBoundary';

// React 在正式版建置中，任何一處渲染丟出未捕捉的錯誤都會卸載整棵元件樹，
// 使用者只會看到全白畫面且沒有任何訊息。這組測試確保錯誤邊界會攔下錯誤、
// 顯示可讀的說明與錯誤內容，讓畫面不再變成空白。
describe('ErrorBoundary 錯誤邊界', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    // React 攔截錯誤時本來就會輸出到 console.error，測試中予以靜音
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  const Boom = () => {
    throw new Error('測試用的渲染錯誤');
  };

  it('子元件正常時應原樣顯示內容', () => {
    render(
      <ErrorBoundary>
        <div>正常內容</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('正常內容')).toBeInTheDocument();
  });

  it('子元件渲染丟出錯誤時應顯示錯誤畫面，而非空白', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );

    expect(screen.getByText(/畫面發生未預期的錯誤/)).toBeInTheDocument();
    expect(screen.getByText(/您的資料沒有受到影響/)).toBeInTheDocument();
  });

  it('應顯示實際的錯誤訊息，供使用者回報', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByText(/測試用的渲染錯誤/)).toBeInTheDocument();
  });

  it('應提供返回與重新載入的操作', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByText('返回上一頁')).toBeInTheDocument();
    expect(screen.getByText('重新載入系統')).toBeInTheDocument();
  });

  it('按下重新載入應呼叫 window.location.reload', () => {
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, reload },
    });

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    fireEvent.click(screen.getByText('重新載入系統'));
    expect(reload).toHaveBeenCalled();

    Object.defineProperty(window, 'location', { configurable: true, value: original });
  });

  it('錯誤應同時輸出到主控台，保留完整堆疊供除錯', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    const logged = consoleErrorSpy.mock.calls.some(
      (args) => typeof args[0] === 'string' && args[0].includes('[ErrorBoundary]')
    );
    expect(logged).toBe(true);
  });
});
