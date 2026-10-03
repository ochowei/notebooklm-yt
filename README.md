# notebooklm-yt

`notebooklm-yt` 是 local-first 的 TypeScript / Node.js 工具，用來讀取 QueryTube
的 Search Run，將使用者選取的 YouTube 搜尋結果匯入 NotebookLM。

目前僅完成第一階段專案骨架；CLI 可以顯示說明，尚無實際匯入功能。

## 預計 workflow

```text
QueryTube Search Run
  → notebooklm-yt 讀取與標準化搜尋結果
  → 使用者選取 YouTube 影片
  → 共用 application workflow
  → NotebookLM notebook 與 YouTube sources
```

未來由 CLI 或 local Web UI 呼叫同一組 application use case，並透過
`NotebookProvider` 匯入新建的 notebook。此階段尚未決定 QueryTube 的實際
API／匯出格式，也未實作上述流程。

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
| `npm test` | 先 build，再以 Node 內建 test runner 執行 CLI smoke tests |
| `npm run check` | 依序執行 lint、typecheck、test（含 build） |

已納入 `package-lock.json`；需要依 lockfile 重現安裝時可使用 `npm ci`。
目前只有開發依賴，尚未安裝 `notebooklm-js`。

## 目錄與邊界

```text
src/
├── domain/                  # SearchRun、YouTubeSearchResult、Notebook 等內部資料型別
├── application/             # 整合介面；未來放共用匯入 use case
│   ├── querytube-client.ts   # QueryTubeClient
│   └── notebook-provider.ts # NotebookProvider
├── infrastructure/
│   ├── querytube/            # 預留 QueryTube adapter
│   └── notebooklm/           # 預留 notebooklm-js adapter
├── cli/                     # CLI 入口；目前僅顯示說明
└── web/                     # 預留 local Web UI 與本機 server
tests/                       # 編譯後 CLI 的 smoke tests
```

- `domain/` 只有內部資料型別，不依賴 SDK、HTTP 或 UI。`SearchRun` 是暫定的
  標準化模型，不代表 QueryTube 的真實 schema。
- `application/` 定義 `QueryTubeClient.getSearchRun()` 與
  `NotebookProvider.createNotebook()` / `addYouTubeSource()`。未來 use case
  透過傳入這兩個介面實作協調流程，不直接依賴 SDK。
- `infrastructure/` 將外部資料與 SDK 型別轉換成 domain 型別。
  `notebooklm-js` 的依賴、呼叫與 session 處理限定在 NotebookLM adapter。
- CLI 與本機 Web server 負責組裝 adapter、接收輸入並呼叫同一組 application
  use case。選取、匯入與結果彙整流程不寫在 UI layer。

本機資料與未來 session 資料可放在 `.local/`、`.notebooklm/` 或 `.env`；
這些位置已加入 `.gitignore`。目前尚未建立 session 儲存機制。

## 尚未完成

- QueryTube Search Run 讀取、格式驗證與影片選取。
- 共用匯入 use case、重複來源處理、錯誤處理與匯入報告。
- 使用 `notebooklm-js` 的 NotebookLM adapter 與本機 session 設定。
- 真正的 CLI 匯入命令與完整 local Web UI。

本階段不實作 Cloud Run deployment、多使用者 authentication 或完整
NotebookLM workflow，也未引入 DDD framework 或 DI container。

## 下一個最小 milestone

確認一份實際 QueryTube Search Run 樣本與取得方式後，實作讀取 adapter，
加上一個共用的「列出搜尋結果」use case，並讓 CLI 列出影片 ID、標題與 URL。
驗收包含有效樣本與格式錯誤的測試；此 milestone 先不呼叫 NotebookLM。
