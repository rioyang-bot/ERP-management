import React from 'react';
import { Send, Package, Cpu, AlertTriangle, RotateCcw, Info } from 'lucide-react';

/**
 * 借用流程說明
 *
 * 借用單對「設備／硬體」與「耗材」的處理方式完全不同：
 * 前者是改序號的狀態，後者是加減數量。這個差異在畫面上看不出來，
 * 但直接影響庫存數字怎麼跑，因此獨立寫成一頁。
 *
 * 內容需與 src/pages/LentList.jsx、src/components/LendOrderRegistrationModal.jsx
 * 及 database/queries.js 的借用相關查詢保持一致。
 */

const card = {
  backgroundColor: 'var(--bg-surface)',
  border: '1px solid var(--border-color)',
  borderRadius: '14px',
  padding: '20px 24px',
  marginBottom: '18px',
};

const heading = {
  display: 'flex', alignItems: 'center', gap: '8px',
  fontSize: '15px', fontWeight: 900, color: 'var(--text-main)',
  margin: '0 0 14px',
};

const th = {
  textAlign: 'left', padding: '8px 10px', fontSize: '12px', fontWeight: 800,
  color: 'var(--text-muted)', borderBottom: '2px solid var(--border-color)', whiteSpace: 'nowrap',
};

const td = {
  padding: '10px', fontSize: '13px', color: 'var(--text-main)',
  borderBottom: '1px solid var(--table-border)', verticalAlign: 'top', lineHeight: 1.7,
};

const chip = (bg, color) => ({
  display: 'inline-block', padding: '2px 9px', borderRadius: '10px',
  fontSize: '11px', fontWeight: 800, backgroundColor: bg, color, whiteSpace: 'nowrap',
});

// 四個階段。每一階段分別說明設備/硬體與耗材各自發生什麼事
const STAGES = [
  {
    no: '1',
    name: '建立借用單',
    where: '借用單列表 → 新增借用單',
    status: <span style={chip('rgba(37, 99, 235, 0.12)', 'var(--primary-color)')}>已建立 (待借出)</span>,
    asset: '選擇在庫的序號加入清單，數量固定為 1。',
    consumable: '選擇品項後自行填數量，可借部分數量。',
    effect: '不動任何庫存。這張單只是登記要借什麼給誰、預計何時還。',
  },
  {
    no: '2',
    name: '確認借出',
    where: '借用單列表 → 該筆單據的「確認借出」按鈕',
    status: <span style={chip('rgba(217, 119, 6, 0.14)', '#d97706')}>借出中 (待歸還)</span>,
    asset: '序號狀態由「在庫 (ACTIVE)」改為「借出 (LENT)」，位置改為借出地點。',
    consumable: '庫存減去借出數量，同時把該數量記為「借出中」。',
    effect: '這一步才真正動到庫存。出錯會整張擋下，不會做一半。',
  },
  {
    no: '3',
    name: '借出期間',
    where: '借用單列表 →「借出中 (待歸還)」頁籤',
    status: <span style={chip('rgba(217, 119, 6, 0.14)', '#d97706')}>借出中 (待歸還)</span>,
    asset: '設備/硬體列表上該序號顯示為「借出」狀態，狀態底下直接標出是哪一張借用單。',
    consumable: '耗材列表的「借出中」欄位顯示目前在外的數量，底下列出相關的借用單號。',
    effect: '可勾選「僅顯示逾期未還」，篩出已超過預計歸還日的單據。也可上傳客戶簽收單留存。',
  },
  {
    no: '4',
    name: '登記歸還',
    where: '借用單列表 → 該筆單據的「歸還入庫」按鈕，填實際歸還日',
    status: <span style={chip('rgba(16, 185, 129, 0.14)', '#10b981')}>已結案 (歷史紀錄)</span>,
    asset: '序號狀態改回「在庫 (ACTIVE)」，位置清空。',
    consumable: '數量加回庫存，「借出中」同步減掉。',
    effect: '全部回到借出前的狀態。單據保留在已結案頁籤供日後查閱。',
  },
];

