/**
 * 出機檢查表的列印內容
 *
 * 預覽與實際列印用的是同一份 HTML，避免「看到的」與「印出來的」不一樣。
 * 產生 HTML 而不是 JSX，是因為列印走獨立的 iframe（直接 window.print()
 * 會把整個應用程式的版面也帶進去，印出頂部位移與空白頁）。
 *
 * 版面是整張表格：設備資訊採「標題｜內容」兩組併排的格狀排版（一列兩組），
 * 檢查項目則是有項次、類別、項目、結果與備註欄的表格，方便現場拿著筆勾填。
 */

/** 表頭固定要出現的欄位，順序即是印出來的順序（由左至右、由上而下） */
export const SHEET_FIELDS = [
  { key: 'type', label: '類型' },
  { key: 'brand', label: '廠牌' },
  { key: 'model', label: '型號' },
  { key: 'specification', label: '規格' },
  { key: 'sn', label: '設備序號' },
  { key: 'hostname', label: '主機名稱' },
  { key: 'client', label: '客戶名稱' },
  { key: 'contact', label: '聯絡人' },
  { key: 'location', label: '放置位置' },
  { key: 'remarks', label: '備註' },
];

/** 資料一律逸出後才放進 HTML：型號、備註等欄位是使用者自由輸入的內容 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 聯絡人可能存在資產的自訂屬性，也可能來自客戶主檔 */
export function getContactName(device) {
  return device?.partner_contact
    || device?.custom_attributes?.contact_person
    || device?.contact_person
    || '';
}

/** 搭載硬體整理成「廠牌 型號（SN: xxx）」一筆一行 */
export function formatMountedHardware(device) {
  const comps = Array.isArray(device?.components) ? device.components : [];
  return comps
    .filter((c) => c && (c.sn || c.model || c.brand))
    .map((c) => {
      const name = [c.brand, c.model].filter(Boolean).join(' ').trim();
      const sn = (c.sn || '').trim();
      if (name && sn) return `${name}（SN: ${sn}）`;
      return name || `SN: ${sn}`;
    });
}

/** 依主項目把檢查項目分組，保留原本的排序 */
export function groupChecklistItems(items) {
  const map = new Map();
  (Array.isArray(items) ? items : []).forEach((row) => {
    const key = row?.group_name || '未分類';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  });
  return [...map.entries()].map(([name, rows]) => ({ name, rows }));
}

/** 兩個欄位併成一列，最後落單的那個把內容欄拉滿 */
export function pairFields(fields) {
  const pairs = [];
  for (let i = 0; i < fields.length; i += 2) {
    pairs.push([fields[i], fields[i + 1] || null]);
  }
  return pairs;
}

const fieldValue = (device, key) => {
  if (key === 'contact') return getContactName(device);
  return device?.[key] ?? '';
};

/**
 * 產生預覽與列印用的內容。
 *
 * @returns {{ body: string, html: string, title: string }}
 *          body 是表單本身，html 是含列印樣式的完整文件
 */
