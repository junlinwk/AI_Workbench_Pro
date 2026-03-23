<div align="center">


# AI Workbench
<img src="docs/media/logo-banner.png" alt="AI Workbench" width="160" />

<br>
<br>

**A production-ready, multi-provider AI chat platform**

**可部署的多模型 AI 對話平台**

<br/>

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-7-646cff?logo=vite&logoColor=white)](https://vite.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38bdf8?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Auth_+_DB-3ecf8e?logo=supabase&logoColor=white)](https://supabase.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

<br/>

[English](#english) | [繁體中文](#繁體中文)

<br/>

## Demo Link

<a href="https://ai-workbench-pro.vercel.app/">
  <img src="https://img.shields.io/badge/%F0%9F%9A%80%20Live%20Demo-ai--workbench--pro.vercel.app-7c3aed?style=for-the-badge&labelColor=1e1b4b" alt="Live Demo" />
</a>

<br/><br/>

</div>

<!-- ============================================================================ -->
<!-- DEMO VIDEO GALLERY -->
<!-- ============================================================================ -->

<div align="center">

## Demo Videos / 功能展示

</div>

<table>
<tr>
<td width="50%" align="center">

**Multi-Provider AI Chat**<br/>**多模型 AI 對話**


https://github.com/user-attachments/assets/1d599bd9-4a9b-490b-8713-2649443f83da


</td>
<td width="50%" align="center">

**MD/HTML Artifacts Panel**<br/> **MD/HTML 程式碼即時預覽**



https://github.com/user-attachments/assets/cb438b09-abd0-41ba-b7a4-39aa5f27f7a1


</td>
</tr>


<tr>
<td align="center">

**Conversation Branching**<br/>**對話分支**


<video src="https://github.com/user-attachments/assets/4745c5e2-8937-404b-9c7a-9c13a780755e" 
       autoplay 
       loop 
       muted 
       playsinline 
       width="100%">
</video>

</td>
<td align="center">

**Task DAG Editor**<br/>**視覺化任務圖編輯器**


https://github.com/user-attachments/assets/80f2feab-1456-480e-a1c9-89abb33bdab3


</td>
</tr>
<tr>
<td align="center">

**Memory Map**<br/>**知識圖譜**




https://github.com/user-attachments/assets/1c42aba2-d715-49c7-b472-85302d251df5



</td>
<td align="center">

**Context Pinning**<br/>**上下文釘選**



https://github.com/user-attachments/assets/eb4cf440-c005-4320-8c57-5a2676efed15


</td>
</tr>
<tr>
<td align="center">

**Voice & Gesture Mode**<br/>**語音 + 手勢操控**



https://github.com/user-attachments/assets/c7edd016-76d0-42df-aec2-a64c4d13e38f


</td>
<td align="center">

**Notepad**<br/>**記事本**


https://github.com/user-attachments/assets/4755c97b-1936-40db-aa3f-a7984a6bfe86


</td>
</tr>
<tr>
<td align="center">

**Semantic Search**<br/>**語意搜尋**




https://github.com/user-attachments/assets/7998c170-fcb1-4817-abe2-873592404632



</td>
<td align="center">

**Chat Lock**<br/>對話上鎖


https://github.com/user-attachments/assets/1eda08da-5daf-4498-801f-2a1931b57b1c



</td>
</tr>

<tr>
<td width="50%" align="center">

**Login Page**<br/>**登入頁面**



https://github.com/user-attachments/assets/344dd73e-3e90-4763-9ffd-10b9f6df9ad7



</td>
<td width="50%" align="center">

**Settings**<br/> **設定**



https://github.com/user-attachments/assets/e9e849f5-4864-4bb8-9942-87ba311d45bf




</td>
</tr>

</table>


---

<!-- ============================================================================ -->
<!-- ENGLISH VERSION -->
<!-- ============================================================================ -->

<a id="english"></a>

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Deployment](#deployment)
- [Supported AI Providers](#supported-ai-providers)
- [Security](#security)
- [Rate Limits & Quotas](#rate-limits--quotas)
- [Project Structure](#project-structure)
- [License](#license)

---

## Overview

AI Workbench is a full-stack TypeScript/React application that provides a unified interface for interacting with multiple AI providers. It features a **"Void Glass"** dark glassmorphism design, offline-first storage with cloud sync, conversation branching, a visual task graph editor, and a knowledge graph memory system.

The architecture is **frontend-heavy** — the Express server is a stateless file server and API proxy. All application logic lives in React.

---

## Features

### Core Chat

- **Multi-provider streaming chat** — talk to OpenAI, Anthropic, Google, DeepSeek, Meta, Mistral, xAI, and OpenRouter from one interface
- **Markdown rendering** with syntax-highlighted code blocks
- **File upload** — images, PDFs, code files with inline preview
- **URL content fetching** — paste a URL and the AI sees its content
- **Web search integration** — DuckDuckGo + Wikipedia via server proxy
- **Per-conversation settings** — temperature, max tokens, system prompt
- **Auto-naming** — AI generates a summary title from the first message
- **Message actions** — regenerate, copy, helpful/unhelpful feedback
- **Citations** with source URL references
- **Server-side API proxy** — all providers route through `/api/ai/chat` proxy with server-side key injection; raw API keys never reach the browser
- **Voice & gesture mode** — hands-free AI interaction with TTS auto-read (falls back to browser SpeechSynthesis when no Groq key is configured)

### Artifacts Panel

- **Code editor** with syntax highlighting (custom lightweight tokenizer)
- **Live preview** in sandboxed iframe
- Auto-populated when the AI generates code
- Support for React (TSX), HTML, CSS, Python, JavaScript, and more
- **Markdown auto-detection** — content without explicit `markdown`/`md` language tag is auto-detected via regex scoring (headings, lists, links, bold) and rendered with Streamdown
- Copy, download, and fullscreen actions

### Conversation Branching

- **Create branches** from any AI response
- **Switch between branches** — each branch sees only its lineage
- **Merge branches** into one
- Per-branch temperature overrides
- 8 color-coded branch labels

### Context Pinning

- **Three scopes**: Global, Project, Conversation
- **Five pin types**: Text, JSON, Code, Persona, Variable
- Enable/disable toggles, priority ordering, content condensation

### Task DAG (Logic Graph Editor)

- **Visual node-based editor** for AI task workflows
- **Node types**: Task, Conditional, Entry, Exit
- **Edge types**: Default, Pass, Fail
- **Real AI execution** — each node calls the AI API
- Loop support with max iteration guards
- Play/Stop/Zoom/Fullscreen controls

### Memory Map (Knowledge Graph)

- **Interactive force-directed graph** of user knowledge
- **Node categories**: User, Technical, Personal, Project, Career
- **Semantic edges** computed via Gemini embedding API + cosine similarity
- Add, delete, filter, search, and drag nodes
- Conversation snippet linking

### Widget Builder

- Dedicated chat for generating interactive widgets
- AI generates: calculators, charts, forms, timers, kanban boards, etc.
- Live preview of generated widgets

### Sidebar & Organization

- **Collapsible sidebar** with search
- **Folder hierarchy** with nested support
- **Pin conversations** for quick access
- **Context menus** for rename, delete, move operations

### Settings

- **Appearance**: Light/Dark/System theme, font size slider (10-35px with live preview popup), message density, avatar display (both/user/ai/none), animations
- **Chat preferences**: Send key, streaming, timestamps, markdown
- **Profile**: Display name, role, bio, custom instructions
- **Membership**: Classic / Pro / Ultra tiers
- **Models & API**: Per-provider API key management with server-side encrypted storage (AES-256-GCM), custom model registration with provider dropdown selector
- **Privacy**: Export/import settings, clear history, analytics opt-in
- **i18n**: English and Traditional Chinese (zh-TW)

### Mobile Responsive

- **Sidebar**: slide-in drawer with backdrop on mobile (<768px)
- **FeatureNav**: compact horizontal scroll
- **Artifacts**: full-screen overlay on mobile
- **Settings dialog**: horizontal icon tabs on mobile
- **Header**: hamburger menu, hide non-essential buttons

### Notepad

- Slide-in scratchpad with multi-note tabs
- Text, image (drag-drop), and conversation snippet entries
- AI-powered note summarization
- Download notes as Markdown

### Notifications

- In-app notification center with info/success/warning types
- Mark all read, per-notification dismiss
- Persistent across sessions

### Authentication

- **Supabase Auth** — email/password registration + Google OAuth
- **Login/Register tabs** — email + password (not username)
- **Disposable email blocking** — 40+ temp mail domains rejected at registration
- **Email verification** — Supabase email confirmation required
- **Admin panel** (`/admin`) — membership tier management
- **Admin bypass** — admin account bypasses all conversation/folder locks

### Chat/Folder Lock System

- **Password-protected conversations and folders** — SHA-256 hashed password protection
- **Lock icon** appears on hover (left of three-dots menu), always visible when locked
- **Locked chats** show "🔒 Locked" instead of title, content hidden until unlocked
- **Locked folders** hide all children (sub-folders + conversations), cannot expand
- **Delete protection** — locked items cannot be deleted until unlocked
- **Drag-to-locked-folder confirmation** — warns the conversation will be locked, with "don't ask again" checkbox (per folder, per session)
- **Session-based unlock** — unlocked items re-lock on page refresh
- **Context menu** — Lock / Remove Lock options
- **Cloud sync** — lock hash syncs to Supabase (password itself never stored)
- **Admin bypass** — admin skips all lock checks, sees all content

### Background AI Response

- AI responses continue generating when user switches to Branch/DAG/other tabs
- Global `pendingResponses` Map survives component unmounts
- On re-mount, completed responses are automatically picked up
- Only the manual "Stop" button aborts the API call

### Unified Branding

- `/logos/app-logo.png` — App icon (favicon, AI chat avatar, login page, memory map center)
- `/logos/ai-workbench.png` — Brand wordmark (sidebar header, with CSS mask soft edge)
- All branding from one folder — replace files to customize
- AI chat bubble shows app logo instead of generic sparkle icon
- User chat bubble shows Google profile photo

### Storage & Sync

- **Offline-first**: IndexedDB per-user database — works without internet
- **Cloud sync**: Every write queued → debounced (500ms) → drained every 3-5s to Supabase
- **Immediate sync**: Settings changes trigger instant `triggerSync()` push
- **Server-side API key vault**: API keys encrypted with AES-256-GCM and stored in a dedicated `user_api_keys` table — never included in settings sync or sent to the client
- **Cross-device**: Login on another device → `initialPull()` restores all data, clears stale sync queue; API keys available immediately via server-side storage
- **Realtime**: Supabase Realtime subscription for live cross-device updates
- **Conflict resolution**: Per-namespace strategy (field-merge, union-merge, last-write-wins)
- **Drain mutex**: `isDraining` flag prevents concurrent drain race conditions
- **Deduplication**: Per-namespace dedup before pushing to Supabase
- **Delete propagation**: `removeUserData` and `clearAllUserData` delete from Supabase too
- **CHANNEL_ERROR recovery**: Auto-retry Realtime subscription after 3s
- **Migration**: Automatic localStorage → IndexedDB migration on first load

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, TypeScript 5.6 (strict), Vite 7 |
| **Styling** | Tailwind CSS v4 (oklch variables), shadcn/ui (53+ Radix components), Framer Motion |
| **Routing** | wouter (lightweight, patched for route introspection) |
| **State** | React Context (no Redux/Zustand) |
| **Storage** | IndexedDB (idb) + localStorage + Supabase PostgreSQL |
| **Auth** | Supabase Auth (email, Google OAuth) |
| **Backend** | Express 4 (stateless file server + API proxy) |
| **Serverless** | Vercel Functions (search, fetch-url, AI chat proxy) |
| **Build** | Vite (client), esbuild (server) |
| **Package Manager** | pnpm v10.4.1 |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (SPA)                        │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │ Sidebar  │  │ Chat / DAG / │  │  Artifacts Panel   │    │
│  │ (folders │  │ Branch / Pin │  │  (code + preview)  │    │
│  │  + hist) │  │ / Search /   │  │                    │    │
│  │          │  │ Widgets      │  │                    │    │
│  └──────────┘  └──────────────┘  └────────────────────┘    │
│       │               │                    │               │
│       └───────── React Context ────────────┘               │
│                  (Settings + Auth)                          │
│                       │                                    │
│           ┌───────────┴───────────┐                        │
│           │    Storage Layer      │                        │
│           │  IndexedDB ←→ Sync   │                        │
│           └───────────┬───────────┘                        │
└───────────────────────┼─────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
┌──────────────┐ ┌─────────────┐ ┌─────────────────┐
│  Express /   │ │  Supabase   │ │  AI Providers   │
│  Vercel API  │ │ (Auth + DB  │ │ (OpenAI, Claude │
│  (proxy,     │ │  + Realtime │ │  Gemini, etc.)  │
│  keys inject-│ │  + API Key  │ │                 │
│  ed server-  │ │    Vault)   │ │                 │
│  side)       │ │             │ │                 │
└──────────────┘ └─────────────┘ └─────────────────┘
```

### Three-Layer Monorepo

- **`client/`** — React 19 SPA. Entry: `main.tsx` → `App.tsx` → pages.
- **`server/`** — Express server (`server/index.ts`). Static files + API proxy.
- **`shared/`** — Constants shared between client and server.
- **`api/`** — Vercel Serverless Functions (mirrors server API endpoints).

### Routes

| Path | Page | Description |
|------|------|-------------|
| `/` | WorkbenchPage | Main 3-column layout |
| `/memory` | MemoryMapPage | Knowledge graph visualization |
| `/admin` | AdminPage | Membership management (admin only) |

---

## Getting Started

### Prerequisites

- Node.js v18+
- pnpm v10+ (or npm v9+)
- Git

### Install & Run

```bash
# Clone
git clone <your-repo-url>
cd Personal-Optimized-AI-Webpage

# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env
# Edit .env with your values (see Environment Variables below)

# Start dev server
pnpm dev
# Open http://localhost:3000
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Vite dev server with HMR (port 3000) |
| `pnpm build` | Build client (`dist/public/`) + server (`dist/index.js`) |
| `pnpm build:vercel` | Client-only build for Vercel |
| `pnpm start` | Run production build (`NODE_ENV=production`) |
| `pnpm check` | TypeScript type check (`tsc --noEmit`) |
| `pnpm format` | Prettier formatting |

### Demo Mode (No Supabase)

If you don't configure Supabase, the app falls back to local-only mode:
- Login with email: `demo`, password: `demo` (no hint shown on login page)
- All data stored in browser (IndexedDB + localStorage)
- Registration and Google OAuth are disabled

---

## Environment Variables

```bash
# ─── Required for cloud sync + auth ─────────────────────────
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...

# ─── Server-side API key encryption (required) ──────────────
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...      # From Supabase → Settings → API
API_KEY_ENCRYPTION_SECRET=...         # Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# ─── Admin ───────────────────────────────────────────────────
VITE_ADMIN_EMAIL=admin@example.com    # Gets /admin access

# ─── Optional ────────────────────────────────────────────────
VITE_GOOGLE_CLIENT_ID=                # Only for legacy (non-Supabase) Google OAuth
VITE_OAUTH_PORTAL_URL=                # External OAuth portal
VITE_APP_ID=                          # External OAuth app ID
VITE_ANALYTICS_ENDPOINT=              # Umami analytics endpoint
VITE_ANALYTICS_WEBSITE_ID=            # Umami website ID
PORT=3000                             # Server port
```

> If using Supabase for Google OAuth (recommended), configure Google provider in Supabase Dashboard → Authentication → Providers → Google. No `VITE_GOOGLE_CLIENT_ID` needed.

---

## Deployment

### Vercel (Recommended)

1. Push code to GitHub
2. Connect repo at [vercel.com](https://vercel.com) → **Add New** → **Project**
3. Vercel auto-detects Vite. Confirm:
   - **Build Command**: `vite build` (set in `vercel.json`)
   - **Output Directory**: `dist/public` (set in `vercel.json`)
4. Add environment variables in **Settings** → **Environment Variables**
5. Deploy

### Supabase Setup

1. Create project at [supabase.com](https://supabase.com)
2. Run migrations in **SQL Editor**:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_membership_tier.sql`
   - `supabase/migrations/003_user_api_keys.sql`
3. Enable Google OAuth in **Authentication** → **Providers** → **Google**
4. Enable Realtime for `user_data` table in **Database** → **Replication**
5. Copy **Project URL** and **anon key** from **Project Settings** → **API**

> For the full step-by-step deployment guide (including Google Cloud OAuth setup), see [DEPLOYMENT.md](DEPLOYMENT.md).

---

## Supported AI Providers

| Provider | Models | Auth Header |
|----------|--------|-------------|
| **OpenAI** | GPT-4o, GPT-4o Mini, GPT-4 Turbo, o1, o3 Mini | `Authorization: Bearer` |
| **Anthropic** | Claude Opus 4.6, Sonnet 4.6, Haiku 4.5 | `x-api-key` |
| **Google** | Gemini 3.1 Flash Lite, 3 Flash, 2.5 Pro, 2.5 Flash, 2.0 Flash | `x-goog-api-key` |
| **DeepSeek** | DeepSeek R1, DeepSeek V3 | `Authorization: Bearer` |
| **Meta (via Groq)** | Llama 4 Maverick, 4 Scout, 3.3 70B | `Authorization: Bearer` |
| **Mistral AI** | Mistral Large, Medium, Small | `Authorization: Bearer` |
| **xAI** | Grok family | `Authorization: Bearer` |
| **OpenRouter** | Any model via aggregation | `Authorization: Bearer` |

All API keys are stored **server-side only** — encrypted with AES-256-GCM in Supabase. The client never sees or stores raw key values.

---

## Security

| Protection | Implementation |
|-----------|----------------|
| **SSRF** | Private IP range blocking (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x, .local, .internal) |
| **XSS** | Content Security Policy, input sanitization |
| **Clickjacking** | `X-Frame-Options: DENY` |
| **HTTPS** | HSTS with `max-age=31536000; includeSubDomains` |
| **API proxy** | Whitelist-only AI endpoints, dangerous header stripping |
| **Rate limiting** | Per-IP limits on all API routes |
| **Data isolation** | Supabase RLS on all tables, per-user IndexedDB databases |
| **API key storage** | Server-side AES-256-GCM encryption in Supabase — keys never reach the client |
| **Disposable emails** | 40+ temp mail domains blocked at registration |
| **Chat/folder locks** | SHA-256 hashed password, session-based unlock, admin bypass |

---

## Rate Limits & Quotas

### Server-Side (per IP, per minute)

| Endpoint | Limit | Purpose |
|----------|-------|---------|
| `/api/search` | 30 req | Web search proxy |
| `/api/fetch-url` | 20 req | URL content extraction |
| `/api/ai/chat` | 60 req | AI API proxy |

### Database (per user, enforced by SQL triggers)

| Resource | Limit |
|----------|-------|
| Messages | 100,000 per user |
| Conversations | 5,000 per user |

### Membership Tiers

| Tier | Description |
|------|-------------|
| **Classic** | Default for all new users |
| **Pro** | Upgraded by admin via `/admin` |
| **Ultra** | Upgraded by admin via `/admin` |

---

## Project Structure

```
├── api/                          # Vercel Serverless Functions
│   ├── _lib/
│   │   ├── security.ts           #   Shared security utilities
│   │   ├── auth.ts               #   Server-side Supabase JWT validation
│   │   └── encryption.ts         #   AES-256-GCM API key encryption
│   ├── ai/chat.ts                #   AI API proxy (server-side key injection)
│   ├── audio/speech.ts           #   TTS proxy (Groq)
│   ├── audio/transcribe.ts       #   STT proxy (Groq Whisper)
│   ├── keys/save.ts              #   Save encrypted API key
│   ├── keys/delete.ts            #   Delete API key
│   ├── keys/status.ts            #   List saved key providers
│   ├── fetch-url.ts              #   URL content extraction
│   └── search.ts                 #   Web search proxy
├── client/
│   ├── public/logos/              # Provider SVG logos + app-logo.png + ai-workbench.png
│   └── src/
│       ├── components/
│       │   ├── ui/               # shadcn/ui components (53+)
│       │   ├── AppLogo.tsx        # Reusable app logo component
│       │   ├── ArtifactsPanel.tsx # Code viewer + live preview
│       │   ├── ChatInterface.tsx  # Main chat with streaming
│       │   ├── ComputeToggle.tsx  # Local/Cloud compute toggle
│       │   ├── ContextPinning.tsx # 3-scope context management
│       │   ├── ConversationBranch.tsx # Branch & merge
│       │   ├── FeatureNav.tsx     # Feature tab navigation
│       │   ├── ModelSwitcher.tsx  # Provider & model selection
│       │   ├── Notepad.tsx        # Scratchpad with AI summary
│       │   ├── NotificationPanel.tsx # Notification center
│       │   ├── SemanticSearch.tsx  # Full-text fuzzy search
│       │   ├── SettingsDialog.tsx  # Settings modal (8 tabs)
│       │   ├── Sidebar.tsx        # Chat history + folders
│       │   ├── TaskDAG.tsx        # Visual task graph editor
│       │   └── WidgetsShowcase.tsx # AI widget builder
│       ├── contexts/
│       │   ├── AuthContext.tsx     # Supabase auth + demo fallback
│       │   └── SettingsContext.tsx # App settings + persistence
│       ├── lib/
│       │   ├── storage/           # IndexedDB + Supabase sync engine
│       │   ├── aiClient.ts        # Multi-provider AI abstraction
│       │   ├── branchLineage.ts   # Branch tree operations
│       │   ├── conversationMemory.ts # Auto memory extraction
│       │   └── semanticEmbedding.ts  # Gemini embeddings
│       ├── pages/
│       │   ├── AdminPage.tsx      # Membership management
│       │   ├── LoginPage.tsx      # Auth (login + register)
│       │   ├── MemoryMapPage.tsx  # Knowledge graph
│       │   └── WorkbenchPage.tsx  # Main 3-column layout
│       ├── i18n.ts                # 500+ translation keys (en, zh-TW)
│       └── App.tsx                # Router + providers
├── server/
│   └── index.ts                   # Express server
├── shared/
│   └── const.ts                   # Shared constants
├── supabase/migrations/           # Database schema
├── .env.example                   # Environment template
├── CLAUDE.md                      # Developer instructions
├── DEPLOYMENT.md                  # Full deployment guide
├── vercel.json                    # Vercel configuration
└── vite.config.ts                 # Vite + dev proxies
```

---

## License

MIT

---

---

<!-- ============================================================================ -->
<!-- 繁體中文版本 -->
<!-- ============================================================================ -->

<a id="繁體中文"></a>

<div align="center">

<img src="docs/media/logo-banner.png" alt="AI Workbench" width="160" />

<br/>

[English](#english) | **繁體中文**

<br/>

<a href="https://ai-workbench-pro.vercel.app/">
  <img src="https://img.shields.io/badge/%F0%9F%9A%80%20%E7%B7%9A%E4%B8%8A%E5%B1%95%E7%A4%BA-ai--workbench--pro.vercel.app-7c3aed?style=for-the-badge&labelColor=1e1b4b" alt="線上展示" />
</a>

<br/><br/>

</div>

## 目錄

- [概覽](#概覽)
- [功能特色](#功能特色)
- [技術架構](#技術架構)
- [快速開始](#快速開始)
- [環境變數](#環境變數)
- [部署方式](#部署方式)
- [支援的 AI 模型](#支援的-ai-模型)
- [安全性](#安全性)
- [速率限制與配額](#速率限制與配額)
- [專案結構](#專案結構)
- [授權條款](#授權條款)

---

## 概覽

AI Workbench 是一個全端 TypeScript/React 應用程式，提供統一介面與多家 AI 供應商對話。採用 **「Void Glass」** 暗色玻璃擬態設計風格，支援離線優先的本地儲存與雲端同步、對話分支、視覺化任務圖編輯器，以及知識圖譜記憶系統。

架構為**前端主導**——Express 伺服器僅為無狀態的靜態檔案伺服器與 API 代理，所有應用邏輯皆在 React 中運行。

---

## 功能特色

### 核心對話

- **多模型串流對話** — 在同一介面中使用 OpenAI、Anthropic、Google、DeepSeek、Meta、Mistral、xAI、OpenRouter
- **Markdown 渲染** 含語法高亮程式碼區塊
- **檔案上傳** — 圖片、PDF、程式碼檔案，含行內預覽
- **URL 內容擷取** — 貼上網址，AI 即可閱讀其內容
- **網路搜尋整合** — 透過伺服器代理 DuckDuckGo + Wikipedia
- **對話獨立設定** — 溫度、最大 Token 數、系統提示詞
- **自動命名** — AI 根據第一則訊息產生對話標題
- **訊息操作** — 重新生成、複製、有用/無用回饋
- **引用來源** 含 URL 參考
- **伺服器端 API 代理** — 所有供應商經由 `/api/ai/chat` 代理，伺服器端注入 API key；原始金鑰永不傳至瀏覽器
- **語音與手勢模式** — 免手操控 AI 互動，含 TTS 自動朗讀（無 Groq key 時回退至瀏覽器 SpeechSynthesis）

### Artifacts 面板

- **程式碼編輯器** 含語法高亮（自建輕量分詞器）
- **即時預覽** 在沙盒 iframe 中執行
- AI 產生程式碼時自動填入
- 支援 React (TSX)、HTML、CSS、Python、JavaScript 等
- **Markdown 自動偵測** — 未標記 `markdown`/`md` 語言的內容，透過正則評分（標題、列表、連結、粗體）自動偵測並以 Streamdown 渲染
- 複製、下載、全螢幕操作

### 對話分支

- **從任何 AI 回覆建立分支**
- **切換分支** — 每個分支只看到自身的祖先訊息
- **合併分支**
- 各分支可獨立調整溫度
- 8 種顏色標記

### 上下文釘選

- **三種範圍**：全域、專案、對話
- **五種釘選類型**：文字、JSON、程式碼、角色設定、變數
- 啟用/停用開關、優先排序、內容摘要壓縮

### 任務 DAG（邏輯圖編輯器）

- **視覺化節點編輯器**，用於 AI 任務工作流程
- **節點類型**：任務、條件判斷、入口、出口
- **邊線類型**：預設、通過、失敗
- **真實 AI 執行** — 每個節點呼叫 AI API
- 迴圈支援，含最大迭代次數限制
- 播放/停止/縮放/全螢幕控制

### 記憶圖譜（知識圖譜）

- **互動式力導向圖**，呈現使用者知識
- **節點分類**：使用者、技術、個人、專案、職涯
- **語義邊線** 透過 Gemini Embedding API + 餘弦相似度計算
- 新增、刪除、篩選、搜尋、拖曳節點
- 對話片段連結

### Widget 生成器

- 專屬對話介面，用於生成互動式元件
- AI 可生成：計算機、圖表、表單、計時器、看板等
- 生成的 Widget 即時預覽

### 側邊欄與組織管理

- **可收合側邊欄** 含搜尋功能
- **資料夾階層** 支援巢狀結構
- **釘選對話** 方便快速存取
- **右鍵選單** 支援重新命名、刪除、移動操作

### 設定

- **外觀**：亮色/暗色/跟隨系統主題、字體大小滑桿（10-35px 含即時預覽彈窗）、訊息密度、頭像顯示（雙方/使用者/AI/隱藏）、動畫
- **對話偏好**：傳送按鍵、串流顯示、時間戳記、Markdown
- **個人資料**：顯示名稱、角色、簡介、自訂指令
- **會員等級**：Classic / Pro / Ultra
- **模型與 API**：各供應商 API key 管理（伺服器端 AES-256-GCM 加密儲存）、自訂模型註冊（供應商下拉選擇器）
- **隱私**：匯出/匯入設定、清除歷史、分析追蹤開關
- **國際化**：英文與繁體中文 (zh-TW)

### 行動裝置響應式設計

- **側邊欄**：行動裝置（<768px）滑入式抽屜含背景遮罩
- **功能導航**：緊湊水平捲動
- **Artifacts**：行動裝置全螢幕覆蓋
- **設定對話框**：行動裝置水平圖示分頁
- **標題列**：漢堡選單，隱藏非必要按鈕

### 記事本

- 滑入式便條簿，支援多分頁
- 文字、圖片（拖放上傳）、對話片段
- AI 驅動的筆記摘要
- 下載為 Markdown

### 通知

- 應用內通知中心，支援 info/success/warning 類型
- 全部已讀、逐條關閉
- 跨工作階段保留

### 認證

- **Supabase Auth** — 信箱密碼註冊 + Google OAuth
- **登入/註冊分頁** — 以信箱 + 密碼（非用戶名）註冊
- **拋棄式信箱封鎖** — 註冊時封鎖 40+ 暫時信箱域名
- **信箱驗證** — 需 Supabase 信箱確認
- **管理員面板** (`/admin`) — 會員等級管理
- **管理員略過** — 管理員帳號可略過所有對話/資料夾鎖定

### 對話/資料夾鎖定系統

- **密碼保護對話與資料夾** — SHA-256 雜湊密碼保護
- **鎖定圖示** 滑鼠懸停時出現（三點選單左側），鎖定時常駐顯示
- **鎖定對話** 顯示「🔒 已鎖定」取代標題，內容隱藏直到解鎖
- **鎖定資料夾** 隱藏所有子項目（子資料夾 + 對話），無法展開
- **刪除保護** — 鎖定項目無法刪除，需先解鎖
- **拖曳至鎖定資料夾確認** — 提示對話將被鎖定，附「本次登入不再對此資料夾提示」checkbox
- **工作階段解鎖** — 解鎖後重新整理頁面即重新鎖定
- **右鍵選單** — 鎖定 / 移除鎖定選項
- **雲端同步** — 鎖定雜湊同步至 Supabase（密碼本身不儲存）
- **管理員略過** — 管理員略過所有鎖定檢查，可見所有內容

### 背景 AI 回應

- 使用者切換到分支/DAG/其他分頁時，AI 回應持續產生
- 全域 `pendingResponses` Map 在元件卸載後仍然保留
- 重新掛載時，已完成的回應自動被接收
- 僅手動「停止」按鈕可中止 API 呼叫

### 統一品牌系統

- `/logos/app-logo.png` — 應用圖示（favicon、AI 對話頭像、登入頁、記憶圖譜中心）
- `/logos/ai-workbench.png` — 品牌文字標誌（側邊欄標題，含 CSS mask 柔邊效果）
- 所有品牌素材集中一個資料夾 — 替換檔案即可自訂
- AI 對話氣泡顯示應用 logo 而非通用星光圖示
- 使用者對話氣泡顯示 Google 個人照片

### 儲存與同步

- **離線優先**：每個使用者獨立 IndexedDB 資料庫 — 無網路也能使用
- **雲端同步**：每次寫入加入佇列 → 防抖（500ms）→ 每 3-5 秒排出推送至 Supabase
- **即時同步**：設定變更立即觸發 `triggerSync()` 推送
- **伺服器端 API key 保險庫**：API key 以 AES-256-GCM 加密，存於獨立 `user_api_keys` 資料表 — 永不包含於設定同步或傳至客戶端
- **跨裝置**：在新裝置登入 → `initialPull()` 自動還原所有資料，清除過期同步佇列；API key 透過伺服器端儲存即時可用
- **即時更新**：Supabase Realtime 訂閱，跨裝置即時同步
- **衝突解決**：依命名空間策略（field-merge、union-merge、last-write-wins）
- **排出互斥鎖**：`isDraining` 旗標防止並行排出競態條件
- **去重**：推送前依命名空間去重
- **刪除傳播**：`removeUserData` 和 `clearAllUserData` 同步刪除 Supabase 資料
- **CHANNEL_ERROR 回復**：3 秒後自動重試 Realtime 訂閱
- **自動遷移**：首次載入時 localStorage → IndexedDB 遷移

---

## 技術架構

| 層級 | 技術 |
|------|------|
| **前端** | React 19、TypeScript 5.6（嚴格模式）、Vite 7 |
| **樣式** | Tailwind CSS v4（oklch 色彩變數）、shadcn/ui（53+ Radix 元件）、Framer Motion |
| **路由** | wouter（輕量級，已 patch 支援路由內省） |
| **狀態管理** | React Context（無 Redux/Zustand） |
| **儲存** | IndexedDB (idb) + localStorage + Supabase PostgreSQL |
| **認證** | Supabase Auth（信箱、Google OAuth） |
| **後端** | Express 4（無狀態檔案伺服器 + API 代理） |
| **無伺服器** | Vercel Functions（搜尋、URL 擷取、AI 聊天代理） |
| **建構** | Vite（前端）、esbuild（後端） |
| **套件管理** | pnpm v10.4.1 |

### 三層 Monorepo 架構

```
┌─────────────────────────────────────────────────────────────┐
│                      瀏覽器（SPA）                            │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │  側邊欄   │  │ 對話 / DAG / │  │  Artifacts 面板    │    │
│  │ (資料夾 + │  │ 分支 / 釘選  │  │ (程式碼 + 預覽)    │    │
│  │  歷史記錄) │  │ / 搜尋 /    │  │                    │    │
│  │          │  │ Widgets      │  │                    │    │
│  └──────────┘  └──────────────┘  └────────────────────┘    │
│       │               │                    │               │
│       └───────── React Context ────────────┘               │
│                (Settings + Auth)                            │
│                       │                                    │
│           ┌───────────┴───────────┐                        │
│           │      儲存層           │                         │
│           │  IndexedDB ←→ 同步    │                        │
│           └───────────┬───────────┘                        │
└───────────────────────┼─────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
┌──────────────┐ ┌─────────────┐ ┌─────────────────┐
│  Express /   │ │  Supabase   │ │   AI 供應商      │
│  Vercel API  │ │ (認證 + 資料 │ │ (OpenAI, Claude │
│  (代理，      │ │  庫 + 即時 + │ │  Gemini 等)     │
│  伺服器端    │ │  API Key    │ │                 │
│  注入金鑰)   │ │  保險庫)    │ │                 │
└──────────────┘ └─────────────┘ └─────────────────┘
```

- **`client/`** — React 19 SPA。入口：`main.tsx` → `App.tsx` → 頁面元件。
- **`server/`** — Express 伺服器 (`server/index.ts`)。靜態檔案 + API 代理。
- **`shared/`** — 前後端共用常數。
- **`api/`** — Vercel Serverless Functions（與 server API 端點對應）。

### 路由

| 路徑 | 頁面 | 說明 |
|------|------|------|
| `/` | WorkbenchPage | 主要三欄佈局 |
| `/memory` | MemoryMapPage | 知識圖譜視覺化 |
| `/admin` | AdminPage | 會員管理（僅管理員） |

---

## 快速開始

### 系統需求

- Node.js v18+
- pnpm v10+（或 npm v9+）
- Git

### 安裝與執行

```bash
# 複製專案
git clone <your-repo-url>
cd Personal-Optimized-AI-Webpage

# 安裝依賴
pnpm install

# 複製環境變數範本
cp .env.example .env
# 編輯 .env 填入你的設定值（詳見下方「環境變數」）

# 啟動開發伺服器
pnpm dev
# 開啟 http://localhost:3000
```

### 可用指令

| 指令 | 說明 |
|------|------|
| `pnpm dev` | Vite 開發伺服器，含 HMR（port 3000） |
| `pnpm build` | 建構前端（`dist/public/`）+ 後端（`dist/index.js`） |
| `pnpm build:vercel` | 僅建構前端（Vercel 用） |
| `pnpm start` | 啟動生產版本（`NODE_ENV=production`） |
| `pnpm check` | TypeScript 型別檢查（`tsc --noEmit`） |
| `pnpm format` | Prettier 格式化 |

### Demo 模式（無需 Supabase）

未設定 Supabase 時，系統自動切換為純本地模式：
- 以信箱 `demo`、密碼 `demo` 登入（登入頁面不顯示提示）
- 所有資料僅存於瀏覽器（IndexedDB + localStorage）
- 註冊功能與 Google OAuth 不可用

---

## 環境變數

```bash
# ─── 雲端同步 + 認證（必要） ──────────────────────────────
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...

# ─── 伺服器端 API key 加密（必要） ────────────────────────
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...      # 從 Supabase → Settings → API 取得
API_KEY_ENCRYPTION_SECRET=...         # 產生方式：node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# ─── 管理員 ──────────────────────────────────────────────
VITE_ADMIN_EMAIL=admin@example.com    # 取得 /admin 頁面權限

# ─── 選填 ────────────────────────────────────────────────
VITE_GOOGLE_CLIENT_ID=                # 僅 Legacy（非 Supabase）Google OAuth 模式需要
VITE_OAUTH_PORTAL_URL=                # 外部 OAuth 入口
VITE_APP_ID=                          # 外部 OAuth 應用 ID
VITE_ANALYTICS_ENDPOINT=              # Umami 分析端點
VITE_ANALYTICS_WEBSITE_ID=            # Umami 網站 ID
PORT=3000                             # 伺服器 port
```

> 若使用 Supabase 的 Google OAuth（推薦），只需在 Supabase Dashboard → Authentication → Providers → Google 設定即可，不需要 `VITE_GOOGLE_CLIENT_ID`。

---

## 部署方式

### Vercel（推薦）

1. 推送程式碼至 GitHub
2. 前往 [vercel.com](https://vercel.com) → **Add New** → **Project**，連結 repo
3. Vercel 會自動偵測 Vite 框架，確認設定：
   - **Build Command**：`vite build`（已設定於 `vercel.json`）
   - **Output Directory**：`dist/public`（已設定於 `vercel.json`）
4. 在 **Settings** → **Environment Variables** 加入環境變數
5. 部署

### Supabase 設定

1. 在 [supabase.com](https://supabase.com) 建立專案
2. 在 **SQL Editor** 執行 migration：
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_membership_tier.sql`
   - `supabase/migrations/003_user_api_keys.sql`
3. 在 **Authentication** → **Providers** → **Google** 啟用 Google OAuth
4. 在 **Database** → **Replication** 啟用 `user_data` 資料表的 Realtime
5. 從 **Project Settings** → **API** 複製 **Project URL** 和 **anon key**

> 完整部署教學（含 Google Cloud OAuth 設定），請參考 [DEPLOYMENT.md](DEPLOYMENT.md)。

---

## 支援的 AI 模型

| 供應商 | 模型 | 認證方式 |
|--------|------|----------|
| **OpenAI** | GPT-4o、GPT-4o Mini、GPT-4 Turbo、o1、o3 Mini | `Authorization: Bearer` |
| **Anthropic** | Claude Opus 4.6、Sonnet 4.6、Haiku 4.5 | `x-api-key` |
| **Google** | Gemini 3.1 Flash Lite、3 Flash、2.5 Pro、2.5 Flash、2.0 Flash | `x-goog-api-key` |
| **DeepSeek** | DeepSeek R1、DeepSeek V3 | `Authorization: Bearer` |
| **Meta（via Groq）** | Llama 4 Maverick、4 Scout、3.3 70B | `Authorization: Bearer` |
| **Mistral AI** | Mistral Large、Medium、Small | `Authorization: Bearer` |
| **xAI** | Grok 系列 | `Authorization: Bearer` |
| **OpenRouter** | 透過聚合存取任何模型 | `Authorization: Bearer` |

所有 API key 僅存於**伺服器端** — 以 AES-256-GCM 加密存儲於 Supabase，客戶端永遠不接觸原始金鑰。

---

## 安全性

| 防護機制 | 實作方式 |
|----------|----------|
| **SSRF 防護** | 封鎖私有 IP 範圍（10.x、172.16-31.x、192.168.x、127.x、169.254.x、.local、.internal） |
| **XSS 防護** | Content Security Policy、輸入消毒 |
| **Clickjacking 防護** | `X-Frame-Options: DENY` |
| **HTTPS 強制** | HSTS `max-age=31536000; includeSubDomains` |
| **API 代理** | 僅白名單 AI 端點、移除危險 header |
| **速率限制** | 所有 API 路由的 per-IP 限制 |
| **資料隔離** | Supabase RLS 保護所有資料表、per-user IndexedDB 資料庫 |
| **API key 儲存** | 伺服器端 AES-256-GCM 加密存於 Supabase — 金鑰永不傳至客戶端 |
| **拋棄式信箱** | 註冊時封鎖 40+ 暫時信箱域名 |
| **對話/資料夾鎖定** | SHA-256 雜湊密碼、工作階段解鎖、管理員略過 |

---

## 速率限制與配額

### 伺服器端（每 IP、每分鐘）

| 端點 | 限制 | 用途 |
|------|------|------|
| `/api/search` | 30 次 | 網路搜尋代理 |
| `/api/fetch-url` | 20 次 | URL 內容擷取 |
| `/api/ai/chat` | 60 次 | AI API 代理 |

### 資料庫（每用戶，由 SQL trigger 強制）

| 資源 | 限制 |
|------|------|
| 訊息 | 每用戶 100,000 則 |
| 對話 | 每用戶 5,000 個 |

### 會員等級

| 等級 | 說明 |
|------|------|
| **Classic** | 所有新用戶的預設等級 |
| **Pro** | 由管理員透過 `/admin` 升級 |
| **Ultra** | 由管理員透過 `/admin` 升級 |

---

## 專案結構

```
├── api/                          # Vercel Serverless Functions
│   ├── _lib/
│   │   ├── security.ts           #   共用安全工具
│   │   ├── auth.ts               #   伺服器端 Supabase JWT 驗證
│   │   └── encryption.ts         #   AES-256-GCM API key 加解密
│   ├── ai/chat.ts                #   AI API 代理（伺服器端金鑰注入）
│   ├── audio/speech.ts           #   TTS 代理（Groq）
│   ├── audio/transcribe.ts       #   STT 代理（Groq Whisper）
│   ├── keys/save.ts              #   儲存加密 API key
│   ├── keys/delete.ts            #   刪除 API key
│   ├── keys/status.ts            #   列出已儲存的 key 供應商
│   ├── fetch-url.ts              #   URL 內容擷取
│   └── search.ts                 #   網路搜尋代理
├── client/
│   ├── public/logos/              # 供應商 SVG logo + app-logo.png + ai-workbench.png
│   └── src/
│       ├── components/
│       │   ├── ui/               # shadcn/ui 元件（53+）
│       │   ├── AppLogo.tsx        # 可重用應用 logo 元件
│       │   ├── ArtifactsPanel.tsx # 程式碼檢視器 + 即時預覽
│       │   ├── ChatInterface.tsx  # 主要對話介面（含串流）
│       │   ├── ComputeToggle.tsx  # 本地/雲端運算切換
│       │   ├── ContextPinning.tsx # 三範圍上下文管理
│       │   ├── ConversationBranch.tsx # 分支與合併
│       │   ├── FeatureNav.tsx     # 功能標籤導航
│       │   ├── ModelSwitcher.tsx  # 供應商與模型選擇
│       │   ├── Notepad.tsx        # 便條簿（含 AI 摘要）
│       │   ├── NotificationPanel.tsx # 通知中心
│       │   ├── SemanticSearch.tsx  # 全文模糊搜尋
│       │   ├── SettingsDialog.tsx  # 設定對話框（8 個分頁）
│       │   ├── Sidebar.tsx        # 對話歷史 + 資料夾
│       │   ├── TaskDAG.tsx        # 視覺化任務圖編輯器
│       │   └── WidgetsShowcase.tsx # AI Widget 生成器
│       ├── contexts/
│       │   ├── AuthContext.tsx     # Supabase 認證 + demo 備援
│       │   └── SettingsContext.tsx # 應用設定 + 持久化
│       ├── lib/
│       │   ├── storage/           # IndexedDB + Supabase 同步引擎
│       │   ├── aiClient.ts        # 多供應商 AI 抽象層
│       │   ├── branchLineage.ts   # 分支樹操作
│       │   ├── conversationMemory.ts # 自動記憶擷取
│       │   └── semanticEmbedding.ts  # Gemini Embedding
│       ├── pages/
│       │   ├── AdminPage.tsx      # 會員管理
│       │   ├── LoginPage.tsx      # 認證（登入 + 註冊）
│       │   ├── MemoryMapPage.tsx  # 知識圖譜
│       │   └── WorkbenchPage.tsx  # 主要三欄佈局
│       ├── i18n.ts                # 500+ 翻譯鍵值（en、zh-TW）
│       └── App.tsx                # 路由 + Provider
├── server/
│   └── index.ts                   # Express 伺服器
├── shared/
│   └── const.ts                   # 共用常數
├── supabase/migrations/           # 資料庫 schema
├── .env.example                   # 環境變數範本
├── CLAUDE.md                      # 開發者指引
├── DEPLOYMENT.md                  # 完整部署教學
├── vercel.json                    # Vercel 設定
└── vite.config.ts                 # Vite + 開發代理
```

---

## 授權條款

MIT


