/**
 * 出機檢查表匯出 Word（.docx），連照片一起
 *
 * 內容與列印版（utils/checklistSheet.js）相同：設備資訊、檢查項目、細項紀錄、簽核欄，
 * 最後是照片 —— 整頁寬的一欄表格，每個拍照項目先一列「項目：說明」（例如「CPU：lscpu」），
 * 下一列放照片撐滿表格寬度；同一項有幾張就往下排幾列。不屬於任何拍照項目的列在「其他照片」。
 *
 * 照片在瀏覽器裡先轉成 JPEG（透明背景補白、長邊上限 1600px），Word 一律讀得懂，檔案也不會太大。
 */
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
  WidthType, AlignmentType, ShadingType, VerticalAlign,
} from 'docx';
import { SHEET_FIELDS, getContactName, formatMountedHardware, groupChecklistItems, pairFields } from './checklistSheet';
import { resolveMediaUrl } from './media';

// A4，左右上下邊界 14mm（與列印版一致）；長度單位 twip（1/1440 吋）
const PAGE = { width: 11906, height: 16838, margin: 794 };
const CONTENT = PAGE.width - PAGE.margin * 2;
// 照片撐滿表格寬度（扣掉儲存格左右留白），單位是像素（96 dpi）
const PHOTO_MAX_WIDTH = Math.floor(((CONTENT - 240) / 1440) * 96);
const PHOTO_MAX_HEIGHT = 900;
const LABEL_FILL = 'F1F5F9';
const GROUP_FILL = 'E2E8F0';

/** 一段文字；有換行就拆成多行 */
const para = (text, { bold = false, size, align, color } = {}) => new Paragraph({
  alignment: align,
  children: String(text ?? '').split('\n').map((line, i) => new TextRun({ text: line, bold, size, color, break: i > 0 ? 1 : 0 })),
});

const cell = (content, { width, fill, bold, span, align, size } = {}) => new TableCell({
  width: width ? { size: width, type: WidthType.DXA } : undefined,
  columnSpan: span,
  verticalAlign: VerticalAlign.CENTER,
  shading: fill ? { type: ShadingType.CLEAR, color: 'auto', fill } : undefined,
  margins: { top: 60, bottom: 60, left: 100, right: 100 },
  children: (Array.isArray(content) ? content : [content])
    .map((c) => (c instanceof Paragraph || c instanceof Table ? c : para(c, { bold, align, size }))),
});

const table = (rows, columnWidths) => new Table({
  width: { size: CONTENT, type: WidthType.DXA },
  columnWidths,
  rows,
});

const sectionTitle = (text) => new Paragraph({
  spacing: { before: 280, after: 120 },
  border: { left: { style: 'single', size: 24, color: '000000', space: 6 } },
  children: [new TextRun({ text, bold: true, size: 26 })],
});

const fieldValue = (device, key) => (key === 'contact' ? getContactName(device) : device?.[key] ?? '');

/** 一張照片 → ImageRun；寬度撐滿、比例不變 */
const imageParagraph = (img) => {
  const scale = Math.min(PHOTO_MAX_WIDTH / img.width, PHOTO_MAX_HEIGHT / img.height);
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new ImageRun({
      type: img.type || 'jpg',
      data: img.data,
      transformation: { width: Math.round(img.width * scale), height: Math.round(img.height * scale) },
    })],
  });
};

/**
 * 組出 Word 文件。
 *
 * @param {object} device 設備（同列印版）
 * @param {object[]} items 套用到這台設備的檢查項目（含 PHOTO、DETAIL）
 * @param {object[]} photos 這台設備的照片（fetchAssetPhotos）
 * @param {(photo) => Promise<{ data: Uint8Array, width: number, height: number, type?: string }>} loadImage
 * @returns {Promise<{ doc: Document, failed: string[] }>} failed：讀不到的照片檔名
 */
