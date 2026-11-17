import React from 'react';
import { Network, Printer, Info } from 'lucide-react';
import { buildMacTable, OUI_VENDOR, MAC_FIELDS, macFieldError } from '../utils/macAddress';
import MacWordButton from './MacWordButton';

/**
 * 出機檢查表的 MAC Address Information 區塊（主項目勾了「需要 MAC 表」的設備才有）
 *
 * 只輸入 P1，其餘各埠由 P1 往上加即時算出（見 utils/macAddress.js）；
 * MGT 的 LAN、IPMI 由管理者自行填寫，可以留空。
 * 與主機名稱、勾選一樣，按下方的「儲存變更」才寫回。
 */
const MacAddressSection = ({ sn, draft, changedKeys = [], onChange, onPrint, disabled = false, card, inputStyle }) => {
  const mac = { sn, ...draft };
  const { oui, rows } = buildMacTable(draft);
  const cellStyle = { padding: '5px 12px', border: '2px solid var(--bg-surface)', fontFamily: 'Consolas, "Courier New", monospace', fontSize: '13px' };

  return (
    <section style={{ ...card, padding: '14px 16px' }} data-testid="checklist-mac-section">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
        <Network size={17} color="#6a9a3f" />
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 900, color: 'var(--text-main)' }}>MAC Address Information</h3>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 700 }}>（輸入 P1，其他埠自動計算）</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={onPrint}
            title="列印或另存 PDF（只有 MAC 表這一頁）"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px', border: 'none', backgroundColor: '#6a9a3f', color: '#fff', fontWeight: 800, fontSize: '12px', cursor: 'pointer' }}
          >
            <Printer size={14} /> 列印 MAC 表 / PDF
          </button>
          <MacWordButton mac={mac} label="MAC 表 Word" />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '12px' }}>
        {MAC_FIELDS.map((f) => {
          const err = macFieldError(f.key, draft[f.key]);
          const changed = changedKeys.includes(f.key);
          return (
            <label key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '12px', fontWeight: 800, color: 'var(--text-muted)' }}>
              <span>
                {f.label}
                {changed && <span style={{ marginLeft: '6px', color: '#f59e0b' }}>· 未儲存</span>}
              </span>
              <input
                type="text"
                value={draft[f.key]}
                onChange={(e) => onChange(f.key, e.target.value)}
                disabled={disabled}
                placeholder={f.placeholder}
                aria-label={f.label}
                spellCheck={false}
                style={{ ...inputStyle, flex: 'none', fontFamily: 'Consolas, "Courier New", monospace', borderColor: err ? '#ef4444' : changed ? '#f59e0b' : 'var(--input-border)' }}
              />
              {err && <span style={{ color: '#ef4444', fontWeight: 700 }} role="alert">{err}</span>}
            </label>
          );
        })}
      </div>

      <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main)', marginBottom: '6px' }} data-testid="mac-oui">
        OUI: {OUI_VENDOR} : {oui || '—'}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '480px' }} data-testid="mac-table">
          <thead>
            <tr>
              {['Pair', 'Server Port', 'Exchange Port'].map((h) => (
                <th key={h} style={{ ...cellStyle, fontFamily: 'inherit', backgroundColor: '#6a9a3f', color: '#fff', textAlign: 'left', fontWeight: 800 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.pair} style={{ backgroundColor: i % 2 === 0 ? 'rgba(106, 154, 63, 0.16)' : 'rgba(106, 154, 63, 0.07)' }}>
                <td style={{ ...cellStyle, fontFamily: 'inherit', fontWeight: 700, color: 'var(--text-main)' }}>
                  {r.mgt ? <>MGT<span style={{ color: '#ef4444' }}>(LAN,IPMI)</span></> : r.pair}
                </td>
                <td style={{ ...cellStyle, color: r.mgt ? '#ef4444' : 'var(--text-main)' }}>{r.server || '—'}</td>
                <td style={{ ...cellStyle, color: '#ef4444' }}>{r.exchange || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.7, marginTop: '8px' }}>
        <Info size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
        <span>
          第 n 埠 = P1 + (n − 1)（16 進位）；P3,P4、P7,P8 … 沒有，跳過。整份出機檢查表的列印與 Word 也會在最後附上這一頁。
          修改後按下方的「儲存變更」才會寫回。
        </span>
      </div>
    </section>
  );
};

export default MacAddressSection;
