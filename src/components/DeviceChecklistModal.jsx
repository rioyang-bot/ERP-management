import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X, ClipboardCheck, Plus, Trash2, Printer, RefreshCw, Info, ListChecks, Tag, CheckCircle2,
} from 'lucide-react';
import { logUpdate } from '../utils/auditLogger';
import DeviceChecklistPrintModal from './DeviceChecklistPrintModal';

/**
 * 單一設備的出機檢查表
 *
 * 主要檢查功能是「依廠牌自動套用」的：主項目綁定哪個廠牌，該廠牌的每一台設備
 * 就都有那一組，開啟這個視窗時會先同步一次，不需要逐台按套用。
 *
 * 細項才是逐台決定的 —— 每台設備要檢查的東西不盡相同，可以從範本挑選，
 * 也可以直接為這台設備新增自己的細項。
 *
 * 細項記錄的是「這台設備實際是什麼」而不是「做完了沒有」，因此不勾選，
 * 改為在旁邊填寫內容（例如細項「OS」填「RH9.6」）。
 *
 * 已套用的項目是「套用當下的快照」，範本日後被刪除或改名都不會讓它消失。
 */
const KIND_MAIN = 'MAIN';
const KIND_DETAIL = 'DETAIL';
const CUSTOM_GROUP = '自訂細項';

