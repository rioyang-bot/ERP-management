# 備份到 Google Drive

每天凌晨的自動備份（`npm run backup:schedule` 安裝的排程）在伺服器上備份完資料庫後，
會接著把**資料庫備份**與**照片、簽收單、附件（uploads）**加密後傳到公司 Google Workspace 的共用雲端硬碟。

- 用 [rclone](https://rclone.org/) 上傳，經過 rclone 的加密（crypt）：Google Drive 上看到的檔名與內容都是亂碼，
  就算 Google 帳號外洩，別人拿到的也是打不開的檔案。
- 還沒照下面設定之前，排程只做伺服器上的備份，不會出錯。
- 實際動作寫在 `scripts/server-backup.sh`。

## 雲端上的內容與保留規則

| 雲端資料夾 | 內容 | 保留 |
| --- | --- | --- |
| `db/` | 資料庫備份（每日排程、部署前、手動備份都會傳） | 每日備份 30 天；每月 1 號的備份 13 個月（與伺服器相同） |
| `uploads/` | 與伺服器的 uploads 同步；每天只傳新增或變動的檔案 | 跟伺服器一致 |
| `uploads-removed/日期/` | 伺服器上已經刪掉的檔案（例如用清理工具清掉的） | 90 天 |

伺服器的回收區 `uploads/_deleted` 不會上傳。

## 一次性設定

以下設定要由有權限的人自己操作：Google 帳號登入、加密密碼都不經過其他人。

### 1. 建立共用雲端硬碟

1. 在 Google Drive 左側「共用雲端硬碟」新增一個，例如 **ERP 備份**。
2. 成員只加需要的人。等一下要登入授權的帳號必須是這個共用雲端硬碟的「管理員」或「內容管理員」。

> 備份會以授權的那個帳號的身分上傳。該帳號日後停用或離職，上傳就會失敗，要換一個帳號重新授權（見下方「重新授權」）。

### 2. 在伺服器安裝 rclone

```bash
ssh root@192.168.100.249
curl https://rclone.org/install.sh | sudo bash
rclone version
```

### 3. 在自己的 Windows 電腦安裝 rclone（只用來登入授權）

伺服器沒有瀏覽器，Google 登入要在自己的電腦上完成。

```bash
winget install Rclone.Rclone
```

裝好後重新開一個 PowerShell 視窗，`rclone version` 有出現版本就可以了。

### 4. 建立公司自己的 Google 用戶端 ID

rclone 內建共用的 Google 用戶端 ID 在 2026 年停用，要用公司自己的。

1. 用公司帳號登入 <https://console.cloud.google.com>，從上方專案選單新增專案，例如 `ERP Backup`（機構選公司網域）。
2. 「API 和服務 → 程式庫」搜尋 **Google Drive API**，按「啟用」。
3. 「Google Auth Platform」（OAuth 同意畫面）按「開始」：
   - 應用程式名稱 `ERP Backup`、支援電子郵件填自己的信箱
   - 目標對象選 **內部（Internal）**
   - 聯絡資訊填自己的信箱，建立
4. 「用戶端 → 建立用戶端」：類型選 **電腦版應用程式（Desktop app）**，名稱例如 `rclone`，建立。
5. 把顯示的 **用戶端 ID** 與 **用戶端密鑰** 存進密碼管理器，下一步要用。

> 目標對象一定要選「內部」：只有公司帳號能用、不必送 Google 審核，授權也不會過期。
> 選「外部」在測試狀態下授權每 7 天失效，備份會一直中斷。
> 沒有「內部」可選或沒有權限建立專案，請 Workspace 管理員開放或代為建立。

### 5. 在伺服器設定 Google Drive 遠端（erp-gdrive）

在伺服器上執行 `rclone config`，依序回答：

| 問題 | 回答 |
| --- | --- |
| `n/s/q>` | `n`（新增） |
| `name>` | `erp-gdrive` |
| `Storage>` | `drive`（Google Drive） |
| `client_id>` | 第 4 步的用戶端 ID |
| `client_secret>` | 第 4 步的用戶端密鑰 |
| `scope>` | `1`（完整存取，共用雲端硬碟需要） |
| `service_account_file>` | 直接按 Enter 留空 |
| `Edit advanced config?` | `n` |
| `Continue using the shared client_id anyway?`（有填用戶端 ID 就不會問） | `n` |
| `Use web browser to automatically authenticate?` | `n` |

接著畫面會印出一行 `rclone authorize "drive" "……"`：

1. 把這一整行複製到**自己電腦**的 PowerShell 執行。
2. 瀏覽器會開啟 Google 登入，用第 1 步那個公司帳號登入並允許。
3. PowerShell 會印出一段 `{"access_token": ...}` 的文字，整段複製，貼回伺服器的 `config_token>`。

> 如果 Google 顯示「已封鎖這個應用程式」，代表公司 Workspace 限制了應用程式存取，
> 請 Workspace 管理員到「安全性 → API 控制項」把第 4 步建立的用戶端設為信任。

接著回答：

| 問題 | 回答 |
| --- | --- |
| `Configure this as a Shared Drive (Team Drive)?` | `y` |
| 選擇共用雲端硬碟 | 選第 1 步建立的 **ERP 備份** |
| `Keep this "erp-gdrive" remote?` | `y` |

### 6. 在伺服器設定加密遠端（erp-backup）

一樣執行 `rclone config`：

| 問題 | 回答 |
| --- | --- |
| `n/s/q>` | `n` |
| `name>` | `erp-backup`（名稱要完全一樣，備份腳本認這個名字） |
| `Storage>` | `crypt` |
| `remote>` | `erp-gdrive:ERP-backup` |
| `filename_encryption>` | `1`（standard，檔名也加密） |
| `directory_name_encryption>` | `1`（true，資料夾名稱也加密） |
| `Password or pass phrase for encryption` | `g`（產生），強度選 `256`，`y` 使用 |
| `Password or pass phrase for salt` | `g`（產生），強度選 `256`，`y` 使用 |
| `Edit advanced config?` | `n` |
| `Keep this "erp-backup" remote?` | `y` |

> **重要：把產生的兩組密碼存進公司的密碼管理器。**
> 還原時一定要這兩組密碼，弄丟了雲端上的備份就再也打不開，連 Google 也救不回來。
> 最保險的作法是把整個 `[erp-backup]` 段落（`cat /root/.config/rclone/rclone.conf`）一起存起來。

最後限制設定檔的權限（裡面有 Google 的授權與加密密碼）：

```bash
chmod 600 /root/.config/rclone/rclone.conf
```

### 7. 部署並試傳

在本機專案資料夾執行：

```bash
npm run deploy
```

部署會把新版的備份腳本傳到伺服器。接著立即上傳一次（第一次要傳全部照片，會比較久）：

```bash
npm run backup:cloud -- -Now
```

再確認雲端的內容與佔用空間：

```bash
npm run backup:cloud
```

Google Drive 的「ERP 備份」裡會出現 `ERP-backup` 資料夾，裡面的檔名都是亂碼，這代表加密有生效。
每日排程不用重裝，之後每天備份完就會自動上傳。

## 平常查看

| 要做的事 | 指令 |
| --- | --- |
| 雲端備份的狀態、佔用空間、最近的紀錄 | `npm run backup:cloud` |
| 立即上傳一次 | `npm run backup:cloud -- -Now` |
| 每日排程與完整執行紀錄 | `npm run backup:schedule -- -Status` |

上傳失敗不會影響伺服器上的備份，但會寫在紀錄裡（「雲端備份：……失敗」）。目前不會另外發通知，建議每週看一次 `npm run backup:cloud`。

## 還原

還原都在伺服器上操作（`ssh root@192.168.100.249`）。

**資料庫**（會覆蓋伺服器現有資料，執行前請再三確認）：

```bash
rclone lsl erp-backup:db
rclone copy erp-backup:db/ERP_db-20261103-020000.backup /tmp/
sudo -u postgres pg_restore -d ERP_db --clean --if-exists /tmp/ERP_db-20261103-020000.backup
```

檔名換成要還原的那一份。

**照片與文件**（只補回缺少的檔案，不會刪掉伺服器上現有的）：

```bash
rclone copy erp-backup:uploads /opt/erp-management/uploads
```

已經從伺服器刪掉的檔案在 `erp-backup:uploads-removed/日期/`，可以先用 `rclone ls erp-backup:uploads-removed` 找。

**伺服器整台壞掉、換新機器時**：在新機器裝好 rclone，把密碼管理器裡存的 `rclone.conf` 放回 `/root/.config/rclone/rclone.conf`。
如果只存了兩組密碼，就照第 5、6 步重新設定；第 6 步的密碼改選 `y`（自己輸入），輸入原本那兩組。

## 重新授權

授權的帳號停用、改密碼或撤銷授權後，上傳會失敗。在伺服器上執行：

```bash
rclone config reconnect erp-gdrive:
```

照第 5 步的方式，在自己電腦執行它印出的 `rclone authorize` 那一行重新登入。換成另一個帳號也可以，只要那個帳號是共用雲端硬碟的成員。加密遠端 `erp-backup` 不用動。
