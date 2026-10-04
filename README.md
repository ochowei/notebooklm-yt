# notebooklm-yt

`notebooklm-yt` 是 local-first 的 TypeScript / Node.js 工具，用來讀取 QueryTube
的 Search Run，將使用者選取的 YouTube 搜尋結果匯入 NotebookLM。

目前已實作 QueryTube Public API v1 Search Run client、runtime validation、
最小匯入模型、`nlyt search-runs list/get`，以及以 `notebooklm-py` CLI 為 backend
的 `NotebookLmCliProvider`，以及 Search Run → NotebookLM application use case。
正式提供 `nlyt import search-run` CLI workflow。

## 預計 workflow

```text
QueryTube Search Run
  → notebooklm-yt 讀取與標準化搜尋結果
  → 使用者選取 YouTube 影片
  → 共用 application workflow
  → NotebookLM notebook 與 YouTube sources
```

CLI 與未來 local Web UI 呼叫同一組 application use case，並透過
`NotebookProvider` 匯入新建的 notebook。目前提供 Search Run 讀取與
標準化、NotebookProvider adapter，以及匯入全部 internal sources 的 application
use case 與 CLI import workflow；影片選取尚未實作。

## QueryTube v1 CLI

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

已納入 `package-lock.json`；需要依 lockfile 重現安裝時可使用 `npm ci`。
目前正式 dependency 只有開發工具；NotebookLM backend 已選定為 `notebooklm-py`，
CLI 是獨立安裝的 Python runtime dependency。Authentication/session 與
list/create/YouTube/session persistence live validation 均已完成。TypeScript
infrastructure adapter 已使用 Node.js `execFile` 呼叫 CLI；設定與登入 setup 見
[NotebookLM adapter README](src/infrastructure/notebooklm/README.md)。選型證據與風險記錄於
[`docs/notebooklm-integration-evaluation.md`](docs/notebooklm-integration-evaluation.md)。
runtime validation 使用小型 TypeScript parser，沒有新增 runtime dependency。HTTP 自動測試使用 mock responses；CLI 子程序使用 test-only fetch preload。
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
├── cli/                     # nlyt search-runs list/get、import search-run 與結果呈現
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
- CLI 與本機 Web server 負責組裝 adapter、接收輸入並呼叫同一組 application
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

輸入為 `{ userId, searchRunId, notebookTitle }`，三者在 fetch 前驗證非空、
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
```

Use case 匯入所有 `ImportSource.videos`，保留該陣列順序，不另做去重、排序、
ranking、limit 或互動選片。真實 QueryTube mapper 的既有 videoId 去重與排序
policy 如上；若其他 port implementation 傳入 duplicates，use case 原樣逐筆匯入。

結果為 `{ importId: string, createdAt: string, notebook: Notebook, sources: readonly ImportSourceResult[] }`；
每筆包含原始 internal `source: ImportVideo` 與 `status`：

- `success`：包含 `notebookSource: NotebookSource`。
- `failure`：只包含 `error: { code: ClientErrorCode }`，沿用 `ClientError.code`；
  非 `ClientError` 使用 `INTERNAL_ERROR`，不暴露 message、stack 或 backend diagnostics。

Fetch / create 失敗以 `ImportSearchRunError` reject，保留原錯誤於 `cause`、
既有 stable code，以及本次 `context`（含 formatted title）；空 `videos` 在 create 前以
`IMPORT_NO_SOURCES` reject，不建立空 notebook。Create 成功後逐片 sequentially
await；單片失敗記錄後繼續，即使全部失敗仍回傳已建立的 notebook 與全部 failure。
沒有 retry、rollback、delete 或額外 source processing wait；success 代表 provider
確認註冊，與現有 adapter semantics 一致。

自動測試涵蓋 happy path、空 run、fetch/create failure、partial/all failure、
未知錯誤安全轉換、input validation、order/duplicates、adapter composition 與
application/domain architecture boundary。自動測試使用 fakes，不做外部寫入。

## 尚未完成

- 影片選取與 presentation 匯入報告。
- 完整 local Web UI。

本階段不實作 Cloud Run deployment、多使用者 authentication 或完整
NotebookLM workflow，也未引入 DDD framework 或 DI container。

## CLI Import Workflow

```sh
nlyt import search-run RUN_ID --user USER_ID --title "nlyt import smoke"
nlyt import search-run RUN_ID --user USER_ID --title "nlyt import smoke" --json
# 未 npm link 時：
node dist/cli/index.js import search-run RUN_ID --user USER_ID --title "nlyt import smoke"
```

三個輸入皆必要，非空且不含 NUL，ID 不接受 `.` / `..`；user title 原樣保留在識別 suffix 前面。
CLI 自動載入 cwd `.env`，既有環境變數優先；QueryTube configuration 同上。
NotebookLM 需要獨立安裝的 CLI 及既有 authentication session，可用
`NOTEBOOKLM_CLI_PATH`、`NOTEBOOKLM_STORAGE_PATH`、`NOTEBOOKLM_TIMEOUT_MS` 設定，
預設與人工登入 setup 見 [adapter README](src/infrastructure/notebooklm/README.md)。
不會自動登入 Google。

Composition 為 CLI → `ImportSearchRunToNotebook(QueryTubeHttpClient,
NotebookLmCliProvider)` → NotebookLM；fetch、create、sequential add、partial failure
記錄仍由既有 use case 處理，沒有改變 application/domain semantics。

Human output 新增 Import id/created，並顯示 Search Run user/run、Notebook title/created/id、Sources
attempted/succeeded/failed、Result 與 stable error codes，失敗 source 附 videoId。
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
  "sources": { "attempted": 3, "succeeded": 3, "failed": 0 },
  "errors": []
}
```

