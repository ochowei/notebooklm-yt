# notebooklm-yt

`notebooklm-yt` 是 local-first 的 TypeScript / Node.js 工具，用來讀取 QueryTube
的 Search Run，將使用者選取的 YouTube 搜尋結果匯入 NotebookLM。

目前已實作 QueryTube Public API v1 Search Run client、runtime validation、
最小匯入模型，以及 `nlyt search-runs list/get`。尚未實作 NotebookLM integration。

## 預計 workflow

```text
QueryTube Search Run
  → notebooklm-yt 讀取與標準化搜尋結果
  → 使用者選取 YouTube 影片
  → 共用 application workflow
  → NotebookLM notebook 與 YouTube sources
```

未來由 CLI 或 local Web UI 呼叫同一組 application use case，並透過
`NotebookProvider` 匯入新建的 notebook。本階段只完成 Search Run 讀取與
標準化，不選取影片，也不呼叫 NotebookLM。

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
但 CLI 尚未安裝為正式 project dependency。Authentication/session 與
list/create/YouTube/session persistence live validation 均已完成。預計由 TypeScript
infrastructure adapter 使用 Node.js `execFile` 呼叫 CLI。選型證據與風險記錄於
[`docs/notebooklm-integration-evaluation.md`](docs/notebooklm-integration-evaluation.md)。
runtime validation 使用小型 TypeScript parser，沒有新增 runtime dependency。所有自動測試使用 mock HTTP
responses；CLI 子程序使用 test-only fetch preload，不存取 QueryTube 或 Firebase。

## 目錄與邊界

```text
src/
├── domain/                  # ImportSource、SearchRunReference、Notebook 等內部資料型別
├── application/             # 整合介面；未來放共用匯入 use case
│   ├── querytube-client.ts   # QueryTubeClient
│   └── notebook-provider.ts # NotebookProvider
├── infrastructure/
│   ├── querytube/            # HTTP client、runtime contract DTO、mapper
│   └── notebooklm/           # 預留 NotebookProvider adapter（選型見 docs）
├── cli/                     # nlyt search-runs list/get 與說明
└── web/                     # 預留 local Web UI 與本機 server
tests/                       # client、contract、mapper 與編譯後 CLI 測試
```

- `domain/` 只有內部資料型別，不依賴 SDK、HTTP 或 UI。`SearchRunReference`
  只保留 `userId` 與 `searchRunId`；`ImportSource` 再加入 `{ videoId, url, title }[]`。
  owner 一起保留，避免不同 owner 下的 opaque run ID 混淆。
- `application/` 定義 `QueryTubeClient.listSearchRuns(userId)` /
  `getSearchRun(userId, runId)`、穩定 error codes，以及
  `NotebookProvider.createNotebook()` / `addYouTubeSource()`。未來 use case
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
正式 adapter 的 session/profile 設定尚未實作。

## 尚未完成

- 影片選取、共用匯入 use case 與匯入報告。
- 正式 `NotebookProvider` adapter（backend 已選定，尚未實作）。
- 真正的 CLI 匯入命令與完整 local Web UI。

本階段不實作 Cloud Run deployment、多使用者 authentication 或完整
NotebookLM workflow，也未引入 DDD framework 或 DI container。

## 下一個最小 milestone

開始實作正式 `NotebookProvider` adapter：由 TypeScript infrastructure 的
`NotebookLmCliProvider` 使用 Node.js `execFile` 呼叫 `notebooklm-py` CLI。Live
authentication/session、list/create/YouTube、UI confirmation 與跨 process reuse
均已通過；選型證據見 [backend evaluation](docs/notebooklm-integration-evaluation.md)。
