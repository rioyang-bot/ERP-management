import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { RoleContext } from '../context/RoleContext';

// jsdom 畫不出來：拍照的部分換成回傳一張固定大小的假圖
vi.mock('html2canvas', () => ({
  default: vi.fn(async () => ({ width: 2246, height: 1588, toDataURL: () => 'data:image/jpeg;base64,/9j/4A==' })),
}));
import html2canvas from 'html2canvas';
import IsoRoomCheck from '../pages/IsoRoomCheck';
import IsoRoomCheckSheet from '../components/IsoRoomCheckSheet';
import Overview from '../pages/Overview';
import Reports from '../pages/Reports';
import {
  weekRangeText, roomCheckStatus, isAbnormal, toPayload, validateCheck, formFileName, byWeek, formatNumber, emptyCheck,
} from '../utils/isoRoomCheck';

/**
 * ISO 27001 S-408-03 機房檢查表
 *
 * 每週新增一筆（日期時間、溫溼度、四項勾選，有異常寫說明與處理方式），依日期排到第幾周；
 * 每月檢查人、單位主管線上簽核；一個月一張表照範本預覽、下載 PDF。
 * 營運總覽顯示最後一次檢查，超過 7 天沒檢查就醒目提醒；還沒簽完的月份也會提醒。
 */
const OK = { CCTV: 'NORMAL', ACCESS: 'NORMAL', EQUIPMENT: 'NORMAL', ENVIRONMENT: 'NORMAL' };
const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const REC_W1 = {
  id: 1, checkDate: '2026-11-03', checkTime: '14:30', period: '2026-11', weekNo: 1, temperature: 27.5, humidity: 55, results: OK,
  abnormalNote: '空調壓縮機故障', abnormalAction: '通報廠商維修', createdByName: '王機房', canManage: true,
};
const REC_W2 = {
  id: 3, checkDate: '2026-11-10', checkTime: '10:15', period: '2026-11', weekNo: 2, temperature: 22, humidity: 52, results: { ...OK, EQUIPMENT: 'ABNORMAL' },
  abnormalNote: 'Core Switch 風扇亮紅燈', abnormalAction: '更換風扇模組', createdByName: '李主管', canManage: false,
};

const ME = { id: 7, username: 'tom', full_name: '王機房', role: 'IT' };

let store;
let sigState;
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 12, 9, 5, 0));
  store = [REC_W1, REC_W2];
  sigState = { signatures: {}, permissions: { INSPECTOR: { canSign: true, canRevoke: false }, SUPERVISOR: { canSign: false, canRevoke: false } } };
  window.alert = vi.fn();
  window.confirm = vi.fn(() => true);
  window.electronAPI = {
    namedQuery: vi.fn(async () => ({ success: true, rows: [] })),
    isoRoomCheck: vi.fn(async (method, target, body) => {
      if (method === 'GET' && target === 'latest') {
        const last = [...store].sort((a, b) => b.checkDate.localeCompare(a.checkDate))[0];
        return { success: true, lastDate: last?.checkDate || null, lastTime: last?.checkTime || null, userName: last?.createdByName || null };
      }
      if (method === 'GET') return { success: true, rows: store.filter((r) => r.period === target) };
      if (method === 'POST') {
        const row = { id: 99, ...body, period: body.checkDate.slice(0, 7), weekNo: Math.min(5, Math.ceil(Number(body.checkDate.slice(8)) / 7)), createdByName: ME.full_name, canManage: true };
        store = [...store, row];
        return { success: true, row };
      }
      if (method === 'DELETE') { store = store.filter((r) => r.id !== target); return { success: true }; }
      const row = { ...store.find((r) => r.id === target), ...body };
      store = store.map((r) => (r.id === target ? row : r));
      return { success: true, row };
    }),
    isoSignature: vi.fn(async (method, form, period) => {
      if (form === 'me') return { success: true, signaturePng: null };
      if (period === 'pending') return { success: true, months: [] };
      return { success: true, ...sigState };
    }),
  };
});
afterEach(() => { vi.useRealTimers(); });

const Where = () => {
  const loc = useLocation();
  return <div data-testid="where">{loc.pathname}{loc.search}</div>;
};

