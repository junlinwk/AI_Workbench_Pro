# AI Workbench — Capability Expansion Plan

補齊 4 個缺失機制：**Native tool-calling · MCP client · PDF/檔案上傳 · Auto-routing**。

**狀態**：✅ **全數完成**（2026-04-23 當日）
**建立**：2026-04-23
**預估規模**：~2250 LOC，~6 階段
**實際規模**：~2,435 支援檔 LOC + ~500 整合行 = ~2,935 LOC（20 新檔 + 4 核心改檔）
**執行模式**：Phase 0 循序 → Phase 1/2/3/4 部分並行（3 agent + 我）→ Phase 5 整合
**驗證**：`pnpm check` 僅剩 pre-existing `@liquid-glass` 錯，`pnpm build` 成功，pdf.js code-split 為 334KB 獨立 chunk

---

## 0. 目標 / 非目標

### 目標
1. 讓 model 可以主動呼叫工具（原生 tool-calling，非啟發式 gate）
2. 支援 MCP（Model Context Protocol）外部工具伺服器
3. 對話附件支援 PDF 與一般檔案
4. 使用者選 `auto` 時由系統自動路由到合適 model
5. 不破壞現有 UX、現有對話資料、現有 API key 儲存機制

### 非目標
- 不重寫 `ChatInterface.tsx`（2622 行），只在其中插入 tool-loop hook
- 不改 Supabase 認證流程
- 不做 tool-use 的 agentic 自主長任務（只做 single-turn → multi-turn tool-use）
- 不支援 MCP stdio transport（Vercel serverless 限制）
- 不做後端單元測試（專案目前無測試基礎建設）

---

## 1. 目前狀態速查

| 項目 | 狀態 | 位置 |
|---|---|---|
| `callAI` | 非串流、字串回傳 | `client/src/lib/aiClient.ts:114-354` |
| Tool schema | 無 | — |
| Web search | Heuristic gate + AI 分類 | `ChatInterface.tsx:879-905, 1516-1612` + `api/search.ts` |
| URL fetch | 偵測正則 | `api/fetch-url.ts` |
| Vision | ✅ 已支援 | `aiClient.ts:13-36` VISION_MODELS |
| `enableStreaming` 設定 | **UI 有、未接線** | `SettingsContext.tsx:119` |
| MCP | 完全無 | — |
| Auto-routing | 完全無 | — |
| PDF | 完全無 | — |

---

## 2. 決策 / 假設

| # | 決策 | 理由 |
|---|---|---|
| D1 | MCP 僅支援 HTTP/SSE transport | Vercel serverless 無法保持 stdio 子行程 |
| D2 | `settings.webSearchEnabled` 保留，語意改為「允許 AI 使用 web_search 工具」 | 維持既有 UI 契約、使用者仍可手動關閉 |
| D3 | Phase 0 仍用**非串流** tool-loop（提示 v1） | 降低 Phase 0 風險；串流留給 v2 |
| D4 | Supabase migration 004 產出 SQL 不自動執行 | 破壞性操作，使用者 review 後自己跑 |
| D5 | PDF native 優先、pdf.js 僅作為非支援模型的 fallback | Anthropic/Gemini 原生品質高於 OCR 擷取 |
| D6 | Tool-call round 上限 8 | 防無限迴圈 |
| D7 | `auto` routing v1 用啟發式 + 可選 Haiku/Flash 二階分類 | 跟現有 `needsWebSearch` 三層 gate 一致 |

**待確認（實作前要 user 答）**：
- [ ] D1 MCP 限制可接受？
- [ ] D2 toggle 語意改動可接受？
- [ ] D4 migration 手動跑可接受？

---

## 3. 架構圖

```
User Input
   │
   ▼
ChatInterface.onSubmit()
   │
   ├─ [新] modelRouter.pick(msg, attachments) ──► effectiveModelId  (Phase 4)
   │
   ├─ [新] collectTools()                                          (Phase 1+2)
   │        │
   │        ├─ builtin: webSearch, fetchUrl, memoryAdd, memoryQuery
   │        └─ MCP: listTools() → 透過 api/mcp/list 拉
   │
   ▼
[新] runToolLoop(messages, tools, modelId)                        (Phase 0)
   │
   ├─ while (round < MAX_ROUNDS) {
   │    result = callAI(messages, tools, modelId)
   │    if (result.stop_reason === "tool_use") {
   │       for each toolCall:
   │          if builtin → execute locally
   │          if MCP → POST api/mcp/call
   │       messages.push(tool_result)
   │       continue
   │    }
   │    return result.text
   │ }
   ▼
ChatInterface render
```

