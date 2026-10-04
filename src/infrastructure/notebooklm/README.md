# NotebookLM adapter（backend 已選定，provider 待實作）

Architecture decision：選定 `notebooklm-py` 作為 preferred NotebookLM backend。
正式 `NotebookLmCliProvider` 尚未實作。

```text
NotebookProvider
  ↓
NotebookLmCliProvider
  ↓
Node.js execFile
  ↓
notebooklm-py CLI
```

- `NotebookProvider` 保持 application boundary；`application/` 和 `domain/` 維持 TypeScript。
- Python 僅是 infrastructure/runtime dependency。不得讓 application layer 依賴 `notebooklm-py` 的 Python types 或 CLI details；由 adapter 將 JSON、exit codes 與 stderr 轉換成穩定的 TypeScript contract。
- 將 CLI executable、profile/storage path、timeout、stdout JSON 與 exit/error mapping 明確設定並防禦性處理。不要把 auth/session 內容放入 arguments 或 logs。
- `tmc/nlm` 保留為 fallback。未來若有官方 NotebookLM API，應可替換 provider implementation，而不更動 application/domain boundary。
- 不要把 upstream `notebooklm-py` browser launcher 的 automation-related implementation 複製到 `notebooklm-yt`。

候選比較、live authentication/session 驗證與風險記錄見
[`docs/notebooklm-integration-evaluation.md`](../../../docs/notebooklm-integration-evaluation.md)。
