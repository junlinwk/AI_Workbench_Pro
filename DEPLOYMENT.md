# AI Workbench — 完整部署教學

## 目錄

1. [前置需求](#1-前置需求)
2. [Supabase 設定](#2-supabase-設定)
3. [Google OAuth 設定](#3-google-oauth-設定)
4. [環境變數設定](#4-環境變數設定)
5. [Vercel 部署](#5-vercel-部署)
6. [本地開發](#6-本地開發)
7. [速率限制與用戶限制](#7-速率限制與用戶限制)
8. [疑難排解](#8-疑難排解)

---

## 1. 前置需求

| 工具 | 版本 | 用途 |
|------|------|------|
| Node.js | v18+ | 執行環境 |
| pnpm 或 npm | pnpm v10+ 或 npm v9+ | 套件管理 |
| Git | 任意 | 版本控制 |
| GitHub 帳號 | — | Vercel 部署來源 |
| Supabase 帳號 | 免費方案即可 | 雲端資料庫 + 認證 |
| Google Cloud 帳號 | — | OAuth 登入 |

### 安裝依賴

```bash
# 使用 pnpm（推薦）
pnpm install

# 或使用 npm（如果 pnpm 不可用）
npm install --legacy-peer-deps
```

> `--legacy-peer-deps` 是因為 `@builder.io/vite-plugin-jsx-loc` 的 peer dependency 與 vite 7 不相容，但功能正常。

---

## 2. Supabase 設定

### Step 2.1 — 建立專案

1. 前往 [supabase.com](https://supabase.com) → 登入
2. 點擊 **New Project**
3. 填入：
   - **Name**: `ai-workbench`（或任意名稱）
   - **Database Password**: 設定一個強密碼（記下來）
   - **Region**: 選擇離你最近的區域
4. 等待專案建立完成（約 1-2 分鐘）

### Step 2.2 — 取得 API Keys

1. 進入專案 → 左側選單 **Project Settings** → **API**
2. 複製以下值：
   - **Project URL** → 這是 `VITE_SUPABASE_URL`
     - 格式：`https://xxxxxxxxxx.supabase.co`
   - **anon public** key → 這是 `VITE_SUPABASE_ANON_KEY`
     - 格式：`eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ...`

### Step 2.3 — 執行資料庫 Migration

1. 進入專案 → 左側選單 **SQL Editor**
2. 點擊 **New query**
3. 打開本專案的 `supabase/migrations/001_initial_schema.sql`
4. 全選內容，貼到 SQL Editor
5. 點擊 **Run** 執行
6. 確認沒有錯誤（應看到 "Success" 訊息）

### Step 2.4 — 執行會員等級 Migration

1. 打開 `supabase/migrations/002_membership_tier.sql`
2. **先將檔案中所有 `ADMIN_EMAIL_HERE` 替換為你的 admin 信箱**（共 3 處）
3. 全選貼到 SQL Editor 執行

### Step 2.5 — 設定 Email 認證

1. 進入專案 → **Authentication** → **Email Templates**
2. 自訂 **Confirm signup** 模板（可選，預設模板也能用）
3. 進入 **Authentication** → **Settings** → **Email**：
   - 確認 **Enable email confirmations** 已開啟
   - **Minimum password length**: 建議設為 6
4. （可選）如果要用自訂 SMTP（如 Resend）：
   - **Authentication** → **Settings** → **SMTP Settings**
   - 填入 SMTP host、port、username、password
   - 這可讓驗證信從你自己的域名發出，提升送達率

> **注意**：Supabase 免費方案每小時限制 4 封驗證信。正式上線建議設定自訂 SMTP。

### Step 2.6 — 啟用 Realtime

1. 進入專案 → **Database** → **Replication**
2. 確認 `user_data` 表的 Realtime 已啟用

---

## 3. Google OAuth 設定

### Step 3.1 — 建立 Google Cloud 專案

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)
2. 頂部選擇或建立新專案
3. 左側選單 → **APIs & Services** → **OAuth consent screen**
4. 選擇 **External** → **Create**
5. 填入：
   - **App name**: `AI Workbench`
   - **User support email**: 你的 email
   - **Developer contact**: 你的 email
6. **Scopes** → Add scopes → 選擇 `email`, `profile`, `openid` → **Save**
7. **Test users** → 加入你的 Google 帳號 email → **Save**

### Step 3.2 — 建立 OAuth Client ID

1. 左側選單 → **APIs & Services** → **Credentials**
2. 點擊 **+ CREATE CREDENTIALS** → **OAuth client ID**
3. 填入：
   - **Application type**: `Web application`
   - **Name**: `AI Workbench`
   - **Authorized JavaScript origins**:
     ```
     http://localhost:3000
     https://你的專案.vercel.app
     ```
   - **Authorized redirect URIs**:
     ```
     https://你的SUPABASE_PROJECT_ID.supabase.co/auth/v1/callback
     ```
4. 點擊 **Create**
5. 複製 **Client ID** 和 **Client Secret**

### Step 3.3 — 在 Supabase 設定 Google Provider

1. 回到 Supabase Dashboard → **Authentication** → **Providers**
2. 找到 **Google** → 啟用
3. 貼上：
   - **Client ID**: Step 3.2 取得的 Client ID
   - **Client Secret**: Step 3.2 取得的 Client Secret
4. **Save**

---

## 4. 環境變數設定

### 本地開發（.env 檔案）

編輯專案根目錄的 `.env`：

```bash
# ─── Supabase ───
VITE_SUPABASE_URL=https://xxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...

# ─── Google OAuth ───
# 如果已在 Supabase 設定 Google Provider，此處可留空
# 如果要用 Legacy 模式（不透過 Supabase），填入 Client ID
VITE_GOOGLE_CLIENT_ID=

# ─── Admin（管理員信箱）───
# 與此信箱登入的帳號將獲得管理員權限，可管理用戶身份
VITE_ADMIN_EMAIL=你的管理員信箱@gmail.com

# ─── 選填 ───
VITE_OAUTH_PORTAL_URL=
VITE_APP_ID=
VITE_ANALYTICS_ENDPOINT=
VITE_ANALYTICS_WEBSITE_ID=

# ─── Server ───
PORT=3000
```

### Vercel 環境變數

在 Vercel Dashboard → 你的專案 → **Settings** → **Environment Variables** 加入：

| Key | Value | 說明 |
|-----|-------|------|
| `VITE_SUPABASE_URL` | `https://xxx.supabase.co` | Supabase 專案 URL |
| `VITE_SUPABASE_ANON_KEY` | `eyJ...` | Supabase 匿名 key |
| `VITE_GOOGLE_CLIENT_ID` | （可選） | 僅 Legacy 模式需要 |
| `VITE_ADMIN_EMAIL` | `admin@gmail.com` | 管理員信箱（獲得 /admin 頁面權限） |

---

## 5. Vercel 部署

### Step 5.1 — 推送到 GitHub

```bash
git add .
git commit -m "Prepare for Vercel deployment"
git push origin main
```

### Step 5.2 — 連接 Vercel

1. 前往 [vercel.com](https://vercel.com) → 用 GitHub 登入
2. 點擊 **Add New** → **Project**
3. 選擇你的 GitHub repo
4. Vercel 會自動偵測 Vite 框架
5. 確認設定：
   - **Framework Preset**: `Vite`
   - **Build Command**: `vite build`（已在 vercel.json 設定）
   - **Output Directory**: `dist/public`（已在 vercel.json 設定）
6. 在 **Environment Variables** 區塊加入 Step 4 的變數
7. 點擊 **Deploy**

### Step 5.3 — 更新 Google OAuth redirect URI

部署完成後，你會得到一個 URL（例如 `https://your-app.vercel.app`）。

回到 Google Cloud Console → Credentials → 你的 OAuth Client → 加入：
- **Authorized JavaScript origins**: `https://your-app.vercel.app`

### Step 5.4 — 驗證

1. 打開 `https://your-app.vercel.app`
2. 用 `demo / demo` 登入 → 確認基本功能
3. 用 Google 帳號登入 → 確認 OAuth 流程
4. 發送一則訊息 → 確認 AI API proxy 正常（需設定 API key）

---

## 6. 本地開發

```bash
# 啟動開發伺服器
pnpm dev
# 或
npm run dev

# 打開 http://localhost:3000

# 類型檢查
pnpm check

# 格式化
pnpm format

# 建構生產版本
pnpm build

# 啟動生產版本
pnpm start
```

### Node modules 注意事項

- **不需要** 手動調整 node_modules
- `pnpm install` 或 `npm install --legacy-peer-deps` 會自動安裝所有依賴
- Vercel 部署時會自動安裝依賴，不需要上傳 node_modules
- `.gitignore` 已包含 `node_modules/`

---

## 7. 速率限制與用戶限制

### Server 端速率限制（per IP）

| 端點 | 限制 | 時間窗口 | 說明 |
|------|------|----------|------|
| `/api/search` | 30 次 | 每分鐘 | DuckDuckGo + Wikipedia 搜尋 |
| `/api/fetch-url` | 20 次 | 每分鐘 | URL 內容擷取 |
| `/api/ai/chat` | 60 次 | 每分鐘 | AI API 代理 |

> **注意**：速率限制是以 **IP 地址** 為單位，不是以用戶為單位。同一 IP 下的所有用戶共享額度。

### Supabase 資料庫限制（per user, 由 SQL trigger 強制）

| 資源 | 限制 | 說明 |
|------|------|------|
| Messages | 100,000 則/用戶 | 超過會被 trigger 拒絕寫入 |
| Conversations | 5,000 個/用戶 | 超過會被 trigger 拒絕寫入 |
| API Key 儲存 | 加密儲存 | XOR 混淆（本地）+ AES-256-GCM（Edge Function） |
| 資料隔離 | 完全隔離 | RLS 政策 + per-user IndexedDB 資料庫 |

### Supabase 免費方案限制

| 資源 | 免費額度 |
|------|----------|
| 資料庫容量 | 500 MB |
| Auth 月活躍用戶 | 50,000 MAU |
| Storage | 1 GB |
| Edge Functions | 500K 次/月 |
| Realtime 連線 | 200 同時連線 |

### Vercel 免費方案限制

| 資源 | 免費額度 |
|------|----------|
| 頻寬 | 100 GB/月 |
| Serverless 執行 | 100 GB-hrs/月 |
| 建構時間 | 6000 分鐘/月 |
| 並發執行 | 10 |
| 函數超時 | 10 秒（Hobby）|

> **AI API 限制**：各 AI 提供商（OpenAI、Anthropic、Google 等）的速率限制取決於用戶自己的 API key 方案。本平台不額外限制 AI 呼叫頻率（僅有上述 60 次/分鐘的 proxy 限制）。

### 用戶資料隔離

| 層級 | 機制 |
|------|------|
| 瀏覽器端 | 每個用戶有獨立的 IndexedDB 資料庫 (`ai-wb-u-{userId}`) |
| 雲端 | Supabase Row-Level Security (RLS)：每個用戶只能存取自己的資料 |
| API Keys | 永不離開瀏覽器，server proxy 只轉發不儲存 |
| 認證 | Supabase Auth 管理 session，JWT 驗證 |

### 會員等級與 Admin

| 等級 | 說明 |
|------|------|
| Classic | 預設等級，所有新用戶（含 demo） |
| Pro | 由 Admin 手動升級 |
| Ultra | 由 Admin 手動升級 |
| Admin | `VITE_ADMIN_EMAIL` 信箱登入，無任何限制，可管理所有用戶 |

Admin 管理頁面：`/admin`（僅 admin 信箱登入後可見）

### 用戶註冊與驗證

| 機制 | 說明 |
|------|------|
| Email 驗證 | Supabase Auth 內建，註冊後自動寄送驗證信 |
| 密碼要求 | 最少 6 字元 |
| 拋棄式信箱封鎖 | 前端封鎖 40+ 已知 temp mail 域名 |
| SMTP 限制 | Supabase 免費方案 4 封/小時，建議設定自訂 SMTP |

### 安全措施

| 防護 | 說明 |
|------|------|
| SSRF 防護 | 封鎖 10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x, localhost, .internal |
| XSS 防護 | Content Security Policy, sanitizeText() |
| API 白名單 | 只允許已知 AI 提供商端點 |
| Header 過濾 | 移除 cookie, set-cookie, origin 等危險 header |
| HTTPS 強制 | HSTS header |
| Clickjacking | X-Frame-Options: DENY |
| 拋棄式信箱 | 註冊時封鎖 40+ 已知 disposable email 域名 |

---

## 8. 疑難排解

### Google 登入後白畫面

- 檢查 Supabase Dashboard → Authentication → Providers → Google 是否啟用
- 檢查 Google Cloud Console 的 redirect URI 是否包含 `https://你的PROJECT.supabase.co/auth/v1/callback`
- 檢查瀏覽器 Console 是否有 CORS 錯誤

### API 呼叫失敗

- 確認已在 Settings → Models & API 設定了對應 provider 的 API key
- 檢查瀏覽器 Network tab 是否有 403/429 錯誤
- 如果是 Vercel 部署，Serverless Function 超時限制為 10 秒（Hobby plan），長回覆可能被截斷

### Vercel 建構失敗

```bash
# 本地測試建構
npm run build:vercel

# 如果有類型錯誤
npx tsc --noEmit
```

### 資料不同步

- 確認 `.env` 中的 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY` 正確
- 確認已執行 `001_initial_schema.sql` migration
- 檢查 Supabase Dashboard → Database → Tables 是否有表

### Demo 模式（無需 Supabase）

如果不設定 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`：
- 系統自動降級為 localStorage + IndexedDB 模式
- 在登入頁輸入 email: `demo`、密碼: `demo` 可進入（介面上不主動提示）
- Demo 帳號適用 Classic 等級限制
- 所有資料只存在本地瀏覽器
- 註冊功能和 Google OAuth 不可用（需要 Supabase）

### 移動端支援

應用已適配手機和平板：
- 側邊欄自動轉為滑入式抽屜（左滑開啟/點擊背景關閉）
- 功能標籤列可水平滾動
- Artifacts 面板以全螢幕覆蓋開啟
- 設定對話框適配小螢幕（標籤改為頂部水平圖示列）
- 部分進階功能（連網搜尋、記憶圖譜）在移動端隱藏以保持簡潔
