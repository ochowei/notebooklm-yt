# notebooklm-yt

`notebooklm-yt` 是 local-first 的 TypeScript / Node.js 工具，用來讀取 QueryTube
的 Search Run，將使用者選取的 YouTube 搜尋結果匯入 NotebookLM。

目前已實作 QueryTube Public API v1 Search Run client、runtime validation、
最小匯入模型、`nlyt search-runs list/get`，以及以 `notebooklm-py` CLI 為 backend
的 `NotebookLmCliProvider`，以及 Search Run → NotebookLM application use case。
正式提供 `nlyt import search-run` CLI workflow 與 `nlyt tui` 互動式介面。

## 預計 workflow

```text
QueryTube Search Run
  → notebooklm-yt 讀取與標準化搜尋結果
  → 使用者選取 YouTube 影片
  → 共用 application workflow
  → NotebookLM notebook 與 YouTube sources
```

CLI、TUI 與未來 local Web UI 呼叫同一組 application use case，並透過
`NotebookProvider` 匯入新建的 notebook。目前提供 Search Run 讀取與
標準化、NotebookProvider adapter，以及支援影片選取與 Import Report 的共用
application use case 與非互動式 CLI import workflow。

## npm 安裝與 prerequisites

`nlyt` 是 Node/npm CLI，npm package 名稱為 `notebooklm-yt`。需要 Node.js
22.13 以上的 22.x，或 Node.js 24 以上，以及 npm。發布至 npm 後可安裝：

```sh
npm install -g notebooklm-yt
nlyt --help
nlyt search-runs list --user USER_ID
nlyt import search-run RUN_ID --user USER_ID --title "My research"
```

發布前可用本機 tarball 安裝：`npm install -g /path/to/notebooklm-yt-0.1.0.tgz`。
在執行指令的工作目錄自行建立 `.env` 並設定 `QUERYTUBE_BASE_URL`，或設定同名
環境變數；npm package 不包含 `.env`、session、source 或 tests。