export async function createChecklistDocument(device, items = [], photos = [], { loadImage } = {}) {
  const all = Array.isArray(items) ? items : [];
  const children = [];

  // 標題
  children.push(
    para('出機檢查表', { bold: true, size: 40, align: AlignmentType.CENTER }),
    para('Pre-delivery Checklist', { size: 18, align: AlignmentType.CENTER, color: '555555' }),
    new Paragraph({ children: [] }),
  );

  // 設備資訊：一列兩組「標題｜內容」
  const infoWidths = [1300, (CONTENT - 2600) / 2, 1300, (CONTENT - 2600) / 2];
  const infoRows = pairFields(SHEET_FIELDS).map(([l, r]) => new TableRow({
    children: [
      cell(l.label, { width: infoWidths[0], fill: LABEL_FILL, bold: true }),
      cell(String(fieldValue(device, l.key) || '—'), { width: infoWidths[1] }),
      ...(r
        ? [cell(r.label, { width: infoWidths[2], fill: LABEL_FILL, bold: true }), cell(String(fieldValue(device, r.key) || '—'), { width: infoWidths[3] })]
        : [cell('', { span: 2 })]),
    ],
  }));
  const hardware = formatMountedHardware(device);
  infoRows.push(new TableRow({
    children: [
      cell('搭載硬體', { width: infoWidths[0], fill: LABEL_FILL, bold: true }),
      cell(hardware.length ? hardware.join('\n') : '—', { span: 3 }),
    ],
  }));
  children.push(table(infoRows, infoWidths));

  // 檢查項目：主要檢查功能，依主項目分段
  const isCheckRow = (r) => r.kind !== 'DETAIL' && r.kind !== 'PHOTO';
  const mainRows = all.filter(isCheckRow);
  const checkWidths = [700, CONTENT - 700 - 1300 - 2600, 1300, 2600];
  const checkHead = new TableRow({
    tableHeader: true,
    children: ['項次', '檢查項目', '檢查結果', '備註'].map((t, i) => cell(t, { width: checkWidths[i], fill: LABEL_FILL, bold: true, align: AlignmentType.CENTER })),
  });
  let seq = 0;
  const checkBody = groupChecklistItems(all)
    .map((g) => ({ name: g.name, rows: g.rows.filter(isCheckRow) }))
    .filter((g) => g.rows.length > 0)
    .flatMap((g) => [
      new TableRow({ children: [cell(g.name, { span: 4, fill: GROUP_FILL, bold: true })] }),
      ...g.rows.map((row) => {
        seq += 1;
        const name = row.description ? [para(row.item_name), para(row.description, { size: 18, color: '444444' })] : row.item_name;
        return new TableRow({
          children: [
            cell(String(seq), { width: checkWidths[0], align: AlignmentType.CENTER }),
            cell(name, { width: checkWidths[1] }),
            cell(row.is_checked ? '☑' : '☐', { width: checkWidths[2], align: AlignmentType.CENTER, size: 28 }),
            cell('', { width: checkWidths[3] }),
          ],
        });
      }),
    ]);
  children.push(sectionTitle(`檢查項目（共 ${mainRows.length} 項，已完成 ${mainRows.filter((r) => r.is_checked).length} 項）`));
  children.push(table(checkBody.length
    ? [checkHead, ...checkBody]
    : [checkHead, new TableRow({ children: [cell('尚未套用任何檢查項目', { span: 4, align: AlignmentType.CENTER })] })], checkWidths));

  // 細項紀錄
  const detailRows = all.filter((r) => r.kind === 'DETAIL');
  if (detailRows.length > 0) {
    const w = [700, 3000, CONTENT - 3700];
    children.push(sectionTitle('細項紀錄'));
    children.push(table([
      new TableRow({ tableHeader: true, children: ['項次', '項目', '內容'].map((t, i) => cell(t, { width: w[i], fill: LABEL_FILL, bold: true, align: AlignmentType.CENTER })) }),
      ...detailRows.map((row, idx) => new TableRow({
        children: [
          cell(String(idx + 1), { width: w[0], align: AlignmentType.CENTER }),
          cell(row.description ? [para(row.item_name, { bold: true }), para(row.description, { size: 18, color: '444444' })] : row.item_name, { width: w[1], bold: true }),
          cell(row.content || '', { width: w[2] }),
        ],
      })),
    ], w));
  }

  // 照片：每個拍照項目一列「項目：說明」，下面每張照片一列，撐滿表格寬度
  const photoItems = all.filter((r) => r.kind === 'PHOTO');
  const itemIds = new Set(photoItems.map((r) => r.id));
  const groups = [
    ...photoItems.map((it) => ({
      caption: it.description ? `${it.item_name}：${it.description}` : it.item_name,
      photos: photos.filter((p) => p.checklist_item_id === it.id),
    })),
    { caption: '其他照片', photos: photos.filter((p) => !p.checklist_item_id || !itemIds.has(p.checklist_item_id)) },
  ].filter((g) => g.photos.length > 0 || g.caption !== '其他照片');

  const failed = [];
  if (groups.length > 0) {
    const photoRows = [];
    for (const g of groups) {
      photoRows.push(new TableRow({ cantSplit: true, children: [cell(g.caption, { width: CONTENT })] }));
      if (g.photos.length === 0) {
        photoRows.push(new TableRow({ children: [cell('（尚未上傳照片）', { width: CONTENT, align: AlignmentType.CENTER })] }));
      }
      for (const p of g.photos) {
        let content;
        try {
          content = imageParagraph(await loadImage(p));
        } catch {
          failed.push(p.original_name || p.file_name);
          content = para(`（照片讀取失敗：${p.original_name || p.file_name}）`, { align: AlignmentType.CENTER, color: 'B91C1C' });
        }
        photoRows.push(new TableRow({ cantSplit: true, children: [cell(content, { width: CONTENT })] }));
      }
    }
    children.push(sectionTitle(`照片（共 ${photos.length} 張）`));
    children.push(table(photoRows, [CONTENT]));
  }

  // 簽核
  const signWidths = [1300, (CONTENT - 2600) / 2, 1300, (CONTENT - 2600) / 2];
  children.push(new Paragraph({ children: [] }));
  children.push(table([['檢查人員', '檢查日期'], ['覆核', '日期']].map(([a, b]) => new TableRow({
    height: { value: 560, rule: 'atLeast' },
    children: [
      cell(a, { width: signWidths[0], fill: LABEL_FILL, bold: true }), cell('', { width: signWidths[1] }),
      cell(b, { width: signWidths[2], fill: LABEL_FILL, bold: true }), cell('', { width: signWidths[3] }),
    ],
  })), signWidths));

  const doc = new Document({
    creator: 'ERP',
    title: `出機檢查表 ${device?.sn || ''}`.trim(),
    styles: {
      default: {
        document: { run: { font: { ascii: 'Calibri', hAnsi: 'Calibri', eastAsia: 'Microsoft JhengHei' }, size: 21 } },
      },
    },
    sections: [{
      properties: {
        page: {
          size: { width: PAGE.width, height: PAGE.height },
          margin: { top: PAGE.margin, bottom: PAGE.margin, left: PAGE.margin, right: PAGE.margin },
        },
      },
      children,
    }],
  });
  return { doc, failed };
}

