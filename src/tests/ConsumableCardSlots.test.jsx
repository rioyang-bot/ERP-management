import React from 'react';
import { render, waitFor, fireEvent, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ConsumableList from '../pages/ConsumableList';
import { RoleContext } from '../context/RoleContext';
import { normalizeSlotLayout, moveCardToSlot, slotCount } from '../utils/cardSlots';

/**
 * 耗材列表的卡片換位置：跟設備、硬體列表一樣，每列 6 格、可以拖到任何一格（包括空格）。
 * 先前只能拖到別張卡片上互換順序，放不到空位。
 */
describe('cardSlots', () => {
  it('新卡片補到第一個空位；已不存在的卡片拿掉', () => {
    expect(normalizeSlotLayout({ 0: 'A', 2: 'GONE', 5: 'B' }, ['A', 'B', 'C', 'D'])).toEqual({
      layout: { 0: 'A', 1: 'C', 2: 'D', 5: 'B' }, changed: true,
    });
    expect(normalizeSlotLayout({ 0: 'A', 7: 'B' }, ['A', 'B']).changed).toBe(false);
  });
  it('第一次換成格位時照舊的順序擺', () => {
    expect(normalizeSlotLayout({}, ['A', 'B', 'C'], ['C', 'A']).layout).toEqual({ 0: 'C', 1: 'A', 2: 'B' });
  });
  it('拖到空格直接放；拖到有卡片的格子互換', () => {
    expect(moveCardToSlot({ 0: 'A', 1: 'B' }, 'A', 8)).toEqual({ 1: 'B', 8: 'A' });
    expect(moveCardToSlot({ 0: 'A', 1: 'B' }, 'A', 1)).toEqual({ 0: 'B', 1: 'A' });
    expect(moveCardToSlot({ 0: 'A' }, 'A', 0)).toEqual({ 0: 'A' });
  });
  it('格數：排到的最後一列為止；拖曳中多一列', () => {
    expect(slotCount({ 0: 'A', 7: 'B' })).toBe(12);
    expect(slotCount({ 0: 'A' }, true)).toBe(12);
    expect(slotCount({})).toBe(6);
  });
});

describe('耗材列表：拖曳卡片換位置', () => {
  const ITEMS = [
    { id: 1, item_id: 1, type: 'GBIC', brand: 'CISCO', model: '10G-SR', stock_qty: 5, lab_qty: 0, lent_qty: 0 },
    { id: 2, item_id: 2, type: 'DAC CABLE', brand: 'METECH', model: 'DAC 1M', stock_qty: 3, lab_qty: 0, lent_qty: 0 },
    { id: 3, item_id: 3, type: 'FIBER', brand: 'FS', model: '40G-SR4', stock_qty: 2, lab_qty: 0, lent_qty: 0 },
  ];
  let prefs;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('consumable_aggregation_mode', 'TYPE');
    prefs = {};
    window.alert = vi.fn();
    window.electronAPI = {
      namedQuery: vi.fn(async (q) => (q === 'fetchConsumablesList' ? { success: true, rows: ITEMS } : { success: true, rows: [] })),
      getUserPreference: vi.fn(async (key) => ({ success: true, value: prefs[key] ?? null })),
      setUserPreference: vi.fn(async (key, value) => { prefs[key] = value; return { success: true }; }),
      saveFile: vi.fn(),
    };
  });

  const renderList = () => render(
    <MemoryRouter>
      <RoleContext.Provider value={{ role: 'ADMIN', authUser: { id: 1, username: 'alice' }, setAuthUser: vi.fn() }}>
        <ConsumableList />
      </RoleContext.Provider>
    </MemoryRouter>
  );

  const slotOf = (type) => screen.getByTestId(`consumable-card-${type}`).parentElement.getAttribute('data-testid');

  const drag = (type, targetIdx) => {
    let payload = '';
    const dataTransfer = { setData: (_t, v) => { payload = v; }, getData: () => payload };
    fireEvent.dragStart(screen.getByTestId(`consumable-card-${type}`), { dataTransfer });
    const target = screen.getByTestId(`consumable-slot-${targetIdx}`);
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });
  };

  it('每列 6 格；拖曳中多一列空格，可以放到空格並存回這個帳號的設定', async () => {
    renderList();
    await screen.findByTestId('consumable-card-GBIC');
    expect(screen.getByTestId('consumable-card-grid').style.gridTemplateColumns).toBe('repeat(6, minmax(0, 1fr))');
    expect(screen.queryByTestId('consumable-slot-6')).not.toBeInTheDocument();

    fireEvent.dragStart(screen.getByTestId('consumable-card-GBIC'), { dataTransfer: { setData: () => {}, getData: () => '' } });
    expect(screen.getByTestId('consumable-slot-11')).toBeInTheDocument();
    fireEvent.dragEnd(screen.getByTestId('consumable-card-GBIC'));

    drag('GBIC', 4);
    await waitFor(() => expect(slotOf('GBIC')).toBe('consumable-slot-4'));
    await waitFor(() => expect(prefs['cardLayout:consumableList']?.TYPE).toMatchObject({ 4: 'GBIC' }));
  });

  it('拖到有卡片的格子就互換位置', async () => {
    renderList();
    await screen.findByTestId('consumable-card-GBIC');
    const before = { gbic: slotOf('GBIC'), fiber: slotOf('FIBER') };
    drag('GBIC', Number(before.fiber.replace('consumable-slot-', '')));
    await waitFor(() => expect(slotOf('GBIC')).toBe(before.fiber));
    expect(slotOf('FIBER')).toBe(before.gbic);
  });

  it('舊版存的順序沿用成初始位置', async () => {
    prefs['cardOrder:consumableList'] = { TYPE: ['FIBER', 'GBIC', 'DAC CABLE'] };
    renderList();
    await waitFor(() => expect(slotOf('FIBER')).toBe('consumable-slot-0'));
    expect(slotOf('GBIC')).toBe('consumable-slot-1');
    expect(slotOf('DAC CABLE')).toBe('consumable-slot-2');
  });

  it('存過的位置照著顯示（包括中間空格）', async () => {
    prefs['cardLayout:consumableList'] = { TYPE: { 0: 'DAC CABLE', 3: 'GBIC', 7: 'FIBER' } };
    renderList();
    await waitFor(() => expect(slotOf('FIBER')).toBe('consumable-slot-7'));
    expect(slotOf('GBIC')).toBe('consumable-slot-3');
  });
});
