import React, { useState, useEffect, useCallback } from 'react';
import { ArrowDownToLine, Search, Filter, Eye, RefreshCw, AlertCircle, Trash2, Calendar, Hash, FileText, Plus, Edit2, Save, X, Clock, FileCheck, CheckCircle } from 'lucide-react';
import { logUpdate, logDelete, logSnChange, logStatusChange } from '../utils/auditLogger';
import InboundRegistrationModal from '../components/InboundRegistrationModal';
import { usePageSize } from '../utils/usePageSize';
import { buildSnRenameSteps, validateSnRename, summariseSnRename } from '../utils/snRename';
import {
  validateQtyChange, buildQtyChangeSteps, isQtyEditable,
  findUsedAssets, describeUsage, buildInboundDeleteSteps,
  collectMasterIds, describeOrphanMaster,
  isDraftOrder, buildInboundConfirmSteps, findSnConflicts, collectAssetSns,
} from '../utils/inboundEdit';
import PageSizeSelector from '../components/common/PageSizeSelector';

const InboundList = ({ isSplitMode = false }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchField, setSearchField] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  // 兩段式，與出貨單相同：建立的單先放「已建立 (待確認)」，確認進貨後才入庫、移到歷史紀錄
  const [activeTab, setActiveTab] = useState('PENDING');
  const [isConfirming, setIsConfirming] = useState(false);

  const searchOptions = [
    { value: 'all', label: '全部欄位' },
    { value: 'order_no', label: '進貨單號' },
    { value: 'partner', label: '供應商' },
    { value: 'invoice_no', label: '發票號碼' }
  ];

  const [inboundRecords, setInboundRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderItems, setOrderItems] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [partners, setPartners] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  // 進貨時序號打錯，直接在明細上改；相關單據與掛載關係會一起帶過去
  const [snEdit, setSnEdit] = useState(null); // { itemId, value }
  const [snSaving, setSnSaving] = useState(false);
  // 數量打錯原本只能整張單刪掉重開（而且得上伺服器跑腳本）。
  // 數量與庫存要一起改，因此走同一個交易。
  const [qtyEdit, setQtyEdit] = useState(null); // { itemId, value }
  const [qtySaving, setQtySaving] = useState(false);
  // 待確認的單可以改備註（還沒有資產，記在明細上；確認進貨時寫進資產）
  const [remarksEdit, setRemarksEdit] = useState(null); // { itemId, value }
  const [remarksSaving, setRemarksSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // 整張單一次填寫訂單來源。這一欄存在資產上，逐筆到硬體列表改八十次不切實際。
  const [orderSourceInput, setOrderSourceInput] = useState('');
  const [orderSourceSaving, setOrderSourceSaving] = useState(false);
  const [editData, setEditData] = useState({ partner_id: '', invoice_no: '', attachments: [] });
  const [previewFile, setPreviewFile] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, searchField, startDate, endDate, activeTab]);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, partnersRes] = await Promise.all([
        window.electronAPI.namedQuery('fetchInboundList'),
        window.electronAPI.namedQuery('fetchSuppliers')
      ]);
      
      if (partnersRes.success) {
        setPartners(partnersRes.rows);
      }
      
      if (res.success) {
        setInboundRecords(res.rows || []);
      } else {
        setError('無法讀取進貨清單：' + (res.error || '未知錯誤'));
      }
    } catch (err) {
      console.error('Fetch inbound list error:', err);
      setError('伺服器連線異常，請檢查是否正常啟動。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const handleViewDetails = async (order, editMode = false) => {
    setSelectedOrder(order);
    setIsModalOpen(true);
    setIsEditing(editMode);
    
    let parsedAttachments = [];
    try {
       parsedAttachments = typeof order.attachments === 'string' ? JSON.parse(order.attachments || '[]') : (order.attachments || []);
    } catch { /* 失敗就沿用預設值 */ }
    
    setEditData({
      partner_id: order.partner_id || '',
      invoice_no: order.invoice_no || '',
      // 舊資料可能沒有 order_date，退回建檔當天，日期欄位才不會是空的
      order_date: (order.effective_date || order.order_date || order.created_at || '').toString().slice(0, 10),
      attachments: parsedAttachments
    });
    setIsDetailLoading(true);
    try {
      const res = await window.electronAPI.namedQuery('fetchInboundItems', [order.id]);
      if (res.success) {
        setOrderItems(res.rows);
      } else {
        alert('無法讀取進貨明細：' + res.error);
      }
    } catch (err) {
      console.error('Fetch details error:', err);
      alert('讀取進貨明細失敗');
    } finally {
      setIsDetailLoading(false);
    }
  };

  const handleFileUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    try {
      const newAttachments = [...editData.attachments];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const buffer = await file.arrayBuffer();
        const res = await window.electronAPI.saveFile(file.name, buffer);
        if (res.success) {
          newAttachments.push({ originalName: file.name, fileName: res.fileName, type: file.type });
        } else {
          alert('上傳失敗: ' + res.error);
        }
      }
      setEditData(prev => ({ ...prev, attachments: newAttachments }));
    } catch (err) {
      console.error(err);
      alert('上傳發生錯誤');
    } finally {
      e.target.value = '';
    }
  };

  const removeAttachment = (index) => {
    const newAtt = [...editData.attachments];
    newAtt.splice(index, 1);
    setEditData(prev => ({ ...prev, attachments: newAtt }));
  };

  const getMediaSrc = (fileName) => {
    const rawUrl = `erp-media:///${encodeURIComponent(fileName)}`;
    return window.getMediaUrl ? window.getMediaUrl(rawUrl) : rawUrl;
  };

  /** 這張單有幾筆對得到資產、其中幾筆已經有訂單來源 */
  const orderSourceStats = orderItems.reduce((acc, it) => {
    if (!it.sn) return acc;
    acc.withSn += 1;
    if (it.order_source) acc.filled += 1;
    return acc;
  }, { withSn: 0, filled: 0 });

  /**
   * 整張進貨單一次填寫訂單來源。
   *
   * 預設只補還沒填的；已經有值的要覆蓋得再確認一次，
   * 免得手一滑把整張單先前的內容蓋掉。
   */
  const handleBulkOrderSource = async () => {
    const value = orderSourceInput.trim();
    if (!value) { alert('請先輸入訂單來源'); return; }

    const { withSn, filled } = orderSourceStats;
    const empty = withSn - filled;
    let overwrite = false;

    if (empty === 0 && filled > 0) {
      overwrite = window.confirm(
        `這張單的 ${filled} 筆都已經有訂單來源了。\n\n要全部改成「${value}」嗎？`
      );
      if (!overwrite) return;
    } else if (!window.confirm(
      `要把這張單 ${empty} 筆還沒填的訂單來源設為「${value}」嗎？`
      + (filled > 0 ? `\n\n已經有值的 ${filled} 筆會保持原樣。` : '')
    )) return;

    setOrderSourceSaving(true);
    try {
      // 待確認的單還沒有資產，訂單來源記在明細上，確認進貨時才寫進資產
      const res = await window.electronAPI.namedQuery(
        isDraftOrder(selectedOrder) ? 'updateDraftInboundOrderSource' : 'updateOrderSourceByInboundOrder',
        [selectedOrder.id, value, overwrite]);
      if (!res.success) throw new Error(res.error || '未知錯誤');
      const changed = res.rows?.length || 0;

      logUpdate(
        'INBOUND', selectedOrder?.order_no, selectedOrder?.partner_name || '進貨單',
        `統一填寫訂單來源「${value}」，共 ${changed} 筆`,
        { orderNo: selectedOrder?.order_no, orderSource: value, changed, overwrite }
      );

      alert(changed > 0
        ? `已將 ${changed} 筆的訂單來源設為「${value}」。`
        : '沒有需要更新的項目（可能都已經填過，或明細沒有對應的資產）。');

      setOrderSourceInput('');
      const itemsRes = await window.electronAPI.namedQuery('fetchInboundItems', [selectedOrder.id]);
      if (itemsRes.success) setOrderItems(itemsRes.rows);
    } catch (e) {
      alert(`填寫失敗：${e.message}`);
    } finally {
      setOrderSourceSaving(false);
    }
  };

  /**
   * 更正明細上的序號。
   *
   * 序號被資產本身、掛載關係與進出貨／維修單據各自以字串記著，
   * 因此整組放在同一個交易裡；資產那一步改不到就整批退回，
   * 不會只改掉單據、留下對不上的資產。
   */
  /**
   * 更正進貨明細的數量。
   *
   * 明細與庫存必須一起改，否則會出現「單據寫 10、庫存卻是 100」。
   * 兩步都放在同一個交易並要求改到一列，任何一步落空就整批退回。
   */
  const handleSaveQty = async (item) => {
    const check = validateQtyChange(item.quantity, qtyEdit?.value);
    if (check.error) { alert(check.error); return; }
    if (check.unchanged) { setQtyEdit(null); return; }

    const name = [item.brand, item.model].filter(Boolean).join(' ') || '此品項';
    const word = check.delta > 0 ? `增加 ${check.delta}` : `減少 ${Math.abs(check.delta)}`;
    // 待確認的單還沒入庫，只改單據，庫存要等確認進貨才加
    const draft = isDraftOrder(selectedOrder);
    if (!window.confirm(
      `確定把「${name}」的數量從 ${item.quantity} 改成 ${check.next} 嗎？\n\n`
      + (draft
        ? '這張單還沒確認進貨，庫存不受影響。\n'
        : `庫存會同步${word}。\n`
          + (check.delta < 0 ? '若這些貨已經領用出去，庫存最低只會扣到 0。\n' : ''))
      + '\n此動作會記錄在事件紀錄中。'
    )) return;

    setQtySaving(true);
    try {
      const res = await window.electronAPI.runTransaction(buildQtyChangeSteps({
        itemId: item.id,
        itemMasterId: item.item_id,
        nextQty: check.next,
        delta: check.delta,
        draft,
      }));
      if (!res.success) throw new Error(res.error || '更正失敗');

      await logUpdate(
        'INBOUND',
        selectedOrder?.order_no,
        name,
        `更正進貨數量 [${name}] ${item.quantity} → ${check.next}${draft ? '（待確認，庫存未變動）' : `（庫存同步${word}）`}`,
        // itemMasterId 是給品項履歷用的：履歷靠它把這筆更正接回那個品項，
        // 否則單號底下記了也不會出現在品項自己的履歷裡
        { orderNo: selectedOrder?.order_no, itemMasterId: item.item_id, itemId: item.id,
          from: item.quantity, to: check.next, delta: check.delta }
      );

      setQtyEdit(null);
      const itemsRes = await window.electronAPI.namedQuery('fetchInboundItems', [selectedOrder.id]);
      if (itemsRes.success) setOrderItems(itemsRes.rows);
      fetchRecords();
    } catch (err) {
      alert('更正失敗：' + err.message);
    } finally {
      setQtySaving(false);
    }
  };

  /**
   * 刪除整張進貨單。
   *
   * 規則與 scripts/delete-inbound-order.mjs 相同 —— 那支腳本原本是唯一的途徑，
   * 但得登入伺服器才能用。會一併還原：入庫加上的庫存、採購單的已入庫數量與
   * 狀態、該單建立的資產。
   *
   * 這批貨若已經流出去（出貨、維修、借測，或有硬體掛在上面）就一律拒絕 ——
   * 那該走退貨或報廢，不是把進貨紀錄抹掉。
   */
  /**
   * 刪完之後，這張單用到的品項可能變成「從來沒真正進過貨」的孤兒 ——
   * 進貨頁的快速新增會在建立單據時一起建出主檔，單子刪了它還留在列表上。
   * 不自動刪：品項定義本來就能獨立於單據存在，只是這次很可能是跟著
   * 打錯的單一起建的，因此問一句由使用者決定。回傳實際移除的筆數。
   */
  const offerOrphanMasterCleanup = async (order, items) => {
    let removedMasters = 0;
    const masterIds = collectMasterIds(items);
    if (masterIds.length === 0) return 0;
    const orphanRes = await window.electronAPI.namedQuery('fetchOrphanItemMasters', [masterIds]);
    const orphans = (orphanRes.success && orphanRes.rows) || [];
    if (orphans.length > 0 && window.confirm(
      `進貨單 [${order.order_no}] 已刪除。\n\n`
      + `以下 ${orphans.length} 個品項在刪除後庫存為 0，也沒有任何其他單據用過：\n`
      + orphans.map(describeOrphanMaster).join('\n')
      + '\n\n要一併移除這些品項嗎？\n'
      + '（保留的話它們會繼續留在列表上，庫存 0）'
    )) {
      for (const m of orphans) {
        const del = await window.electronAPI.namedQuery('deleteItemMasterIfOrphan', [m.id]);
        if (del.success && del.rows?.length) removedMasters += 1;
      }
      if (removedMasters > 0) {
        await logDelete(
          'INBOUND', order.order_no, order.partner_name || '進貨單',
          `刪除進貨單 [${order.order_no}] 後一併移除 ${removedMasters} 個未使用品項`,
          { orderNo: order.order_no, removedMasters: orphans.map((m) => m.id) }
        );
      }
    }
    return removedMasters;
  };

  /**
   * 確認進貨：把待確認的單真正入庫（建資產、加庫存、記到採購單），
   * 整批同一個交易。先檢查序號 —— 已經在系統裡的或同一張單重複的，
   * 交易一定失敗，而資料庫的錯誤訊息不會說是哪一支。
   */
  const handleConfirmInbound = async () => {
    const order = selectedOrder;
    if (!order || !isDraftOrder(order)) return;
    if (snEdit || qtyEdit || remarksEdit) { alert('明細還有未儲存的修改，請先儲存或取消。'); return; }

    setIsConfirming(true);
    try {
      const itemsRes = await window.electronAPI.namedQuery('fetchInboundItems', [order.id]);
      if (!itemsRes.success) throw new Error(itemsRes.error || '無法讀取明細');
      const items = itemsRes.rows || [];
      if (items.length === 0) { alert('這張進貨單沒有任何明細，無法確認進貨。'); return; }

      const sns = collectAssetSns(items);
      let existingSns = [];
      if (sns.length > 0) {
        const exRes = await window.electronAPI.namedQuery('fetchExistingAssetSns', [sns]);
        if (!exRes.success) throw new Error(exRes.error || '無法檢查序號');
        existingSns = (exRes.rows || []).map((r) => r.sn);
      }
      const { existing, repeated } = findSnConflicts(items, existingSns);
      if (existing.length > 0 || repeated.length > 0) {
        alert(
          `進貨單 [${order.order_no}] 有序號無法入庫：\n\n`
          + (existing.length > 0 ? `已經在資產列表裡：${existing.join('、')}\n` : '')
          + (repeated.length > 0 ? `這張單重複出現：${repeated.join('、')}\n` : '')
          + '\n請先在明細上更正序號，再確認進貨。'
        );
        return;
      }

      const totalQty = items.reduce((s, it) => s + (parseInt(it.quantity, 10) || 0), 0);
      if (!window.confirm(
        `確認將進貨單 [${order.order_no}] 入庫嗎？\n\n`
        + `共 ${items.length} 項、${totalQty} 個，庫存會加上，設備／硬體會建立資產`
        + (items.some((it) => it.purchase_record_id) ? '，並記到對應的採購單' : '')
        + '。\n\n確認後移到「已進貨 (歷史紀錄)」。'
      )) return;

      const res = await window.electronAPI.runTransaction(buildInboundConfirmSteps({ orderId: order.id, items }));
      if (!res.success) {
        throw new Error((res.error || '確認進貨失敗') + '\n\n所有變更已全部退回，庫存與單據狀態維持原樣。');
      }

      await logStatusChange(
        'INBOUND', order.order_no, order.partner_name || '進貨單',
        'DRAFT', 'COMPLETED',
        `進貨單 [${order.order_no}] 確認進貨並完成入庫（${items.length} 項、${totalQty} 個）`,
        { orderNo: order.order_no, itemsCount: items.length,
          items: items.map((i) => ({ itemMasterId: i.item_id, brand: i.brand, model: i.model, sn: i.sn, qty: i.quantity })) }
      );

      alert(`進貨單 [${order.order_no}] 已確認進貨，庫存已加上。`);
      setIsModalOpen(false);
      setSelectedOrder(null);
      fetchRecords();
    } catch (err) {
      alert('確認進貨失敗：\n' + err.message);
    } finally {
      setIsConfirming(false);
    }
  };

  /** 待確認的單修改備註。只改明細；查詢限定 DRAFT，單若剛被確認就改不到 */
  const handleSaveRemarks = async (item) => {
    const next = (remarksEdit?.value || '').trim();
    if (next === (item.remarks || '').trim()) { setRemarksEdit(null); return; }
    setRemarksSaving(true);
    try {
      const res = await window.electronAPI.runTransaction([{
        queryName: 'updateDraftInboundItemRemarks',
        params: [item.id, next],
        expectRows: 1,
        errorMessage: '這張進貨單已經不是待確認狀態（可能剛被確認進貨），請重新整理後再操作',
      }]);
      if (!res.success) throw new Error(res.error || '儲存失敗');
      const name = [item.brand, item.model].filter(Boolean).join(' ') || '品項';
      logUpdate(
        'INBOUND', selectedOrder?.order_no, selectedOrder?.partner_name || '進貨單',
        `修改待確認進貨單的備註 [${name}${item.sn ? ` ${item.sn}` : ''}]：${item.remarks || '（空白）'} → ${next || '（空白）'}`,
        { orderNo: selectedOrder?.order_no, itemId: item.id, sn: item.sn || null, from: item.remarks || null, to: next || null, draft: true }
      );
      setRemarksEdit(null);
      const itemsRes = await window.electronAPI.namedQuery('fetchInboundItems', [selectedOrder.id]);
      if (itemsRes.success) setOrderItems(itemsRes.rows);
    } catch (e) {
      alert(`儲存備註失敗：${e.message}`);
    } finally {
      setRemarksSaving(false);
    }
  };

  const handleDeleteOrder = async (order) => {
    setDeleting(true);
    try {
      const itemsRes = await window.electronAPI.namedQuery('fetchInboundItems', [order.id]);
      if (!itemsRes.success) throw new Error(itemsRes.error || '無法讀取明細');
      const items = itemsRes.rows || [];

      // 待確認的單還沒入庫：沒加庫存、沒建資產、沒動採購單，刪掉單據就好
      if (isDraftOrder(order)) {
        if (!window.confirm(
          `確定要刪除待確認的進貨單 [${order.order_no}] 嗎？此動作無法復原。\n\n`
          + '這張單還沒確認進貨，庫存、資產與採購單都不受影響。'
        )) return;
        const res = await window.electronAPI.runTransaction([{
          queryName: 'deleteDraftInboundOrder',
          params: [order.id],
          expectRows: 1,
          errorMessage: '這張進貨單已經不是待確認狀態（可能剛被確認進貨），請重新整理後再操作',
        }]);
        if (!res.success) throw new Error(res.error || '刪除失敗');
        await logDelete(
          'INBOUND', order.order_no, order.partner_name || '進貨單',
          `刪除待確認的進貨單 [${order.order_no}]（尚未入庫，庫存未變動）`,
          { orderNo: order.order_no, items: items.length, draft: true }
        );
        const removedMasters = await offerOrphanMasterCleanup(order, items);
        alert(`進貨單 [${order.order_no}] 已刪除。`
          + (removedMasters > 0 ? `\n並移除 ${removedMasters} 個未使用的品項。` : ''));
        setIsModalOpen(false);
        setSelectedOrder(null);
        fetchRecords();
        return;
      }

      const assetSns = items.map((i) => (i.sn || '').trim()).filter(Boolean);

      if (assetSns.length > 0) {
        const usageRes = await window.electronAPI.namedQuery('fetchInboundAssetUsage', [assetSns]);
        if (!usageRes.success) throw new Error(usageRes.error || '無法確認資產是否已被動用');
        const used = findUsedAssets(usageRes.rows);
        if (used.length > 0) {
          alert(
            `無法刪除進貨單 [${order.order_no}]：以下資產已經被動用過。\n\n`
            + used.map(describeUsage).join('\n')
            + '\n\n這代表這批貨已經流出去了，請改走退貨或報廢流程。'
          );
          return;
        }
      }

      const qtyLines = items
        .map((i) => `　· ${[i.brand, i.model].filter(Boolean).join(' ') || '品項'} ×${i.quantity}`)
        .join('\n');
      if (!window.confirm(
        `確定要刪除進貨單 [${order.order_no}] 嗎？此動作無法復原。\n\n`
        + `會一併還原：\n`
        + `　· 入庫時加上的庫存\n${qtyLines}\n`
        + `　· 該單建立的資產 ${assetSns.length} 筆\n`
        + `　· 來自採購單的已入庫數量與狀態\n`
      )) return;

      const res = await window.electronAPI.runTransaction(
        buildInboundDeleteSteps({ orderId: order.id, items, assetSns })
      );
      if (!res.success) throw new Error(res.error || '刪除失敗');

      await logDelete(
        'INBOUND', order.order_no, order.partner_name || '進貨單',
        `刪除進貨單 [${order.order_no}]（已扣回庫存、退回採購數量、刪除 ${assetSns.length} 筆資產）`,
        { orderNo: order.order_no, items: items.length, assets: assetSns.length }
      );

      // 單號底下那一筆進不了任何一個品項的履歷。這張單扣回了誰的庫存，
      // 就替誰各記一筆，打開該品項的履歷才看得出這次進貨被整張刪掉。
      await Promise.all(items.map((it) => logDelete(
        'INBOUND', order.order_no, [it.brand, it.model].filter(Boolean).join(' ') || '品項',
        `進貨單 [${order.order_no}] 整張刪除，扣回 ${[it.brand, it.model].filter(Boolean).join(' ')} ${it.quantity} ${it.unit || ''}`.trim(),
        { itemMasterId: it.item_id, orderNo: order.order_no, quantity: it.quantity, sn: it.sn || null }
      )));

      const removedMasters = await offerOrphanMasterCleanup(order, items);

      alert(`進貨單 [${order.order_no}] 已刪除，庫存與採購數量已還原。`
        + (removedMasters > 0 ? `\n並移除 ${removedMasters} 個未使用的品項。` : ''));
      setSelectedOrder(null);
      fetchRecords();
    } catch (err) {
      alert('刪除失敗：' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveSn = async (item) => {
    const oldSn = (item.sn || '').trim();
    const newSn = (snEdit?.value || '').trim();
    const invalid = validateSnRename(oldSn, newSn);
    if (invalid) { alert(invalid); return; }

    // 待確認的單還沒有資產，也還沒有其他單據用到這支序號，只改這一筆明細
    if (isDraftOrder(selectedOrder)) {
      setSnSaving(true);
      try {
        const res = await window.electronAPI.runTransaction([{
          queryName: 'updateDraftInboundItemSn',
          params: [item.id, newSn],
          expectRows: 1,
          errorMessage: '這張進貨單已經不是待確認狀態（可能剛被確認進貨），請重新整理後再操作',
        }]);
        if (!res.success) throw new Error(res.error || '更正失敗');
        logUpdate(
          'INBOUND', selectedOrder?.order_no, selectedOrder?.partner_name || '進貨單',
          `更正待確認進貨單的序號 [${oldSn}] → [${newSn}]`,
          { orderNo: selectedOrder?.order_no, oldSn, newSn, draft: true }
        );
        setSnEdit(null);
        const itemsRes = await window.electronAPI.namedQuery('fetchInboundItems', [selectedOrder.id]);
        if (itemsRes.success) setOrderItems(itemsRes.rows);
      } catch (e) {
        alert(`更正序號失敗：${e.message}`);
      } finally {
        setSnSaving(false);
      }
      return;
    }

    if (!window.confirm(`確定要把序號 [${oldSn}] 改成 [${newSn}] 嗎？\n\n資產本身、掛載關係，以及進貨／出貨／維修單上的這個序號都會一起更新。`)) return;

    setSnSaving(true);
    try {
      const res = await window.electronAPI.runTransaction(buildSnRenameSteps(oldSn, newSn));
      if (!res.success) throw new Error(res.error || '更正失敗');

      // 回報實際改了哪些地方 —— 只說「成功」的話，使用者無從判斷
      // 其他單據到底有沒有一起變更
      const { text, assetChanged } = summariseSnRename(res.results);
      alert(assetChanged
        ? `序號已更正為 [${newSn}]。

已一併更新：${text}`
        : `序號已更正為 [${newSn}]。

已一併更新：${text}

請注意：資產列表中沒有序號 [${oldSn}] 的資料，`
          + '這次只更正了單據。該筆入庫當初可能建成了別的序號，請到資產列表另行確認。');

      logUpdate(
        'INBOUND',
        selectedOrder?.order_no,
        selectedOrder?.partner_name || '進貨單',
        `更正序號 [${oldSn}] → [${newSn}]（資產、掛載關係與相關單據一併更新）`,
        { orderNo: selectedOrder?.order_no, oldSn, newSn }
      );

      // 上面那筆記在進貨單名下，品項履歷是用序號接回資產的，接不到。
      // 資產真的被改到時，另外記一筆在新序號名下，那台設備的履歷才看得見。
      if (assetChanged) {
        await logSnChange(
          'DEVICE', oldSn, newSn, selectedOrder?.order_no || '進貨單',
          `於進貨單明細 [${selectedOrder?.order_no || ''}] 更正`,
          { orderNo: selectedOrder?.order_no }
        );
      }

      setSnEdit(null);
      const itemsRes = await window.electronAPI.namedQuery('fetchInboundItems', [selectedOrder.id]);
      if (itemsRes.success) setOrderItems(itemsRes.rows);
    } catch (e) {
      alert(`更正序號失敗：${e.message}`);
    } finally {
      setSnSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedOrder) return;
    setIsSaving(true);
    try {
      const res = await window.electronAPI.namedQuery('updateInboundOrderHeader', [
        editData.partner_id || null, 
        editData.invoice_no || null, 
        JSON.stringify(editData.attachments),
        selectedOrder.id,
        editData.order_date || null
      ]);
      if (res.success) {
        logUpdate(
          'INBOUND',
          selectedOrder.order_no,
          selectedOrder.partner_name || '進貨單',
          `修改進貨單 [${selectedOrder.order_no}] 進貨日期/發票/供應商/附件`,
          { orderNo: selectedOrder.order_no, orderDate: editData.order_date, partnerId: editData.partner_id, invoiceNo: editData.invoice_no, attachmentsCount: editData.attachments.length }
        );
        alert('儲存成功！');
        setIsEditing(false);
        fetchRecords();
        setSelectedOrder(prev => ({
           ...prev,
           partner_id: editData.partner_id,
           invoice_no: editData.invoice_no,
           order_date: editData.order_date,
           effective_date: editData.order_date,
           attachments: JSON.stringify(editData.attachments),
           // 清空供應商時要一併清掉顯示的名稱，不能沿用舊值
           partner_name: editData.partner_id
             ? (partners.find(p => p.id.toString() === editData.partner_id.toString())?.name || prev.partner_name)
             : null
        }));
      } else {
        alert('儲存失敗：' + res.error);
      }
    } catch {
      alert('發生錯誤');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredRecords = inboundRecords.filter(order => {
    // 與出貨單相同：待確認一個頁籤，其餘（已進貨）是歷史紀錄
    if (activeTab === 'PENDING' ? !isDraftOrder(order) : isDraftOrder(order)) return false;

    // 沒打關鍵字時不比對文字，但日期區間照樣要套用
    // （先前沒打字就直接 return true，日期篩選形同無效）
    const search = searchTerm.toLowerCase();

    const orderNo = (order.order_no || '').toLowerCase();
    const partner = (order.partner_name || '').toLowerCase();
    const invoice = (order.invoice_no || '').toLowerCase();

    let matchSearch = true;
    if (!search) {
      matchSearch = true;
    } else if (searchField === 'all') {
      matchSearch = orderNo.includes(search) || partner.includes(search) || invoice.includes(search);
    } else if (searchField === 'order_no') {
      matchSearch = orderNo.includes(search);
    } else if (searchField === 'partner') {
      matchSearch = partner.includes(search);
    } else if (searchField === 'invoice_no') {
      matchSearch = invoice.includes(search);
    }

    if (!matchSearch) return false;

    if (startDate || endDate) {
      const orderDate = new Date(order.created_at);
      orderDate.setHours(0, 0, 0, 0);
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        if (orderDate < start) return false;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(0, 0, 0, 0);
        if (orderDate > end) return false;
      }
    }
    return true;
  });

  const sortedAndFiltered = [...filteredRecords]
  const pendingCount = inboundRecords.filter(isDraftOrder).length;
  const historyCount = inboundRecords.length - pendingCount;

  const [itemsPerPage, setItemsPerPage] = usePageSize('inbound_list', 10);
  const totalPages = Math.ceil(sortedAndFiltered.length / itemsPerPage) || 1;
  const currentRecords = sortedAndFiltered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    // 外框、標題列與卡片的間距與出貨單列表相同（page-container / page-header / card-surface），
    // 兩頁切換時版面才不會跳動
    <div className="page-container" style={isSplitMode ? { padding: 0, minHeight: 'auto', backgroundColor: 'transparent' } : {}}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--page-title-margin, 14px)', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 'var(--page-title-size, 1.35rem)', fontWeight: '900', margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-main)' }}>
              <ArrowDownToLine size={24} color="#10b981" />
              進貨單列表(Stock in List)
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '2px', marginBottom: 0 }}>
              追查所有入庫單據明細、核銷與對帳關聯。
            </p>
          </div>
          {!isSplitMode && (
            <div style={{ display: 'flex', backgroundColor: 'var(--bg-surface-subtle)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
              <button
                onClick={() => setShowAddModal(true)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#10b981',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)'
                }}
              >
                <Plus size={18} /> 新增進貨單
              </button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{ backgroundColor: 'var(--bg-surface)', padding: '8px 16px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', gap: '16px', boxShadow: 'var(--card-shadow)' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>待確認進貨單</div>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#f97316' }}>
                <span data-testid="inbound-pending-count">{pendingCount}</span> <span style={{ fontSize: '0.8rem', fontWeight: 400, opacity: 0.8 }}>單</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card-surface" style={{ padding: '0', overflow: 'hidden', borderRadius: 'var(--card-radius, 14px)' }}>
        {/* 兩大頁籤，與出貨單列表一致 */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface-subtle)' }}>
          <button
            onClick={() => setActiveTab('PENDING')}
            data-testid="inbound-tab-pending"
            style={{
              padding: '10px 18px',
              border: 'none',
              backgroundColor: activeTab === 'PENDING' ? 'var(--bg-surface)' : 'transparent',
              borderBottom: activeTab === 'PENDING' ? '3px solid #3b82f6' : '3px solid transparent',
              color: activeTab === 'PENDING' ? '#3b82f6' : 'var(--text-muted)',
              fontWeight: activeTab === 'PENDING' ? 800 : 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Clock size={16} /> 已建立 (待確認)
            {pendingCount > 0 && (
              <span style={{ backgroundColor: '#3b82f6', color: '#fff', padding: '1px 6px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 800 }}>
                {pendingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('HISTORY')}
            data-testid="inbound-tab-history"
            style={{
              padding: '10px 18px',
              border: 'none',
              backgroundColor: activeTab === 'HISTORY' ? 'var(--bg-surface)' : 'transparent',
              borderBottom: activeTab === 'HISTORY' ? '3px solid #10b981' : '3px solid transparent',
              color: activeTab === 'HISTORY' ? '#10b981' : 'var(--text-muted)',
              fontWeight: activeTab === 'HISTORY' ? 800 : 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <FileCheck size={16} /> 已進貨 (歷史紀錄)
            {historyCount > 0 && (
              <span style={{ backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-muted)', padding: '1px 6px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 800, border: '1px solid var(--border-color)' }}>
                {historyCount}
              </span>
            )}
          </button>
        </div>

        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '12px', alignItems: 'center', backgroundColor: 'var(--bg-surface-subtle)', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1, flexWrap: 'wrap' }}>
            <select
              value={searchField}
              onChange={e => setSearchField(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--input-border)', outline: 'none', fontSize: '0.88rem', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', cursor: 'pointer', minWidth: '120px' }}
            >
              {searchOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            <div style={{ position: 'relative', width: '280px' }}>
              <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
              <input
                type="text"
                placeholder={`搜尋${searchOptions.find(o => o.value === searchField)?.label}...`}
                style={{ width: '100%', padding: '8px 10px 8px 36px', borderRadius: '8px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', outline: 'none', fontSize: '0.88rem', boxSizing: 'border-box' }}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)' }}>
              <Calendar size={16} color="var(--text-subtle)" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{ border: 'none', outline: 'none', fontSize: '0.85rem', color: 'var(--text-main)', background: 'transparent' }}
              />
              <span style={{ color: 'var(--text-subtle)' }}>-</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{ border: 'none', outline: 'none', fontSize: '0.85rem', color: 'var(--text-main)', background: 'transparent' }}
              />
            </div>
          </div>
        </div>

        <div style={{ padding: '16px' }}>
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', backgroundColor: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '8px', marginBottom: '14px' }}>
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 280px)', minHeight: '300px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 4, backgroundColor: 'var(--table-header-bg)' }}>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--border-color)', backgroundColor: 'var(--table-header-bg)' }}>
                  <th style={{ padding: 'var(--table-cell-padding-y, 8px) var(--table-cell-padding-x, 10px)', fontSize: '0.88rem', color: 'var(--table-header-text)', fontWeight: 800, position: 'sticky', top: 0, zIndex: 4, backgroundColor: 'var(--table-header-bg)', boxShadow: '0 1px 0 var(--border-color)' }}>進貨單號</th>
                  <th style={{ padding: 'var(--table-cell-padding-y, 8px) var(--table-cell-padding-x, 10px)', fontSize: '0.88rem', color: 'var(--table-header-text)', fontWeight: 800, position: 'sticky', top: 0, zIndex: 4, backgroundColor: 'var(--table-header-bg)', boxShadow: '0 1px 0 var(--border-color)' }}>進貨日期</th>
                  <th style={{ padding: 'var(--table-cell-padding-y, 8px) var(--table-cell-padding-x, 10px)', fontSize: '0.88rem', color: 'var(--table-header-text)', fontWeight: 800, position: 'sticky', top: 0, zIndex: 4, backgroundColor: 'var(--table-header-bg)', boxShadow: '0 1px 0 var(--border-color)' }}>建立時間</th>
                  <th style={{ padding: 'var(--table-cell-padding-y, 8px) var(--table-cell-padding-x, 10px)', fontSize: '0.88rem', color: 'var(--table-header-text)', fontWeight: 800, position: 'sticky', top: 0, zIndex: 4, backgroundColor: 'var(--table-header-bg)', boxShadow: '0 1px 0 var(--border-color)' }}>供應商</th>
                  <th style={{ padding: 'var(--table-cell-padding-y, 8px) var(--table-cell-padding-x, 10px)', fontSize: '0.88rem', color: 'var(--table-header-text)', fontWeight: 800, position: 'sticky', top: 0, zIndex: 4, backgroundColor: 'var(--table-header-bg)', boxShadow: '0 1px 0 var(--border-color)' }}>發票號碼</th>
                  <th style={{ padding: 'var(--table-cell-padding-y, 8px) var(--table-cell-padding-x, 10px)', fontSize: '0.88rem', color: 'var(--table-header-text)', fontWeight: 800, position: 'sticky', top: 0, zIndex: 4, backgroundColor: 'var(--table-header-bg)', boxShadow: '0 1px 0 var(--border-color)' }}>項目數</th>
                  <th style={{ padding: 'var(--table-cell-padding-y, 8px) var(--table-cell-padding-x, 10px)', fontSize: '0.88rem', color: 'var(--table-header-text)', fontWeight: 800, position: 'sticky', top: 0, zIndex: 4, backgroundColor: 'var(--table-header-bg)', boxShadow: '0 1px 0 var(--border-color)' }}>建立者</th>
                  <th style={{ padding: 'var(--table-cell-padding-y, 8px) var(--table-cell-padding-x, 10px)', fontSize: '0.88rem', color: 'var(--table-header-text)', fontWeight: 800, position: 'sticky', top: 0, zIndex: 4, backgroundColor: 'var(--table-header-bg)', boxShadow: '0 1px 0 var(--border-color)' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>讀取中...</td></tr>
                ) : currentRecords.length === 0 ? (
                  <tr><td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    {activeTab === 'PENDING' ? '目前尚無待確認的進貨單' : '目前尚無已進貨的歷史紀錄'}
                  </td></tr>
                ) : currentRecords.map(order => (
                  <tr key={order.id} className="row-hover" style={{ borderBottom: '1px solid var(--table-border)', color: 'var(--text-main)' }}>
                    <td style={{ padding: '12px', fontWeight: 700, color: 'var(--text-main)' }}>{order.order_no}</td>
                    <td style={{ padding: '12px', color: 'var(--text-main)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {(order.effective_date || order.order_date || order.created_at || '').toString().slice(0, 10)}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{new Date(order.created_at).toLocaleString()}</td>
                    <td style={{ padding: '12px', color: order.partner_name ? 'var(--text-main)' : 'var(--text-subtle)', fontWeight: 600 }}>{order.partner_name || '待補填'}</td>
                    <td style={{ padding: '12px', color: order.invoice_no ? 'var(--text-main)' : 'var(--text-subtle)' }}>{order.invoice_no || '--'}</td>
                    <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-block', minWidth: '28px', textAlign: 'center', padding: '2px 8px', borderRadius: '10px', backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-main)', fontWeight: 700, fontSize: '0.85rem' }}>
                        {Number(order.item_count) || 0}
                      </span>
                    </td>
                    {/* 舊單據沒有記錄建立者，回填不了，顯示為 － */}
                    <td style={{ padding: '12px', color: order.creator_name ? 'var(--text-muted)' : 'var(--text-subtle)', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                      {order.creator_name || '－'}
                    </td>
                    <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', whiteSpace: 'nowrap' }}>
                        <button
                          onClick={() => handleViewDetails(order, false)}
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', padding: 0, backgroundColor: 'var(--primary-bg)', color: 'var(--primary-color)', border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: '6px', cursor: 'pointer', flexShrink: 0 }}
                          title="查看進貨明細"
                          aria-label="查看進貨明細"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => handleViewDetails(order, true)}
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', padding: 0, backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '6px', cursor: 'pointer', flexShrink: 0 }}
                          title="編輯進貨單"
                          aria-label="編輯進貨單"
                        >
                          <Edit2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', gap: '12px', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface-subtle)', flexWrap: 'wrap' }}>
              <PageSizeSelector pageSize={itemsPerPage} onChange={(newSize) => { setItemsPerPage(newSize); setCurrentPage(1); }} />
              {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    style={{ padding: '6px 14px', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: currentPage === 1 ? 'var(--bg-surface-subtle)' : 'var(--bg-surface)', color: currentPage === 1 ? 'var(--text-subtle)' : 'var(--text-main)', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
                  >
                    上一頁
                  </button>
                  <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    {currentPage} <span style={{ color: 'var(--text-subtle)', margin: '0 4px' }}>/</span> {totalPages}
                  </span>
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    style={{ padding: '6px 14px', border: '1px solid var(--border-color)', borderRadius: '6px', backgroundColor: currentPage === totalPages ? 'var(--bg-surface-subtle)' : 'var(--bg-surface)', color: currentPage === totalPages ? 'var(--text-subtle)' : 'var(--text-main)', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
                  >
                    下一頁
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {isModalOpen && selectedOrder && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'var(--bg-modal-overlay)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '16px', width: '88vw', maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: 'var(--modal-shadow)' }}>
            <div style={{ padding: '24px 32px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ margin: '0 0 8px 0', fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <FileText size={24} color="#059669" />
                  進貨單明細：{selectedOrder.order_no}
                  {isEditing && <span style={{fontSize: '0.9rem', color: '#16a34a', backgroundColor: 'rgba(22, 163, 74, 0.15)', padding: '4px 8px', borderRadius: '6px'}}>編輯模式</span>}
                  {isDraftOrder(selectedOrder) && (
                    <span data-testid="inbound-draft-badge" style={{ fontSize: '0.9rem', color: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.12)', padding: '4px 8px', borderRadius: '6px' }}>
                      待確認・尚未入庫
                    </span>
                  )}
                </h2>
                <div style={{ display: 'flex', gap: '20px', color: 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 500 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Calendar size={14} /> 進貨日期：{(selectedOrder.effective_date || selectedOrder.order_date || selectedOrder.created_at || '').toString().slice(0, 10)}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>建立時間：{new Date(selectedOrder.created_at).toLocaleString()}</span>
                  {!isEditing && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><FileText size={14} /> 供應商：{selectedOrder.partner_name || '待補填'}</span>}
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{ padding: '8px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                ✕ 關閉
              </button>
            </div>

            <div style={{ padding: '32px', overflowY: 'auto' }}>
              {isEditing ? (
                 <div style={{ marginBottom: '24px', display: 'flex', gap: '16px', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', gap: '16px' }}>
                       <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, color: 'var(--text-muted)' }} htmlFor="edit-inbound-date">進貨日期</label>
                          <input
                            id="edit-inbound-date"
                            type="date"
                            value={editData.order_date || ''}
                            onChange={e => setEditData({ ...editData, order_date: e.target.value })}
                            style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', outline: 'none' }}
                          />
                       </div>
                       <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, color: 'var(--text-muted)' }}>發票號碼</label>
                          <input type="text" value={editData.invoice_no} onChange={e => setEditData({...editData, invoice_no: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', outline: 'none' }} />
                       </div>
                       <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, color: 'var(--text-muted)' }}>供應商</label>
                          <select value={editData.partner_id} onChange={e => setEditData({...editData, partner_id: e.target.value})} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', outline: 'none' }}>
                            <option value="">-- 尚未確認 --</option>
                            {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                       </div>
                    </div>
                    <div>
                       <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, color: 'var(--text-muted)' }}>附件管理</label>
                       <div style={{ padding: '16px', border: '2px dashed var(--border-color)', borderRadius: '12px', backgroundColor: 'var(--bg-surface-subtle)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                         <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                           {editData.attachments.map((att, index) => (
                             <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px', boxShadow: 'var(--card-shadow)' }}>
                               {att.type?.startsWith('image/') ? (
                                  <img src={getMediaSrc(att.fileName)} alt={att.originalName} style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer' }} onClick={() => setPreviewFile(att)} />
                               ) : (
                                  <div style={{ width: '40px', height: '40px', backgroundColor: 'var(--bg-surface-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', cursor: 'pointer' }} onClick={() => setPreviewFile(att)}>
                                     <FileText size={20} color="var(--text-muted)" />
                                  </div>
                               )}
                               <div style={{ flex: 1, minWidth: 0 }}>
                                 <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '150px' }} title={att.originalName}>{att.originalName}</div>
                               </div>
                               <button onClick={() => removeAttachment(index)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}>
                                 <Trash2 size={16} />
                               </button>
                             </div>
                           ))}
                         </div>
                         <div>
                           <label style={{ display: 'inline-block', padding: '8px 16px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-main)', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer' }}>
                             + 新增附件
                             <input type="file" multiple style={{ display: 'none' }} onChange={handleFileUpload} />
                           </label>
                         </div>
                       </div>
                    </div>
                 </div>
              ) : (
                 <div style={{ marginBottom: '24px' }}>
                    <h3 style={{ fontSize: '1.1rem', color: 'var(--text-main)', marginBottom: '12px' }}>附件清單</h3>
                    {(() => {
                        let atts = [];
                        try {
                           atts = typeof selectedOrder.attachments === 'string' ? JSON.parse(selectedOrder.attachments || '[]') : (selectedOrder.attachments || []);
                        } catch { /* 失敗就沿用預設值 */ }
                        
                        if (atts.length === 0) {
                            return <div style={{ color: 'var(--text-subtle)' }}>無附件</div>;
                        }
                        return (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                              {atts.map((att, index) => (
                                 <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                                   {att.type?.startsWith('image/') ? (
                                      <img src={getMediaSrc(att.fileName)} alt={att.originalName} style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer' }} onClick={() => setPreviewFile(att)} />
                                   ) : (
                                      <div style={{ width: '40px', height: '40px', backgroundColor: 'var(--bg-surface-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', cursor: 'pointer' }} onClick={() => setPreviewFile(att)}>
                                         <FileText size={20} color="var(--text-muted)" />
                                      </div>
                                   )}
                                   <div style={{ flex: 1, minWidth: 0 }}>
                                     <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '150px' }} title={att.originalName}>{att.originalName}</div>
                                   </div>
                                 </div>
                              ))}
                            </div>
                        );
                    })()}
                 </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
                <h3 style={{ fontSize: '1.1rem', color: 'var(--text-main)', margin: 0 }}>進貨項目</h3>
                {/* 訂單來源存在資產上，逐筆到硬體列表改不切實際；整張單一次填 */}
                {orderSourceStats.withSn > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      訂單來源 已填 {orderSourceStats.filled} / {orderSourceStats.withSn}
                    </span>
                    <input
                      type="text"
                      value={orderSourceInput}
                      onChange={(e) => setOrderSourceInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleBulkOrderSource(); } }}
                      placeholder="例如：PO-2026-001"
                      aria-label="統一填寫訂單來源"
                      style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', fontSize: '0.85rem', width: '180px', outline: 'none' }}
                    />
                    <button
                      type="button"
                      onClick={handleBulkOrderSource}
                      disabled={orderSourceSaving || !orderSourceInput.trim()}
                      title="把這張進貨單的訂單來源一次填寫完成"
                      style={{
                        padding: '6px 12px', borderRadius: '6px', border: 'none', whiteSpace: 'nowrap',
                        backgroundColor: (orderSourceSaving || !orderSourceInput.trim()) ? 'var(--border-color)' : 'var(--primary-color)',
                        color: '#fff', fontSize: '0.8rem', fontWeight: 700,
                        cursor: (orderSourceSaving || !orderSourceInput.trim()) ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {orderSourceSaving ? '填寫中…' : '統一填寫'}
                    </button>
                  </div>
                )}
              </div>
              {isDetailLoading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>正在載入進貨明細資料...</div>
              ) : orderItems.length > 0 ? (
                <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'var(--table-header-bg)', borderBottom: '2px solid var(--border-color)' }}>
                        {/* 來源採購單、類別放最前面，一眼分出是哪張採購單、設備／硬體／耗材 */}
                        <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--table-header-text)', fontSize: '0.9rem' }}>來源採購單</th>
                        <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--table-header-text)', fontSize: '0.9rem' }}>類別</th>
                        {/* 類型、廠牌、型號分開三欄，誰打錯一眼就看得出來 */}
                        <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--table-header-text)', fontSize: '0.9rem' }}>類型</th>
                        <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--table-header-text)', fontSize: '0.9rem' }}>廠牌</th>
                        <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--table-header-text)', fontSize: '0.9rem' }}>型號</th>
                        <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--table-header-text)', fontSize: '0.9rem' }}>規格</th>
                        <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--table-header-text)', fontSize: '0.9rem' }}>硬體序號 (S/N)</th>
                        <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--table-header-text)', fontSize: '0.9rem' }}>訂單來源</th>
                        <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--table-header-text)', fontSize: '0.9rem' }}>備註</th>
                        <th style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 700, color: 'var(--table-header-text)', fontSize: '0.9rem' }}>數量</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderItems.map((item, idx) => (
                        <tr key={item.id} style={{ borderBottom: idx === orderItems.length - 1 ? 'none' : '1px solid var(--table-border)' }}>
                          <td style={{ padding: '16px', verticalAlign: 'top', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                            {item.po_order_no || '無 (非採購入庫)'}
                          </td>
                          <td style={{ padding: '16px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                            <span style={{ padding: '4px 8px', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                              {item.category_name || '未分類'}
                            </span>
                          </td>
                          {[['type', item.type], ['brand', item.brand], ['model', item.model]].map(([key, value]) => (
                            <td
                              key={key}
                              data-testid={`inbound-item-${key}-${item.id}`}
                              style={{ padding: '16px', verticalAlign: 'top', fontWeight: 600, color: value ? 'var(--text-main)' : 'var(--text-subtle)' }}
                            >
                              {value || '-'}
                            </td>
                          ))}
                          <td style={{ padding: '16px', verticalAlign: 'top', fontSize: '0.85rem', color: item.specification ? 'var(--text-main)' : 'var(--text-subtle)' }} data-testid={`inbound-item-spec-${item.id}`}>
                            {item.specification || '-'}
                          </td>
                          <td style={{ padding: '16px', verticalAlign: 'top' }}>
                            {!item.sn ? (
                              <span style={{ color: 'var(--text-subtle)', fontSize: '0.85rem' }}>-</span>
                            ) : snEdit?.itemId === item.id ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <input
                                  type="text"
                                  value={snEdit.value}
                                  onChange={(e) => setSnEdit({ itemId: item.id, value: e.target.value })}
                                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveSn(item); } }}
                                  aria-label={`更正序號 ${item.sn}`}
                                  autoFocus
                                  style={{ fontFamily: 'monospace', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', outline: 'none', width: '180px' }}
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveSn(item)}
                                  disabled={snSaving}
                                  aria-label="儲存序號"
                                  style={{ padding: '6px 10px', borderRadius: '6px', border: 'none', backgroundColor: snSaving ? 'var(--border-color)' : '#16a34a', color: '#fff', fontWeight: 700, fontSize: '0.8rem', cursor: snSaving ? 'wait' : 'pointer' }}
                                >
                                  {snSaving ? '儲存中' : '儲存'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setSnEdit(null)}
                                  aria-label="取消更正序號"
                                  style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-muted)', fontSize: '0.8rem', cursor: 'pointer' }}
                                >
                                  取消
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#16a34a', backgroundColor: 'rgba(22, 163, 74, 0.15)', padding: '4px 8px', borderRadius: '6px' }}>{item.sn}</span>
                                <button
                                  type="button"
                                  onClick={() => setSnEdit({ itemId: item.id, value: item.sn })}
                                  title={isDraftOrder(selectedOrder) ? '更正序號（尚未入庫，只改這一筆明細）' : '更正序號（資產、掛載關係與相關單據會一起更新）'}
                                  aria-label={`更正序號 ${item.sn}`}
                                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px', padding: 0, borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: '#f59e0b', cursor: 'pointer' }}
                                >
                                  <Edit2 size={13} />
                                </button>
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '16px', verticalAlign: 'top', fontSize: '0.85rem' }}>
                            {/* 沒有序號的明細對不到資產，本來就不會有訂單來源 */}
                            {!item.sn
                              ? <span style={{ color: 'var(--text-subtle)' }}>-</span>
                              : item.order_source
                                ? <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{item.order_source}</span>
                                : <span style={{ color: '#d97706' }}>未填</span>}
                          </td>
                          {/* 備註：待確認的單可以改，確認進貨時寫進資產；已進貨的到硬體／設備列表改 */}
                          <td style={{ padding: '16px', verticalAlign: 'top', fontSize: '0.85rem', minWidth: '140px' }} data-testid={`inbound-item-remarks-${item.id}`}>
                            {remarksEdit?.itemId === item.id ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <input
                                  type="text"
                                  value={remarksEdit.value}
                                  onChange={(e) => setRemarksEdit({ itemId: item.id, value: e.target.value })}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Escape') setRemarksEdit(null);
                                    if (e.key === 'Enter') { e.preventDefault(); handleSaveRemarks(item); }
                                  }}
                                  aria-label={`備註內容 ${[item.brand, item.model].filter(Boolean).join(' ')}`}
                                  autoFocus
                                  style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', outline: 'none', width: '160px', fontSize: '0.85rem' }}
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveRemarks(item)}
                                  disabled={remarksSaving}
                                  aria-label="儲存備註"
                                  style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 6px', borderRadius: '6px', border: 'none', cursor: remarksSaving ? 'wait' : 'pointer', backgroundColor: remarksSaving ? 'var(--border-color)' : '#16a34a', color: '#fff' }}
                                >
                                  <Save size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRemarksEdit(null)}
                                  aria-label="取消修改備註"
                                  style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 6px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-muted)', cursor: 'pointer' }}
                                >
                                  <X size={13} />
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ color: item.remarks ? 'var(--text-main)' : 'var(--text-subtle)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{item.remarks || '-'}</span>
                                {isDraftOrder(selectedOrder) && (
                                  <button
                                    type="button"
                                    onClick={() => setRemarksEdit({ itemId: item.id, value: item.remarks || '' })}
                                    title="修改備註（確認進貨時會寫進資產）"
                                    aria-label={`修改備註 ${[item.brand, item.model].filter(Boolean).join(' ')}`}
                                    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', padding: 0, flexShrink: 0, borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: '#f59e0b', cursor: 'pointer' }}
                                  >
                                    <Edit2 size={11} />
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                          {/* 數量可就地更正。有序號的（設備／硬體）不給改 ——
                              一支序號就是一台，改數字不會多出或少掉一台資產，
                              只會讓單據與實際資產對不起來。 */}
                          <td style={{ padding: '16px', textAlign: 'center', verticalAlign: 'top', fontWeight: 800, color: 'var(--text-main)' }}>
                            {qtyEdit?.itemId === item.id ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                                <input
                                  type="number"
                                  min="1"
                                  value={qtyEdit.value}
                                  onChange={(e) => setQtyEdit({ itemId: item.id, value: e.target.value })}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Escape') setQtyEdit(null);
                                    if (e.key === 'Enter') { e.preventDefault(); handleSaveQty(item); }
                                  }}
                                  aria-label={`修改數量 ${[item.brand, item.model].filter(Boolean).join(' ')}`}
                                  autoFocus
                                  style={{
                                    width: '72px', padding: '4px 6px', borderRadius: '6px', textAlign: 'center',
                                    border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)',
                                    color: 'var(--input-text)', fontSize: '0.9rem', outline: 'none',
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveQty(item)}
                                  disabled={qtySaving}
                                  aria-label="儲存數量"
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', padding: '4px 6px',
                                    borderRadius: '6px', border: 'none', cursor: qtySaving ? 'wait' : 'pointer',
                                    backgroundColor: qtySaving ? 'var(--border-color)' : '#16a34a', color: '#fff',
                                  }}
                                >
                                  <Save size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setQtyEdit(null)}
                                  aria-label="取消修改數量"
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', padding: '4px 6px',
                                    borderRadius: '6px', border: '1px solid var(--border-color)',
                                    backgroundColor: 'var(--bg-surface)', color: 'var(--text-muted)', cursor: 'pointer',
                                  }}
                                >
                                  <X size={13} />
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                                <span>{item.quantity}</span>
                                {isQtyEditable(item) && (
                                  <button
                                    type="button"
                                    onClick={() => setQtyEdit({ itemId: item.id, value: String(item.quantity ?? '') })}
                                    title={isDraftOrder(selectedOrder) ? '更正數量（尚未入庫，庫存不受影響）' : '更正數量（庫存會同步調整）'}
                                    aria-label={`修改數量 ${[item.brand, item.model].filter(Boolean).join(' ')}`}
                                    style={{
                                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                      width: '22px', height: '22px', padding: 0, flexShrink: 0,
                                      borderRadius: '6px', border: '1px solid var(--border-color)',
                                      backgroundColor: 'var(--bg-surface)', color: '#f59e0b', cursor: 'pointer',
                                    }}
                                  >
                                    <Edit2 size={11} />
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '12px' }}>
                  此查詢單據無可顯示之有效明細或資料已被移除。
                </div>
              )}
            </div>

            <div style={{ padding: '20px 32px', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface-subtle)', display: 'flex', justifyContent: 'space-between', gap: '12px', borderBottomLeftRadius: '16px', borderBottomRightRadius: '16px' }}>
              {/* 刪除整張進貨單。規則與 scripts/delete-inbound-order.mjs 相同，
                  但不必登入伺服器。已動用過的貨會被擋下來。 */}
              <button
                onClick={() => handleDeleteOrder(selectedOrder)}
                disabled={deleting || !selectedOrder}
                title={isDraftOrder(selectedOrder) ? '刪除這張待確認的進貨單（尚未入庫，庫存不受影響）' : '刪除整張進貨單，並還原庫存、採購數量與該單建立的資產'}
                style={{
                  padding: '10px 20px', borderRadius: '8px',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  backgroundColor: 'rgba(239, 68, 68, 0.08)', color: '#ef4444',
                  fontWeight: 700, cursor: deleting ? 'wait' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: '8px',
                }}
              >
                <Trash2 size={16} /> {deleting ? '刪除中...' : '刪除進貨單'}
              </button>
              <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{ padding: '10px 24px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, color: 'var(--text-main)' }}
              >
                關閉視窗
              </button>
              {isDraftOrder(selectedOrder) && !isEditing && (
                <button
                  onClick={handleConfirmInbound}
                  disabled={isConfirming || isDetailLoading}
                  style={{ padding: '10px 24px', backgroundColor: '#3b82f6', border: 'none', borderRadius: '8px', cursor: isConfirming ? 'wait' : 'pointer', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px', opacity: isConfirming ? 0.7 : 1 }}
                >
                  <CheckCircle size={18} /> {isConfirming ? '處理中...' : '確認進貨'}
                </button>
              )}
              {isEditing && (
                 <button
                   onClick={handleSaveEdit}
                   disabled={isSaving}
                   style={{ padding: '10px 24px', backgroundColor: '#10b981', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}
                 >
                   <Save size={18} /> {isSaving ? '儲存中...' : '儲存變更'}
                 </button>
              )}
              </div>
            </div>
          </div>
        </div>
      )}
      {previewFile && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'var(--bg-modal-overlay)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100, backdropFilter: 'blur(4px)' }} onClick={() => setPreviewFile(null)}>
          <div style={{ backgroundColor: 'var(--bg-surface)', color: 'var(--text-main)', border: '1px solid var(--border-color)', boxShadow: 'var(--modal-shadow)', padding: '16px', borderRadius: '12px', maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, color: 'var(--text-main)' }}>預覽附件：{previewFile.originalName}</h3>
              <button onClick={() => setPreviewFile(null)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: 'var(--text-muted)' }}>&times;</button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center' }}>
              {previewFile.type?.startsWith('image/') ? (
                <img src={getMediaSrc(previewFile.fileName)} alt={previewFile.originalName} style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }} />
              ) : previewFile.type === 'application/pdf' ? (
                <iframe src={getMediaSrc(previewFile.fileName)} style={{ width: '80vw', height: '70vh', border: 'none' }} title={previewFile.originalName} />
              ) : (
                <div style={{ padding: '40px', color: 'var(--text-muted)' }}>此檔案類型不支援預覽，請下載後檢視。</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 新增進貨入庫 Modal */}
      <InboundRegistrationModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        // 新建的單是待確認，切回那個頁籤才看得到
        onSuccess={() => { setActiveTab('PENDING'); fetchRecords(); }}
      />

      <style>{`
        .btn-refresh-vibrant {
          padding: 8px 16px;
          border-radius: 9999px;
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: white;
          font-weight: 700;
          font-size: 0.95rem;
          display: flex;
          align-items: center;
          gap: 8px;
          border: none;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
        }
        .btn-refresh-vibrant:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 16px rgba(16, 185, 129, 0.4);
        }
        .btn-refresh-vibrant:active {
          transform: translateY(1px);
        }
        .btn-refresh-vibrant:disabled {
          opacity: 0.7;
          cursor: not-allowed;
          transform: none;
        }
        .spin-animation {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
        .row-hover:hover {
          background-color: var(--table-row-hover);
        }
      `}</style>
    </div>
  );
};

export default InboundList;
