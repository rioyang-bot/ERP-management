import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X, ClipboardCheck, Plus, Trash2, Printer, RefreshCw, Info, ListChecks, Tag, CheckCircle2,
} from 'lucide-react';
import { logUpdate } from '../utils/auditLogger';
import DeviceChecklistPrintModal from './DeviceChecklistPrintModal';

/**
 * 單一設備的出機檢查表
 *
 * 上半部：從範本套用項目。主要檢查功能整組帶入，細項由使用者逐項挑選 ——
 *         每台設備要檢查的東西不盡相同。
 * 下半部：已套用的項目，逐項勾選表示檢查完成。
 *
 * 已套用的項目是「套用當下的快照」，範本日後被刪除或改名都不會影響這裡。
 */
const KIND_MAIN = 'MAIN';
const KIND_DETAIL = 'DETAIL';

const DeviceChecklistModal = ({ isOpen, onClose, device, onChanged }) => {
  const [groups, setGroups] = useState([]);
  const [templateItems, setTemplateItems] = useState([]);
  const [applied, setApplied] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showPrint, setShowPrint] = useState(false);

  const [selectedGroupId, setSelectedGroupId] = useState(null);
  // 細項由使用者逐項挑選，因此各自記住勾了哪些
  const [pickedDetails, setPickedDetails] = useState(() => new Set());

  const deviceBrand = (device?.brand || '').trim().toUpperCase();

  const loadAll = useCallback(async () => {
    if (!device?.id) return;
    setLoading(true);
    setError('');
    try {
      const [gRes, iRes, aRes] = await Promise.all([
        window.electronAPI.namedQuery('fetchChecklistGroups'),
        window.electronAPI.namedQuery('fetchChecklistItems'),
        window.electronAPI.namedQuery('fetchAssetChecklist', [device.id]),
      ]);
      if (!aRes.success) throw new Error(aRes.error || '讀取設備檢查表失敗');
      setApplied(aRes.rows || []);
      if (gRes.success) setGroups(gRes.rows || []);
      if (iRes.success) setTemplateItems(iRes.rows || []);
    } catch (e) {
      setError(e.message || '讀取失敗');
    } finally {
      setLoading(false);
    }
  }, [device?.id]);

  useEffect(() => {
    if (!isOpen) return;
    setPickedDetails(new Set());
    setSelectedGroupId(null);
    loadAll();
  }, [isOpen, loadAll]);

  // 預設選到這台設備自己廠牌的主項目；沒有的話退回通用的那一個
  useEffect(() => {
    if (!isOpen || groups.length === 0 || selectedGroupId !== null) return;
    const sameBrand = groups.find((g) => (g.brand || '').trim().toUpperCase() === deviceBrand && deviceBrand);
    const generic = groups.find((g) => !g.brand);
    setSelectedGroupId((sameBrand || generic || groups[0]).id);
  }, [isOpen, groups, selectedGroupId, deviceBrand]);

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) || null;
  const groupItems = useMemo(
    () => templateItems.filter((i) => i.group_id === selectedGroupId),
    [templateItems, selectedGroupId]
  );
  const mainItems = groupItems.filter((i) => i.kind === KIND_MAIN);
  const detailItems = groupItems.filter((i) => i.kind === KIND_DETAIL);

  /** 這台設備已經套用過的項目（以主項目＋種類＋名稱比對，與資料庫的唯一鍵一致） */
  const appliedKeySet = useMemo(
    () => new Set(applied.map((a) => `${(a.group_name || '').trim().toUpperCase()}|${a.kind}|${(a.item_name || '').trim().toUpperCase()}`)),
    [applied]
  );
  const isApplied = (groupName, kind, name) =>
    appliedKeySet.has(`${(groupName || '').trim().toUpperCase()}|${kind}|${(name || '').trim().toUpperCase()}`);

  const toggleDetail = (id) => {
    setPickedDetails((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleApply = async () => {
    if (!selectedGroup) return;
    const toApply = [
      ...mainItems.map((i) => ({ ...i, kind: KIND_MAIN })),
      ...detailItems.filter((i) => pickedDetails.has(i.id)),
    ].filter((i) => !isApplied(selectedGroup.name, i.kind, i.name));

    if (toApply.length === 0) {
      alert('沒有新的項目可套用（主要檢查功能與已勾選的細項都已經在這台設備的檢查表上）。');
      return;
    }

    setBusy(true);
    try {
      let order = applied.length;
      for (const item of toApply) {
        const res = await window.electronAPI.namedQuery('insertAssetChecklistItem', [
          device.id, selectedGroup.name, item.kind, item.name, item.id, order,
        ]);
        if (!res.success) throw new Error(res.error || '寫入失敗');
        order += 1;
      }
      logUpdate('DEVICE', device.id, device.sn, `設備 [${device.sn}] 套用出機檢查表 [${selectedGroup.name}] 共 ${toApply.length} 個項目`, {
        sn: device.sn, group: selectedGroup.name, items: toApply.map((i) => i.name),
      });
      setPickedDetails(new Set());
      await loadAll();
      if (onChanged) onChanged();
    } catch (e) {
      alert(`套用失敗：${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleToggleChecked = async (row) => {
    const next = !row.is_checked;
    // 先更新畫面，勾選要跟得上手速；失敗再退回
    setApplied((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_checked: next } : r)));
    try {
      const res = await window.electronAPI.namedQuery('setAssetChecklistItemChecked', [next, row.id]);
      if (!res.success || (res.rows || []).length === 0) throw new Error(res.error || '找不到該項目');
      if (onChanged) onChanged();
    } catch (e) {
      setApplied((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_checked: !next } : r)));
      alert(`儲存勾選狀態失敗：${e.message}`);
    }
  };

  const handleRemoveItem = async (row) => {
    if (!window.confirm(`確定要從這台設備的檢查表移除 [${row.item_name}] 嗎？`)) return;
    try {
      const res = await window.electronAPI.namedQuery('deleteAssetChecklistItem', [row.id]);
      if (!res.success) throw new Error(res.error || '移除失敗');
      await loadAll();
      if (onChanged) onChanged();
    } catch (e) {
      alert(`移除失敗：${e.message}`);
    }
  };

  const handleRemoveGroup = async (groupName) => {
    if (!window.confirm(`確定要移除整組 [${groupName}] 嗎？該組底下的勾選紀錄會一併刪除。`)) return;
    try {
      const res = await window.electronAPI.namedQuery('deleteAssetChecklistGroup', [device.id, groupName]);
      if (!res.success) throw new Error(res.error || '移除失敗');
      await loadAll();
      if (onChanged) onChanged();
    } catch (e) {
      alert(`移除失敗：${e.message}`);
    }
  };

  // 已套用的項目依主項目分組呈現
  const appliedByGroup = useMemo(() => {
    const map = new Map();
    applied.forEach((row) => {
      const key = row.group_name || '未分類';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    });
    return [...map.entries()];
  }, [applied]);

  const doneCount = applied.filter((a) => a.is_checked).length;

  if (!isOpen || !device) return null;

  const card = {
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-color)',
    borderRadius: '12px',
  };

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15, 23, 42, 0.55)', padding: '16px' }}>
        <div style={{ ...card, width: '100%', maxWidth: '1080px', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}>
          {/* 標題 */}
          <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ fontSize: '19px', fontWeight: 900, margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-main)' }}>
                <ClipboardCheck size={22} color="#0891b2" /> 出機檢查表
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '5px 0 0 0', wordBreak: 'break-all' }}>
                {device.brand} {device.model} · S/N <b style={{ color: 'var(--text-main)' }}>{device.sn || '—'}</b>
                {applied.length > 0 && (
                  <span style={{ marginLeft: '10px', fontWeight: 800, color: doneCount === applied.length ? '#10b981' : '#f59e0b' }}>
                    已完成 {doneCount} / {applied.length}
                  </span>
                )}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => setShowPrint(true)}
                disabled={applied.length === 0}
                title={applied.length === 0 ? '尚未套用任何檢查項目' : '列印這台設備的出機檢查表'}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', border: 'none', backgroundColor: applied.length === 0 ? 'var(--border-color)' : '#0891b2', color: '#fff', fontWeight: 800, fontSize: '13px', cursor: applied.length === 0 ? 'not-allowed' : 'pointer' }}
              >
                <Printer size={15} /> 列印
              </button>
              <button
                onClick={onClose}
                aria-label="關閉"
                style={{ width: '36px', height: '36px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-main)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* 內容 */}
          <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {error && (
              <div style={{ ...card, padding: '12px 16px', borderColor: '#ef4444', color: '#ef4444', fontWeight: 700, fontSize: '13px' }}>
                {error}
              </div>
            )}

            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>讀取中...</div>
            ) : (
              <>
                {/* 套用區 */}
                <section style={{ ...card, padding: '16px', backgroundColor: 'var(--bg-surface-subtle)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                    <Plus size={17} color="var(--primary-color)" />
                    <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 900, color: 'var(--text-main)' }}>從範本套用</h3>
                  </div>

                  {groups.length === 0 ? (
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.8 }}>
                      目前還沒有任何出機檢查表範本。請先到「報表中心 → 出機檢查表」建立主項目與檢查項目。
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
                        <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }} htmlFor="checklist-group-select">主項目</label>
                        <select
                          id="checklist-group-select"
                          value={selectedGroupId || ''}
                          onChange={(e) => { setSelectedGroupId(Number(e.target.value)); setPickedDetails(new Set()); }}
                          style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', fontSize: '13px', minWidth: '260px' }}
                        >
                          {groups.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name}（{g.brand || '通用'}）
                            </option>
                          ))}
                        </select>
                        {selectedGroup && deviceBrand && (selectedGroup.brand || '').trim().toUpperCase() === deviceBrand && (
                          <span style={{ fontSize: '11px', fontWeight: 800, padding: '2px 10px', borderRadius: '10px', backgroundColor: 'rgba(8, 145, 178, 0.14)', color: '#0891b2' }}>
                            這台設備的廠牌
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                        {/* 主要檢查功能：整組帶入 */}
                        <div style={{ ...card, padding: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                            <ListChecks size={15} color="var(--primary-color)" />
                            <b style={{ fontSize: '13px', color: 'var(--text-main)' }}>主要檢查功能</b>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>整組帶入（{mainItems.length}）</span>
                          </div>
                          {mainItems.length === 0 ? (
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '8px 0' }}>此主項目沒有主要檢查功能</div>
                          ) : mainItems.map((i) => (
                            <div key={i.id} style={{ fontSize: '13px', color: 'var(--text-main)', padding: '4px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ color: 'var(--text-subtle)' }}>•</span>
                              <span style={{ flex: 1, wordBreak: 'break-word' }}>{i.name}</span>
                              {isApplied(selectedGroup?.name, KIND_MAIN, i.name) && (
                                <span style={{ fontSize: '11px', fontWeight: 800, color: '#10b981', whiteSpace: 'nowrap' }}>已套用</span>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* 細項：逐項挑選 */}
                        <div style={{ ...card, padding: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                            <Tag size={15} color="#7c3aed" />
                            <b style={{ fontSize: '13px', color: 'var(--text-main)' }}>細項</b>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>自行挑選（{detailItems.length}）</span>
                          </div>
                          {detailItems.length === 0 ? (
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '8px 0' }}>此主項目沒有細項</div>
                          ) : detailItems.map((i) => {
                            const already = isApplied(selectedGroup?.name, KIND_DETAIL, i.name);
                            return (
                              <label
                                key={i.id}
                                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', fontSize: '13px', color: already ? 'var(--text-muted)' : 'var(--text-main)', cursor: already ? 'default' : 'pointer' }}
                              >
                                <input
                                  type="checkbox"
                                  checked={already || pickedDetails.has(i.id)}
                                  disabled={already}
                                  onChange={() => toggleDetail(i.id)}
                                  style={{ width: '15px', height: '15px', cursor: already ? 'default' : 'pointer', flexShrink: 0 }}
                                />
                                <span style={{ flex: 1, wordBreak: 'break-word' }}>{i.name}</span>
                                {already && <span style={{ fontSize: '11px', fontWeight: 800, color: '#10b981', whiteSpace: 'nowrap' }}>已套用</span>}
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={handleApply}
                          disabled={busy || !selectedGroup}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '9px 18px', borderRadius: '8px', border: 'none', backgroundColor: busy ? 'var(--border-color)' : 'var(--primary-color)', color: '#fff', fontWeight: 800, fontSize: '13px', cursor: busy ? 'not-allowed' : 'pointer' }}
                        >
                          {busy ? <><RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} /> 套用中...</> : <><Plus size={15} /> 套用到這台設備</>}
                        </button>
                      </div>
                    </>
                  )}
                </section>

                {/* 已套用的項目 */}
                <section>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                    <CheckCircle2 size={17} color="#10b981" />
                    <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 900, color: 'var(--text-main)' }}>這台設備的檢查項目</h3>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 700 }}>
                      （{applied.length} 項，已完成 {doneCount}）
                    </span>
                  </div>

                  {applied.length === 0 ? (
                    <div style={{ ...card, padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                      尚未套用任何檢查項目。請於上方選擇主項目後按「套用到這台設備」。
                    </div>
                  ) : appliedByGroup.map(([groupName, rows]) => (
                    <div key={groupName} style={{ ...card, padding: '14px', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
                        <b style={{ fontSize: '13px', color: 'var(--text-main)' }}>{groupName}</b>
                        <button
                          type="button"
                          onClick={() => handleRemoveGroup(groupName)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.3)', backgroundColor: 'rgba(239, 68, 68, 0.08)', color: '#ef4444', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                        >
                          <Trash2 size={12} /> 移除整組
                        </button>
                      </div>
                      {rows.map((row) => (
                        <div
                          key={row.id}
                          style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 8px', borderRadius: '8px', backgroundColor: row.is_checked ? 'rgba(16, 185, 129, 0.07)' : 'transparent' }}
                        >
                          <input
                            type="checkbox"
                            checked={!!row.is_checked}
                            onChange={() => handleToggleChecked(row)}
                            aria-label={`${row.item_name} 檢查完成`}
                            style={{ width: '17px', height: '17px', cursor: 'pointer', flexShrink: 0 }}
                          />
                          <span style={{
                            fontSize: '11px', fontWeight: 800, padding: '1px 7px', borderRadius: '8px', whiteSpace: 'nowrap',
                            backgroundColor: row.kind === KIND_MAIN ? 'rgba(37, 99, 235, 0.12)' : 'rgba(124, 58, 237, 0.12)',
                            color: row.kind === KIND_MAIN ? 'var(--primary-color)' : '#7c3aed',
                          }}>
                            {row.kind === KIND_MAIN ? '主要' : '細項'}
                          </span>
                          <span style={{ flex: 1, fontSize: '13px', color: 'var(--text-main)', fontWeight: 600, wordBreak: 'break-word', textDecoration: row.is_checked ? 'line-through' : 'none', opacity: row.is_checked ? 0.7 : 1 }}>
                            {row.item_name}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(row)}
                            title="移除此項目"
                            aria-label={`移除 ${row.item_name}`}
                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', padding: 0, borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: '#ef4444', cursor: 'pointer', flexShrink: 0 }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ))}

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.7, marginTop: '4px' }}>
                    <Info size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <span>
                      這裡的項目是套用當下複製過來的內容。日後在「報表中心 → 出機檢查表」刪除或改名範本，
                      都不會影響這台設備已經套用的檢查表與勾選狀態。
                    </span>
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
      </div>

      {showPrint && (
        <DeviceChecklistPrintModal
          isOpen={showPrint}
          onClose={() => setShowPrint(false)}
          device={device}
          items={applied}
        />
      )}
    </>
  );
};

export default DeviceChecklistModal;
