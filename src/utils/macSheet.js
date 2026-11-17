/**
 * MAC Address Information 的列印內容（列印／另存 PDF）
 *
 * 版面照 LDA 原本的文件：藍色標題、SN、OUI，一張綠色表頭的表格（Pair / Server Port / Exchange Port），
 * Exchange Port 與 MGT 的值用紅字，右下角放 METECH 標誌。A4 橫式一頁。
 *
 * 單獨列印時是一份完整的文件；附在出機檢查表後面時，只取 body 與 styles，
 * 以具名頁面（@page mac-page）讓這一頁單獨橫印，前面的檢查表維持直式。
 * Word 版在 utils/macDocx.js，兩邊的內容來源都是 utils/macAddress.js 的 buildMacTable。
 */
import { buildMacTable, OUI_VENDOR } from './macAddress';
import { escapeHtml } from './checklistSheet';
import logoDataUrl from '../assets/metech-logo.png?inline';

export const MAC_LOGO = logoDataUrl;
export const MAC_TITLE = 'MAC Address Information';

/** 顏色與 Word 版共用 */
export const MAC_COLORS = {
  title: '1F6FC5',
  header: '6A9A3F',
  bandDark: 'D3DFCE',
  bandLight: 'E9EFE7',
  red: 'FF0000',
};

/**
 * @param {{ sn?: string, baseMac?: string, mgtLan?: string, mgtIpmi?: string }} mac
 * @param {{ appended?: boolean }} [opts] appended：接在出機檢查表後面（另起一頁）
 * @returns {{ body: string, styles: string }}
 */
export function buildMacSheetParts(mac = {}, { appended = false } = {}) {
  const { oui, rows } = buildMacTable(mac);
  const c = MAC_COLORS;
  const bodyRows = rows.map((r, i) => {
    const pair = r.mgt
      ? 'MGT<span class="red">(LAN,IPMI)</span>'
      : escapeHtml(r.pair);
    return `
      <tr class="${i % 2 === 0 ? 'band-dark' : 'band-light'}${r.mgt ? ' mgt' : ''}">
        <td class="pair">${pair}</td>
        <td class="mac${r.mgt ? ' red small' : ''}">${escapeHtml(r.server)}</td>
        <td class="mac red${r.mgt ? ' small' : ''}">${escapeHtml(r.exchange)}</td>
      </tr>`;
  }).join('');

  const body = `
    <section class="mac-page${appended ? ' appended' : ''}">
      <h1 class="mac-title">${MAC_TITLE}</h1>
      <div class="mac-sn">SN:&nbsp; ${escapeHtml(mac.sn || '')}</div>
      <div class="mac-oui">OUI: ${OUI_VENDOR} : ${escapeHtml(oui)}</div>
      <table class="mac-table">
        <thead><tr><th>Pair</th><th>Server Port</th><th>Exchange Port</th></tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
      <img class="mac-logo" src="${MAC_LOGO}" alt="METECH" />
    </section>`;

  const styles = `
    /* 頁面邊界設 0：瀏覽器就不會在頁首頁尾印上列印時間、網址（伺服器 IP）與頁碼；
       留白改由 .mac-page 自己的 padding 負責 */
    @page mac-page { size: A4 landscape; margin: 0; }
    .mac-page { page: mac-page; position: relative; box-sizing: border-box; height: 208mm; padding: 12mm;
                overflow: hidden; color: #000;
                font-family: Arial, "Microsoft JhengHei", sans-serif; }
    .mac-page.appended { break-before: page; page-break-before: always; }
    .mac-title { margin: 0; text-align: center; color: #${c.title}; font-family: "Times New Roman", serif;
                 font-size: 46px; font-weight: 700; letter-spacing: 1px; line-height: 1.1; }
    .mac-sn { text-align: center; color: #${c.title}; font-family: "Times New Roman", serif;
              font-size: 26px; font-weight: 700; margin-top: 2px; }
    .mac-oui { text-align: center; font-size: 21px; font-weight: 700; margin: 16px 0 6px; }
    .mac-table { width: 88%; margin: 0 auto; border-collapse: collapse; table-layout: fixed; }
    .mac-table th, .mac-table td { border: 2px solid #fff; padding: 2px 12px; text-align: left; }
    .mac-table th { background: #${c.header}; color: #fff; font-size: 25px; font-weight: 700; height: 44px; }
    .mac-table td { font-size: 24px; height: 41px; }
    .mac-table tr.band-dark td { background: #${c.bandDark}; }
    .mac-table tr.band-light td { background: #${c.bandLight}; }
    .mac-table .red { color: #${c.red}; }
    .mac-table td.small { font-size: 17px; vertical-align: top; padding-top: 4px; }
    .mac-logo { position: absolute; right: 12mm; bottom: 12mm; width: 22mm; }
  `;
  return { body, styles };
}

/** 單獨列印 MAC 表：一份完整的 HTML 文件 */
export function buildMacSheet(mac = {}) {
  const { body, styles } = buildMacSheetParts(mac);
  const title = `MAC Address Information ${mac.sn || ''}`.trim();
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4 landscape; margin: 0; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { margin: 0; padding: 0; background: #fff; }
    @media screen { body { padding: 24px; } }
    ${styles}
  </style>
</head>
<body>${body}</body>
</html>`;
  return { body, html, title };
}
