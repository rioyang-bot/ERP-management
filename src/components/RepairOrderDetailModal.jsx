import React from 'react';
import { getRepairScopeLabel } from '../utils/repairScope';
import { 
  X, FileText, Building2, Calendar, CheckCircle2, Clock, 
  Truck, Wrench, PackageCheck, Printer, ShieldAlert, Cpu
} from 'lucide-react';

const STATUS_CONFIG = {
  ON_SITE_HANDLING: { label: '現場處理', color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' },
  SENT_OEM: { label: '送修原廠', color: '#d97706', bg: 'rgba(217, 119, 6, 0.12)' },
  OEM_RETURNED: { label: '原廠返還', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)' },
  COMPLETED: { label: '完工結案', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)' }
};

/**
 * 維修單完整詳細資訊與歷程檢視彈窗
 */
const RepairOrderDetailModal = ({ isOpen, onClose, repairOrder, onOpenAction, onOpenPrint }) => {
  if (!isOpen || !repairOrder) return null;

  const items = repairOrder.items || [];
  const statusInfo = STATUS_CONFIG[repairOrder.status] || { 
    label: repairOrder.status, 
    color: 'var(--text-main)', 
    bg: 'var(--bg-surface-subtle)' 
  };

  // 時間軸階段定義
  // 不送原廠的單，原廠那兩個階段不適用；仍然列出來但標示為不適用，
  // 直接抽掉會讓時間軸的階段數在兩種單之間不一致，反而難比對。
  const noOem = !!repairOrder.no_oem_required;
  // 直接送原廠的單沒有現場處理那一段。沒有現場日期、卻已經送出原廠，
  // 就是從送修原廠起算的。
  const skippedOnSite = !repairOrder.on_site_date && !!repairOrder.send_oem_date;
  // 內部維修沒有客戶可出貨，原廠返還就是終點，東西回自己庫房
  const isInternal = !!repairOrder.is_internal;

  // 備註只有一欄，每走一步都會被那一步的輸入整個覆寫，所以它屬於「最後走到的那一步」。
  // 依日期回推就知道是誰填的，不必為此多存一個欄位。
  const remarksStage = repairOrder.completion_date ? 'COMPLETED'
    : repairOrder.oem_return_date ? 'OEM_RETURN'
      : repairOrder.send_oem_date ? 'SEND_OEM'
        : 'ON_SITE';

  // 四張階段卡片共用同一套尺寸：標題與註記 11px、內文 12px、日期 15px。
  // 先前每張卡片各自寫死樣式，字級從 11 到 13 混用，卡片之間對不齊。
  const CARD = { backgroundColor: 'var(--bg-surface-subtle)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-color)' };
  const CARD_LABEL = { fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.02em' };
  const CARD_META = { fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px', lineHeight: '1.5' };
  // 日期用等寬數字，四張卡片的數字才會切齊
  const cardDate = (filled, color) => ({
    fontSize: '15px', fontWeight: 800, marginTop: '6px', fontVariantNumeric: 'tabular-nums',
    color: filled ? color : 'var(--text-muted)',
  });
  const BLOCK = { marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed var(--border-color)' };
  const BLOCK_BODY = { fontSize: '12px', color: 'var(--text-main)', lineHeight: '1.6', whiteSpace: 'pre-wrap', marginTop: '4px' };

  /** 階段卡片底下的附註：故障描述、維修結果、備註都用同一種樣子 */
  const stageBlock = (label, body) => (
    <div style={BLOCK}>
      <div style={CARD_LABEL}>{label}</div>
      <div style={BLOCK_BODY}>{body}</div>
    </div>
  );

  /** 備註掛在填它的那張階段卡片底下 */
  const remarksBlock = (stage) => (repairOrder.remarks && remarksStage === stage
    ? stageBlock(stage === 'COMPLETED' ? '出貨備註 (Remarks)' : '備註 (Remarks)', repairOrder.remarks)
    : null);

  const resultsBlock = (hint) => stageBlock(
    '維修與檢測結果 (Results)',
    repairOrder.results || hint,
  );

  const steps = [
    {
      key: 'ON_SITE',
      title: skippedOnSite ? '現場處理 / 取回（略過）' : '現場處理 / 取回',
      date: repairOrder.on_site_date,
      statusDesc: skippedOnSite
        ? '不適用 (設備未出給客戶，直接送原廠)'
        : (repairOrder.on_site_status || '現場取回'),
      assetStatus: 'REPAIRING (維修中)',
      icon: <Calendar size={18} />,
      active: !skippedOnSite,
      color: '#10b981'
    },
    {
      key: 'SEND_OEM',
      title: '送修原廠',
      date: repairOrder.send_oem_date,
      statusDesc: noOem ? '不適用 (不需送回原廠)' : (repairOrder.send_oem_date ? '已送往原廠檢測' : '尚未送修'),
      assetStatus: 'REPAIRING (維修中)',
      icon: <Truck size={18} />,
      active: !noOem && (!!repairOrder.send_oem_date || repairOrder.status === 'SENT_OEM' || repairOrder.status === 'OEM_RETURNED' || repairOrder.status === 'COMPLETED'),
      color: '#d97706'
    },
    {
      key: 'OEM_RETURN',
      title: '原廠返還 / 修復',
      date: repairOrder.oem_return_date,
      statusDesc: noOem
        ? (repairOrder.results ? `IT 自行維修: ${repairOrder.results}` : '不適用 (由 IT 自行處理)')
        : (repairOrder.results
          ? `結果: ${repairOrder.results}`
          : (repairOrder.oem_return_date
            ? (isInternal ? '已返還入庫，維修完成' : '已返還，待出貨')
            : '原廠處理中')),
      assetStatus: isInternal ? 'ACTIVE (在庫)' : 'REPAIRING (維修中)',
      icon: <Wrench size={18} />,
      active: !noOem && (!!repairOrder.oem_return_date || repairOrder.status === 'OEM_RETURNED' || repairOrder.status === 'COMPLETED'),
      color: '#8b5cf6'
    },
    {
      key: 'COMPLETED',
      title: isInternal ? '客戶完工出貨（不適用）' : (noOem ? '自行維修完工出貨' : '客戶完工出貨'),
      date: repairOrder.completion_date,
      statusDesc: isInternal
        ? '不適用 (公司內部維修，返還入庫即結案)'
        : (repairOrder.completion_date ? '已交付客戶結案' : '待完工出貨'),
      assetStatus: isInternal ? 'ACTIVE (在庫)' : 'SHIPPED (出庫)',
      icon: <PackageCheck size={18} />,
      active: !isInternal && (repairOrder.status === 'COMPLETED' || !!repairOrder.completion_date),
      color: '#3b82f6'
    }
  ];

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1100,
      padding: '20px',
      backdropFilter: 'blur(4px)'
    }}>
      <div style={{
        backgroundColor: 'var(--bg-surface)',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '840px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.3)',
        border: '1px solid var(--border-color)',
        overflow: 'hidden'
      }}>
        {/* 頂部標題列 */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'var(--bg-surface-subtle)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              color: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <FileText size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-main)' }}>
                  {repairOrder.repair_no}
                </h3>
                <span style={{
                  padding: '4px 10px',
                  borderRadius: '20px',
                  backgroundColor: statusInfo.bg,
                  color: statusInfo.color,
                  fontWeight: 800,
                  fontSize: '12px'
                }}>
                  {statusInfo.label}
                </span>
              </div>
              <p style={{ margin: '3px 0 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                維修單詳細資訊與四階段歷程追蹤
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* 彈窗內容區 (可滾動) */}
        <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* 1. 基本資料卡 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '14px',
            backgroundColor: 'var(--bg-surface-subtle)',
            padding: '16px',
            borderRadius: '12px',
            border: '1px solid var(--border-color)'
          }}>
            <div>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>客戶名稱 (Customer)</span>
              <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-main)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Building2 size={16} color="var(--primary-color)" />
                {getRepairScopeLabel(repairOrder)}
              </div>
              {repairOrder.contact_person && (
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  聯絡人：<b style={{ color: 'var(--text-main)' }}>{repairOrder.contact_person}</b>
                  {repairOrder.contact_phone ? `（${repairOrder.contact_phone}）` : ''}
                </div>
              )}
            </div>

            <div>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>建立日期</span>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)', marginTop: '4px' }}>
                {repairOrder.created_at ? repairOrder.created_at.slice(0, 10) : repairOrder.on_site_date || '--'}
              </div>
            </div>

            <div>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)' }}>建單人員</span>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)', marginTop: '4px' }}>
                {repairOrder.creator_name || '系統管理員'}
              </div>
            </div>
          </div>

          {/* 2. 四階段流轉進度時間軸 */}
          <div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-main)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Clock size={16} color="var(--primary-color)" /> 四階段維修流轉進度
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: '12px'
            }}>
              {steps.map((step, idx) => (
                <div
                  key={step.key}
                  style={{
                    padding: '14px',
                    borderRadius: '12px',
                    backgroundColor: step.active ? 'var(--bg-surface)' : 'var(--bg-surface-subtle)',
                    border: step.active ? `2px solid ${step.color}` : '1px dashed var(--border-color)',
                    boxShadow: step.active ? '0 4px 12px rgba(0,0,0,0.05)' : 'none',
                    opacity: step.active ? 1 : 0.6,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '6px',
                        backgroundColor: step.active ? `${step.color}22` : 'transparent',
                        color: step.color,
                        fontSize: '11px',
                        fontWeight: 800
                      }}>
                        階段 {idx + 1}
                      </span>
                      <div style={{ color: step.color }}>{step.icon}</div>
                    </div>

                    <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main)' }}>
                      {step.title}
                    </div>

                    <div style={{ fontSize: '12px', fontWeight: 700, color: step.color, marginTop: '4px' }}>
                      {step.date || '未執行'}
                    </div>
                  </div>

                  <div style={{
                    marginTop: '10px',
                    paddingTop: '8px',
                    borderTop: '1px solid var(--border-color)',
                    fontSize: '11px',
                    color: 'var(--text-muted)'
                  }}>
                    連動狀態: <strong style={{ color: 'var(--text-main)' }}>{step.assetStatus}</strong>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 3. 送修資訊與結果明細 (重點整合區塊) */}
          <div style={{
            backgroundColor: 'var(--bg-surface)',
            borderRadius: '12px',
            border: '1px solid var(--border-color)',
            padding: '18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px'
          }}>
            <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Wrench size={16} color="#ef4444" /> 送修、返還與完工詳細資訊
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '12px'
            }}>
              {/* 現場處理。故障描述跟其他兩段附註一樣掛在日期底下，
                  四張卡片才會是同一個形狀：標題 / 日期 / 狀態 / 附註 */}
              <div style={CARD}>
                <div style={CARD_LABEL}>現場處理日 (On Site)</div>
                <div style={cardDate(!!repairOrder.on_site_date, '#10b981')}>
                  {repairOrder.on_site_date || (skippedOnSite ? '不適用' : '尚未處理')}
                </div>
                <div style={CARD_META}>
                  狀態：{skippedOnSite ? '略過 (未出給客戶，直接送原廠)' : '現場處理 / 取回 (REPAIRING)'}
                </div>
                {!skippedOnSite && stageBlock('現場狀況 / 故障描述', repairOrder.on_site_status || '無故障描述')}
                {remarksBlock('ON_SITE')}
              </div>

              {/* 送修原廠 */}
              <div style={CARD}>
                <div style={CARD_LABEL}>送修原廠日 (Send OEM)</div>
                <div style={cardDate(!!repairOrder.send_oem_date, '#d97706')}>
                  {repairOrder.send_oem_date || (noOem ? '不適用' : '尚未送修原廠')}
                </div>
                <div style={CARD_META}>
                  狀態：{noOem ? '不適用 (不需送回原廠)' : (repairOrder.send_oem_date ? '原廠處理中 (REPAIRING)' : '現場在庫')}
                </div>
                {remarksBlock('SEND_OEM')}
              </div>

              {/* 原廠返還。維修結果就是在這一步填的，放在旁邊才看得出來是何時記錄的 */}
              <div style={CARD}>
                <div style={CARD_LABEL}>原廠返還日 (OEM Return)</div>
                <div style={cardDate(!!repairOrder.oem_return_date, '#8b5cf6')}>
                  {repairOrder.oem_return_date || (noOem ? '不適用' : '原廠尚未寄回')}
                </div>
                <div style={CARD_META}>
                  狀態：{noOem
                    ? '不適用 (由 IT 自行處理)'
                    : (repairOrder.oem_return_date
                      ? (isInternal ? '已返還入庫，維修完成 (ACTIVE)' : '已返還，仍為維修中 (REPAIRING)')
                      : '原廠處理中')}
                </div>
                {!noOem && resultsBlock('尚未填寫檢測與維修結果 (待原廠返還時記錄)')}
                {remarksBlock('OEM_RETURN')}
              </div>

              {/* 完工出貨 */}
              <div style={CARD}>
                <div style={CARD_LABEL}>完工出貨日 (Completion)</div>
                <div style={cardDate(!!repairOrder.completion_date, '#3b82f6')}>
                  {repairOrder.completion_date || (isInternal ? '不適用' : '尚未完工交件')}
                </div>
                <div style={CARD_META}>
                  狀態：{isInternal
                    ? '不適用 (公司內部維修，返還入庫即結案)'
                    : (repairOrder.completion_date ? '已交付客戶 (SHIPPED)' : '待完工出貨')}
                </div>
                {/* 不送原廠的單沒經過原廠返還，維修結果是在這一步一併填的 */}
                {noOem && resultsBlock('尚未填寫檢測與維修結果 (待自行維修完工時記錄)')}
                {remarksBlock('COMPLETED')}
              </div>
            </div>

          </div>

          {/* 4. 關聯報修設備明細清單 */}
          <div style={{
            backgroundColor: 'var(--bg-surface)',
            borderRadius: '12px',
            border: '1px solid var(--border-color)',
            padding: '18px'
          }}>
            <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-main)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Cpu size={16} color="var(--primary-color)" /> 報修設備與硬體清單 ({items.length} 件)
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '12px', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px' }}>廠牌 (Brand)</th>
                  <th style={{ padding: '8px 12px' }}>型號 (Model)</th>
                  <th style={{ padding: '8px 12px' }}>類型 (Type)</th>
                  <th style={{ padding: '8px 12px' }}>序號 (SN)</th>
                  <th style={{ padding: '8px 12px' }}>規格 (Specification)</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      無設備明細資料
                    </td>
                  </tr>
                ) : (
                  items.map((it, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 800, color: 'var(--primary-color)' }}>{it.brand}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--text-main)' }}>{it.model}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>{it.type || '設備'}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          backgroundColor: 'var(--bg-surface-subtle)',
                          border: '1px solid var(--border-color)',
                          fontWeight: 800,
                          fontSize: '12px',
                          color: 'var(--text-main)'
                        }}>
                          {it.sn}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: '12px' }}>
                        {it.specification || '--'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

        </div>

        {/* 底部按鈕區 */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'var(--bg-surface-subtle)'
        }}>
          <button
            onClick={() => {
              onClose();
              if (onOpenPrint) onOpenPrint(repairOrder);
            }}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-surface)',
              color: 'var(--text-main)',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Printer size={15} /> 套印維修單據 (Print RMA)
          </button>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {/* 流程推進快捷按鈕 */}
            {repairOrder.status === 'ON_SITE_HANDLING' && noOem && onOpenAction && (
              <button
                onClick={() => {
                  onClose();
                  onOpenAction(repairOrder, 'IN_HOUSE_COMPLETE');
                }}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#0d9488',
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Wrench size={15} /> 自行維修完工
              </button>
            )}

            {repairOrder.status === 'ON_SITE_HANDLING' && !noOem && onOpenAction && (
              <button
                onClick={() => {
                  onClose();
                  onOpenAction(repairOrder, 'SEND_OEM');
                }}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#d97706',
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Truck size={15} /> 送修原廠
              </button>
            )}

            {repairOrder.status === 'SENT_OEM' && onOpenAction && (
              <button
                onClick={() => {
                  onClose();
                  onOpenAction(repairOrder, 'OEM_RETURN');
                }}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#8b5cf6',
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Wrench size={15} /> 原廠返還
              </button>
            )}

            {repairOrder.status === 'OEM_RETURNED' && onOpenAction && (
              <button
                onClick={() => {
                  onClose();
                  onOpenAction(repairOrder, 'COMPLETE');
                }}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#3b82f6',
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <PackageCheck size={15} /> 客戶出貨完工
              </button>
            )}

            <button
              onClick={onClose}
              style={{
                padding: '8px 18px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-main)',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              關閉
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RepairOrderDetailModal;
