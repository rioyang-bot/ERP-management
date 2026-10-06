import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X, ClipboardCheck, Plus, Trash2, Printer, RefreshCw, Info, ListChecks, Tag, CheckCircle2,
} from 'lucide-react';
import { logUpdate } from '../utils/auditLogger';
import DeviceChecklistPrintModal from './DeviceChecklistPrintModal';
import AssetPhotoSection from './AssetPhotoSection';
import { groupMatchLevel, pickDefaultGroup } from '../utils/checklistGroupScope';

/**
 * 單一設備的出機檢查表
 *
 * 主要檢查功能是「依廠牌自動套用」的：主項目綁定哪個廠牌，該廠牌的每一台設備
 * 就都有那一組；主項目再指定型號的，只套用到那個型號。開啟這個視窗時會先
 * 同步一次，不需要逐台按套用。
 *
 * 細項記錄的是「這台設備實際是什麼」而不是「做完了沒有」，一律填寫內容、不勾選
 * （例如細項「OS」填「RH9.6」）。範本上的細項與主要檢查功能一樣自動套用；
 * 範本沒有的，可以直接為這台設備新增。勾選只用在主要檢查功能。
 *
 * 拍照項目（例如正面、背面）與主要檢查功能一樣自動套用，列在主機照片區，
 * 每一項各自上傳，有照片就算完成。
 *
 * 已套用的項目是「套用當下的快照」，範本日後被刪除或改名都不會讓它消失。
 */
const KIND_MAIN = 'MAIN';
const KIND_DETAIL = 'DETAIL';
const KIND_PHOTO = 'PHOTO';
const CUSTOM_GROUP = '自訂細項';

