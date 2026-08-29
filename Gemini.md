# ERP-Management 全系統架構說明 (System Architecture)

本文件定義了 ERP 系統的核心技術架構、功能模組與開發守則，作為後續開發與維護的最高準則。

---

## 1. 核心開發守則 (Critical Development Rules) - ⚡ **重要**

為了確保系統的穩定性與擴展性，所有開發者必須遵守以下規則：

### 1.1 強制單元測試 (Mandatory Testing)
*   **必須撰寫測試**：每次新增功能或修改現有程式邏輯後，**必須同步撰寫或更新對應的單元測試 (Unit Tests)**。
*   **必須執行測試**：所有程式碼在提交前，**必須跑過一遍完整的單元測試集**（此動作由 AI 助理在回報前自動完成）。若測試未通過，則視為未完工。
*   **強制編譯檢查**：每次完成新功能寫入或邏輯修改後，**必須執行 `npm run build`**，確保代碼在生產環境下編譯正常，杜絕語法錯誤或引用失效（此動作由 AI 助理在回報前自動完成）。
*   **回歸測試**：確保新的修改不會影響到既有的系統邏輯。

### 1.2 強制規範參考 (Mandatory Guidelines Reference)
*   **UI/UX 一致性**：每次撰寫前端介面程式時，**必須參考 [UI_UX_GUIDELINES.md](file:///c:/Users/RIO/Desktop/AI%20project%20management/ERP-management/UI_UX_GUIDELINES.md)**，確保配色、間距、按鈕樣式與資訊層次符合系統美學標準。
*   **安全性考量**：每次涉及資料庫存取、使用者輸入或 API 調用時，**必須參考 [SECURITY_GUIDELINES.md](file:///c:/Users/RIO/Desktop/AI%20project%20management/ERP-management/SECURITY_GUIDELINES.md)**，嚴格執行參數化查詢與資料過濾，防止 SQL 注入與 XSS 攻擊。

### 1.3 模組同步與一致性 (Module Synchronization & Consistency)
*   **跨模組同步**：針對「統計卡片 (Stats Cards)」或「清單列表」進行設計變更或功能調整時（如：間距調整、二次確認彈窗、排序邏輯等），**必須同時處理「設備、硬體、耗材」三個核心清單模組**。
*   **禁止片段式更新**：嚴禁僅修改單一模組而導致其他相似模組出現體驗差異，確保全系統操作手感與視覺規範高度一致。

### 1.4 全域夜間模式支援 (Mandatory Dark Mode Support)
*   **強制支援夜間模式**：所有新增與修改之頁面、元件、彈窗 (Modal)、表格、操作按鈕及狀態標籤，**必須全面支援夜間模式 (Dark Mode)**。
*   **禁用硬編碼色彩**：嚴禁在 UI 樣式中硬編碼背景色（如 `#ffffff`, `#fff`, `#f8fafc`, `#fafafa`）或文字顏色（如 `#000`, `#333`, `#1e293b`），必須統一使用 `index.css` 定義的 CSS Design Tokens（如 `var(--bg-surface)`, `var(--text-main)`, `var(--border-color)`, `var(--table-row-hover)` 等）。
*   **半透明色彩樣式**：操作按鈕（刪除、編輯、警示等）需使用半透明 Alpha 格式搭配標準色（如 `rgba(239, 68, 68, 0.12)` 與 `#ef4444`），避免在夜間模式下產生刺眼白底或對比失衡。

---

## 2. 技術棧 (Technical Stack)

*   **Frontend**: React.js (Vite)
*   **Styling**: Vanilla CSS / Inline Styles (遵循 UI_UX_GUIDELINES.md 規範)
*   **Icons**: Lucide-React
*   **Backend Interface**: Electron IPC Bridge (window.electronAPI)
*   **Database**: PostgreSQL (ERP_db)
*   **Runtime**: Node.js (v20+)
*   **Testing Framework**: Vitest / React Testing Library

---

## 3. 功能模組架構 (Module Architecture)

### 3.1 採購與進貨 (Procurement & Inbound)
*   **採購管理 (Purchasing)**：負責 PO 單號產生 (PO-YYYYMMDD-XX) 與採購需求登錄。
*   **進貨核銷 (Inbound)**：根據 PO 單號將實體物料轉為系統庫存。

### 3.2 庫存管理核心 (Inventory Core)
*   **品項主檔 (item_master)**：全系統的物料中心，定義規格、類別、單位與基礎庫存。
*   **資產追蹤 (assets)**：針對需序號管理 (S/N) 的設備與硬體進行獨立追蹤。
*   **耗材管理 (Consumables)**：處理無序號物料的批次領用與庫存扣減。

### 3.3 出貨管理 (Outbound / Delivery Note)
*   **出貨建檔 (Registration)**：
    *   支援設備序號 (S/N) 掃描，自動導出搭載硬體。
    *   連動 Partners 模組，自動帶出客戶聯絡資訊。
*   **出貨單列表 (D/N List)**：
    *   採用高密度彈出式視窗 (Modal) 檢視明細。
    *   支援 D/N 流水號自動編號 (DN-YYYYMMDD-XX)。

### 3.4 關係主體管理 (Partners - 客戶與供應商)
關係主體為全系統供應鏈與資產流向之核心對象，區分為客戶與供應商。

#### 3.4.1 主體定義與資料結構
*   **角色區分 (Classification)**：
    *   `CUSTOMER` (客戶)：用於一般出貨 (SALE)、借用出庫 (LEND)、資產持有人/專案歸屬追蹤。
    *   `SUPPLIER` (供應商)：用於採購單建檔 (P/O)、進貨核銷 (Inbound) 及原廠/代理商貨源追蹤。
*   **核心資料欄位**：
    *   `公司名稱(全稱)` (`name`, TEXT/VARCHAR) - **必填**
    *   `聯絡人` (`contact_person`, TEXT/VARCHAR) - **必填**
    *   `聯絡電話` (`phone`, VARCHAR) - 選填 / 常用
    *   `公司地址` (`address`, TEXT) - 選填 / 常用
    *   `啟用狀態` (`is_active`, BOOLEAN) - 預設為啟用 (`TRUE`)

#### 3.4.2 業務邏輯 (Business Logic)
*   **同公司多聯絡人架構**：系統允許同一「公司名稱(全稱)」建立多筆紀錄，以對應同企業內不同業務窗口、部門經辦或專案聯絡人。
*   **跨公司同名聯絡人**：允許不同公司存在相同之聯絡人姓名（例如不同公司均有聯絡人名為 "David Chen"）。
*   **跨模組自動帶入與連動 (Auto-fill & Linkage)**：
    *   **出貨單 / 借貨單 (Outbound / Delivery Note / Lend Order)**：下拉選單清楚呈現 `公司名稱(全稱) (聯絡人) - 公司地址`；選取客戶後，系統自動將客戶之「聯絡人資訊 (姓名/電話)」與「公司地址 (Location)」帶入單據表頭與交付地點。
    *   **設備 / 硬體建檔 (Devices & Hardware Registration)**：選擇客戶時，系統自動過濾並提供該公司名下之聯絡人下拉選單。
    *   **採購與進貨 (Purchasing & Inbound)**：採購建檔選擇供應商時自動連動供應商資料庫。

#### 3.4.3 內控規則 (Internal Control Rules) - ⚡ **重要**
*   **雙欄位強制必填 (Mandatory Field Validation)**：
    *   建立或修改夥伴資料時，「公司名稱(全稱)」與「聯絡人」為強制必填欄位，前端與後端皆進行非空值與純空白字元檢核，未填寫時阻擋寫入。
*   **複合唯一性約束 (Composite Uniqueness & Duplicate Prevention)**：
    *   在相同夥伴類型 (`partner_type`) 之下，**嚴禁重複建立「公司名稱(全稱) + 聯絡人」完全相同之紀錄**（校驗時進行 `TRIM` 與不分大小寫比對）。
    *   若重複，系統主動攔截並提示：「`系統訊息：[客戶/供應商]「XXX」已存在聯絡人「YYY」，不可重複建立！`」。
*   **交易歷史保護與軟性停用 (Referential Integrity & Soft Deactivation)**：
    *   **防呆與歷史保護**：凡已在系統中具備交易紀錄（如已開立採購單、進貨單、出貨單、借用單或已關聯在庫/出貨資產）之夥伴，嚴格禁止實體刪除 (Physical Delete)。
    *   **停用機制替代刪除**：使用者執行刪除時，若偵測到歷史關聯，系統自動阻擋並提示改為「**停用 (Deactivate)**」。
    *   **業務隔離**：已停用之夥伴資料將自動從各業務模組之開單下拉選單中隔離（不予顯示），杜絕誤開單情事。
*   **輸入安全消毒 (Input Sanitization)**：
    *   所有輸入文字送交資料庫前必須通過安全過濾器，自動過濾 `<script>` 標籤、危險字元 (`' " \ ; % < >`)，並限制最長長度，杜絕 SQL Injection 與 XSS 風險。
*   **全流程稽核軌跡 (Audit Logging)**：
    *   所有夥伴之「新增 (CREATE)」、「修改 (UPDATE)」、「啟用/停用狀態變更 (STATUS_CHANGE)」與「刪除 (DELETE)」皆自動寫入稽核日誌，記錄操作人員、時間戳記與變更前後內容。

### 3.5 借用單與客戶簽收單據管理 (Loan Orders & Signed Receipts)
*   **借用單三階段生命週期 (Lifecycle Transitions)**：
    *   **已建立 (待借出 / PENDING)**：單據剛建立尚未出庫，可產出並列印 A4 標準借貨申請單。支援一鍵「確認借出 (出庫)」，系統自動驗證資產可用性 (ACTIVE) 並執行扣帳，將設備轉為 `LENT`（借出）狀態。
    *   **借出中 (待歸還 / SHIPPED)**：設備已交予客戶，支援逾期警示與單據查驗，並提供「歸還入庫」操作。
    *   **已結案 (歷史紀錄 / RETURNED)**：設備已歸還並恢復為在庫 (`ACTIVE`) 狀態，完整保留歷史交易與歸還日期。
*   **客戶已簽收單據管理 (Signed Document Management)**：
    *   **支援檔案格式**：支援客戶已簽收/用印之借貨申請單 PDF 或影像檔案（JPG, PNG, WebP）。
    *   **檔案儲存與安全存取**：上傳檔案透過安全沙箱與協定儲存，避免任意目錄穿透與不當直接公開。
    *   **線上即時查驗與下載**：提供日後稽核、帳務與業務查驗需求，隨時可線上預覽或下載原檔。
    *   **檔案替換與刪除控制**：支援重新上傳更正與二次確認刪除，刪除與上傳行為皆寫入全流程稽核軌跡 (`LENT_DOC`)。

---

## 4. 資料庫設計重點 (Database Highlights)

*   **自動編號機制**：利用 `COUNT` 結合日期前綴實現每日歸零的流水號 (PO/DN)。
*   **資產屬性對應**：使用 `custom_attributes` (JSONB) 處理動態的硬體關聯（如 Server 與零件的掛載）。
*   **完整性約束**：透過外鍵 (FK) 確保出貨明細與品項主檔的關聯正確性。

---

## 5. UI/UX 與 AESTHETICS (設計美學)
*   所有新開發頁面必須參考 `UI_UX_GUIDELINES.md`。
*   優先使用 **Pill-shaped (膠囊型)** 按鈕與 **Vibrant (鮮豔漸層)** 色彩層次。
*   檢視詳情統一使用 **Modal Overlay** (具備毛玻璃效果與淡入動畫)。

---
*Last Updated: 2026-04-30*
