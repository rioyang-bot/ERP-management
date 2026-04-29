# ERP-Management 全系統架構說明 (System Architecture)

本文件定義了 ERP 系統的核心技術架構、功能模組與開發守則，作為後續開發與維護的最高準則。

---

## 1. 核心開發守則 (Critical Development Rules) - ⚡ **重要**

為了確保系統的穩定性與擴展性，所有開發者必須遵守以下規則：

### 1.1 強制單元測試 (Mandatory Testing)
*   **必須撰寫測試**：每次新增功能或修改現有程式邏輯後，**必須同步撰寫或更新對應的單元測試 (Unit Tests)**。
*   **必須執行測試**：所有程式碼在提交前，**必須跑過一遍完整的單元測試集**。若測試未通過，則視為未完工。
*   **回歸測試**：確保新的修改不會影響到既有的系統邏輯。

### 1.2 強制規範參考 (Mandatory Guidelines Reference)
*   **UI/UX 一致性**：每次撰寫前端介面程式時，**必須參考 [UI_UX_GUIDELINES.md](file:///c:/Users/RIO/Desktop/AI%20project%20management/ERP-management/UI_UX_GUIDELINES.md)**，確保配色、間距、按鈕樣式與資訊層次符合系統美學標準。
*   **安全性考量**：每次涉及資料庫存取、使用者輸入或 API 調用時，**必須參考 [SECURITY_GUIDELINES.md](file:///c:/Users/RIO/Desktop/AI%20project%20management/ERP-management/SECURITY_GUIDELINES.md)**，嚴格執行參數化查詢與資料過濾，防止 SQL 注入與 XSS 攻擊。

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

### 3.4 夥伴管理 (Partners)
*   **角色區分**：CUSTOMER (客戶)、SUPPLIER (供應商)。
*   **資料欄位**：包含名稱、聯絡人 (contact_person)、電話 (phone) 與啟用狀態。

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
