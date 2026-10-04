# NotebookLM integration backend evaluation

評估日期：2026-10-04。這份文件比較 `notebooklm-py`、`tmc/nlm` 與
`notebooklm-sdk`，並記錄目前這台 Mac 上能重現的安裝、CLI 和 authentication
證據。

**2026-10-04 follow-up 已讓 `notebooklm-py` 的 authentication、list、create、YouTube
add/ready、NotebookLM UI confirmation 與新 process session reuse 全部通過。**
本文件正式選定 `notebooklm-py` 作為 preferred backend；正式 adapter 尚未實作。

## Candidates

| Candidate | 最新狀態（2026-10-04） | License | 安裝及 API |
|---|---|---|---|
| [`teng-lin/notebooklm-py`](https://github.com/teng-lin/notebooklm-py) | PyPI `0.8.4`，10/1 上傳；GitHub verified release `v0.8.4`，10/2。main 最新 commit `c5afa6d4a13a`，10/2。 | MIT | PyPI package；Python CLI `notebooklm` 和 typed Python API。最低 Python 3.10。 |
| [`tmc/nlm`](https://github.com/tmc/nlm) | GitHub 沒有 release binary；Go module `@latest` 是 `v0.1.1`，7/31。main 最新 commit `7a173b4de23d`，9/22，Go module pseudo-version `v0.1.2-0.20260922233524-7a173b4de23d`。 | MIT | Go source / `go install github.com/tmc/nlm/cmd/nlm@latest`；CLI 和 Go client。 |
| [`agmmnn/notebooklm-sdk`](https://github.com/agmmnn/notebooklm-sdk) | npm `0.3.4`，3/16；main 最新 commit `e3be7175cdbf`，3/17。 | MIT | npm package；typed TypeScript API，附帶只處理 login/whoami 的小 CLI。Node 18+。 |

GitHub public contributors API 的 snapshot：`notebooklm-py` 36 位 contributor、
前兩位約占累積 commits 的 93.6%；`tmc/nlm` 3 位、前兩位約 99.9%；
`notebooklm-sdk` 2 位、前兩位 100%。這不是維護承諾或可用性指標，但三者都
有 maintainer concentration；`tmc/nlm` 和 SDK 特別明顯。

## Test environment

- macOS 27.0.1、Apple arm64。
- Node.js 22.22.2、npm 10.9.7。
- 系統 Python 3.9.6 不符合 `notebooklm-py` 要求；另外有 Python 3.11.15，使用它建隔離 venv。
- Google Chrome 154.0.8037.93。
- 系統沒有 Go。由官方 Go download page 取得 Go 1.27.1 macOS arm64 archive，SHA-256 與官方值相符；只放在 `/private/tmp/notebooklm-eval/`，用來 build `tmc/nlm`。
- Python venv、npm prefix、Go toolchain/cache、候選 auth home 都在 `/private/tmp/notebooklm-eval/`。沒有修改 repo `package.json`、lockfile 或 production dependency。
- Python 安裝使用 `notebooklm-py[browser,cookies]==0.8.4`。uv 顯示安裝 18 個 packages，venv 約 172 MB；包含 Playwright 1.63.0 和 `rookie-cookies` 0.6.0。
- SDK 安裝 `notebooklm-sdk@0.3.4` 成功；CLI 起初因 optional peer `playwright` 未安裝而不能啟動。加入 Playwright 1.58.2 後 CLI help 正常，npm prefix 約 15 MB。沒有安裝 Playwright Chromium browser，也沒有啟動新的 Google login。
- `tmc/nlm` 沒有預編譯 release，所以依照 upstream 的 source-install 路徑，用隔離 Go 1.27.1 build `@latest` 和 `@main`；主線 binary 是 arm64，Go module version 為上表的 pseudo-version。

第一輪比較時把 Python `NOTEBOOKLM_HOME`、`nlm`/SDK 的 `HOME` 指到 temp directory；當時沒有建立任何 notebook，也未改 Google security setting。本輪 live smoke 只建立一個明確命名的測試 notebook，auth state 留在 ignored `.local/`，沒有輸出 cookies、tokens 或其他私人 notebook 資料。

## Authentication comparison

以下列出第一輪比較時的認證結果。`notebooklm-py` 的專用 system Chrome follow-up 已有新結果，以下方 `notebooklm-py live validation` 為準。

| 項目 | notebooklm-py | tmc/nlm | notebooklm-sdk |
|---|---|---|---|
| Install | **成功**：Python 3.11.15 隔離 venv。 | **成功**：main 和 `@latest` 均能以 Go source build；沒有 release binary。 | **成功**：npm 0.3.4；CLI 另需 Playwright peer。 |
| Existing Chrome session | 執行 `auth inspect --browser chrome` 後找到 Chrome profile store，但 macOS Keychain lookup 回報缺少 Chromium v10 解密所需 item，cookie rows 全數跳過。沒有讀到 Google account。 | 支援讀 named browser profile 和 `-cdp-url`。本機 `127.0.0.1:9222` 沒有 CDP listener；temp home 的空白 `nlm` browser profile auth 以 exit 9 失敗，沒有讀使用者 Chrome profile。 | **不支援直接匯入現有 Chrome profile/cookie store**。實作使用 Playwright `chromium.launchPersistentContext()` 開自己的 persistent profile。API 可接受呼叫端已提供的 cookie string、cookie object 或 storage-state file。 |
| Multi-account | 有 `--account <email>`，也可建立每個 browser account 各自的 profile；本機帳號選擇未驗證。 | `-authuser N` 選 profile 裡的 Google account；named `-profile`/identity；本機帳號選擇未驗證。 | login API 沒有 Chrome account index/import option；要在 Playwright browser flow 中選帳號。 |
| Google challenge | **未到 Google**：失敗在本機 Keychain cookie 解密，沒有要求 password/2FA/CAPTCHA。 | **未到 Google**：CDP port 關閉，空白 temp profile 無法取出 credentials。 | **未測 Google login**：現有 Chrome reuse 不受支援；login 會要求在獨立 Playwright profile 進行互動登入。 |
| Authentication success | 否。 | 否。 | 否。 |
| Persistence / new process | 未產生 auth state，故未測 session reuse。文件支援 profile 下的 `storage_state.json`；另有可選 master-token flow。 | temp home 的空白 profile 無可重用 session；沒有驗證登入後跨 process reuse。文件的 credentials 存在 `~/.nlm/env`，browser identities 有獨立目錄。 | 無 session state。文件和實作指定 `~/.notebooklm/session.json`，未驗證跨 process reuse。 |

**第一輪 cookie-import blocker：** `notebooklm-py --browser-cookies chrome` 無法在這台 Mac 解密 Chrome cookies，macOS Keychain 回報 item not found。本輪沒有重試 cookie database；改用 dedicated system Chrome profile，CLI login 已識別 `cabeceowei@gmail.com` 並保存 session。不要把 password、Keychain export、cookie 或 session 貼到 chat。

`tmc/nlm` 的 CDP 方式只有在 Chrome 已提供可連線 endpoint 時才可行；本機標準 `9222` endpoint 未啟用。沒有嘗試替私人 Chrome 加啟動參數。`notebooklm-sdk` 的 fresh Playwright login 需要人工 Google sign-in，因此本輪不啟動該流程，也沒有觀察到或繞過任何 Google challenge。

## Functional smoke results

| 操作 | notebooklm-py | tmc/nlm | notebooklm-sdk |
|---|---|---|---|
| List notebooks（真實 account） | **PASS**：新 process exit 0；只輸出數量 17，沒有輸出 titles/IDs。隔離 no-auth control 曾回 `AUTH_REQUIRED` JSON、exit 1。 | 未執行；無 auth。隔離 identity 的 `nlm notebook list --json` exit 3，錯誤在 stderr。 | 未執行；無 auth。隔離 profile 的 `whoami` 回「No session found」，exit 1。 |
| Create notebook | **PASS**：建立 `nlyt backend eval - notebooklm-py`，ID `bde12a6b-ed2a-436e-94bd-3eff3d0386fc`。 | 未執行。 | 未執行。 |
| Add YouTube source | **PASS**：明確 `--type youtube`，source ID `6a10fd6d-1647-48b7-b864-a448af91dee8`；API 與使用者人工 UI 確認 source type 正確，`source wait` 和新 process `source get` 都回 `ready`。 | 未執行。Code 會呼叫 dedicated `AddYouTubeSource`，不是一般 URL path；未呼叫服務。 | 未執行。SDK `addUrl()` 依 URL 選 YouTube payload；未呼叫服務。 |
| NotebookLM UI confirmed | **PASS**：使用者人工確認 dedicated Chrome profile 中的測試 notebook、YouTube source 與 Ready 狀態。 | 否。 | 否。 |
| New process reuses session | **PASS**：登入 process 結束後，在新 shell 再次 list 和 source get 均 exit 0。 | 未測。 | 未測。 |

前一輪沒有建立資料。本輪建立了表中唯一一個指定測試 notebook，並僅加入下節列出的公開 YouTube source；create 前先查過沒有同名 notebook。

## CLI and Node integration

| 面向 | notebooklm-py | tmc/nlm | notebooklm-sdk |
|---|---|---|---|
| JSON | `notebooklm list --json`、`create --json`、`source add --json` 等；隔離無 auth 時也實測到 JSON error envelope 在 stdout。 | list 的 `--json` 是 NDJSON；`notebook create` 不提供 `--json`，成功時 stdout 是單行 Project ID。 | notebook CRUD 是 direct typed API；CLI 沒有 notebook list/create/add 命令，也沒有統一 JSON output contract。 |
| Error / exit | 文件規範：0 success、1 user/app error、2 unexpected/system、130 SIGINT；`source wait` / `source stale` 有明列例外。隔離 no-auth list 實測為 exit 1，stderr 為空，JSON 在 stdout。 | help 文件規範 0–11（包含 auth required 3、auth attempt failed 9、transient 6）；錯誤會帶 `exit-class` 到 stderr。隔離 no-auth list 實測 exit 3、stdout 空、stderr 有 auth-required。 | Typed API 匯出 `AuthError`、`NetworkError`、RPC/domain errors；CLI login/whoami 的錯誤以 exit 1 結束，沒有像兩個 CLI 一樣的完整 command/error mapping。`whoami` 實作還會列印 CSRF token 前綴，不應在 adapter log 原樣轉送該輸出。 |
| stdout / stderr | 有明確 JSON stdout；本次 no-auth 結果沒有 stderr。 | list 使用 JSON-lines stdout，create 使用單行 ID stdout，錯誤 stderr 分離；no-auth list probe 實際符合。 | no-session `whoami` 實測 stdout 空、錯誤 stderr；library exceptions 比 CLI 更適合直接捕捉。 |
| Node bridge | 適合 `execFile`/`spawn`：明確 command、`--json`、exit mapping。須管理 Python executable/venv 版本，並處理 stdout JSON error envelope 與 stderr diagnostics。 | 適合 `execFile`：一個 compiled platform-specific binary、JSON-lines 和可分支 exit code；部署需要提供 binary，不能只依賴 upstream release download。 | 最簡單的直接 `import`，npm types 和 typed errors；登入是主要可靠性風險。CLI 自己不足以執行產品需要的 notebook 操作。 |
| 啟動時間（本機） | 從 Node spawn `--version` 取 8 次 warm sample，中位數約 164 ms。 | 同法約 4.9 ms。 | CLI `--help` 同法約 127.1 ms；production 應用 direct import，不需要另開 process。 |
| 額外 runtime | Python >=3.10。隔離 venv 加 browser-cookie 功能約 172 MB。 | 使用者不需 Go runtime；若 upstream 不提供 binary，安裝端要有 Go >=1.25 build 或由本專案供應 per-platform binary。 | Node >=18；SDK 使用額外 Playwright peer 做 CLI login，還要下載 browser。direct API 不需要 subprocess。 |

啟動時間是相同 Mac 上的暖啟動命令時間，不是 RPC 延遲或端到端 benchmark；只用來估計 process bridge 的固定成本。

## Docs / implementation observations

- `notebooklm-py 0.8.4` 的實際 CLI help 與版本文件一致：list/create 是 root commands（`notebooklm list/create`），YouTube 可以自動偵測或 `--type youtube`。本輪一開始試了不存在的 `notebooklm notebook ...` group；實際 help 明確顯示應使用 root command，沒有把這次 typo 當成 upstream 功能缺失。
- `tmc/nlm` main help 提供 `notebook list/create`、`source add`、JSON-lines、auth profile/CDP flags 和 exit classes。`notebook create` 的 source 實作成功後只輸出 Project ID 一行，沒有 JSON envelope。source code 將 YouTube URL 路由到專用 `AddYouTubeSource`。實際 NotebookLM 對 source 類型的回應仍須 UI 確認。
- SDK README 的 API 名稱與 declarations 有 `notebooks.list/create`、`sources.addUrl`；source code 會對 YouTube URL 使用專用 payload。但未等待處理的 `addUrl()` return object 固定標成 `kind: "web_page"`，所以呼叫端不可把該次 return type 當作 UI 已辨識 YouTube 的證據。
- SDK README 說明 `npx notebooklm-sdk login` 和 Playwright；已發佈 npm package 把 Playwright 列為 optional peer，故裸 `npm install notebooklm-sdk` 雖成功，實際 CLI 初次啟動會因找不到 `playwright` 而失敗。加裝 peer 後 help 正常。

## Risks

| 風險 | notebooklm-py | tmc/nlm | notebooklm-sdk |
|---|---|---|---|
| Maintenance | 很活躍，`0.8.4` 於 10/1 發版，10/2 有新 commit；前兩位 contributor commit share 93.6%。 | main 9/22 有 commit，但最近 module tag `v0.1.1` 為 7/31；三位 contributor 中單一 contributor 約 99.1%。 | npm 和 latest commit 都停在 3/16–17；兩位 contributor 中單一 contributor 約 95.1%。 |
| Protocol | 非官方、使用未公開 NotebookLM API；release 文件、typed API 和 CLI contract 相對完整。 | 非官方 private RPC；protobuf/wire-model 比 CLI user contract 明確，但仍會隨 Google 變更。 | 非官方 private RPC，TypeScript port；Google 更新時可能失效。 |
| Auth | 支援現有 Chrome cookie import、account email 選擇和 session profile；cookie import 在本機受 Keychain 阻擋。Dedicated system Chrome profile login 已 live 驗證通過，結果見下節。 | 支援專用 browser profile、現有 profile import 和 CDP；預設使用自己的 browser profile，現有 profile 的檔案權限/Keychain 仍有風險。 | 不會讀現有 Chrome profile；Playwright sign-in 更容易遇到 Google browser policy/challenge，session 需外部重新登入。 |
| Distribution | PyPI wheel，需佈署 Python runtime/venv；browser/cookies extras 增加安裝體積。 | 沒有 GitHub release binary 或 Homebrew formula；`go install @latest` 為 7 月 tag，不會自動取 9 月 main。 | npm 方便，但 login CLI 的 optional Playwright/browser 安裝步驟容易漏裝。 |
| Lock-in | 低：CLI JSON/exit contract 可藏在 `NotebookLmCliProvider`。 | 低：binary protocol 可藏在 `NotebookLmCliProvider`。 | 中：直接 API 快速，但 SDK 型別和 undocumented RPC errors 不應流入 application/domain。 |

`notebooklm-py` 選定不代表沒有風險：它仍依賴 undocumented NotebookLM consumer RPC；upstream 0.8.4 browser launcher 含 automation-related implementation detail（見 Chrome/profile strategy），auth/session 可能因 Google 或 NotebookLM 改版失效，且部署需管理額外 Python runtime。未來 adapter 必須防禦性處理 CLI JSON、exit-code、stderr 與 auth-required error；不得把 upstream 的 automation-related launcher behavior 複製到 `notebooklm-yt`。

三個專案都是 unofficial integration；Google 沒有為這些 internal RPC/session flow 提供穩定性保證。

## Recommendation

- **Preferred backend: `notebooklm-py` CLI。** Dedicated real system Chrome profile authentication 已成功；list/create/add YouTube、UI 顯示 source type 和 Ready 狀態、跨 process session reuse 均已驗證。CLI 提供 machine-readable JSON，Node `execFile` probe 通過；維護成熟度與功能完整性也高於已棄用的 `notebooklm-js` 計畫。
- **Fallback candidate:** `tmc/nlm` main。若使用者已有 CDP endpoint 或其 named profile import 可在本機讀取 session，它的 process boundary 最輕、錯誤碼清楚、YouTube 有專用 source RPC。交付時要自建/供應 macOS 和其他目標平台 binary 並固定 commit，不宜靠 `@latest` 自動變動。
- **Deferred:** `notebooklm-sdk`。純 TypeScript 介面很好整合，但現有 Chrome reuse 缺席、Playwright auth 尚未在這個 account 驗證，release/commit 活動比另外兩者久遠；另外要處理 optional Playwright peer 和 YouTube `kind` return mismatch。
- **No longer preferred:** `notebooklm-js`。已不作為本專案的 backend 選項；此輪保留先前評估材料作歷史紀錄。
- **Production decision:** `notebooklm-py` 已選定為 preferred backend。仍有 undocumented RPC、auth/session 漂移、Python runtime 與 CLI contract 等風險，詳見下方風險記錄。

## Migration impact

- 本輪只完成 backend decision 與文件更新；正式 `NotebookLmCliProvider` 尚未實作，也未修改 `NotebookProvider` interface。
- 保持 TypeScript 為 application/domain 主體，採用 `NotebookProvider → NotebookLmCliProvider → Node.js execFile → notebooklm-py CLI`。只在 infrastructure 使用 `execFile`，以 absolute executable/profile、explicit notebook ID、timeout 和 defensive JSON/exit/error mapping 呼叫；Python 僅是 CLI runtime dependency。
- 不讓 Python 型別進入 domain/application；不要複製 cookie/token/session 到 subprocess command arguments 或 log。adapter implementation 階段再決定正式 session/profile 設定。
- repository 搜尋沒有可執行的 `notebooklm-js` smoke script，也沒有正式 package dependency。保留先前比較作歷史資料；`notebooklm-js` 不再是 preferred backend。
- Live authentication/session 和 UI 確認均完成。若 `Pending Authentication / Session` Trello 卡僅涵蓋本次驗證，可標記完成；adapter 應另開/延續下一階段工作。本次未透過 Trello 更新卡片。

## Next task

1. 開始正式 `NotebookProvider` adapter implementation，維持 application/domain TypeScript boundary。
2. 以 `NotebookLmCliProvider` 和 Node.js `execFile` 呼叫已驗證的 `notebooklm-py` CLI；defensively map JSON、exit codes 與 stderr，避免輸出 auth state。
3. 保留 `tmc/nlm` 為可替換 fallback；不把 upstream browser launcher 的 automation-related implementation 複製到本專案。

## notebooklm-py live validation (2026-10-04)

### Authentication method

- 使用隔離安裝的 `notebooklm-py==0.8.4`。實際 `login --help` 支援 `--browser [chromium|msedge|chrome]`、`--storage PATH`、`--browser-timeout`、`--fresh` 和 `--master-token`。本次沒有使用 cookies import、cookie database 或 Keychain 解密。登入完成後 CLI exit 0，回報 account `cabeceowei@gmail.com` 並保存 auth state。
- `--browser chrome` 是 Playwright 的 system Chrome channel；CLI 沒有 `executable_path` 參數。已確認 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` 存在，但本次只能確認 upstream channel 選擇，未從 UI 確認實際 window process path。
- 上游 source 以 `launch_persistent_context(user_data_dir=...)` 啟動。`--storage /Users/william/gitRepo/notebooklm-yt/.local/notebooklm-py/storage_state.json` 會導出相鄰的 `browser_profile/`。登入完成偵測到支援的 NotebookLM host 後，CLI 會把 filtered Playwright state 原子寫入 storage file；`auth check` 可做本機或 network token 驗證，`auth refresh` 可 refresh cookie session。
- 其他 upstream auth 入口包括 `auth import-cookies`、`NOTEBOOKLM_AUTH_JSON` 和可選 master-token flow。它們需要既有 auth JSON/cookies、人工提供值，或額外登入；本次沒有讀取/匯入任何現有 credential，也不改用這些路徑。

### Chrome/profile strategy

- `--browser chrome` 搭配 explicit `login --storage PATH` 可使用 system Chrome channel 與專用 persistent user-data-dir；此路徑不指向 `~/Library/Application Support/Google/Chrome/Default`，也不複製私人 Chrome profile。
- `.local/` 原已列於 repo `.gitignore`。dedicated storage path 為 `.local/notebooklm-py/storage_state.json`，persistent profile 為 `.local/notebooklm-py/browser_profile/`。
- 在 sandbox 內啟動 system Chrome 被 macOS 拒絕存取共用 Crashpad settings，CLI 也立即回報 browser closed。使用已核准的 elevated process 後，upstream CLI 成功進入「Waiting for login」狀態並使用上述 dedicated profile path；使用者完成人工登入後，CLI 偵測到登入並識別 account。沒有修改私人 profile。上游 0.8.4 launch code 本身帶 `--disable-blink-features=AutomationControlled`、忽略 Chromium 預設 `--enable-automation`，並使用 `--password-store=basic`；本次沒有觀察到 Google challenge，也沒有自行加參數或嘗試處理 challenge。
- 使用者後續人工確認 dedicated Chrome profile 正常，測試 notebook 存在，3Blue1Brown YouTube source 存在且狀態為 Ready。先前 Computer Use 選到其他 Chrome 視窗，未在該視窗操作；UI PASS 以使用者本次人工確認為依據。

### Live list

**PASS**：真實帳號 list exit 0，JSON 有效，共 17 本；wrapper 只輸出數量，沒有列印私人 notebook titles/IDs。第一次 sandbox probe 遇 DNS `nodename nor servname provided`、exit 2；同一唯讀 list 在核准的網路環境成功。

### Live create

**PASS**：建立 `nlyt backend eval - notebooklm-py`，exit 0，JSON stdout、stderr 空；ID `bde12a6b-ed2a-436e-94bd-3eff3d0386fc`。建立前以 exact title 檢查真實 notebook list，沒有同名項目。

### Live YouTube source

**PASS**：使用專用 `--type youtube` 加入 [3Blue1Brown: But what is a neural network?](https://www.youtube.com/watch?v=aircAruvnKk)，exit 0，response type 為 `youtube`，source ID `6a10fd6d-1647-48b7-b864-a448af91dee8`。`source wait` exit 0、status `ready`；新 process `source get` 也回 type `youtube`、status `ready`。使用者人工確認 UI 中 source 存在、類型正確且 Ready。沒有讀取 transcript。

### Session persistence

- Storage path: `/Users/william/gitRepo/notebooklm-yt/.local/notebooklm-py/storage_state.json`。Metadata-only inspection 顯示 file exists、mode `0600`、mtime `2026-10-04T13:23:11+08:00`、size 12,270 bytes；相鄰 `browser_profile/` mode `0700`。依使用者要求，沒有檢視或解析 storage file 內容。
- **PASS**：登入 CLI process 結束後，在新 shell 以相同 `--storage` 路徑執行 list 和 source get，均 exit 0；精確找到新建測試 notebook/source，沒有重新登入。評估 profile 暫存於 ignored project-local `.local/`；後續產品整合建議優先採 upstream 使用者 home profile（命名 profile），避免 auth state 位於 repository tree。

### Node subprocess suitability

- 既有隔離 no-auth probe 證明 `list --json` 將 JSON error envelope 寫到 stdout、exit 1，stderr 空；CLI help/docs 定義一般 exit 0/1/2/130。Live list、create、source add、source wait、source get 都 exit 0；create 和 source add 回 JSON stdout，stderr 為空。API error case 本輪只遇到 sandbox DNS 限制，exit 2 且 JSON stdout；在核准網路環境重試成功。
- Node 22 `execFile` 直接呼叫 live `list --json`：exit 0、stdout 為有效 JSON（5,871 bytes）、stderr 0 bytes，wrapper 確認有且只有一筆 exact test-title match，不輸出其他 notebook data。Create/source add 由安全 wrapper 捕捉的 CLI stdout 分別為 290/224 bytes JSON、stderr 空；沒有重複 create/add。
- TypeScript 可用 `execFile` 傳固定的 absolute executable、storage path 和 arguments；勿把 auth JSON 放 command arguments、不要把 stdout/stderr 原樣記錄。若 `NOTEBOOKLM_HOME` 或 `--storage` 不固定，可能讀到不同 profile。

### Final decision

| 驗證 | 結果 |
|---|---|
| authentication | PASS |
| list | PASS |
| create | PASS |
| add YouTube | PASS |
| UI confirmation | PASS |
| session persistence | PASS |
| Node `execFile` fit | PASS |

**Preferred backend: `notebooklm-py`.** Fallback: `tmc/nlm`; deferred: `notebooklm-sdk`; `notebooklm-js`: rejected / no longer preferred. Authentication used real system Chrome with a dedicated persistent profile. CLI list/create/add YouTube succeeded, the YouTube source reached Ready and was confirmed in UI, the auth session was reused from a new process, and Node `execFile` produced machine-readable output. The CLI JSON and exit-code contract still requires defensive handling in the future adapter.

## Sources

- [notebooklm-py PyPI release history](https://pypi.org/project/notebooklm-py/), [v0.8.4 release](https://github.com/teng-lin/notebooklm-py/releases), [v0.8.4 pyproject](https://github.com/teng-lin/notebooklm-py/blob/v0.8.4/pyproject.toml), [CLI reference](https://github.com/teng-lin/notebooklm-py/blob/v0.8.4/docs/cli-reference.md).
- [tmc/nlm repository and README](https://github.com/tmc/nlm), [GitHub releases](https://github.com/tmc/nlm/releases), [main go.mod](https://github.com/tmc/nlm/blob/main/go.mod).
- [notebooklm-sdk npm package](https://www.npmjs.com/package/notebooklm-sdk), [package source](https://github.com/agmmnn/notebooklm-sdk), [auth source](https://github.com/agmmnn/notebooklm-sdk/blob/master/src/auth.ts), [CLI source](https://github.com/agmmnn/notebooklm-sdk/blob/master/src/bin.ts).
- Commit/contributor snapshot via GitHub public API on 2026-10-04: `repos/{owner}/{repo}/commits?per_page=1` and `repos/{owner}/{repo}/contributors?per_page=100`.
