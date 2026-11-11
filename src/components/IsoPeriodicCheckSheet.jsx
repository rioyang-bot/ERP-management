import React from 'react';
import IsoSheetHeader, { KAI, FONT, INK } from './IsoSheetHeader';
import { SHEET_WIDTH, SHEET_HEIGHT } from './IsoEquipmentSheet';
import { formatRocDate, resultOf } from '../utils/isoPeriodicCheck';

export { SHEET_WIDTH, SHEET_HEIGHT };

const HEAD_H = 38;

const cell = { border: `1px solid ${INK}`, padding: '3px 8px', verticalAlign: 'middle', fontFamily: FONT, lineHeight: 1.35, overflow: 'hidden', color: INK };

const Box = ({ checked }) => (
  <span aria-hidden="true" style={{
    width: '14px', height: '14px', border: `1.5px solid ${INK}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
    backgroundColor: checked ? INK : '#fff', color: '#fff', fontSize: '12px', lineHeight: 1, fontFamily: 'Arial, sans-serif', fontWeight: 900,
  }}>{checked ? '✓' : ''}</span>
);

/** 底線上的手寫欄（異常說明、最後備份日）；沒有值就留白 */
const Blank = ({ value }) => (
  <span style={{ flex: 1, minWidth: 0, borderBottom: `1px solid ${INK}`, fontSize: '13px', lineHeight: 1.25, wordBreak: 'break-word', paddingLeft: '4px' }}>
    {value || ' '}
  </span>
);

/**
 * 結果欄：□正常（備份檢查：□正常，最後備份日＿＿＿）／□異常＿＿＿；空白列都不勾
 */
const Result = ({ def, result }) => (
  <div data-result={result?.status || ''} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
    <span style={{ display: 'flex', alignItems: 'flex-end', gap: '4px' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flex: 'none' }}>
        <Box checked={result?.status === 'NORMAL'} />正常{def.lastBackup ? '，最後備份日' : ''}
      </span>
      {def.lastBackup && <Blank value={result?.status === 'NORMAL' ? result.lastBackup : ''} />}
    </span>
    <span style={{ display: 'flex', alignItems: 'flex-end', gap: '4px' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flex: 'none' }}><Box checked={result?.status === 'ABNORMAL'} />異常</span>
      <Blank value={result?.status === 'ABNORMAL' ? result.note : ''} />
    </span>
  </div>
);

/**
 * ISO 定期檢查表單的一頁（A4 橫式），版面照公司範本（S-409-01 備份檢查紀錄表、S-409-02 日誌審查紀錄表）
 *
 * 一次檢查佔兩列（每個項目一列），日期合併兩列；一頁 def.perPage 次（null 是補的空白）。
 * @param {{ def: object, records: (object|null)[], page: number, pageCount: number }} props
 */
const IsoPeriodicCheckSheet = ({ def, records, page, pageCount }) => {
  const totalW = def.columns.reduce((s, c) => s + c.w, 0);

  const renderCell = (col, record, item, j) => {
    switch (col.key) {
      case 'date':
        return j === 0 ? (
          <td key={col.key} rowSpan={def.items.length} style={{ ...cell, textAlign: 'center' }}>{record ? formatRocDate(record.checkDate) : ''}</td>
        ) : null;
      case 'item':
        return <td key={col.key} style={{ ...cell, height: `${def.rowHeight}px` }}>{item.sheetLabel}</td>;
      case 'detail':
        return <td key={col.key} style={cell}>{item.detail}</td>;
      case 'itemDetail':
        return (
          <td key={col.key} style={{ ...cell, height: `${def.rowHeight}px` }}>
            <div>{item.sheetLabel}</div>
            <div>{item.detail}</div>
          </td>
        );
      case 'result':
        return <td key={col.key} style={cell}><Result def={def} result={record ? resultOf(record, item.key) : null} /></td>;
      case 'reviewer':
        return <td key={col.key} style={{ ...cell, textAlign: 'center' }}>{record?.reviewerName || ''}</td>;
      default:
        return <td key={col.key} style={cell} />;
    }
  };

  return (
    <div
      className="iso-periodic-check-sheet"
      data-form={def.code}
      data-page={page}
      style={{
        width: `${SHEET_WIDTH}px`, height: `${SHEET_HEIGHT}px`, boxSizing: 'border-box', padding: '30px 52px 22px 48px',
        backgroundColor: '#ffffff', color: INK, fontFamily: FONT, display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}
    >
      <IsoSheetHeader meta={def} />

      <div style={{ textAlign: 'center', fontFamily: KAI, fontSize: '26px', letterSpacing: '2px', margin: '12px 0' }}>{def.docName}</div>

      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', border: `2px solid ${INK}`, fontSize: '15px', fontFamily: FONT, color: INK }}>
        <colgroup>{def.columns.map((c) => <col key={c.key} style={{ width: `${(c.w / totalW) * 100}%` }} />)}</colgroup>
        <thead>
          <tr>
            {def.columns.map((c) => (
              // 系統的深色模式會把 th 字色改淺，表單上一律用黑色
              <th key={c.key} style={{ ...cell, height: `${HEAD_H}px`, backgroundColor: '#D9D9D9', fontFamily: KAI, fontWeight: 400, fontSize: '17px', letterSpacing: '2px', textAlign: 'center' }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((record, i) => def.items.map((item, j) => (
            <tr key={`${i}-${item.key}`} data-blank={record ? undefined : 'true'}>
              {def.columns.map((col) => renderCell(col, record, item, j))}
            </tr>
          )))}
        </tbody>
      </table>

      <div style={{ fontFamily: KAI, fontSize: '15px', marginTop: '8px' }}>{def.remark}</div>

      {/* 頁尾：頁碼置中、機密等級 */}
      <div style={{ marginTop: 'auto', fontSize: '14px', textAlign: 'center' }}>
        <div>{page} / {pageCount}</div>
        <div style={{ fontFamily: KAI, marginTop: '2px' }}>機密等級：{def.confidentiality}</div>
      </div>
    </div>
  );
};

export default IsoPeriodicCheckSheet;
