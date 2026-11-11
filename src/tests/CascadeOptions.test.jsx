import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DeviceRegistrationModal from '../components/DeviceRegistrationModal';
import HwRegistrationModal from '../components/HwRegistrationModal';
import ConsumableRegistrationModal from '../components/ConsumableRegistrationModal';
import { createRunTransactionMock } from './helpers/mockTransaction';
import { optionsMatching } from '../utils/cascadeOptions';

/**
 * 建檔下拉選單的連動
 *
 * 原本只有「廠牌 → 型號」有連動：選了類型，廠牌還是列出所有已建立的廠牌，
 * 容易選到這個類型底下根本沒有的廠牌。改成依既有卡片縮小：
 *   設備／硬體：類型 → 廠牌 → 型號
 *   耗材：廠牌 → 類型 → 型號
 * 新類型、新廠牌（還沒有卡片）不縮小，維持完整清單。
 */
describe('optionsMatching', () => {
  const CARDS = [
    { type: 'SERVER', brand: 'BLACKCORE', model: '3122-SM' },
    { type: 'SERVER', brand: 'DELL', model: 'R750' },
    { type: 'SWITCH', brand: 'ARISTA', model: 'DCS-7130' },
    { type: 'SWITCH', brand: 'DELL', model: 'S5248' },
  ];
  const BRANDS = ['ARISTA', 'BLACKCORE', 'DELL'];

  it('選了類型：只留這個類型底下有卡片的廠牌', () => {
    expect(optionsMatching(BRANDS, CARDS, 'brand', { type: 'SWITCH' })).toEqual(['ARISTA', 'DELL']);
    expect(optionsMatching(BRANDS, CARDS, 'brand', { type: ' server ' })).toEqual(['BLACKCORE', 'DELL']);
  });

  it('類型＋廠牌一起縮小型號', () => {
    expect(optionsMatching(['R750', 'S5248'], CARDS, 'model', { brand: 'DELL', type: 'SWITCH' })).toEqual(['S5248']);
  });

  it('還沒選、或選的是還沒有卡片的新類型：維持完整清單', () => {
    expect(optionsMatching(BRANDS, CARDS, 'brand', { type: '' })).toEqual(BRANDS);
    expect(optionsMatching(BRANDS, CARDS, 'brand', { type: 'STORAGE' })).toEqual(BRANDS);
    expect(optionsMatching(BRANDS, [], 'brand', { type: 'SWITCH' })).toEqual(BRANDS);
  });

  it('這次新增的暫存值一律保留', () => {
    expect(optionsMatching([...BRANDS, 'NEWCO'], CARDS, 'brand', { type: 'SWITCH' }, ['NEWCO'])).toEqual(['ARISTA', 'DELL', 'NEWCO']);
  });
});

const CARDS = [
  { type: 'SERVER', brand: 'BLACKCORE', model: '3122-SM', specification: '' },
  { type: 'SERVER', brand: 'DELL', model: 'R750', specification: '' },
  { type: 'SWITCH', brand: 'ARISTA', model: 'DCS-7130', specification: '' },
  { type: 'SWITCH', brand: 'DELL', model: 'S5248', specification: '' },
];
const MODELS_BY_BRAND = { BLACKCORE: ['3122-SM'], DELL: ['R750', 'S5248'], ARISTA: ['DCS-7130'] };
const rows = (names) => ({ success: true, rows: names.map((name, i) => ({ id: i + 1, name })) });

const mockApi = (names) => {
  const namedQuery = vi.fn(async (q, params) => {
    if (q === 'fetchExistingCards') return { success: true, rows: CARDS };
    if (q === names.brands) return rows(['ARISTA', 'BLACKCORE', 'DELL']);
    if (q === names.types) return rows(['SERVER', 'SWITCH']);
    if (q === names.models) return rows(MODELS_BY_BRAND[params[0]] || []);
    return { success: true, rows: [] };
  });
  window.electronAPI = {
    namedQuery,
    runTransaction: createRunTransactionMock(namedQuery),
    saveFile: vi.fn(),
    getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
    setUserPreference: vi.fn().mockResolvedValue({ success: true }),
  };
};

