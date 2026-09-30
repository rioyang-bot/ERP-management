import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import fs from 'fs';
import ChecklistTemplates from '../pages/ChecklistTemplates';

/**
 * 瀏覽器自動翻譯造成的整頁錯誤
 *
 * index.html 原本宣告 lang="en"，Chrome 把整個系統當英文網頁翻譯。
 * Google 翻譯會把每一段文字節點換成 <font><font>譯文</font></font>，
 * React 之後要移除那段文字時，原本的文字節點已經不在畫面上，
 * 就丟出「無法對 Node 執行 removeChild」。
 *
 * 出機檢查表範本頁：從有兩個以上項目的主項目切到只有一個的（例如 LDA），
 * 說明後面「拖曳左側的握把…」那句要被移除，正好撞上。
 */

/** 模擬 Google 翻譯：把所有非空白的文字節點換成 <font><font>…</font></font> */
const simulateTranslate = (root) => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) if (walker.currentNode.nodeValue.trim()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    const outer = document.createElement('font');
    const inner = document.createElement('font');
    inner.textContent = node.nodeValue;
    outer.appendChild(inner);
    node.parentNode.replaceChild(outer, node);
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  window.alert = vi.fn();
  const groups = [
    { id: 1, name: 'BlackCore 出機檢查表', brand: 'BLACKCORE', main_count: 2, detail_count: 0, photo_count: 0 },
    { id: 2, name: 'LDA 出機檢查表', brand: 'LDA', main_count: 1, detail_count: 0, photo_count: 0 },
  ];
  const items = [
    { id: 11, group_id: 1, kind: 'MAIN', name: 'BIOS 設定' },
    { id: 12, group_id: 1, kind: 'MAIN', name: '網路設定' },
    { id: 21, group_id: 2, kind: 'MAIN', name: 'LDA 韌體' },
  ];
  window.electronAPI = {
    getDashboardStats: vi.fn(),
    runTransaction: vi.fn(),
    namedQuery: vi.fn(async (query) => {
      if (query === 'fetchChecklistGroups') return { success: true, rows: groups };
      if (query === 'fetchChecklistItems') return { success: true, rows: items };
      return { success: true, rows: [] };
    }),
  };
});

describe('瀏覽器翻譯改寫畫面後仍能正常切換', () => {
  it('切到只有一個項目的主項目不會整頁錯誤', async () => {
    const onError = vi.fn();
    const { container } = render(
      <ErrorBoundary onError={onError}><MemoryRouter><ChecklistTemplates /></MemoryRouter></ErrorBoundary>
    );
    await screen.findByText('BIOS 設定');
    await waitFor(() => expect(screen.getByText(/拖曳左側的握把/)).toBeInTheDocument());

    simulateTranslate(container);
    await userEvent.click(screen.getByText('LDA 出機檢查表'));

    await waitFor(() => expect(screen.getByText('LDA 韌體')).toBeInTheDocument());
    expect(onError).not.toHaveBeenCalled();
  });
});

describe('告訴瀏覽器不要翻譯', () => {
  const html = fs.readFileSync('index.html', 'utf8');

  it('宣告為繁體中文，Chrome 才不會當成英文網頁', () => {
    expect(html).toMatch(/<html lang="zh-Hant" translate="no">/);
    expect(html).not.toMatch(/<html lang="en"/);
  });

  it('加上 Google 的不翻譯標記', () => {
    expect(html).toContain('<meta name="google" content="notranslate" />');
  });
});

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err) { this.props.onError(err); }
  render() { return this.state.failed ? <div>failed</div> : this.props.children; }
}
