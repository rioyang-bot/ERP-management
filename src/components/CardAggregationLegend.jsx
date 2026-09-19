import React from 'react';
import { Info } from 'lucide-react';

/**
 * 卡片聚合規則說明
 *
 * 設備、硬體、耗材三個列表共用同一份說明，避免各寫一份之後說法不一致。
 * 目前套用的規則會被標示出來，其餘規則一併列出，讓使用者知道可以怎麼切換。
 */

// 由細到粗排列，與畫面上按鈕的順序一致
const AGGREGATION_RULES = [
  {
    mode: 'SPEC',
    icon: '🏷️',
    label: '依規格',
    formula: '廠牌 ＋ 類型 ＋ 型號 ＋ 規格',
    detail: '規格不同就各自獨立一張卡片，分得最細。',
  },
  {
    mode: 'MODEL',
    icon: '📦',
    label: '依型號',
    formula: '廠牌 ＋ 類型 ＋ 型號',
    detail: '同型號合併成一張卡片，不分規格。',
  },
  {
    mode: 'TYPE',
    icon: '🔧',
    label: '依類型',
    formula: '類型',
    detail: '同一類型全部合併，不分廠牌與型號，例如所有伺服器算成一張卡片。',
  },
  {
    mode: 'BRAND',
    icon: '🏢',
    label: '依廠牌',
    formula: '廠牌',
    detail: '同一廠牌全部合併，不分類型與型號。',
  },
];

/**
 * @param {string} unit  列表名稱，例如「設備」「硬體」「耗材」
 * @param {string} mode  目前套用的聚合規則
 * @param {string[]} [availableModes]
 *        這個列表實際提供哪些規則。耗材只有依類型與依廠牌，
 *        列出用不到的規則只會讓人去找不存在的選項。預設為全部。
 */
const CardAggregationLegend = ({ unit = '資產', mode = 'SPEC', availableModes }) => {
  const rules = Array.isArray(availableModes) && availableModes.length > 0
    ? AGGREGATION_RULES.filter((r) => availableModes.includes(r.mode))
    : AGGREGATION_RULES;
  // 只有一種規則時，就沒有「切換規則」這回事，相關說明不必出現
  const switchable = rules.length > 1;

  return (
    <div style={{
      marginTop: '24px',
      padding: '14px 18px',
      backgroundColor: 'var(--bg-surface-subtle)',
      borderRadius: '12px',
      border: '1px solid var(--border-color)',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '12px',
      fontSize: '13px',
      color: 'var(--text-muted)',
      lineHeight: '1.6',
    }}>
      <Info size={18} color="var(--primary-color)" style={{ flexShrink: 0, marginTop: '2px' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: '800', color: 'var(--text-main)', marginBottom: '6px' }}>
          {unit}卡片聚合規則說明
        </div>

        <div style={{ marginBottom: '8px' }}>
          上方的統計卡片是把明細清單「同一類的併成一張」之後的結果。
          {switchable
            ? '要用哪一種方式合併，可於右上方的下拉選單切換；切換只影響卡片怎麼分，不會更動任何資料。'
            : `${unit}只提供這一種聚合方式。`}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {rules.map((rule) => {
            const isCurrent = rule.mode === mode;
            return (
              <div
                key={rule.mode}
                style={{
                  color: isCurrent ? 'var(--text-main)' : 'var(--text-muted)',
                  fontWeight: isCurrent ? 700 : 400,
                }}
              >
                • {rule.icon} <b>{rule.label}</b>
                <span style={{ color: 'var(--text-subtle)' }}>（{rule.formula}）</span>
                ：{rule.detail}
                {isCurrent && switchable && (
                  <span style={{
                    marginLeft: '6px', fontSize: '11px', fontWeight: 800,
                    color: '#fff', backgroundColor: 'var(--primary-color)',
                    borderRadius: '10px', padding: '1px 8px', whiteSpace: 'nowrap',
                  }}>
                    目前使用中
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div>
            • <b>未填寫的欄位</b>：沒有廠牌的算「未知」、沒有類型的算「未分類」、沒有型號的算「未設定型號」，
            會各自併成一張卡片，方便找出資料不完整的項目補齊。
          </div>
          <div>
            • <b>連動篩選</b>：點擊任一張卡片，下方明細只顯示該卡片涵蓋的{unit}；再點一次取消篩選。
          </div>
          <div>
            • <b>自訂排列</b>：按住卡片拖曳即可換位置{switchable && '，空格也可以留著不放'}。
            排列依登入帳號各自記住並存在伺服器上，換一台電腦登入一樣看到自己排好的位置，
            同一台電腦由不同人登入也不會互相覆蓋
            {switchable && '；每一種聚合規則各記一份排列'}。
          </div>
          <div>
            • <b>汰舊區</b>：卡片上的封存鈕會把整張卡片移到下方汰舊區，之後就不再計入正常使用的統計
            {switchable && '（切換到任何一種聚合規則都一樣）'}。
            移出的只是統計呈現，明細資料仍然存在，隨時可以復原。
          </div>
        </div>
      </div>
    </div>
  );
};

export default CardAggregationLegend;