---

## 4. 階段分解

### Phase 0 — Core Abstraction（循序、阻塞後續）

**目標**：讓 `aiClient` 支援 `tools` 參數並能回傳 tool-call 請求。

#### 檔案
- **新** `client/src/lib/tools/types.ts` — Tool、ToolCall、ToolResult、JSON Schema 型別
- **新** `client/src/lib/tools/converters.ts` — 三家 SDK 的 tool format 轉換 + response parser
- **改** `client/src/lib/aiClient.ts` — 擴充 `callAI` signature，新增 `callAIWithTools`
- **改** `client/src/components/ChatInterface.tsx` — 在主 pipeline 插入 `runToolLoop`

#### 型別設計
```ts
// tools/types.ts
export interface Tool {
  name: string
  description: string
  inputSchema: JSONSchema  // draft-07 subset
  source: "builtin" | "mcp"
  execute: (input: unknown, ctx: ToolContext) => Promise<ToolResultPayload>
}

export interface ToolCall {
  id: string
  name: string
  input: unknown
}

export interface ToolResult {
  toolCallId: string
  content: string | ContentPart[]
  isError?: boolean
}

// aiClient additions
export type AIResponse =
  | { type: "text"; text: string }
  | { type: "tool_use"; calls: ToolCall[]; partialText?: string }

export async function callAIWithTools(
  messages: ChatMessage[],
  modelId: string,
  tools: Tool[],
  opts: CallOptions,
): Promise<AIResponse>
```

#### 驗收
- [ ] `pnpm check` pass
- [ ] 手動測：OpenAI gpt-4o 呼叫單一 echo tool，能正確收 `tool_calls`、執行、回填、續談
- [ ] 手動測：Claude Sonnet 4.6 同上
- [ ] 手動測：Gemini 2.5 Flash 同上（`functionCall` 格式）
- [ ] `maxToolRounds=8` 上限生效
- [ ] 現有無 tool 的對話路徑不受影響（regression check）

#### 備註
- 不處理串流（D3）。`enableStreaming` setting 繼續為 no-op，Phase 6 再補。
- Mistral 無 tool-use 支援 → tool list 空時 fallback 到現 `callAI`。

---

### Phase 1 — 內建工具遷移（依賴 Phase 0）

**目標**：將 `needsWebSearch` heuristic + URL fetch 正則替換為 model-driven tool use。

#### 檔案
- **新** `client/src/lib/tools/builtin/webSearch.ts` — 包裝 `/api/search`
- **新** `client/src/lib/tools/builtin/fetchUrl.ts` — 包裝 `/api/fetch-url`
- **新** `client/src/lib/tools/builtin/memory.ts` — `memory_add`, `memory_query` 接 `conversationMemory.ts`
- **新** `client/src/lib/tools/registry.ts` — 集中導出 `getBuiltinTools(settings)`
- **改** `client/src/components/ChatInterface.tsx` —
  - 刪除 `needsWebSearch` 函式（lines 879-905）
  - 刪除 `doSearch` heuristic 區塊（lines 1516-1612）
  - URL fetch 區塊改為 tool 呼叫（保留偵測但只作為 hint 塞進系統提示）

#### 工具 schema 範例
```ts
{
  name: "web_search",
  description: "Search the web when the user asks about current events, recent data, or facts you're unsure about.",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" }
    },
    required: ["query"]
  }
}
```

#### 驗收
- [ ] 「最新 React 版本？」→ model 主動呼叫 `web_search`，結果注入 context
- [ ] 「寫個 fibonacci」→ model **不**呼叫 `web_search`
- [ ] 使用者關 `webSearchEnabled` → 工具不暴露給 model
- [ ] 貼 URL → model 主動呼叫 `fetch_url`
- [ ] `memory_add` 可由 model 主動觸發，寫入記憶圖譜
- [ ] `pnpm check` pass

---

### Phase 2 — MCP Client（依賴 Phase 0、1）

**目標**：使用者可在 Settings 加入 MCP 伺服器（HTTP/SSE），其工具自動出現在 chat 可用清單。

#### 檔案
- **新** `api/mcp/list.ts` — POST { serverUrl, authHeader? } → tool 清單
- **新** `api/mcp/call.ts` — POST { serverUrl, authHeader?, toolName, input } → 執行結果
- **新** `supabase/migrations/004_mcp_servers.sql` — `user_mcp_servers` table
- **新** `client/src/lib/mcp/client.ts` — 從 Supabase 載設定、呼叫 proxy
- **新** `client/src/lib/tools/mcpAdapter.ts` — MCP tool 定義 → 本地 `Tool` 介面
- **改** `client/src/components/SettingsDialog.tsx` — 新增 MCP tab
- **改** `client/src/components/ChatInterface.tsx` — `collectTools()` 合併 builtin + MCP

