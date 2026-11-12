import React from 'react';
import logoUrl from '../assets/iso-dreamjet-logo.png';
import './IsoSheet.css';

/** ISO 表單（A4 橫式）共用的字型與墨色 */
export const KAI = '"DFKai-SB", "標楷體", "BiauKai", "Kaiti TC", "KaiTi", serif';
export const FONT = `"Times New Roman", ${KAI}`;
export const INK = '#000000';

/**
 * LOGO：範本裡是同一張圖裁切後顯示（a:srcRect，左 10.459%、上 25.587%、右 29.155%、下 37.245%），
 * 這裡照同樣比例裁，高度 52px
 */
const LOGO = { natW: 1256, natH: 837, l: 0.10459, t: 0.25587, r: 0.29155, b: 0.37245, height: 52 };
const logoBox = (() => {
  const fullH = LOGO.height / (1 - LOGO.t - LOGO.b);
  const fullW = fullH * (LOGO.natW / LOGO.natH);
  return { boxW: fullW * (1 - LOGO.l - LOGO.r), fullW, fullH, left: -fullW * LOGO.l, top: -fullH * LOGO.t };
})();

/**
 * ISO 表單的頁首：左邊文件編號、文件名稱，中間 LOGO，右邊發布日期、版次（公司範本的頁首）
 * @param {{ meta: { docNo: string, docName: string, publishDate: string, version: string } }} props
 */
const IsoSheetHeader = ({ meta }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `3px solid ${INK}`, paddingBottom: '6px', fontSize: '15px', lineHeight: 1.5 }}>
    <div style={{ fontFamily: FONT, flex: 1 }}>
      <div>文件編號：{meta.docNo}</div>
      <div>文件名稱：{meta.docName}</div>
    </div>
    <div style={{ position: 'relative', width: `${logoBox.boxW}px`, height: `${LOGO.height}px`, overflow: 'hidden', flex: 'none' }}>
      <img src={logoUrl} alt="LOGO" style={{ position: 'absolute', left: `${logoBox.left}px`, top: `${logoBox.top}px`, width: `${logoBox.fullW}px`, height: `${logoBox.fullH}px`, maxWidth: 'none' }} />
    </div>
    <div style={{ flex: 1, textAlign: 'right' }}>
      <div>發布日期：{meta.publishDate}</div>
      <div>版次：{meta.version}</div>
    </div>
  </div>
);

export default IsoSheetHeader;
