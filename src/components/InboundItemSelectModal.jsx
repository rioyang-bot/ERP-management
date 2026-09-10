import React, { useState, useMemo } from 'react';
import { X, Search, Plus, Check, Layers, Package, Cpu, Tag, AlertTriangle, ShoppingBag, Trash2 } from 'lucide-react';

const CATEGORIES = [
  { key: 'ALL', label: '全部品項', icon: Layers },
  { key: '設備', label: '設備 (Device)', icon: Package },
  { key: '硬體', label: '硬體 (Hardware)', icon: Cpu },
  { key: '耗材', label: '耗材 (Consumable)', icon: Tag }
];

const InboundItemSelectModal = ({
  isOpen,
  onClose,
  items = [],
  onSelect,
  onBatchAdd,
  onSingleAdd,
  onOpenQuickAdd,
  onItemDeleted,
  isSingleSelect = false
}) => {
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('ALL');
  const [onlyLowStock, setOnlyLowStock] = useState(false);
  const [deletedIds, setDeletedIds] = useState([]);

  // 剔除已刪除品項
  const activeItems = useMemo(() => {
    return items.filter((i) => !deletedIds.includes(i.id));
  }, [items, deletedIds]);

  // 勾選與數量狀態
  const [checkedIds, setCheckedIds] = useState({});
  const [quantities, setQuantities] = useState({});

  // 計算各分類數量
  const categoryCounts = useMemo(() => {
    const counts = { ALL: activeItems.length, 設備: 0, 硬體: 0, 耗材: 0 };
    activeItems.forEach((item) => {
      if (item.cat_name && counts[item.cat_name] !== undefined) {
        counts[item.cat_name]++;
      }
    });
    return counts;
  }, [activeItems]);

  // 刪除孤立/無庫存品項主檔
  const handleDeleteItemMaster = async (item) => {
    const confirmMsg = `確定要永久刪除此無庫存品項主檔嗎？\n\n廠牌：${item.brand || '--'}\n型號：${item.model || '--'}\n規格：${item.specification || item.type || '--'}\n\n※ 系統將驗證是否無關聯資產或單據，確認後將永久清除。`;
    if (typeof window !== 'undefined' && window.confirm && !window.confirm(confirmMsg)) return;

    try {
      const res = await window.electronAPI.namedQuery('deleteItemMasterIfOrphan', [item.id]);
      if (res && res.success && res.rows && res.rows.length > 0) {
        setDeletedIds((prev) => [...prev, item.id]);
        if (onItemDeleted) {
          onItemDeleted(item.id);
        }
      } else {
        if (typeof window !== 'undefined' && window.alert) {
          window.alert('刪除失敗：該品項可能仍有關聯之資產、進出貨記錄或借用記錄，無法直接刪除。');
        }
      }
    } catch (err) {
      console.error('刪除品項主檔失敗:', err);
    }
  };

  // 動態取得可用的廠牌清單 (依據選取類別)
  const availableBrands = useMemo(() => {
    let list = activeItems;
    if (selectedCategory !== 'ALL') {
      list = list.filter((i) => i.cat_name === selectedCategory);
    }
    const brands = Array.from(new Set(list.map((i) => (i.brand ? i.brand.trim() : '')).filter(Boolean))).sort();
    return ['ALL', ...brands];
  }, [activeItems, selectedCategory]);

  // 多關鍵字模糊比對與廠牌/類別/低庫存過濾
  const filteredItems = useMemo(() => {
    const tokens = searchTerm.trim().toLowerCase().split(/\s+/).filter(Boolean);

    return activeItems.filter((item) => {
      // 類別過濾
      if (selectedCategory !== 'ALL' && item.cat_name !== selectedCategory) {
        return false;
      }

      // 廠牌過濾
      if (selectedBrand !== 'ALL' && (item.brand || '').trim() !== selectedBrand) {
        return false;
      }

      // 僅顯示低於安全庫存
      if (onlyLowStock) {
        const isLow = Number(item.safety_stock) > 0 && Number(item.current_stock || 0) < Number(item.safety_stock);
        if (!isLow) return false;
      }

      // 關鍵字比對
      if (tokens.length > 0) {
        const textToSearch = [
          item.cat_name,
          item.brand,
          item.model,
          item.type,
          item.specification
        ].filter(Boolean).join(' ').toLowerCase();

        const isMatch = tokens.every((token) => textToSearch.includes(token));
        if (!isMatch) return false;
      }

      return true;
    });
  }, [activeItems, selectedCategory, selectedBrand, onlyLowStock, searchTerm]);

  if (!isOpen) return null;

  const checkedCount = Object.values(checkedIds).filter(Boolean).length;
  const isAllCurrentChecked = filteredItems.length > 0 && filteredItems.every((i) => checkedIds[i.id]);

  const handleToggleCheck = (itemId) => {
    setCheckedIds((prev) => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
    if (!quantities[itemId]) {
      setQuantities((prev) => ({ ...prev, [itemId]: 1 }));
    }
  };

  const handleQuantityChange = (itemId, val) => {
    const num = Math.max(1, parseInt(val, 10) || 1);
    setQuantities((prev) => ({ ...prev, [itemId]: num }));
    setCheckedIds((prev) => ({ ...prev, [itemId]: true }));
  };

  const handleToggleSelectAll = () => {
    const nextChecked = { ...checkedIds };
    const nextQuantities = { ...quantities };

    filteredItems.forEach((i) => {
      nextChecked[i.id] = !isAllCurrentChecked;
      if (!isAllCurrentChecked && !nextQuantities[i.id]) {
        nextQuantities[i.id] = 1;
      }
    });

    setCheckedIds(nextChecked);
    setQuantities(nextQuantities);
  };

  const handleBatchConfirm = () => {
    const selectedList = items
      .filter((item) => checkedIds[item.id])
      .map((item) => ({
        ...item,
        quantity: quantities[item.id] || 1
      }));

    if (selectedList.length === 0) return;

    if (onBatchAdd) {
      onBatchAdd(selectedList);
    } else if (onSelect && selectedList.length === 1) {
      onSelect(selectedList[0]);
    }
    onClose();
  };

  const handleSingleConfirm = (item) => {
    const qty = quantities[item.id] || 1;
    if (onSingleAdd) {
      onSingleAdd(item, qty);
    } else if (onSelect) {
      onSelect({ ...item, quantity: qty });
    } else if (onBatchAdd) {
      onBatchAdd([{ ...item, quantity: qty }]);
    }
    onClose();
  };

  const handleRowClick = (item) => {
    if (isSingleSelect || (onSelect && !onBatchAdd)) {
      handleSingleConfirm(item);
      return;
    }
    handleToggleCheck(item.id);
  };

  const getCategoryBadgeStyle = (catName) => {
    switch (catName) {
      case '設備':
        return { backgroundColor: 'rgba(79, 70, 229, 0.12)', color: '#6366f1', border: '1px solid rgba(79, 70, 229, 0.3)' };
      case '硬體':
        return { backgroundColor: 'rgba(219, 39, 119, 0.12)', color: '#ec4899', border: '1px solid rgba(219, 39, 119, 0.3)' };
      case '耗材':
        return { backgroundColor: 'rgba(16, 185, 129, 0.12)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)' };
      default:
        return { backgroundColor: 'var(--bg-surface-subtle)', color: 'var(--text-muted)', border: '1px solid var(--border-color)' };
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 1200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-color)',
          borderRadius: '16px',
          width: '980px',
          maxWidth: '96vw',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          color: 'var(--text-main)'
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'var(--bg-surface-subtle)'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Package size={20} color="var(--primary-color)" /> 選取庫存品項 (Select Item Master)
            </h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              可切換類別標籤或輸入關鍵字搜尋，支援勾選單筆或多筆品項批次加入進貨單。
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {onOpenQuickAdd && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenQuickAdd();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  backgroundColor: 'var(--primary-color)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                <Plus size={16} /> 快速新增品項
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '6px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center'
              }}
              aria-label="關閉"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Filter Controls */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* 類別切換標籤 (Category Tabs) */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const isActive = selectedCategory === cat.key;
                const count = categoryCounts[cat.key] || 0;

                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => {
                      setSelectedCategory(cat.key);
                      setSelectedBrand('ALL');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 14px',
                      borderRadius: '20px',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: isActive ? '1.5px solid var(--primary-color)' : '1px solid var(--border-color)',
                      backgroundColor: isActive ? 'var(--primary-color)' : 'var(--bg-surface-subtle)',
                      color: isActive ? '#ffffff' : 'var(--text-main)',
                      transition: 'all 0.15s ease'
                    }}
                    data-testid={`category-filter-${cat.key}`}
                  >
                    <Icon size={14} />
                    <span>{cat.label}</span>
                    <span style={{
                      fontSize: '11px',
                      padding: '1px 6px',
                      borderRadius: '10px',
                      backgroundColor: isActive ? 'rgba(255, 255, 255, 0.25)' : 'var(--border-color)',
                      color: isActive ? '#ffffff' : 'var(--text-muted)'
                    }}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* 低於安全庫存快篩切換 */}
            <button
              type="button"
              onClick={() => setOnlyLowStock((prev) => !prev)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                border: onlyLowStock ? '1px solid #f59e0b' : '1px solid var(--border-color)',
                backgroundColor: onlyLowStock ? 'rgba(245, 158, 11, 0.15)' : 'var(--bg-surface-subtle)',
                color: onlyLowStock ? '#d97706' : 'var(--text-muted)',
                transition: 'all 0.15s ease'
              }}
              data-testid="low-stock-toggle"
            >
              <AlertTriangle size={14} />
              <span>僅看低於安全庫存</span>
            </button>
          </div>

          {/* 搜尋列與廠牌過濾 */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* 關鍵字搜尋 */}
            <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
              <Search
                size={16}
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-subtle)'
                }}
              />
              <input
                type="text"
                placeholder="多關鍵字搜尋 (例如: Cisco 3548、METECH、電源線)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 36px 9px 36px',
                  borderRadius: '8px',
                  border: '1.5px solid var(--input-border)',
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--input-text)',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
                autoFocus
                data-testid="item-search-input"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  style={{
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '2px'
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* 廠牌快篩下拉 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>廠牌：</span>
              <select
                value={selectedBrand}
                onChange={(e) => setSelectedBrand(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--input-border)',
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--input-text)',
                  fontSize: '13px',
                  outline: 'none',
                  minWidth: '130px'
                }}
                data-testid="item-brand-select"
              >
                <option value="ALL">全部廠牌 ({availableBrands.length - 1})</option>
                {availableBrands.filter((b) => b !== 'ALL').map((brand) => (
                  <option key={brand} value={brand}>{brand}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Table Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px' }}>
          {filteredItems.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '48px 16px',
              color: 'var(--text-muted)'
            }}>
              <AlertTriangle size={36} style={{ marginBottom: '12px', opacity: 0.5 }} />
              <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>
                找不到符合條件的品項
              </div>
              <div style={{ fontSize: '13px' }}>
                請嘗試修改搜尋條件，或點選右上角「+ 快速新增品項」建立新規格。
              </div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '12px', marginBottom: '16px' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-surface-subtle)', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '10px 8px', width: '40px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={isAllCurrentChecked}
                      onChange={handleToggleSelectAll}
                      style={{ cursor: 'pointer', transform: 'scale(1.15)' }}
                      title="全選/全取消目前過濾品項"
                      data-testid="select-all-checkbox"
                    />
                  </th>
                  <th style={{ padding: '10px 10px', fontSize: '12px', fontWeight: 800, width: '75px' }}>類別</th>
                  <th style={{ padding: '10px 10px', fontSize: '12px', fontWeight: 800, width: '100px' }}>廠牌</th>
                  <th style={{ padding: '10px 10px', fontSize: '12px', fontWeight: 800, width: '170px' }}>型號</th>
                  <th style={{ padding: '10px 10px', fontSize: '12px', fontWeight: 800 }}>規格 / 備註說明</th>
                  <th style={{ padding: '10px 10px', fontSize: '12px', fontWeight: 800, width: '130px', textAlign: 'center' }}>現有 / 安全庫存</th>
                  <th style={{ padding: '10px 10px', fontSize: '12px', fontWeight: 800, width: '90px', textAlign: 'center' }}>進貨數量</th>
                  <th style={{ padding: '10px 10px', fontSize: '12px', fontWeight: 800, width: '70px', textAlign: 'center' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const badgeStyle = getCategoryBadgeStyle(item.cat_name);
                  const isChecked = !!checkedIds[item.id];
                  const itemQty = quantities[item.id] || 1;
                  const currentStock = Number(item.current_stock || 0);
                  const safetyStock = Number(item.safety_stock || 0);
                  const isLow = safetyStock > 0 && currentStock < safetyStock;

                  return (
                    <tr
                      key={item.id}
                      onClick={() => handleRowClick(item)}
                      style={{
                        borderBottom: '1px solid var(--border-color)',
                        cursor: 'pointer',
                        backgroundColor: isChecked ? 'rgba(37, 99, 235, 0.05)' : 'transparent',
                        transition: 'background-color 0.15s ease'
                      }}
                      onMouseEnter={(e) => {
                        if (!isChecked) e.currentTarget.style.backgroundColor = 'var(--bg-surface-subtle)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isChecked) e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                      data-testid={`item-row-${item.id}`}
                    >
                      <td style={{ padding: '10px 8px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleCheck(item.id)}
                          style={{ cursor: 'pointer', transform: 'scale(1.15)' }}
                          data-testid={`item-checkbox-${item.id}`}
                        />
                      </td>
                      <td style={{ padding: '10px 10px' }}>
                        <span style={{
                          padding: '3px 7px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 700,
                          ...badgeStyle
                        }}>
                          {item.cat_name || '其他'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 10px', fontWeight: 700, fontSize: '13px' }}>
                        {item.brand || '--'}
                      </td>
                      <td style={{ padding: '10px 10px', fontWeight: 700, fontSize: '13px', color: 'var(--primary-color)' }}>
                        {item.model || '--'}
                      </td>
                      <td style={{ padding: '10px 10px', fontSize: '13px', color: 'var(--text-muted)' }}>
                        {item.specification || item.type || '--'}
                      </td>
                      <td style={{ padding: '10px 10px', textAlign: 'center', fontSize: '12px' }}>
                        <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                          <span style={{ fontWeight: 700, color: isLow ? '#ef4444' : 'var(--text-main)' }}>
                            {currentStock} {safetyStock > 0 ? `/ ${safetyStock}` : ''} {item.unit || '個'}
                          </span>
                          {isLow && (
                            <span style={{
                              fontSize: '10px',
                              fontWeight: 800,
                              backgroundColor: 'rgba(239, 68, 68, 0.12)',
                              color: '#ef4444',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              padding: '1px 5px',
                              borderRadius: '4px'
                            }}>
                              ⚠️ 需補貨
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '10px 10px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="number"
                          min="1"
                          value={itemQty}
                          onChange={(e) => handleQuantityChange(item.id, e.target.value)}
                          style={{
                            width: '60px',
                            padding: '4px 6px',
                            borderRadius: '6px',
                            border: '1px solid var(--input-border)',
                            backgroundColor: 'var(--input-bg)',
                            color: 'var(--input-text)',
                            textAlign: 'center',
                            fontSize: '13px',
                            fontWeight: 700,
                            outline: 'none'
                          }}
                          data-testid={`item-qty-input-${item.id}`}
                        />
                      </td>
                      <td style={{ padding: '10px 10px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                          <button
                            type="button"
                            onClick={() => handleSingleConfirm(item)}
                            style={{
                              padding: '4px 10px',
                              backgroundColor: 'var(--primary-color)',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              whiteSpace: 'nowrap'
                            }}
                            data-testid={`single-add-btn-${item.id}`}
                          >
                            <Check size={13} /> 選取
                          </button>
                          {currentStock === 0 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteItemMaster(item);
                              }}
                              style={{
                                padding: '4px 6px',
                                backgroundColor: 'transparent',
                                color: '#ef4444',
                                border: '1px solid rgba(239, 68, 68, 0.4)',
                                borderRadius: '6px',
                                fontSize: '12px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                              title="刪除此無庫存品項主檔（當初匯入錯誤或廢棄之品項）"
                              data-testid={`delete-orphan-btn-${item.id}`}
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer Controls */}
        <div style={{
          padding: '14px 24px',
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'var(--bg-surface-subtle)',
          fontSize: '13px'
        }}>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>
              已勾選 <strong style={{ color: 'var(--primary-color)', fontSize: '15px' }}>{checkedCount}</strong> 項品項
            </span>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 18px',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-main)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleBatchConfirm}
              disabled={checkedCount === 0}
              style={{
                padding: '8px 22px',
                backgroundColor: checkedCount > 0 ? 'var(--primary-color)' : 'var(--text-subtle)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 800,
                cursor: checkedCount > 0 ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: checkedCount > 0 ? '0 4px 12px rgba(37, 99, 235, 0.3)' : 'none'
              }}
              data-testid="batch-add-confirm-btn"
            >
              <ShoppingBag size={15} /> 批次加入進貨單 ({checkedCount})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InboundItemSelectModal;