const optionsOf = (select) => [...select.options].map((o) => o.value).filter(Boolean);
const choose = (select, value) => fireEvent.change(select, { target: { name: select.name, value } });

beforeEach(() => {
  vi.clearAllMocks();
  window.alert = vi.fn();
});

describe.each([
  ['設備', DeviceRegistrationModal, { brands: 'fetchDeviceBrands', types: 'fetchDeviceTypes', models: 'fetchModelsByBrand' }],
  ['硬體', HwRegistrationModal, { brands: 'fetchHwBrands', types: 'fetchHwTypes', models: 'fetchHwModelsByBrand' }],
])('%s建檔：類型 → 廠牌 → 型號', (_, Modal, names) => {
  const open = async () => {
    mockApi(names);
    const { container } = render(<Modal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);
    const sel = (n) => container.querySelector(`select[name="${n}"]`);
    await waitFor(() => expect(optionsOf(sel('type'))).toEqual(['SERVER', 'SWITCH']));
    await waitFor(() => expect(optionsOf(sel('brand'))).toHaveLength(3));
    // 等既有卡片載入（規格建議等都靠它）
    await waitFor(() => expect(window.electronAPI.namedQuery).toHaveBeenCalledWith('fetchExistingCards', expect.anything()));
    return sel;
  };

  it('還沒選類型：列出全部廠牌', async () => {
    const sel = await open();
    expect(optionsOf(sel('brand'))).toEqual(['ARISTA', 'BLACKCORE', 'DELL']);
  });

  it('選了類型：廠牌只列出這個類型底下的；型號只列出這個類型＋廠牌的', async () => {
    const sel = await open();
    choose(sel('type'), 'SWITCH');
    await waitFor(() => expect(optionsOf(sel('brand'))).toEqual(['ARISTA', 'DELL']));

    choose(sel('brand'), 'DELL');
    // DELL 底下有 R750（SERVER）與 S5248（SWITCH），只列 SWITCH 的
    await waitFor(() => expect(optionsOf(sel('model'))).toEqual(['S5248']));
  });

  it('換了類型，原本選的廠牌不在新類型底下就清掉', async () => {
    const sel = await open();
    choose(sel('type'), 'SERVER');
    choose(sel('brand'), 'BLACKCORE');
    await waitFor(() => expect(sel('brand').value).toBe('BLACKCORE'));

    choose(sel('type'), 'SWITCH');
    await waitFor(() => expect(sel('brand').value).toBe(''));
    expect(sel('model').value).toBe('');
  });
});

describe('耗材建檔：廠牌 → 類型 → 型號', () => {
  const NAMES = { brands: 'fetchConsumableBrands', types: 'fetchConsumableTypes', models: 'fetchConsumableModelsByBrand' };

  it('選了廠牌：類型只列出這個廠牌底下的；型號只列出這個廠牌＋類型的', async () => {
    mockApi(NAMES);
    const { container } = render(<MemoryRouter><ConsumableRegistrationModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} /></MemoryRouter>);
    const sel = (n) => container.querySelector(`select[name="${n}"]`);
    // 一開始預設帶第一個廠牌 ARISTA：類型只有 SWITCH
    await waitFor(() => expect(sel('brand').value).toBe('ARISTA'));
    await waitFor(() => expect(optionsOf(sel('type'))).toEqual(['SWITCH']));

    choose(sel('brand'), 'DELL');
    await waitFor(() => expect(optionsOf(sel('type'))).toEqual(['SERVER', 'SWITCH']));
    choose(sel('type'), 'SERVER');
    await waitFor(() => expect(optionsOf(sel('model'))).toEqual(['R750']));
  });
});
