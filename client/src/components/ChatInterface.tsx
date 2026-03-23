/**
 * ChatInterface Component — Void Glass Design System
 * Main chat area with real AI API integration, message feed, input bar, and Markdown rendering
 *
 * Features:
 * - Real API calls to 7 providers (OpenAI, Anthropic, Google, DeepSeek, Meta, Mistral, xAI)
 * - Code block detection → dispatches artifact-update event for Artifacts panel
 * - Branch switching via switch-branch event
 * - Pin to context via pin-added event
 * - Branch creation via branch-created event
 * - Per-user, per-conversation message persistence
 */
import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import {
  Send,
  Plus,
  Link2,
  RefreshCw,
  Edit3,
  Copy,
  ThumbsUp,
  ThumbsDown,
  FileText,
  Image as ImageIcon,
  Code2,
  Globe,
  ChevronDown,
  Paperclip,
  Sparkles,
  User,
  MoreHorizontal,
  Check,
  StopCircle,
  AlertCircle,
  Pin,
  GitBranch,
  Brain,
  Mic,
  MicOff,
  Volume2,
  X,
  Hand,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Streamdown } from "streamdown"
import { useSettings } from "@/contexts/SettingsContext"
import { useAuth } from "@/contexts/AuthContext"
import {
  loadUserData,
  saveUserData,
  sanitizeText,
} from "@/lib/storage"
import { t } from "@/i18n"
import { ALL_MODELS, MODEL_PROVIDERS, getAllModels } from "./ModelSwitcher"
import { callAI, VISION_MODELS } from "@/lib/aiClient"
import type { ContentPart, ChatMessage } from "@/lib/aiClient"
import {
  transcribeAudio,
  textToSpeech,
  browserTranscribe,
  hasSpeechRecognition,
} from "@/lib/audioClient"
import { useHandGesture } from "@/hooks/useHandGesture"
import { HandGestureOverlay } from "./HandGestureOverlay"
import {
  getVisibleMessages,
  getVisibleMemory,
  mergeMemory,
  getMergeTarget,
} from "@/lib/branchLineage"
import type {
  ConversationBranch,
  BranchPoint,
  ConversationMemory,
} from "@/lib/branchLineage"
import {
  loadMemory,
  saveMemory,
  loadUnifiedMessages,
  saveUnifiedMessages,
  getMessagesKey,
  migrateToUnifiedMessages,
  extractMemoryInBackground,
  formatMemoryForPrompt,
} from "@/lib/conversationMemory"

interface Citation {
  id: number
  title: string
  url: string
  domain: string
}

export interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: string
  citations?: Citation[]
  model?: string
  branchId: string
  imageData?: string
  imageMimeType?: string
}

/* ------------------------------------------------------------------ */
/*  Default system prompt with tool awareness                          */
/* ------------------------------------------------------------------ */

const DEFAULT_SYSTEM_PROMPT = `You are an AI assistant in AI Workbench — a professional multi-model AI workspace.

You have access to the following workspace capabilities that the user can interact with:

1. **Artifacts Panel** — When you generate code blocks (using fenced code blocks with a language tag like \`\`\`tsx, \`\`\`python, etc.), the code is automatically sent to the Artifacts panel on the right side. The user can view, copy, download, and preview the code there. Generate complete, runnable code when asked.

2. **Context Pinning** — Users can pin your responses as context. Pinned items can be set as "prompt context" (injected into future conversations) or "save only" (bookmarked for reference). When a user pins your response, it persists across conversations.

3. **Conversation Branching** — Users can create conversation branches from any of your responses. This allows them to explore different conversation paths. The main branch is the primary conversation, and users can switch between branches.

4. **Memory Map** — An interactive knowledge graph where users track concepts and their connections. You can suggest adding nodes to the memory map when discussing important concepts.

5. **Widget Builder** — A separate chat tab where users can ask you to create interactive widgets (trackers, calculators, charts, mini-tools). If a user asks for a widget in the main chat, suggest they use the Widget tab for a better experience.

6. **Task DAG** — A visual task graph editor where users define multi-step AI task pipelines with entry/exit nodes and conditional branching.

7. **Semantic Search** — Users can search across all their conversations using keywords.

Guidelines:
- Be concise and helpful
- When generating code, use fenced code blocks with the appropriate language tag
- Format responses with Markdown for readability
- If asked to create something visual/interactive, provide complete, working code
- Support the user's language preference (respond in the same language they use)`

/* ------------------------------------------------------------------ */
/*  MessageBubble                                                      */
/* ------------------------------------------------------------------ */

