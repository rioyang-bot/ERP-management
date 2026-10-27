/**
 * 把一張張 JPEG 圖組成 PDF（每張一頁、滿版）
 *
 * 表單先畫在畫面上（瀏覽器排版、字型都對），再用 html2canvas 拍成圖。
 * PDF 直接收 JPEG（DCTDecode），不用另外裝 PDF 套件，也沒有中文字型要嵌入的問題。
 */

/** A4 橫式（pt） */
export const A4_LANDSCAPE = { width: 841.89, height: 595.28 };

const enc = new TextEncoder();

/** data:image/jpeg;base64,... → bytes */
export const dataUrlToBytes = (dataUrl) => {
  const bin = atob(String(dataUrl).split(',')[1] || '');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

/**
 * @param {{ jpeg: Uint8Array, width: number, height: number }[]} images 圖的位元組與像素大小
 * @param {{ width: number, height: number }} [pageSize] 頁面大小（pt）
 * @returns {Uint8Array}
 */
export function buildImagePdf(images, pageSize = A4_LANDSCAPE) {
  if (!images.length) throw new Error('沒有頁面可以輸出');
  const chunks = [];
  let length = 0;
  const push = (part) => {
    const bytes = typeof part === 'string' ? enc.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  const offsets = [];
  const object = (id, body) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    for (const part of [].concat(body)) push(part);
    push('\nendobj\n');
  };

  const W = pageSize.width.toFixed(2);
  const H = pageSize.height.toFixed(2);
  // 1 目錄、2 頁面樹；之後每頁三個物件：頁面、內容、圖
  const pageIds = images.map((_, i) => 3 + i * 3);

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${images.length} >>`);
  images.forEach((img, i) => {
    const [pageId, contentId, imageId] = [pageIds[i], pageIds[i] + 1, pageIds[i] + 2];
    const content = `q ${W} 0 0 ${H} 0 0 cm /Im${i} Do Q`;
    object(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im${i} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    object(contentId, [`<< /Length ${content.length} >>\nstream\n`, content, '\nendstream']);
    object(imageId, [
      `<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.jpeg.length} >>\nstream\n`,
      img.jpeg,
      '\nendstream',
    ]);
  });

  const count = 3 + images.length * 3;
  const xref = length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let id = 1; id < count; id++) push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let pos = 0;
  for (const c of chunks) { out.set(c, pos); pos += c.length; }
  return out;
}
