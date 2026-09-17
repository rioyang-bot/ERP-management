import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ClipboardCheck, Plus, Trash2, Pencil, Check, X, Layers, ListChecks, Info, Tag, RefreshCw,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { logCreate, logDelete, logUpdate } from '../utils/auditLogger';

/**
 * 出機檢查表範本 (Pre-delivery Checklist Templates)
 *
 * 結構是兩層：
 *   主項目（綁定廠牌，例如「BLACKCORE 出機檢查」）
 *     ├─ 主要檢查功能：該廠牌的每一台設備自動套用，勾選表示檢查完成
 *     └─ 細項：在設備上填寫內容而不是勾選（例如細項「OS」填「RH9.6」）。
 *              預設由每台設備各自挑選；勾「自動」之後就跟主要檢查功能一樣
 *              自動出現在該廠牌的每一台設備上，省去逐台加的功夫。
 *
 * 這裡改的是「範本」。新增主項目或主要檢查功能之後會立刻同步到所有符合的
 * 設備；但設備端保留的是套用當下的快照，在這裡刪掉任何項目都不會讓已經
 * 套用出去的檢查表消失。
 */
const KIND_MAIN = 'MAIN';
const KIND_DETAIL = 'DETAIL';

const ChecklistTemplates = () => {
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [items, setItems] = useState([]);
  const [brands, setBrands] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 新增主項目
  const [newGroup, setNewGroup] = useState({ name: '', brand: '' });
  const [editingGroup, setEditingGroup] = useState(null); // { id, name, brand }

  // 新增項目（兩組各自一個輸入框）
  const [newItemText, setNewItemText] = useState({ [KIND_MAIN]: '', [KIND_DETAIL]: '' });
  const [editingItem, setEditingItem] = useState(null); // { id, name }
  // 「已套用到 N 台設備」的提示，讓使用者看得到自動套用真的發生了
  const [syncNotice, setSyncNotice] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [gRes, iRes, bRes] = await Promise.all([
        window.electronAPI.namedQuery('fetchChecklistGroups'),
        window.electronAPI.namedQuery('fetchChecklistItems'),
        window.electronAPI.namedQuery('fetchDeviceBrands'),
      ]);
      if (!gRes.success) throw new Error(gRes.error || '讀取主項目失敗');
      setGroups(gRes.rows || []);
      if (iRes.success) setItems(iRes.rows || []);
      if (bRes.success) setBrands(bRes.rows || []);
    } catch (e) {
      setError(e.message || '讀取出機檢查表失敗');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  /**
   * 把主項目底下的主要檢查功能補到所有符合廠牌的設備上。
   * 新增主項目、新增主要檢查功能之後都要跑一次，使用者才不必逐台套用。
   *
   * @returns {number} 這次補了幾列
   */
  const syncToDevices = async () => {
    try {
      const res = await window.electronAPI.namedQuery('syncBrandChecklistToAssets', [null]);
      if (!res.success) return 0;
      return (res.rows || []).length;
    } catch (e) {
      console.error('同步至設備失敗:', e);
      return 0;
    }
  };

  // 還沒選、或選到的主項目已被刪除時，自動選第一個
  useEffect(() => {
    if (groups.length === 0) { setSelectedGroupId(null); return; }
    if (!groups.some((g) => g.id === selectedGroupId)) setSelectedGroupId(groups[0].id);
  }, [groups, selectedGroupId]);

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) || null;
  const groupItems = useMemo(
    () => items.filter((i) => i.group_id === selectedGroupId),
    [items, selectedGroupId]
  );
  const mainItems = groupItems.filter((i) => i.kind === KIND_MAIN);
  const detailItems = groupItems.filter((i) => i.kind === KIND_DETAIL);

  // --- 主項目 ---
  const handleAddGroup = async (e) => {
    e.preventDefault();
    const name = newGroup.name.trim();
    if (!name) return alert('請輸入主項目名稱');
    try {
      const res = await window.electronAPI.namedQuery('insertChecklistGroup', [name, newGroup.brand || null, groups.length]);
      if (!res.success) throw new Error(res.error || '建立失敗');
      const created = res.rows?.[0];
      logCreate('SETTING', created?.id, name, `新增出機檢查表主項目 [${name}]${newGroup.brand ? `（廠牌: ${newGroup.brand}）` : '（通用）'}`, { name, brand: newGroup.brand || null });
      setNewGroup({ name: '', brand: '' });
      await syncToDevices();
      await fetchAll();
      if (created?.id) setSelectedGroupId(created.id);
    } catch (err) {
      alert(`新增主項目失敗：${err.message}\n（同一廠牌底下不可有同名的主項目）`);
    }
  };

  const handleSaveGroup = async () => {
    const name = (editingGroup.name || '').trim();
    if (!name) return alert('請輸入主項目名稱');
    try {
      const res = await window.electronAPI.namedQuery('updateChecklistGroup', [name, editingGroup.brand || null, editingGroup.id]);
      if (!res.success || (res.rows || []).length === 0) throw new Error(res.error || '找不到該主項目');
      // 設備端已套用的分組名稱跟著改，否則同步會把新名稱再補一份進去
      await window.electronAPI.namedQuery('renameAssetChecklistGroupBySource', [name, editingGroup.id]);
      logUpdate('SETTING', editingGroup.id, name, `修改出機檢查表主項目 [${name}]`, { name, brand: editingGroup.brand || null });
      setEditingGroup(null);
      // 廠牌可能被改掉，改完要重新套用到新廠牌的設備
      await syncToDevices();
      await fetchAll();
    } catch (err) {
      alert(`修改主項目失敗：${err.message}`);
    }
  };

  const handleDeleteGroup = async (group) => {
    const msg = `確定要刪除主項目 [${group.name}] 嗎？\n\n`
      + `底下的 ${group.main_count} 個主要檢查功能與 ${group.detail_count} 個細項會一併刪除。\n`
      + '已經套用到設備上的檢查表不受影響（設備端保留的是套用當下的內容）。';
    if (!window.confirm(msg)) return;
    try {
      const res = await window.electronAPI.namedQuery('deleteChecklistGroup', [group.id]);
      if (!res.success) throw new Error(res.error || '刪除失敗');
      logDelete('SETTING', group.id, group.name, `刪除出機檢查表主項目 [${group.name}]`, { name: group.name, brand: group.brand });
      await fetchAll();
    } catch (err) {
      alert(`刪除主項目失敗：${err.message}`);
    }
  };

  // --- 項目 ---
  const handleAddItem = async (kind) => {
    const name = (newItemText[kind] || '').trim();
    if (!selectedGroup) return alert('請先選擇左側的主項目');
    if (!name) return;
    const sameKind = groupItems.filter((i) => i.kind === kind);
    try {
      const res = await window.electronAPI.namedQuery('insertChecklistItem', [selectedGroup.id, kind, name, sameKind.length]);
      if (!res.success) throw new Error(res.error || '新增失敗');
      logCreate('SETTING', res.rows?.[0]?.id, name, `新增出機檢查${kind === KIND_MAIN ? '主要功能' : '細項'} [${name}] 至 [${selectedGroup.name}]`, { group: selectedGroup.name, kind, name });
      setNewItemText((prev) => ({ ...prev, [kind]: '' }));

      // 主要檢查功能一建立就要出現在所有符合廠牌的設備上
      if (kind === KIND_MAIN) {
        const n = await syncToDevices();
        setSyncNotice(n > 0
          ? `已套用到 ${n} 台${selectedGroup.brand || ''}設備`
          : '所有符合的設備都已經有這個項目');
      }
      await fetchAll();
    } catch (err) {
      alert(`新增失敗：${err.message}\n（同一主項目底下不可有重複的名稱）`);
    }
  };

  /**
   * 細項要不要跟著主要檢查功能一起自動套用。
   * 像 OS、BMC IP 這種每台都要填的欄位，逐台加進去太費工。
   */
  const handleToggleAutoApply = async (item) => {
    const next = !item.auto_apply;
    try {
      const res = await window.electronAPI.namedQuery('setChecklistItemAutoApply', [next, item.id]);
      if (!res.success || (res.rows || []).length === 0) throw new Error(res.error || '找不到該項目');
      if (next) {
        const n = await syncToDevices();
        setSyncNotice(n > 0
          ? `「${item.name}」已套用到 ${n} 台設備`
          : `「${item.name}」所有符合的設備都已經有了`);
      } else {
        setSyncNotice(`「${item.name}」之後不再自動套用；已經發出去的仍保留在各設備上`);
      }
      await fetchAll();
    } catch (err) {
      alert(`設定自動套用失敗：${err.message}`);
    }
  };

  const handleSaveItem = async () => {
    const name = (editingItem.name || '').trim();
    if (!name) return;
    try {
      const res = await window.electronAPI.namedQuery('updateChecklistItemName', [name, editingItem.id]);
      if (!res.success) throw new Error(res.error || '修改失敗');
      // 設備端已套用的同一個項目跟著改名，否則同步會把新名稱再補一份進去
      await window.electronAPI.namedQuery('renameAssetChecklistItemsBySource', [name, editingItem.id]);
      setEditingItem(null);
      await fetchAll();
    } catch (err) {
      alert(`修改失敗：${err.message}`);
    }
  };

  const handleDeleteItem = async (item) => {
    if (!window.confirm(`確定要刪除 [${item.name}] 嗎？\n已經套用到設備上的相同項目不會被移除。`)) return;
    try {
      const res = await window.electronAPI.namedQuery('deleteChecklistItem', [item.id]);
      if (!res.success) throw new Error(res.error || '刪除失敗');
      logDelete('SETTING', item.id, item.name, `刪除出機檢查項目 [${item.name}]`, { name: item.name, kind: item.kind });
      await fetchAll();
    } catch (err) {
      alert(`刪除失敗：${err.message}`);
    }
  };

  // --- 樣式 ---
  const card = {
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-color)',
    borderRadius: '14px',
    boxShadow: 'var(--card-shadow)',
  };
  const inputStyle = {
    width: '100%', padding: '8px 10px', borderRadius: '8px',
    border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)',
    color: 'var(--input-text)', fontSize: '13px', boxSizing: 'border-box', outline: 'none',
  };
  const iconBtn = (color) => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: '28px', height: '28px', padding: 0, borderRadius: '6px',
    border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)',
    color, cursor: 'pointer', flexShrink: 0,
  });

  /** 主要檢查功能 / 細項 共用的清單區塊 */
  const renderItemColumn = (kind) => {
    const isMain = kind === KIND_MAIN;
    const list = isMain ? mainItems : detailItems;
    const accent = isMain ? 'var(--primary-color)' : '#7c3aed';

    return (
      <div style={{ ...card, padding: '16px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          {isMain ? <ListChecks size={18} color={accent} /> : <Tag size={18} color={accent} />}
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: 'var(--text-main)' }}>
            {isMain ? '主要檢查功能' : '細項'}
          </h3>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 700 }}>({list.length})</span>
        </div>
        <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          {isMain
            ? '新增後立即套用到所有符合廠牌的設備，勾選表示檢查完成。'
            : '這裡定義的是欄位名稱（例如「OS」），由每台設備填寫內容（例如「RH9.6」）。勾選前面的框，就跟主要檢查功能一樣自動套用到該廠牌的每一台設備。'}
        </p>

        <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
          <input
            type="text"
            value={newItemText[kind]}
            onChange={(e) => setNewItemText((prev) => ({ ...prev, [kind]: e.target.value }))}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddItem(kind); } }}
            placeholder={isMain ? '例如：BIOS 設定、韌體版本確認' : '欄位名稱，例如：OS、BMC IP、開機順序'}
            disabled={!selectedGroup}
            style={inputStyle}
          />
          <button
            type="button"
            onClick={() => handleAddItem(kind)}
            disabled={!selectedGroup}
            title={isMain ? '新增主要檢查功能' : '新增細項'}
            aria-label={isMain ? '新增主要檢查功能' : '新增細項'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '0 12px',
              borderRadius: '8px', border: 'none', backgroundColor: selectedGroup ? accent : 'var(--border-color)',
              color: '#fff', fontWeight: 800, fontSize: '13px',
              cursor: selectedGroup ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap',
            }}
          >
            <Plus size={15} /> 新增
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', minHeight: '120px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {list.length === 0 ? (
            <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              {selectedGroup ? '尚未新增任何項目' : '請先於左側選擇主項目'}
            </div>
          ) : list.map((item, idx) => (
            <div
              key={item.id}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px',
                borderRadius: '8px', border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-surface-subtle)',
              }}
            >
              {isMain ? (
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-subtle)', minWidth: '18px' }}>
                  {idx + 1}.
                </span>
              ) : (
                // 勾起來就跟主要檢查功能一樣自動套用到該廠牌的每一台設備
                <input
                  type="checkbox"
                  checked={!!item.auto_apply}
                  onChange={() => handleToggleAutoApply(item)}
                  aria-label={`${item.name} 自動套用到所有設備`}
                  title="勾選後，這個細項會自動出現在該廠牌的每一台設備上，不必逐台加入"
                  style={{ width: '15px', height: '15px', cursor: 'pointer', flexShrink: 0 }}
                />
              )}
              {editingItem?.id === item.id ? (
                <>
                  <input
                    type="text"
                    value={editingItem.name}
                    onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveItem(); } }}
                    style={{ ...inputStyle, padding: '4px 8px' }}
                    autoFocus
                  />
                  <button type="button" onClick={handleSaveItem} style={iconBtn('#10b981')} title="儲存" aria-label="儲存項目"><Check size={14} /></button>
                  <button type="button" onClick={() => setEditingItem(null)} style={iconBtn('var(--text-muted)')} title="取消" aria-label="取消編輯"><X size={14} /></button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: '13px', color: 'var(--text-main)', fontWeight: 600, wordBreak: 'break-word' }}>
                    {item.name}
                    {!isMain && item.auto_apply && (
                      <span style={{ marginLeft: '6px', fontSize: '10px', fontWeight: 800, padding: '1px 7px', borderRadius: '8px', backgroundColor: 'rgba(8, 145, 178, 0.14)', color: '#0891b2', whiteSpace: 'nowrap' }}>
                        自動套用
                      </span>
                    )}
                  </span>
                  <button type="button" onClick={() => setEditingItem({ id: item.id, name: item.name })} style={iconBtn('#f59e0b')} title="修改名稱" aria-label={`修改 ${item.name}`}><Pencil size={13} /></button>
                  <button type="button" onClick={() => handleDeleteItem(item)} style={iconBtn('#ef4444')} title="刪除" aria-label={`刪除 ${item.name}`}><Trash2 size={13} /></button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: '24px', minHeight: '100%' }}>
      {/* 頁首 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 900, margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-main)' }}>
            <ClipboardCheck size={26} color="#0891b2" /> 出機檢查表 (Pre-delivery Checklist)
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '6px 0 0 0' }}>
            建立出機前要檢查的項目，之後在設備列表上逐台套用、勾選與列印。
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {syncNotice && (
            <span style={{ alignSelf: 'center', fontSize: '12px', fontWeight: 800, color: '#0891b2', backgroundColor: 'rgba(8, 145, 178, 0.12)', padding: '6px 12px', borderRadius: '20px' }}>
              {syncNotice}
            </span>
          )}
          <button
            type="button"
            onClick={fetchAll}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 14px', borderRadius: '30px', border: '1.5px solid var(--border-color)', backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-main)', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
          >
            <RefreshCw size={15} /> 重新整理
          </button>
          <button
            type="button"
            onClick={() => navigate('/devices')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 14px', borderRadius: '30px', border: 'none', backgroundColor: 'var(--primary-color)', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
          >
            前往設備列表套用 →
          </button>
        </div>
      </div>

      {/* 使用說明 */}
      <div style={{ ...card, padding: '14px 18px', marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'flex-start', backgroundColor: 'var(--bg-surface-subtle)' }}>
        <Info size={18} color="var(--primary-color)" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.8 }}>
          <div>
            • <b style={{ color: 'var(--text-main)' }}>主項目</b>綁定廠牌。建立之後，
            <b style={{ color: '#0891b2' }}>該廠牌的每一台設備都會自動套用</b>，不需要逐台操作；
            不指定廠牌即為所有設備通用。
          </div>
          <div>
            • <b style={{ color: 'var(--text-main)' }}>主要檢查功能</b>是自動套用、需勾選完成的部分；
            <b style={{ color: 'var(--text-main)' }}>細項</b>在設備上
            <b style={{ color: '#7c3aed' }}>填寫內容而不是勾選</b>（例如細項「OS」填「RH9.6」）。
            細項預設由每台設備各自挑選，若每台都要填，勾選細項前面的框即可
            <b style={{ color: '#0891b2' }}>自動套用到該廠牌的所有設備</b>。
          </div>
          <div>
            • 在這裡刪除任何項目，<b style={{ color: 'var(--text-main)' }}>都不會影響已經套用到設備上的檢查表</b>：設備端保留的是套用當下的內容。
          </div>
        </div>
      </div>

      {error && (
        <div style={{ ...card, padding: '14px 18px', marginBottom: '20px', borderColor: '#ef4444', color: '#ef4444', fontWeight: 700, fontSize: '13px' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ ...card, padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>讀取中...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 340px) 1fr', gap: '20px', alignItems: 'start' }}>
          {/* 左：主項目 */}
          <div style={{ ...card, padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <Layers size={18} color="#0891b2" />
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: 'var(--text-main)' }}>主項目</h3>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 700 }}>({groups.length})</span>
            </div>

            <form onSubmit={handleAddGroup} style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
              <input
                type="text"
                value={newGroup.name}
                onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
                placeholder="主項目名稱，例如：BLACKCORE 出機檢查"
                aria-label="主項目名稱"
                style={inputStyle}
              />
              <div style={{ display: 'flex', gap: '6px' }}>
                <select
                  value={newGroup.brand}
                  onChange={(e) => setNewGroup({ ...newGroup, brand: e.target.value })}
                  aria-label="適用廠牌"
                  style={inputStyle}
                >
                  <option value="">不指定廠牌（通用）</option>
                  {brands.map((b) => (
                    <option key={b.id || b.name} value={b.name}>{b.name}</option>
                  ))}
                </select>
                <button
                  type="submit"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '0 14px', borderRadius: '8px', border: 'none', backgroundColor: '#0891b2', color: '#fff', fontWeight: 800, fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  <Plus size={15} /> 新增
                </button>
              </div>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '520px', overflowY: 'auto' }}>
              {groups.length === 0 ? (
                <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  還沒有任何主項目，請先於上方新增。
                </div>
              ) : groups.map((g) => {
                const active = g.id === selectedGroupId;
                const isEditing = editingGroup?.id === g.id;
                return (
                  <div
                    key={g.id}
                    style={{
                      padding: '10px 12px', borderRadius: '10px',
                      border: active ? '2px solid var(--primary-color)' : '1px solid var(--border-color)',
                      backgroundColor: active ? 'var(--primary-bg, rgba(37, 99, 235, 0.08))' : 'var(--bg-surface-subtle)',
                      cursor: isEditing ? 'default' : 'pointer',
                    }}
                    onClick={() => { if (!isEditing) setSelectedGroupId(g.id); }}
                  >
                    {isEditing ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <input
                          type="text"
                          value={editingGroup.name}
                          onChange={(e) => setEditingGroup({ ...editingGroup, name: e.target.value })}
                          style={inputStyle}
                          aria-label="修改主項目名稱"
                          autoFocus
                        />
                        <select
                          value={editingGroup.brand || ''}
                          onChange={(e) => setEditingGroup({ ...editingGroup, brand: e.target.value })}
                          style={inputStyle}
                          aria-label="修改適用廠牌"
                        >
                          <option value="">不指定廠牌（通用）</option>
                          {brands.map((b) => (<option key={b.id || b.name} value={b.name}>{b.name}</option>))}
                        </select>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button type="button" onClick={handleSaveGroup} style={iconBtn('#10b981')} title="儲存" aria-label="儲存主項目"><Check size={14} /></button>
                          <button type="button" onClick={() => setEditingGroup(null)} style={iconBtn('var(--text-muted)')} title="取消" aria-label="取消修改主項目"><X size={14} /></button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '14px', fontWeight: 900, color: active ? 'var(--primary-color)' : 'var(--text-main)', wordBreak: 'break-word' }}>
                            {g.name}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                            <span style={{
                              fontSize: '11px', fontWeight: 800, padding: '1px 8px', borderRadius: '10px',
                              backgroundColor: g.brand ? 'rgba(8, 145, 178, 0.14)' : 'var(--bg-surface)',
                              color: g.brand ? '#0891b2' : 'var(--text-muted)',
                              border: '1px solid var(--border-color)',
                            }}>
                              {g.brand || '通用'}
                            </span>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>
                              主要 {g.main_count} · 細項 {g.detail_count}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setEditingGroup({ id: g.id, name: g.name, brand: g.brand || '' }); }}
                          style={iconBtn('#f59e0b')}
                          title="修改主項目"
                          aria-label={`修改主項目 ${g.name}`}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleDeleteGroup(g); }}
                          style={iconBtn('#ef4444')}
                          title="刪除主項目"
                          aria-label={`刪除主項目 ${g.name}`}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 右：兩組平行清單 */}
          <div>
            <div style={{ marginBottom: '12px', fontSize: '14px', color: 'var(--text-muted)' }}>
              {selectedGroup ? (
                <>目前編輯：<b style={{ color: 'var(--text-main)' }}>{selectedGroup.name}</b>
                  <span style={{ marginLeft: '8px', fontSize: '12px' }}>（{selectedGroup.brand || '通用'}）</span>
                </>
              ) : '請先於左側選擇或新增主項目'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
              {renderItemColumn(KIND_MAIN)}
              {renderItemColumn(KIND_DETAIL)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChecklistTemplates;