/**
 * 讀一張照片並轉成 JPEG：Word 一律讀得懂（WebP、HEIC 之類不一定），
 * 透明背景補白，長邊上限 1600px，整份文件才不會太大。
 */
export async function loadPhotoForDocx(photo, maxSide = 1600) {
  const resolved = await resolveMediaUrl(photo.file_name);
  if (resolved.error) throw new Error(resolved.error);
  try {
    const blob = await (await fetch(resolved.url)).blob();
    const bmp = await createImageBitmap(blob);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const width = Math.max(1, Math.round(bmp.width * scale));
    const height = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bmp, 0, 0, width, height);
    const out = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
    if (!out) throw new Error('照片轉檔失敗');
    return { data: new Uint8Array(await out.arrayBuffer()), width, height, type: 'jpg' };
  } finally {
    if (resolved.revoke) URL.revokeObjectURL(resolved.url);
  }
}

/** 檔名不能有的字元換掉 */
const safeName = (s) => String(s || '').replace(/[\\/:*?"<>|]/g, '_').trim();

/**
 * 匯出並下載：讀這台設備的照片、組文件、存成「出機檢查表_序號.docx」。
 * @returns {Promise<{ photos: number, failed: string[] }>}
 */
export async function exportChecklistDocx(device, items, { loadImage = loadPhotoForDocx } = {}) {
  const res = await window.electronAPI.namedQuery('fetchAssetPhotos', [device.id]);
  if (!res?.success) throw new Error(res?.error || '讀取照片失敗');
  const photos = res.rows || [];
  const { doc, failed } = await createChecklistDocument(device, items, photos, { loadImage });
  const blob = await Packer.toBlob(doc);

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName(`出機檢查表_${device?.sn || device?.id || ''}`)}.docx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return { photos: photos.length, failed };
}
