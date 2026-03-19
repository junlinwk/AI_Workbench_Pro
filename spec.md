# AI Workbench — Complete Specification

> Multi-provider AI workspace with glassmorphism UI, offline-first architecture, and enterprise-grade security.

---
ls
## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Features](#3-features)
4. [Authentication & User Management](#4-authentication--user-management)
5. [Security](#5-security)
6. [Deployment](#6-deployment)
7. [API Reference](#7-api-reference)
8. [UI Design System](#8-ui-design-system)
9. [Rate Limits & Quotas](#9-rate-limits--quotas)
10. [Dependencies](#10-dependencies)
11. [File Structure](#11-file-structure)

---

## 1. Project Overview

AI Workbench is a full-stack TypeScript/React application that provides a unified workspace for interacting with multiple AI providers. It features a dark glassmorphism ("Void Glass") design, offline-first data architecture, conversation branching, a visual task graph editor, and per-user data isolation backed by Supabase.

**Target audience:** Developers, researchers, and power users who work with multiple AI models and want a rich, self-hosted workspace with persistent memory, branching conversations, and a polished UI.

### Tech Stack Summary

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend Framework | React | 19.2 |
| Language | TypeScript | 5.6 |
| Build Tool | Vite | 7.1 |
| CSS | Tailwind CSS | 4.1 |
| Component Library | shadcn/ui (New York) | 53+ components |
| Animation | Framer Motion | 12.x |
| Server | Express | 4.21 |
| Database | Supabase (PostgreSQL) | — |
| Auth | Supabase Auth | — |
| Local Storage | IndexedDB (via `idb`) | 8.0 |
| Router | wouter | 3.x (patched) |
| Package Manager | pnpm | 10.4 |
| Deployment | Vercel + Vercel Serverless Functions | — |

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (React 19 SPA)                                         │
│                                                                 │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ AuthCtx  │  │ SettingsCtx  │  │  ThemeCtx    │  Contexts    │
│  └──────────┘  └──────────────┘  └──────────────┘              │
│                                                                 │
│  ┌──────────────────────────────────────────────────────┐       │
│  │  Storage Facade (synchronous API)                     │       │
│  │  ┌────────────┐  ┌──────────┐  ┌────────────────┐   │       │
│  │  │ In-Memory  │→ │ IndexedDB│→ │ Supabase Sync  │   │       │
│  │  │  Cache     │  │ (idb)    │  │ Queue          │   │       │
│  │  └────────────┘  └──────────┘  └────────────────┘   │       │
│  └──────────────────────────────────────────────────────┘       │
│                                                                 │
│  ┌──────────────────────────────────────┐                       │
│  │  AI Client (callAI)                  │                       │
│  │  Routes to provider-specific API     │                       │
│  └───────────────┬──────────────────────┘                       │
│                  │                                               │
└──────────────────┼──────────────────────────────────────────────┘
                   │  /api/ai/chat (proxy)
┌──────────────────┼──────────────────────────────────────────────┐
│  Server Layer    │                                               │
│  ┌───────────────▼──────────────────┐                           │
│  │  Express / Vercel Functions       │                           │
│  │  - /api/search (DuckDuckGo+Wiki)  │                           │
│  │  - /api/fetch-url (URL extract)   │                           │
│  │  - /api/ai/chat (AI proxy)        │                           │
│  │  - Static file serving + SPA      │                           │
│  └──────────────────────────────────┘                           │
└─────────────────────────────────────────────────────────────────┘
                   │
┌──────────────────┼──────────────────────────────────────────────┐
│  External APIs   │                                               │
│  ┌───────────────▼──────────────────┐                           │
│  │  OpenAI · Anthropic · Google      │                           │
│  │  DeepSeek · xAI · Groq/Meta      │                           │
│  │  Mistral · OpenRouter             │                           │
│  └──────────────────────────────────┘                           │
│  ┌──────────────────────────────────┐                           │
│  │  Supabase (Auth + PostgreSQL)     │                           │
│  └──────────────────────────────────┘                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Architecture

### 2.1 Three-Layer Monorepo

| Directory | Role | Entry Point |
|-----------|------|-------------|
| `client/` | React 19 SPA, Vite-bundled | `client/src/main.tsx` -> `App.tsx` |
| `server/` | Express server (stateless proxy + static serving) | `server/index.ts` |
| `api/` | Vercel Serverless Functions (deployed separately) | `api/search.ts`, `api/fetch-url.ts`, `api/ai/chat.ts` |
| `shared/` | Constants shared between client and server | `shared/const.ts` |

The server has **no business logic**. All application state, AI model orchestration, and data management live in the React client. The server is a stateless proxy that:
- Forwards AI API calls (with endpoint whitelisting)
- Proxies web searches (DuckDuckGo + Wikipedia)
- Extracts readable text from URLs
- Serves the built SPA

### 2.2 State Management

No external state library (no Redux, Zustand, or Jotai). Three React Contexts handle global state:

| Context | Responsibility | Persistence |
|---------|---------------|-------------|
| `AuthContext` | User session, login/logout, OAuth, registration | Supabase session or localStorage fallback |
| `SettingsContext` | Theme, language, font size, API keys, model selection, chat preferences, user profile | Per-user IndexedDB + Supabase sync |
| `ThemeContext` | Dark/light/system theme (via `next-themes`) | CSS class on `<html>` |

**SettingsContext** exposes a comprehensive API:

- `updateSetting(key, value)` — update a single setting
- `setApiKey(provider, key)` / `removeApiKey(provider)` — per-provider API key management
- `addCustomModel(model)` / `removeCustomModel(id)` — custom model registration
- `exportSettings()` / `importSettings(json)` — settings portability (API keys excluded from export)
- `resetSettings()` — restore defaults

### 2.3 Storage Strategy

A three-tier storage architecture provides synchronous reads with eventual cloud persistence:

```
In-Memory Cache  ──→  IndexedDB  ──→  Supabase (cloud sync)
(synchronous)        (async write)     (async via sync queue)
```

| Module | File | Purpose |
|--------|------|---------|
| Facade | `client/src/lib/storage/index.ts` | `loadUserData` / `saveUserData` — synchronous API |
| IndexedDB | `client/src/lib/storage/idb.ts` | Per-user DB (`ai-wb-u-{userId}`), async persistence |
| Sync Queue | `client/src/lib/storage/sync-queue.ts` | Batches writes to Supabase |
| Supabase Sync | `client/src/lib/storage/supabase-sync.ts` | Cloud read/write via Supabase tables |
| Encryption | `client/src/lib/storage/encryption.ts` | API key obfuscation (XOR + optional AES-256-GCM) |
| Migration | `client/src/lib/storage/migration.ts` | Migrates from legacy localStorage to IndexedDB |
| Conflict Resolver | `client/src/lib/storage/conflict-resolver.ts` | Resolves sync conflicts between local and cloud |
| Route Mapping | `client/src/lib/storage/types.ts` | Maps namespace to Supabase table |

**Key design decisions:**
- Components call `loadUserData` / `saveUserData` synchronously (reads from in-memory cache)
- Writes propagate to IndexedDB and Supabase asynchronously in the background
- Each user has an isolated IndexedDB database (`ai-wb-u-{userId}`)
- On app startup, `initStorage(userId)` hydrates the cache from IndexedDB
- Legacy localStorage data is auto-migrated on first load

#### Sync Engine Details

**Write flow:**
```
saveUserData() → cache.set() → persistToIDB() → debouncedSyncEnqueue()
                                                       ↓ (500ms debounce)
                                                 syncQueue.add()
                                                       ↓ (3-5s periodic drain, isDraining mutex)
                                                 supabase.upsert()
```

**Startup flow:**
```
initStorage(userId)
  → migrateFromLocalStorage()
  → hydrateCache() (IDB → cache)
  → startSyncEngine()
      → initialPull() (Supabase → IDB + cache)
      → drainSyncQueue() (push pending writes)
      → subscribeRealtime() (live cross-device updates)
```

**Delete flow:**
```
removeUserData() → cache.delete() → idbDelete() → supabase.delete()
clearAllUserData() → cache.clear() → idbClearUser() → supabase.delete(all user rows)
```

**Startup flow — `initialPull` detail:**
- After pulling all cloud data to local IDB + cache, `initialPull` clears any stale entries in the sync queue to prevent re-pushing outdated data.

**Debouncing:** Rapid writes to the same namespace are coalesced via a 500ms debounce timer. Only the latest version is enqueued, preventing sync queue flooding during typing or slider dragging.

**Periodic drain:** Every 3-5 seconds, the sync engine drains the queue and pushes all pending writes to Supabase. An `isDraining` mutex prevents concurrent drain calls from racing. Settings and API key changes also trigger an immediate drain via `triggerSync()`. The drain reads latest data from IDB (not stale queue entries) and deduplicates per namespace before pushing.

**Conflict resolution strategies (per namespace):**

| Namespace pattern | Strategy | Behavior |
|-------------------|----------|----------|
| `settings` | `field-merge` | Merge individual fields, prefer newer (namespace key is `"settings"`, not `"__settings__"`) |
| `conv-messages:*` | `union-merge` | Union of all messages (no duplicates) |
| `conv-memory:*` | `union-merge` | Union of memory entries |
| `notepad` | `last-write-wins` | Latest version wins entirely |
| `task-dag` | `last-write-wins` | Latest version wins |
| Default | `last-write-wins` | Latest version wins |

**Cross-device API key sync:**
- API keys are encrypted with XOR using a userId-derived key (`ai-wb-enc-{userId}-v3`)
- The same userId produces the same key on any device
- Encrypted keys are stored in Supabase `user_data` table as part of settings
- On login, `pullSettingsFromCloud()` fetches and decrypts keys from cloud
- Prefix `enc3:` identifies userId-based encryption (vs. legacy `enc2:` device-based)

**Realtime subscription:**
- After initial sync, subscribes to `postgres_changes` on `user_data` table
- Filtered by `user_id=eq.{userId}` — only receives own data changes
- Remote changes are merged into local cache via `resolveConflict()`
- Updates are reflected in the UI on next read from cache
- On CHANNEL_ERROR, auto-retry subscription after 3 seconds

**Real-time API key sync across devices:**
- API key changes in SettingsContext call `triggerSync()` for immediate push to Supabase
- Other devices receive the update via Supabase Realtime `storage-remote-update` CustomEvent
- SettingsContext listens for `storage-remote-update` and auto-merges remote API keys into local state
- Encryption uses userId-derived key (`ai-wb-enc-{userId}-v3`), making it cross-device portable (prefix `enc3:`)

**What syncs to Supabase:**

| Data | Namespace | Syncs |
|------|-----------|-------|
| Settings (incl. API keys) | `settings` | Yes — immediate trigger |
| Conversations | `conv-messages:{id}` | Yes — debounced |
| Branch data | `conv-branches:{id}` | Yes — debounced |
| Conversation memory | `conv-memory:{id}` | Yes — debounced |
| Memory map nodes | `memory-nodes` | Yes — debounced |
| Memory map edges | `memory-edges` | Yes — debounced |
| Notepad | `notepad` | Yes — debounced |
| Task DAG | `task-dag` | Yes — debounced |
| Context pins | `context-pins` | Yes — debounced |
| Artifacts | `artifacts` | Yes — debounced |
| Active conversation | `active-conversation` | Yes — debounced |
| Semantic embeddings | `semantic-embeddings` | No (local only, recomputable) |

### 2.4 Routing

Uses **wouter** (lightweight ~1KB router, patched via `patches/wouter@3.7.1.patch` to expose route paths to `window.__WOUTER_ROUTES__`).

| Path | Component | Description |
|------|-----------|-------------|
| `/` | `WorkbenchPage` | Main 3-column layout (sidebar + chat + artifacts) |
| `/memory` | `MemoryMapPage` | Interactive force-directed knowledge graph |
| `/admin` | `AdminPage` | Admin panel for membership tier management |
| `/404` | `NotFound` | 404 page |
| `*` (fallback) | `NotFound` | Catch-all |

The app wraps all routes in `AuthenticatedApp`, which gates on authentication. Unauthenticated users see `LoginPage`.

---

## 3. Features

### 3.1 Multi-Provider AI Chat

The core chat interface (`ChatInterface.tsx`) supports real-time AI conversations with code block detection, citation rendering, and streaming markdown output.

#### Supported Providers & Models

| Provider | Models | Context Window | API Base URL |
|----------|--------|---------------|--------------|
| **OpenAI** | GPT-4o, GPT-4o Mini, GPT-4 Turbo, o1, o3 Mini | 128K-200K | `api.openai.com` |
| **Anthropic** | Claude Opus 4.6, Claude Sonnet 4.6, Claude Haiku 4.5 | 200K | `api.anthropic.com` |
| **Google** | Gemini 3.1 Flash Lite, Gemini 3 Flash, Gemini 2.5 Pro, Gemini 2.5 Flash, Gemini 2.0 Flash | 1M | `generativelanguage.googleapis.com` |
| **DeepSeek** | DeepSeek R1, DeepSeek V3 | 64K | `api.deepseek.com` |
| **Meta** (via Groq) | Llama 4 Maverick (400B MoE), Llama 4 Scout (109B), Llama 3.3 70B | 128K-10M | `api.groq.com` |
| **Mistral AI** | Mistral Large, Mistral Small, Codestral | 32K-256K | `api.mistral.ai` |
| **xAI** | Grok 3, Grok 3 Mini | 128K | `api.x.ai` |
| **OpenRouter** | Auto, GPT-5.2, GPT-4o, Claude Opus 4.6, Claude Sonnet 4.6, Gemini 2.5 Pro, DeepSeek R1, Llama 4 Maverick, Mistral Large | varies | `openrouter.ai` |

**Total: 8 providers, 30+ built-in models** plus user-defined custom models.

#### Chat Features

- **Streaming output** via Streamdown library with real-time markdown rendering
- **Code block detection** — fenced code blocks automatically dispatched to Artifacts panel via `artifact-update` CustomEvent
- **Web search integration** — toggle in header; uses DuckDuckGo + Wikipedia via server proxy
- **URL content extraction** — detects URLs in user messages, fetches readable text server-side
- **Auto-naming conversations** — AI generates a summary title from the first user message
- **Citation rendering** — web search results shown as numbered references with domain badges
- **Message actions** — copy, regenerate, pin to context, create branch, thumbs up/down
- **Per-conversation persistence** — messages stored per-user per-conversation in IndexedDB/Supabase
- **Branch-aware messaging** — messages tagged with `branchId`, filtered by lineage
- **Conversation memory** — background extraction of key facts from AI responses, auto-compaction
- **User profile injection** — optional display name, role, bio, and custom instructions injected into system prompt
- **Input sanitization** — HTML tags and event handlers stripped via `sanitizeText()`
- **Abort support** — stop generation mid-stream with AbortController

#### AI Client Architecture

The shared `callAI()` function (`client/src/lib/aiClient.ts`) handles provider-specific API formatting:

- OpenAI, DeepSeek, xAI, Meta (Groq), Mistral, OpenRouter use OpenAI-compatible chat completions format
- Anthropic uses its native Messages API
- Google uses the Gemini `generateContent` endpoint with role mapping (`assistant` -> `model`)
- **All providers** route through the `/api/ai/chat` server proxy — API keys are injected server-side
- The client sends a Supabase auth token; the proxy fetches the encrypted key from the database, decrypts it, and injects the correct auth header before forwarding to the AI provider
- **Raw API keys never appear in client-side code, localStorage, or network requests**

### 3.2 Artifacts Panel

The right-side panel (`ArtifactsPanel.tsx`) displays AI-generated code and content with syntax highlighting and live preview.

| Feature | Description |
|---------|-------------|
| **Code syntax highlighting** | Tokenized line-by-line highlighting for all common languages |
| **HTML/CSS live preview** | Sandboxed `<iframe>` rendering of HTML artifacts |
| **Markdown rendering** | Streamdown-powered markdown display with `MD` badge indicator |
| **Multi-artifact tabs** | Navigate between multiple code artifacts with tab bar |
| **Table detection** | Detects table structures in chat output |
| **Drag from Notepad** | Notepad tabs can be dragged to create new artifacts |
| **Copy / Download** | One-click copy to clipboard or download as file |
| **Fullscreen mode** | Expand artifact to full viewport |
| **Delete artifacts** | Remove individual artifacts |
| **Auto-open** | Panel opens automatically when code blocks are detected |
| **Resizable** | Drag handle between chat and artifacts (280-900px range) |
| **Mobile overlay** | Full-screen overlay on mobile devices |

Artifacts are persisted per-user and populated via the `artifact-update` CustomEvent dispatched by ChatInterface.

### 3.3 Conversation Branching

The branching system (`ConversationBranch.tsx` + `branchLineage.ts`) enables non-linear conversation exploration.

| Feature | Description |
|---------|-------------|
| **Branch from any AI response** | Click the branch icon on any assistant message to fork |
| **Branch-on-branch** | Create sub-branches from branches (unlimited depth) |
| **Per-branch temperature** | Override the global temperature setting per branch |
| **Branch merging** | Merge branch memory back into the parent branch |
| **SVG timeline visualization** | Visual timeline showing branch history with user message dots |
| **Branch-isolated memory** | Each branch maintains its own memory context |
| **Branch switching** | Switch between branches via UI or `switch-branch` CustomEvent |
| **Branch naming/renaming** | Custom names with inline editing |
| **Branch deletion** | Delete branches with confirmation |
| **Color coding** | Each branch gets a unique color from a palette |

**Lineage computation** (`branchLineage.ts`):
- `getBranchLineage()` — returns ancestry chain `[main, ..., parent, self]`
- `getVisibleMessages()` — filters messages to show only current branch + ancestors up to fork point
- `getVisibleMemory()` — filters memory entries by branch lineage
- `mergeMemory()` — combines branch memory into target branch
- `getMergeTarget()` — finds the appropriate merge target branch

#### Branch Data Types

```typescript
interface BranchPoint {
  id: string
  messageId: string
  messagePreview: string
  createdAt: string
  sourceBranchId: string
}

interface ConversationBranch {
  id: string
  name: string
  color: string
  branchPointId: string | null  // null for "main"
  messageCount: number
  parentBranchId: string | null
  mergedInto?: string | null
  temperature?: number          // per-branch override
}
```

### 3.4 Context Pinning

Three-scope context management (`ContextPinning.tsx`) for persistent AI context injection.

| Scope | Icon | Color | Purpose |
|-------|------|-------|---------|
| **Global** | Globe | Blue | Applied to all conversations |
| **Project** | Folder | Violet | Applied to conversations in a project folder |
| **Conversation** | MessageCircle | Emerald | Applied to the current conversation only |

**Pin Features:**
- Pin any AI response as persistent context
- `useAsPrompt` flag — inject pin content directly into the system prompt
- Priority levels for ordering
- Inline editor for modifying pinned content
- AI-powered summarization of pinned content
- Collapsible scope sections
- Drag-and-drop reordering
- Persisted per-user via storage facade

### 3.5 Task DAG (Logic Graph Editor)

A visual node-based logic graph editor (`TaskDAG.tsx`) where each node represents an AI task that executes against the real AI API.

#### Node Types

| Type | Shape | Description |
|------|-------|-------------|
| **Entry** | Rounded rect (green) | Starting point of execution |
| **Exit** | Rounded rect (red) | Terminal node, collects final output |
| **Task** | Rounded rect (blue) | Standard AI task node with prompt and role |
| **Conditional** | Diamond (amber) | Branch logic with pass/fail paths |

#### Conditional Node Prompt Sections

| Section | Purpose |
|---------|---------|
| `conditionExamine` | What to evaluate in the input |
| `conditionSuccess` | Prompt for the "pass" path |
| `conditionFailure` | Prompt for the "fail" path |
| `conditionImprove` | Prompt for improvement/retry logic |

#### DAG Execution Engine

- **Mailbox-based execution** — each node has a mailbox; execution proceeds when all inputs arrive
- **Multi-input aggregation** — nodes with multiple incoming edges wait for all inputs
- **Loop handling** — nodes track `visitCount` and `maxIterations` for loop control
- **Loop stagnation detection** — AI-based analysis to detect when a loop is no longer making progress
- **Real AI execution** — each node calls `callAI()` with its configured prompt and role
- **Edge types** — `default`, `pass`, `fail` with corresponding colors
- **SVG canvas** — pan, zoom, drag nodes, connect with edges
- **Node editing** — inline prompt, role, and parameter editing
- **Persist state** — graph layout and execution state saved per-user

#### DAG Node Interface

```typescript
interface DAGNode {
  id: string
  nodeIndex: number
  x: number; y: number
  label: string
  prompt: string
  role: string
  passCondition: string
  loopPrompt: string
  maxIterations: number
  status: "idle" | "running" | "completed" | "error"
  output: string
  visitCount: number
  nodeType: "task" | "conditional" | "entry" | "exit"
  conditionExamine: string
  conditionSuccess: string
  conditionFailure: string
  conditionImprove: string
}
```

### 3.6 Memory Map

An interactive force-directed knowledge graph (`MemoryMapPage.tsx`) that visualizes extracted knowledge from conversations.

| Feature | Description |
|---------|-------------|
| **Force-directed layout** | Physics-based node positioning with attraction/repulsion |
| **Auto-add from AI responses** | Substantial AI responses automatically create memory nodes |
| **Category filtering** | Filter by: career, technical, personal, project, user |
| **Semantic edges** | Google Embedding API (Gemini) computes cosine similarity between nodes |
| **Search and zoom** | Search nodes by keyword, zoom to locate |
| **Curved edges with particles** | Animated SVG edges between related nodes |
| **Node dragging** | Freely drag nodes to rearrange |
| **Conversation snippets** | Each node stores associated conversation excerpts |
| **Pan/zoom canvas** | Full SVG canvas with viewport controls |
| **Node management** | Add, delete, edit nodes manually |
| **Keyword tags** | Each node can have associated keywords |

Memory nodes are persisted in the `memory_map` Supabase table and locally in IndexedDB.

### 3.7 Notepad

A slide-in scratchpad panel (`Notepad.tsx`) with multi-tab support and rich entry types.

| Feature | Description |
|---------|-------------|
| **Multi-tab notes** | Create, rename, and switch between multiple notes |
| **Text entries** | Free-form text input with collapsible entries |
| **Image entries** | Drop or paste images (stored as data URLs) |
| **Conversation entries** | Drag chat messages into notes (stores role + content) |
| **AI condensation** | Summarize all entries in a note via AI call |
| **Export as Markdown** | Multi-select notes and export as `.md` file |
| **Drag to Artifacts** | Drag a note tab to create an artifact from its content |
| **Momentum-based dragging** | Horizontal tab bar with inertia scrolling |
| **Persistent storage** | Notes saved per-user via storage facade |
| **Entry collapse/expand** | Toggle individual entries for space management |
| **Entry deletion** | Remove individual entries from a note |

#### Note Data Model

```typescript
interface NoteEntry {
  id: string
  type: "text" | "image" | "conversation"
  content: string
  createdAt: string
  collapsed?: boolean
}

interface Note {
  id: string
  title: string
  entries: NoteEntry[]
  createdAt: string
  updatedAt: string
}
```

### 3.8 Semantic Search

Cross-conversation search (`SemanticSearch.tsx`) with fuzzy matching and result previews.

| Feature | Description |
|---------|-------------|
| **Full-text search** | Searches across all stored conversations and code |
| **Fuzzy matching** | Tolerant matching for typos and partial queries |
| **Result types** | Chat, code, data, file categories |
| **Filters** | All, code, conversations, files |
| **Sort options** | Relevance, date, type |
| **Keyword highlighting** | Search terms highlighted in results |
| **Preview panel** | Breathing glow effect on selected result |
| **Jump-to navigation** | Navigate directly to the source conversation |

### 3.9 Widgets Showcase

An AI-powered interactive widget builder (`WidgetsShowcase.tsx`) where users chat with AI to generate and refine widgets.

- Users describe desired widgets in natural language
- AI generates HTML/JS widgets with charts, tables, and trackers
- Generated widgets render in the Artifacts panel as live previews
- Uses the same core `callAI()` infrastructure as the main chat
- Message history persisted separately from main chat

### 3.10 User Profile & Personalization

Optional user profile fields in Settings that personalize AI interactions:

| Field | Max Length | Purpose |
|-------|-----------|---------|
| Display Name | 100 chars | How the AI addresses the user |
| Role | 100 chars | Professional context (e.g., "Frontend Developer") |
| Bio | 500 chars | Background information for AI context |
| Custom Instructions | 2000 chars | Persistent system prompt additions |

All profile fields are **optional** — the user chooses what to fill. Filled fields are automatically injected into the AI system prompt for personalized responses.

### 3.11 Settings

Full-featured settings dialog (`SettingsDialog.tsx`) with 8 tabs:

| Tab | Settings |
|-----|----------|
| **General** | Language (zh-TW / en), send key preference (Enter / Ctrl+Enter) |
| **Appearance** | Theme (dark / light / system), font size (slider 10-35px with fixed-size popup and live preview "Aa / 測試"), message density (compact / comfortable / spacious), avatar display (both / user / ai / none), animations toggle |
| **Chat** | Streaming toggle, timestamps, markdown rendering, max tokens (1-128000), temperature (0-2), custom system prompt |
| **Profile** | Display name, role, bio, custom instructions |
| **Membership** | View current tier (Classic / Pro / Ultra), tier benefits |
| **Models & API Keys** | Per-provider API key management with visibility toggle, custom model registration (name, provider dropdown, endpoint, context window) |
| **Privacy** | Save history toggle, share analytics toggle, clear all data |
| **About** | Version info, links |

**Import/Export:** Settings can be exported as JSON and imported on another device. API keys are **never** included in exports for security.

### 3.12 Sidebar

Collapsible sidebar (`Sidebar.tsx`) with chat management and folder organization.

| Feature | Description |
|---------|-------------|
| **Chat history** | List of all conversations with timestamps |
| **Search chats** | Filter conversations by title |
| **Pin conversations** | Pin important chats to the top |
| **Folders** | Organize chats into folders with custom icons and colors |
| **Nested folders** | Sub-folder support with `parentId` references |
| **Folder prompts** | Per-folder system prompt injection |
| **Drag to folder** | Move chats between folders |
| **Rename/delete** | Inline editing and deletion of chats and folders |
| **User profile card** | Shows username, email, membership tier |
| **Collapse toggle** | Full collapse to icon-only mode |
| **Mobile drawer** | Slide-in overlay on mobile (< 768px) |

### 3.13 Notification Panel

Header notification bell with a dropdown panel (`NotificationPanel.tsx`) showing system events, tips, and updates.

### 3.14 Feature Navigation

Tab-based feature switching (`FeatureNav.tsx`) between workspace modes:

| Group | Tabs |
|-------|------|
| **Core** | Chat, Artifacts, Widgets |
| **Advanced** | Task DAG, Branch, Context Pin, Semantic Search |

Core tabs use blue accent; advanced tabs use violet accent. A visual separator divides the groups.

### 3.15 Chat/Folder Lock System

Password-based protection for conversations and folders, implemented in `Sidebar.tsx`.

| Feature | Description |
|---------|-------------|
| **SHA-256 hashed passwords** | Passwords hashed via Web Crypto `crypto.subtle.digest('SHA-256', ...)` before storage |
| **Lock icon** | Appears on hover to the left of the three-dots menu; always visible when the item is locked |
| **Session-based unlock** | Unlocked items stored in a `Set<string>` in component state; re-locks on page refresh |
| **Context menu integration** | Right-click menu shows "Lock" (if unlocked) or "Remove Lock" (if locked) |
| **Cloud sync** | Lock hash stored as `lockHash` property on conversation/folder metadata, synced to Supabase |
| **Admin bypass** | Admin user (`isAdmin` from AuthContext) bypasses all lock checks |
| **Password never stored** | Only the SHA-256 hash is persisted; the plaintext password is discarded after hashing |
| **Locked chat display** | Title replaced with "🔒 Locked" (italic, dimmed); content inaccessible |
| **Locked folder isolation** | Children (chats + sub-folders) completely hidden, folder cannot expand |
| **Delete protection** | `handleDeleteChat` and `handleDeleteFolder` check `lockHash` — blocked with toast if locked |
| **Drag-to-locked confirmation** | `moveChatToFolder` checks target folder's `lockHash`; shows confirmation dialog |
| **Don't-ask-again** | `lockDropSkipFolders: Set<string>` — per-folder session opt-out, resets on refresh |

**Data flow:**
```
User sets password → SHA-256 hash → stored in conversation/folder metadata → synced to Supabase
User clicks locked item → prompt for password → SHA-256 hash → compare with stored hash → add to unlockedSet
User drags chat to locked folder → confirmation dialog → "don't ask again" checkbox → moveChatToFolder(skipLockCheck=true)
```

**Lock enforcement points:**
| Action | Check location | Behavior when locked |
|--------|---------------|---------------------|
| Click chat | `handleChatClick` | Opens lock dialog instead of conversation |
| Expand folder | `toggleFolder` | Opens lock dialog instead of expanding |
| View children | `FolderNode` render | Children hidden via conditional render |
| Delete chat | `handleDeleteChat` | Blocked with toast error |
| Delete folder | `handleDeleteFolder` | Blocked with toast error |
| Drag into folder | `moveChatToFolder` | Confirmation dialog (skippable per folder) |
| Context menu | Right-click menu | Shows "Lock" or "Remove Lock" |

### 3.16 Background AI Response

AI responses continue generating even when the user navigates away from the Chat tab (`ChatInterface.tsx`).

| Feature | Description |
|---------|-------------|
| **Global `pendingResponses` Map** | Defined outside the component; survives React unmount/remount cycles |
| **Transparent re-mount** | On re-mount, `ChatInterface` checks `pendingResponses` for the current conversation and picks up completed responses |
| **No auto-abort** | Component unmount does NOT abort the `AbortController` — only the manual "Stop" button does |
| **Map key** | `conversationId` is the key; each conversation can have at most one pending response |

### 3.17 Unified Branding System

Centralized branding assets in `client/public/logos/`.

| Asset | File | Usage |
|-------|------|-------|
| **App icon** | `app-logo.png` | Favicon, AI chat bubble avatar, login page logo, memory map center node |
| **Brand wordmark** | `ai-workbench.png` | Sidebar header (with CSS `mask-image` for soft gradient edges) |
| **App logo component** | `client/src/components/AppLogo.tsx` | Reusable React component for the app icon |

The AI chat bubble uses the app logo instead of a generic sparkle icon. The user chat bubble shows the Google profile photo (from `user.avatar` in AuthContext).

### 3.18 Avatar Display Settings

Granular avatar visibility control in Settings > Appearance.

| `avatarDisplay` value | User avatar | AI avatar |
|----------------------|-------------|-----------|
| `"both"` | Shown | Shown |
| `"user"` | Shown | Hidden |
| `"ai"` | Hidden | Shown |
| `"none"` | Hidden | Hidden |

Replaces the previous simple `showAvatars` boolean toggle. The user avatar shows the Google profile photo when available.

### 3.19 Font Size Slider

In Settings > Appearance, clicking [Edit] next to font size opens a fixed-size popup (360x200px).

| Feature | Description |
|---------|-------------|
| **Range** | 10-35px |
| **Live preview** | Preview text "Aa / 測試" scales in real time |
| **Fixed popup size** | The popup itself does not scale — only the preview text does |
| **Root font size** | Sets `font-size` on `<html>` element |
| **Sidebar scaling** | Sidebar text uses `rem` units, so it scales with the root font size |

### 3.20 OpenRouter CORS Fix

OpenRouter blocks direct browser requests (CORS). The solution uses a selective proxy strategy.

| Provider | Routing | Reason |
|----------|---------|--------|
| **OpenRouter** | Always via `/api/ai/chat` proxy | CORS blocked from browser |
| **All other providers** | Direct API call from browser | Faster, no timeout limit |
| **Fallback** | If any direct call fails with CORS error, auto-retry via proxy | Resilience |

Custom OpenRouter models registered via Settings also route through the proxy.

### 3.21 Custom Model UI Improvements

| Feature | Description |
|---------|-------------|
| **Provider dropdown** | Provider field changed from free-text input to a dropdown selector with all supported providers |
| **Custom models in ModelSwitcher** | User-registered custom models appear alongside built-in models in the ModelSwitcher component |
| **OpenRouter proxy** | Custom models with `openrouter` provider automatically route through the CORS proxy |

### 3.22 Mobile Responsive Design

| Breakpoint | Component | Behavior |
|------------|-----------|----------|
| `< 768px` | Sidebar | Slide-in drawer with backdrop overlay |
| `< 768px` | FeatureNav | Compact horizontal scroll |
| `< 768px` | Artifacts | Full-screen overlay |
| `< 768px` | Settings dialog | Horizontal icon tabs (no text labels) |
| `< 768px` | Header | Hamburger menu, non-essential buttons hidden |
| `>= 768px` | All | Full 3-column desktop layout |

---

## 4. Authentication & User Management

### 4.1 Login Flow

The login system (`LoginPage.tsx` + `AuthContext.tsx`) supports multiple authentication methods:

| Method | Requirements |
|--------|-------------|
| **Email/Password** (Supabase Auth) | `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` configured |
| **Google OAuth** (Supabase) | Google provider enabled in Supabase + Google Cloud credentials |
| **Google OAuth** (Legacy GIS) | `VITE_GOOGLE_CLIENT_ID` set (fallback when Supabase not configured) |
| **Demo account** | Always available — email `demo`, password `demo` (no hint shown on login page) |

**Login/Register UI:**
- Login and Register presented as tabs (not separate pages)
- Email + password fields (not username-based)
- No demo credentials hint displayed on the login page

**Registration features:**
- Supabase Auth `signUp` with email confirmation
- Automatic verification email via Supabase (or custom SMTP)
- **Disposable email blocking** — 40+ known temporary email domains blocked at registration (e.g., `tempmail.com`, `guerrillamail.com`, `mailinator.com`, `yopmail.com`)
- Duplicate email detection (Supabase returns empty identities array)
- Minimum password length: 6 characters

### 4.2 User Identity

| Property | Source | Purpose |
|----------|--------|---------|
| `id` | UUID v4 from Supabase `auth.users` (or `demo-user-001` / `google-{sub}` for fallbacks) | Permanent user identifier for all data isolation |
| `username` | Supabase `user_metadata.full_name`, email, or registration input | Display name |
| `email` | Supabase `auth.users.email` | Admin identification, profile display |
| `avatar` | Supabase `user_metadata.avatar_url` | Profile picture (Google OAuth) |
| `provider` | `"supabase"` / `"google"` / `"local"` | Auth method tracking |

### 4.3 Membership Tiers

| Tier | Default | Assignment |
|------|---------|------------|
| **Classic** | Yes (all new users) | Automatic |
| **Pro** | No | Admin-assigned via `/admin` page |
| **Ultra** | No | Admin-assigned via `/admin` page |

Stored in the `profiles.membership_tier` column with a CHECK constraint.

### 4.4 Admin System

- Admin is identified by matching `user.email` against `VITE_ADMIN_EMAIL` environment variable
- `isAdmin` flag exposed via `AuthContext`
- `/admin` page (`AdminPage.tsx`) allows:
  - Search users by ID
  - View user profile details
  - Change membership tier (Classic / Pro / Ultra)
- Admin bypasses rate limits (no server-side enforcement yet; planned)
- Admin bypasses all conversation and folder locks (no password prompt)
- RLS policies in Supabase allow admin email to read/update any profile

---

## 5. Security

### 5.1 Server-Side Protection

| Protection | Implementation |
|-----------|----------------|
| **SSRF protection** | Blocks private IP ranges: `10.x.x.x`, `172.16-31.x.x`, `192.168.x.x`, `127.x.x.x`, `169.254.x.x`, `0.x.x.x`, `localhost`, `[::1]`, `*.internal`, `*.local`, `metadata.google.internal` |
| **API endpoint whitelist** | Only 8 known AI provider base URLs allowed for `/api/ai/chat` proxy |
| **Rate limiting** | In-memory per-IP rate limiter with configurable window and max requests |
| **Security headers** | CSP, HSTS, X-Frame-Options: DENY, X-Content-Type-Options: nosniff, X-XSS-Protection, Referrer-Policy, Permissions-Policy |
| **Header sanitization** | Strips `host`, `cookie`, `set-cookie`, `origin`, `referer`, `x-forwarded-for`, `x-real-ip` from forwarded requests |
| **URL validation** | Only `http:` / `https:` protocols allowed; credentials in URLs blocked |
| **Payload size limit** | Express JSON body parser limited to 1MB |
| **Response header filtering** | Only `content-type`, `retry-after`, `x-ratelimit-remaining` forwarded from AI APIs |
| **Timeout** | AI proxy requests timeout at 120 seconds; search/fetch at 10-15 seconds |

**Allowed AI Endpoints (whitelist):**

```
https://api.openai.com/
https://api.anthropic.com/
https://generativelanguage.googleapis.com/
https://api.deepseek.com/
https://api.x.ai/
https://api.groq.com/
https://api.mistral.ai/
https://openrouter.ai/
```

### 5.2 Client-Side Protection

| Protection | Implementation |
|-----------|----------------|
| **Input sanitization** | `sanitizeText()` strips all HTML tags (`<script>`, `<style>`, `<iframe>`, `<embed>`, `<object>`, `<svg>`, etc.) and event handlers |
| **API key encryption** | Server-side AES-256-GCM encryption — keys stored in `user_api_keys` table, never sent to client |
| **Per-user IndexedDB isolation** | Each user gets a separate IndexedDB database (`ai-wb-u-{userId}`) |
| **API keys never reach browser** | Keys stored server-side only; client receives a placeholder prefix (e.g. "sk-a…") for display |
| **Settings export excludes keys** | `exportSettings()` explicitly clears `apiKeys: {}` |
| **Settings import preserves keys** | `importSettings()` never overwrites existing API keys |
| **Input length limits** | System prompt: 8192 chars, model ID: 128 chars, display name: 100 chars, bio: 500 chars, custom instructions: 2000 chars |
| **Chat/folder locks** | SHA-256 hashed passwords via Web Crypto API; only hash stored (in conversation/folder metadata); session-based unlock (Set in component state); admin bypass |

### 5.3 Database Security (Supabase)

| Table | RLS Policies | Audit Trigger |
|-------|-------------|---------------|
| `profiles` | SELECT/INSERT/UPDATE/DELETE own; admin SELECT/UPDATE any | No |
| `user_settings` | SELECT/INSERT/UPDATE/DELETE own | Yes |
| `conversations` | SELECT/INSERT/UPDATE/DELETE own | No |
| `messages` | SELECT/INSERT/UPDATE/DELETE own | Yes |
| `branches` | SELECT/INSERT/UPDATE/DELETE own | No |
| `conversation_memory` | SELECT/INSERT/UPDATE/DELETE own | No |
| `memory_map` | SELECT/INSERT/UPDATE/DELETE own | No |
| `sidebar_folders` | SELECT/INSERT/UPDATE/DELETE own | No |
| `user_data` | SELECT/INSERT/UPDATE/DELETE own | No |
| `audit_log` | No policies (admin-only via service_role) | — |

**Row count limits (enforced by SQL triggers):**

| Resource | Limit |
|----------|-------|
| Messages per user | 100,000 |
| Conversations per user | 5,000 |

**Column length constraints:**

| Column | Max Length |
|--------|-----------|
| `messages.content` | 500,000 chars |
| `conversations.title` | 500 chars |
| `messages.model` | 200 chars |
| `messages.branch_id` | 100 chars |
| `*.namespace` | 500 chars |

### 5.4 Vercel Security Headers

Configured in `vercel.json`:

| Header | Value |
|--------|-------|
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |

---

## 6. Deployment

See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for step-by-step instructions including Supabase setup, Google OAuth configuration, and Vercel deployment.

### Quick Start

```bash
# Install dependencies
pnpm install

# Start development server (port 3000 with HMR)
pnpm dev

# Type check
pnpm check

# Build for production
pnpm build

# Start production server
pnpm start
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | For cloud features | Supabase project URL (`https://xxx.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | For cloud features | Supabase anonymous public key |
| `SUPABASE_URL` | For API key storage | Supabase URL (server-side, same value as VITE_SUPABASE_URL) |
| `SUPABASE_SERVICE_ROLE_KEY` | For API key storage | Supabase service role key (server-side only) |
| `API_KEY_ENCRYPTION_SECRET` | For API key storage | 32-byte hex secret for AES-256-GCM encryption |
| `VITE_GOOGLE_CLIENT_ID` | Optional | Legacy Google OAuth (not needed if using Supabase Google provider) |
| `VITE_ADMIN_EMAIL` | Optional | Email address that gets admin privileges |
| `VITE_OAUTH_PORTAL_URL` | Optional | OAuth portal URL |
| `VITE_APP_ID` | Optional | Application ID |
| `VITE_ANALYTICS_ENDPOINT` | Optional | Umami analytics endpoint |
| `VITE_ANALYTICS_WEBSITE_ID` | Optional | Umami website ID |
| `PORT` | Optional | Server port (default: 3000) |

### Vercel Configuration

`vercel.json` configures:
- Build command: `vite build`
- Output directory: `dist/public`
- Framework: Vite
- Rewrites: `/api/*` to serverless functions, `/*` to `index.html` (SPA fallback)
- Security headers (X-Frame-Options, CSP, etc.)

### Demo Mode (No Supabase)

If `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are not set:
- System falls back to localStorage + IndexedDB only
- Login with `demo` / `demo` credentials
- All data stored locally in the browser
- Registration and Google OAuth disabled

---

## 7. API Reference

### 7.1 Server Endpoints

#### `GET /api/search`

Web search proxy using DuckDuckGo Instant Answer API + Wikipedia REST API.

| Parameter | Type | Description |
|-----------|------|-------------|
| `q` | query string | Search query (max 500 chars) |

**Response:** `{ results: { title, snippet, url }[], error?: string }`

**Rate limit:** 30 requests/minute/IP

---

#### `GET /api/fetch-url`

Extracts readable text from a URL (SSRF-protected).

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | query string | Target URL to fetch |

**Response:** `{ title: string, text: string, url: string, error?: string }`

- Text truncated to 4000 characters
- Only `text/html`, `text/plain`, `application/xhtml` content types accepted
- HTML stripped to plain text (scripts, styles, nav removed)

**Rate limit:** 20 requests/minute/IP

---

#### `POST /api/ai/chat`

AI API proxy with server-side key injection. Fetches encrypted API keys from the database.

| Body Field | Type | Description |
|------------|------|-------------|
| `endpoint` | string | Target AI API URL (must be in whitelist) |
| `body` | object | Request body to forward |
| `provider` | string | Provider ID (e.g. "openai", "anthropic") — proxy fetches key from DB |
| `headers` | object | (Legacy) Headers to forward — deprecated, use `provider` instead |

**Auth:** `Authorization: Bearer <supabase-access-token>` required for `provider` mode.

**Response:** Streamed response from the AI provider.

**Rate limit:** 60 requests/minute/IP

---

#### `POST /api/keys/save`

Store an encrypted API key server-side.

| Body Field | Type | Description |
|------------|------|-------------|
| `provider` | string | Provider ID (openai, anthropic, google, etc.) |
| `key` | string | Raw API key (encrypted before storage, never returned) |

**Auth:** `Authorization: Bearer <supabase-access-token>` required.

**Response:** `{ success: true, provider, prefix: "sk-a…" }`

---

#### `POST /api/keys/delete`

Remove a stored API key.

| Body Field | Type | Description |
|------------|------|-------------|
| `provider` | string | Provider ID to delete |

**Auth:** Required.

---

#### `GET /api/keys/status`

List which providers have saved keys (never returns key values).

**Auth:** Required.

**Response:** `{ keys: [{ provider, prefix, updatedAt }] }`

---

### 7.2 Custom Events

The application uses `CustomEvent` dispatching on `window` for cross-component communication:

| Event | Detail | Dispatched By | Listened By |
|-------|--------|---------------|-------------|
| `artifact-update` | `{ id, filename, language, code }` | ChatInterface | ArtifactsPanel |
| `artifacts-open` | — | ChatInterface | WorkbenchPage |
| `rename-chat` | `{ chatId, title }` | ChatInterface | Sidebar |
| `branch-created` | `{ messageId, preview, conversationId }` | ChatInterface | ConversationBranch |
| `switch-branch` | `{ branchId, conversationId }` | ConversationBranch | ChatInterface |
| `merge-branch` | `{ branchId, conversationId }` | ConversationBranch | ChatInterface |
| `pin-added` | `{ content, scope, ... }` | ChatInterface | ContextPinning |
| `feature-switch` | `{ feature: FeatureTab }` | Various | WorkbenchPage |
| `conv-messages-updated` | `{ conversationId }` | ChatInterface | ConversationBranch |
| `branch-data-changed` | `{ conversationId }` | ConversationBranch | ChatInterface |
| `memory-add` | `{ label, category, excerpt, ... }` | ChatInterface | MemoryMapPage |
| `storage-remote-update` | `{ namespace, data }` | supabase-sync (Realtime) | SettingsContext (API key merge) |

---

## 8. UI Design System

### Void Glass Aesthetic

The design language uses dark glassmorphism with subtle gradients, transparency, and blur effects.

**Background:** `oklch(0.09 0.012 265)` (near-black with blue tint)

**Accent gradients:**
- Blue: `oklch(0.62 0.22 255)` — primary actions, core features
- Violet: `oklch(0.55 0.25 290)` — advanced features, secondary accents

### oklch Color System

All colors use the oklch color space for perceptual uniformity. Theme variables are defined as CSS custom properties and toggled via `data-theme` attribute on `<html>`.

### Glassmorphism CSS Classes

| Class | Effect |
|-------|--------|
| `.glass-panel` | Translucent background with backdrop blur |
| `.gradient-text` | Blue-to-violet gradient text |
| `.glow-blue` | Blue outer glow effect |
| `.glow-violet` | Violet outer glow effect |
| `bg-white/2`, `bg-white/5` | Subtle white overlays for layering |
| `border-white/[0.06]` | Ultra-subtle borders |
| `backdrop-blur-sm` | Light blur for header/navigation |

### Fonts

| Font | Usage | Weight |
|------|-------|--------|
| **Geist** | Headings, branding | Variable |
| **Inter** | Body text, UI labels | Variable |
| **JetBrains Mono** | Code blocks, monospace content | Variable |

### Component Library

**shadcn/ui** (New York variant) with 53+ Radix-based components in `client/src/components/ui/`:

accordion, alert, alert-dialog, aspect-ratio, avatar, badge, breadcrumb, button, button-group, calendar, card, carousel, chart, checkbox, collapsible, command, context-menu, dialog, drawer, dropdown-menu, empty, field, form, hover-card, input, input-group, input-otp, item, kbd, label, menubar, navigation-menu, pagination, popover, progress, radio-group, resizable, scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner, spinner, switch, table, tabs, textarea, toggle, toggle-group, tooltip

### Light Theme

CSS overrides applied when `data-theme="light"` on root element. Inverts the dark palette to light backgrounds with appropriate contrast adjustments.

### Mobile Responsive Design

| Breakpoint | Behavior |
|------------|----------|
| `< 768px` (mobile) | Sidebar becomes slide-in drawer with overlay backdrop; Artifacts panel becomes full-screen overlay; Feature tabs scroll horizontally; Web search toggle hidden; Memory Map link hidden; Settings dialog tabs become horizontal icon bar (no text labels); Header shows hamburger menu, non-essential buttons hidden |
| `>= 768px` (desktop) | Full 3-column layout; Sidebar inline and collapsible; Artifacts panel resizable side panel |

---

## 9. Rate Limits & Quotas

### Server Rate Limits (per IP)

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/search` | 30 requests | 60 seconds |
| `/api/fetch-url` | 20 requests | 60 seconds |
| `/api/ai/chat` | 60 requests | 60 seconds |

### Database Limits (per user, enforced by SQL triggers)

| Resource | Limit |
|----------|-------|
| Messages | 100,000 per user |
| Conversations | 5,000 per user |

### Supabase Free Tier

| Resource | Free Quota |
|----------|-----------|
| Database storage | 500 MB |
| Auth MAU | 50,000 |
| Storage | 1 GB |
| Edge Functions | 500K invocations/month |
| Realtime connections | 200 concurrent |
| Verification emails | 4 per hour (default SMTP) |

### Vercel Free Tier

| Resource | Free Quota |
|----------|-----------|
| Bandwidth | 100 GB/month |
| Serverless execution | 100 GB-hrs/month |
| Build minutes | 6,000/month |
| Concurrent executions | 10 |
| Function timeout | 10 seconds (Hobby plan) |

---

## 10. Dependencies

### Production Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `react` | ^19.2.1 | UI framework |
| `react-dom` | ^19.2.1 | React DOM renderer |
| `express` | ^4.21.2 | Server framework |
| `@supabase/supabase-js` | ^2.99.2 | Supabase client (auth + database) |
| `wouter` | ^3.3.5 | Lightweight router (patched) |
| `framer-motion` | ^12.23.22 | Animation library |
| `streamdown` | ^1.4.0 | Streaming markdown renderer |
| `idb` | ^8.0.3 | IndexedDB wrapper |
| `axios` | ^1.12.0 | HTTP client |
| `recharts` | ^2.15.2 | Chart components (widgets) |
| `sonner` | ^2.0.7 | Toast notifications |
| `lucide-react` | ^0.453.0 | Icon library |
| `tailwind-merge` | ^3.3.1 | Tailwind class conflict resolution |
| `clsx` | ^2.1.1 | Conditional class names |
| `class-variance-authority` | ^0.7.1 | Component variant management |
| `zod` | ^4.1.12 | Schema validation |
| `react-hook-form` | ^7.64.0 | Form state management |
| `@hookform/resolvers` | ^5.2.2 | Zod resolver for react-hook-form |
| `cmdk` | ^1.1.1 | Command palette component |
| `vaul` | ^1.1.2 | Drawer component |
| `nanoid` | ^5.1.5 | Unique ID generation |
| `next-themes` | ^0.4.6 | Theme management |
| `input-otp` | ^1.4.2 | OTP input component |
| `react-day-picker` | ^9.11.1 | Date picker |
| `react-resizable-panels` | ^3.0.6 | Resizable panel layout |
| `embla-carousel-react` | ^8.6.0 | Carousel component |
| `tailwindcss-animate` | ^1.0.7 | Tailwind animation utilities |
| `@radix-ui/react-*` | various | 20+ Radix UI primitives (accordion, dialog, dropdown, popover, select, slider, switch, tabs, toggle, tooltip, etc.) |

### Dev Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `vite` | ^7.1.7 | Build tool and dev server |
| `@vitejs/plugin-react` | ^5.0.4 | React Fast Refresh for Vite |
| `typescript` | 5.6.3 | Type checking |
| `tailwindcss` | ^4.1.14 | CSS framework |
| `@tailwindcss/vite` | ^4.1.3 | Tailwind Vite plugin |
| `@tailwindcss/typography` | ^0.5.15 | Typography plugin |
| `postcss` | ^8.4.47 | CSS processing |
| `autoprefixer` | ^10.4.20 | CSS vendor prefixing |
| `esbuild` | ^0.25.0 | Server bundle (Express) |
| `prettier` | ^3.6.2 | Code formatter |
| `vitest` | ^2.1.4 | Test framework |
| `tsx` | ^4.19.1 | TypeScript execution |
| `tw-animate-css` | ^1.4.0 | Tailwind animate CSS |
| `@types/react` | ^19.2.1 | React type definitions |
| `@types/react-dom` | ^19.2.1 | React DOM type definitions |
| `@types/express` | 4.17.21 | Express type definitions |
| `@types/node` | ^24.7.0 | Node.js type definitions |

### Patches

| Package | Patch File | Purpose |
|---------|-----------|---------|
| `wouter@3.7.1` | `patches/wouter@3.7.1.patch` | Exposes `Route` paths to `window.__WOUTER_ROUTES__` for runtime route introspection |

---

## 11. File Structure

```
ai-workbench/
├── api/                              # Vercel Serverless Functions
│   ├── _lib/
│   │   ├── security.ts              # Shared security: rate limiter, SSRF protection, URL validation, AI endpoint whitelist
│   │   ├── auth.ts                  # Server-side Supabase JWT validation + service role client
│   │   └── encryption.ts           # AES-256-GCM API key encrypt/decrypt
│   ├── ai/
│   │   └── chat.ts                  # POST /api/ai/chat — AI proxy with server-side key injection
│   ├── audio/
│   │   ├── speech.ts                # POST /api/audio/speech — TTS proxy (Groq)
│   │   └── transcribe.ts           # POST /api/audio/transcribe — STT proxy (Groq Whisper)
│   ├── keys/
│   │   ├── save.ts                  # POST /api/keys/save — Store encrypted API key
│   │   ├── delete.ts                # POST /api/keys/delete — Remove API key
│   │   └── status.ts               # GET /api/keys/status — List saved providers
│   ├── fetch-url.ts                 # GET /api/fetch-url — URL content extraction
│   └── search.ts                    # GET /api/search — DuckDuckGo + Wikipedia proxy
│
├── client/                           # React 19 SPA
│   ├── public/
│   │   └── logos/                   # Provider logo SVGs + app-logo.png (app icon) + ai-workbench.png (brand wordmark)
│   └── src/
│       ├── main.tsx                 # Vite entry point
│       ├── App.tsx                  # Root component: AuthProvider → SettingsProvider → Router
│       ├── i18n.ts                  # Translation system (zh-TW / en)
│       ├── index.css                # Global styles, glassmorphism classes, oklch theme vars
│       │
│       ├── components/
│       │   ├── ChatInterface.tsx    # Main AI chat with streaming, code detection, branching, pinning
│       │   ├── ArtifactsPanel.tsx   # Code viewer/editor with syntax highlighting + live preview
│       │   ├── ConversationBranch.tsx # Branch manager with SVG timeline visualization
│       │   ├── ContextPinning.tsx   # Three-scope context pin manager (global/project/conversation)
│       │   ├── TaskDAG.tsx          # Visual logic graph editor with real AI execution
│       │   ├── SemanticSearch.tsx   # Cross-conversation search with fuzzy matching
│       │   ├── Notepad.tsx          # Multi-tab scratchpad with text/image/conversation entries
│       │   ├── WidgetsShowcase.tsx  # AI-powered widget builder
│       │   ├── ModelSwitcher.tsx    # Provider/model selector with API key status
│       │   ├── FeatureNav.tsx       # Tab navigation between workspace features
│       │   ├── Sidebar.tsx          # Collapsible sidebar with chat history and folders
│       │   ├── SettingsDialog.tsx   # Full settings modal (8 tabs)
│       │   ├── NotificationPanel.tsx # Notification dropdown panel
│       │   ├── AppLogo.tsx          # Reusable app logo component (renders app-logo.png)
│       │   ├── ComputeToggle.tsx    # Compute mode toggle
│       │   ├── ErrorBoundary.tsx    # React error boundary
│       │   └── ui/                  # 53+ shadcn/ui components (Radix-based)
│       │
│       ├── contexts/
│       │   ├── AuthContext.tsx      # Authentication state (Supabase / Google / demo)
│       │   └── SettingsContext.tsx  # Global settings with validation and persistence
│       │
│       ├── lib/
│       │   ├── aiClient.ts         # Shared multi-provider AI API caller (callAI)
│       │   ├── branchLineage.ts    # Pure functions for branch ancestry and message filtering
│       │   ├── conversationMemory.ts # Memory extraction, compaction, migration, persistence
│       │   ├── semanticEmbedding.ts # Google Embedding API integration for semantic edges
│       │   ├── supabase.ts         # Supabase client initialization
│       │   ├── utils.ts            # cn() utility (clsx + tailwind-merge)
│       │   ├── storage.ts          # Storage re-exports + sanitizeText()
│       │   └── storage/
│       │       ├── index.ts        # Storage facade: in-memory cache + async IndexedDB/Supabase
│       │       ├── idb.ts          # IndexedDB operations (per-user database)
│       │       ├── sync-queue.ts   # Batched write queue for Supabase sync
│       │       ├── supabase-sync.ts # Cloud read/write via Supabase tables
│       │       ├── encryption.ts   # API key obfuscation (XOR + AES-256-GCM)
│       │       ├── migration.ts    # Legacy localStorage → IndexedDB migration
│       │       ├── conflict-resolver.ts # Sync conflict resolution
│       │       └── types.ts        # Storage types and namespace-to-table routing
│       │
│       └── pages/
│           ├── WorkbenchPage.tsx   # Main 3-column layout (sidebar + features + artifacts)
│           ├── MemoryMapPage.tsx   # Force-directed knowledge graph
│           ├── AdminPage.tsx       # Admin panel for membership tier management
│           ├── LoginPage.tsx       # Login/register with Google OAuth + disposable email blocking
│           └── NotFound.tsx        # 404 page
│
├── server/
│   └── index.ts                    # Express server: rate limiting, SSRF protection, security headers, API proxy, static serving
│
├── shared/
│   └── const.ts                    # Shared constants
│
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql  # Tables: profiles, user_settings, conversations, messages, branches, conversation_memory, memory_map, sidebar_folders, user_data, audit_log + RLS + triggers
│       ├── 002_membership_tier.sql # Adds membership_tier column + admin RLS policies
│       └── 003_user_api_keys.sql   # Server-side encrypted API key storage + RLS
│
├── patches/
│   └── wouter@3.7.1.patch         # Exposes route paths to window.__WOUTER_ROUTES__
│
├── .env.example                    # Environment variable template
├── package.json                    # Dependencies and scripts
├── tsconfig.json                   # TypeScript configuration
├── vite.config.ts                  # Vite build configuration with path aliases
├── vercel.json                     # Vercel deployment config (rewrites, headers)
├── CLAUDE.md                       # AI coding assistant instructions
├── DEPLOYMENT.md                   # Full deployment guide
└── spec.md                         # This file
```

---

## Appendix: Database Schema

### Supabase Tables

| Table | Primary Key | Purpose |
|-------|------------|---------|
| `profiles` | `id` (UUID, FK auth.users) | User profile: username, avatar, membership_tier |
| `user_settings` | `user_id` (UUID) | Settings JSON blob + encrypted API keys |
| `conversations` | `(user_id, id)` | Conversation metadata: title, folder_id |
| `messages` | `(user_id, conversation_id, id)` | Chat messages: role, content, model, branch_id, citations |
| `branches` | `(user_id, namespace)` | Branch data JSON blob |
| `conversation_memory` | `(user_id, namespace)` | Per-conversation memory JSON blob |
| `memory_map` | `(user_id, namespace)` | Knowledge graph node data |
| `sidebar_folders` | `(user_id, namespace)` | Folder tree structure |
| `user_data` | `(user_id, namespace)` | Generic catch-all key-value store |
| `user_api_keys` | `(user_id, provider)` | AES-256-GCM encrypted API keys (server-side only) |
| `audit_log` | `id` (BIGINT, auto) | INSERT/UPDATE/DELETE audit trail (admin-only) |

All user-facing tables have **Row-Level Security** enabled with per-user policies. The `audit_log` table has RLS enabled with **no policies**, making it accessible only via `service_role` key or direct database admin access.

**Realtime:** The `user_data` table is added to `supabase_realtime` publication for cross-device sync.

**Auto-triggers:**
- `on_auth_user_created` — automatically creates a profile row when a user signs up
- `audit_user_settings` — logs all changes to `user_settings`
- `audit_messages` — logs all changes to `messages`
- `enforce_message_limit` — rejects inserts when user has 100,000+ messages
- `enforce_conversation_limit` — rejects inserts when user has 5,000+ conversations
