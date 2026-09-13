import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import WarrantyBadge from '../components/WarrantyBadge';
import { getWarrantyState, EXPIRING_SOON_DAYS } from '../utils/warranty';

const TODAY = new Date(2026, 8, 13); // 2026-09-13
const daysFromToday = (n) => {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + n);
  return d;
};

describe('保固狀態判定 (getWarrantyState)', () => {
  it('未填到期日回傳 null —— 沒填不等於過期', () => {
    expect(getWarrantyState(null, TODAY)).toBeNull();
    expect(getWarrantyState('', TODAY)).toBeNull();
    expect(getWarrantyState(undefined, TODAY)).toBeNull();
  });

  it('日期格式無效時也回傳 null，不會標成過期', () => {
    expect(getWarrantyState('not-a-date', TODAY)).toBeNull();
  });

  it('到期日在 90 天之後為保固內', () => {
    expect(getWarrantyState(daysFromToday(91), TODAY).status).toBe('VALID');
    expect(getWarrantyState(daysFromToday(365), TODAY).status).toBe('VALID');
  });

  it('剛好 90 天算即將到期，91 天才算保固內', () => {
    expect(getWarrantyState(daysFromToday(EXPIRING_SOON_DAYS), TODAY).status).toBe('EXPIRING');
    expect(getWarrantyState(daysFromToday(EXPIRING_SOON_DAYS + 1), TODAY).status).toBe('VALID');
  });

  it('到期日當天仍算保固內（即將到期），隔天才算過期', () => {
    expect(getWarrantyState(daysFromToday(0), TODAY).status).toBe('EXPIRING');
    expect(getWarrantyState(daysFromToday(-1), TODAY).status).toBe('EXPIRED');
  });

  it('已過期時天數為負數', () => {
    expect(getWarrantyState(daysFromToday(-30), TODAY).days).toBe(-30);
  });

  it('只比日期不比時間：今天稍早到期仍算當天', () => {
    const earlierToday = new Date(2026, 8, 13, 1, 0, 0);
    const nowLater = new Date(2026, 8, 13, 23, 0, 0);
    expect(getWarrantyState(earlierToday, nowLater).status).toBe('EXPIRING');
  });
});

describe('保固狀態標記 (WarrantyBadge)', () => {
  it('保固內顯示綠底的「保」', () => {
    render(<WarrantyBadge expireDate={daysFromToday(200)} name="原廠保固" today={TODAY} />);
    const badge = screen.getByText('保');
    expect(badge).toBeInTheDocument();
    expect(badge.style.backgroundColor).toBe('rgb(22, 163, 74)');
  });

  it('90 天內即將到期顯示黃底的「保」', () => {
    render(<WarrantyBadge expireDate={daysFromToday(30)} name="原廠保固" today={TODAY} />);
    const badge = screen.getByText('保');
    expect(badge.style.backgroundColor).toBe('rgb(245, 158, 11)');
  });

  it('已過期顯示紅底的「過」', () => {
    render(<WarrantyBadge expireDate={daysFromToday(-5)} name="客戶保固" today={TODAY} />);
    const badge = screen.getByText('過');
    expect(badge.style.backgroundColor).toBe('rgb(239, 68, 68)');
  });

  it('未填到期日時完全不顯示標記', () => {
    const { container } = render(<WarrantyBadge expireDate={null} today={TODAY} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('滑鼠提示標出是哪一種保固、到期日與剩餘天數', () => {
    render(<WarrantyBadge expireDate={daysFromToday(30)} name="客戶保固" today={TODAY} />);
    const badge = screen.getByText('保');
    expect(badge.getAttribute('title')).toContain('客戶保固');
    expect(badge.getAttribute('title')).toContain('即將到期');
    expect(badge.getAttribute('title')).toContain('剩 30 天');
  });

  it('已過期的提示顯示已過幾天', () => {
    render(<WarrantyBadge expireDate={daysFromToday(-7)} name="原廠保固" today={TODAY} />);
    expect(screen.getByText('過').getAttribute('title')).toContain('已過 7 天');
  });
});