const LendFlowGuide = () => (
  <div style={{ maxWidth: '1040px' }}>

    {/* --- 流程四階段 --- */}
    <div style={card}>
      <h3 style={heading}><Send size={18} color="var(--primary-color)" /> 借用流程四個階段</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '860px' }}>
          <thead>
            <tr>
              <th style={{ ...th, width: '150px' }}>階段</th>
              <th style={{ ...th, width: '190px' }}>在哪裡操作</th>
              <th style={{ ...th, width: '130px' }}>單據狀態</th>
              <th style={th}>系統做了什麼</th>
            </tr>
          </thead>
          <tbody>
            {STAGES.map((s) => (
              <tr key={s.no}>
                <td style={{ ...td, fontWeight: 800 }}>
                  <span style={{ color: 'var(--primary-color)' }}>{s.no}.</span> {s.name}
                </td>
                <td style={{ ...td, color: 'var(--text-muted)', fontSize: '12.5px' }}>{s.where}</td>
                <td style={td}>{s.status}</td>
                <td style={td}>
                  <div style={{ marginBottom: '6px' }}>{s.effect}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', gap: '6px', marginBottom: '3px' }}>
                    <Cpu size={13} style={{ flexShrink: 0, marginTop: '3px' }} />
                    <span><b>設備／硬體：</b>{s.asset}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', gap: '6px' }}>
                    <Package size={13} style={{ flexShrink: 0, marginTop: '3px' }} />
                    <span><b>耗材：</b>{s.consumable}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>

    {/* --- 兩類品項的根本差異 --- */}
    <div style={card}>
      <h3 style={heading}><Info size={18} color="var(--primary-color)" /> 為什麼設備和耗材的處理方式不一樣</h3>
      <p style={{ margin: '0 0 14px', fontSize: '13.5px', color: 'var(--text-main)', lineHeight: 1.9 }}>
        設備和硬體是<b>一台一台、有序號</b>的，借出去的是「哪一台」，所以系統改的是那個序號的狀態。
        耗材<b>沒有序號、只有數量</b>，借出去的是「幾條」，所以系統加減的是數量。
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '620px' }}>
          <thead>
            <tr>
              <th style={th}>比較項目</th>
              <th style={th}>設備 / 硬體</th>
              <th style={th}>耗材</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ ...td, fontWeight: 700 }}>借用單上的數量</td>
              <td style={td}>固定 1（一個序號一列）</td>
              <td style={td}>可自行填寫，能借部分數量</td>
            </tr>
            <tr>
              <td style={{ ...td, fontWeight: 700 }}>借出時系統改什麼</td>
              <td style={td}>序號狀態 → 借出 (LENT)、位置 → 借出地點</td>
              <td style={td}>庫存 −N、借出中 +N</td>
            </tr>
            <tr>
              <td style={{ ...td, fontWeight: 700 }}>在列表上怎麼看出借出中</td>
              <td style={td}>「狀態」欄顯示「借出」，底下標出借用單號</td>
              <td style={td}>「借出中」欄位顯示數量，底下列出借用單號（可能多張）</td>
            </tr>
            <tr>
              <td style={{ ...td, fontWeight: 700 }}>歸還時系統改什麼</td>
              <td style={td}>狀態 → 在庫 (ACTIVE)、位置清空</td>
              <td style={td}>庫存 +N、借出中 −N</td>
            </tr>
            <tr>
              <td style={{ ...td, fontWeight: 700 }}>借出前的檢查</td>
              <td style={td}>必須是「在庫 (ACTIVE)」，已出貨／維修／報廢一律擋下</td>
              <td style={td}>庫存必須足夠，不足會顯示目前庫存與需要數量</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p style={{ margin: '14px 0 0', fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.8 }}>
        耗材列表的「借出中」<b>不計入 Total</b>，也不影響安全庫存的低量警示——
        Total 代表現在手上可以動用的數量，借出去的拿不回來用。
        列表上每一筆借出中的品項都會直接標出借用單號，單號在歸還後自動消失；
        要看整張單的內容，到借用單列表的「借出中」頁籤查詢該單號。
      </p>
    </div>

    {/* --- 注意事項 --- */}
    <div style={{ ...card, borderColor: 'rgba(245, 158, 11, 0.4)' }}>
      <h3 style={{ ...heading, color: '#f59e0b' }}>
        <AlertTriangle size={18} color="#f59e0b" /> 操作時要注意的地方
      </h3>
      <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13.5px', lineHeight: 2, color: 'var(--text-main)' }}>
        <li>
          <b>建立借用單時不會擋超量。</b>畫面上會顯示目前庫存（例如「存: 5」），
          但填 500 也存得進去。要到「確認借出」那一步才會被擋下並顯示不足的數量。
        </li>
        <li>
          <b>只有「已建立 (待借出)」的單據可以修改或刪除。</b>
          一旦確認借出，庫存已經異動，就只能走歸還流程結案；
          真的要改內容，先按「撤銷借出」退回待借出，庫存會一併還原，改完再重新確認借出。
        </li>
        <li>
          <b>借用單也會出現在出貨單列表 (D/N List)。</b>
          兩邊都能按確認，庫存的處理一致；但從出貨單列表確認時，設備／硬體會額外寫入出貨日期
          並同步更新其搭載的硬體。
        </li>
        <li>
          <b>借用單與出貨單共用同一組單號</b>（DN-日期-序號），單號本身看不出是借用還是銷貨，
          要看單據所在的列表或類型。
        </li>
        <li>
          <b>預計歸還日不是必填</b>，但沒填就不會出現在「僅顯示逾期未還」的篩選結果裡。
        </li>
      </ul>
    </div>

    {/* --- 歸還沒做會怎樣 --- */}
    <div style={card}>
      <h3 style={heading}><RotateCcw size={18} color="#16a34a" /> 忘記登記歸還會怎樣</h3>
      <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13.5px', lineHeight: 2, color: 'var(--text-main)' }}>
        <li><b>設備／硬體</b>會一直停留在「借出」狀態，無法被排入新的出貨單（出貨只收在庫的資產）。</li>
        <li><b>耗材</b>的庫存會一直少那些數量，且持續掛在「借出中」，可能誤觸安全庫存警示而重複採購。</li>
        <li>兩者都會出現在「僅顯示逾期未還」的篩選結果中，可以定期用它清查。</li>
      </ul>
    </div>

  </div>
);

export default LendFlowGuide;
