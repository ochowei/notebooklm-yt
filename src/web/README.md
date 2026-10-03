# Local Web UI（待實作）

未來提供本機 Web UI；瀏覽器透過本機 Node.js server 呼叫 `application/` 的
共用 use case。UI 負責操作與呈現，QueryTube / NotebookLM 存取由 server
組裝 infrastructure adapter；匯入 workflow 放在 `application/`。

此階段未加入 Web framework、HTTP server 或多使用者 authentication。