const renderPage = (entry = '/iso-room-check') => render(
  <RoleContext.Provider value={{ authUser: ME }}>
    <MemoryRouter initialEntries={[entry]}>
      <Routes><Route path="/iso-room-check" element={<IsoRoomCheck />} /></Routes>
    </MemoryRouter>
  </RoleContext.Provider>
);

const roomCalls = (method) => window.electronAPI.isoRoomCheck.mock.calls.filter(([m]) => m === method);

describe('工具函式', () => {
  it('每周的日期範圍：第五周到月底', () => {
    expect(weekRangeText('2026-11', 1)).toBe('1～7日');
    expect(weekRangeText('2026-11', 4)).toBe('22～28日');
    expect(weekRangeText('2026-11', 5)).toBe('29～30日');
    expect(weekRangeText('2026-12', 5)).toBe('29～31日');
    expect(weekRangeText('2028-02', 5)).toBe('29日');
    expect(weekRangeText('2027-02', 5)).toBe('這個月沒有');
  });

  it('超過 7 天沒檢查（或從沒做過）要提醒', () => {
    const now = new Date(2026, 10, 12);
    expect(roomCheckStatus('2026-11-05', now)).toEqual({ lastDate: '2026-11-05', days: 7, overdue: false });
    expect(roomCheckStatus('2026-11-04', now)).toEqual({ lastDate: '2026-11-04', days: 8, overdue: true });
    expect(roomCheckStatus(null, now)).toEqual({ lastDate: null, days: null, overdue: true });
  });

  it('異常判斷、送出內容與前端檢查', () => {
    expect(isAbnormal({ temperature: 22, humidity: 50, results: OK })).toBe(false);
    expect(isAbnormal({ temperature: 26.1, humidity: 50, results: OK })).toBe(true);
    expect(isAbnormal({ temperature: 22, humidity: 39, results: OK })).toBe(true);
    expect(isAbnormal({ temperature: 22, humidity: 50, results: { ...OK, ACCESS: 'ABNORMAL' } })).toBe(true);

    // 沒有異常就不帶說明
    expect(toPayload({ ...emptyCheck(), temperature: '22.5', humidity: '50', results: OK, abnormalNote: '殘留' })).toMatchObject({
      checkDate: '2026-11-12', checkTime: '09:05', temperature: 22.5, humidity: 50, abnormalNote: '', abnormalAction: '',
    });
    const p = toPayload({ ...emptyCheck(), temperature: '28', humidity: '50', results: OK, abnormalNote: ' 冷氣故障 ', abnormalAction: '' });
    expect(p.abnormalNote).toBe('冷氣故障');
    expect(validateCheck(p, '2026-11-12')).toBe('有異常，請填寫處理方式。');
    expect(validateCheck({ ...p, checkDate: '2026-11-13' }, '2026-11-12')).toBe('檢查日期不能是未來的日期。');
    expect(validateCheck(toPayload({ ...emptyCheck(), temperature: '', humidity: '50', results: OK }), '2026-11-12')).toBe('請填寫機房溫度。');
    expect(validateCheck(toPayload({ ...emptyCheck(), temperature: '22', humidity: '50', results: { CCTV: 'NORMAL' } }), '2026-11-12')).toBe('請勾選「門禁管理」的檢查結果（正常或異常）。');

    expect(formFileName('2026-11')).toBe('S-408-03機房檢查表_115年11月.pdf');
    expect(byWeek([REC_W2]).map((r) => r?.id ?? null)).toEqual([null, 3, null, null, null]);
    expect([formatNumber(22), formatNumber('22.50'), formatNumber('')]).toEqual(['22', '22.5', '']);
  });
});

