import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Search, Columns3, Edit2, X, Save, MoreHorizontal, MoreVertical, MapPin, User, Trash2, CheckCircle, ShoppingBag, Wrench, ShieldAlert, Cpu, Archive, RotateCcw, Server, Send, History, Building2, Info, RefreshCw, Plus } from 'lucide-react';
import ItemLedgerModal from '../components/ItemLedgerModal';
import DeviceRegistrationModal from '../components/DeviceRegistrationModal';
import RmaReplacementModal from '../components/RmaReplacementModal';
import { logUpdate, logDelete, logStatusChange } from '../utils/auditLogger';
import { usePageSize } from '../utils/usePageSize';
import PageSizeSelector from '../components/common/PageSizeSelector';
import { isItemRetired, getItemAggregationKey, aggregateCards, computeNewRetiredKeys } from '../utils/cardAggregation';
import ColumnVisibilityModal from '../components/ColumnVisibilityModal';
import { useColumnPreferences } from '../hooks/useColumnPreferences';

// 設備列表的欄位清單：id 對應表格的每一欄，always 代表不可隱藏
const DEVICE_COLUMNS = [
  { id: 'brand', label: '廠牌 / 型號 / 類型', always: true },
  { id: 'sn', label: '序號 (SN)' },
  { id: 'spec', label: '規格 (Spec)' },
  { id: 'project', label: '專案編號/名稱 (Project)' },
  { id: 'hostname', label: '主機名稱' },
  { id: 'components', label: '搭載硬體' },
  { id: 'client', label: '客戶' },
  { id: 'end_user', label: 'End-user' },
  { id: 'location', label: '位置' },
  { id: 'remarks', label: '備註' },
  { id: 'warranty', label: '保固資訊 (P/S/W/C)' },
  { id: 'status', label: '狀態' },
  { id: 'actions', label: '功能', always: true },
];

