# ERP 程式撰寫安全規則 (Secure Coding Guidelines)

為了確保 ERP 系統的資料安全性與防禦網路攻擊，所有開發工作必須嚴格遵守以下安全規範：

## 1. 徹底防範 SQL 注入 (SQL Injection)
*   **禁止使用動態 SQL 拼接**：嚴禁在程式碼中直接使用字串拼接的方式組合 SQL 語法（例如：`'SELECT * FROM users WHERE id = ' + id`）。
*   **採用具名查詢 (Named Query)**：所有資料庫讀寫必須透過 `database/queries.js` 中預定義的查詢語句，並搭配 `NamedQuery` 機制使用 `$1, $2` 佔位符。
*   **參數強制過濾**：所有傳入資料庫的參數（Params）必須經過 `server.js` 中的 `sanitizeParams` 函式處理，過濾特殊字元（如 `;`, `--`, `'` 等）與 SQL 關鍵字。

## 2. API 安全性
*   **關閉危險端點**：不允許開啟 `/api/query` 這類可接收任意 SQL 字串的端點。
*   **最小化回傳資訊**：在發生錯誤時，禁止將詳細的系統錯誤訊息（如 Stack Trace、DB Schema 資訊）直接回傳給前端。API 應回傳標準化的錯誤訊息（例如：「資料庫處理失敗，請聯絡維護人員」）。
*   **Input Validation**：前端與後端皆須對輸入資料進行基本的類型與長度校驗。

## 3. 資料保護與連線
*   **敏感資訊處理**：密碼、Token 等敏感資訊嚴禁以明文存儲，必須使用雜湊（Hashing）機制處置。
*   **JSON 資料安全**：針對 JSONB 欄位儲存，應在後端進行物件轉化，避免手動拼接 JSON 字串導致過濾器誤刪資料或語法破裂。

## 4. 前端防護 (XSS)
*   **React 安全機制**：利用 React 預設的轉義（Escaping）特性顯示資料，避免使用 `dangerouslySetInnerHTML`。
*   **媒體路徑過濾**：所有圖片與檔案連結應透過統一的轉換器（如 `window.getMediaUrl`），防範惡意路徑指向系統目錄。

## 5. 開發作業規範
*   所有新增功能如涉及資料庫，必須先於 `queries.js` 定義語法。
*   嚴禁在程式中硬編碼（Hard-coding）資料庫連接密碼。
