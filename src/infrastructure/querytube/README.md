# QueryTube Public API v1 adapter

`client.ts` 的 `QueryTubeHttpClient` 實作 application 的 `QueryTubeClient`。
透過 `QUERYTUBE_BASE_URL` 讀取 `/api/v1/public/users/{userId}/search-runs`
與 detail `/.../{runId}`，不使用 legacy 路徑。

`contract.ts` 接收 unknown JSON，驗證必要的 consumer subset，建立最小 DTO。
DTO 保留重複影片，不輸出到 application / domain。未知或未使用的 metadata
欄位被忽略；必要 string 欄位不接受 null，空 title 與空陣列合法。

`mapper.ts` 將 DTO 映射成 domain 的 `SearchRunReference` / `ImportSource`，
保留 owner 與 run ID。影片以 videoId 去重並排序；metadata 衝突時優先選非空
title，再按 title、url 字典序選定資料，避免依賴 API 陣列順序。

穩定錯誤代碼在 application 的 `errors.ts`，CLI 不解析 upstream error body。
完整 CLI 與 JSON contract 見 repo README。