function MessageBubble({
  message,
  showAvatar,
  avatarDisplay,
  userAvatarUrl,
  showTimestamp,
  onRegenerate,
  lang,
  conversationId,
  effectiveUserId,
  voiceLanguage = "auto",
}: {
  message: Message
  showAvatar: boolean
  avatarDisplay: "both" | "user" | "ai" | "none"
  userAvatarUrl?: string
  showTimestamp: boolean
  onRegenerate?: () => void
  lang: "zh-TW" | "en"
  conversationId?: string
  effectiveUserId: string
  voiceLanguage?: "auto" | "zh" | "en"
}) {
  const [copied, setCopied] = useState(false)
  const [feedback, setFeedback] = useState<"up" | "down" | null>(
    null,
  )
  const [isSpeaking, setIsSpeaking] = useState(false)
  const isUser = message.role === "user"

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    toast.success(t("chat.copiedToClipboard", lang))
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSpeak = async () => {
    if (isSpeaking) {
      window.speechSynthesis?.cancel()
      setIsSpeaking(false)
      return
    }
    setIsSpeaking(true)
    try {
      await textToSpeech(message.content, undefined, voiceLanguage)
    } catch {
      // silent fail
    } finally {
      setIsSpeaking(false)
    }
  }

  const model = message.model
    ? [...ALL_MODELS].find((m) => m.id === message.model)
    : null

  return (
    <div
      draggable
      onDragStart={(e) => {
        // Allow dragging message into Notepad
        const data = JSON.stringify({
          role: message.role,
          content: message.content,
          timestamp: message.timestamp,
          model: message.model,
        })
        e.dataTransfer.setData("application/json", data)
        e.dataTransfer.setData("text/plain", message.content)
        e.dataTransfer.effectAllowed = "copy"
      }}
      className={cn(
        "flex gap-3 group cursor-grab active:cursor-grabbing",
        isUser ? "flex-row-reverse" : "flex-row",
      )}
    >
      {showAvatar && (
        (isUser ? (avatarDisplay === "both" || avatarDisplay === "user") : (avatarDisplay === "both" || avatarDisplay === "ai"))
      ) && (
        <div
          className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1 overflow-hidden",
            isUser
              ? userAvatarUrl ? "" : "bg-gradient-to-br from-blue-500 to-violet-600"
              : "bg-gradient-to-br from-violet-600 to-blue-500 ring-1 ring-white/10",
          )}
        >
          {isUser ? (
            userAvatarUrl ? (
              <img src={userAvatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <User size={14} className="text-white" />
            )
          ) : (
            <img src="/logos/app-logo.png" alt="AI" className="w-8 h-8 rounded-full" />
          )}
        </div>
      )}

      <div
        className={cn(
          "flex-1 min-w-0",
          isUser ? "items-end" : "items-start",
          "flex flex-col gap-1",
        )}
      >
        {/* Model name for AI messages */}
        {!isUser && model && (
          <div className="flex items-center gap-1.5 px-1">
            <span className="text-[10px] text-white/30">
              {model.name}
            </span>
            {showTimestamp && (
              <span className="text-[10px] text-white/20">
                {message.timestamp}
              </span>
            )}
          </div>
        )}
        {isUser && showTimestamp && (
          <span className="text-[10px] text-white/20 px-1">
            {message.timestamp}
          </span>
        )}

        <div
          className={cn(
            "max-w-[85%] rounded-2xl py-3",
            isUser
              ? "px-4 bg-blue-600/25 border border-blue-500/20 text-white/90 rounded-tr-sm"
              : "pl-6 pr-4 bg-white/5 border border-white/8 text-white/85 rounded-tl-sm",
          )}
        >
          {/* Attached image */}
          {message.imageData && message.imageMimeType && (
            <img
              src={`data:${message.imageMimeType};base64,${message.imageData}`}
              alt="Attached"
              className="max-w-xs max-h-48 rounded-lg mb-2 border border-white/10"
            />
          )}
          <div
            className="prose prose-invert prose-sm max-w-none
            prose-headings:text-white/90 prose-headings:font-semibold
            prose-p:text-white/75 prose-p:leading-relaxed
            prose-code:text-blue-300 prose-code:bg-blue-900/30 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono
            prose-pre:bg-[oklch(0.10_0.015_265)] prose-pre:border prose-pre:border-white/8 prose-pre:rounded-xl
            prose-strong:text-white/90
            prose-blockquote:border-l-blue-500/50 prose-blockquote:text-white/60
            prose-li:text-white/75
          "
          >
            <Streamdown>{message.content.replace(/```(?:markdown|md)\n([\s\S]*?)```/g, "$1")}</Streamdown>
          </div>
        </div>

        {/* Citations */}
        {message.citations && message.citations.length > 0 && (
          <div className="flex flex-wrap gap-1.5 max-w-[85%]">
            {message.citations.map((c) => (
              <a
                key={c.id}
                href={c.url}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/8 hover:bg-white/8 transition-colors"
                onClick={(e) => {
                  e.preventDefault()
                  toast.info(
                    `${lang === "en" ? "Source" : "來源"}：${c.title}`,
                  )
                }}
              >
                <Globe size={10} className="text-white/30" />
                <span className="text-[10px] text-white/45">
                  {c.domain}
                </span>
                <span className="text-[10px] text-white/30">
                  [{c.id}]
                </span>
              </a>
            ))}
          </div>
        )}

        {/* Actions (AI messages only) */}
        {!isUser && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
            >
              {copied ? (
                <Check
                  size={11}
                  className="text-emerald-400"
                />
              ) : (
                <Copy size={11} />
              )}
              <span className="text-[10px]">
                {copied
                  ? t("chat.copied", lang)
                  : t("chat.copy", lang)}
              </span>
            </button>
            <button
              onClick={handleSpeak}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-lg transition-colors",
                isSpeaking
                  ? "text-blue-400 bg-blue-500/10"
                  : "text-white/30 hover:text-white/60 hover:bg-white/5",
              )}
            >
              <Volume2 size={11} />
              <span className="text-[10px]">
                {isSpeaking
                  ? (lang === "en" ? "Stop" : "停止")
                  : (lang === "en" ? "Speak" : "朗讀")}
              </span>
            </button>
            <button
              onClick={() => {
                onRegenerate?.()
              }}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
            >
              <RefreshCw size={11} />
              <span className="text-[10px]">
                {t("chat.regenerate", lang)}
              </span>
            </button>
            <button
              onClick={() => {
                setFeedback("up")
                toast.success(t("chat.markedHelpful", lang))
              }}
              className={cn(
                "p-1 rounded-lg transition-colors",
                feedback === "up"
                  ? "text-emerald-400 bg-emerald-500/10"
                  : "text-white/30 hover:text-emerald-400 hover:bg-white/5",
              )}
            >
              <ThumbsUp size={11} />
            </button>
            <button
              onClick={() => {
                setFeedback("down")
                toast.info(t("chat.thanksFeedback", lang))
              }}
              className={cn(
                "p-1 rounded-lg transition-colors",
                feedback === "down"
                  ? "text-red-400 bg-red-500/10"
                  : "text-white/30 hover:text-red-400 hover:bg-white/5",
              )}
            >
              <ThumbsDown size={11} />
            </button>
            {/* Pin to Context */}
            <div className="w-px h-3 bg-white/10 mx-0.5" />
            <button
              onClick={() => {
                const preview = message.content.slice(0, 100)
                const title =
                  preview
                    .split("\n")[0]
                    .replace(/[#*`]/g, "")
                    .trim()
                    .slice(0, 40) || "AI Response"
                const pinData = {
                  id: `pin-${Date.now()}`,
                  type: message.content.includes("```")
                    ? ("code" as const)
                    : ("text" as const),
                  title,
                  content: message.content,
                  scope: "conversation" as const,
                  conversationId: conversationId || "default",
                  enabled: true,
                  priority: 3,
                  alwaysInclude: false,
                  useAsPrompt: true,
                }
                // Write directly to localStorage so pin persists even if ContextPinning is not mounted
                try {
                  const uid = effectiveUserId || "anonymous"
                  const existing = loadUserData<any[]>(uid, "context-pins", [])
                  saveUserData(uid, "context-pins", [...existing, pinData])
                } catch { /* best-effort */ }
                // Also dispatch event for live update if ContextPinning is mounted
                window.dispatchEvent(
                  new CustomEvent("pin-added", {
                    detail: pinData,
                  }),
                )
                // Auto-switch to pinning tab
                window.dispatchEvent(
                  new CustomEvent("feature-switch", {
                    detail: { feature: "pinning" },
                  }),
                )
                toast.success(
                  lang === "en"
                    ? `Pinned: "${title}" — switched to Pinning tab`
                    : `已釘選：「${title}」— 已切換至釘選頁`,
                )
              }}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-white/30 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
              title={
                lang === "en"
                  ? "Pin to Context"
                  : "釘選至上下文"
              }
            >
              <Pin size={11} />
              <span className="text-[10px]">
                {lang === "en" ? "Pin" : "釘選"}
              </span>
            </button>
            {/* Branch from this message */}
            <button
              onClick={() => {
                try {
                  const preview = message.content
                    .slice(0, 60)
                    .replace(/[#*`\n]/g, " ")
                    .trim()
                  const convId = conversationId || "default"
                  const uid = effectiveUserId || "anonymous"
                  // Write branch data directly to localStorage
                  const storageKey = `conv-branches:${convId}`
                  const BRANCH_COLORS = [
                    "#a78bfa", "#67e8f9", "#f472b6", "#fbbf24",
                    "#34d399", "#fb923c", "#818cf8", "#f87171",
                  ]
                  const existing = loadUserData<any>(uid, storageKey, {
                    branches: [{ id: "main", name: "main", color: "rgb(96,165,250)", branchPointId: null, messageCount: 0 }],
                    branchPoints: [],
                    activeBranchId: "main",
                  })
                  const bpId = `bp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
                  const branchId = `br_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
                  const branchIndex = existing.branches?.length || 1
                  const usedColors = new Set((existing.branches || []).map((b: any) => b.color))
                  const color = BRANCH_COLORS.find((c) => !usedColors.has(c)) || BRANCH_COLORS[branchIndex % BRANCH_COLORS.length]
                  const branchName = lang === "en" ? `Branch ${branchIndex}` : `分支 ${branchIndex}`
                  // Determine which branch this message belongs to for branch-on-branch
                  const sourceBranch = message.branchId || "main"
                  const newBranchPoint = {
                    id: bpId,
                    messageId: message.id,
                    messagePreview: preview,
                    createdAt: new Date().toISOString(),
                    sourceBranchId: sourceBranch,
                  }
                  const newBranch = {
                    id: branchId,
                    name: branchName,
                    color,
                    branchPointId: bpId,
                    messageCount: 0,
                    parentBranchId: sourceBranch,
                  }
                  const updated = {
                    ...existing,
                    branchPoints: [...(existing.branchPoints || []), newBranchPoint],
                    branches: [...(existing.branches || []), newBranch],
                    activeBranchId: branchId,
                  }
                  saveUserData(uid, storageKey, updated)
                  // Also dispatch event for live update if ConversationBranch is mounted
                  window.dispatchEvent(
                    new CustomEvent("branch-created", {
                      detail: {
                        messageId: message.id,
                        preview,
                        conversationId: convId,
                        timestamp: message.timestamp,
                      },
                    }),
                  )
                  // Auto-switch to branch tab
                  window.dispatchEvent(
                    new CustomEvent("feature-switch", {
                      detail: { feature: "branch" },
                    }),
                  )
                  toast.success(
                    lang === "en"
                      ? `Branch "${branchName}" created — switched to Branch tab`
                      : `已建立分支「${branchName}」— 已切換至分支頁`,
                  )
                } catch (err) {
                  toast.error(
                    lang === "en"
                      ? "Failed to create branch"
                      : "建立分支失敗",
                  )
                }
              }}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-white/30 hover:text-cyan-400 hover:bg-cyan-500/10 transition-colors"
              title={
                lang === "en"
                  ? "Create branch from here"
                  : "從此處建立分支"
              }
            >
              <GitBranch size={11} />
              <span className="text-[10px]">
                {lang === "en" ? "Branch" : "分支"}
              </span>
            </button>
            {/* Add to Memory Map */}
            <button
              onClick={() => {
                try {
                  const category = guessCategory(message.content)
                  persistMemoryNode(effectiveUserId, message.content, category, conversationId)
                  toast.success(
                    lang === "en"
                      ? "Added to Memory Map"
                      : "已加入記憶圖譜",
                    {
                      action: {
                        label: lang === "en" ? "View" : "查看",
                        onClick: () => {
                          window.location.href = "/memory"
                        },
                      },
                    },
                  )
                } catch {
                  toast.error(
                    lang === "en"
                      ? "Failed to add to Memory Map"
                      : "加入記憶圖譜失敗",
                  )
                }
              }}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-white/30 hover:text-violet-400 hover:bg-violet-500/10 transition-colors"
              title={
                lang === "en"
                  ? "Add to Memory Map"
                  : "加入記憶圖譜"
              }
            >
              <Brain size={11} />
              <span className="text-[10px]">
                {lang === "en" ? "Memory" : "記憶"}
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-blue-500 ring-1 ring-white/10 flex items-center justify-center shrink-0">
        <Sparkles size={14} className="text-white" />
      </div>
      <div className="bg-white/5 border border-white/8 rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex gap-1.5 items-center h-4">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-400 typing-dot" />
          <div className="w-1.5 h-1.5 rounded-full bg-blue-400 typing-dot" />
          <div className="w-1.5 h-1.5 rounded-full bg-blue-400 typing-dot" />
        </div>
      </div>
    </div>
  )
}

const SUGGESTION_CHIPS = [
  { en: "Help me write code", zh: "幫我寫程式碼" },
  { en: "Explain a concept", zh: "解釋一個概念" },
  { en: "Analyze data", zh: "分析數據" },
  { en: "Plan a project", zh: "規劃一個專案" },
]

function EmptyState({
  lang,
  onChipClick,
}: {
  lang: "zh-TW" | "en"
  onChipClick: (text: string) => void
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-6">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-blue-500 ring-1 ring-white/10 flex items-center justify-center shadow-lg shadow-violet-900/30">
        <Sparkles size={28} className="text-white" />
      </div>
      <div className="text-center space-y-1">
        <h2 className="text-lg font-semibold text-white/90">
          {lang === "en" ? "Start a conversation" : "開始對話"}
        </h2>
        <p className="text-sm text-white/40">
          {lang === "en"
            ? "Ask anything or pick a suggestion below"
            : "隨意提問，或選擇以下建議"}
        </p>
      </div>
      <div className="flex items-center justify-center gap-2 max-w-lg flex-wrap">
        {SUGGESTION_CHIPS.map((chip, i) => {
          const label = lang === "en" ? chip.en : chip.zh
          return (
            <button
              key={i}
              onClick={() => onChipClick(label)}
              className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-white/60 hover:bg-white/10 hover:text-white/80 hover:border-white/20 transition-all duration-150 whitespace-nowrap"
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Extract code blocks from AI response                               */
/* ------------------------------------------------------------------ */

function extractAndDispatchCodeBlocks(
  content: string,
  source: "chat" | "widget" = "chat",
) {
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g
  let match
  const pending: { code: string; language: string; source: string; filename?: string }[] = []
  while ((match = codeBlockRegex.exec(content)) !== null) {
    let language = match[1] || "text"
    const code = match[2].trim()
    // Auto-detect markdown content when no language tag is specified
    if (language === "text" || language === "markdown" || language === "md") {
      const mdSignals = (code.match(/^#{1,6}\s/gm) || []).length +
        (code.match(/^\s*[-*]\s/gm) || []).length +
        (code.match(/\[.+?\]\(.+?\)/g) || []).length +
        (code.match(/\*\*.+?\*\*/g) || []).length
      if (mdSignals >= 2) language = "markdown"
    }
    // Only dispatch substantial code blocks (not short inline examples)
    if (code.length > 50 && code.split("\n").length > 3) {
      pending.push({ code, language, source })
    }
  }
  // Detect markdown tables in the response (outside code blocks)
  const contentWithoutCode = content.replace(/```[\s\S]*?```/g, '')
  const hasTable = /\|[^\n]+\|\n\|[-:\s|]+\|/m.test(contentWithoutCode)
  if (hasTable) {
    const tableMatch = contentWithoutCode.match(/(\|[^\n]+\|\n\|[-:\s|]+\|\n(?:\|[^\n]+\|\n?)*)/gm)
    if (tableMatch) {
      for (const table of tableMatch) {
        pending.push({ code: table.trim(), language: "markdown", source, filename: "table.md" })
      }
    }
  }

  if (pending.length > 0) {
    // Open the Artifacts panel first so it mounts before receiving events
    window.dispatchEvent(new CustomEvent("artifacts-open"))
    // Delay artifact-update dispatch to allow React to render/mount the panel
    setTimeout(() => {
      for (const item of pending) {
        window.dispatchEvent(
          new CustomEvent("artifact-update", { detail: item }),
        )
      }
    }, 100)
  }
}

/* ------------------------------------------------------------------ */
/*  Memory Map integration helpers                                     */
/* ------------------------------------------------------------------ */

function extractTopicFromMessage(content: string): string {
  // Try first heading
  const headingMatch = content.match(/^#+\s+(.+)$/m)
  if (headingMatch) return headingMatch[1].trim().slice(0, 60)
  // Try first bold text
  const boldMatch = content.match(/\*\*(.+?)\*\*/)
  if (boldMatch) return boldMatch[1].trim().slice(0, 60)
  // Fallback to first non-empty line stripped of markdown
  const firstLine = content
    .split("\n")
    .find((l) => l.trim().length > 0)
  return (
    (firstLine || "AI Response")
      .replace(/[#*`>]/g, "")
      .trim()
      .slice(0, 60) || "AI Response"
  )
}

function extractKeywordsFromMessage(content: string): string[] {
  const keywords = new Set<string>()
  // Detect code language names from fenced blocks
  const langMatches = content.matchAll(/```(\w+)/g)
  for (const m of langMatches) {
    if (m[1] && m[1] !== "text") keywords.add(m[1])
  }
  // Detect capitalized proper-noun-like terms (2+ words or single known terms)
  const properNouns = content.match(
    /\b(?:React|TypeScript|JavaScript|Python|Rust|Go|Docker|Kubernetes|AWS|API|SQL|GraphQL|Node\.js|Next\.js|Vue|Angular|Svelte|TailwindCSS|Tailwind|CSS|HTML|Git|GitHub|REST|OAuth|JWT|WebSocket|MongoDB|PostgreSQL|Redis|Linux|macOS|Windows)\b/gi,
  )
  if (properNouns) {
    properNouns.forEach((n) => keywords.add(n))
  }
  return Array.from(keywords).slice(0, 8)
}

/**
 * Persist a memory node directly to localStorage so it survives
 * cross-route navigation, then also fire a CustomEvent for any
 * already-mounted MemoryMapPage to pick up in real time.
 */
function persistMemoryNode(
  userId: string,
  content: string,
  category: "technical" | "personal" | "project" | "career" = "technical",
  conversationId?: string,
): void {
  const label = extractTopicFromMessage(content)
  const keywords = extractKeywordsFromMessage(content)
  const conversationSnippet = {
    id: `conv-${Date.now()}`,
    date: new Date().toLocaleDateString(),
    excerpt: content.slice(0, 200).replace(/[#*`]/g, ""),
    topic: label,
    conversationId: conversationId || undefined,
  }

  try {
    // ---- Write directly to localStorage ----
    type MemoryNode = {
      id: string
      label: string
      category: string
      x: number
      y: number
      size: number
      conversations: { id: string; date: string; excerpt: string; topic: string; conversationId?: string }[]
      keywords?: string[]
    }
    type Edge = { from: string; to: string; strength: number; label?: string }

    const DEFAULT_NODES: MemoryNode[] = [
      { id: "user", label: "", category: "user", x: 150, y: 150, size: 34, conversations: [], keywords: [] },
    ]

    const nodes: MemoryNode[] = loadUserData(userId, "memory-nodes", DEFAULT_NODES)
    const edges: Edge[] = loadUserData(userId, "memory-edges", [] as Edge[])

    const existing = nodes.find(
      (n) => n.label.toLowerCase() === label.toLowerCase() && n.id !== "user",
    )

    if (existing) {
      // Merge keywords and add conversation snippet
      existing.keywords = Array.from(
        new Set([...(existing.keywords || []), ...keywords]),
      )
      existing.conversations = [...existing.conversations, conversationSnippet]
    } else {
      // Create new node at random position around center
      const angle = Math.random() * Math.PI * 2
      const distance = 60 + Math.random() * 80
      const cx = 150 + Math.cos(angle) * distance
      const cy = 150 + Math.sin(angle) * distance
      const newNode: MemoryNode = {
        id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        label,
        category,
        x: Math.max(-30, Math.min(360, cx)),
        y: Math.max(-30, Math.min(360, cy)),
        size: 18 + Math.random() * 8,
        conversations: [conversationSnippet],
        keywords,
      }
      nodes.push(newNode)
      edges.push({
        from: "user",
        to: newNode.id,
        strength: 0.5 + Math.random() * 0.5,
        label: category,
      })
    }

    saveUserData(userId, "memory-nodes", nodes)
    saveUserData(userId, "memory-edges", edges)
  } catch (err) {
    console.error("Failed to persist memory node:", err)
    throw err
  }

  // ---- Also fire event for live updates if MemoryMapPage is mounted ----
  window.dispatchEvent(
    new CustomEvent("memory-add", {
      detail: { label, category, keywords, conversationSnippet },
    }),
  )
}

/** Heuristic: does this response seem substantial enough for auto-memory? */
function shouldAutoAddToMemory(content: string): boolean {
  if (content.length < 200) return false
  // Must have headings or code blocks (indicates structured/substantial content)
  const hasHeadings = /^#+\s+/m.test(content)
  const hasCodeBlocks = /```\w+/.test(content)
  return hasHeadings || hasCodeBlocks
}

function guessCategory(
  content: string,
): "technical" | "personal" | "project" | "career" {
  const lower = content.toLowerCase()
  if (
    /\b(code|function|api|bug|error|deploy|database|server|algorithm)\b/.test(
      lower,
    )
  )
    return "technical"
  if (/\b(project|sprint|milestone|roadmap|deadline|feature)\b/.test(lower))
    return "project"
  if (/\b(career|resume|interview|salary|promotion|job)\b/.test(lower))
    return "career"
  return "technical"
}

/* ------------------------------------------------------------------ */
/*  Smart Web Search — heuristic gate                                  */
/* ------------------------------------------------------------------ */

function needsWebSearch(msg: string): "yes" | "no" | "maybe" {
  const trimmed = msg.trim()
  // Skip: very short messages, greetings, code-only
  if (trimmed.length < 10) return "no"
  if (/^(hi|hello|hey|你好|嗨|哈囉|謝謝|thanks|ok|好的)\b/i.test(trimmed)) return "no"
  if (/^```[\s\S]*```$/.test(trimmed)) return "no"
  // Skip: conversation meta / code tasks
  if (/^(summarize|explain|翻譯|整理|摘要|重寫|改寫|幫我寫|write me|debug|fix|refactor)/i.test(trimmed)) return "no"

  // Search: user provides a URL — fetch it (handled separately, but flag yes for doSearch gate)
  if (/https?:\/\//i.test(trimmed)) return "yes"

  // Search: explicit intent (EN)
  if (/\b(search|search for|look up|look it up|find out|google|browse|check online|research|find me)\b/i.test(trimmed)) return "yes"
  // Search: explicit intent (ZH)
  if (/(搜尋|搜索|查詢|查一下|搜一下|上網|上網查|幫我查|網上|網路上|去查|查找|搜一搜|查查|幫查|幫我搜)/.test(trimmed)) return "yes"

  // Search: temporal markers
  if (/\b(最新|today|yesterday|昨天|今天|2025|2026|目前|currently|latest|recent|now|update on|what's new)\b/i.test(trimmed)) return "yes"
  // Search: factual questions
  if (/^(who |what is|what are|what was|where |when |how much|how many|how to|is there|are there|tell me about)/i.test(trimmed)) return "yes"
  if (/^(誰|什麼是|哪裡|多少|幾|怎麼|有沒有|是否|哪個|哪些|告訴我)/.test(trimmed)) return "yes"
  // Search: prices, weather, news, events, products
  if (/\b(price|pricing|股價|天氣|weather|news|新聞|匯率|exchange rate|score|比分|release date|發售|上市|開賣|評價|review|比較|compare|vs|versus)\b/i.test(trimmed)) return "yes"

  return "maybe"
}

/* ------------------------------------------------------------------ */
/*  Global pending AI responses (survives tab switches / unmounts)      */
/* ------------------------------------------------------------------ */

interface PendingResponse {
  convId: string
  promise: Promise<string>
  abort: AbortController
  userId: string
  modelId: string
  branchId: string
  userMsg: Message
}

const pendingResponses = new Map<string, PendingResponse>()

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

interface ChatInterfaceProps {
  onArtifactOpen?: () => void
  conversationId?: string
  userId?: string
  folderPrompt?: string
}

export default function ChatInterface({
  onArtifactOpen,
  conversationId,
  userId: userIdProp,
  folderPrompt,
}: ChatInterfaceProps) {
  const { settings, hasApiKey, getApiKey } = useSettings()
  const { user } = useAuth()
  const lang = settings.language

  const effectiveUserId = userIdProp || user?.id || "anon"
  const effectiveConvId = conversationId || "default"

  // Branch data (loaded from ConversationBranch's storage)
  const branchStorageKey = `conv-branches:${effectiveConvId}`

  // Helper to normalize raw branch data from localStorage
  function normalizeBranchData(raw: any) {
    return {
      ...raw,
      branches: (raw.branches || []).map((b: any) => ({
        ...b,
        parentBranchId: b.parentBranchId ?? (b.id === "main" ? null : "main"),
      })),
      branchPoints: (raw.branchPoints || []).map((bp: any) => ({
        ...bp,
        sourceBranchId: bp.sourceBranchId ?? "main",
      })),
    }
  }

  const [branchData, setBranchData] = useState<{
    branches: ConversationBranch[]
    branchPoints: BranchPoint[]
    activeBranchId: string
  }>(() => {
    const raw = loadUserData<any>(effectiveUserId, branchStorageKey, null)
    if (!raw) {
      return {
        branches: [{ id: "main", name: "main", color: "rgb(96,165,250)", branchPointId: null, messageCount: 0, parentBranchId: null }],
        branchPoints: [],
        activeBranchId: "main",
      }
    }
    return normalizeBranchData(raw)
  })

  // Initialize activeBranchId from persisted branch data (NOT always "main")
  const [activeBranchId, setActiveBranchId] = useState(() => {
    const raw = loadUserData<any>(effectiveUserId, branchStorageKey, null)
    return raw?.activeBranchId || "main"
  })

  // Unified message storage (all branches in one array)
  const [allMessages, setAllMessages] = useState<Message[]>(() => {
    const existing = loadUnifiedMessages(effectiveUserId, effectiveConvId)
    if (existing) return existing
    return migrateToUnifiedMessages(effectiveUserId, effectiveConvId, branchData)
  })

  // Visible messages = filtered by branch lineage
  const visibleMessages = useMemo(
    () =>
      getVisibleMessages(
        activeBranchId,
        allMessages,
        branchData.branches,
        branchData.branchPoints,
      ),
    [activeBranchId, allMessages, branchData.branches, branchData.branchPoints],
  )

  const [input, setInput] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [showUrlInput, setShowUrlInput] = useState(false)
  const [urlInput, setUrlInput] = useState("")
  // Image upload state
  const [pendingImage, setPendingImage] = useState<{
    base64: string
    mimeType: string
    preview: string
  } | null>(null)
  // Voice state
  const [isRecording, setIsRecording] = useState(false)
  const [voiceMode, setVoiceMode] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0) // 0-1 for visualisation
  const [voiceDragState, setVoiceDragState] = useState<{
    active: boolean
    direction: "none" | "left" | "up" | "right"
    startX: number
    startY: number
  }>({ active: false, direction: "none", startX: 0, startY: 0 })
  const [liveTranscript, setLiveTranscript] = useState("")
  const [handGestureMode, setHandGestureMode] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number>(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const handleSendRef = useRef<(() => void) | null>(null)
  const discardRecordingRef = useRef(false)

  // Check for pending background responses on mount (from tab switches)
  useEffect(() => {
    const pending = pendingResponses.get(effectiveConvId)
    if (!pending) return

    setIsTyping(true)
    pending.promise
      .then((response) => {
        setIsTyping(false)
        const aiMsg: Message = {
          id: `m${Date.now() + 1}`,
          role: "assistant",
          content: response,
          timestamp: new Date().toLocaleTimeString("zh-TW", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          model: pending.modelId,
          branchId: pending.branchId,
        }
        setAllMessages((prev) => [...prev, aiMsg])
        extractAndDispatchCodeBlocks(response)
        pendingResponses.delete(effectiveConvId)
      })
      .catch(() => {
        setIsTyping(false)
        pendingResponses.delete(effectiveConvId)
      })
  }, [effectiveConvId])

  // Persist unified messages on change (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      saveUnifiedMessages(effectiveUserId, effectiveConvId, allMessages)
      // Dispatch event so BranchGraph can re-render with real dot counts
      window.dispatchEvent(
        new CustomEvent("conv-messages-updated", {
          detail: { conversationId: effectiveConvId },
        }),
      )
    }, 300)
    return () => clearTimeout(timer)
  }, [allMessages, effectiveUserId, effectiveConvId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [visibleMessages, isTyping])

  // Reload branch data when it changes externally
  useEffect(() => {
    function handleBranchDataChanged(e: Event) {
      const raw = loadUserData<any>(effectiveUserId, branchStorageKey, null)
      if (raw) {
        const normalized = normalizeBranchData(raw)
        setBranchData(normalized)
        // When a branch is created, auto-switch to it so subsequent messages
        // land on the new branch (not main)
        if (e.type === "branch-created" && normalized.activeBranchId) {
          setActiveBranchId(normalized.activeBranchId)
        }
      }
    }
    window.addEventListener("branch-created", handleBranchDataChanged)
    window.addEventListener("branch-data-changed", handleBranchDataChanged)
    return () => {
      window.removeEventListener("branch-created", handleBranchDataChanged)
      window.removeEventListener("branch-data-changed", handleBranchDataChanged)
    }
  }, [effectiveUserId, branchStorageKey])

  // Sync activeBranchId to localStorage so it persists across reloads
  useEffect(() => {
    const raw = loadUserData<any>(effectiveUserId, branchStorageKey, null)
    if (raw && raw.activeBranchId !== activeBranchId) {
      saveUserData(effectiveUserId, branchStorageKey, {
        ...raw,
        activeBranchId,
      })
    }
  }, [activeBranchId, effectiveUserId, branchStorageKey])

  // Listen for branch switching — now just change activeBranchId
  useEffect(() => {
    function handleSwitchBranch(e: Event) {
      const detail = (e as CustomEvent).detail
      if (!detail) return
      const { branchId, conversationId: evtConvId } = detail
      if (evtConvId && evtConvId !== conversationId) return
      setActiveBranchId(branchId)
    }

    window.addEventListener("switch-branch", handleSwitchBranch)
    return () =>
      window.removeEventListener("switch-branch", handleSwitchBranch)
  }, [conversationId])

  // Listen for merge-branch events
  useEffect(() => {
    function handleMergeBranch(e: Event) {
      const detail = (e as CustomEvent).detail
      if (!detail) return
      const { branchId, mergeTarget: target, conversationId: evtConvId } = detail
      if (evtConvId && evtConvId !== conversationId) return

      const mergeTarget = target || getMergeTarget(branchId, branchData.branches)

      // DON'T re-tag messages — keep them on their original branch
      // so user can still switch to the merged branch and view history.
      // Instead, merge memory so target branch can now see merged branch's memory.
      const memory = loadMemory(effectiveUserId, effectiveConvId)
      const merged = mergeMemory(branchId, mergeTarget, memory)
      saveMemory(effectiveUserId, effectiveConvId, merged)

      // Reload branch data (ConversationBranch marked it as merged)
      const raw = loadUserData<any>(effectiveUserId, branchStorageKey, null)
      if (raw) {
        setBranchData(normalizeBranchData(raw))
      }

      setActiveBranchId(mergeTarget)
    }

    window.addEventListener("merge-branch", handleMergeBranch)
    return () =>
      window.removeEventListener("merge-branch", handleMergeBranch)
  }, [conversationId, effectiveUserId, effectiveConvId, branchData.branches, branchStorageKey])

  const allModels = getAllModels(settings.customModels)
  const currentModel = allModels.find(
    (m) => m.id === settings.selectedModelId,
  )
  const currentProvider = currentModel
    ? MODEL_PROVIDERS.find((p) => p.id === currentModel.providerId)
    : null
  const canSend = hasApiKey(currentModel?.providerId || "")
  // Fallback key for legacy proxy mode (when server-side storage unavailable)
  const fallbackKey = currentModel ? getApiKey(currentModel.providerId) : undefined
  // Whether Groq/Meta key is available for voice features (STT/TTS)
  const hasGroqKey = hasApiKey("groq") || hasApiKey("meta")

  const handleChipClick = useCallback((text: string) => {
    setInput(text)
    textareaRef.current?.focus()
  }, [])

  // ── Voice recording with audio level monitoring ──
  const stopAudioMonitor = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    audioContextRef.current?.close().catch(() => {})
    audioContextRef.current = null
    analyserRef.current = null
    setAudioLevel(0)
  }, [])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      // Audio level monitoring
      const audioCtx = new AudioContext()
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      audioContextRef.current = audioCtx
      analyserRef.current = analyser

      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      const monitorLevel = () => {
        if (!analyserRef.current) return
        analyserRef.current.getByteFrequencyData(dataArray)
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
        setAudioLevel(Math.min(avg / 128, 1))
        animFrameRef.current = requestAnimationFrame(monitorLevel)
      }
      monitorLevel()

      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4",
      })
      const chunks: Blob[] = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }
      const recordStartTime = Date.now()
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        stopAudioMonitor()
        const blob = new Blob(chunks, { type: recorder.mimeType })
        setIsRecording(false)

        // Skip transcription if recording is too short (< 500ms) — Whisper hallucinates on silence
        const durationMs = Date.now() - recordStartTime
        if (durationMs < 500 || blob.size < 1000) {
          setLiveTranscript("")
          return
        }

        // Transcribe
        setLiveTranscript(lang === "en" ? "Transcribing..." : "轉錄中...")
        try {
          let text = ""
          if (hasGroqKey) {
            text = await transcribeAudio(blob, undefined, settings.voiceLanguage)
          } else if (hasSpeechRecognition()) {
            text = await browserTranscribe()
          } else {
            toast.error(
              lang === "en"
                ? "No Groq API key set for voice. Add one in Settings."
                : "尚未設定 Groq API Key，請在設定中新增。",
            )
            setLiveTranscript("")
            return
          }
          // If recording was discarded (gesture throw-back), skip transcription result
          if (discardRecordingRef.current) {
            discardRecordingRef.current = false
            setLiveTranscript("")
            return
          }
          setLiveTranscript(text || "")
          if (text) {
            setInput((prev) => (prev ? prev + " " + text : text))
            textareaRef.current?.focus()
          }
        } catch {
          toast.error(lang === "en" ? "Transcription failed" : "語音轉錄失敗")
        }
        setTimeout(() => setLiveTranscript(""), 3000)
      }

      recorder.start(250) // collect data every 250ms for reliable chunks
      mediaRecorderRef.current = recorder
      setIsRecording(true)
      setLiveTranscript(lang === "en" ? "Listening..." : "聆聽中...")
    } catch {
      toast.error(
        lang === "en"
          ? "Microphone access denied"
          : "麥克風存取被拒絕",
      )
    }
  }, [hasGroqKey, lang, stopAudioMonitor])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop()
    }
    stopAudioMonitor()
  }, [stopAudioMonitor])

  // Voice mode drag gesture handler
  const handleVoiceDragStart = useCallback((clientX: number, clientY: number) => {
    setVoiceDragState({ active: true, direction: "none", startX: clientX, startY: clientY })
    startRecording()
  }, [startRecording])

  const handleVoiceDragMove = useCallback((clientX: number, clientY: number) => {
    if (!voiceDragState.active) return
    const dx = clientX - voiceDragState.startX
    const dy = voiceDragState.startY - clientY // positive = up
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < 20) {
      setVoiceDragState(prev => ({ ...prev, direction: "none" }))
      return
    }
    // Calculate angle: 0° = right, 90° = up, 180° = left
    const angle = Math.atan2(dy, dx) * (180 / Math.PI)
    let dir: "left" | "up" | "right" = "up"
    if (angle >= 40 && angle <= 140) dir = "up" // send
    else if (angle > 140 || angle < -140) dir = "left" // edit
    else dir = "right" // close
    setVoiceDragState(prev => ({ ...prev, direction: dir }))
  }, [voiceDragState.active, voiceDragState.startX, voiceDragState.startY])

  const handleVoiceDragEnd = useCallback(() => {
    stopRecording()
    const dir = voiceDragState.direction
    setVoiceDragState({ active: false, direction: "none", startX: 0, startY: 0 })

    // Process action after transcript is ready
    setTimeout(() => {
      if (dir === "up") {
        // Auto-send
        handleSendRef.current?.()
      } else if (dir === "left") {
        // Edit: keep text in input, focus
        textareaRef.current?.focus()
      } else if (dir === "right") {
        // Close: clear transcript and voice mode
        setInput("")
        setLiveTranscript("")
        setVoiceMode(false)
      }
    }, 1500) // Wait for transcription
  }, [voiceDragState.direction, stopRecording])

  // ── Image upload handler ──
  const handleImageUpload = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      const base64 = dataUrl.split(",")[1] || ""
      setPendingImage({
        base64,
        mimeType: file.type || "image/png",
        preview: dataUrl,
      })
      toast.success(
        lang === "en" ? `Image attached: ${file.name}` : `圖片已附加：${file.name}`,
      )
    }
    reader.readAsDataURL(file)
  }, [lang])

  const handleSend = async () => {
    if (isMergedBranch) return // Merged branches are read-only
    const trimmed = input.trim()
    if (!trimmed && !pendingImage) return

    const sanitized = sanitizeText(trimmed || (lang === "en" ? "What's in this image?" : "這張圖片裡有什麼？"), 4096)

    // Capture and clear pending image
    const currentImage = pendingImage
    setPendingImage(null)

    if (!canSend) {
      toast.error(
        lang === "en"
          ? `Please set your ${currentProvider?.name || "model"} API key in Settings > Models & API.`
          : `請先在設定 → 模型與 API 中設定 ${currentProvider?.name || "模型"} 的 API Key。`,
      )
      return
    }

    // Warn if image attached but model doesn't support vision
    if (currentImage && !VISION_MODELS.has(settings.selectedModelId)) {
      toast.warning(
        lang === "en"
          ? "Current model may not support images. Consider switching to a vision model (GPT-4o, Claude, Gemini, Llama 4 Scout)."
          : "目前的模型可能不支援圖片。建議切換到視覺模型（GPT-4o、Claude、Gemini、Llama 4 Scout）。",
        { duration: 4000 },
      )
    }

    // Per-branch temperature override
    const activeBranchData = branchData.branches.find((b: any) => b.id === activeBranchId)
    const effectiveTemperature = activeBranchData?.temperature ?? settings.temperature

    const userMsg: Message = {
      id: `m${Date.now()}`,
      role: "user",
      content: sanitized,
      timestamp: new Date().toLocaleTimeString("zh-TW", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      branchId: activeBranchId,
      ...(currentImage && {
        imageData: currentImage.base64,
        imageMimeType: currentImage.mimeType,
      }),
    }
    setAllMessages((prev) => [...prev, userMsg])
    setInput("")
    setIsTyping(true)

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }

    // Build effective system prompt
    const effectiveSystemPrompt = settings.systemPrompt
      ? `${DEFAULT_SYSTEM_PROMPT}\n\nUser's additional instructions:\n${settings.systemPrompt}`
      : DEFAULT_SYSTEM_PROMPT

    // Build user profile context
    let userProfileContext = ""
    const profile = settings.userProfile
    if (profile) {
      const parts: string[] = []
      if (profile.displayName)
        parts.push(
          `The user's name is "${profile.displayName}". Address them by name when appropriate.`,
        )
      if (profile.role) parts.push(`The user's role: ${profile.role}`)
      if (profile.bio) parts.push(`About the user: ${profile.bio}`)
      if (profile.customInstructions)
        parts.push(
          `User's custom instructions: ${profile.customInstructions}`,
        )
      if (parts.length > 0) {
        userProfileContext =
          "\n\n--- User Profile ---\n" +
          parts.join("\n") +
          "\n--- End User Profile ---"
      }
    }

    // Collect pinned context items (useAsPrompt === true)
    // These are loaded from ContextPinning storage
    let pinnedContext = ""
    try {
      const pins = loadUserData<any[]>(
        effectiveUserId,
        "context-pins",
        [],
      )
      const activePromptPins = pins.filter(
        (p: any) =>
          p.enabled &&
          p.useAsPrompt &&
          (p.scope === "global" ||
            p.scope === "project" ||
            (p.scope === "conversation" &&
              p.conversationId === conversationId)),
      )
      if (activePromptPins.length > 0) {
        pinnedContext =
          "\n\n--- Pinned Context ---\n" +
          activePromptPins
            .map(
              (p: any) => `[${p.scope}/${p.type}] ${p.title}:\n${p.condensed || p.content}`,
            )
            .join("\n\n")
      }
    } catch {
      // Ignore pin loading errors
    }

    const pinnedTokenEstimate = Math.ceil(pinnedContext.length / 4)
    if (pinnedTokenEstimate > 0) {
      console.log(
        `[ChatInterface] Pinned context: ~${pinnedTokenEstimate} tokens`,
      )
    }

    const COMPACT_SYSTEM_PROMPT = `You are an AI assistant in AI Workbench. Be concise and helpful. Use Markdown. Generate complete code in fenced blocks when asked. Support the user's language.`

    const systemBase =
      effectiveSystemPrompt.length + pinnedContext.length > 6000
        ? settings.systemPrompt
          ? `${COMPACT_SYSTEM_PROMPT}\n\n${settings.systemPrompt}`
          : COMPACT_SYSTEM_PROMPT
        : effectiveSystemPrompt
    // ── URL detection: fetch content from any URLs in the message ──
    let urlContext = ""
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi
    const detectedUrls = (trimmed.match(urlRegex) || []).slice(0, 3)
    if (detectedUrls.length > 0) {
      toast.info(
        lang === "en"
          ? `Fetching ${detectedUrls.length} URL(s)...`
          : `正在擷取 ${detectedUrls.length} 個網址內容...`,
        { duration: 2000 },
      )
      for (const url of detectedUrls) {
        try {
          const fetchRes = await fetch(`/api/fetch-url?url=${encodeURIComponent(url)}`)
          if (fetchRes.ok) {
            const data = await fetchRes.json()
            if (data.text && data.text.length > 20) {
              urlContext += `\n\n--- Content from: ${url} ---\nTitle: ${data.title || "(no title)"}\n${data.text}`
            }
          }
        } catch { /* skip failed URLs */ }
      }
      if (urlContext) {
        toast.info(
          lang === "en" ? "URL content loaded" : "網址內容已載入",
          { duration: 2000 },
        )
      }
    }

    // ── Web search integration — smart gate ──
    let webContext = ""
    let doSearch = false
    if (settings.webSearchEnabled && detectedUrls.length === 0) {
      const verdict = needsWebSearch(trimmed)
      if (verdict === "yes") {
        doSearch = true
      } else if (verdict === "maybe") {
        // Tier 2: Quick AI classify
        try {
          const classifyResult = await callAI(
            [{ role: "user", content: `Does this user message need real-time web information to answer properly? Answer only "yes" or "no".\n\nMessage: "${trimmed}"` }],
            settings.selectedModelId,
            fallbackKey,
            0,
            10,
            "Output only yes or no.",
          )
          doSearch = /yes/i.test(classifyResult.trim())
        } catch {
          // On classify failure, err on the side of searching
          doSearch = true
        }
      }
    }
    if (doSearch) {
      try {
        // Step 1: Ask AI to generate search queries
        const searchQueryPrompt = `Based on this user message, generate 1-2 concise search queries to find relevant information. Return ONLY the queries, one per line, no numbering, no quotes, nothing else:\n\n"${trimmed}"`

        const searchQueries = await callAI(
          [{ role: "user", content: searchQueryPrompt }],
          settings.selectedModelId,
          fallbackKey,
          0.3,
          100,
          "Output only search queries, one per line. No numbering, no quotes, no explanation.",
        )

        // Step 2: Use server-side search proxy
        const queries = searchQueries
          .split("\n")
          .map((q) => q.replace(/^[\d.\-*]+[.)]\s*/, "").replace(/^["'`]|["'`]$/g, "").trim())
          .filter((q) => q.length > 3 && !q.startsWith("{") && !q.startsWith("//"))
          .slice(0, 2)

        if (queries.length > 0) {
          toast.info(
            lang === "en"
              ? `Searching: ${queries[0].slice(0, 50)}...`
              : `搜尋中：${queries[0].slice(0, 50)}...`,
            { duration: 2000 },
          )

          for (const query of queries) {
            try {
              const searchRes = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`)
              if (searchRes.ok) {
                const searchData = await searchRes.json()
                if (searchData.results && searchData.results.length > 0) {
                  const parts = searchData.results.map(
                    (r: { title: string; snippet: string; url: string }) =>
                      `• ${r.title}\n  ${r.snippet}${r.url ? `\n  Source: ${r.url}` : ""}`
                  )
                  const cleaned = parts.join("\n\n").slice(0, 3000)
                  webContext += `\n\n[Web Search: "${query.trim()}"]\n${cleaned}`
                }
              }
            } catch { /* continue */ }
          }
        }

        if (webContext) {
          toast.info(
            lang === "en"
              ? `Web results added to context`
              : `已加入網路搜尋結果`,
            { duration: 2000 },
          )
        } else {
          toast.warning(
            lang === "en"
              ? "Web search returned no results"
              : "網路搜尋未找到結果",
            { duration: 2000 },
          )
        }
      } catch (err) {
        console.warn("Web search failed:", err)
        toast.warning(
          lang === "en"
            ? "Web search failed"
            : "網路搜尋失敗",
          { duration: 2000 },
        )
      }
    }

    // Build web/url instruction for the AI — strong directive to use retrieved data
    const webAndUrlContext = (urlContext || webContext)
      ? `\n\n=== LIVE WEB DATA (MANDATORY — YOU MUST USE THIS) ===\nThe following information was just retrieved from the internet in real-time. This is FRESH, REAL data — NOT from your training data.\n\nCRITICAL RULES:\n1. You MUST base your answer primarily on this retrieved data\n2. You MUST cite the source URLs when available\n3. Do NOT rely on your training data for facts covered by this web data\n4. If the web data contradicts your training data, trust the web data\n5. If the web data doesn't fully answer the question, say so honestly\n${urlContext}${webContext}\n=== END LIVE WEB DATA ===`
      : ""

    // Inject conversation memory (branch-isolated)
    let memoryContext = ""
    try {
      const memory = loadMemory(effectiveUserId, effectiveConvId)
      const visibleMemEntries = getVisibleMemory(
        activeBranchId,
        memory,
        branchData.branches,
        allMessages,
        branchData.branchPoints,
      )
      memoryContext = formatMemoryForPrompt(visibleMemEntries)
    } catch {
      // Ignore memory loading errors
    }

    const folderContext = folderPrompt ? `\n\n--- Folder Context ---\n${folderPrompt}` : ""
    const gestureContext = handGestureMode
      ? "\n\n--- Conversation Mode ---\nThe user is in hands-free gesture conversation mode. Keep responses short and concise (1-3 sentences). Answer directly, no lengthy explanations. Think of this as a quick voice chat."
      : ""
    const fullSystemPrompt = systemBase + userProfileContext + pinnedContext + memoryContext + folderContext + webAndUrlContext + gestureContext

    // Real API call — registered as global pending so it survives tab switches
    try {
      const abort = new AbortController()
      abortRef.current = abort

      const chatHistory: ChatMessage[] = visibleMessages.map((m) => ({
        role: m.role,
        content: m.imageData && m.imageMimeType
          ? [
              { type: "text" as const, text: m.content },
              { type: "image" as const, base64: m.imageData, mimeType: m.imageMimeType },
            ]
          : m.content,
      }))
      chatHistory.push({
        role: "user",
        content: currentImage
          ? [
              { type: "text" as const, text: userMsg.content },
              { type: "image" as const, base64: currentImage.base64, mimeType: currentImage.mimeType },
            ]
          : userMsg.content,
      })

      const aiPromise = callAI(
        chatHistory,
        settings.selectedModelId,
        fallbackKey,
        effectiveTemperature,
        settings.maxTokens,
        fullSystemPrompt,
        abort.signal,
      )

      // Register globally so response survives tab switches
      pendingResponses.set(effectiveConvId, {
        convId: effectiveConvId,
        promise: aiPromise,
        abort,
        userId: effectiveUserId,
        modelId: settings.selectedModelId,
        branchId: activeBranchId,
        userMsg,
      })

      const response = await aiPromise
      pendingResponses.delete(effectiveConvId)

      setIsTyping(false)
      const aiMsg: Message = {
        id: `m${Date.now() + 1}`,
        role: "assistant",
        content: response,
        timestamp: new Date().toLocaleTimeString("zh-TW", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        model: settings.selectedModelId,
        branchId: activeBranchId,
      }
      setAllMessages((prev) => [...prev, aiMsg])

      // Extract code blocks and send to Artifacts panel
      extractAndDispatchCodeBlocks(response)

      // Voice/gesture mode: speak the response aloud (falls back to browser TTS if no Groq key)
      if (voiceMode || handGestureMode) {
        textToSpeech(response.slice(0, 2000), undefined, settings.voiceLanguage)
          .then(() => {
            if (voiceMode) startRecording()
          })
          .catch(() => {})
      }

      // Extract conversation memory in background
      extractMemoryInBackground(
        effectiveUserId,
        effectiveConvId,
        aiMsg,
        userMsg,
        settings.selectedModelId,
        fallbackKey,
        callAI,
        activeBranchId,
      ).catch(() => {})

      // Auto-name conversation on first message
      if (visibleMessages.length === 0) {
        let cleanTitle = ""
        try {
          const titlePrompt = `Generate a short title (max 20 chars) for this conversation based on the user's message. Reply with ONLY the title, no quotes, no explanation.\n\nUser: "${sanitized.slice(0, 200)}"`
          const title = await callAI(
            [{ role: "user", content: titlePrompt }],
            settings.selectedModelId,
            fallbackKey,
            0,
            30,
            "Output only a short title. No quotes. No explanation.",
          )
          cleanTitle = title
            .trim()
            .replace(/^["']|["']$/g, "")
            .slice(0, 25)
        } catch {
          // AI naming failed — fallback to first few words of user message
          cleanTitle = sanitized.slice(0, 20).trim()
          if (cleanTitle.length >= 20) cleanTitle = cleanTitle.slice(0, 18) + "…"
        }
        if (cleanTitle) {
          window.dispatchEvent(
            new CustomEvent("rename-chat", {
              detail: { chatId: effectiveConvId, title: cleanTitle },
            }),
          )
        }
      }

      // Auto-add substantial responses to Memory Map
      if (shouldAutoAddToMemory(response)) {
        try {
          const category = guessCategory(response)
          persistMemoryNode(effectiveUserId, response, category, conversationId)
        } catch {
          // Silently fail for auto-add — user did not explicitly request it
        }
      }
    } catch (err: any) {
      setIsTyping(false)
      if (err.name === "AbortError") return
      const errMsg: Message = {
        id: `m${Date.now() + 1}`,
        role: "assistant",
        content: `**${lang === "en" ? "Error" : "發生錯誤"}**\n\n${err.message}\n\n${lang === "en" ? "Please check your API key or try again later." : "請檢查您的 API Key 是否正確，或稍後再試。"}`,
        timestamp: new Date().toLocaleTimeString("zh-TW", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        model: settings.selectedModelId,
        branchId: activeBranchId,
      }
      setAllMessages((prev) => [...prev, errMsg])
      toast.error(t("chat.apiFailed", lang))
    } finally {
      abortRef.current = null
    }
  }

  // Keep ref to handleSend for voice mode drag-to-send
  handleSendRef.current = handleSend

  // Hand gesture recognition hook
  const {
    gestureState,
    videoRef: gestureVideoRef,
    isModelLoading: gestureModelLoading,
    modelLoadError: gestureModelError,
    handLandmarks: _handLandmarks,
    cameraActive: gestureCameraActive,
    isPiP: gestureIsPiP,
    pipSupported: gesturePiPSupported,
    popOutPiP: gesturePopOut,
    popInPiP: gesturePopIn,
  } = useHandGesture({
    enabled: handGestureMode,
    onGrabStart: startRecording,
    onPushSend: () => {
      stopRecording()
      setTimeout(() => handleSendRef.current?.(), 1500)
    },
    onThrowDiscard: () => {
      discardRecordingRef.current = true
      stopRecording()
      setInput("")
      setLiveTranscript("")
    },
    onRelease: stopRecording,
  })

  // Auto-disable on model load error
  useEffect(() => {
    if (gestureModelError && handGestureMode) {
      toast.error(gestureModelError)
      setHandGestureMode(false)
    }
  }, [gestureModelError, handGestureMode])

  const handleStop = () => {
    abortRef.current?.abort()
    setIsTyping(false)
    toast.info(t("chat.stopped", lang))
  }

  const handleRegenerate = async (msgIndex: number) => {
    // Find the last user message before this AI message in visible messages
    const precedingMessages = visibleMessages.slice(0, msgIndex)
    const lastUserIdx = precedingMessages.findLastIndex(
      (m) => m.role === "user",
    )
    if (lastUserIdx === -1) return

    // Remove the AI message from unified store
    const targetMsg = visibleMessages[msgIndex]
    if (targetMsg) {
      setAllMessages((prev) => prev.filter((m) => m.id !== targetMsg.id))
    }
    setIsTyping(true)

    if (!canSend) {
      setTimeout(() => {
        setIsTyping(false)
        toast.error(
          lang === "en"
            ? "API key required to regenerate."
            : "需要 API Key 才能重新生成",
        )
      }, 500)
      return
    }

    const effectiveSystemPrompt = settings.systemPrompt
      ? `${DEFAULT_SYSTEM_PROMPT}\n\nUser's additional instructions:\n${settings.systemPrompt}`
      : DEFAULT_SYSTEM_PROMPT

    // Build user profile context for regeneration
    let userProfileContext = ""
    const regenProfile = settings.userProfile
    if (regenProfile) {
      const parts: string[] = []
      if (regenProfile.displayName)
        parts.push(
          `The user's name is "${regenProfile.displayName}". Address them by name when appropriate.`,
        )
      if (regenProfile.role)
        parts.push(`The user's role: ${regenProfile.role}`)
      if (regenProfile.bio)
        parts.push(`About the user: ${regenProfile.bio}`)
      if (regenProfile.customInstructions)
        parts.push(
          `User's custom instructions: ${regenProfile.customInstructions}`,
        )
      if (parts.length > 0) {
        userProfileContext =
          "\n\n--- User Profile ---\n" +
          parts.join("\n") +
          "\n--- End User Profile ---"
      }
    }

    // Include pinned context in regeneration too
    let pinnedContext = ""
    try {
      const pins = loadUserData<any[]>(
        effectiveUserId,
        "context-pins",
        [],
      )
      const activePromptPins = pins.filter(
        (p: any) =>
          p.enabled &&
          p.useAsPrompt &&
          (p.scope === "global" ||
            p.scope === "project" ||
            (p.scope === "conversation" &&
              p.conversationId === conversationId)),
      )
      if (activePromptPins.length > 0) {
        pinnedContext =
          "\n\n--- Pinned Context ---\n" +
          activePromptPins
            .map(
              (p: any) => `[${p.scope}/${p.type}] ${p.title}:\n${p.condensed || p.content}`,
            )
            .join("\n\n")
      }
    } catch {
      // Ignore pin loading errors
    }

    const pinnedTokenEstimate = Math.ceil(pinnedContext.length / 4)
    if (pinnedTokenEstimate > 0) {
      console.log(
        `[ChatInterface] Regen pinned context: ~${pinnedTokenEstimate} tokens`,
      )
    }

    const COMPACT_SYSTEM_PROMPT = `You are an AI assistant in AI Workbench. Be concise and helpful. Use Markdown. Generate complete code in fenced blocks when asked. Support the user's language.`

    const systemBase =
      effectiveSystemPrompt.length + pinnedContext.length > 6000
        ? settings.systemPrompt
          ? `${COMPACT_SYSTEM_PROMPT}\n\n${settings.systemPrompt}`
          : COMPACT_SYSTEM_PROMPT
        : effectiveSystemPrompt
    const folderContext = folderPrompt ? `\n\n--- Folder Context ---\n${folderPrompt}` : ""
    const fullSystemPrompt = systemBase + userProfileContext + pinnedContext + folderContext

    try {
      const chatHistory = visibleMessages
        .slice(0, msgIndex)
        .map((m) => ({ role: m.role, content: m.content }))

      // Per-branch temperature override for regen
      const regenBranchData = branchData.branches.find((b: any) => b.id === activeBranchId)
      const regenTemperature = regenBranchData?.temperature ?? settings.temperature

      const response = await callAI(
        chatHistory,
        settings.selectedModelId,
        fallbackKey,
        regenTemperature,
        settings.maxTokens,
        fullSystemPrompt,
      )

      setIsTyping(false)
      const aiMsg: Message = {
        id: `m${Date.now()}`,
        role: "assistant",
        content: response,
        timestamp: new Date().toLocaleTimeString("zh-TW", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        model: settings.selectedModelId,
        branchId: activeBranchId,
      }
      setAllMessages((prev) => [...prev, aiMsg])

      // Extract code blocks for regenerated message too
      extractAndDispatchCodeBlocks(response)
    } catch (err: any) {
      setIsTyping(false)
      toast.error(
        (lang === "en"
          ? "Regeneration failed: "
          : "重新生成失敗：") + err.message,
      )
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const sendWithEnter = settings.sendKey === "enter"
    if (sendWithEnter && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    } else if (
      !sendWithEnter &&
      e.key === "Enter" &&
      (e.ctrlKey || e.metaKey)
    ) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleTextareaInput = (
    e: React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    setInput(e.target.value)
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = "auto"
      ta.style.height = Math.min(ta.scrollHeight, 160) + "px"
    }
  }

  const handleUrlSubmit = () => {
    if (urlInput.trim()) {
      setInput(
        (prev) => prev + (prev ? "\n" : "") + urlInput.trim(),
      )
      setUrlInput("")
      setShowUrlInput(false)
      toast.success(t("chat.urlAdded", lang))
    }
  }

  const messageDensityClass = {
    compact: "space-y-3",
    comfortable: "space-y-6",
    spacious: "space-y-10",
  }[settings.messageDensity]

  const fontSizeClass = {
    small: "text-xs",
    medium: "text-sm",
    large: "text-base",
  }[settings.fontSize]

  // Check if active branch is merged
  const activeBranch = branchData.branches.find((b) => b.id === activeBranchId)
  const isMergedBranch = !!(activeBranch?.mergedInto)
  const mergedIntoName = isMergedBranch
    ? branchData.branches.find((b) => b.id === activeBranch!.mergedInto)?.name || activeBranch!.mergedInto
    : null
  const mergedIntoId = activeBranch?.mergedInto || "main"

  return (
    <div className="flex flex-col h-full">
      {/* Branch indicator — uses the branch's own color */}
      {activeBranchId !== "main" && (() => {
        const bColor = activeBranch?.color || "#67e8f9"
        return (
          <div
            className="mx-6 mt-2 px-3 py-1.5 rounded-lg flex items-center gap-2"
            style={{
              backgroundColor: `color-mix(in srgb, ${bColor} 10%, transparent)`,
              border: `1px solid color-mix(in srgb, ${bColor} 25%, transparent)`,
            }}
          >
            <GitBranch size={12} style={{ color: bColor }} />
            <span className="text-[11px] font-mono" style={{ color: bColor, opacity: 0.85 }}>
              {activeBranch?.name || activeBranchId}
            </span>
            {isMergedBranch && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded"
                style={{
                  color: bColor,
                  opacity: 0.6,
                  backgroundColor: `color-mix(in srgb, ${bColor} 12%, transparent)`,
                }}
              >
                {lang === "en" ? "merged" : "已合併"}
              </span>
            )}
            <button
              onClick={() => setActiveBranchId("main")}
              className="ml-auto text-[10px] transition-opacity hover:opacity-100"
              style={{ color: bColor, opacity: 0.6 }}
            >
              {lang === "en" ? "Back to main" : "返回 main"}
            </button>
          </div>
        )
      })()}

      {/* Merged branch notice — blocks further conversation */}
      {isMergedBranch && (
        <div className="mx-6 mt-2 px-4 py-3 rounded-xl bg-amber-500/[0.07] border border-amber-500/20 flex items-center gap-3">
          <GitBranch size={14} className="text-amber-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-amber-300/80">
              {lang === "en"
                ? `This branch has been merged. Please switch to `
                : `此分支已被合併，請切換至 `}
              <button
                onClick={() => setActiveBranchId(mergedIntoId)}
                className="font-semibold text-amber-300 hover:text-amber-200 underline underline-offset-2 transition-colors"
              >
                {mergedIntoName}
              </button>
              {lang === "en" ? ` to continue the conversation.` : ` 繼續對話。`}
            </p>
          </div>
          <button
            onClick={() => setActiveBranchId(mergedIntoId)}
            className="shrink-0 text-[11px] px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 transition-colors font-medium"
          >
            {lang === "en" ? "Switch" : "點此切換"}
          </button>
        </div>
      )}

      {/* No API Key notice */}
      {!canSend && (
        <div className="mx-6 mt-3 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-2">
          <AlertCircle
            size={14}
            className="text-amber-400 shrink-0"
          />
          <p className="text-xs text-amber-300/80">
            {lang === "en"
              ? `No ${currentProvider?.name} API key set — go to Settings > Models & API to configure.`
              : `尚未設定 ${currentProvider?.name} API Key — 開啟設定 → 模型與 API 來設定。`}
          </p>
        </div>
      )}

      {/* Messages Area */}
      <div
        ref={chatContainerRef}
        className={cn(
          "flex-1 overflow-y-auto px-6 py-6 min-h-0",
          messageDensityClass,
        )}
      >
        {visibleMessages.length === 0 && !isTyping ? (
          <EmptyState lang={lang} onChipClick={handleChipClick} />
        ) : (
          <>
            {visibleMessages.map((msg, i) => (
              <div
                key={msg.id}
                className={cn(
                  settings.enableAnimations && "fade-up",
                )}
                style={
                  settings.enableAnimations
                    ? {
                        animationDelay: `${i * 30}ms`,
                        animationFillMode: "both",
                      }
                    : undefined
                }
              >
                <MessageBubble
                  message={msg}
                  showAvatar={settings.showAvatars}
                  avatarDisplay={settings.avatarDisplay || "both"}
                  userAvatarUrl={user?.avatar}
                  showTimestamp={settings.showTimestamps}
                  onRegenerate={() => handleRegenerate(i)}
                  lang={lang}
                  conversationId={conversationId}
                  effectiveUserId={effectiveUserId}
                  voiceLanguage={settings.voiceLanguage}
                />
              </div>
            ))}
            {isTyping && <TypingIndicator />}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="shrink-0 px-4 pb-4">
        {/* URL Input overlay */}
        {showUrlInput && (
          <div className="mb-2 flex gap-2">
            <input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder={
                lang === "en" ? "Enter URL..." : "輸入網址..."
              }
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white/70 placeholder:text-white/25 focus:outline-none focus:border-blue-500/40"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleUrlSubmit()
                if (e.key === "Escape") setShowUrlInput(false)
              }}
              autoFocus
            />
            <button
              onClick={handleUrlSubmit}
              className="px-3 py-2 rounded-xl bg-blue-600/80 text-white text-xs hover:bg-blue-500 transition-colors"
            >
              {lang === "en" ? "Add" : "加入"}
            </button>
            <button
              onClick={() => setShowUrlInput(false)}
              className="px-3 py-2 rounded-xl bg-white/5 text-white/40 text-xs hover:bg-white/8 transition-colors"
            >
              {lang === "en" ? "Cancel" : "取消"}
            </button>
          </div>
        )}

        {/* Hand gesture mode: camera preview + gesture overlay */}
        {handGestureMode && (
          <div className="relative rounded-2xl border border-violet-500/30 bg-violet-900/10 backdrop-blur-sm shadow-lg shadow-violet-900/20 p-4 flex flex-col items-center gap-3 select-none">
            {/* Close button */}
            <button
              onClick={() => {
                setHandGestureMode(false)
                stopRecording()
                setLiveTranscript("")
              }}
              className="absolute top-2 right-2 p-1 rounded-md text-white/30 hover:text-white/70 hover:bg-white/10 transition-colors z-10"
              title={lang === "en" ? "Close gesture mode" : "關閉手勢模式"}
            >
              <X size={14} />
            </button>
            {liveTranscript && (
              <div className="px-4 py-2 rounded-xl bg-black/40 text-white/80 text-sm max-w-full truncate">
                {liveTranscript}
              </div>
            )}
            <HandGestureOverlay
              videoRef={gestureVideoRef}
              gestureState={gestureState}
              isModelLoading={gestureModelLoading}
              modelLoadError={gestureModelError}
              audioLevel={audioLevel}
              cameraActive={gestureCameraActive}
              lang={lang}
              isPiP={gestureIsPiP}
              pipSupported={gesturePiPSupported}
              onPopOut={gesturePopOut}
              onPopIn={gesturePopIn}
            />
          </div>
        )}

        {/* Voice mode: press-and-hold overlay */}
        {voiceMode && !handGestureMode && (
          <div className="rounded-2xl border border-violet-500/30 bg-violet-900/10 backdrop-blur-sm shadow-lg shadow-violet-900/20 p-4 flex flex-col items-center gap-3 select-none">
            {/* Live transcript floating above */}
            {liveTranscript && (
              <div className="px-4 py-2 rounded-xl bg-black/40 text-white/80 text-sm max-w-full truncate">
                {liveTranscript}
              </div>
            )}

            {/* Drag direction hints */}
            <div className="flex items-center gap-6 text-[10px] text-white/30">
              <span className={cn(voiceDragState.direction === "left" && "text-blue-400 font-bold")}>
                ← {lang === "en" ? "Edit" : "編輯"}
              </span>
              <span className={cn(voiceDragState.direction === "up" && "text-emerald-400 font-bold")}>
                ↑ {lang === "en" ? "Send" : "發送"}
              </span>
              <span className={cn(voiceDragState.direction === "right" && "text-red-400 font-bold")}>
                {lang === "en" ? "Close" : "關閉"} →
              </span>
            </div>

            {/* Press-and-hold button */}
            <div
              className="relative"
              onPointerDown={(e) => {
                e.preventDefault()
                ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
                handleVoiceDragStart(e.clientX, e.clientY)
              }}
              onPointerMove={(e) => handleVoiceDragMove(e.clientX, e.clientY)}
              onPointerUp={() => handleVoiceDragEnd()}
              onPointerCancel={() => handleVoiceDragEnd()}
            >
              {/* Audio level ring */}
              <div
                className="absolute inset-0 rounded-full border-2 border-violet-400/40 pointer-events-none"
                style={{
                  transform: `scale(${1 + audioLevel * 0.8})`,
                  opacity: 0.3 + audioLevel * 0.7,
                  transition: "transform 0.08s, opacity 0.08s",
                }}
              />
              <div
                className="absolute inset-0 rounded-full border border-violet-300/20 pointer-events-none"
                style={{
                  transform: `scale(${1 + audioLevel * 1.3})`,
                  opacity: audioLevel * 0.4,
                  transition: "transform 0.1s, opacity 0.1s",
                }}
              />
              <button
                className={cn(
                  "relative z-10 w-16 h-16 rounded-full flex items-center justify-center transition-all",
                  voiceDragState.active
                    ? "bg-violet-500/40 scale-110"
                    : "bg-violet-500/20 hover:bg-violet-500/30",
                  voiceDragState.direction === "up" && "bg-emerald-500/30",
                  voiceDragState.direction === "left" && "bg-blue-500/30",
                  voiceDragState.direction === "right" && "bg-red-500/30",
                )}
              >
                <Volume2 size={24} className={cn(
                  "text-violet-300",
                  voiceDragState.direction === "up" && "text-emerald-300",
                  voiceDragState.direction === "left" && "text-blue-300",
                  voiceDragState.direction === "right" && "text-red-300",
                )} />
              </button>
            </div>

            <p className="text-[10px] text-white/25">
              {lang === "en" ? "Hold and drag to act" : "按住拖動操作"}
            </p>
          </div>
        )}

        {/* Normal input area — hidden in voice mode */}
        <div
          className={cn(
            "relative rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm",
            "focus-within:border-blue-500/40 focus-within:bg-white/7 transition-all duration-200",
            "shadow-lg shadow-black/20",
            (voiceMode || handGestureMode) && "hidden",
          )}
        >
          {/* Attachment Menu */}
          {showAttachMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowAttachMenu(false)}
              />
              <div className="absolute bottom-full left-0 mb-2 flex gap-2 p-2 rounded-xl bg-[oklch(0.12_0.015_265)] border border-white/10 shadow-xl z-20">
                {[
                  {
                    icon: <FileText size={14} />,
                    label: "PDF",
                    accept: ".pdf",
                    color: "text-red-400",
                  },
                  {
                    icon: <ImageIcon size={14} />,
                    label:
                      lang === "en" ? "Image" : "圖片",
                    accept: "image/*",
                    color: "text-green-400",
                  },
                  {
                    icon: <Code2 size={14} />,
                    label:
                      lang === "en"
                        ? "Code"
                        : "程式碼",
                    accept:
                      ".js,.ts,.tsx,.jsx,.py,.go,.rs,.cpp,.c,.java",
                    color: "text-blue-400",
                  },
                ].map((item) => (
                  <button
                    key={item.label}
                    className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg hover:bg-white/8 transition-colors"
                    onClick={() => {
                      setShowAttachMenu(false)
                      const fileInput =
                        document.createElement("input")
                      fileInput.type = "file"
                      fileInput.accept = item.accept
                      fileInput.onchange = (ev) => {
                        const file = (
                          ev.target as HTMLInputElement
                        ).files?.[0]
                        if (file) {
                          if (item.accept === "image/*") {
                            // Image upload → base64 for vision
                            handleImageUpload(file)
                          } else {
                            toast.success(
                              lang === "en"
                                ? `Selected: ${file.name}`
                                : `已選取：${file.name}`,
                            )
                            // Read text files and append to input
                            const reader = new FileReader()
                            reader.onload = () => {
                              const content =
                                reader.result as string
                              setInput(
                                (prev) =>
                                  prev +
                                  `\n\n[${lang === "en" ? "Attachment" : "附件"}: ${file.name}]\n\`\`\`\n${content.slice(0, 4000)}\n\`\`\``,
                              )
                            }
                            reader.readAsText(file)
                          }
                        }
                      }
                      fileInput.click()
                    }}
                  >
                    <span className={item.color}>
                      {item.icon}
                    </span>
                    <span className="text-[10px] text-white/50">
                      {item.label}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Pending image preview */}
          {pendingImage && (
            <div className="px-3 pt-3 flex items-start gap-2">
              <div className="relative">
                <img
                  src={pendingImage.preview}
                  alt="Preview"
                  className="w-20 h-20 object-cover rounded-lg border border-white/10"
                />
                <button
                  onClick={() => setPendingImage(null)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500/90 flex items-center justify-center text-white hover:bg-red-400 transition-colors"
                >
                  <X size={10} />
                </button>
              </div>
              <span className="text-[10px] text-white/30 mt-1">
                {lang === "en" ? "Image attached" : "已附加圖片"}
              </span>
            </div>
          )}

          <div className="flex items-end gap-2 p-3">
            <button
              onClick={() =>
                setShowAttachMenu((prev) => !prev)
              }
              className={cn(
                "p-2 rounded-xl transition-all duration-150 shrink-0",
                showAttachMenu
                  ? "bg-blue-600/20 text-blue-400"
                  : "text-white/30 hover:text-white/60 hover:bg-white/8",
              )}
            >
              <Plus size={16} />
            </button>

            <button
              onClick={() =>
                setShowUrlInput((prev) => !prev)
              }
              className={cn(
                "p-2 rounded-xl transition-all duration-150 shrink-0",
                showUrlInput
                  ? "bg-blue-600/20 text-blue-400"
                  : "text-white/30 hover:text-white/60 hover:bg-white/8",
              )}
            >
              <Link2 size={16} />
            </button>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleTextareaInput}
              onKeyDown={handleKeyDown}
              maxLength={4096}
              disabled={isMergedBranch}
              placeholder={
                isMergedBranch
                  ? (lang === "en"
                    ? "This branch has been merged — switch to continue"
                    : "此分支已合併 — 請切換分支以繼續對話")
                  : settings.sendKey === "enter"
                    ? t("chat.inputPlaceholder_enter", lang)
                    : t("chat.inputPlaceholder_ctrl", lang)
              }
              rows={1}
              className={cn(
                "flex-1 bg-transparent placeholder:text-white/25 resize-none focus:outline-none leading-relaxed py-1 min-h-[28px] max-h-40",
                fontSizeClass,
                isMergedBranch ? "text-white/30 cursor-not-allowed" : "text-white/85",
              )}
            />

            <button
              onClick={onArtifactOpen}
              className="p-2 rounded-xl text-white/30 hover:text-violet-400 hover:bg-violet-600/10 transition-all duration-150 shrink-0"
              title={
                lang === "en"
                  ? "Open Artifacts panel"
                  : "開啟 Artifacts 面板"
              }
            >
              <Code2 size={16} />
            </button>

            {/* Mic button with audio level ring */}
            <div className="relative shrink-0">
              {isRecording && (
                <div
                  className="absolute inset-0 rounded-xl border-2 border-blue-400/60 pointer-events-none"
                  style={{
                    transform: `scale(${1 + audioLevel * 0.5})`,
                    opacity: 0.4 + audioLevel * 0.6,
                    transition: "transform 0.1s, opacity 0.1s",
                  }}
                />
              )}
              <button
                onClick={isRecording ? stopRecording : startRecording}
                className={cn(
                  "p-2 rounded-xl transition-all duration-150 relative z-10",
                  isRecording
                    ? "bg-blue-500/20 text-blue-400"
                    : "text-white/30 hover:text-white/60 hover:bg-white/8",
                )}
                title={
                  isRecording
                    ? (lang === "en" ? "Stop recording" : "停止錄音")
                    : (lang === "en" ? "Voice input" : "語音輸入")
                }
              >
                <Mic size={16} />
              </button>
            </div>

            {/* Voice conversation mode toggle */}
            <button
              onClick={() => {
                setVoiceMode(prev => !prev)
                if (!voiceMode) {
                  setHandGestureMode(false) // mutual exclusion
                  toast.info(
                    lang === "en"
                      ? "Voice mode ON — press and hold the button to speak"
                      : "語音對話模式 ON — 按住按鈕說話",
                    { duration: 3000 },
                  )
                } else {
                  stopRecording()
                  window.speechSynthesis?.cancel()
                  setLiveTranscript("")
                }
              }}
              className={cn(
                "p-2 rounded-xl transition-all duration-150 shrink-0",
                voiceMode
                  ? "bg-violet-500/20 text-violet-400"
                  : "text-white/30 hover:text-white/60 hover:bg-white/8",
              )}
              title={lang === "en" ? "Voice conversation mode" : "語音對話模式"}
            >
              <Volume2 size={16} />
            </button>

            {/* Hand gesture mode toggle */}
            <button
              onClick={() => {
                const turningOn = !handGestureMode
                setHandGestureMode(turningOn)
                if (turningOn) {
                  setVoiceMode(false) // mutual exclusion
                  stopRecording()
                  toast.info(
                    lang === "en"
                      ? "Gesture mode ON — show palm, then make fist to record"
                      : "手勢模式 ON — 伸出手掌，握拳開始錄音",
                    { duration: 3000 },
                  )
                } else {
                  stopRecording()
                  setLiveTranscript("")
                }
              }}
              className={cn(
                "p-2 rounded-xl transition-all duration-150 shrink-0",
                handGestureMode
                  ? "bg-amber-500/20 text-amber-400"
                  : "text-white/30 hover:text-white/60 hover:bg-white/8",
              )}
              title={lang === "en" ? "Hand gesture mode" : "手勢控制模式"}
            >
              <Hand size={16} />
            </button>

            {isTyping ? (
              <button
                onClick={handleStop}
                className="p-2 rounded-xl bg-red-600/80 hover:bg-red-500 text-white shadow-lg transition-all duration-150 shrink-0"
              >
                <StopCircle size={16} />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim() && !pendingImage}
                className={cn(
                  "p-2 rounded-xl transition-all duration-150 shrink-0",
                  input.trim() || pendingImage
                    ? "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/40"
                    : "text-white/20 bg-white/5 cursor-not-allowed",
                )}
              >
                <Send size={16} />
              </button>
            )}
          </div>

          <div className="px-4 pb-2 flex items-center justify-between">
            <span className="text-[10px] text-white/20">
              {settings.sendKey === "enter"
                ? t("chat.sendHint_enter", lang)
                : t("chat.sendHint_ctrl", lang)}
            </span>
            <span className="text-[10px] text-white/20">
              {input.length}/4096
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