const DeviceChecklistModal = ({ isOpen, onClose, device, onChanged }) => {
  const [groups, setGroups] = useState([]);
  const [templateItems, setTemplateItems] = useState([]);
  const [applied, setApplied] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showPrint, setShowPrint] = useState(false);

  const [selectedGroupId, setSelectedGroupId] = useState(null);
  // 細項逐台挑選，因此各自記住勾了哪些
  const [pickedDetails, setPickedDetails] = useState(() => new Set());
  const [customDetail, setCustomDetail] = useState('');
  // 細項內容改成邊打邊記在本地，離開欄位才寫回資料庫
  const [contentDraft, setContentDraft] = useState({});

  const deviceBrand = (device?.brand || '').trim().toUpperCase();

  const loadAll = useCallback(async () => {
    if (!device?.id) return;
    setLoading(true);
    setError('');
    try {
      // 先補上這台設備依廠牌該有的主要檢查功能，再讀回來。
      // 設備是後來才建檔、或廠牌被改過的，都在這一步補齊。
      try {
        await window.electronAPI.namedQuery('syncBrandChecklistToAssets', [device.id]);
      } catch (syncErr) {
        console.error('依廠牌同步檢查項目失敗:', syncErr);
      }

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
    setCustomDetail('');
    setContentDraft({});
    setSelectedGroupId(null);
    loadAll();
  }, [isOpen, loadAll]);

  // 挑細項時預設看這台設備自己廠牌的那一組；沒有的話退回通用的
  useEffect(() => {
    if (!isOpen || groups.length === 0 || selectedGroupId !== null) return;
    const sameBrand = groups.find((g) => deviceBrand && (g.brand || '').trim().toUpperCase() === deviceBrand);
    const generic = groups.find((g) => !g.brand);
    setSelectedGroupId((sameBrand || generic || groups[0]).id);
  }, [isOpen, groups, selectedGroupId, deviceBrand]);

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) || null;
  const detailItems = useMemo(
    () => templateItems.filter((i) => i.group_id === selectedGroupId && i.kind === KIND_DETAIL),
    [templateItems, selectedGroupId]
  );

  /** 這台設備已經有的項目（以主項目＋種類＋名稱比對，與資料庫的唯一鍵一致） */
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

  /** 寫入一筆細項；回傳是否真的寫進去 */
  const insertDetail = async (groupName, name, sourceId, order) => {
    const res = await window.electronAPI.namedQuery('insertAssetChecklistItem', [
      device.id, groupName, KIND_DETAIL, name, sourceId, order,
    ]);
    if (!res.success) throw new Error(res.error || '寫入失敗');
    return (res.rows || []).length > 0;
  };

  const handleAddDetails = async () => {
    const picks = detailItems.filter((i) => pickedDetails.has(i.id) && !isApplied(selectedGroup?.name, KIND_DETAIL, i.name));
    if (picks.length === 0) {
      alert('請先勾選要加入的細項。');
      return;
    }
    setBusy(true);
    try {
      let order = applied.length;
      for (const item of picks) {
        await insertDetail(selectedGroup.name, item.name, item.id, order);
        order += 1;
      }
      logUpdate('DEVICE', device.id, device.sn, `設備 [${device.sn}] 加入出機檢查細項 ${picks.length} 項`, {
        sn: device.sn, group: selectedGroup?.name, items: picks.map((i) => i.name),
      });
      setPickedDetails(new Set());
      await loadAll();
      if (onChanged) onChanged();
    } catch (e) {
      alert(`加入細項失敗：${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleAddCustomDetail = async () => {
    const name = customDetail.trim();
    if (!name) return;
    const groupName = selectedGroup?.name || CUSTOM_GROUP;
    if (isApplied(groupName, KIND_DETAIL, name)) {
      alert('這台設備已經有同名的細項了。');
      return;
    }
    setBusy(true);
    try {
      await insertDetail(groupName, name, null, applied.length);
      logUpdate('DEVICE', device.id, device.sn, `設備 [${device.sn}] 新增自訂出機檢查細項 [${name}]`, {
        sn: device.sn, group: groupName, item: name,
      });
      setCustomDetail('');
      await loadAll();
      if (onChanged) onChanged();
    } catch (e) {
      alert(`新增細項失敗：${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  /**
   * 細項的內容。輸入中先記在本地，離開欄位（或按 Enter）才寫回資料庫 ——
   * 每打一個字就送一次請求既沒必要，網路慢時還會把游標弄丟。
   */
  const handleContentChange = (id, value) => {
    setContentDraft((prev) => ({ ...prev, [id]: value }));
  };

  const handleContentCommit = async (row) => {
    const draft = contentDraft[row.id];
    if (draft === undefined) return;
    const next = draft.trim();
    if (next === (row.content || '')) {
      setContentDraft((prev) => { const n = { ...prev }; delete n[row.id]; return n; });
      return;
    }
    setApplied((prev) => prev.map((r) => (r.id === row.id ? { ...r, content: next || null } : r)));
    setContentDraft((prev) => { const n = { ...prev }; delete n[row.id]; return n; });
    try {
      const res = await window.electronAPI.namedQuery('setAssetChecklistItemContent', [next, row.id]);
      if (!res.success || (res.rows || []).length === 0) throw new Error(res.error || '找不到該項目');
      if (onChanged) onChanged();
    } catch (e) {
      setApplied((prev) => prev.map((r) => (r.id === row.id ? { ...r, content: row.content } : r)));
      alert(`儲存內容失敗：${e.message}`);
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

  /**
   * 能不能從這台設備移除某一項。
   *
   * 仍連著範本的主要檢查功能不可移除：那是依廠牌套用的，移掉下次開啟又會補回來。
   * 細項（逐台決定）與範本已刪除的孤兒項目（source_item_id 為空）才可以移除。
   */
  const canRemove = (row) => row.kind === KIND_DETAIL || !row.source_item_id;

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

  // 細項是填內容不是勾選，因此不列入完成度
  const mainRows = applied.filter((a) => a.kind === KIND_MAIN);
  const autoCount = mainRows.length;
  const doneCount = mainRows.filter((a) => a.is_checked).length;

  if (!isOpen || !device) return null;

  const card = {
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-color)',
    borderRadius: '12px',
  };
  const inputStyle = {
    flex: 1, padding: '8px 10px', borderRadius: '8px',
    border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)',
    color: 'var(--input-text)', fontSize: '13px', outline: 'none', minWidth: 0,
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
                {autoCount > 0 && (
                  <span style={{ marginLeft: '10px', fontWeight: 800, color: doneCount === autoCount ? '#10b981' : '#f59e0b' }}>
                    已完成 {doneCount} / {autoCount}
                  </span>
                )}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => setShowPrint(true)}
                disabled={applied.length === 0}
                title={applied.length === 0 ? '尚未有任何檢查項目' : '列印這台設備的出機檢查表'}
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
          <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {error && (
              <div style={{ ...card, padding: '12px 16px', borderColor: '#ef4444', color: '#ef4444', fontWeight: 700, fontSize: '13px' }}>
                {error}
              </div>
            )}

            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>讀取中...</div>
            ) : (
              <>
                {/* 主要檢查功能：依廠牌自動套用，這裡只說明狀態 */}
                <section style={{ ...card, padding: '14px 16px', backgroundColor: 'rgba(8, 145, 178, 0.06)', borderColor: 'rgba(8, 145, 178, 0.3)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <ListChecks size={17} color="#0891b2" />
                    <b style={{ fontSize: '14px', color: 'var(--text-main)' }}>主要檢查功能已依廠牌自動套用</b>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 700 }}>
                      （{device.brand || '未填廠牌'} · 共 {autoCount} 項）
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.7 }}>
                    在「報表中心 → 出機檢查表」新增主要檢查功能後，該廠牌的所有設備都會自動帶入，不需要逐台操作。
                    {groups.length === 0 && ' 目前還沒有任何範本，請先到該頁面建立主項目。'}
                  </div>
                </section>

                {/* 細項：逐台挑選或自行新增 */}
                <section style={{ ...card, padding: '16px', backgroundColor: 'var(--bg-surface-subtle)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <Tag size={17} color="#7c3aed" />
                    <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 900, color: 'var(--text-main)' }}>細項（這台設備自己決定）</h3>
                  </div>
                  <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.7 }}>
                    細項不會自動套用，也不勾選 —— 加進來之後在下方填寫這台設備的實際內容（例如「OS」填「RH9.6」）。
                    可以從範本挑選，也可以直接為這台設備新增。
                  </p>

                  {groups.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
                      <label style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }} htmlFor="checklist-group-select">主項目</label>
                      <select
                        id="checklist-group-select"
                        value={selectedGroupId || ''}
                        onChange={(e) => { setSelectedGroupId(Number(e.target.value)); setPickedDetails(new Set()); }}
                        style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', fontSize: '13px', minWidth: '260px' }}
                      >
                        {groups.map((g) => (
                          <option key={g.id} value={g.id}>{g.name}（{g.brand || '通用'}）</option>
                        ))}
                      </select>
                      {selectedGroup && deviceBrand && (selectedGroup.brand || '').trim().toUpperCase() === deviceBrand && (
                        <span style={{ fontSize: '11px', fontWeight: 800, padding: '2px 10px', borderRadius: '10px', backgroundColor: 'rgba(8, 145, 178, 0.14)', color: '#0891b2' }}>
                          這台設備的廠牌
                        </span>
                      )}
                    </div>
                  )}

                  {groups.length > 0 && (
                    <div style={{ ...card, padding: '12px', marginBottom: '12px' }}>
                      {detailItems.length === 0 ? (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>此主項目沒有可挑選的細項</div>
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
                            {already && <span style={{ fontSize: '11px', fontWeight: 800, color: '#10b981', whiteSpace: 'nowrap' }}>已加入</span>}
                          </label>
                        );
                      })}
                      {detailItems.length > 0 && (
                        <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            onClick={handleAddDetails}
                            disabled={busy}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: busy ? 'var(--border-color)' : '#7c3aed', color: '#fff', fontWeight: 800, fontSize: '13px', cursor: busy ? 'not-allowed' : 'pointer' }}
                          >
                            {busy ? <><RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} /> 處理中...</> : <><Plus size={15} /> 加入勾選的細項</>}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 直接為這台設備新增細項 */}
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                      type="text"
                      value={customDetail}
                      onChange={(e) => setCustomDetail(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomDetail(); } }}
                      placeholder="直接為這台設備新增細項，例如：客戶指定 IP 設定"
                      aria-label="新增這台設備的細項"
                      style={inputStyle}
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomDetail}
                      disabled={busy}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '0 14px', borderRadius: '8px', border: 'none', backgroundColor: busy ? 'var(--border-color)' : '#7c3aed', color: '#fff', fontWeight: 800, fontSize: '13px', cursor: busy ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
                    >
                      <Plus size={15} /> 新增細項
                    </button>
                  </div>
                </section>

                {/* 已有的檢查項目 */}
                <section>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                    <CheckCircle2 size={17} color="#10b981" />
                    <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 900, color: 'var(--text-main)' }}>這台設備的檢查項目</h3>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 700 }}>
                      （主要 {autoCount} 項，已完成 {doneCount}；細項 {applied.length - autoCount} 項）
                    </span>
                  </div>

                  {applied.length === 0 ? (
                    <div style={{ ...card, padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                      這台設備目前沒有任何檢查項目。請先到「報表中心 → 出機檢查表」為
                      {device.brand ? `「${device.brand}」` : '這個廠牌'}建立主項目與主要檢查功能。
                    </div>
                  ) : appliedByGroup.map(([groupName, rows]) => {
                    // 整組都已經沒有對應的範本時才提供整組移除，避免移掉又被自動補回來
                    const allOrphan = rows.every((r) => !r.source_item_id);
                    return (
                      <div key={groupName} style={{ ...card, padding: '14px', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
                          <b style={{ fontSize: '13px', color: 'var(--text-main)' }}>{groupName}</b>
                          {allOrphan && (
                            <button
                              type="button"
                              onClick={() => handleRemoveGroup(groupName)}
                              title="這一組的範本已不存在，可整組移除"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.3)', backgroundColor: 'rgba(239, 68, 68, 0.08)', color: '#ef4444', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                            >
                              <Trash2 size={12} /> 移除整組
                            </button>
                          )}
                        </div>
                        {rows.map((row) => {
                          const isDetail = row.kind === KIND_DETAIL;
                          return (
                          <div
                            key={row.id}
                            style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 8px', borderRadius: '8px', backgroundColor: (!isDetail && row.is_checked) ? 'rgba(16, 185, 129, 0.07)' : 'transparent' }}
                          >
                            {isDetail ? (
                              // 細項記錄的是內容而不是做完沒有，因此沒有勾選框
                              <span style={{ width: '17px', flexShrink: 0 }} />
                            ) : (
                              <input
                                type="checkbox"
                                checked={!!row.is_checked}
                                onChange={() => handleToggleChecked(row)}
                                aria-label={`${row.item_name} 檢查完成`}
                                style={{ width: '17px', height: '17px', cursor: 'pointer', flexShrink: 0 }}
                              />
                            )}
                            <span style={{
                              fontSize: '11px', fontWeight: 800, padding: '1px 7px', borderRadius: '8px', whiteSpace: 'nowrap',
                              backgroundColor: !isDetail ? 'rgba(8, 145, 178, 0.12)' : 'rgba(124, 58, 237, 0.12)',
                              color: !isDetail ? '#0891b2' : '#7c3aed',
                            }}>
                              {!isDetail ? '主要' : '細項'}
                            </span>
                            <span style={{ flex: isDetail ? '0 0 150px' : 1, fontSize: '13px', color: 'var(--text-main)', fontWeight: 600, wordBreak: 'break-word', textDecoration: (!isDetail && row.is_checked) ? 'line-through' : 'none', opacity: (!isDetail && row.is_checked) ? 0.7 : 1 }}>
                              {row.item_name}
                            </span>
                            {isDetail && (
                              <input
                                type="text"
                                value={contentDraft[row.id] !== undefined ? contentDraft[row.id] : (row.content || '')}
                                onChange={(e) => handleContentChange(row.id, e.target.value)}
                                onBlur={() => handleContentCommit(row)}
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
                                placeholder="內容，例如：RH9.6"
                                aria-label={`${row.item_name} 內容`}
                                style={{ flex: 1, minWidth: 0, padding: '5px 9px', borderRadius: '6px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', fontSize: '13px', outline: 'none' }}
                              />
                            )}
                            {canRemove(row) ? (
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(row)}
                                title="移除此項目"
                                aria-label={`移除 ${row.item_name}`}
                                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', padding: 0, borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: '#ef4444', cursor: 'pointer', flexShrink: 0 }}
                              >
                                <Trash2 size={12} />
                              </button>
                            ) : (
                              <span
                                title="依廠牌自動套用的項目，需到「報表中心 → 出機檢查表」調整範本"
                                style={{ fontSize: '11px', color: 'var(--text-subtle)', fontWeight: 700, whiteSpace: 'nowrap' }}
                              >
                                自動
                              </span>
                            )}
                          </div>
                          );
                        })}
                      </div>
                    );
                  })}

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.7, marginTop: '4px' }}>
                    <Info size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <span>
                      標示「主要」的是依廠牌自動套用的檢查功能，勾選表示檢查完成；要增減請到「報表中心 → 出機檢查表」調整範本。
                      標示「細項」的不勾選，直接在右邊填寫這台設備的實際內容（例如「OS」填「RH9.6」），離開欄位即自動儲存。
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