const DeviceChecklistModal = ({ isOpen, onClose, device, onChanged }) => {
  const [groups, setGroups] = useState([]);
  const [templateItems, setTemplateItems] = useState([]);
  const [applied, setApplied] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showPrint, setShowPrint] = useState(false);

  // 細項逐台挑選，因此各自記住勾了哪些
  const [customDetail, setCustomDetail] = useState('');
  // 細項內容改成邊打邊記在本地，離開欄位才收進待儲存
  const [contentDraft, setContentDraft] = useState({});
  /**
   * 尚未儲存的勾選與內容。
   *
   * 先前勾一下、或內容打完離開欄位，就直接寫進資料庫 —— 勾錯了也回不來，
   * 而畫面上只是點了一下。改成先放在這裡，按下「儲存變更」才一起寫回去。
   * { [rowId]: boolean } 與 { [rowId]: string }
   */
  const [pendingChecks, setPendingChecks] = useState({});
  const [pendingContents, setPendingContents] = useState({});
  const [savingChanges, setSavingChanges] = useState(false);

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

  /**
   * 照片增減後只重讀這台設備的項目（拍照完成度），不整頁重載 ——
   * 整頁重載會把主機照片區收掉再展開，剛上傳的縮圖要重抓一次。
   */
  const refreshApplied = useCallback(async () => {
    if (!device?.id) return;
    try {
      const res = await window.electronAPI.namedQuery('fetchAssetChecklist', [device.id]);
      if (res.success) setApplied((prev) => {
        // 還沒儲存的勾選與內容不能被蓋掉
        const local = new Map(prev.map((r) => [r.id, r]));
        return (res.rows || []).map((r) => (local.has(r.id)
          ? { ...r, is_checked: local.get(r.id).is_checked, content: local.get(r.id).content }
          : r));
      });
    } catch (e) {
      console.error('重新讀取檢查項目失敗:', e);
    }
  }, [device?.id]);

  const handlePhotosChanged = async () => {
    await refreshApplied();
    if (onChanged) onChanged();
  };

  useEffect(() => {
    if (!isOpen) return;
    setCustomDetail('');
    setContentDraft({});
    loadAll();
  }, [isOpen, loadAll]);

  // 自行新增的細項歸在這台設備自己的主項目（型號 > 廠牌 > 通用）底下，沒有就歸「自訂細項」
  const ownGroup = pickDefaultGroup(groups, device);
  const customGroupName = ownGroup && groupMatchLevel(ownGroup, device) ? ownGroup.name : CUSTOM_GROUP;

  /** 這台設備已經有的項目（以主項目＋種類＋名稱比對，與資料庫的唯一鍵一致） */
  const appliedKeySet = useMemo(
    () => new Set(applied.map((a) => `${(a.group_name || '').trim().toUpperCase()}|${a.kind}|${(a.item_name || '').trim().toUpperCase()}`)),
    [applied]
  );
  const isApplied = (groupName, kind, name) =>
    appliedKeySet.has(`${(groupName || '').trim().toUpperCase()}|${kind}|${(name || '').trim().toUpperCase()}`);

  /** 寫入一筆細項；回傳是否真的寫進去 */
  const insertDetail = async (groupName, name, sourceId, order) => {
    const res = await window.electronAPI.namedQuery('insertAssetChecklistItem', [
      device.id, groupName, KIND_DETAIL, name, sourceId, order,
    ]);
    if (!res.success) throw new Error(res.error || '寫入失敗');
    return (res.rows || []).length > 0;
  };

  const handleAddCustomDetail = async () => {
    const name = customDetail.trim();
    if (!name) return;
    const groupName = customGroupName;
    if (isApplied(groupName, KIND_DETAIL, name)) {
      alert('這台設備已經有同名的細項了。');
      return;
    }
    if (!window.confirm(`確定要為 [${device.sn || device.id}] 新增細項「${name}」嗎？`)) return;
    setBusy(true);
    try {
      await insertDetail(groupName, name, null, applied.length);
      logUpdate('DEVICE', device.sn || device.id, device.sn, `設備 [${device.sn}] 新增自訂出機檢查細項 [${name}]`, {
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

  const handleContentCommit = (row) => {
    const draft = contentDraft[row.id];
    if (draft === undefined) return;
    const next = draft.trim();
    setContentDraft((prev) => { const n = { ...prev }; delete n[row.id]; return n; });
    if (next === (row.content || '')) return;

    // 只更新畫面並記成待儲存，資料庫等按下「儲存變更」才動
    setApplied((prev) => prev.map((r) => (r.id === row.id ? { ...r, content: next || null } : r)));
    setPendingContents((prev) => ({ ...prev, [row.id]: next }));
  };

  const handleToggleChecked = (row) => {
    const next = !row.is_checked;
    setApplied((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_checked: next } : r)));
    setPendingChecks((prev) => ({ ...prev, [row.id]: next }));
  };

  /** 尚未寫回資料庫的變更筆數 */
  const pendingCount = Object.keys(pendingChecks).length + Object.keys(pendingContents).length;

  const discardChanges = async () => {
    setPendingChecks({});
    setPendingContents({});
    setContentDraft({});
    await loadAll();
  };

  const handleSaveChanges = async () => {
    if (pendingCount === 0) return;
    const checks = Object.entries(pendingChecks);
    const contents = Object.entries(pendingContents);
    if (!window.confirm(`確定要儲存這 ${pendingCount} 項變更嗎？`)) return;

    setSavingChanges(true);
    try {
      for (const [rowId, checked] of checks) {
        const res = await window.electronAPI.namedQuery('setAssetChecklistItemChecked', [checked, Number(rowId)]);
        if (!res.success || (res.rows || []).length === 0) throw new Error(res.error || '找不到該項目');
      }
      for (const [rowId, content] of contents) {
        const res = await window.electronAPI.namedQuery('setAssetChecklistItemContent', [content, Number(rowId)]);
        if (!res.success || (res.rows || []).length === 0) throw new Error(res.error || '找不到該項目');
      }

      const named = (rowId) => applied.find((r) => String(r.id) === String(rowId))?.item_name || rowId;
      const parts = [];
      if (checks.length) {
        parts.push('勾選：' + checks.map(([id, v]) => `${named(id)}${v ? '✓' : '✗'}`).join('、'));
      }
      if (contents.length) {
        parts.push('內容：' + contents.map(([id, v]) => `${named(id)}=${v || '（清空）'}`).join('、'));
      }
      // 出機檢查的結果是出貨憑據的一部分，改過什麼要留得下來
      await logUpdate('DEVICE', device.sn || device.id, device.sn,
        `設備 [${device.sn || device.id}] 出機檢查表更新 ${pendingCount} 項 —— ${parts.join('；')}`,
        { sn: device.sn, checked: Object.fromEntries(checks), contents: Object.fromEntries(contents) });

      setPendingChecks({});
      setPendingContents({});
      await loadAll();
      if (onChanged) onChanged();
    } catch (e) {
      alert(`儲存失敗：${e.message}\n\n畫面會重新讀取，請確認後再試一次。`);
      await discardChanges();
    } finally {
      setSavingChanges(false);
    }
  };

  /** 有沒存的變更就先問一句再關 */
  const handleClose = () => {
    if (pendingCount > 0
      && !window.confirm(`還有 ${pendingCount} 項變更沒有儲存，關閉後就會消失。\n\n確定要關閉嗎？`)) return;
    setPendingChecks({});
    setPendingContents({});
    setContentDraft({});
    onClose();
  };

  /** 範本裡仍存在、且設定為自動套用的項目 id */
  const autoAppliedSourceIds = useMemo(
    () => new Set(templateItems.map((i) => i.id)),
    [templateItems]
  );

  /**
   * 能不能從這台設備移除某一項。
   *
   * 依廠牌自動套用的項目不可移除：移掉下次開啟又會被補回來。
   * 逐台加入的細項、以及範本已刪除的孤兒項目（source_item_id 為空）才可以移除。
   */
  const canRemove = (row) => !row.source_item_id || !autoAppliedSourceIds.has(row.source_item_id);

  const handleRemoveItem = async (row) => {
    if (!window.confirm(`確定要從這台設備的檢查表移除 [${row.item_name}] 嗎？`)) return;
    try {
      const res = await window.electronAPI.namedQuery('deleteAssetChecklistItem', [row.id]);
      if (!res.success) throw new Error(res.error || '移除失敗');
      await logUpdate('DEVICE', device.sn || device.id, device.sn,
        `設備 [${device.sn || device.id}] 的出機檢查表移除項目 [${row.item_name}]`,
        { sn: device.sn, group: row.group_name, item: row.item_name, kind: row.kind });
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
      await logUpdate('DEVICE', device.sn || device.id, device.sn,
        `設備 [${device.sn || device.id}] 的出機檢查表移除整組 [${groupName}]`,
        { sn: device.sn, group: groupName });
      await loadAll();
      if (onChanged) onChanged();
    } catch (e) {
      alert(`移除失敗：${e.message}`);
    }
  };

  // 主要檢查功能依主項目分組呈現
  const appliedByGroup = useMemo(() => {
    const map = new Map();
    applied.filter((r) => r.kind === KIND_MAIN).forEach((row) => {
      const key = row.group_name || '未分類';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    });
    return [...map.entries()];
  }, [applied]);

  // 細項是這台設備個別的內容，不是主要檢查功能底下的分支，因此獨立成一區、不分組
  const appliedDetails = useMemo(() => applied.filter((r) => r.kind === KIND_DETAIL), [applied]);

  const mainRows = applied.filter((a) => a.kind === KIND_MAIN);
  const autoCount = mainRows.length;
  const doneCount = mainRows.filter((a) => a.is_checked).length;
  // 標題的完成度與設備列表的「檢查 x/y」一致：主要檢查功能勾選才算、細項有填內容才算
  const filledDetails = applied.filter((a) => a.kind === KIND_DETAIL && (a.content || '').trim()).length;
  const checkTotal = autoCount + applied.filter((a) => a.kind === KIND_DETAIL).length;
  const checkDone = doneCount + filledDetails;
  // 拍照項目有照片就算完成，與勾選分開計算
  const photoRows = applied.filter((a) => a.kind === KIND_PHOTO);
  const photoDoneCount = photoRows.filter((a) => Number(a.photo_count) > 0).length;

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
                {checkTotal > 0 && (
                  <span
                    style={{ marginLeft: '10px', fontWeight: 800, color: checkDone === checkTotal ? '#10b981' : '#f59e0b' }}
                    title="主要檢查功能勾選、細項填寫內容才算完成"
                    data-testid="header-check-progress"
                  >
                    已完成 {checkDone} / {checkTotal}
                  </span>
                )}
                {photoRows.length > 0 && (
                  <span
                    style={{ marginLeft: '10px', fontWeight: 800, color: photoDoneCount === photoRows.length ? '#10b981' : '#f59e0b' }}
                    data-testid="header-photo-progress"
                  >
                    照片 {photoDoneCount} / {photoRows.length}
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
                onClick={handleClose}
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
                    <b style={{ fontSize: '14px', color: 'var(--text-main)' }}>主要檢查功能已依廠牌／型號自動套用</b>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 700 }}>
                      （{device.brand || '未填廠牌'}{device.model ? ` · ${device.model}` : ''} · 共 {autoCount} 項）
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.7 }}>
                    在「報表中心 → 出機檢查表」新增主要檢查功能後，該廠牌（或指定型號）的所有設備都會自動帶入，不需要逐台操作。
                    {groups.length === 0 && <span> 目前還沒有任何範本，請先到該頁面建立主項目。</span>}
                  </div>
                </section>

                {/* 主機照片：這一台自己的外觀與機況，日後開立驗收單會用到 */}
                <AssetPhotoSection
                  device={device}
                  card={card}
                  photoItems={photoRows}
                  onChanged={handlePhotosChanged}
                  canRemove={canRemove}
                  onRemoveItem={handleRemoveItem}
                />

                {/* 已有的檢查項目 */}
                <section>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                    <CheckCircle2 size={17} color="#10b981" />
                    <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 900, color: 'var(--text-main)' }}>檢查項目</h3>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 700 }}>
                      （共 {autoCount} 項，已完成 {doneCount}）
                    </span>
                  </div>

                  {appliedByGroup.length === 0 ? (
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
                          return (
                          <div
                            key={row.id}
                            style={{ display: 'flex', alignItems: row.description ? 'flex-start' : 'center', gap: '10px', padding: '7px 8px', borderRadius: '8px', backgroundColor: row.is_checked ? 'rgba(16, 185, 129, 0.07)' : 'transparent' }}
                          >
                            <input
                              type="checkbox"
                              checked={!!row.is_checked}
                              onChange={() => handleToggleChecked(row)}
                              aria-label={`${row.item_name} 檢查完成`}
                              style={{ width: '17px', height: '17px', cursor: 'pointer', flexShrink: 0 }}
                            />
                            <span style={{ flex: 1, fontSize: '13px', color: 'var(--text-main)', fontWeight: 600, wordBreak: 'break-word' }}>
                              <span style={{ textDecoration: row.is_checked ? 'line-through' : 'none', opacity: row.is_checked ? 0.7 : 1 }}>
                                {row.item_name}
                              </span>
                              {/* 範本上的說明（與拍照項目的拍攝說明相同），讓檢查的人知道要看什麼 */}
                              {row.description && (
                                <span data-testid={`checklist-desc-${row.id}`} style={{ display: 'block', marginTop: '3px', fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                                  {row.description}
                                </span>
                              )}
                            </span>
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
                      這一區是依廠牌自動套用的主要檢查功能，勾選表示檢查完成；要增減請到「報表中心 → 出機檢查表」調整範本。
                    </span>
                  </div>
                </section>

                {/* 細項紀錄：這台設備個別的內容，與檢查項目分開。
                    範本細項自動套用進來，範本沒有的在最下面直接新增 */}
                <section>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                      <Tag size={17} color="#7c3aed" />
                      <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 900, color: 'var(--text-main)' }}>細項紀錄</h3>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 700 }}>
                        （{appliedDetails.length} 項，填寫這台設備的實際內容）
                      </span>
                    </div>

                    <div style={{ ...card, padding: '14px' }}>
                      {appliedDetails.length === 0 && (
                        <div style={{ padding: '4px 8px 10px', fontSize: '12px', color: 'var(--text-muted)' }}>
                          範本沒有細項。需要記錄的內容可以在下方直接新增。
                        </div>
                      )}
                      {appliedDetails.map((row) => (
                        <div key={row.id} style={{ display: 'flex', alignItems: row.description ? 'flex-start' : 'center', gap: '10px', padding: '7px 8px' }}>
                          <span style={{ flex: '0 0 160px', fontSize: '13px', color: 'var(--text-main)', fontWeight: 700, wordBreak: 'break-word' }}>
                            {row.item_name}
                            {row.description && (
                              <span data-testid={`checklist-desc-${row.id}`} style={{ display: 'block', marginTop: '3px', fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                                {row.description}
                              </span>
                            )}
                          </span>
                          <input
                            type="text"
                            value={contentDraft[row.id] !== undefined ? contentDraft[row.id] : (row.content || '')}
                            onChange={(e) => handleContentChange(row.id, e.target.value)}
                            onBlur={() => handleContentCommit(row)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
                            aria-label={`${row.item_name} 內容`}
                            style={{ flex: 1, minWidth: 0, padding: '5px 9px', borderRadius: '6px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', fontSize: '13px', outline: 'none' }}
                          />
                          {canRemove(row) ? (
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(row)}
                              title="移除此細項"
                              aria-label={`移除 ${row.item_name}`}
                              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', padding: 0, borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: '#ef4444', cursor: 'pointer', flexShrink: 0 }}
                            >
                              <Trash2 size={12} />
                            </button>
                          ) : (
                            <span
                              title="範本上的細項，需到「報表中心 → 出機檢查表」調整範本"
                              style={{ fontSize: '11px', color: 'var(--text-subtle)', fontWeight: 700, whiteSpace: 'nowrap', width: '26px', textAlign: 'center' }}
                            >
                              自動
                            </span>
                          )}
                        </div>
                      ))}

                      {/* 範本沒有的細項，直接為這台設備新增 */}
                      <div style={{ display: 'flex', gap: '6px', marginTop: '8px', padding: '8px 8px 0', borderTop: appliedDetails.length > 0 ? '1px dashed var(--border-color)' : 'none' }}>
                        <input
                          type="text"
                          value={customDetail}
                          onChange={(e) => setCustomDetail(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomDetail(); } }}
                          placeholder="範本沒有的細項，直接為這台設備新增，例如：客戶指定 IP 設定"
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
                    </div>

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.7, marginTop: '8px' }}>
                      <Info size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
                      <span>
                        細項不勾選，記錄的是這台設備個別的內容（例如「OS」填「RH9.6」）；填了內容才算完成。
                        勾選與內容都要按下方的「儲存變更」才會寫回，按錯了可以直接放棄。
                      </span>
                    </div>
                </section>
              </>
            )}
          </div>

          {/* 未儲存的變更 */}
          {pendingCount > 0 && (
            <div style={{
              padding: '12px 24px', borderTop: '1px solid var(--border-color)',
              backgroundColor: 'rgba(245, 158, 11, 0.10)', display: 'flex',
              alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-main)' }}>
                有 {pendingCount} 項變更尚未儲存
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={discardChanges}
                  disabled={savingChanges}
                  style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-main)', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
                >
                  放棄變更
                </button>
                <button
                  type="button"
                  onClick={handleSaveChanges}
                  disabled={savingChanges}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: '#10b981', color: '#fff', fontWeight: 800, fontSize: '13px', cursor: savingChanges ? 'not-allowed' : 'pointer' }}
                >
                  <CheckCircle2 size={15} /> {savingChanges ? '儲存中…' : '儲存變更'}
                </button>
              </div>
            </div>
          )}
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