describe('表單版面（照範本）', () => {
  it('五週欄、日期時間、溫溼度、V／ｘ、異常狀況說明；簽名只印有效的', () => {
    const { container } = render(
      <IsoRoomCheckSheet period="2026-11" records={[REC_W1, REC_W2]} signatures={{ INSPECTOR: { png: PNG, signedAt: '2026-11-30T09:00:00' } }} />
    );
    const sheet = container.querySelector('.iso-room-check-sheet');
    expect(sheet).toHaveTextContent('文件編號：S-408-03');
    expect(sheet).toHaveTextContent('文件名稱：機房檢查表');
    expect(sheet).toHaveTextContent('檢查 115年11 月份');
    expect([...sheet.querySelectorAll('thead tr:nth-child(2) th')].map((t) => t.textContent)).toEqual(['第一周', '第二周', '第三周', '第四周', '第五周']);

    const dateCells = sheet.querySelectorAll('thead tr:nth-child(3) td');
    expect(dateCells[0]).toHaveTextContent('11/0314:30');
    expect(dateCells[1]).toHaveTextContent('11/1010:15');
    expect(dateCells[2]).toHaveTextContent('/：');

    const [tempRow, humRow] = sheet.querySelectorAll('tbody tr');
    expect([...tempRow.querySelectorAll('td[data-week]')].map((t) => t.textContent)).toEqual(['27.5℃', '22℃', '℃', '℃', '℃']);
    expect([...humRow.querySelectorAll('td[data-week]')].map((t) => t.textContent)).toEqual(['55%', '52%', '%', '%', '%']);
    // 第三周在範本裡跨兩欄
    expect(tempRow.querySelector('td[data-week="3"]')).toHaveAttribute('colspan', '2');

    const marks = (key) => [...sheet.querySelectorAll(`tr[data-item="${key}"] [data-mark]`)].map((m) => m.textContent);
    expect(marks('CCTV')).toEqual(['V', 'V', '', '', '']);
    expect(marks('EQUIPMENT')).toEqual(['V', 'ｘ', '', '', '']);

    const notes = sheet.querySelector('[data-testid="room-abnormal-notes"]');
    expect(notes).toHaveTextContent('115年11月03日14時30分說明：空調壓縮機故障處理方式：通報廠商維修');
    expect(notes).toHaveTextContent('115年11月10日10時15分說明：Core Switch 風扇亮紅燈處理方式：更換風扇模組');

    expect(within(sheet.querySelector('[data-sign="INSPECTOR"]')).getByAltText('檢查人簽名')).toHaveAttribute('src', PNG);
    expect(sheet.querySelector('[data-sign="INSPECTOR"]')).toHaveTextContent('115/11/30');
    expect(sheet.querySelector('[data-sign="SUPERVISOR"] img')).toBeNull();
    expect(sheet).toHaveTextContent('備註：正常打“V”，異常打“ｘ”，並說明異常狀況及處理方式。');
    expect(sheet).toHaveTextContent('機密等級：內部使用');
    // 填寫人不印在表單上
    expect(sheet).not.toHaveTextContent('王機房');
    expect(sheet).not.toHaveTextContent('李主管');
  });

  it('這個月沒有異常：異常狀況說明欄印範本的空白格式', () => {
    const { container } = render(<IsoRoomCheckSheet period="2026-12" records={[]} />);
    const sheet = container.querySelector('.iso-room-check-sheet');
    expect(sheet).toHaveTextContent('___年___月___日___時___分說明：處理方式：');
    expect(sheet.querySelectorAll('[data-mark]')).toHaveLength(20);
  });
});

