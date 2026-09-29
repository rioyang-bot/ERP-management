import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ItemLedgerModal from '../components/ItemLedgerModal';
import EventLogs from '../pages/EventLogs';
import { logMountChange } from '../utils/auditLogger';
import { queries } from '../../database/queries';

/**
 * 變更搭載硬體要寫進履歷
 *
 * 在設備上加掛或卸下硬體，是這台機器組態最重要的變化之一，
 * 但先前只把清單塞進 details，敘述完全沒提 —— 履歷上看不出動過。
 */
describe('logMountChange 寫進去的內容', () => {
  let sent;

  beforeEach(() => {
    vi.clearAllMocks();
    sent = [];
    window.electronAPI = {
      namedQuery: vi.fn((q, params) => {
        sent.push({ q, params: JSON.stringify(params) });
        return Promise.resolve({ success: true, rows: [{ id: 1 }] });
      }),
    };
  });

  const writes = () => sent.filter((c) => /audit|log/i.test(c.q));

  it('設備端記一筆，加掛與卸下寫在同一句', async () => {
    await logMountChange('SRV-1', 'BLACKCORE 3122', { added: ['HW-A', 'HW-B'], removed: ['HW-C'] });
    const device = writes().find((c) => c.params.includes('SRV-1') && c.params.includes('搭載硬體異動：加掛'));
    expect(device, '應該有設備端那一筆').toBeTruthy();
    expect(device.params).toContain('加掛 HW-A、HW-B');
    expect(device.params).toContain('卸下 HW-C');
    expect(device.params).toContain('"mountChanged":true');
  });

  /** 不記在硬體那一側的話，打開那支硬體的履歷會看不到它被裝到哪裡 */
  it('每支硬體各記一筆，寫明裝上或拆下哪一台', async () => {
    await logMountChange('SRV-1', '設備', { added: ['HW-A'], removed: ['HW-C'] });
    const all = writes().map((c) => c.params).join('\n');
    expect(all).toContain('加掛到設備 [SRV-1]');
    expect(all).toContain('自設備 [SRV-1] 卸下');
    expect(all).toContain('"direction":"MOUNTED"');
    expect(all).toContain('"direction":"UNMOUNTED"');
  });

  it('只有加掛時不會硬湊出「卸下」', async () => {
    await logMountChange('SRV-1', '設備', { added: ['HW-A'] });
    const device = writes().find((c) => c.params.includes('搭載硬體異動：加掛'));
    expect(device.params).not.toContain('卸下');
  });

  it('沒有異動就完全不寫', async () => {
    const r = await logMountChange('SRV-1', '設備', { added: [], removed: [] });
    expect(r).toBeNull();
    expect(writes()).toHaveLength(0);
  });

  it('空白與重複的序號會被清掉', async () => {
    await logMountChange('SRV-1', '設備', { added: [' HW-A ', 'HW-A', '', null], removed: [] });
    const device = writes().find((c) => c.params.includes('搭載硬體異動'));
    expect(device.params).toContain('加掛 HW-A');
    expect(device.params).not.toContain('HW-A、HW-A');
  });
});

describe('履歷把搭載硬體異動分成獨立類型', () => {
  it('以 details.mountChanged 判定，不靠敘述比對', () => {
    expect(queries.fetchItemFlowHistory)
      .toContain("WHEN l.details->>'mountChanged' = 'true' THEN 'MOUNT_CHANGE'");
  });
});

describe('履歷上的呈現', () => {
  const ROWS = [
    {
      transaction_type: 'MOUNT_CHANGE', transaction_date: '2026-09-29', order_no: '-',
      partner_name: 'Rio', quantity: 1, sn: 'SRV-1',
      summary: '搭載硬體異動：加掛 HW-A、HW-B；卸下 HW-C', created_at: '2026-09-29T00:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    window.electronAPI = { namedQuery: vi.fn(() => Promise.resolve({ success: true, rows: ROWS })) };
  });

  it('標成「搭載硬體異動」，並看得到加掛與卸下哪幾支', async () => {
    render(<ItemLedgerModal isOpen onClose={() => {}}
      item={{ item_master_id: 1, sn: 'SRV-1', brand: 'BLACKCORE', model: '3122' }} />);

    await waitFor(() => expect(screen.getByText('搭載硬體異動')).toBeInTheDocument());
    expect(screen.getByText(/加掛 HW-A、HW-B；卸下 HW-C/)).toBeInTheDocument();
  });
});

/**
 * 事件紀錄
 *
 * logMountChange 走的是 logUpdate → insertAuditLog，寫的就是 system_audit_logs，
 * 也就是事件紀錄那一頁的來源，所以不必另外接。這裡把它釘住：
 * 之後若有人把搭載硬體的紀錄改走別條路，這個測試會紅。
 */
describe('事件紀錄看得到搭載硬體異動', () => {
  const LOGS = [
    {
      id: 1, timestamp: '2026-09-29T02:00:00Z', user_name: 'Rio', user_role: 'ADMIN',
      action_type: 'UPDATE', module: 'DEVICE', module_label: '設備管理',
      target_id: 'SRV-1', target_name: 'BLACKCORE 3122',
      summary: '搭載硬體異動：加掛 HW-A、HW-B；卸下 HW-C',
      details: { added: ['HW-A', 'HW-B'], removed: ['HW-C'], mountChanged: true },
    },
    {
      id: 2, timestamp: '2026-09-29T02:00:01Z', user_name: 'Rio', user_role: 'ADMIN',
      action_type: 'UPDATE', module: 'HARDWARE', module_label: '硬體零組件',
      target_id: 'HW-A', target_name: 'HW-A',
      summary: '搭載硬體異動：加掛到設備 [SRV-1]',
      details: { serverSn: 'SRV-1', mountChanged: true, direction: 'MOUNTED' },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    window.electronAPI = {
      namedQuery: vi.fn((q) => {
        if (q === 'fetchAuditLogs') return Promise.resolve({ success: true, rows: LOGS });
        return Promise.resolve({ success: true, rows: [] });
      }),
      getUserPreference: vi.fn().mockResolvedValue({ success: true, value: null }),
      setUserPreference: vi.fn().mockResolvedValue({ success: true }),
    };
  });

  const open = async () => {
    render(<MemoryRouter><EventLogs /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText(/搭載硬體異動：加掛 HW-A、HW-B/)).toBeInTheDocument());
  };

  it('設備端那一筆列得出來', async () => {
    await open();
    expect(screen.getByText('SRV-1')).toBeInTheDocument();
  });

  it('硬體端那一筆也列得出來', async () => {
    await open();
    expect(screen.getByText(/加掛到設備 \[SRV-1\]/)).toBeInTheDocument();
  });

  it('寫的是 insertAuditLog，與事件紀錄同一張表', async () => {
    const sent = [];
    window.electronAPI.namedQuery = vi.fn((q, params) => {
      sent.push({ q, params });
      return Promise.resolve({ success: true, rows: [] });
    });
    await logMountChange('SRV-1', '設備', { added: ['HW-A'] });
    expect(sent.every((c) => c.q === 'insertAuditLog')).toBe(true);
    expect(sent.length).toBeGreaterThan(0);
  });
});