const DeviceList = ({ isSplitMode = false }) => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [customers, setCustomers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [activeMenuId, setActiveMenuId] = useState(null); 
  const [menuPosition, setMenuPosition] = useState(null);
  const brandFilter = searchParams.get('brand');
  const [selectedCardKey, setSelectedCardKey] = useState(null);
  const [aggregationMode, setAggregationMode] = useState(() => {
    return localStorage.getItem('device_aggregation_mode') || 'SPEC';
  });
  const [retiredKeys, setRetiredKeys] = useState(() => {
    const saved = localStorage.getItem('device_list_retired_keys');
    return saved ? JSON.parse(saved) : [];
  });

  const handleAggregationModeChange = (mode) => {
    setAggregationMode(mode);
    localStorage.setItem('device_aggregation_mode', mode);
    setSelectedCardKey(null);
  };
  
  // 當側邊欄分類變動時，清除搜尋關鍵字與選取卡片
  useEffect(() => {
    setSearchTerm('');
    setSelectedCardKey(null);
    setActiveMenuId(null);
    setMenuPosition(null);
  }, [brandFilter]);

  // 監聽外部點擊與視窗滾動以關閉選單
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (activeMenuId && !e.target.closest('.dropdown-action-menu') && !e.target.closest('.action-menu-btn')) {
        setActiveMenuId(null);
        setMenuPosition(null);
      }
    };
    const handleScroll = () => {
      if (activeMenuId) {
        setActiveMenuId(null);
        setMenuPosition(null);
      }
    };
    window.addEventListener('click', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('click', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [activeMenuId]);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = usePageSize('device_list', 10);

  // 自訂顯示欄位（每位使用者各自儲存）
  const [showColumnModal, setShowColumnModal] = useState(false);
  const { isVisible, toggle: toggleColumn, showAll: showAllColumns, hiddenCount } = useColumnPreferences('deviceListColumns', DEVICE_COLUMNS);
  // 隱藏的欄位直接不佔版面，表格就會變窄、不必左右捲動
  const hideCol = (id) => (isVisible(id) ? null : { display: 'none' });

  const [editItem, setEditItem] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState({ show: false, msg: '', onConfirm: null });
  const [expandedItems, setExpandedItems] = useState({}); // 控制摺疊狀態
  const [expandedLabItems, setExpandedLabItems] = useState({}); // 控制 LAB 耗材摺疊
  const [ledgerItem, setLedgerItem] = useState(null); // 品項履歷 Modal
  const [rmaAsset, setRmaAsset] = useState(null); // 原廠換新 RMA Modal
  const [availableHardwares, setAvailableHardwares] = useState([]); // 可供掛載之硬體清單
  const [showHwDropdown, setShowHwDropdown] = useState(false); // 控制硬體下拉選單

  const statusConfig = {
    ACTIVE: { label: '在庫', color: '#047857', bgColor: '#dcfce7', borderColor: '#bbf7d0' },
    REPAIRING: { label: '異常/維修中', color: '#fa8c16', bgColor: '#fff7e6', borderColor: '#ffd591' },
    PENDING_SCRAP: { label: '停用/待報廢', color: '#595959', bgColor: '#f5f5f5', borderColor: '#d9d9d9' },
    SCRAPPED: { label: '已報廢', color: '#f5222d', bgColor: '#fff1f0', borderColor: '#ffccc7' },
    SHIPPED: { label: '已出貨', color: '#1d4ed8', bgColor: '#dbeafe', borderColor: '#bfdbfe' },
    LENT: { label: '借出/借用', color: '#b45309', bgColor: '#fef3c7', borderColor: '#fde68a' }
  };

  const fetchAssets = useCallback(async () => {
    setLoading(true);
    let res = brandFilter 
      ? await window.electronAPI.namedQuery('fetchAssetsListByBrand', [brandFilter])
      : await window.electronAPI.namedQuery('fetchAssetsList');
    
    if (res.success) setItems(res.rows);
    setLoading(false);
  }, [brandFilter]);

  const fetchCustomers = useCallback(async () => {
    const res = await window.electronAPI.namedQuery('fetchCustomers');
    if (res.success) setCustomers(res.rows);
  }, []);

  const fetchProjects = useCallback(async () => {
    const res = await window.electronAPI.namedQuery('fetchActiveProjects');
    if (res.success) setProjects(res.rows);
  }, []);

  useEffect(() => {
    const initPage = async () => {
      setCurrentPage(1);
      await Promise.all([fetchAssets(), fetchCustomers(), fetchProjects()]);
    };
    initPage();
  }, [fetchAssets, fetchCustomers, fetchProjects]);


  const handleEditClick = (item) => {
    const f = { ...item };
    f._origSn = (f.sn || '').trim();
    f._origModel = f.model || '';
    f._origSpec = f.specification || '';
    f._origComponents = Array.isArray(f.components) ? f.components : [];
    
    let attrs = {};
    try { attrs = typeof f.custom_attributes === 'string' ? JSON.parse(f.custom_attributes) : (f.custom_attributes || {}); } catch { attrs = {}; }
    f.custom_attributes = attrs;

    const compSns = f._origComponents.map(c => c.sn).filter(Boolean);
    const attrSns = (attrs.mounted_hw_sns || '')
      .split(/[,，\s\n]+/)
      .map(s => s.trim())
      .filter(Boolean);
    const allHwSns = Array.from(new Set([...compSns, ...attrSns]));
    f._origMountedHwSns = [...allHwSns];
    f.mounted_hw_sns = allHwSns.join(', ');

    f.ownership = f.ownership || 'FOR_SALE';
    ['installed_date', 'customer_warranty_expire', 'system_date', 'warranty_expire'].forEach(k => {
      if (f[k]) {
        try { f[k] = new Date(f[k]).toISOString().split('T')[0]; } catch { f[k] = ''; }
      } else { f[k] = ''; }
    });
    f.end_user = f.end_user || attrs.end_user || '';
    f.contact_person = attrs.contact_person || f.partner_contact || '';
    f.contact_phone = attrs.contact_phone || f.partner_phone || '';
    setEditItem(f);
    setShowEditModal(true);
    setShowHwDropdown(false);
    setActiveMenuId(null);

    // 取得可供掛載之硬體清單
    if (window.electronAPI && typeof window.electronAPI.namedQuery === 'function') {
      window.electronAPI.namedQuery('fetchAvailableHardwares').then(res => {
        if (res && res.success && Array.isArray(res.rows)) {
          setAvailableHardwares(res.rows);
        }
      }).catch(err => console.error('fetchAvailableHardwares error:', err));
    }
  };

  const handleUpdateOwnership = async (id, sn, newOwnership, label) => {
    if (!window.confirm(`確定要將設備 [${sn || id}] 的資產歸屬變更為「${label}」嗎？`)) return;
    const res = await window.electronAPI.namedQuery('updateAssetOwnership', [newOwnership, id]);
    if (res.success) {
      logUpdate('DEVICE', sn || id, '設備', `變更設備資產歸屬為「${label}」`, { id, sn, newOwnership, label });
      window.dispatchEvent(new CustomEvent('db-update'));
      setActiveMenuId(null);
      fetchAssets();
    } else {
      alert('變更資產歸屬失敗：' + (res.error || '未知錯誤'));
    }
  };

  const handleDelete = async (id, sn) => {
    const targetItem = items.find(i => i.id === id);
    const displayName = sn || (targetItem ? `${targetItem.brand || ''} ${targetItem.model || ''}`.trim() : id);
    
    // 檢查是否有搭載硬體
    let mountedSns = [];
    if (targetItem) {
      let attrs = {};
      try { attrs = typeof targetItem.custom_attributes === 'string' ? JSON.parse(targetItem.custom_attributes) : (targetItem.custom_attributes || {}); } catch {}
      const attrSns = (attrs.mounted_hw_sns || '').split(/[,，\s\n]+/).map(s => s.trim()).filter(Boolean);
      const compSns = (targetItem.components || []).map(c => c.sn).filter(Boolean);
      mountedSns = Array.from(new Set([...attrSns, ...compSns]));
    }

    const confirmMsg = mountedSns.length > 0
      ? `【提醒】設備 [${displayName}] 目前搭載有 ${mountedSns.length} 件硬體零組件 [${mountedSns.join(', ')}]！\n確認刪除將會一併解除這些硬體的伺服器綁定記錄。確定要刪除此設備嗎？`
      : `確定要刪除設備 [${displayName}] 嗎？`;

    if (!window.confirm(confirmMsg)) return;

    // 解除搭載硬體對此伺服器的綁定
    if (mountedSns.length > 0) {
      for (const hwSn of mountedSns) {
        try {
          await window.electronAPI.namedQuery('unbindHardwareServerSn', [hwSn]);
        } catch (e) {
          console.error(`[unbindHardwareServerSn] 刪除設備時解除硬體綁定失敗 (${hwSn}):`, e);
        }
      }
    }

    const res = await window.electronAPI.namedQuery('deleteAsset', [id]);
    if (res && res.success) {
      logDelete('DEVICE', sn || id, '設備', `刪除設備紀錄 [${displayName}]`, { id, sn, unmountedHardwares: mountedSns });
      setActiveMenuId(null);
      fetchAssets();
    } else {
      alert('刪除設備失敗：' + (res?.error || '未知錯誤'));
    }
  };

  const handleUpdateStatus = async (id, sn, newStatus, label) => {
    if (!window.confirm(`確定要變更為「${label}」嗎？`)) return;
    const res = await window.electronAPI.namedQuery('updateAssetStatus', [newStatus, id]);
    if (res.success) {
      logStatusChange('DEVICE', sn || id, '設備', '舊狀態', newStatus, `變更設備 [${sn || id}] 狀態為「${label}」`, { id, sn, newStatus, label });
      if (sn && (newStatus === 'ACTIVE' || newStatus === 'SHIPPED')) {
        const hwStatusMap = {
          'ACTIVE': 'ACTIVE',
          'SHIPPED': 'SHIPPED'
        };
        const targetHwStatus = hwStatusMap[newStatus];
        if (targetHwStatus) {
          await window.electronAPI.namedQuery('updateMountedHardwareStatus', [targetHwStatus, sn]);
        }
      }
      window.dispatchEvent(new CustomEvent('db-update'));
      setActiveMenuId(null);
      fetchAssets();
    }
  };

  const handleUpdate = async () => {
    if (!editItem) return;

    const newModel = (editItem.model || '').trim();
    const newSpec = (editItem.specification || '').trim();
    const newSn = (editItem.sn || '').trim();
    const origSn = (editItem._origSn || '').trim();
    const isSnChanged = newSn !== origSn;

    if (!newModel) {
      alert('請輸入型號 (Model)！');
      return;
    }

    // 序號防重檢查
    if (isSnChanged && newSn) {
      const checkRes = await window.electronAPI.namedQuery('checkAssetSnExistsExcludeSelf', [newSn, editItem.id]);
      if (checkRes.success && checkRes.rows?.length > 0) {
        alert(`序號「${newSn}」已存在於其他設備或資產，請勿重複使用！`);
        return;
      }
    }

    // 解析設定之搭載硬體序號
    const origHwSns = editItem._origMountedHwSns || [];
    const targetHwSns = (editItem.mounted_hw_sns || '')
      .split(/[,，\s\n]+/)
      .map(s => s.trim())
      .filter(Boolean);
    const uniqueTargetHwSns = Array.from(new Set(targetHwSns));

    if (uniqueTargetHwSns.length > 0 && !newSn) {
      alert('請先填寫設備序號 (SN)，方可綁定搭載硬體！');
      return;
    }

    // 驗證填寫之搭載硬體 SN 是否皆已在系統中建檔
    if (uniqueTargetHwSns.length > 0) {
      const notFoundHwSns = [];
      for (const hwSn of uniqueTargetHwSns) {
        // 先檢查當前載入之可用硬體與原設備掛載硬體清單
        const matchedHw = (availableHardwares || []).find(h => (h.sn || '').trim().toLowerCase() === hwSn.toLowerCase()) || 
                          (editItem._origComponents || []).find(c => (c.sn || '').trim().toLowerCase() === hwSn.toLowerCase()) ||
                          origHwSns.find(s => s.trim().toLowerCase() === hwSn.toLowerCase());
        
        if (!matchedHw) {
          // 若快取/原掛載清單中查無，進一步向資料庫查詢確認
          try {
            const checkRes = await window.electronAPI.namedQuery('checkHardwareSnExists', [hwSn.trim()]);
            if (!checkRes || !checkRes.success || !checkRes.rows || checkRes.rows.length === 0) {
              notFoundHwSns.push(hwSn.trim());
            }
          } catch (err) {
            console.error(`[checkHardwareSnExists error] ${hwSn}:`, err);
            notFoundHwSns.push(hwSn.trim());
          }
        }
      }

      if (notFoundHwSns.length > 0) {
        alert(`【警告】以下搭載硬體 SN 尚未在系統中建檔：\n[${notFoundHwSns.join(', ')}]\n\n系統不允許自動建立未登記之硬體 SN！\n請確認硬體序號是否正確，或先至「硬體清單」建立該硬體資產後再進行綁定。`);
        return;
      }
    }

    // 若原設備有掛載硬體且序號發生變更，提示確認連動更新
    const mountedComponents = editItem._origComponents || [];
    if (isSnChanged && origSn && mountedComponents.length > 0) {
      const confirmSync = window.confirm(
        `偵測到本設備目前掛載了 ${mountedComponents.length} 件硬體零組件。\n\n設備序號即將由「${origSn}」變更為「${newSn || '無序號'}」，系統將一併同步更新所有掛載硬體的搭載設備序號。\n\n是否確定變更？`
      );
      if (!confirmSync) return;
    }

    const isModelOrSpecChanged = (newModel !== (editItem._origModel || '')) || (newSpec !== (editItem._origSpec || ''));
    if (isModelOrSpecChanged) {
      let targetMasterId = null;
      const findRes = await window.electronAPI.namedQuery('findItemMaster', [
        newSpec,
        editItem.type || '',
        editItem.brand || '',
        newModel
      ]);

      if (findRes.success && findRes.rows?.length > 0) {
        targetMasterId = findRes.rows[0].id;
      } else {
        const countRes = await window.electronAPI.namedQuery('countAssetsByMasterId', [editItem.item_master_id]);
        const refCount = (countRes.success && countRes.rows?.[0]) ? parseInt(countRes.rows[0].count, 10) : 99;

        if (refCount <= 1) {
          await window.electronAPI.namedQuery('updateItemMasterSpecs', [newSpec, newModel, editItem.item_master_id]);
          targetMasterId = editItem.item_master_id;
        } else {
          const createRes = await window.electronAPI.namedQuery('insertItemMaster', [
            newSpec,
            editItem.type || '',
            editItem.brand || '',
            newModel,
            '台',
            '設備'
          ]);
          if (createRes.success && createRes.rows?.length > 0) {
            targetMasterId = createRes.rows[0].id;
          }
        }
      }

      if (targetMasterId && targetMasterId !== editItem.item_master_id) {
        await window.electronAPI.namedQuery('updateAssetMasterId', [targetMasterId, editItem.id]);
        if (editItem.item_master_id) {
          await window.electronAPI.namedQuery('deleteItemMasterIfOrphan', [editItem.item_master_id]);
        }
      }

      await window.electronAPI.namedQuery('insertDeviceModel', [editItem.brand, newModel, '設備']);
    }

    const updatedCustomAttributes = {
      ...(editItem.custom_attributes || {}),
      end_user: editItem.end_user || '',
      contact_person: editItem.contact_person || '',
      contact_phone: editItem.contact_phone || '',
      mounted_hw_sns: uniqueTargetHwSns.join(', ')
    };
    const res = await window.electronAPI.namedQuery('updateAssetDetails', [
        newSn || null, editItem.client, editItem.hostname, editItem.location, editItem.installed_date || null,
        editItem.customer_warranty_expire || null, editItem.system_date || null, editItem.warranty_expire || null,
        editItem.os, editItem.nic, updatedCustomAttributes, editItem.ownership || 'FOR_SALE', editItem.id,
        editItem.remarks || null
    ]);
    if (res.success) {
      // 若序號有變更，連動更新掛載硬體以及相關明細
      if (isSnChanged && origSn) {
        await window.electronAPI.namedQuery('updateMountedHardwareServerSn', [newSn, origSn]);
        await window.electronAPI.namedQuery('updateRepairItemsSn', [newSn, origSn]);
        await window.electronAPI.namedQuery('updateOutboundItemsSn', [newSn, origSn]);
      }

      // 處理搭載硬體 SN 的連動綁定與解綁
      const toUnbind = origHwSns.filter(sn => !uniqueTargetHwSns.some(t => t.toLowerCase() === sn.toLowerCase()));
      for (const hwSn of toUnbind) {
        try {
          await window.electronAPI.namedQuery('unbindHardwareServerSn', [hwSn.trim()]);
        } catch (err) {
          console.error(`[unbindHardwareServerSn] 解綁失敗 (${hwSn}):`, err);
        }
      }

      const notFoundHwSns = [];
      if (newSn) {
        for (const hwSn of uniqueTargetHwSns) {
          try {
            const bindRes = await window.electronAPI.namedQuery('bindHardwareToServerSn', [
              newSn, 
              hwSn.trim(),
              editItem.client || null,
              editItem.location || null,
              editItem.ownership || 'FOR_SALE'
            ]);
            if (!bindRes || !bindRes.success || (Array.isArray(bindRes.rows) && bindRes.rows.length === 0)) {
              console.error(`[bindHardwareToServerSn] 綁定失敗或查無對應硬體 (${hwSn} -> ${newSn}):`, bindRes?.error);
              notFoundHwSns.push(hwSn);
            }
          } catch (err) {
            console.error(`[bindHardwareToServerSn] 執行異常 (${hwSn} -> ${newSn}):`, err);
            notFoundHwSns.push(hwSn);
          }
        }
      }

      if (notFoundHwSns.length > 0) {
        alert(`【警告】以下搭載硬體 SN 綁定異常（查無已建立之硬體資料）：\n[${notFoundHwSns.join(', ')}]\n\n系統未自動建立未登記之硬體，請確認硬體庫存資料。`);
      }

      logUpdate(
        'DEVICE', 
        newSn || editItem.id, 
        `${editItem.brand || ''} ${editItem.model || ''}`, 
        isSnChanged 
          ? `編輯設備詳細資訊，序號由 [${origSn || '無序號'}] 變更為 [${newSn || '無序號'}]（已同步連動 ${mountedComponents.length} 件掛載硬體）` 
          : `編輯設備詳細資訊 [${newSn || editItem.id}]`, 
        {
          sn: newSn,
          origSn: origSn,
          isSnChanged,
          syncedHardwareCount: mountedComponents.length,
          mountedHwSns: uniqueTargetHwSns,
          client: editItem.client,
          hostname: editItem.hostname,
          location: editItem.location,
          ownership: editItem.ownership,
          os: editItem.os,
          nic: editItem.nic
        }
      );
      setShowEditModal(false);
      window.dispatchEvent(new CustomEvent('db-update'));
      fetchAssets();
    } else {
      alert('儲存失敗：' + (res.error || '未知錯誤'));
    }
  };

  const statusPriority = { 'REPAIRING': 1, 'LENT': 2, 'ACTIVE': 3, 'SHIPPED': 4, 'PENDING_SCRAP': 5, 'SCRAPPED': 6 };

  const sortedItems = items
    .filter(item => {
      if (selectedCardKey) {
        const isTargetRetired = selectedCardKey.endsWith(':::RETIRED');
        const targetKey = isTargetRetired ? selectedCardKey.replace(':::RETIRED', '') : selectedCardKey;
        const itemKey = getItemAggregationKey(item, aggregationMode);
        const itemRetired = isItemRetired(item, retiredKeys);
        if (itemKey !== targetKey || itemRetired !== isTargetRetired) return false;
      }
      const searchTerms = searchTerm.toLowerCase().split(/\s+/).filter(t => t);
      if (searchTerms.length === 0) return true;
      return searchTerms.every(term => {
        let attrs = {};
        try { attrs = typeof item.custom_attributes === 'string' ? JSON.parse(item.custom_attributes) : (item.custom_attributes || {}); } catch {}
        return (item.sn || '').toLowerCase().includes(term) || (item.specification || '').toLowerCase().includes(term) ||
          (item.hostname || '').toLowerCase().includes(term) || (item.brand || '').toLowerCase().includes(term) ||
          (item.model || '').toLowerCase().includes(term) || (item.client || '').toLowerCase().includes(term) ||
          (item.end_user || attrs.end_user || '').toLowerCase().includes(term) ||
          (item.location || '').toLowerCase().includes(term);
      });
    })
    .sort((a, b) => {
      const priorityDiff = (statusPriority[a.status] || 99) - (statusPriority[b.status] || 99);
      if (priorityDiff !== 0) return priorityDiff;
      return (b.id || 0) - (a.id || 0);
    });

  const totalPages = Math.ceil(sortedItems.length / itemsPerPage);
  const paginatedItems = sortedItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const [layoutMap, setLayoutMap] = useState(() => {
    const saved = localStorage.getItem('device_list_layout_map');
    return saved ? JSON.parse(saved) : {};
  });
  const [draggingCardKey, setDraggingCardKey] = useState(null);

  const handleSlotDragOver = (e) => { e.preventDefault(); };
  const handleCardDragStart = (e, key) => { setDraggingCardKey(key); e.dataTransfer.setData('text/plain', key); };

  const handleDropOnSlot = (e, targetSlotIdx) => {
    e.preventDefault();
    const key = e.dataTransfer.getData('text/plain');
    const newMap = { ...layoutMap };
    const oldSlotIdx = Object.keys(newMap).find(k => newMap[k] === key);
    if (oldSlotIdx !== undefined) delete newMap[oldSlotIdx];
    if (newMap[targetSlotIdx]) { if (oldSlotIdx !== undefined) newMap[oldSlotIdx] = newMap[targetSlotIdx]; }
    newMap[targetSlotIdx] = key;
    setLayoutMap(newMap);
    localStorage.setItem('asset_list_layout_map', JSON.stringify(newMap));
    setDraggingCardKey(null);
  };


  const toggleRetire = (e, key, isRetiredParam) => {
    e.stopPropagation();
    const isRetired = isRetiredParam !== undefined ? isRetiredParam : retiredKeys.includes(key);
    const msg = isRetired ? `確定要將此卡片從汰舊區復原嗎？` : `確定要將此卡片移至汰舊區嗎？`;
    
    setConfirmModal({
      show: true,
      msg,
      onConfirm: () => {
        const newRetired = computeNewRetiredKeys(key, isRetired, retiredKeys, aggregationMode);
        setRetiredKeys(newRetired);
        localStorage.setItem('device_list_retired_keys', JSON.stringify(newRetired));
        window.dispatchEvent(new CustomEvent('retired-update'));
        setConfirmModal({ show: false, msg: '', onConfirm: null });
      }
    });
  };

  const handleCardClick = (st) => {
    const cardId = st.isRetired ? `${st.key}:::RETIRED` : st.key;
    if (selectedCardKey === cardId) {
      setSelectedCardKey(null);
    } else {
      setSelectedCardKey(cardId);
    }
    setCurrentPage(1);
  };

  const renderStats = () => {
    const { activeStatsMap, retiredStatsMap } = aggregateCards(items, aggregationMode, retiredKeys);
    const activeKeys = Object.keys(activeStatsMap);
    const retiredList = Object.values(retiredStatsMap);

    if (activeKeys.length === 0 && retiredList.length === 0) return null;

    if (brandFilter || searchTerm || selectedCardKey) {
      const searchTerms = searchTerm.toLowerCase().split(/\s+/).filter(t => t);
      const filterCard = (st) => {
        if (selectedCardKey) {
          const cardId = st.isRetired ? `${st.key}:::RETIRED` : st.key;
          if (cardId !== selectedCardKey) return false;
        }
        if (brandFilter && st.brand !== brandFilter) return false;
        if (searchTerms.length === 0) return true;
        const target = `${st.brand} ${st.type} ${st.model} ${st.specification}`.toLowerCase();
        return searchTerms.every(t => target.includes(t));
      };

      const activeMatches = Object.values(activeStatsMap).filter(filterCard);
      const retiredMatches = Object.values(retiredStatsMap).filter(filterCard);

      return (
        <div style={{ position: 'relative' }}>
          {activeMatches.length > 0 && (
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px', padding: '16px', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
              {activeMatches.map(st => {
                const isSelected = selectedCardKey === st.key;
                return (
                <div 
                  key={st.key}
                  onClick={() => handleCardClick(st)}
                  style={{ 
                    backgroundColor: isSelected ? 'var(--primary-bg, rgba(37, 99, 235, 0.08))' : 'var(--bg-surface)', 
                    padding: '12px 16px', 
                    borderRadius: '12px', 
                    border: isSelected ? '2px solid var(--primary-color)' : '1px solid var(--border-color)', 
                    boxShadow: isSelected ? '0 4px 12px rgba(37, 99, 235, 0.2)' : 'var(--card-shadow)',
                    cursor: 'pointer',
                    minWidth: '220px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    transition: 'all 0.2s',
                    position: 'relative'
                  }}
                >
                  <button onClick={(e) => toggleRetire(e, st.key, false)} style={{ position: 'absolute', top: '8px', right: '8px', border: 'none', background: 'none', color: 'var(--text-subtle)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }} title="將此卡片移至汰舊區">
                    <Archive size={14} />
                  </button>
                  <div style={{ marginBottom: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '14px', fontWeight: '900', color: isSelected ? 'var(--primary-color)' : 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                        <Cpu size={15} color={isSelected ? 'var(--primary-color)' : 'var(--text-muted)'} /> {st.brand}
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: '800', color: isSelected ? 'var(--primary-color)' : 'var(--text-muted)', backgroundColor: 'var(--bg-surface-subtle)', padding: '2px 6px', borderRadius: '6px', marginRight: '20px' }}>
                        共 {st.total} 台
                      </span>
                    </div>
                    {aggregationMode !== 'BRAND' && (
                      <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: '700', marginTop: '2px', paddingLeft: '21px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                        {st.type} - {st.model}
                      </div>
                    )}
                    {aggregationMode === 'SPEC' && st.specification && (
                      <div style={{ color: 'var(--text-subtle)', fontSize: '10px', fontWeight: '500', marginTop: '2px', paddingLeft: '21px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }} title={st.specification}>
                        {st.specification}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px 6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}><span style={{ color: 'var(--text-muted)' }}>在庫</span><span style={{ color: '#16a34a', fontWeight: '800' }}>{st.active}</span></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}><span style={{ color: 'var(--text-muted)' }}>出貨</span><span style={{ color: '#3b82f6', fontWeight: '800' }}>{st.shipped}</span></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}><span style={{ color: 'var(--text-muted)' }}>借出</span><span style={{ color: '#d97706', fontWeight: '800' }}>{st.lent || 0}</span></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}><span style={{ color: 'var(--text-muted)' }}>故障</span><span style={{ color: '#ef4444', fontWeight: '800' }}>{st.repair}</span></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}><span style={{ color: 'var(--text-subtle)', fontWeight: '800' }}>{st.scrapped}</span></div>
                  </div>
                </div>
              );
            })}
          </div>
          )}
          {renderRetiredSection(retiredMatches)}
        </div>
      );
    }

    // 1. 自動清理佈局：移除已不存在於 activeKeys 的幽靈 Key
    const cleanedLayoutMap = {};
    Object.entries(layoutMap).forEach(([idx, key]) => {
      if (activeKeys.includes(key)) cleanedLayoutMap[idx] = key;
    });

    // 2. 檢查是否有漏掉的新 Key 需要加入
    const assignedKeys = Object.values(cleanedLayoutMap);
    const missingKeys = activeKeys.filter(k => !assignedKeys.includes(k));
    
    let currentLayoutMap = cleanedLayoutMap;
    if (missingKeys.length > 0 || Object.keys(cleanedLayoutMap).length !== Object.keys(layoutMap).length) {
      const updatedMap = { ...cleanedLayoutMap };
      let currentIdx = 0;
      missingKeys.forEach(key => {
        while (updatedMap[currentIdx]) currentIdx++;
        updatedMap[currentIdx] = key;
      });
      setLayoutMap(updatedMap);
      localStorage.setItem('device_list_layout_map', JSON.stringify(updatedMap));
      currentLayoutMap = updatedMap;
    }

    // 3. 根據清理後的佈局計算實際需要的行數
    const maxOccupiedIdx = Object.keys(currentLayoutMap).reduce((max, current) => Math.max(max, parseInt(current)), -1);
    const rows = Math.max(1, Math.ceil((maxOccupiedIdx + 1) / 6) + (draggingCardKey ? 1 : 0));
    const SLOTS_COUNT = rows * 6;
    const slots = Array.from({ length: SLOTS_COUNT });

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px', marginBottom: '24px', padding: '16px', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
        {slots.map((_, idx) => {
          const cardKey = currentLayoutMap[idx];
          const st = activeStatsMap[cardKey];
          const isSelected = st && selectedCardKey === st.key;
          return (
            <div key={idx} onDragOver={handleSlotDragOver} onDrop={(e) => handleDropOnSlot(e, idx)} style={{ minHeight: '100px', borderRadius: '12px', border: draggingCardKey ? '1px dashed var(--border-color)' : '1px solid transparent', backgroundColor: draggingCardKey ? 'var(--bg-surface-hover)' : 'transparent', transition: 'all 0.2s' }}>
              {st && (
                <div draggable onDragStart={(e) => handleCardDragStart(e, st.key)} onClick={() => handleCardClick(st)} style={{ backgroundColor: isSelected ? 'var(--primary-bg, rgba(37, 99, 235, 0.08))' : 'var(--bg-surface)', padding: '12px', borderRadius: '12px', border: isSelected ? '2px solid var(--primary-color)' : '1px solid var(--border-color)', boxShadow: isSelected ? '0 4px 12px rgba(37, 99, 235, 0.2)' : 'var(--card-shadow)', cursor: 'pointer', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', opacity: draggingCardKey === st.key ? 0.3 : 1, transform: 'scale(1)', transition: 'transform 0.1s', position: 'relative' }} onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}>
                  <button onClick={(e) => toggleRetire(e, st.key, false)} style={{ position: 'absolute', top: '8px', right: '8px', border: 'none', background: 'none', color: 'var(--text-subtle)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }} title="將此卡片移至汰舊區">
                    <Archive size={14} />
                  </button>
                  <div style={{ marginBottom: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '13px', fontWeight: '900', color: isSelected ? 'var(--primary-color)' : 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                        <Cpu size={14} color={isSelected ? 'var(--primary-color)' : 'var(--text-muted)'} /> {st.brand}
                      </div>
                      <span style={{ fontSize: '10px', fontWeight: '800', color: isSelected ? 'var(--primary-color)' : 'var(--text-muted)', backgroundColor: 'var(--bg-surface-subtle)', padding: '1px 5px', borderRadius: '4px', marginRight: '18px' }}>
                        共 {st.total} 台
                      </span>
                    </div>
                    {aggregationMode !== 'BRAND' && (
                      <div style={{ color: 'var(--text-muted)', fontSize: '11px', fontWeight: '700', marginTop: '2px', paddingLeft: '19px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                        {st.type} - {st.model}
                      </div>
                    )}
                    {aggregationMode === 'SPEC' && st.specification && (
                      <div style={{ color: 'var(--text-subtle)', fontSize: '10px', fontWeight: '500', marginTop: '2px', paddingLeft: '19px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }} title={st.specification}>
                        {st.specification}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '3px 4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}><span style={{ color: 'var(--text-muted)' }}>在庫</span><span style={{ color: '#16a34a', fontWeight: '800' }}>{st.active}</span></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}><span style={{ color: 'var(--text-muted)' }}>出貨</span><span style={{ color: '#3b82f6', fontWeight: '800' }}>{st.shipped}</span></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}><span style={{ color: 'var(--text-muted)' }}>借出</span><span style={{ color: '#d97706', fontWeight: '800' }}>{st.lent || 0}</span></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}><span style={{ color: 'var(--text-muted)' }}>故障</span><span style={{ color: '#ef4444', fontWeight: '800' }}>{st.repair}</span></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}><span style={{ color: 'var(--text-subtle)', fontWeight: '800' }}>{st.scrapped}</span></div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {renderRetiredSection(retiredList)}
      </div>
    );
  };

  const renderRetiredSection = (list) => {
    if (list.length === 0) return null;
    return (
      <div style={{ marginTop: '24px', borderTop: '2px dashed var(--border-color)', paddingTop: '24px', marginBottom: '32px', gridColumn: 'span 6' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '900', color: 'var(--text-muted)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Archive size={18} /> 汰舊 / 停用區塊 (Retired Items)
        </h3>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {list.map(st => {
            const isSelected = selectedCardKey === `${st.key}:::RETIRED`;
            return (
              <div 
                key={st.key} 
                onClick={() => handleCardClick(st)} 
                style={{ 
                  backgroundColor: isSelected ? 'var(--primary-bg, rgba(37, 99, 235, 0.08))' : 'var(--bg-surface)', 
                  padding: '10px', 
                  borderRadius: '12px', 
                  border: isSelected ? '2px solid var(--primary-color)' : '1px solid var(--border-color)', 
                  cursor: 'pointer', 
                  minWidth: '220px', 
                  opacity: isSelected ? 1 : 0.6, 
                  position: 'relative' 
                }} 
                onMouseEnter={(e) => e.currentTarget.style.opacity = '1'} 
                onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.opacity = '0.6'; }}
              >
                <button onClick={(e) => toggleRetire(e, st.key, true)} style={{ position: 'absolute', top: '8px', right: '8px', border: 'none', background: 'var(--bg-surface-subtle)', color: 'var(--text-muted)', borderRadius: '4px', padding: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center' }} title="復原此卡片">
                  <RotateCcw size={14} />
                </button>
                <div style={{ marginBottom: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '900', color: isSelected ? 'var(--primary-color)' : 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Cpu size={12} color={isSelected ? 'var(--primary-color)' : 'var(--text-muted)'} /> {st.brand}
                    </span>
                    <span style={{ fontSize: '10px', fontWeight: '800', color: isSelected ? 'var(--primary-color)' : 'var(--text-muted)', backgroundColor: 'var(--bg-surface-subtle)', padding: '1px 5px', borderRadius: '4px', marginRight: '22px' }}>
                      共 {st.total} 台
                    </span>
                  </div>
                  {aggregationMode !== 'BRAND' && (
                    <div style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: '700', marginTop: '2px', paddingLeft: '16px' }}>
                      {st.type} - {st.model}
                    </div>
                  )}
                  {aggregationMode === 'SPEC' && st.specification && (
                    <div style={{ color: 'var(--text-subtle)', fontSize: '9px', fontWeight: '500', marginTop: '2px', paddingLeft: '16px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }} title={st.specification}>
                      {st.specification}
                    </div>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '3px 6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}><span style={{ color: 'var(--text-muted)' }}>在庫</span><span style={{ color: '#16a34a', fontWeight: '800' }}>{st.active}</span></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}><span style={{ color: 'var(--text-muted)' }}>出貨</span><span style={{ color: '#3b82f6', fontWeight: '800' }}>{st.shipped}</span></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}><span style={{ color: 'var(--text-muted)' }}>借出</span><span style={{ color: '#d97706', fontWeight: '800' }}>{st.lent || 0}</span></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}><span style={{ color: 'var(--text-muted)' }}>故障</span><span style={{ color: '#ef4444', fontWeight: '800' }}>{st.repair}</span></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}><span style={{ color: 'var(--text-muted)' }}>報廢</span><span style={{ color: 'var(--text-subtle)', fontWeight: '800' }}>{st.scrapped}</span></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const containerStyle = {
    padding: isSplitMode ? '0' : 'var(--content-padding, 16px 20px)',
    backgroundColor: isSplitMode ? 'transparent' : 'var(--bg-app)',
    minHeight: isSplitMode ? 'auto' : '100%'
  };
  const cardStyle = { 
    backgroundColor: 'var(--bg-surface)', 
    borderRadius: 'var(--card-radius, 14px)', 
    padding: 'var(--card-padding, 16px 20px)', 
    boxShadow: 'var(--card-shadow)', 
    border: '1px solid var(--border-color)', 
    color: 'var(--text-main)',
    display: 'flex',
    flexDirection: 'column',
    minHeight: isSplitMode ? 'auto' : 'calc(100vh - var(--topbar-height, 56px) - 40px)'
  };
  const menuButtonStyle = { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', borderRadius: '8px', textAlign: 'left' };
  const editLabelStyle = { display: 'block', fontWeight: 800, fontSize: '13px', marginBottom: '6px', color: 'var(--text-muted)' };
  const editInputStyle = { width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', outline: 'none', fontSize: '13px' };
  const navBtnStyle = { padding: '6px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-main)', cursor: 'pointer', fontWeight: '700', fontSize: '12px' };
  const thStyle = { 
    padding: 'var(--table-cell-padding-y, 8px) var(--table-cell-padding-x, 10px)', 
    fontSize: '12px', 
    color: 'var(--table-header-text)', 
    fontWeight: '900',
    position: 'sticky',
    top: 0,
    zIndex: 4,
    backgroundColor: 'var(--table-header-bg)',
    boxShadow: '0 1px 0 var(--border-color)',
    whiteSpace: 'nowrap'
  };
  const tdStyle = { 
    padding: 'var(--table-cell-padding-y, 8px) var(--table-cell-padding-x, 10px)', 
    fontSize: '13px', 
    color: 'var(--text-main)' 
  };

  return (
    <div style={containerStyle}>
      <ColumnVisibilityModal
        isOpen={showColumnModal}
        onClose={() => setShowColumnModal(false)}
        title="設備列表 - 自訂顯示欄位"
        columns={DEVICE_COLUMNS}
        isVisible={isVisible}
        onToggle={toggleColumn}
        onShowAll={showAllColumns}
      />
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--page-title-margin, 14px)', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontSize: 'var(--page-title-size, 1.35rem)', fontWeight: '900', color: 'var(--text-main)', margin: 0 }}>
                {brandFilter ? `${brandFilter} - 設備清單` : '設備列表 (Device List)'}
              </h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '2px', marginBottom: 0 }}>檢視全系統的獨立設備資產狀態、出入庫歷程及硬體搭載情況。</p>
            </div>
            {!isSplitMode && (
              <div style={{ display: 'flex', backgroundColor: 'var(--bg-surface-subtle)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                <button
                  onClick={() => setShowAddModal(true)}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: 'var(--primary-color)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)'
                  }}
                >
                  ➕ 新增設備 (Add Device)
                </button>
              </div>
            )}
            {(brandFilter || searchTerm || selectedCardKey) && (
              <button 
                onClick={() => { setSearchTerm(''); setSelectedCardKey(null); setSearchParams({}); }}
                style={{ padding: '4px 12px', borderRadius: '20px', backgroundColor: 'var(--bg-surface-subtle)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}
              >
                清除所有篩選 ×
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
            {/* 卡片聚合維度選擇器 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'var(--bg-surface-subtle)', padding: '3px 8px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '12px', fontWeight: '800', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>聚合規則:</span>
              <div style={{ display: 'inline-flex', gap: '2px' }}>
                <button
                  type="button"
                  onClick={() => handleAggregationModeChange('SPEC')}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '7px',
                    border: 'none',
                    fontSize: '11px',
                    fontWeight: '800',
                    cursor: 'pointer',
                    backgroundColor: aggregationMode === 'SPEC' ? 'var(--primary-color)' : 'transparent',
                    color: aggregationMode === 'SPEC' ? '#fff' : 'var(--text-muted)',
                    transition: 'all 0.15s'
                  }}
                  title="依規格獨立生成卡片：相同廠牌、類型、型號底下，只要規格不同就獨立一張卡片"
                >
                  🏷️ 依規格
                </button>
                <button
                  type="button"
                  onClick={() => handleAggregationModeChange('MODEL')}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '7px',
                    border: 'none',
                    fontSize: '11px',
                    fontWeight: '800',
                    cursor: 'pointer',
                    backgroundColor: aggregationMode === 'MODEL' ? 'var(--primary-color)' : 'transparent',
                    color: aggregationMode === 'MODEL' ? '#fff' : 'var(--text-muted)',
                    transition: 'all 0.15s'
                  }}
                  title="依型號聚合：相同廠牌與型號合併統計（不分規格）"
                >
                  📦 依型號
                </button>
                <button
                  type="button"
                  onClick={() => handleAggregationModeChange('BRAND')}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '7px',
                    border: 'none',
                    fontSize: '11px',
                    fontWeight: '800',
                    cursor: 'pointer',
                    backgroundColor: aggregationMode === 'BRAND' ? 'var(--primary-color)' : 'transparent',
                    color: aggregationMode === 'BRAND' ? '#fff' : 'var(--text-muted)',
                    transition: 'all 0.15s'
                  }}
                  title="依廠牌聚合：純依廠牌合併統計（如 Dell、HP 各一張卡片）"
                >
                  🏢 依廠牌
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={() => setShowColumnModal(true)}
              title="自訂這個列表要顯示哪些欄位"
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '9px 14px', borderRadius: '30px',
                border: '1.5px solid var(--border-color)', backgroundColor: 'var(--bg-surface-subtle)',
                color: 'var(--text-main)', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
              }}
            >
              <Columns3 size={15} /> 自訂顯示欄位
              {hiddenCount > 0 && (
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#fff', backgroundColor: 'var(--primary-color)', borderRadius: '10px', padding: '1px 7px' }}>
                  已隱藏 {hiddenCount}
                </span>
              )}
            </button>
            <div style={{ position: 'relative' }}>
              <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
              <input type="text" placeholder="快速搜尋..." value={searchTerm} onChange={(e) => {setSearchTerm(e.target.value); setCurrentPage(1);}} style={{ padding: '10px 12px 10px 42px', borderRadius: '30px', border: '1.5px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', width: '220px', outline: 'none' }} />
            </div>
            </div>
          </div>
        </div>

        {renderStats()}

        { (brandFilter || searchTerm || selectedCardKey) ? (
          <>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '100px', color: 'var(--text-muted)' }}>載入中...</div>
            ) : (
              paginatedItems.length > 0 ? (
                <>
                  <div style={{ marginBottom: '16px', overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 280px)', minHeight: '300px', border: '1px solid var(--border-color)', borderRadius: '10px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
                      <thead style={{ position: 'sticky', top: 0, zIndex: 4, backgroundColor: 'var(--table-header-bg)' }}>
                        <tr style={{ borderBottom: '2px solid var(--border-color)', backgroundColor: 'var(--table-header-bg)' }}>
                          <th style={{ ...thStyle, textAlign: 'left', width: '200px' }}>廠牌 / 型號 / 類型</th>
                          <th style={{ ...thStyle, textAlign: 'left' , ...hideCol('sn') }}>序號 (SN)</th>
                          <th style={{ ...thStyle, textAlign: 'left' , ...hideCol('spec') }}>規格 (Spec)</th>
                          <th style={{ ...thStyle, textAlign: 'left' , ...hideCol('project') }}>專案編號/名稱 (Project)</th>
                          <th style={{ ...thStyle, textAlign: 'left' , ...hideCol('hostname') }}>主機名稱</th>
                          <th style={{ ...thStyle, textAlign: 'left' , ...hideCol('components') }}>搭載硬體</th>
                          <th style={{ ...thStyle, textAlign: 'left' , ...hideCol('client') }}>客戶</th>
                          <th style={{ ...thStyle, textAlign: 'left' , ...hideCol('end_user') }}>End-user</th>
                          <th style={{ ...thStyle, textAlign: 'left' , ...hideCol('location') }}>位置</th>
                          <th style={{ ...thStyle, textAlign: 'left' , ...hideCol('remarks') }}>備註</th>
                          <th style={{ ...thStyle, textAlign: 'left' , ...hideCol('warranty') }}>保固資訊 (P/S/W/C)</th>
                          <th style={{ ...thStyle, textAlign: 'left', width: '100px' , ...hideCol('status') }}>狀態</th>
                          <th style={{ ...thStyle, textAlign: 'center', width: '80px' }}>功能</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedItems.map(item => {
                          const config = statusConfig[item.status] || statusConfig['ACTIVE'];
                          let attrs = {};
                          try { attrs = typeof item.custom_attributes === 'string' ? JSON.parse(item.custom_attributes) : (item.custom_attributes || {}); } catch { attrs = {}; }
                          
                          return (
                            <tr key={item.id} style={{ borderBottom: '1px solid var(--table-border)', backgroundColor: item.status === 'SCRAPPED' ? 'rgba(239, 68, 68, 0.08)' : 'transparent' }}>
                              <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                                <div style={{ fontWeight: 800, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  {item.brand}
                                  {item.ownership === 'COMPANY' && (
                                    <span style={{ fontSize: '10px', padding: '2px 6px', backgroundColor: '#8b5cf6', color: 'white', borderRadius: '4px', whiteSpace: 'nowrap' }}>公司資產</span>
                                  )}
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.type} - {item.model}</div>
                              </td>
                              <td style={{ ...tdStyle, fontWeight: 800, fontFamily: 'monospace', color: 'var(--primary-color)', whiteSpace: 'nowrap', ...hideCol('sn') }}>
                                {item.sn}
                              </td>
                              <td style={{ ...tdStyle, fontSize: '11px', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...hideCol('spec') }} title={item.specification}>{item.specification || '--'}</td>
                              <td style={{ ...tdStyle, fontWeight: 700, color: 'var(--text-main)', ...hideCol('project') }}>
                                {(() => {
                                  const pName = attrs.project_name;
                                  if (!pName) return '--';
                                  const proj = projects.find(p => p.project_name === pName);
                                  return (
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                      {proj && proj.project_no && <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 'normal', marginBottom: '2px' }}>{proj.project_no}</span>}
                                      <span>{pName}</span>
                                    </div>
                                  );
                                })()}
                              </td>
                              <td style={{ ...tdStyle, ...hideCol('hostname') }}>{item.hostname || '--'}</td>

                              <td style={{ ...tdStyle, ...hideCol('components') }}>
                                {item.components && item.components.length > 0 ? (
                                  <>
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setExpandedItems(prev => ({ ...prev, [item.id]: !prev[item.id] }));
                                      }}
                                      style={{ 
                                        fontSize: '10px', 
                                        color: '#818cf8', 
                                        backgroundColor: 'rgba(99, 102, 241, 0.15)', 
                                        border: '1px solid rgba(99, 102, 241, 0.3)', 
                                        borderRadius: '4px', 
                                        padding: '2px 6px', 
                                        cursor: 'pointer', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '4px', 
                                        fontWeight: 'bold', 
                                        outline: 'none' 
                                      }}
                                    >
                                      <Cpu size={10} /> 搭載硬體 ({item.components.length})
                                    </button>
                                    
                                    {expandedItems[item.id] && (
                                      <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '3px', paddingLeft: '4px', borderLeft: '2px solid var(--primary-color)' }}>
                                        {item.components.map((comp, idx) => (
                                          <div key={idx} style={{ fontSize: '10px', color: 'var(--text-main)', fontWeight: 'normal' }}>
                                            • {comp.brand} {comp.model} ({comp.sn})
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <span style={{ color: 'var(--text-subtle)', fontSize: '11px' }}>-</span>
                                )}
                              </td>
                              <td style={{ ...tdStyle, ...hideCol('client') }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 700, color: 'var(--text-main)' }}>
                                    <User size={14} color="var(--text-muted)" /> {item.client || '--'}
                                  </div>
                                  {(item.partner_contact || item.partner_phone) && (
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', paddingLeft: '18px' }}>
                                      {item.partner_contact} {item.partner_phone}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td style={{ ...tdStyle, ...hideCol('end_user') }}>
                                <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>
                                  {item.end_user || attrs.end_user || '--'}
                                </div>
                              </td>
                              <td style={{ ...tdStyle, ...hideCol('location') }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-main)' }}>
                                  <MapPin size={14} color="var(--text-muted)" /> {item.location || '--'}
                                </div>
                              </td>
                              <td style={{ ...tdStyle, maxWidth: '200px', ...hideCol('remarks') }}>
                                <div
                                  style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-main)' }}
                                  title={item.remarks || ''}
                                >
                                  {item.remarks || '--'}
                                </div>
                              </td>
                               <td style={{ ...tdStyle, fontSize: '10px', whiteSpace: 'nowrap', minWidth: '150px', ...hideCol('warranty') }}>
                                 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 8px' }}>
                                   <div><span style={{ color: '#3b82f6', fontWeight: 'bold' }}>P:</span> {item.installed_date ? new Date(item.installed_date).toLocaleDateString() : '--'}</div>
                                   <div><span style={{ color: '#10b981', fontWeight: 'bold' }}>S:</span> {item.system_date ? new Date(item.system_date).toLocaleDateString() : '--'}</div>
                                   <div><span style={{ color: '#ef4444', fontWeight: 'bold' }}>W:</span> {item.warranty_expire ? new Date(item.warranty_expire).toLocaleDateString() : '--'}</div>
                                   <div><span style={{ color: '#f59e0b', fontWeight: 'bold' }}>C:</span> {item.customer_warranty_expire ? new Date(item.customer_warranty_expire).toLocaleDateString() : '--'}</div>
                                 </div>
                               </td>

                              <td style={{ ...tdStyle, width: '100px', ...hideCol('status') }}>
                                <span style={{ 
                                  padding: '4px 10px', 
                                  borderRadius: '20px', 
                                  fontSize: '11px', 
                                  fontWeight: '800',
                                  backgroundColor: config.bgColor,
                                  color: config.color,
                                  border: `1px solid ${config.borderColor}`,
                                  whiteSpace: 'nowrap'
                                }}>
                                  {config.label}
                                </span>
                              </td>
                              <td style={{ ...tdStyle, textAlign: 'center', width: '80px', position: 'relative' }}>
                                <button 
                                  className="action-menu-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (activeMenuId === item.id) {
                                      setActiveMenuId(null);
                                      setMenuPosition(null);
                                    } else {
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      const menuHeight = 360;
                                      const isUpward = rect.bottom + menuHeight > window.innerHeight && rect.top > menuHeight;
                                      setActiveMenuId(item.id);
                                      setMenuPosition({
                                        top: isUpward ? rect.top - 4 : rect.bottom + 4,
                                        right: window.innerWidth - rect.right,
                                        isUpward
                                      });
                                    }
                                  }} 
                                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                                >
                                  <MoreHorizontal size={20} />
                                </button>
                                {activeMenuId === item.id && menuPosition && (
                                  <div 
                                    className="dropdown-action-menu"
                                    style={{ 
                                      position: 'fixed', 
                                      top: menuPosition.isUpward ? 'auto' : `${menuPosition.top}px`,
                                      bottom: menuPosition.isUpward ? `${window.innerHeight - menuPosition.top}px` : 'auto',
                                      right: `${menuPosition.right}px`, 
                                      backgroundColor: 'var(--bg-surface)', 
                                      border: '1px solid var(--border-color)', 
                                      borderRadius: '12px', 
                                      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)', 
                                      zIndex: 99999, 
                                      padding: '8px', 
                                      minWidth: '180px', 
                                      display: 'flex', 
                                      flexDirection: 'column', 
                                      gap: '4px',
                                      maxHeight: '80vh',
                                      overflowY: 'auto'
                                    }}
                                  >
                                    <button 
                                      onClick={() => {
                                        setActiveMenuId(null);
                                        setMenuPosition(null);
                                        setLedgerItem({ item_master_id: item.item_master_id, sn: item.sn, brand: item.brand, model: item.model, type: item.type, current_stock: 1 });
                                      }} 
                                      style={{ ...menuButtonStyle, color: 'var(--text-main)' }}
                                    >
                                      <History size={14} /> 履歷 (History)
                                    </button>
                                    <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '2px 0' }} />
                                    <button onClick={() => { setActiveMenuId(null); setMenuPosition(null); handleEditClick(item); }} style={menuButtonStyle}><Edit2 size={14} /> 編輯詳細資訊</button>
                                    <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '2px 0' }} />
                                    <button 
                                      onClick={() => { 
                                        setActiveMenuId(null); 
                                        setMenuPosition(null); 
                                        setRmaAsset(item); 
                                      }} 
                                      style={{ ...menuButtonStyle, color: '#0ea5e9', fontWeight: '700' }}
                                    >
                                      <RefreshCw size={14} /> 原廠換新 / 更換序號 (RMA)
                                    </button>
                                    <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '2px 0' }} />
                                    {item.ownership === 'COMPANY' ? (
                                      <button 
                                        onClick={() => { setActiveMenuId(null); setMenuPosition(null); handleUpdateOwnership(item.id, item.sn, 'FOR_SALE', '一般銷售'); }} 
                                        style={{ ...menuButtonStyle, color: '#3b82f6', fontWeight: '700' }}
                                      >
                                        <RotateCcw size={14} /> 轉為一般銷售
                                      </button>
                                    ) : (
                                      <button 
                                        onClick={() => { setActiveMenuId(null); setMenuPosition(null); handleUpdateOwnership(item.id, item.sn, 'COMPANY', '公司資產'); }} 
                                        style={{ ...menuButtonStyle, color: '#8b5cf6', fontWeight: '700' }}
                                      >
                                        <Building2 size={14} /> 轉為公司資產
                                      </button>
                                    )}
                                    <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '4px 0' }} />
                                    <button onClick={() => { setActiveMenuId(null); setMenuPosition(null); handleUpdateStatus(item.id, item.sn, 'ACTIVE', '在庫'); }} style={{ ...menuButtonStyle, color: '#10b981' }}><CheckCircle size={14} /> 標記為在庫</button>
                                    <button onClick={() => { setActiveMenuId(null); setMenuPosition(null); handleUpdateStatus(item.id, item.sn, 'SHIPPED', '已出貨'); }} style={{ ...menuButtonStyle, color: '#3b82f6' }}><ShoppingBag size={14} /> 標記為出貨</button>
                                    <button onClick={() => { setActiveMenuId(null); setMenuPosition(null); handleUpdateStatus(item.id, item.sn, 'LENT', '借出/借用'); }} style={{ ...menuButtonStyle, color: '#f59e0b' }}><Send size={14} /> 標記為借出</button>
                                    <button onClick={() => { setActiveMenuId(null); setMenuPosition(null); handleUpdateStatus(item.id, item.sn, 'REPAIRING', '異常維修'); }} style={{ ...menuButtonStyle, color: '#d97706' }}><Wrench size={14} /> 標記為維修</button>
                                    <button onClick={() => { setActiveMenuId(null); setMenuPosition(null); handleUpdateStatus(item.id, item.sn, 'SCRAPPED', '報廢'); }} style={{ ...menuButtonStyle, color: '#ef4444' }}><ShieldAlert size={14} /> 標記為報廢</button>
                                    <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '4px 0' }} />
                                    <button onClick={() => { setActiveMenuId(null); setMenuPosition(null); handleDelete(item.id, item.sn); }} style={{ ...menuButtonStyle, color: '#f43f5e' }}><Trash2 size={14} /> 刪除紀錄</button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginTop: '20px' }}>
                    <PageSizeSelector pageSize={itemsPerPage} onChange={(newSize) => { setItemsPerPage(newSize); setCurrentPage(1); }} />
                    {totalPages > 1 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button disabled={currentPage === 1} onClick={() => setCurrentPage(prev => prev - 1)} style={{ ...navBtnStyle, opacity: currentPage === 1 ? 0.5 : 1 }}>上一頁</button>
                        <span style={{ display: 'flex', alignItems: 'center', fontWeight: '800', color: 'var(--text-muted)' }}>第 {currentPage} 頁 / 共 {totalPages} 頁</span>
                        <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(prev => prev + 1)} style={{ ...navBtnStyle, opacity: currentPage === totalPages ? 0.5 : 1 }}>下一頁</button>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '100px', color: 'var(--text-muted)', fontSize: '14px' }}>未找到符合條件的設備</div>
              )
            )}
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 20px', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '16px', border: '1px dashed var(--border-color)', marginTop: '20px' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '15px', fontWeight: '500' }}>
              請點擊上方統計卡片，或從左側選單選擇品牌來查看詳細清單
            </div>
            <div style={{ color: 'var(--text-subtle)', fontSize: '12px', marginTop: '8px' }}>
              您也可以在右上角使用搜尋功能直接查找
            </div>
          </div>
        )}

        {/* 設備卡片聚合規則說明 */}
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
          lineHeight: '1.6'
        }}>
          <Info size={18} color="var(--primary-color)" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <div style={{ fontWeight: '800', color: 'var(--text-main)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              設備卡片聚合規則說明
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div>• <b>當前聚合維度</b>：
                <span style={{ color: 'var(--primary-color)', fontWeight: '800' }}>
                  {aggregationMode === 'SPEC' && '🏷️ 依規格聚合（廠牌 ＋ 類型 ＋ 型號 ＋ 規格，規格不同即獨立卡片）'}
                  {aggregationMode === 'MODEL' && '📦 依型號聚合（廠牌 ＋ 類型 ＋ 型號，同型號合併卡片不分規格）'}
                  {aggregationMode === 'BRAND' && '🏢 依廠牌聚合（純依廠牌合併統計卡片）'}
                </span>
                （可於右上方自由切換）
              </div>
              <div>• <b>連動篩選</b>：點擊上方任一卡片，即可快速過濾呈現該卡片維度下之設備資產明細清單；再次點擊可取消篩選。</div>
            </div>
          </div>
        </div>
      </div>

      {showEditModal && editItem && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'var(--bg-modal-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-main)', width: '60vw', maxWidth: '95vw', padding: '32px', borderRadius: '16px', maxHeight: '90vh', overflowY: 'auto', boxShadow: 'var(--modal-shadow)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '900', color: 'var(--text-main)', margin: 0 }}>修改詳細設備資訊</h2>
              <X size={24} style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setShowEditModal(false)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                <div>
                  <label style={editLabelStyle}>廠牌 (Brand) (鎖定)</label>
                  <input type="text" value={editItem.brand || ''} disabled readOnly style={{ ...editInputStyle, backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-muted)', cursor: 'not-allowed' }} />
                </div>
                <div>
                  <label style={editLabelStyle}>類型 (Type) (鎖定)</label>
                  <input type="text" value={editItem.type || ''} disabled readOnly style={{ ...editInputStyle, backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-muted)', cursor: 'not-allowed' }} />
                </div>
                <div>
                  <label style={editLabelStyle}>型號 (Model) *</label>
                  <input 
                    type="text" 
                    value={editItem.model || ''} 
                    onChange={(e) => setEditItem({ ...editItem, model: e.target.value })} 
                    style={editInputStyle} 
                    placeholder="請輸入型號"
                  />
                </div>
                <div>
                  <label style={editLabelStyle}>規格 (Specification) <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>(選填)</span></label>
                  <input 
                    type="text" 
                    value={editItem.specification || ''} 
                    onChange={(e) => setEditItem({ ...editItem, specification: e.target.value })} 
                    style={editInputStyle} 
                    title={editItem.specification || ''}
                    placeholder="選填，可輸入硬體核心規格"
                  />
                </div>
              </div>

              <div>
                <label style={editLabelStyle}>資產歸屬 (Ownership)</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setEditItem({ ...editItem, ownership: 'FOR_SALE' })}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '6px',
                      border: editItem.ownership !== 'COMPANY' ? '2px solid var(--primary-color)' : '1px solid var(--border-color)',
                      backgroundColor: editItem.ownership !== 'COMPANY' ? 'rgba(37, 99, 235, 0.1)' : 'var(--bg-surface-subtle)',
                      color: editItem.ownership !== 'COMPANY' ? 'var(--primary-color)' : 'var(--text-muted)',
                      fontWeight: '700',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    一般銷售 (FOR_SALE)
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditItem({ ...editItem, ownership: 'COMPANY' })}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '6px',
                      border: editItem.ownership === 'COMPANY' ? '2px solid #8b5cf6' : '1px solid var(--border-color)',
                      backgroundColor: editItem.ownership === 'COMPANY' ? 'rgba(139, 92, 246, 0.1)' : 'var(--bg-surface-subtle)',
                      color: editItem.ownership === 'COMPANY' ? '#8b5cf6' : 'var(--text-muted)',
                      fontWeight: '700',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    🏢 公司資產 (COMPANY)
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) 1fr 1fr', gap: '16px' }}>
                <div><label style={editLabelStyle}>序號 / SN</label><input type="text" value={editItem.sn || ''} onChange={(e) => setEditItem({...editItem, sn: e.target.value})} style={editInputStyle} /></div>
                <div style={{ position: 'relative' }}>
                  <label style={editLabelStyle}>專案名稱 (Project)</label>
                  <input 
                    type="text" 
                    value={(editItem.custom_attributes && editItem.custom_attributes.project_name) || ''} 
                    onChange={(e) => {
                      setEditItem({...editItem, custom_attributes: {...editItem.custom_attributes, project_name: e.target.value}});
                    }} 
                    placeholder="輸入關鍵字搜尋專案"
                    style={editInputStyle} 
                    onFocus={() => {
                      if (!editItem.showProjectDropdown) {
                        setEditItem({...editItem, showProjectDropdown: true});
                      }
                    }}
                    onBlur={() => {
                      setTimeout(() => {
                        setEditItem(prev => prev ? {...prev, showProjectDropdown: false} : prev);
                      }, 200);
                    }}
                  />
                  {editItem.showProjectDropdown && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, 
                      backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', 
                      borderRadius: '8px', marginTop: '4px', maxHeight: '200px', 
                      overflowY: 'auto', zIndex: 10, boxShadow: 'var(--modal-shadow)'
                    }}>
                      {(() => {
                        const searchStr = ((editItem.custom_attributes && editItem.custom_attributes.project_name) || '').toLowerCase();
                        const matches = projects.filter(p => 
                          (p.project_no || '').toLowerCase().includes(searchStr) || 
                          (p.project_name || '').toLowerCase().includes(searchStr)
                        );
                        if (matches.length === 0) return <div style={{ padding: '8px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>無符合專案</div>;
                        return matches.map(p => (
                          <div 
                            key={p.project_no}
                            style={{ padding: '8px', cursor: 'pointer', borderBottom: '1px solid var(--border-color)', fontSize: '0.85rem' }}
                            onMouseDown={() => {
                              setEditItem({...editItem, custom_attributes: {...editItem.custom_attributes, project_name: p.project_name}, showProjectDropdown: false});
                            }}
                          >
                            <div style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>{p.project_no}</div>
                            <div style={{ color: 'var(--text-muted)' }}>{p.project_name}</div>
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                </div>
                <div><label style={editLabelStyle}>主機名稱 (HostName)</label><input type="text" value={editItem.hostname || ''} onChange={(e) => setEditItem({...editItem, hostname: e.target.value})} style={editInputStyle} /></div>
              </div>

              <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label htmlFor="edit-mounted-hw-input" style={{ ...editLabelStyle, marginBottom: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Cpu size={14} style={{ color: 'var(--primary-color)' }} />
                    <span>搭載硬體 SN (Mounted Hardware SN)</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 'normal' }}>
                      (提供硬體序號，儲存時將自動同步對應此設備之伺服器 SN)
                    </span>
                  </label>
                  {availableHardwares.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowHwDropdown(prev => !prev)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--primary-color)',
                        fontSize: '12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontWeight: '600'
                      }}
                    >
                      <Plus size={13} /> {showHwDropdown ? '收起硬體選單' : '從硬體庫存挑選'}
                    </button>
                  )}
                </div>
                <input 
                  id="edit-mounted-hw-input"
                  type="text" 
                  value={editItem.mounted_hw_sns || ''} 
                  onChange={(e) => setEditItem({ ...editItem, mounted_hw_sns: e.target.value })} 
                  onFocus={() => {
                    if (availableHardwares.length > 0 && !showHwDropdown) {
                      setShowHwDropdown(true);
                    }
                  }}
                  placeholder="輸入或貼上硬體序號，多筆請用逗號或空格分隔 (例如: NIC-001, MEM-002)" 
                  style={editInputStyle} 
                />

                {/* 下拉搜尋 / 挑選硬體清單 */}
                {showHwDropdown && availableHardwares.length > 0 && (
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0,
                    backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)',
                    borderRadius: '8px', marginTop: '4px', maxHeight: '220px',
                    overflowY: 'auto', zIndex: 20, boxShadow: 'var(--modal-shadow)'
                  }}>
                    <div style={{ padding: '8px 12px', backgroundColor: 'var(--bg-surface-subtle)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', fontWeight: 'bold' }}>
                      <span>可掛載之硬體資產清單 (點擊加入/移除)</span>
                      <span style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setShowHwDropdown(false)}>關閉 ✕</span>
                    </div>
                    {(() => {
                      const curSns = (editItem.mounted_hw_sns || '')
                        .split(/[,，\s\n]+/)
                        .map(s => s.trim().toLowerCase())
                        .filter(Boolean);
                      return availableHardwares.map(hw => {
                        const isSelected = curSns.includes((hw.sn || '').toLowerCase());
                        const isMountedToOther = hw.server_sn && hw.server_sn.trim() !== (editItem.sn || '').trim();
                        return (
                          <div 
                            key={hw.id || hw.sn}
                            style={{
                              padding: '8px 12px',
                              cursor: 'pointer',
                              borderBottom: '1px solid var(--border-color)',
                              fontSize: '0.85rem',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              backgroundColor: isSelected ? 'rgba(99, 102, 241, 0.08)' : 'transparent'
                            }}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              const currentList = (editItem.mounted_hw_sns || '')
                                .split(/[,，\s\n]+/)
                                .map(s => s.trim())
                                .filter(Boolean);
                              let newList;
                              if (isSelected) {
                                newList = currentList.filter(s => s.toLowerCase() !== (hw.sn || '').toLowerCase());
                              } else {
                                newList = [...currentList, hw.sn];
                              }
                              setEditItem({ ...editItem, mounted_hw_sns: Array.from(new Set(newList)).join(', ') });
                            }}
                          >
                            <div>
                              <span style={{ fontWeight: 'bold', color: 'var(--text-main)', marginRight: '8px' }}>
                                {isSelected ? '✅ ' : '+ '} {hw.sn}
                              </span>
                              <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                                {hw.brand} {hw.model} {hw.type ? `(${hw.type})` : ''}
                              </span>
                            </div>
                            <div>
                              {isMountedToOther ? (
                                <span style={{ fontSize: '11px', color: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                                  已綁定: {hw.server_sn}
                                </span>
                              ) : isSelected ? (
                                <span style={{ fontSize: '11px', color: 'var(--primary-color)', fontWeight: 'bold' }}>
                                  已選取
                                </span>
                              ) : (
                                <span style={{ fontSize: '11px', color: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                                  在庫可用
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}

                {/* 已解析之硬體序號徽章標籤 (Chips) */}
                {(() => {
                  const parsedSns = (editItem.mounted_hw_sns || '')
                    .split(/[,，\s\n]+/)
                    .map(s => s.trim())
                    .filter(Boolean);
                  const uniqueSns = Array.from(new Set(parsedSns));
                  if (uniqueSns.length === 0) return null;

                  return (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 'bold' }}>已設定 ({uniqueSns.length}):</span>
                      {uniqueSns.map(sn => {
                        const matchedHw = (availableHardwares || []).find(h => (h.sn || '').toLowerCase() === sn.toLowerCase()) || 
                          (editItem._origComponents || []).find(c => (c.sn || '').toLowerCase() === sn.toLowerCase()) ||
                          (editItem._origMountedHwSns || []).find(s => s.toLowerCase() === sn.toLowerCase());
                        return (
                          <span
                            key={sn}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              backgroundColor: matchedHw ? 'rgba(99, 102, 241, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                              border: matchedHw ? '1px solid rgba(99, 102, 241, 0.25)' : '1px solid rgba(239, 68, 68, 0.4)',
                              color: matchedHw ? 'var(--text-main)' : '#ef4444',
                              borderRadius: '6px',
                              padding: '2px 8px',
                              fontSize: '11px',
                              fontWeight: '600'
                            }}
                          >
                            <Cpu size={11} style={{ color: matchedHw ? '#6366f1' : '#ef4444' }} />
                            <span>{sn}</span>
                            {matchedHw ? (
                              <span style={{ color: 'var(--text-muted)', fontWeight: 'normal', fontSize: '10px' }}>
                                {matchedHw.brand ? `(${matchedHw.brand} ${matchedHw.model || ''})` : ''}
                              </span>
                            ) : (
                              <span style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '10px' }}>
                                (未建檔硬體)
                              </span>
                            )}
                            <X 
                              size={12} 
                              style={{ cursor: 'pointer', color: 'var(--text-muted)', marginLeft: '2px' }}
                              onClick={() => {
                                const remain = uniqueSns.filter(s => s !== sn);
                                setEditItem({ ...editItem, mounted_hw_sns: remain.join(', ') });
                              }}
                            />
                          </span>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                <div>
                  <label htmlFor="edit-client-select" style={editLabelStyle}>客戶名稱</label>
                  <select 
                    id="edit-client-select"
                    value={editItem.client || ''} 
                    onChange={(e) => {
                      const newClient = e.target.value;
                      const matches = customers.filter(c => c.name === newClient);
                      const contactPerson = matches.length === 1 ? (matches[0].contact || '') : '';
                      const contactPhone = matches.length === 1 ? (matches[0].phone || '') : '';
                      setEditItem({
                        ...editItem,
                        client: newClient,
                        contact_person: contactPerson,
                        contact_phone: contactPhone
                      });
                    }} 
                    style={editInputStyle}
                  >
                    <option value="">請選擇</option>
                    {Array.from(new Set(customers.map(c => c.name))).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={editLabelStyle}>End-user (最終使用者)</label>
                  <input 
                    type="text" 
                    value={editItem.end_user || ''} 
                    onChange={(e) => setEditItem({
                      ...editItem, 
                      end_user: e.target.value
                    })} 
                    placeholder="輸入 End-user" 
                    style={editInputStyle} 
                  />
                </div>
                <div>
                  <label htmlFor="edit-contact-select" style={editLabelStyle}>聯絡人</label>
                  {(() => {
                    const matches = customers.filter(c => c.name === editItem.client);
                    if (matches.length > 1) {
                      return (
                        <select 
                          id="edit-contact-select"
                          value={editItem.contact_person || ''} 
                          onChange={(e) => {
                            const contactVal = e.target.value;
                            const found = matches.find(m => m.contact === contactVal);
                            setEditItem({
                              ...editItem,
                              contact_person: contactVal,
                              contact_phone: found ? (found.phone || '') : ''
                            });
                          }} 
                          style={editInputStyle}
                        >
                          <option value="">請選擇聯絡人</option>
                          {matches.map((m, idx) => (
                            <option key={idx} value={m.contact || ''}>
                              {m.contact || '無姓名'} ({m.phone || '無電話'})
                            </option>
                          ))}
                        </select>
                      );
                    } else {
                      return (
                        <input 
                          id="edit-contact-select"
                          type="text" 
                          value={editItem.contact_person || ''} 
                          onChange={(e) => setEditItem({ ...editItem, contact_person: e.target.value })}
                          placeholder="聯絡人姓名"
                          style={editInputStyle}
                        />
                      );
                    }
                  })()}
                </div>
                <div><label style={editLabelStyle}>放置位置 (Location)</label><input type="text" value={editItem.location || ''} onChange={(e) => setEditItem({...editItem, location: e.target.value})} style={editInputStyle} /></div>
              </div>
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div><label style={editLabelStyle}>安裝日期 (Project Date)</label><input type="date" value={editItem.installed_date || ''} onChange={(e) => setEditItem({...editItem, installed_date: e.target.value})} style={editInputStyle} /></div>
                <div><label style={editLabelStyle}>系統日期 (System Date)</label><input type="date" value={editItem.system_date || ''} onChange={(e) => setEditItem({...editItem, system_date: e.target.value})} style={editInputStyle} /></div>
                <div><label style={editLabelStyle}>原廠保固到期 (Warranty Expire)</label><input type="date" value={editItem.warranty_expire || ''} onChange={(e) => setEditItem({...editItem, warranty_expire: e.target.value})} style={editInputStyle} /></div>
                <div><label style={editLabelStyle}>客戶保固到期 (Cust Warranty)</label><input type="date" value={editItem.customer_warranty_expire || ''} onChange={(e) => setEditItem({...editItem, customer_warranty_expire: e.target.value})} style={editInputStyle} /></div>
              </div>
              <div style={{ marginTop: '16px' }}>
                <label style={editLabelStyle}>備註 (Remarks)</label>
                <textarea
                  value={editItem.remarks || ''}
                  onChange={(e) => setEditItem({ ...editItem, remarks: e.target.value })}
                  placeholder="選填，可記錄此設備的補充說明"
                  rows={3}
                  style={{ ...editInputStyle, resize: 'vertical', minHeight: '72px', fontFamily: 'inherit' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '24px' }}>
                <button onClick={handleUpdate} style={{ flex: 1, padding: '14px', backgroundColor: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}><Save size={18}/> 儲存變更</button>
                <button onClick={() => setShowEditModal(false)} style={{ padding: '14px 24px', backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '10px', cursor: 'pointer' }}>取消</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {confirmModal.show && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'var(--bg-modal-overlay)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 11000, animation: 'fadeIn 0.2s' }}>
          <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-main)', width: '320px', padding: '24px', borderRadius: '20px', boxShadow: 'var(--modal-shadow)', textAlign: 'center' }}>
            <div style={{ marginBottom: '20px', fontSize: '15px', fontWeight: '700', color: 'var(--text-main)', lineHeight: '1.5' }}>{confirmModal.msg}</div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                onClick={() => setConfirmModal({ show: false, msg: '', onConfirm: null })}
                style={{ flex: 1, padding: '10px', backgroundColor: 'var(--bg-surface-subtle)', border: '1px solid var(--border-color)', borderRadius: '30px', color: 'var(--text-muted)', fontWeight: '700', cursor: 'pointer', fontSize: '13px' }}
              >
                取消
              </button>
              <button 
                onClick={confirmModal.onConfirm}
                style={{ flex: 1, padding: '10px', background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', border: 'none', borderRadius: '30px', color: 'white', fontWeight: '700', cursor: 'pointer', fontSize: '13px', boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.3)' }}
              >
                確定
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 品項履歷 Modal */}
      <ItemLedgerModal
        isOpen={!!ledgerItem}
        onClose={() => setLedgerItem(null)}
        item={ledgerItem}
      />

      {/* 新增設備彈窗 Modal */}
      <DeviceRegistrationModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={(createdInfo) => {
          fetchAssets();
          if (createdInfo?.sn) {
            setSearchTerm(createdInfo.sn);
          } else if (createdInfo?.brand) {
            setSearchTerm(createdInfo.brand);
          }
          setCurrentPage(1);
        }}
      />

      {/* 原廠換新 RMA Modal */}
      {rmaAsset && (
        <RmaReplacementModal
          isOpen={!!rmaAsset}
          asset={rmaAsset}
          onClose={() => setRmaAsset(null)}
          onSuccess={fetchAssets}
        />
      )}
    </div>
  );
};

export default DeviceList;