describe('機房檢查表頁面', () => {
  it('依周列出這個月的紀錄：溫度超標、異常項目、說明、填寫人；別人的不能改', async () => {
    renderPage();
    const w1 = await screen.findByTestId('room-week-1');
    expect(window.electronAPI.isoRoomCheck).toHaveBeenCalledWith('GET', '2026-11');
    expect(w1).toHaveTextContent('115/11/03 14:30');
    expect(w1).toHaveTextContent('溫度 27.5℃');
    expect(w1).toHaveTextContent('四項檢查正常');
    expect(w1).toHaveTextContent('說明：空調壓縮機故障；處理方式：通報廠商維修');
    expect(w1).toHaveTextContent('填寫：王機房');
    expect(within(w1).getByRole('button', { name: '修改第一周' })).toBeInTheDocument();

    const w2 = screen.getByTestId('room-week-2');
    expect(w2).toHaveTextContent('設備管理 異常');
    expect(within(w2).queryByRole('button')).toBeNull();
    expect(w2).toHaveTextContent('填寫人本人或管理員可修改');

    expect(screen.getByTestId('room-week-3')).toHaveTextContent('尚未檢查');
    expect(screen.getByTestId('room-week-5')).toHaveTextContent('29～30日');
    const status = screen.getByTestId('room-check-status');
    expect(status).toHaveAttribute('data-overdue', 'false');
    expect(status).toHaveTextContent('最後檢查：115/11/10 10:15（2 天前）');
  });

  it('超過 7 天沒檢查：醒目提醒', async () => {
    store = [{ ...REC_W1 }];
    renderPage();
    const status = await screen.findByTestId('room-check-status');
    expect(status).toHaveAttribute('data-overdue', 'true');
    expect(status).toHaveTextContent('已超過 7 天未檢查，請盡快檢查並新增紀錄');
  });

  it('新增：日期時間帶現在；有異常才出現說明欄且必填；送出後簽核區重新讀', async () => {
    renderPage();
    await screen.findByTestId('room-week-1');
    const sigReads = () => window.electronAPI.isoSignature.mock.calls.filter(([m, f, p]) => m === 'GET' && f === 'S-408-03' && p === '2026-11').length;
    const before = sigReads();
    fireEvent.click(screen.getByRole('button', { name: /新增檢查紀錄/ }));
    const dialog = screen.getByRole('dialog', { name: '新增機房檢查紀錄' });
    expect(within(dialog).getByLabelText('檢查日期')).toHaveValue('2026-11-12');
    expect(within(dialog).getByLabelText('時間')).toHaveValue('09:05');
    expect(within(dialog).getByTestId('room-check-week')).toHaveTextContent('記在 115年11月 第二周');

    fireEvent.change(within(dialog).getByLabelText('檢查日期'), { target: { value: '2026-11-17' } });
    // 還沒填就送出
    fireEvent.click(within(dialog).getByRole('button', { name: '新增' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('檢查日期不能是未來的日期');
    fireEvent.change(within(dialog).getByLabelText('檢查日期'), { target: { value: '2026-11-11' } });

    fireEvent.change(within(dialog).getByLabelText(/機房溫度/), { target: { value: '23.4' } });
    fireEvent.change(within(dialog).getByLabelText(/相對溼度/), { target: { value: '50' } });
    for (const label of ['監視設備', '門禁管理', '設備管理']) fireEvent.click(within(dialog).getByLabelText(`${label} 正常`));
    expect(within(dialog).queryByTestId('room-check-abnormal')).toBeNull();
    fireEvent.click(within(dialog).getByLabelText('機房環境 異常'));
    // 正常／異常擇一
    fireEvent.click(within(dialog).getByLabelText('監視設備 異常'));
    expect(within(dialog).getByLabelText('監視設備 正常')).not.toBeChecked();
    fireEvent.click(within(dialog).getByLabelText('監視設備 正常'));
    expect(within(dialog).getByTestId('room-check-abnormal')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '新增' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('請填寫異常說明');

    fireEvent.change(within(dialog).getByLabelText('說明'), { target: { value: '紙箱堆在機櫃旁' } });
    fireEvent.change(within(dialog).getByLabelText('處理方式'), { target: { value: '已移至倉庫' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '新增' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(roomCalls('POST')).toEqual([['POST', null, {
      checkDate: '2026-11-11', checkTime: '09:05', temperature: 23.4, humidity: 50,
      results: { CCTV: 'NORMAL', ACCESS: 'NORMAL', EQUIPMENT: 'NORMAL', ENVIRONMENT: 'ABNORMAL' },
      abnormalNote: '紙箱堆在機櫃旁', abnormalAction: '已移至倉庫',
    }]]);
    await waitFor(() => expect(sigReads()).toBeGreaterThan(before));
  });

  it('溫度超出範圍：輸入框標紅，算異常', async () => {
    renderPage();
    await screen.findByTestId('room-week-1');
    fireEvent.click(screen.getByRole('button', { name: /新增檢查紀錄/ }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/機房溫度/), { target: { value: '30' } });
    expect(dialog).toHaveTextContent('超出管制範圍');
    expect(within(dialog).getByTestId('room-check-abnormal')).toBeInTheDocument();
  });

  it('伺服器回同一周已有紀錄：顯示錯誤，視窗不關', async () => {
    window.electronAPI.isoRoomCheck.mockImplementationOnce(async () => ({ success: true, rows: store }))
      .mockImplementationOnce(async () => ({ success: true, lastDate: '2026-11-10', lastTime: '10:15' }));
    renderPage();
    await screen.findByTestId('room-week-1');
    window.electronAPI.isoRoomCheck.mockImplementationOnce(async () => ({ success: false, status: 409, error: '115年11月第一周已經有檢查紀錄（每週一筆），請改那一筆或換日期。' }));
    fireEvent.click(screen.getByRole('button', { name: /新增檢查紀錄/ }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('檢查日期'), { target: { value: '2026-11-05' } });
    fireEvent.change(within(dialog).getByLabelText(/機房溫度/), { target: { value: '22' } });
    fireEvent.change(within(dialog).getByLabelText(/相對溼度/), { target: { value: '50' } });
    for (const label of ['監視設備', '門禁管理', '設備管理', '機房環境']) fireEvent.click(within(dialog).getByLabelText(`${label} 正常`));
    fireEvent.click(within(dialog).getByRole('button', { name: '新增' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('第一周已經有檢查紀錄');
  });

  it('修改、刪除自己的紀錄', async () => {
    renderPage();
    const w1 = await screen.findByTestId('room-week-1');
    fireEvent.click(within(w1).getByRole('button', { name: '修改第一周' }));
    const dialog = screen.getByRole('dialog', { name: '修改機房檢查紀錄' });
    expect(within(dialog).getByLabelText(/機房溫度/)).toHaveValue(27.5);
    expect(within(dialog).getByLabelText('說明')).toHaveValue('空調壓縮機故障');
    fireEvent.change(within(dialog).getByLabelText(/機房溫度/), { target: { value: '24' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '儲存修改' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // 溫度回到範圍內、四項正常：說明不再送出
    expect(roomCalls('PUT')).toEqual([['PUT', 1, expect.objectContaining({ temperature: 24, abnormalNote: '', abnormalAction: '' })]]);

    fireEvent.click(within(screen.getByTestId('room-week-1')).getByRole('button', { name: '刪除第一周' }));
    await waitFor(() => expect(roomCalls('DELETE')).toEqual([['DELETE', 1]]));
    await waitFor(() => expect(screen.getByTestId('room-week-1')).toHaveTextContent('尚未檢查'));
  });

  it('線上簽核：檢查人、單位主管兩張卡；簽好的印在表單上，失效的不印', async () => {
    sigState = {
      signatures: {
        INSPECTOR: { userName: '王機房', signedAt: '2026-11-30T09:00:00', signaturePng: PNG, stale: false },
        SUPERVISOR: { userName: '李主管', signedAt: '2026-11-30T10:00:00', signaturePng: PNG, stale: true },
      },
      permissions: { INSPECTOR: { canSign: true, canRevoke: true }, SUPERVISOR: { canSign: false, canRevoke: false } },
    };
    const { container } = renderPage('/iso-room-check?month=2026-11');
    const insp = await screen.findByTestId('iso-sign-INSPECTOR');
    expect(await within(insp).findByText('已簽核')).toBeInTheDocument();
    expect(within(screen.getByTestId('iso-sign-SUPERVISOR')).getByText(/簽核後資料有異動/)).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector('.iso-room-check-sheet [data-sign="INSPECTOR"] img')).not.toBeNull());
    expect(container.querySelector('.iso-room-check-sheet [data-sign="SUPERVISOR"] img')).toBeNull();
    expect(window.electronAPI.isoSignature).toHaveBeenCalledWith('GET', 'S-408-03', '2026-11');

    fireEvent.click(within(insp).getByRole('button', { name: '撤銷檢查人簽核' }));
    await waitFor(() => expect(window.electronAPI.isoSignature).toHaveBeenCalledWith('DELETE', 'S-408-03', '2026-11', 'INSPECTOR'));
  });

  it('網址帶 ?month= 直接開那個月', async () => {
    renderPage('/iso-room-check?month=2026-10');
    await screen.findByTestId('room-week-1');
    expect(window.electronAPI.isoRoomCheck).toHaveBeenCalledWith('GET', '2026-10');
    expect(screen.getByTestId('room-week-1')).toHaveTextContent('尚未檢查');
  });

  it('下載 PDF：一個月一張，檔名帶月份', async () => {
    vi.useRealTimers();
    let pdfBlob;
    URL.createObjectURL = vi.fn((b) => { pdfBlob = b; return 'blob:x'; });
    URL.revokeObjectURL = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const completeSpy = vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
    renderPage('/iso-room-check?month=2026-11');
    await screen.findByTestId('room-week-1');
    await waitFor(() => expect(screen.getByRole('button', { name: /下載 PDF/ })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: /下載 PDF/ }));
    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect(html2canvas).toHaveBeenCalledTimes(1);
    expect(html2canvas.mock.calls[0][0]).toHaveClass('iso-room-check-sheet');
    expect(html2canvas.mock.calls[0][1]).toMatchObject({ scale: 2, width: 1123, height: 794 });
    expect(pdfBlob.type).toBe('application/pdf');
    expect(clickSpy.mock.contexts[0].download).toBe('S-408-03機房檢查表_115年11月.pdf');
    clickSpy.mockRestore();
    completeSpy.mockRestore();
  });
});

describe('營運總覽與報表中心', () => {
  const showOverview = () => render(
    <RoleContext.Provider value={{ authUser: ME }}>
      <MemoryRouter initialEntries={['/overview']}>
        <Routes>
          <Route path="/overview" element={<Overview />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </RoleContext.Provider>
  );

  it('最後一次檢查：7 天內綠色，超過紅色提醒；點了進機房檢查表', async () => {
    showOverview();
    const box = await screen.findByTestId('overview-iso-check-S-408-03');
    expect(box).toHaveAttribute('data-overdue', 'false');
    expect(box).toHaveTextContent('機房檢查表 (ISO 27001 S-408-03)');
    expect(box).toHaveTextContent('最後檢查：115/11/10 10:15（2 天前）・李主管');
    fireEvent.click(box);
    expect(await screen.findByTestId('where')).toHaveTextContent('/iso-room-check');
  });

  it('超過 7 天：醒目提醒', async () => {
    store = [{ ...REC_W1 }];
    showOverview();
    const box = await screen.findByTestId('overview-iso-check-S-408-03');
    expect(box).toHaveAttribute('data-overdue', 'true');
    expect(box).toHaveTextContent('已超過 7 天未檢查，請盡快檢查');
  });

  it('還沒簽完的月份：列出缺誰簽，點了開那個月', async () => {
    window.electronAPI.isoSignature = vi.fn(async (method, form, period) => {
      if (period === 'pending' && form === 'S-408-03') {
        return {
          success: true,
          months: [{
            period: '2026-10', label: '115年10月', rowCount: 4,
            roles: [
              { role: 'INSPECTOR', label: '檢查人', status: 'SIGNED', userName: '王機房' },
              { role: 'SUPERVISOR', label: '單位主管', status: 'MISSING', userName: null },
            ],
          }],
        };
      }
      return { success: true, months: [] };
    });
    showOverview();
    const region = await screen.findByRole('region', { name: '機房檢查表待簽提醒' });
    expect(region).toHaveTextContent('機房檢查表 (ISO 27001 S-408-03) 尚未完成簽核');
    const oct = within(region).getByTestId('iso-pending-S-408-03-2026-10');
    expect(oct).toHaveTextContent('4 週紀錄');
    expect(oct).toHaveTextContent('待單位主管簽核');
    expect(oct).not.toHaveTextContent('檢查人');
    expect(screen.queryByRole('region', { name: '設備攜出入單待簽提醒' })).toBeNull();
    fireEvent.click(oct);
    expect(await screen.findByTestId('where')).toHaveTextContent('/iso-room-check?month=2026-10');
  });

  it('報表中心有機房檢查表的卡片', () => {
    render(<MemoryRouter><Reports /></MemoryRouter>);
    expect(screen.getByText('機房檢查表 (ISO 27001 S-408-03)')).toBeInTheDocument();
  });
});