export function buildChecklistSheet(device, items = []) {
  const sn = device?.sn || '';
  const title = `出機檢查表 ${sn}`.trim();

  // 設備資訊：一列兩組「標題｜內容」
  const infoRows = pairFields(SHEET_FIELDS).map(([left, right]) => {
    const cell = (f) => `<th>${escapeHtml(f.label)}</th><td>${escapeHtml(fieldValue(device, f.key)) || '—'}</td>`;
    return right
      ? `<tr>${cell(left)}${cell(right)}</tr>`
      : `<tr>${cell(left)}<td class="blank" colspan="2"></td></tr>`;
  }).join('');

  const hardware = formatMountedHardware(device);
  const hardwareHtml = hardware.length > 0
    ? hardware.map((h) => `<div class="hw-line">${escapeHtml(h)}</div>`).join('')
    : '—';

  const groups = groupChecklistItems(items);
  const all = Array.isArray(items) ? items : [];
  const total = all.length;
  const done = all.filter((i) => i.is_checked).length;

  // 檢查項目：項次、類別、項目、結果、備註
  let seq = 0;
  const checklistRows = groups.map((g) => {
    const head = `
      <tr class="group-row">
        <td colspan="5">${escapeHtml(g.name)}</td>
      </tr>`;
    const rows = g.rows.map((row) => {
      seq += 1;
      return `
      <tr>
        <td class="col-seq">${seq}</td>
        <td class="col-kind">${row.kind === 'DETAIL' ? '細項' : '主要'}</td>
        <td class="col-item">${escapeHtml(row.item_name)}</td>
        <td class="col-result">${row.is_checked ? '☑' : '☐'}</td>
        <td class="col-note"></td>
      </tr>`;
    }).join('');
    return head + rows;
  }).join('');

  const checklistHtml = groups.length === 0
    ? '<tr><td colspan="5" class="empty">尚未套用任何檢查項目</td></tr>'
    : checklistRows;

  const body = `
    <div class="checklist-sheet">
      <div class="sheet-head">
        <h1>出機檢查表</h1>
        <div class="sheet-sub">Pre-delivery Checklist</div>
      </div>

      <table class="info-table">
        <tbody>
          ${infoRows}
          <tr>
            <th>搭載硬體</th>
            <td colspan="3">${hardwareHtml}</td>
          </tr>
        </tbody>
      </table>

      <div class="section-title">檢查項目（共 ${total} 項，已完成 ${done} 項）</div>

      <table class="check-table">
        <thead>
          <tr>
            <th class="col-seq">項次</th>
            <th class="col-kind">類別</th>
            <th class="col-item">檢查項目</th>
            <th class="col-result">檢查結果</th>
            <th class="col-note">備註</th>
          </tr>
        </thead>
        <tbody>
          ${checklistHtml}
        </tbody>
      </table>

      <table class="sign-table">
        <tbody>
          <tr>
            <th>檢查人員</th><td></td>
            <th>檢查日期</th><td></td>
          </tr>
          <tr>
            <th>覆核</th><td></td>
            <th>日期</th><td></td>
          </tr>
        </tbody>
      </table>
    </div>`;

  const styles = `
    @page { size: A4 portrait; margin: 14mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { margin: 0; padding: 0; background: #fff; color: #000;
           font-family: "PingFang TC", "Microsoft JhengHei", "Heiti TC", sans-serif; font-size: 12px; }
    .checklist-sheet { width: 100%; }
    .sheet-head { text-align: center; margin-bottom: 12px; }
    .sheet-head h1 { font-size: 20px; margin: 0; letter-spacing: 3px; }
    .sheet-sub { font-size: 11px; color: #555; margin-top: 2px; }

    table { width: 100%; border-collapse: collapse; margin-bottom: 14px; table-layout: fixed; }
    th, td { border: 1px solid #000; padding: 5px 8px; text-align: left; vertical-align: top;
             word-wrap: break-word; overflow-wrap: break-word; }

    .info-table th { width: 82px; background: #f1f5f9; font-weight: 700; white-space: nowrap; }
    .info-table td.blank { background: repeating-linear-gradient(135deg, #fafafa, #fafafa 6px, #fff 6px, #fff 12px); }
    .hw-line { line-height: 1.7; }

    .section-title { font-size: 13px; font-weight: 800; margin: 16px 0 6px; border-left: 4px solid #000; padding-left: 8px; }

    .check-table thead th { background: #f1f5f9; font-weight: 700; text-align: center; white-space: nowrap; }
    .check-table .col-seq { width: 40px; text-align: center; }
    .check-table .col-kind { width: 50px; text-align: center; white-space: nowrap; }
    .check-table .col-result { width: 62px; text-align: center; font-size: 15px; }
    .check-table .col-note { width: 130px; }
    .check-table .group-row td { background: #e2e8f0; font-weight: 800; text-align: left; }
    .check-table .empty { text-align: center; color: #666; padding: 20px; }

    .sign-table { margin-top: 20px; }
    .sign-table th { width: 78px; background: #f1f5f9; font-weight: 700; white-space: nowrap; }
    .sign-table td { height: 34px; }

    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }

    /* 預覽是在畫面上看，留點邊界才像一張紙；列印的邊界由 @page 決定 */
    @media screen { body { padding: 24px; } }
  `;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>${styles}</style>
</head>
<body>${body}</body>
</html>`;

  return { body, html, title };
}

export default buildChecklistSheet;