讀取 QueryTube Search Run 只需要 Node.js 與有效的 QueryTube base URL。
匯入 NotebookLM 另需 **Python >=3.10 與獨立安裝的 `notebooklm-py` /
NotebookLM CLI backend**；目前 adapter contract 已驗證的版本為 `0.8.4`。
請依 [NotebookLM adapter setup](https://github.com/ochowei/notebooklm-yt/blob/main/src/infrastructure/notebooklm/README.md)
安裝 backend、準備 browser（若登入需要）並手動登入。
預設從 PATH 呼叫 `notebooklm`；可透過 `NOTEBOOKLM_CLI_PATH` 指定 executable、
`NOTEBOOKLM_STORAGE_PATH` 指定既有 session 的絕對路徑，以及
`NOTEBOOKLM_TIMEOUT_MS` 設定 timeout（預設 60000）。

NotebookLM authentication/session 由該 backend 管理，不屬於 npm package
安裝流程。`nlyt` 不透過 `postinstall` 安裝 Python、`notebooklm-py` 或執行
NotebookLM login；`nlyt --help` 不需要 backend、QueryTube 設定或登入 session。

Package 採用 MIT License，完整授權條款見 [LICENSE](LICENSE)。

## 從原始碼安裝與 QueryTube v1 CLI

```sh
npm ci
npm run build
npm link
cp .env.example .env
# 編輯 .env，設定 QUERYTUBE_BASE_URL 為實際 server URL

nlyt search-runs list --user USER_ID
nlyt search-runs get RUN_ID --user USER_ID
nlyt search-runs list --user USER_ID --json
nlyt search-runs get RUN_ID --user USER_ID --json
```

`USER_ID` / `RUN_ID` 是佔位符，請使用實際 owner UID 與公開 Search Run ID。
未執行 `npm link` 時，可用 `node dist/cli/index.js` 取代 `nlyt`。
也可用 `npm start -- search-runs list --user USER_ID`；automation 建議直接
使用 `nlyt` 或 `node`，避免 npm 自己的 script banner 混入 stdout。

CLI 自動載入目前工作目錄的 `.env`，例如：

```dotenv
QUERYTUBE_BASE_URL=https://querytube.example.com
```

已存在的環境變數優先於 `.env`，仍可用 `export QUERYTUBE_BASE_URL=...` 覆寫。
`.env` 不存在時可使用環境變數；兩者都未提供 base URL 時回報 configuration
error。`.env` 已在 `.gitignore`，請勿提交實際本機設定。沒有預設 host。
可使用 HTTP(S) host 或包含部署 prefix 的 base URL，不接受 credentials、
query string 或 fragment。ID 作為 opaque path segment URL encode。

client 只發出匿名、唯讀 GET：

```text
GET {QUERYTUBE_BASE_URL}/api/v1/public/users/{userId}/search-runs
GET {QUERYTUBE_BASE_URL}/api/v1/public/users/{userId}/search-runs/{runId}
```

不使用 legacy endpoint，不跟隨 redirect，不自動 retry；request timeout 為
15 秒。list 使用 server 預設範圍，這次沒有提供分頁或額外 filter。
human list 每行顯示一個 run ID；get 顯示 owner、run ID 與影片 ID／標題／URL。

### JSON contract

成功 exit code 為 `0`；stdout 只有一個 JSON object 與結尾換行，stderr 為空。
list 的 output 使用 internal reference，不傳遞 API summary metadata：

```json
{"items":[{"userId":"USER_ID","searchRunId":"RUN_ID"}]}
```

get 的 output 是 internal import source：

```json
{"userId":"USER_ID","searchRunId":"RUN_ID","videos":[{"videoId":"VIDEO_ID","url":"https://www.youtube.com/watch?v=VIDEO_ID","title":""}]}
```

空 list 為 `{"items":[]}`；空 run 的 `videos` 為 `[]`。空標題不填入假值。
失敗 exit code 為 `1`；JSON 模式的 stdout 只有穩定 error envelope，stderr 為空：

```json
{"error":{"code":"QUERYTUBE_NOT_FOUND","message":"Search Run was not found or is not public."}}
```

automation 應依 `error.code` 判斷；human 模式只將友善錯誤文字寫到 stderr。

| Code | 原因 |
| --- | --- |
| `QUERYTUBE_CONFIG_MISSING` | 未設定 base URL |
| `QUERYTUBE_CONFIG_INVALID` | base URL 無效或 `.env` 無法讀取 |
| `QUERYTUBE_NETWORK_ERROR` | 連線、timeout、redirect 或 response body 讀取失敗 |
| `QUERYTUBE_MALFORMED_JSON` | HTTP 200 的 body 不是有效 JSON |
| `QUERYTUBE_CONTRACT_INVALID` | 必要的 consumer contract 欄位不符，message 含欄位路徑 |
| `QUERYTUBE_NOT_FOUND` | HTTP 404；不存在或不可公開存取 |
| `QUERYTUBE_RATE_LIMITED` | HTTP 429 |
| `QUERYTUBE_UNAVAILABLE` | HTTP 503 |
| `QUERYTUBE_HTTP_ERROR` | 其他非 200 status；message 含 HTTP status |
| `CLI_INVALID_ARGUMENTS` | CLI command、參數或 path ID 無效 |
| `INTERNAL_ERROR` | 未預期的本機錯誤 |

上游錯誤 body 不會直接輸出，以避免依賴不穩定的 message 或洩漏 server 細節。

## 開發與驗證

需要 Node.js 22（至少 22.13）或 24 以上，以及 npm。主要在 local machine 執行；Google Cloud Shell
與 GitHub Codespaces 是次要支援環境，使用相同指令，但尚未驗證其 NotebookLM
session 流程。暫不規劃 Cloud Run deployment。

```sh
npm install
npm run check
npm start -- --help
```

| 指令 | 用途 |
| --- | --- |
| `npm run build` | 編譯 `src/` 至 `dist/` |
| `npm start` | 執行已編譯的 CLI；需先 build |
| `npm run lint` | ESLint 檢查 TypeScript、測試與設定檔 |
| `npm run typecheck` | TypeScript strict 型別檢查，不產生檔案 |
| `npm test` | 先 build，再以 Node 內建 test runner 執行 client、contract、mapper 與 CLI tests |
| `npm run check` | 依序執行 lint、typecheck、test（含 build） |
| `npm pack --dry-run` / `npm pack` | 自動透過 `prepack` 執行完整 check，通過後預覽／產生 npm tarball |

Build 會先清除 `dist/` 再編譯，保留 CLI shebang 並設定 entry point 為 executable。
`files` whitelist 只納入 `dist/**/*.js`；npm 另自動納入 `package.json` 與 README
（未來若新增 LICENSE，也會自動納入）。開發腳本、tests、原始碼與本機設定不打包。
打包前需要先 `npm ci` 安裝開發工具；tarball 安裝使用已編譯的 JavaScript，
不需要 TypeScript 或開發工具，也不會執行 `prepack`。請勿用 `--ignore-scripts`
跳過打包前驗證。發布前可用暫存 prefix 安裝 tarball，再直接執行 `nlyt --help`。

已納入 `package-lock.json`；需要依 lockfile 重現安裝時可使用 `npm ci`。
TUI runtime dependencies 為 Ink 8 與 React 19；型別與互動測試使用
`@types/react`、`ink-testing-library`。NotebookLM backend 已選定為 `notebooklm-py`，
CLI 是獨立安裝的 Python runtime dependency。Authentication/session 與
list/create/YouTube/session persistence live validation 均已完成。TypeScript
infrastructure adapter 已使用 Node.js `execFile` 呼叫 CLI；設定與登入 setup 見
[NotebookLM adapter README](https://github.com/ochowei/notebooklm-yt/blob/main/src/infrastructure/notebooklm/README.md)。選型證據與風險記錄於
[`docs/notebooklm-integration-evaluation.md`](https://github.com/ochowei/notebooklm-yt/blob/main/docs/notebooklm-integration-evaluation.md)。
runtime validation 使用小型 TypeScript parser，不依賴外部 validation library。HTTP 自動測試使用 mock responses；CLI 子程序使用 test-only fetch preload。
NotebookLM adapter 測試使用 fake runner 與本機 fixture executable，
所有自動測試不存取 QueryTube、Firebase 或 NotebookLM。

## 目錄與邊界

```text
src/
├── domain/                  # ImportSource、SearchRunReference、Notebook 等內部資料型別
├── application/             # 整合介面、穩定 errors 與共用匯入 use case
│   ├── querytube-client.ts   # QueryTubeClient
│   ├── notebook-provider.ts # NotebookProvider
│   └── import-search-run-to-notebook.ts # ImportSearchRunToNotebook
├── infrastructure/
│   ├── querytube/            # HTTP client、runtime contract DTO、mapper
│   └── notebooklm/           # NotebookLmCliProvider、runner、config、runtime contract
├── cli/                     # commands、adapter composition 與非互動式結果呈現
├── tui/                     # Ink screens、keyboard、presentation state 與 Import Report
└── web/                     # 預留 local Web UI 與本機 server
tests/                       # client、contract、mapper 與編譯後 CLI 測試
```

- `domain/` 只有內部資料型別，不依賴 SDK、HTTP 或 UI。`SearchRunReference`
  只保留 `userId` 與 `searchRunId`；`ImportSource` 再加入 `{ videoId, url, title }[]`。
  owner 一起保留，避免不同 owner 下的 opaque run ID 混淆。
- `application/` 定義 `QueryTubeClient.listSearchRuns(userId)` /
  `getSearchRun(userId, runId)`、穩定 error codes，以及
  `NotebookProvider.createNotebook()` / `addYouTubeSource()`。匯入 use case
  透過傳入這兩個介面實作協調流程，不直接依賴 SDK 或 QueryTube DTO。
- `infrastructure/` 將外部資料與 SDK/CLI 型別轉換成 domain 型別。
  NotebookLM backend 的 dependency、呼叫與 session 處理限定在 adapter。
- CLI entry point 負責組裝 adapter；CLI、TUI 與未來本機 Web server 接收輸入並呼叫同一組 application
  use case。選取、匯入與結果彙整流程不寫在 UI layer。

QueryTube 的 DTO、驗證與 mapper 都限定在 `infrastructure/querytube/`：

```text
QueryTube v1 HTTP JSON (unknown)
  → QueryTubeHttpClient
  → runtime validation
  → minimal QueryTube DTO
  → mapper
  → SearchRunReference / ImportSource
  → application interface / CLI
```

validator 檢查 list 的 `items[].id`，以及 detail 的 `id`、`queryResults` object
array、每個 query 的 `videos` object array、影片 `videoId` / `url` / `title`
皆為 string。只驗證 workflow 需要的 subset，不複製完整上游 domain，也不加
YouTube ID 格式或 host 限制。未知欄位與未使用的 optional / nullable metadata
會忽略；必要欄位若省略、為 null 或型別錯誤則拒絕。空陣列、空標題合法。

API DTO 保留影片原始順序與 duplicates；internal `ImportSource` 以 `videoId`
去重。同 ID 資料不同時，優先選非空標題，再以標題、URL 的字典序選定一筆，
最後按 `videoId` 排序。這是 consumer 自己的 deterministic policy，不依賴
QueryTube query/video 陣列順序，也不推論 relevance ranking。mapper 不修改 DTO。

本機資料與未來 session 資料可放在 `.local/`、`.notebooklm/` 或 `.env`；
這些位置已加入 `.gitignore`。本機 live evaluation 的 CLI session 位於 `.local/`；
正式 adapter 支援 CLI executable、storage path 與 timeout 設定，詳見其 README。

## Search Run → NotebookLM application use case（已完成）

`src/application/import-search-run-to-notebook.ts` 提供
`new ImportSearchRunToNotebook(queryTubeClient, notebookProvider).execute(input)`。
兩個 dependency 都是既有 application interface；CLI 注入 infrastructure adapters，
未來 Web UI 可重用同一 use case。

輸入為 `{ userId, searchRunId, notebookTitle, selection?: { videoIds: readonly string[] } }`，
三個必要欄位在 fetch 前驗證非空、
非純空白且不含 NUL；IDs 也不接受 `.` / `..`。無效輸入回報
`ClientError` 的 `IMPORT_INVALID_ARGUMENTS`。驗證後建立一次 import context，
將 user title 加上識別 suffix 後傳給 provider。
目前沒有獨立的 `SearchRun` / `SearchResult` 型別；`getSearchRun()` 回傳
internal `ImportSource`，其中每筆影片為 `ImportVideo`。

```text
QueryTubeClient.getSearchRun(userId, searchRunId)
  → ImportSearchRunToNotebook
  → import context (importId, createdAt, formatted notebookTitle)
  → NotebookProvider.createNotebook(formatted notebookTitle)
  → sequential addYouTubeSource(notebook.id, video.url)
  → { importId, createdAt, notebook, sources }
  → summarizeImportSources(result.sources): { status, summary }
```

不傳 `selection` 時維持匯入全部 `ImportSource.videos` 的既有行為。
明確傳入 `selection.videoIds` 時只匯入那些 IDs，其餘影片回報 `skipped/not_selected`。
selection IDs 使用 Set deterministic 去重；選取順序不影響匯入順序，始終依
`ImportSource.videos`。不修改 input 或 Search Run，也不新增 source 去重、排序或 ranking：
QueryTube mapper 仍負責 canonical videoId 去重／排序；其他 port 傳入的 source duplicates
仍依原陣列處理，與既有行為一致。

明確空 selection 在 fetch/create 前回 `IMPORT_NO_SELECTED_SOURCES`。
selection 不是 string array，或包含任一 Search Run 中不存在的 ID，回
`IMPORT_INVALID_SELECTION`；未知 ID 不會 silent ignore，不會建立 notebook 或新增 source。
ID 以原值精確比對，不 trim 或另加 YouTube ID 格式限制。

結果為 `{ importId: string, createdAt: string, notebook: Notebook, sources: readonly ImportSourceResult[] }`；
每筆包含原始 internal `source: ImportVideo` 與 `status`：

- `success`：包含 `notebookSource: NotebookSource`。
- `skipped`：包含 stable `reason: "not_selected"`，未呼叫 provider。
- `failure`：只包含 `error: { code: ClientErrorCode }`，沿用 `ClientError.code`；
  非 `ClientError` 使用 `INTERNAL_ERROR`，不暴露 message、stack 或 backend diagnostics。

Application 的純函式 `summarizeImportSources(result.sources)` 是共用報告語意：
`{ status, summary: { total, selected, attempted, succeeded, failed, skipped } }`。
`total` 為完整來源數，`selected = attempted = succeeded + failed`（流程逐一嘗試所有選取來源），
`skipped` 為未選取來源數，`total = attempted + skipped`。
status 只依成功／失敗的選取來源決定，skipped 不造成 partial failure。
CLI 消費此函式與 application results，不自行選片或重算 business rules。

Selection validation / fetch / create 失敗以 `ImportSearchRunError` reject，保留原錯誤於 `cause`、
既有 stable code，以及本次 `context`（含 formatted title）；空 `videos` 在 create 前以
`IMPORT_NO_SOURCES` reject，不建立空 notebook。Create 成功後逐片 sequentially
await；單片失敗記錄後繼續，即使全部失敗仍回傳已建立的 notebook 與全部 failure。
沒有 retry、rollback、delete 或額外 source processing wait；success 代表 provider
確認註冊，與現有 adapter semantics 一致。

自動測試涵蓋 happy path、空 run、fetch/create failure、partial/all failure、
未知錯誤安全轉換、input validation、order/duplicates、adapter composition 與
application/domain architecture boundary。自動測試使用 fakes，不做外部寫入。

## 尚未完成

- 完整 local Web UI。

本階段不實作 Cloud Run deployment、多使用者 authentication 或完整
NotebookLM workflow，也未引入 DDD framework 或 DI container。

## Interactive TUI

```sh
nlyt tui --user USER_ID
nlyt tui --help
# 未 npm link 時：
node dist/cli/index.js tui --user USER_ID
```

`--user` 必填，與 `search-runs list/get` 使用相同 owner UID。需要互動式 terminal
（stdin/stdout TTY）；不支援 TUI `--json`、`--title` 或 `--video`，這些 automation
用途繼續使用 `nlyt import search-run`。Help 不需要 config、backend 或 auth。
與 CLI 相同，從目前工作目錄 `.env` / environment 讀取 `QUERYTUBE_BASE_URL`，
既有 environment 優先；NotebookLM 的 executable、storage 與 timeout 設定同上，
需要獨立安裝 backend 並預先人工登入。不新增設定檔或 persistence。

```text
Loading Search Runs
→ Search Runs → Select Run → Select Videos
→ Notebook Title → Confirm → Importing → Import Report
```

讀取／匯入錯誤顯示 stable code 與友善訊息，不呈現 raw backend message、stderr、
stack、credential 或 storage path。空列表顯示 `No public Search Runs found.`；
空 run 顯示既有 `IMPORT_NO_SOURCES`，不建立 notebook。影片預設全選，空選取會
留在選片畫面要求至少選一支；空 title 也不進入確認畫面。

| 按鍵 | 行為 |
| --- | --- |
| ↑ / ↓ | 選擇 Search Run／影片，或瀏覽報告失敗項目；長列表保持目前項目可見 |
| Space | 切換目前影片 |
| a / n | 全選／全不選影片 |
| Enter | 選擇 run／下一步；確認畫面才開始 import；報告返回 Search Runs |
| Esc | 返回前一畫面；detail loading、error 或 report 返回已載入的 Search Runs |
| q | 退出（title 畫面視為文字；importing 畫面無作用） |
| Ctrl+C | Terminal emergency termination，包括 title／importing 畫面 |
| 文字／貼上、Backspace | 輸入 title／刪除最後一個字元，保留空白與 Unicode |

Importing 只提供整體狀態，不提供逐 source live progress；此時 q、Esc、Enter 與
其他正常 navigation shortcuts 均無作用，不會離開畫面、取消 operation 或啟動
第二次 import。完成後才進入 report 或既有 error handling。

Ctrl+C 保留作為 terminal emergency termination。若透過 Ctrl+C 或外部方式強制
終止 process，NotebookLM write 狀態可能無法確認；不要假設 operation 已取消，
重新執行前應先確認 target NotebookLM 狀態。沒有 cancellation、retry 或 rollback。
TUI session 正常退出使用一般正常 exit，report 的業務 status 仍顯示
`success`／`partial_failure`／`failure`；automation 的 exit codes 應使用 CLI。

TUI 的 `src/tui/state.ts` 以明確的 screen union 管理 navigation。App 只依賴
application ports 與 domain models：啟動呼叫 `QueryTubeClient.listSearchRuns(userId)`，
選定 run 才呼叫 `getSearchRun(userId, runId)`，不預載全部 details。Back 使用已載入
的 list；完成匯入按 Enter 同樣返回該 list，不自動 retry 或 refresh。

TUI 只保存 `Set<videoId>` 的選片狀態，確認後原樣傳入共用
`ImportSearchRunToNotebook.execute({ userId, searchRunId, notebookTitle,
selection: { videoIds } })`。該 use case 依既有 contract 再讀一次最新 detail 並驗證
選片，不使用 UI cache 繞過 application。ID validation、canonical order、duplicate
policy、skipped semantics、Import ID 與 title timestamp suffix 都留在既有層；TUI
不產生 identification、不重寫匯入 loop。Report 直接用 application result 的
notebook、source error codes，以及 `summarizeImportSources()` 的 status / counts；
未選取的 skipped 不算 failure。

Readiness 保持最小：第一次 list 成功後 QueryTube 顯示 ready；NotebookLM adapter
只在確認匯入後建立，由既有 stable config/auth errors 呈現問題。啟動不探測私人
notebooks、不登入、不建立 notebook，也不新增 provider method。TUI 提供人工確認
流程；CLI 維持可 script／automation 的 contract，`nlyt import search-run` 的參數、
JSON schema 與 exit semantics 不變。TUI、CLI 與未來 Web UI 共用 application workflow。

`tests/tui.test.mjs` 使用 Ink testing library 與 fake application dependencies
測 keyboard/workflow、confirmation、exact application input、成功／部分失敗／
全失敗含 skipped、empty/error、退出、late async completion 與長列表。另以 mocked
HTTP、fake backend executable 走編譯後 `nlyt tui` smoke，驗證確認前零 backend
呼叫、匯入後 q 退出，並執行原有 CLI regression tests；不做真實 NotebookLM write。

本版不包含逐 source progress、notebook browser／delete／edit／rename、login UI、
query editing、fuzzy search、mouse、theme、persistent settings、Web UI 或 release automation。

## CLI Import Workflow

```sh
nlyt import search-run RUN_ID --user USER_ID --title "nlyt import smoke"
nlyt import search-run RUN_ID --user USER_ID --title "nlyt import smoke" --json
# 選取指定影片（--video 可重複；不傳則匯入全部）：
nlyt import search-run RUN_ID --user USER_ID --title "Research" --video VIDEO_A --video VIDEO_C
# 未 npm link 時：
node dist/cli/index.js import search-run RUN_ID --user USER_ID --title "nlyt import smoke"
```

三個輸入皆必要，非空且不含 NUL，ID 不接受 `.` / `..`；user title 原樣保留在識別 suffix 前面。
CLI 自動載入 cwd `.env`，既有環境變數優先；QueryTube configuration 同上。
NotebookLM 需要獨立安裝的 CLI 及既有 authentication session，可用
`NOTEBOOKLM_CLI_PATH`、`NOTEBOOKLM_STORAGE_PATH`、`NOTEBOOKLM_TIMEOUT_MS` 設定，
預設與人工登入 setup 見 [adapter README](https://github.com/ochowei/notebooklm-yt/blob/main/src/infrastructure/notebooklm/README.md)。
不會自動登入 Google。

Composition 為 CLI → `ImportSearchRunToNotebook(QueryTubeHttpClient,
NotebookLmCliProvider)` → NotebookLM；fetch、create、sequential add、partial failure
記錄與 selection validation 皆由共用 use case 處理。CLI 用 Node `parseArgs` 的
`multiple: true` 收集 `--video` values 後原樣傳入 application selection，不直接 filter。

Human output 新增 Import id/created，並顯示 Search Run user/run、Notebook title/created/id、Sources
total/selected/attempted/succeeded/failed/skipped、Result 與 stable error codes，
失敗 source 附 videoId；skipped sources 顯示 videoId 與 stable reason `not_selected`。
取得 application result 時輸出 stdout；fatal failure 輸出 stderr，stdout 空。
不輸出 backend stdout/stderr、stack、credentials 或私人 notebook list。

JSON 模式所有結果皆在 stdout 輸出一個 object 加換行，stderr 空，穩定 schema：

```json
{
  "status": "success",
  "importId": "NLYT-A83K2F",
  "createdAt": "2026-10-04T08:09:31.123Z",
  "userId": "USER_ID",
  "searchRunId": "RUN_ID",
  "notebook": { "title": "nlyt import smoke [04-1609] [NLYT-A83K2F]", "created": true, "id": "NOTEBOOK_ID" },
  "sources": { "total": 3, "selected": 2, "attempted": 2, "succeeded": 2, "failed": 0, "skipped": 1 },
  "errors": [],
  "skipped": [{ "reason": "not_selected", "source": { "videoId": "VIDEO_B", "title": "B", "url": "https://www.youtube.com/watch?v=VIDEO_B" } }]
}
```

`status` 為 `success` / `partial_failure` / `failure`。每個 failed source 的 error
為 `{"code":"NOTEBOOKLM_BACKEND_ERROR","source":{"videoId":"VIDEO_ID","title":"TITLE","url":"URL"}}`，
沿用 application source result code；fatal errors 只有 `{"code":"CODE"}`。
已知 userId/searchRunId/requested title 保留；未解析到的輸入為 `null`。
Notebook id 未確認時為 `null`；`created: false` 表示沒有取得成功 create result，
**不保證後端未寫入**（如 timeout/response 遺失），應人工檢查後再決定重做。
Fatal 時 source counts 為 0、`skipped: []`，表示沒有 completed application result，
不是對已讀取 Search Run 的來源總數判定。只有本次 notebook 的 ID 會顯示。
JSON 原欄位意義保留；新增 `sources.total/selected/skipped` 與頂層 `skipped` 清單，
順序依 application source order，不輸出 raw backend diagnostics 或 storage path。

| Result | Exit code | 條件 |
| --- | --- | --- |
| `success` | `0` | 全部 selected sources 註冊成功；未選取 skipped 不影響 |
| `partial_failure` | `2` | selected sources 有成功也有失敗 |
| `failure` | `1` | 無法開始、selection validation／空 selection、fetch/create 失敗、空 run，或全部 selected sources 失敗 |

兩種 output mode 使用相同 exit semantics。全部 sources 失敗仍保留 notebook
`created: true` 與 ID、完整 counts 及 failed source errors，不 rollback。
成功代表 provider 確認 source 註冊，不保證 source processing 已 Ready。
Import fatal error codes 重用既有 `QUERYTUBE_*`、`NOTEBOOKLM_*`、
`IMPORT_NO_SOURCES`、`IMPORT_NO_SELECTED_SOURCES`、`IMPORT_INVALID_SELECTION`、`CLI_INVALID_ARGUMENTS`、`INTERNAL_ERROR`；automation 依 code
判斷，不依 raw backend messages。

`tests/import-cli.test.mjs` 以 fake fetch 與 fixture executable 執行編譯後的正式
CLI composition，驗證 parser、required args、config/env、成功、部分/全部失敗、
fatal errors、兩種輸出、exit codes、safe diagnostics，並確認沒有 retry/list/delete。
所有 automated tests 不依賴 live auth 或 production services。

Live validation 另行執行上述 CLI，使用真實 API、CLI executable、既有 session，
選小型公開 run 並記錄結果；session 缺失/過期時以 `NOTEBOOKLM_AUTH_REQUIRED`
回報，backend 未安裝以 `NOTEBOOKLM_CONFIG_INVALID` 回報，不自動登入或重試。
影片選取與完整 Import Report 已完成；完整 Web UI 仍屬後續 scope。

### Import identification

- **Import ID**：notebooklm-yt 一次 import operation / attempt 的人類可讀識別，
  格式 `NLYT-XXXXXX`。使用 Node.js `crypto.randomInt(36)` 獨立抽取六個
  大寫英數字元，空間為 `36^6`（約 21.8 億），不保證全域唯一。
  同一 Search Run 每次 import 都重新產生，不使用 sequence counter 或 persistent state。
- **createdAt**：import context 建立時間，完整 machine-readable UTC ISO timestamp
  （如 `2026-10-04T08:09:31.123Z`）。
- **Search Run ID**：QueryTube 來源資料識別，與 Import ID 分開。
- **NotebookLM Notebook ID**：backend identifier，仍用於 source import，不由 Import ID 取代。

Title convention 為 `<user title> [DD-HHmm] [NLYT-XXXXXX]`，例如
`WoW 永恆 [04-1609] [NLYT-A83K2F]`。`DD-HHmm` 使用執行 Node.js 的本機
timezone，與 `createdAt` 來自同一次 clock 取值；原始 title（包含空白）保留在最前面。
格式集中於 `src/application/import-context.ts`，provider 只接收最終 title。
Use case 可選第三個 dependency `{ clock, generateId }` 供固定時間與 ID 的測試使用。

驗證有效 application input 後、fetch 前建立 context。Success、partial failure、
全部 sources 失敗，以及 fetch / create fatal failure 都保留同一個 `importId` /
`createdAt`；create request 未確認時也保留 requested formatted title，
`created: false` / `id: null` 仍代表未確認。Fatal error 不重新產生 ID。
Import identification 階段的 JSON contract 新增頂層 `importId` / `createdAt`；在 workflow 啟動前
失敗（如 invalid arguments、QueryTube config 或 timeout config 初始化錯誤）時，
兩欄為 `null`。既有 status、counts、error codes、stdout/stderr 與 exit codes 不變。
Application fatal error 現在提供帶 context 的 wrapper，原始 error 可從 `cause` 取得。
沒有新增 history、database、state file、retry 或 rollback。

### CLI live validation（2026-10-04）

編譯後的 `dist/cli/index.js import search-run` 使用 `.env` 的真實 QueryTube
base URL、既有 NotebookLM executable 與 session 執行一次，沒有 fake/preload
或額外 smoke orchestration。使用者提供的公開 run
`run_1790991576234_kb4wx`（owner `syjwlC0IclN0bxlZW7jRhQDAceW2`）匯入結果：
`status: success`、exit `0`、stderr 空、attempted `30` / succeeded `30` / failed `0`。
建立的 `nlyt import smoke` notebook ID 為 `28dd49bb-077e-4800-bf52-b5b9927084cd`。
這確認 source 註冊成功，沒有額外驗證 processing Ready 或讀取私人 notebook list。
未自動登入、retry、rollback 或 cleanup。