#### DB Schema
```sql
-- 004_mcp_servers.sql
create table if not exists public.user_mcp_servers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  url text not null,
  auth_header text,  -- 可選，原文（未來可加密）
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_mcp_servers enable row level security;

create policy "users manage own mcp servers"
  on public.user_mcp_servers
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index on public.user_mcp_servers(user_id);
```

#### MCP Proxy 流程
```
client  ──POST /api/mcp/list──►  Vercel function
                                  │
                                  ├─ verify Supabase JWT
                                  ├─ load server config from DB
                                  └─ HTTP GET ${url}/tools
                                      │
                                      └─◄ { tools: [...] }
```

#### 驗收
- [ ] 本地起個 reference MCP server（HTTP transport），能成功拉到工具清單
- [ ] 新增／停用／刪除伺服器可持久化到 Supabase
- [ ] Model 能呼叫 MCP 工具並收到結果
- [ ] 未登入 / cross-user 讀寫被 RLS 拒絕
- [ ] MCP 伺服器掛掉不影響對話本身（graceful fallback）
- [ ] MCP 工具名稱與 builtin 衝突時 builtin 優先，發 warning toast

---

### Phase 3 — PDF / 檔案上傳（依賴 Phase 0 的 ContentPart 擴充）

**目標**：ChatInterface 可接受 PDF / 常見文字檔作為附件，送進對話。

#### 檔案
- **改** `client/src/lib/aiClient.ts` — `ContentPart` 加 `file` variant
- **改** `client/src/lib/aiClient.ts` — Anthropic/Gemini content converter 新增 file case
- **新** `client/src/lib/files/pdfExtract.ts` — pdf.js lazy loader
- **新** `client/src/lib/files/textExtract.ts` — txt/md/csv/code 檔讀取
- **改** `client/src/components/ChatInterface.tsx` — paperclip button + drag-drop，`handleFileUpload`
- **改** `package.json` — 加 `pdfjs-dist`

#### 支援矩陣
| 檔案類型 | Anthropic 4.6 | Gemini 2.5 | OpenAI GPT-4o | 其他 |
|---|---|---|---|---|
| PDF | native base64 | native inline_data | ❌ → pdf.js 擷文 | pdf.js 擷文 |
| .txt/.md/.csv/.py/.ts/… | text part | text part | text part | text part |
| image | 已支援 | 已支援 | 已支援 | 依 VISION_MODELS |

#### ContentPart 擴充
```ts
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image"; base64: string; mimeType: string }
  | { type: "file"; base64: string; mimeType: string; name: string }  // 新
  | { type: "tool_use"; id: string; name: string; input: unknown }    // 新 (from Phase 0)
  | { type: "tool_result"; toolCallId: string; content: string; isError?: boolean }  // 新
```

#### 驗收
- [ ] 拖放 PDF → Claude Sonnet 4.6 可回答內文問題
- [ ] 拖放 PDF → GPT-4o（無 native PDF）→ client extract 後以 text 注入，可回答
- [ ] 拖放 `.md`/`.py` → 以 text part 注入
- [ ] 檔案過大（> 10MB）擋下並提示
- [ ] Bundle size 未爆炸：pdf.js 僅在選 PDF 時動態 import

---

### Phase 4 — Auto-routing（依賴 Phase 0）

**目標**：`ModelSwitcher` 頂端新增 `auto` 項，選中時系統依訊息特徵選 model。

#### 檔案
- **新** `client/src/lib/modelRouter.ts` — `pickModel(ctx) → modelId`
- **改** `client/src/components/ModelSwitcher.tsx` — 加 `{ id: "auto", name: "Auto", ... }` 偽模型
- **改** `client/src/components/ChatInterface.tsx` — 若 `selectedModelId === "auto"` 呼叫 router
- **改** `client/src/contexts/SettingsContext.tsx` — 加 `routingPrefs` 設定
- **改** `client/src/components/SettingsDialog.tsx` — Routing tab

