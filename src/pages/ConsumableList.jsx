import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Search, Edit2, Trash2, X, Save, MoreHorizontal, ArrowLeftRight, ClipboardList, ShoppingBag, AlertTriangle, Archive, RotateCcw, Package, History } from 'lucide-react';
import ItemLedgerModal from '../components/ItemLedgerModal';
import ConsumableRegistrationModal from '../components/ConsumableRegistrationModal';
import ConsumableBatchImportModal from '../components/ConsumableBatchImportModal';
import { logUpdate, logDelete } from '../utils/auditLogger';

const editLabelStyle = { display: 'block', fontWeight: 800, fontSize: '13px', marginBottom: '6px', color: 'var(--text-muted)' };
const editInputStyle = { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', outline: 'none', fontSize: '13px', boxSizing: 'border-box' };
const modalOverlayStyle = { position: 'fixed', inset: 0, backgroundColor: 'var(--bg-modal-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)', padding: '20px' };
const modalContentStyle = { backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-main)', width: '60vw', maxWidth: '95vw', padding: '32px', borderRadius: '16px', boxShadow: 'var(--modal-shadow)' };

const ConsumableList = ({ isSplitMode = false }) => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBatchImport, setShowBatchImport] = useState(false);
  const [searchParams] = useSearchParams();
  const typeFilter = searchParams.get('type');
  const [selectedType, setSelectedType] = useState(typeFilter || null);
  const [showAll, setShowAll] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [menuPosition, setMenuPosition] = useState(null);
  const [ledgerItem, setLedgerItem] = useState(null);

  // 當側邊欄分類變動時，清除搜尋關鍵字並同步選取類型
  useEffect(() => {
    setSearchTerm('');
    setSelectedType(typeFilter || null);
    setShowAll(false);
    setActiveMenuId(null);
    setMenuPosition(null);
  }, [typeFilter]);

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
  const itemsPerPage = 10;

  const [editItem, setEditItem] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState({ show: false, msg: '', onConfirm: null });

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferData, setTransferData] = useState({ 
    itemId: null, 
    direction: 'TO_LAB', // 'TO_LAB' or 'TO_STOCK'
    quantity: 1, 
    deviceSn: '', 
    note: '' 
  });
  const [allAssets, setAllAssets] = useState([]);
  const [currentLabUsage, setCurrentLabUsage] = useState([]);
  const [labAssignments, setLabAssignments] = useState([]);
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [activeItemName, setActiveItemName] = useState('');

  const fetchConsumables = useCallback(async () => {
    setLoading(true);
    let res;
    if (typeFilter) {
      res = await window.electronAPI.namedQuery('fetchConsumablesListByType', [typeFilter]);
    } else {
      res = await window.electronAPI.namedQuery('fetchConsumablesList');
    }
    if (res.success) setItems(res.rows);
    setLoading(false);
  }, [typeFilter]);

  useEffect(() => {
    fetchConsumables();
    setCurrentPage(1);
  }, [fetchConsumables, searchTerm, typeFilter]);

  const handleDelete = async (id, specification) => {
    if (!window.confirm(`確定要刪除耗材 [${specification}] 嗎？`)) return;
    const res = await window.electronAPI.namedQuery('deleteConsumableMaster', [id]);
    if (res.success) {
      logDelete('CONSUMABLE', id, specification, `刪除耗材品項 [${specification}]`, { id, specification });
      fetchConsumables();
    }
  };

  const handleUpdate = async () => {
    if (!editItem.model || !editItem.specification?.trim()) return alert('請填寫型號與規格 (必填)');
    const res = await window.electronAPI.namedQuery('updateConsumableMaster', [
        editItem.brand, editItem.type, editItem.model, 
        editItem.specification.trim(), editItem.unit || '個', editItem.safety_stock,
        editItem.id
    ]);
    if (res.success) {
      logUpdate('CONSUMABLE', editItem.id, `${editItem.brand} ${editItem.model}`, `編輯耗材規格/型號 [${editItem.brand} ${editItem.model}]`, {
        brand: editItem.brand,
        type: editItem.type,
        model: editItem.model,
        specification: editItem.specification,
        safety_stock: editItem.safety_stock
      });
      setShowEditModal(false);
      fetchConsumables();
    }
  };

  const handleTransferSubmit = async () => {
    const { itemId, direction, quantity, deviceSn, note } = transferData;
    if (quantity <= 0) return alert('請輸入大於 0 的數量');
    
    const targetItem = items.find(i => i.id === itemId);
    if (!targetItem) return;

    // 1. 檢查庫存是否足夠
    if (direction === 'TO_LAB' && targetItem.stock_qty < quantity) {
      return alert(`❌ Stock 庫存不足！\n目前庫存：${targetItem.stock_qty}\n欲移動數量：${quantity}`);
    }
    if (direction === 'TO_STOCK' && targetItem.lab_qty < quantity) {
      return alert(`❌ LAB 庫存不足！\n目前 LAB 數量：${targetItem.lab_qty}\n欲移回數量：${quantity}`);
    }

    // 2. 檢查序號對應
    let finalAssetId = null;
    const currentDeviceSn = (deviceSn || '').trim();
    
    if (currentDeviceSn) {
      const assetRes = await window.electronAPI.namedQuery('findAssetBySn', [currentDeviceSn]);
      if (assetRes.success && assetRes.rows.length > 0) {
        finalAssetId = assetRes.rows[0].id;
      } else {
        return alert(`❌ 無法移動：找不到序號為 [${currentDeviceSn}] 的設備。`);
      }
    } else if (direction === 'TO_LAB') {
      return alert('⚠️ 移至 LAB 時，請選擇欲對應的設備序號');
    }

    const query = direction === 'TO_LAB' ? 'transferStockToLab' : 'transferLabToStock';
    const res = await window.electronAPI.namedQuery(query, [quantity, itemId]);
    
    if (res.success) {
      logUpdate(
        'CONSUMABLE',
        itemId,
        `${targetItem.brand} ${targetItem.model}`,
        `耗材庫存調撥 [${targetItem.brand} ${targetItem.model}]: ${direction === 'TO_LAB' ? 'Stock ➔ LAB' : 'LAB ➔ Stock'} 數量 ${quantity}${currentDeviceSn ? ` (對應設備: ${currentDeviceSn})` : ''}`,
        { direction, quantity, deviceSn: currentDeviceSn, note, prevStock: targetItem.stock_qty, prevLab: targetItem.lab_qty }
      );
      // 只有在有選擇設備或移至 LAB 時才紀錄詳細 assignment
      if (finalAssetId || direction === 'TO_LAB') {
        const insertRes = await window.electronAPI.namedQuery('insertLabAssignment', [
          itemId, 
          finalAssetId, 
          direction === 'TO_LAB' ? quantity : -quantity, 
          direction === 'TO_LAB' ? note : `(從 ${currentDeviceSn || '未知設備'} 移回 Stock) ${note}`
        ]);
        if (!insertRes.success) {
          console.error('Assignment Log Error:', insertRes.error);
          // 不直接將系統錯誤顯示給使用者
        }
      }
      setShowTransferModal(false);
      fetchConsumables();
    } else {
      // 遵循規範 2：避免直接輸出系統預設錯誤訊息或日誌
      alert('⚠️ 庫存移動處理失敗，請確認資料格式或聯絡技術人員。');
    }
  };

  const viewAssignments = async (item) => {
    setActiveItemName(`${item.brand} ${item.type} - ${item.model}`);
    const res = await window.electronAPI.namedQuery('fetchLabAssignments', [item.id]);
    if (res.success) {
      setLabAssignments(res.rows);
      setShowAssignmentModal(true);
    }
  };

  const fetchAssets = useCallback(async () => {
    const res = await window.electronAPI.namedQuery('fetchAllAssetsForSelect');
    if (res.success) setAllAssets(res.rows);
  }, []);

  const fetchItemLabUsage = useCallback(async (itemId) => {
    const res = await window.electronAPI.namedQuery('fetchCurrentLabUsage', [itemId]);
    if (res.success) setCurrentLabUsage(res.rows);
  }, []);

  useEffect(() => {
    if (showTransferModal) {
      fetchAssets();
      if (transferData.itemId) fetchItemLabUsage(transferData.itemId);
    }
  }, [showTransferModal, transferData.itemId, fetchAssets, fetchItemLabUsage]);

  const filteredItems = items.filter(item => {
    // 1. 依選取之「類型卡片」或「側邊欄類型」進行篩選
    const effectiveType = selectedType || typeFilter;
    if (effectiveType && item.type !== effectiveType) {
      return false;
    }

    // 2. 關鍵字搜尋 (廠牌、型號、規格、類型)
    const searchTerms = searchTerm.toLowerCase().split(/\s+/).filter(t => t);
    if (searchTerms.length === 0) return true;
    
    return searchTerms.every(term => 
      (item.specification || '').toLowerCase().includes(term) || 
      (item.brand || '').toLowerCase().includes(term) || 
      (item.model || '').toLowerCase().includes(term) || 
      (item.type || '').toLowerCase().includes(term)
    );
  });

  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const paginatedItems = filteredItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // --- 儀表板拖曳排序邏輯 ---
  const [typeOrder, setTypeOrder] = useState(() => {
    try {
      const saved = localStorage.getItem('consumable_type_order');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [draggingCardKey, setDraggingCardKey] = useState(null);

  const [retiredKeys, setRetiredKeys] = useState(() => {
    try {
      const saved = localStorage.getItem('consumable_list_retired_keys');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const handleTypeDragStart = (e, key) => {
    setDraggingCardKey(key);
    e.dataTransfer.setData('text/plain', key);
  };

  const handleTypeDrop = (e, targetKey, currentKeys) => {
    e.preventDefault();
    const sourceKey = e.dataTransfer.getData('text/plain');
    if (!sourceKey || sourceKey === targetKey) {
      setDraggingCardKey(null);
      return;
    }
    const newOrder = [...currentKeys];
    const sourceIdx = newOrder.indexOf(sourceKey);
    const targetIdx = newOrder.indexOf(targetKey);
    if (sourceIdx > -1 && targetIdx > -1) {
      newOrder.splice(sourceIdx, 1);
      newOrder.splice(targetIdx, 0, sourceKey);
      setTypeOrder(newOrder);
      localStorage.setItem('consumable_type_order', JSON.stringify(newOrder));
    }
    setDraggingCardKey(null);
  };

  const toggleRetire = (e, key) => {
    e.stopPropagation();
    const isRetired = retiredKeys.includes(key);
    const msg = isRetired ? `確定要將此卡片從汰舊區復原嗎？` : `確定要將此卡片移至汰舊區嗎？`;
    
    setConfirmModal({
      show: true,
      msg,
      onConfirm: () => {
        const newRetired = isRetired 
          ? retiredKeys.filter(k => k !== key)
          : [...retiredKeys, key];
        setRetiredKeys(newRetired);
        localStorage.setItem('consumable_list_retired_keys', JSON.stringify(newRetired));
        window.dispatchEvent(new CustomEvent('retired-update'));
        setConfirmModal({ show: false, msg: '', onConfirm: null });
      }
    });
  };

  const handleCardClick = (typeName) => {
    setSelectedType(prev => (prev === typeName ? null : typeName));
    setShowAll(false);
    setCurrentPage(1);
  };

  const renderStats = () => {
    // 依「類型 (Type)」分組匯總
    const statsMap = items.reduce((acc, curr) => {
      const typeStr = (curr.type || '未分類').trim();
      const key = typeStr;
      if (!acc[key]) {
        acc[key] = {
          key,
          type: typeStr,
          models: new Set(),
          brands: new Set(),
          stock_qty: 0,
          lab_qty: 0,
          total_qty: 0,
          hasLowStock: false
        };
      }
      if (curr.model) acc[key].models.add(curr.model);
      if (curr.brand) acc[key].brands.add(curr.brand);
      const stock = Number(curr.stock_qty || 0);
      const lab = Number(curr.lab_qty || 0);
      const safety = Number(curr.safety_stock || 0);
      acc[key].stock_qty += stock;
      acc[key].lab_qty += lab;
      acc[key].total_qty += (stock + lab);
      if (safety > 0 && (stock + lab) <= safety) {
        acc[key].hasLowStock = true;
      }
      return acc;
    }, {});

    Object.values(statsMap).forEach(st => {
      st.modelsCount = st.models.size;
      st.brandsCount = st.brands.size;
    });

    const allKeys = Object.keys(statsMap);
    if (allKeys.length === 0) return null;

    const activeKeys = allKeys.filter(k => !retiredKeys.includes(k));
    const retiredList = allKeys.filter(k => retiredKeys.includes(k)).map(k => statsMap[k]);

    // 依排序記憶體排列表格
    const orderedActiveKeys = [
      ...typeOrder.filter(k => activeKeys.includes(k)),
      ...activeKeys.filter(k => !typeOrder.includes(k))
    ];

    const displayKeys = orderedActiveKeys.filter(k => {
      if (!searchTerm) return true;
      const lk = k.toLowerCase();
      const terms = searchTerm.toLowerCase().split(/\s+/).filter(t => t);
      return terms.some(t => lk.includes(t));
    });

    const renderCard = (st, isDraggable = false, isRetired = false) => {
      const isSelected = selectedType === st.type;
      return (
        <div
          key={st.key}
          draggable={isDraggable}
          onDragStart={isDraggable ? (e) => handleTypeDragStart(e, st.key) : undefined}
          onClick={() => handleCardClick(st.type)}
          style={{
            backgroundColor: isSelected ? 'var(--primary-bg)' : 'var(--bg-surface)',
            padding: '14px 16px',
            borderRadius: '14px',
            border: isSelected ? '2px solid var(--primary-color)' : '1px solid var(--border-color)',
            boxShadow: isSelected ? '0 4px 12px rgba(37, 99, 235, 0.18)' : 'var(--card-shadow)',
            cursor: 'pointer',
            minHeight: '72px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            transition: 'all 0.15s ease',
            position: 'relative',
            opacity: isRetired ? 0.6 : (draggingCardKey === st.key ? 0.3 : 1),
            boxSizing: 'border-box'
          }}
          onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.transform = 'translateY(-2px)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
        >
          {/* 右上角警示與操作 */}
          <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            {st.hasLowStock && (
              <span title="此類型中有品項低於安全庫存">
                <AlertTriangle size={15} color="#ef4444" fill="#fee2e2" />
              </span>
            )}
            <button
              onClick={(e) => toggleRetire(e, st.key)}
              style={{
                border: 'none',
                background: isRetired ? 'var(--bg-surface-hover)' : 'none',
                color: isRetired ? 'var(--text-main)' : 'var(--text-subtle)',
                borderRadius: '4px',
                padding: '3px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center'
              }}
              title={isRetired ? '復原此卡片' : '移至汰舊區'}
            >
              {isRetired ? <RotateCcw size={13} /> : <Archive size={13} />}
            </button>
          </div>

          {/* 類型標題與型號統計 */}
          <div>
            <div style={{ fontSize: '15px', fontWeight: '900', color: isSelected ? 'var(--primary-color)' : 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px', paddingRight: '42px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <Package size={18} color={isSelected ? 'var(--primary-color)' : 'var(--text-muted)'} />
              <span>{st.type}</span>
            </div>
            <div style={{ color: isSelected ? 'var(--primary-color)' : 'var(--text-muted)', fontSize: '13px', fontWeight: '600', marginTop: '6px', paddingLeft: '24px' }}>
              {st.brandsCount} 個廠牌 · {st.modelsCount} 款型號
            </div>
          </div>
        </div>
      );
    };

    const renderRetiredSection = (list) => {
      if (list.length === 0) return null;
      return (
        <div style={{ marginTop: '24px', borderTop: '2px dashed var(--border-color)', paddingTop: '24px', marginBottom: '24px', width: '100%' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '800', color: 'var(--text-muted)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Archive size={16} /> 汰舊 / 停用類型 (Retired Types)
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '14px' }}>
            {list.map(st => renderCard(st, false, true))}
          </div>
        </div>
      );
    };

    return (
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '14px', padding: '16px', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '16px', border: '1px solid var(--border-color)' }}>
          {displayKeys.map(key => {
            const st = statsMap[key];
            if (!st) return null;
            return (
              <div
                key={key}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleTypeDrop(e, key, orderedActiveKeys)}
              >
                {renderCard(st, true, false)}
              </div>
            );
          })}
        </div>
        {renderRetiredSection(retiredList)}
      </div>
    );
  };

  const containerStyle = {
    padding: isSplitMode ? '0' : '24px',
    backgroundColor: isSplitMode ? 'transparent' : 'var(--bg-app)',
    minHeight: isSplitMode ? 'auto' : '100vh'
  };
  const cardStyle = { backgroundColor: 'var(--bg-surface)', borderRadius: '16px', padding: '24px', boxShadow: 'var(--card-shadow)', border: '1px solid var(--border-color)' };
  const thStyle = { textAlign: 'left', padding: '14px', borderBottom: '2px solid var(--border-color)', color: 'var(--text-main)', fontSize: '12px', fontWeight: '900' };
  const tdStyle = { padding: '14px', fontSize: '13px' };
  const navBtnStyle = { padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-main)', cursor: 'pointer', fontWeight: '700' };
  const menuButtonStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    padding: '10px 12px',
    border: 'none',
    background: 'none',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 0.2s'
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div>
              <h1 style={{ fontSize: '24px', fontWeight: '900', color: 'var(--text-main)', margin: 0 }}>
                {typeFilter ? `${typeFilter} - 耗材清單` : '耗材列表 (Consumable List)'}
              </h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px', marginBottom: 0 }}>追蹤目前各項批次耗材之庫存數量與領用狀況。</p>
            </div>
            {!isSplitMode && (
              <div style={{ display: 'flex', gap: '8px', backgroundColor: 'var(--bg-surface-subtle)', padding: '4px', borderRadius: '10px' }}>
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
                  ➕ 新增耗材 (Add Consumable)
                </button>
                <button
                  onClick={() => setShowBatchImport(true)}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-main)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: 'var(--card-shadow)'
                  }}
                >
                  📥 批次匯入 (Batch Import)
                </button>
              </div>
            )}
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-subtle)' }} />
            <input type="text" placeholder="快速搜尋廠牌、型號、規格..." value={searchTerm} onChange={(e) => {setSearchTerm(e.target.value); setCurrentPage(1);}} style={{ padding: '10px 12px 10px 42px', borderRadius: '30px', border: '1.5px solid var(--input-border)', backgroundColor: 'var(--input-bg)', color: 'var(--input-text)', width: '300px' }} />
          </div>
        </div>

        {renderStats()}

        {/* 類型篩選提示列 */}
        {selectedType && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'var(--primary-bg)', border: '1px solid var(--primary-border)', padding: '10px 18px', borderRadius: '12px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary-color)', fontWeight: 800, fontSize: '14px' }}>
              <Package size={18} color="var(--primary-color)" />
              目前檢視類型：<span style={{ color: 'var(--primary-color)', fontSize: '15px' }}>{selectedType}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: '12px', fontWeight: 500, marginLeft: '6px' }}>（共 {filteredItems.length} 種品項 / 型號）</span>
            </div>
            <button 
              onClick={() => setSelectedType(null)} 
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '6px 12px', color: 'var(--text-main)', cursor: 'pointer', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', boxShadow: 'var(--card-shadow)' }}
            >
              <X size={14} /> 清除類型篩選
            </button>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '100px', color: 'var(--text-muted)' }}>載入中...</div>
        ) : (typeFilter || searchTerm || selectedType || showAll) ? (
          <>
            <div style={{ marginBottom: '20px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'auto' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color)', backgroundColor: 'var(--table-header-bg)' }}>
                    <th style={{ ...thStyle, width: '220px' }}>廠牌 / 型號 / 類型</th>
                    <th style={{ ...thStyle, width: '150px' }}>規格</th>
                    <th style={{ ...thStyle, width: '80px', textAlign: 'center', color: 'var(--primary-color)' }}>Stock</th>
                    <th style={{ ...thStyle, width: '80px', textAlign: 'center', color: '#a855f7' }}>LAB</th>
                    <th style={{ ...thStyle, width: '80px', textAlign: 'center' }}>Total</th>
                    <th style={{ ...thStyle, width: '100px', textAlign: 'center' }}>安全庫存</th>
                    <th style={{ ...thStyle, textAlign: 'center', width: '120px' }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map(item => (
                    <tr key={item.id} style={{ borderBottom: '1px solid var(--table-border)' }}>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 800, color: 'var(--text-main)' }}>{item.brand}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{item.type} - {item.model}</div>
                      </td>
                      <td style={{ ...tdStyle, fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '150px' }} title={item.specification}>{item.specification || '--'}</td>
                      <td style={{ ...tdStyle, fontWeight: 700, color: 'var(--primary-color)', textAlign: 'center' }}>{item.stock_qty || 0}</td>
                      <td style={{ ...tdStyle, fontWeight: 700, color: '#a855f7', cursor: 'pointer', textDecoration: 'underline', textAlign: 'center' }} onClick={() => viewAssignments(item)}>{item.lab_qty || 0}</td>
                      <td style={{ 
                        ...tdStyle, 
                        fontWeight: 800, 
                        color: (Number(item.safety_stock) > 0 && ((Number(item.stock_qty) || 0) + (Number(item.lab_qty) || 0)) <= Number(item.safety_stock)) ? '#ef4444' : '#10b981', 
                        textAlign: 'center' 
                      }}>
                        {(Number(item.stock_qty) || 0) + (Number(item.lab_qty) || 0)}
                      </td>
                      <td style={{ ...tdStyle, color: 'var(--text-muted)', textAlign: 'center' }}>{item.safety_stock}</td>
                      <td style={{ ...tdStyle, textAlign: 'center', width: '120px', position: 'relative' }}>
                        <button 
                          className="action-menu-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (activeMenuId === item.id) {
                              setActiveMenuId(null);
                              setMenuPosition(null);
                            } else {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const menuHeight = 220;
                              const isUpward = rect.bottom + menuHeight > window.innerHeight && rect.top > menuHeight;
                              setActiveMenuId(item.id);
                              setMenuPosition({
                                top: isUpward ? rect.top - 4 : rect.bottom + 4,
                                right: window.innerWidth - rect.right,
                                isUpward
                              });
                            }
                          }} 
                          style={{ border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
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
                              minWidth: '160px', 
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
                                setLedgerItem({ item_master_id: item.id, brand: item.brand, model: item.model, type: item.type, current_stock: item.stock_qty });
                              }} 
                              style={{ ...menuButtonStyle, color: 'var(--text-main)' }}
                            >
                              <History size={14} /> 履歷 (History)
                            </button>
                            <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '2px 0' }} />
                            <button onClick={() => { setActiveMenuId(null); setMenuPosition(null); setEditItem({ ...item }); setShowEditModal(true); }} style={menuButtonStyle}><Edit2 size={14} /> 編輯詳細資訊</button>
                            <button onClick={() => { setActiveMenuId(null); setMenuPosition(null); setTransferData({ itemId: item.id, direction: 'TO_LAB', quantity: 1, deviceSn: '', note: '' }); setShowTransferModal(true); }} style={{ ...menuButtonStyle, color: 'var(--primary-color)' }}><ArrowLeftRight size={14} /> 庫存異動 (Stock↔LAB)</button>
                            <div style={{ height: '1px', backgroundColor: 'var(--border-color)', margin: '4px 0' }} />
                            <button onClick={() => { setActiveMenuId(null); setMenuPosition(null); handleDelete(item.item_id || item.id, item.specification); }} style={{ ...menuButtonStyle, color: '#f43f5e', backgroundColor: 'rgba(244,63,94,0.1)' }}><Trash2 size={14} /> 刪除耗材</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '20px' }}>
                  <button disabled={currentPage === 1} onClick={() => { setCurrentPage(prev => prev - 1); window.scrollTo(0,0); }} style={{ ...navBtnStyle, opacity: currentPage === 1 ? 0.5 : 1 }}>上一頁</button>
                  <span style={{ display: 'flex', alignItems: 'center', fontWeight: '800', color: 'var(--text-muted)' }}>第 {currentPage} 頁 / 共 {totalPages} 頁</span>
                  <button disabled={currentPage === totalPages} onClick={() => { setCurrentPage(prev => prev + 1); window.scrollTo(0,0); }} style={{ ...navBtnStyle, opacity: currentPage === totalPages ? 0.5 : 1 }}>下一頁</button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '60px 20px', backgroundColor: 'var(--bg-surface-subtle)', borderRadius: '16px', border: '1px dashed var(--border-color)', marginTop: '20px' }}>
            <Package size={40} color="var(--text-subtle)" style={{ marginBottom: '12px' }} />
            <div style={{ color: 'var(--text-main)', fontSize: '15px', fontWeight: '700' }}>請點擊上方「類型卡片」查看該分類下的所有廠牌與型號</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '6px', marginBottom: '16px' }}>您也可以直接使用搜尋框關鍵字尋找，或點擊下方按鈕展開完整清單</div>
            <button 
              onClick={() => setShowAll(true)}
              style={{ padding: '8px 20px', backgroundColor: 'var(--primary-color)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '700', cursor: 'pointer', boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)' }}
            >
              顯示全部耗材清單 ({items.length} 項)
            </button>
          </div>
        )}
      </div>

      {showEditModal && editItem && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}><h2 style={{ fontSize: '20px', fontWeight: '900' }}>修改耗材資訊</h2><X size={24} style={{ cursor: 'pointer' }} onClick={() => setShowEditModal(false)} /></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={editLabelStyle}>廠牌 / 類型 / 型號 (鎖定)</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input type="text" value={editItem.brand || ''} disabled style={{ ...editInputStyle, backgroundColor: '#f1f5f9', width: '30%', cursor: 'not-allowed' }} />
                  <input type="text" value={editItem.type || ''} disabled style={{ ...editInputStyle, backgroundColor: '#f1f5f9', width: '30%', cursor: 'not-allowed' }} />
                  <input type="text" value={editItem.model || ''} disabled style={{ ...editInputStyle, backgroundColor: '#f1f5f9', flex: 1, cursor: 'not-allowed' }} />
                </div>
              </div>
              
              <div>
                <label style={editLabelStyle}>規格 <span style={{ color: '#ef4444' }}>*</span></label>
                <textarea value={editItem.specification} onChange={(e) => setEditItem({...editItem, specification: e.target.value})} style={{ ...editInputStyle, minHeight: '80px', lineHeight: '1.5' }} />
              </div>

              <div>
                <label style={editLabelStyle}>安全庫存</label>
                <input type="number" value={editItem.safety_stock} onChange={(e) => setEditItem({...editItem, safety_stock: parseInt(e.target.value) || 0})} style={editInputStyle} />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px', borderTop: '1px solid #f1f5f9', paddingTop: '24px' }}>
                <button onClick={handleUpdate} style={{ flex: 1, padding: '14px', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer' }}>儲存變更</button>
                <button onClick={() => setShowEditModal(false)} style={{ padding: '14px 24px', backgroundColor: '#f1f5f9', border: 'none', borderRadius: '10px', cursor: 'pointer' }}>取消</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showTransferModal && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '900' }}>庫存移動 (Stock ↔ LAB)</h2>
              <X size={24} style={{ cursor: 'pointer' }} onClick={() => setShowTransferModal(false)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={editLabelStyle}>移動方向</label>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button onClick={() => setTransferData({...transferData, direction: 'TO_LAB'})} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: transferData.direction === 'TO_LAB' ? '#2563eb' : 'white', color: transferData.direction === 'TO_LAB' ? 'white' : '#1e293b', fontWeight: 700, cursor: 'pointer' }}>移至 LAB</button>
                  <button onClick={() => setTransferData({...transferData, direction: 'TO_STOCK'})} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: transferData.direction === 'TO_STOCK' ? '#7c3aed' : 'white', color: transferData.direction === 'TO_STOCK' ? 'white' : '#1e293b', fontWeight: 700, cursor: 'pointer' }}>移回 Stock</button>
                </div>
              </div>
              <div>
                <label style={editLabelStyle}>數量 *</label>
                <input type="number" value={transferData.quantity} onChange={(e) => setTransferData({...transferData, quantity: parseInt(e.target.value)||0})} style={editInputStyle} />
              </div>
              <div>
                <label style={editLabelStyle}>
                  {transferData.direction === 'TO_LAB' ? '輸入或選擇設備 (Device SN) *' : '選擇退回來源設備 (FROM Device SN) *'}
                </label>
                {transferData.direction === 'TO_LAB' ? (
                  <>
                    <input 
                      list="asset-suggestions"
                      placeholder="輸入 SN 或從選單選擇..."
                      value={transferData.deviceSn}
                      onChange={(e) => setTransferData({...transferData, deviceSn: e.target.value})}
                      style={editInputStyle}
                    />
                    <datalist id="asset-suggestions">
                      {allAssets.map(asset => (
                        <option key={asset.id} value={asset.sn}>
                          {asset.hostname ? `${asset.hostname} - ` : ''}{asset.brand} {asset.model}
                        </option>
                      ))}
                    </datalist>
                  </>
                ) : (
                  <select 
                    value={transferData.deviceSn}
                    onChange={(e) => setTransferData({...transferData, deviceSn: e.target.value})}
                    style={editInputStyle}
                  >
                    <option value="">--- 選擇退回來源 ---</option>
                    {currentLabUsage.map(asset => (
                      <option key={asset.asset_id} value={asset.sn}>
                        [{asset.sn}] {asset.hostname ? `${asset.hostname} - ` : ''}{asset.brand} {asset.model} (現有: {asset.current_qty})
                      </option>
                    ))}
                  </select>
                )}
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                  {transferData.direction === 'TO_LAB' ? '耗材將撥充至此設備 (可手動輸入或選取)' : '耗材將從此設備扣除並移回庫存'}
                </div>
              </div>
              <div>
                <label style={editLabelStyle}>備註</label>
                <input type="text" placeholder="例如：測試用途、維修領用" value={transferData.note} onChange={(e) => setTransferData({...transferData, note: e.target.value})} style={editInputStyle} />
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button onClick={handleTransferSubmit} style={{ flex: 1, padding: '14px', backgroundColor: transferData.direction === 'TO_LAB' ? '#2563eb' : '#7c3aed', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer' }}>確認移動</button>
                <button onClick={() => setShowTransferModal(false)} style={{ padding: '14px 24px', backgroundColor: '#f1f5f9', border: 'none', borderRadius: '10px', cursor: 'pointer' }}>取消</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAssignmentModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'var(--bg-modal-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-main)', width: '600px', padding: '32px', borderRadius: '16px', boxShadow: 'var(--modal-shadow)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '900', color: 'var(--text-main)', margin: 0 }}>LAB 使用紀錄: {activeItemName}</h2>
              <X size={24} style={{ cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setShowAssignmentModal(false)} />
            </div>
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color)', backgroundColor: 'var(--table-header-bg)' }}>
                    <th style={thStyle}>日期</th>
                    <th style={thStyle}>Device</th>
                    <th style={thStyle}>數量</th>
                    <th style={thStyle}>備註</th>
                  </tr>
                </thead>
                <tbody>
                  {labAssignments.length === 0 ? (
                    <tr><td colSpan="4" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>尚無詳細使用紀錄</td></tr>
                  ) : (
                    labAssignments.map(la => (
                      <tr key={la.id} style={{ borderBottom: '1px solid var(--table-border)' }}>
                        <td style={{ ...tdStyle, fontSize: '11px' }}>{new Date(la.created_at).toLocaleString()}</td>
                        <td style={tdStyle}>
                          {la.sn ? (
                            <div>
                              {la.hostname && <div style={{ fontWeight: 800, color: 'var(--text-main)' }}>{la.hostname}</div>}
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: la.hostname ? 'normal' : '800' }}>{la.sn}</div>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-subtle)' }}>-</span>
                          )}
                        </td>
                        <td style={{ ...tdStyle, fontWeight: 700, color: la.quantity > 0 ? '#7c3aed' : '#ef4444' }}>{la.quantity > 0 ? `+${la.quantity}` : la.quantity}</td>
                        <td style={tdStyle}>{la.note || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <button onClick={() => setShowAssignmentModal(false)} style={{ width: '100%', marginTop: '24px', padding: '12px', backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-main)', border: '1px solid var(--border-color)', borderRadius: '10px', fontWeight: 700, cursor: 'pointer' }}>關閉</button>
          </div>
        </div>
      )}

      {confirmModal.show && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'var(--bg-modal-overlay)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 11000 }}>
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

      {/* 新增耗材彈窗 Modal */}
      <ConsumableRegistrationModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={fetchConsumables}
      />

      {/* 耗材批次匯入 Modal */}
      <ConsumableBatchImportModal
        isOpen={showBatchImport}
        onClose={() => setShowBatchImport(false)}
        onSuccess={() => {
          setShowBatchImport(false);
          fetchConsumables();
        }}
      />
    </div>
  );
};


export default ConsumableList;
