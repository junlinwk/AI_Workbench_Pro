# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Workbench — a full-stack TypeScript/React application for multi-provider AI chat with a glassmorphism ("Void Glass") dark UI. Frontend-heavy architecture: the server is a stateless Express file server; all logic lives in React.

## Commands

- **Dev server**: `pnpm dev` (Vite on port 3000 with HMR)
- **Build**: `pnpm build` (Vite client → `dist/public/`, esbuild server → `dist/index.js`)
- **Production**: `pnpm start` (`NODE_ENV=production node dist/index.js`)
- **Type check**: `pnpm check` (`tsc --noEmit`)
- **Format**: `pnpm format` (Prettier)
- **Test**: `pnpm vitest` (vitest is a dev dependency but no test script is defined)

Package manager is **pnpm** (v10.4.1).

## Architecture

### Three-layer monorepo

- `client/` — React 19 SPA (Vite-bundled). Entry: `client/src/main.tsx` → `App.tsx` (routing) → pages.
- `server/` — Express server (`server/index.ts`). Serves static files and SPA fallback only; no API routes yet.
- `shared/` — Constants shared between client and server (`shared/const.ts`).

### Routing

Uses **wouter** (lightweight router, patched to expose routes via `window.__WOUTER_ROUTES__`).

- `/` → `WorkbenchPage` — main 3-column layout (sidebar + chat + artifacts)
- `/memory` → `MemoryMapPage` — interactive force-directed knowledge graph
- Fallback → `NotFound`

### State Management

No external state library. React Context handles global state:
- `SettingsContext` — theme, language (zh-TW default), font size, API keys, model selection, chat preferences. Persisted to `localStorage` key `ai-workbench-settings`.
- `ThemeContext` — dark/light/system theme via next-themes.

### UI Stack

- **Tailwind CSS v4** with oklch CSS variables for theming
- **shadcn/ui** (New York style) — 53+ Radix-based components in `client/src/components/ui/`
- **Framer Motion** for animations
- Custom glassmorphism classes: `.glass-panel`, `.gradient-text`, `.glow-blue`, `.glow-violet`
- Fonts: Geist (headings), Inter (body), JetBrains Mono (code)

### AI Model Integration

Multi-provider support configured in `ModelSwitcher.tsx`: OpenAI (GPT-4o family), Anthropic (Claude family), Google (Gemini), DeepSeek, Meta. API keys stored per-provider in settings context. Chat uses streaming via Streamdown library.

### Key Path Aliases

- `@` → `client/src/`
- `@shared` → `shared/`
- `@assets` → `attached_assets/`

### Environment Variables

- `VITE_OAUTH_PORTAL_URL`, `VITE_APP_ID` — OAuth config (see `client/src/const.ts`)
- `VITE_ANALYTICS_ENDPOINT`, `VITE_ANALYTICS_WEBSITE_ID` — Umami analytics
- `PORT` — server port (default 3000)

### Patches

`patches/wouter@3.7.1.patch` — exposes Route paths to `window.__WOUTER_ROUTES__` for runtime route introspection.

## Code Style

- Prettier: 80-char width, no semicolons, trailing commas, 2-space indent, no bracket same-line
- TypeScript strict mode
- Component variants via class-variance-authority (CVA)
- Utility: `cn()` from `client/src/lib/utils.ts` (clsx + tailwind-merge)
