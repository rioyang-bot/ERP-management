import React from 'react';
import { ASSET_PART_COLORS } from '../../utils/assetColumns';

/**
 * 設備／硬體列表首欄：類型 / 廠牌 / 型號 / 規格
 *
 *   第一行  類型 / 廠牌
 *   第二行  型號 / 規格
 *   第三行  公司資產標籤與資產編號（只有公司資產才有）
 *
 * 上行走藍色系、下行走青色系，每一行都是左淺右深：同一行用同一色系，
 * 兩行之間才分得開；左右深淺不同，則分得出哪一段是哪個欄位。
 * 分隔線維持灰色，免得再插進另一種顏色而更難讀。
 * 顏色取自主題變數，深淺色主題各有一組，不是寫死的色碼。
 *
 * 公司資產標籤原本擠在第一行的類型／廠牌後面，遇到長廠牌名稱
 * （例如 SERVER TECHNOLOGY）就會壓到隔壁的序號欄，所以獨立成一行。
 *
 * 空值不顯示，也不會留下半截的分隔符號；整行都沒有值時顯示 --。
 */

const SEPARATOR = (
  <span style={{ color: 'var(--text-subtle)', margin: '0 4px' }}>/</span>
);

/** 把有值的部分接起來，每一段套用自己的顏色 */
const Line = ({ parts, style }) => {
  const kept = parts.filter(([value]) =>
    value !== null && value !== undefined && String(value).trim() !== '');

  if (kept.length === 0) {
    return <span style={{ color: 'var(--text-muted)', ...style }}>--</span>;
  }

  return (
    <>
      {kept.map(([value, color], i) => (
        <React.Fragment key={color}>
          {i > 0 && SEPARATOR}
          <span style={{ color, ...style }}>{String(value).trim()}</span>
        </React.Fragment>
      ))}
    </>
  );
};

const AssetIdentityCell = ({ type, brand, model, specification, isCompanyAsset, assetNo }) => {
  const modelLine = [
    [model, ASSET_PART_COLORS.model],
    [specification, ASSET_PART_COLORS.specification],
  ];
  // 完整內容放在 title，截斷時滑鼠停留仍看得到
  const modelTitle = modelLine
    .map(([v]) => (v === null || v === undefined ? '' : String(v).trim()))
    .filter(Boolean)
    .join(' / ');

  const no = String(assetNo ?? '').trim();

  return (
    <>
      <div style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>
        <Line parts={[[type, ASSET_PART_COLORS.type], [brand, ASSET_PART_COLORS.brand]]} />
      </div>
      <div
        style={{ fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        title={modelTitle}
      >
        <Line parts={modelLine} />
      </div>
      {isCompanyAsset && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px', whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: '10px', padding: '2px 6px', backgroundColor: '#8b5cf6', color: 'white', borderRadius: '4px' }}>
            公司資產
          </span>
          {/* 沒編號時不留空白，直接看得出還沒編 */}
          {no
            ? <span style={{ fontSize: '11px', fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-main)' }} title={`資產序號 ${no}`}>{no}</span>
            : <span style={{ fontSize: '11px', color: 'var(--text-subtle)' }}>未編號</span>}
        </div>
      )}
    </>
  );
};

export default AssetIdentityCell;