#### 路由邏輯 v1
```ts
// Tier-1：零成本啟發式
function routeTier1(ctx: RoutingContext): string | null {
  if (ctx.attachments.some(a => a.type === "image"))
    return pickVisionModel(ctx)
  if (ctx.attachments.some(a => a.mimeType === "application/pdf"))
    return "claude-sonnet-4-6"  // native PDF + 長上下文
  if (ctx.userMessageTokens > 50_000)
    return "gemini-2.5-pro"  // 1M context
  if (/\b(prove|theorem|derive|complex|reason step|think carefully)\b/i.test(ctx.text))
    return "o1"
  if (/^(hi|hello|謝|thanks|ok|好)/i.test(ctx.text))
    return "gpt-4o-mini"  // cheap
  return null  // 交給 Tier-2
}

// Tier-2（可選）：呼 Haiku/Flash 做分類
async function routeTier2(ctx): Promise<string> { ... }
```

#### 設定欄位
```ts
routingPrefs: {
  mode: "heuristic" | "ai-assisted"  // Tier-2 on/off
  defaults: {
    vision: string
    reasoning: string
    cheap: string
    longContext: string
    balanced: string  // fallback
  }
}
```

#### 驗收
- [ ] 貼圖 → 自動挑 vision model
- [ ] 貼 PDF → 自動挑 Claude
- [ ] 短問候語 → gpt-4o-mini
- [ ] 複雜推理關鍵字 → o1 / claude-opus
- [ ] Chat UI 顯示「→ Auto 選用 Claude Sonnet 4.6」
- [ ] 使用者可在 Settings 改每個 bucket 對應 model
- [ ] Tier-2 關閉時 100% heuristic，不耗 API quota

---

### Phase 5 — Settings UI / Tool Use 視覺化 / i18n（依賴 1–4）

**目標**：把前面加的功能全部接到 UI，i18n 補齊，chat bubble 能顯示 tool call。

#### 檔案
- **改** `SettingsDialog.tsx` — 新增 **Tools / MCP / Routing / Files** 4 個 panel
- **改** `ChatInterface.tsx` message renderer — tool_use / tool_result 展示為可展開 card
- **改** `client/src/i18n.ts` — 所有新字串 zh-TW / en 兩語

#### 視覺規則
- Tool call：collapsed card，顯示 `🔧 web_search("最新 React 版本")`
- 點開：顯示完整 input JSON + tool_result 前 500 字
- 若 `isError` → 紅色邊框

#### 驗收
- [ ] Settings 4 個新 tab 都可開關／編輯並持久化
- [ ] Chat 中 tool call 正確顯示並可展開
- [ ] zh-TW / en 切換後無 raw key 洩漏
- [ ] `pnpm check` pass
- [ ] `pnpm build` 成功，production bundle size 檢視

---

## 5. 並行派工

### 循序區
- **Phase 0**：我本人執行（改動核心，需確保一致性）
- **Phase 5**：我本人執行（整合 & i18n）

### 並行區（Phase 0 完成後同時啟動）

