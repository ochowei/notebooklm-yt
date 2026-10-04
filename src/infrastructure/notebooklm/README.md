# NotebookLM CLI adapter

```text
NotebookProvider
  → NotebookLmCliProvider
  → NotebookLmCliRunner
  → Node.js execFile
  → notebooklm-py CLI
```

`NotebookProvider`、`Notebook`、`NotebookSource` 介面維持不變。Application/domain
只使用內部 TypeScript model 與 `ClientError`；CLI DTO、process 與 authentication
細節限定在此目錄。`tmc/nlm` 仍是未實作的 fallback。

## Runtime setup

Python >=3.10 是外部 runtime dependency；本 adapter contract 對照已驗證的
`notebooklm-py==0.8.4`，沒有新增 npm runtime dependency 或 Python application。
可自行建立 venv，再安裝固定版本：

```sh
python3.11 -m venv .local/notebooklm-py/venv
.local/notebooklm-py/venv/bin/pip install 'notebooklm-py[browser]==0.8.4'
# 如登入需要 Playwright browser，依 upstream 安裝指引準備 browser。
.local/notebooklm-py/venv/bin/notebooklm login --browser chrome \
  --storage .local/notebooklm-py/storage_state.json
```

Login 是獨立的人工 setup；provider 不會啟動 browser，也不讀取/解析 credential
內容。預設使用 home 下的 default profile，建議 session 存放於 repository 外；
若使用上述 project-local 路徑，必須明確設定 storage path。`.local/`、
`.notebooklm/`、`.env` 均已 gitignore；不要提交 session、Chrome profile 或 venv。

## Configuration

沿用現有 client 的 construction-time env pattern；沒有新增全域 config service。
呼叫端負責載入 `.env`（目前 CLI 只組装 QueryTube，沒有新增 import command）。
也可傳入 runner constructor overrides；優先順序為 overrides → env → default。

| Env | Default | 說明 |
| --- | --- | --- |
| `NOTEBOOKLM_CLI_PATH` | `notebooklm` | 直接 executable；可指定 venv 的完整或相對路徑。預設嘗試 PATH，找不到則 config error，不假設已安裝。 |
| `NOTEBOOKLM_STORAGE_PATH` | `~/.notebooklm/profiles/default/storage_state.json`（由 `homedir()` 建立） | 既有 readable auth state file；自訂值不會展開 `~`、`$HOME`、`${HOME}` 或其他 shell 環境變數語法。請使用完整絕對路徑，或可由 construction 時 cwd 解析的相對路徑。 |
| `NOTEBOOKLM_TIMEOUT_MS` | `60000` | 正整數，最大 2147483647 ms；create/add 共用 process timeout。 |

```ts
const provider = new NotebookLmCliProvider(new NotebookLmCliRunner({
  executable: '/path/to/venv/bin/notebooklm',
  storagePath: '/path/to/storage_state.json',
  timeoutMs: 60_000,
}));
const notebook = await provider.createNotebook('Research');
const source = await provider.addYouTubeSource(notebook.id, youtubeUrl);
```

Runner 傳 `--storage PATH --backend web --quiet`，不使用 active notebook context；
source add 一律提供 `--notebook ID --type youtube`。請傳入完整 notebook ID，避免
upstream partial-ID resolution。固定 storage 不受 upstream active profile 選擇影響；
upstream `NOTEBOOKLM_HOME` 仍決定 CLI 自己的 config/migration 目錄。Child env
移除 `NOTEBOOKLM_AUTH_JSON` 並關閉 debug RPC，確保以指定檔案消費 session。

命令依 0.8.4 help、installed serializers 與
[官方 CLI reference](https://github.com/teng-lin/notebooklm-py/blob/v0.8.4/docs/cli-reference.md)
核對：`create --json -- TITLE`、
`source add --notebook ID --type youtube --json -- URL`。`--` 保護 positional
arguments，所有參數以 array 傳入 `execFile`，不拼接 shell。

## Validation and mapping

Runner 解析 stdout 為 `unknown`；provider 使用 narrow runtime validators。
Create 驗證 `notebook.id` 為非空 string，若提供 `title` 則必須是 string；未提供
時使用 requested title。Source 驗證 `source.id` 為非空 string；若提供
`notebook_id`，必須與 requested ID 相同；若提供 `type`，必須是 `youtube`；若
提供 `status`，必須是 pending/processing/ready/error，error 回報 backend failure。
0.8.4 source add 成功 envelope 的 summary 沒有 status/notebook ID，故不要求它們。
Source mapping 回傳 `{ id, url: requestedUrl }`，不暴露 CLI metadata。

Unknown 未使用欄位忽略；必要或受驗證 optional 欄位為 null/錯誤型別則拒絕。
Add 成功只代表 source 已註冊，不保證處理完成，provider 不額外 wait/get。

## Errors and process policy

沿用 application `ClientError`，新增以下 stable codes：

| Code | 判斷 |
| --- | --- |
| `NOTEBOOKLM_AUTH_REQUIRED` | state missing/unreadable/non-file、AUTH_REQUIRED/AUTH_ERROR envelope，或非零退出的明確 stderr auth 訊息 |
| `NOTEBOOKLM_CONFIG_INVALID` | invalid config、executable 不存在/無權限/格式錯誤，或 CONFIG_ERROR envelope |
| `NOTEBOOKLM_TIMEOUT` | process 超時，由 execFile 以 SIGKILL 終止 child |
| `NOTEBOOKLM_PROCESS_ERROR` | 其他非零退出、signal termination、超過 1 MiB stdout/stderr buffer |
| `NOTEBOOKLM_INVALID_RESPONSE` | exit 0 但非 JSON，或 provider schema 不符 |
| `NOTEBOOKLM_BACKEND_ERROR` | JSON error envelope（包含 exit 0），或 source processing error |

文件定義 exit 0/1/2/130；runner 不把 exit 1 一律當 auth，也不把 exit 2 一律當
network。先辨識本機 start/timeout errors，再檢查 JSON envelope（支援
`{error:true,code,...}` 與 nested error），最後用非零退出與 stderr auth hints
分類。任何包含 `error` key 的 envelope 都不當成功。

Runner 不 log stdout/stderr、arguments 或 env；不傳遞 raw error/cause/traceback，
stderr 只取最多 8192 characters 作分類，公開 message 使用固定文字。成功 JSON
可伴隨 stderr diagnostics，不將其直接視為 failure。

Adapter 每次 method 只執行一次 CLI，不 retry write operations；CLI 自身的內部
transport/auth recovery 行為由 pinned upstream 決定。Timeout、失去 response 或
UNCONFIRMED_WRITE 可能發生在 server 已寫入之後，應先人工檢查再決定是否重做。

## Verification

`npm run check` 執行 fake runner mapping/contract tests、以臨時本機 Node executable
測試真實 execFile 的 arguments、exit/envelope、stderr、missing executable、buffer
limit 與 timeout kill，以及 application/domain boundary test。自動測試不連線
NotebookLM、不讀取 auth state；fixture state 只含 `{}`。

Live smoke 必須另外人工執行並使用現有 session，限建立 `nlyt provider smoke`
與加入公開 YouTube URL；不要讀取其他 notebook 內容，也不要自動重試或 cleanup。
沒有新增 delete、batch、import orchestration、chat 或生成操作。

選型與先前驗證見 [backend evaluation](../../../docs/notebooklm-integration-evaluation.md)。