`status` 為 `success` / `partial_failure` / `failure`。每個 failed source 的 error
為 `{"code":"NOTEBOOKLM_BACKEND_ERROR","source":{"videoId":"VIDEO_ID","title":"TITLE","url":"URL"}}`，
沿用 application source result code；fatal errors 只有 `{"code":"CODE"}`。
已知 userId/searchRunId/requested title 保留；未解析到的輸入為 `null`。
Notebook id 未確認時為 `null`；`created: false` 表示沒有取得成功 create result，
**不保證後端未寫入**（如 timeout/response 遺失），應人工檢查後再決定重做。
Fatal 時 source counts 為 0。只有本次 notebook 的 ID 會顯示。

| Result | Exit code | 條件 |
| --- | --- | --- |
| `success` | `0` | 全部 source 註冊成功 |
| `partial_failure` | `2` | 有成功 source 也有失敗 source |
| `failure` | `1` | 無法開始、fetch/create 失敗、空 run，或全部 source 失敗 |

兩種 output mode 使用相同 exit semantics。全部 sources 失敗仍保留 notebook
`created: true` 與 ID、完整 counts 及 failed source errors，不 rollback。
成功代表 provider 確認 source 註冊，不保證 source processing 已 Ready。
Import fatal error codes 重用既有 `QUERYTUBE_*`、`NOTEBOOKLM_*`、
`IMPORT_NO_SOURCES`、`CLI_INVALID_ARGUMENTS`、`INTERNAL_ERROR`；automation 依 code
判斷，不依 raw backend messages。

`tests/import-cli.test.mjs` 以 fake fetch 與 fixture executable 執行編譯後的正式
CLI composition，驗證 parser、required args、config/env、成功、部分/全部失敗、
fatal errors、兩種輸出、exit codes、safe diagnostics，並確認沒有 retry/list/delete。
所有 automated tests 不依賴 live auth 或 production services。

Live validation 另行執行上述 CLI，使用真實 API、CLI executable、既有 session，
選小型公開 run 並記錄結果；session 缺失/過期時以 `NOTEBOOKLM_AUTH_REQUIRED`
回報，backend 未安裝以 `NOTEBOOKLM_CONFIG_INVALID` 回報，不自動登入或重試。
影片選取、完整 Import Report 與 Web UI 仍屬後續 scope。

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
CLI 的 JSON contract 只新增頂層 `importId` / `createdAt`；在 workflow 啟動前
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