| Subagent | 任務 | 檔案範圍 |
|---|---|---|
| Agent-A（general-purpose） | **Phase 1** 內建工具遷移 | `lib/tools/builtin/*`, `registry.ts`，改 `ChatInterface.tsx` 的 search 區段 |
| Agent-B（general-purpose） | **Phase 3** 檔案上傳 | `lib/files/*`, `aiClient.ts` file converter, `ChatInterface.tsx` composer 區 |
| Agent-C（general-purpose） | **Phase 4** auto-routing | `lib/modelRouter.ts`, `ModelSwitcher.tsx`, `SettingsContext.tsx` 加欄位 |
| 我本人 | **Phase 2** MCP | migration SQL、api/mcp/*、settings tab — 需要判斷的架構決策多 |

### 衝突點防範（已調整）
- **規則變更**：subagent **不改** `ChatInterface.tsx` 與 `SettingsDialog.tsx`。
  - Phase 1/3/4 agent 只產出獨立支援檔（`lib/tools/builtin/*`、`lib/files/*`、`lib/modelRouter.ts`）
  - 所有 ChatInterface / Settings UI 整合由我在 Phase 5 手動合併
- 原因：三個 agent 同時改 ChatInterface (2622 行) 會產生難以自動修復的合併衝突
- 代價：Phase 5 整合負擔增大，但保證正確性

- `SettingsContext.tsx` 在 Phase 0 已一次加齊所有新欄位（`maxToolRounds`、`toolUseEnabled`、`enabledTools`、`mcpEnabled`、`fileUploadMaxMB`、`routingPrefs`）— agent 只讀、不加欄位。

---

## 6. 風險與緩解

| # | 風險 | 機率 | 衝擊 | 緩解 |
|---|---|---|---|---|
| R1 | Streaming tool_use 三家格式切分異常 | 中 | 高 | D3：v1 全部非串流，降低複雜度 |
| R2 | MCP 伺服器不穩 / HTTP transport 規格鬆 | 高 | 中 | proxy 層加 timeout、graceful fallback、UI 顯示 server 狀態 |
| R3 | Tool call 無限迴圈耗 API | 中 | 高 | `MAX_ROUNDS=8`、每 round 有 abort check |
| R4 | `ChatInterface.tsx` merge conflict | 高 | 中 | Phase 0 預先插入標記區段 |
| R5 | pdf.js 拉大 bundle | 中 | 低 | 動態 import，只在選 PDF 時載入 |
| R6 | Supabase migration 破壞現有 schema | 低 | 高 | D4：只產 SQL，user review 後跑 |
| R7 | `enableStreaming` UI toggle 繼續為謊 | 確定 | 低 | 文件化，Phase 6（另案）處理 |
| R8 | Auto-routing 選錯 model，使用者困惑 | 中 | 低 | UI 顯示路由決策，可手動覆寫並記憶 |
| R9 | MCP tool 名稱撞衝突 | 低 | 低 | builtin 優先，衝突發 warning toast |

---

## 7. 執行 Checklist

### 前置
- [ ] User 確認 D1、D2、D4
- [ ] Backup 當前 branch
- [ ] `pnpm install`（若增加 pdfjs-dist）

### 階段追蹤

| Phase | 狀態 | 開始 | 完成 | Commits | 備註 |
|---|---|---|---|---|---|
| 0 — Core abstraction | ✅ 完成 | 2026-04-23 | 2026-04-23 | — | types + converters + loop + aiClient ext + settings 預留欄位 |
| 1 — Built-in tools | ✅ 完成 | 2026-04-23 | 2026-04-23 | — | webSearch / fetchUrl / memory{Add,Query} + registry |
| 2 — MCP | ✅ 完成 | 2026-04-23 | 2026-04-23 | — | migration 004 + 3 api endpoints + client + adapter |
| 3 — Files / PDF | ✅ 完成 | 2026-04-23 | 2026-04-23 | — | pdfjs-dist + prepareAttachment + ContentPart file variant |
| 4 — Auto-routing | ✅ 完成 | 2026-04-23 | 2026-04-23 | — | modelRouter.ts, tier-1 heuristics + tier-2 classifier |
| 5 — UI / i18n 整合 | ✅ 完成 | 2026-04-23 | 2026-04-23 | — | ChatInterface tool-loop + file parts + auto-route + SettingsDialog 4 tabs + ToolCallCard |

圖例：⬜ 未開始 · 🟡 進行中 · ✅ 完成 · 🔴 卡住

### 每階段完成條件
1. 該階段「驗收」全打勾
2. `pnpm check` 0 error
3. 主要流程 dev server 手測過
4. 回到此文件更新狀態欄

---

## 8. 不做但值得列出的 V2 候選

- **Streaming tool_use**（需重寫 `/api/ai/chat` 為 SSE proxy + client 端 parser）
- **MCP stdio transport**（需獨立 Node daemon，不適合 Vercel）
- **Agentic 長任務**（tool call + planner + memory loop，超出本計劃範圍）
- **Token / cost 監控**（各家回應的 `usage` 欄位統一收集）
- **Tool use 歷史 replay**（保存 tool_calls 到 message 物件，已有結構支援）
- **Auto-routing 強化**：使用者偏好學習、A/B 測試、快取分類結果

---

## 9. 參考位置索引

**核心檔**
- `client/src/lib/aiClient.ts:114-354` — `callAI`
- `client/src/components/ChatInterface.tsx:1516-1612` — 現有 web search 區段（Phase 1 刪除）
- `client/src/components/ChatInterface.tsx:879-905` — `needsWebSearch`（Phase 1 刪除）
- `client/src/lib/conversationMemory.ts` — memory ops（Phase 1 memory 工具包裝）
- `client/src/components/ModelSwitcher.tsx` — 模型清單（Phase 4 加 `auto`）
- `client/src/contexts/SettingsContext.tsx` — 全域設定（新欄位集中在 Phase 0 一次加）

**現有 API 端點**
- `api/search.ts` — DuckDuckGo proxy
- `api/fetch-url.ts` — URL 內容抓取
- `api/ai/chat.ts` — LLM proxy（key 注入）

**DB**
- `supabase/migrations/` — 001 initial, 002 tier, 003 user_api_keys, **004 即將加入 mcp_servers**
