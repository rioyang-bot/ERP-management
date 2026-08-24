# 夜間模式 (Dark Mode) 開發規範

所有新增功能、頁面、組件與彈窗開發時，**必須全面支援夜間模式 (Dark Mode)**，並嚴格遵循以下準則：

## 1. 禁用硬編碼色彩 (No Hardcoded Colors)
- **嚴禁硬編碼背景色**：禁止使用 `#fff`、`#ffffff`、`#fafafa`、`#f8fafc`、`#f1f5f9` 等固定淺色背景。
- **嚴禁硬編碼文字色**：禁止使用 `#000`、`#1e293b`、`#333`、`#666` 等固定深色文字。
- **強制使用全域 CSS Design Tokens**。

## 2. 常用主題變數參照表 (Theme Token Reference)

### 背景與表面
- 頁面底色：`var(--bg-app)`
- 卡片 / 容器 / 彈窗本體：`var(--bg-surface)`
- 次級容器 / 表格標題 / 摘要框：`var(--bg-surface-subtle)`
- 懸停表面：`var(--bg-surface-hover)`
- 彈窗遮罩層：`var(--bg-modal-overlay)`

### 文字與標籤
- 主要文字 / 標題：`var(--text-main)`
- 次要文字 / 說明標籤：`var(--text-muted)`
- 輔助 / 停用文字：`var(--text-subtle)`
- 反向文字：`var(--text-inverse)`

### 框線與陰影
- 通用邊框：`var(--border-color)`
- 表格底線 / 輕量邊框：`var(--table-border)`
- 卡片陰影：`var(--card-shadow)`
- 彈窗陰影：`var(--modal-shadow)`

### 表格與清單
- 表頭背景：`var(--table-header-bg)`
- 表頭文字：`var(--table-header-text)`
- 表格列懸停 (Row Hover)：`var(--table-row-hover)`

### 表單與輸入框
- 輸入框背景：`var(--input-bg)`
- 輸入框邊框：`var(--input-border)`
- 輸入框文字：`var(--input-text)`

## 3. 按鈕與狀態色規範 (Action Buttons & Status Badges)
所有操作按鈕與狀態標籤需使用半透明 Alpha 搭配標準色彩，確保日間與夜間皆有最佳對比：
- **主要動作 (Primary)**：`background: var(--primary-bg); color: var(--primary-color); border: 1px solid var(--primary-border);`
- **危險 / 刪除 (Danger)**：`background: rgba(239, 68, 68, 0.12); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.25);`
- **成功 / 編輯 (Success)**：`background: rgba(16, 185, 129, 0.12); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.25);`
- **警告 / 待處理 (Warning)**：`background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3);`

## 4. 自檢清單 (Checklist)
1. 切換至夜間模式時，是否有任何區塊呈現刺眼的白底或白框？
2. 表格每列在滑鼠懸停 (hover) 時，是否正確呈現深色微透亮而非白色？
3. 彈窗 (Modal)、下拉選單 (Dropdown) 與提示框 (Tooltip) 是否已設定 `var(--bg-surface)` 與 `var(--text-main)`？
4. 提交程式碼前務必執行 `npm run build` 確認編譯無誤。
