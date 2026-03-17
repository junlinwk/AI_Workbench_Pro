/**
 * ArtifactsPanel Component — Void Glass Design System
 * Right-side canvas panel with Code editor + Live Preview tabs
 *
 * Empty by default — populated when AI generates code blocks.
 * Listens for CustomEvent('artifact-update') dispatched by ChatInterface.
 */
import { useState, useEffect } from "react"
import {
  Code2,
  Eye,
  Copy,
  Download,
  Maximize2,
  X,
  Check,
  FileCode,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Plus,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Streamdown } from "streamdown"
import { useSettings } from "@/contexts/SettingsContext"
import { useAuth } from "@/contexts/AuthContext"
import { loadUserData, saveUserData } from "@/lib/storage"
import { t } from "@/i18n"

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface Artifact {
  id: string
  filename: string
  language: string
  code: string
  createdAt: string
}

/* ------------------------------------------------------------------ */
/*  Code line syntax highlighting                                      */
/* ------------------------------------------------------------------ */

function CodeLine({
  line,
  lineNum,
}: {
  line: string
  lineNum: number
}) {
  const tokenize = (text: string) => {
    const tokens: { type: string; value: string }[] = []
    const patterns: [RegExp, string][] = [
      [
        /^(import|export|from|const|let|var|function|return|default|if|else|class|new|typeof|useState|useEffect|async|await|for|while|switch|case|break|continue|try|catch|throw|interface|type|enum)\b/,
        "keyword",
      ],
      [/^(['"`])(?:(?!\1)[^\\]|\\.)*\1/, "string"],
      [/^\/\/.*/, "comment"],
      [/^[{}[\]().,;:<>=+\-*/%!&|?@#]/, "punctuation"],
      [/^\d+(\.\d+)?/, "number"],
      [/^[a-zA-Z_$][a-zA-Z0-9_$]*/, "identifier"],
      [/^\s+/, "whitespace"],
    ]
    let remaining = text
    while (remaining.length > 0) {
      let matched = false
      for (const [pattern, type] of patterns) {
        const m = remaining.match(pattern)
        if (m) {
          tokens.push({ type, value: m[0] })
          remaining = remaining.slice(m[0].length)
          matched = true
          break
        }
      }
      if (!matched) {
        tokens.push({ type: "other", value: remaining[0] })
        remaining = remaining.slice(1)
      }
    }
    return tokens
  }

  const colorMap: Record<string, string> = {
    keyword: "text-violet-400",
    string: "text-emerald-400",
    comment: "text-white/30 italic",
    punctuation: "text-white/50",
    number: "text-orange-400",
    identifier: "text-blue-300",
    whitespace: "",
    other: "text-white/70",
  }

  return (
    <div className="flex hover:bg-white/3 group">
      <span className="w-10 shrink-0 text-right pr-4 text-white/20 select-none text-xs leading-6 group-hover:text-white/35">
        {lineNum}
      </span>
      <span className="flex-1 text-xs leading-6 font-mono whitespace-pre">
        {tokenize(line).map((token, i) => (
          <span
            key={i}
            className={colorMap[token.type] || "text-white/70"}
          >
            {token.value}
          </span>
        ))}
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Language badge helpers                                             */
/* ------------------------------------------------------------------ */

function langBadge(lang: string): {
  label: string
  color: string
  bgColor: string
} {
  const map: Record<
    string,
    { label: string; color: string; bgColor: string }
  > = {
    tsx: {
      label: "TSX",
      color: "text-blue-400",
      bgColor: "bg-blue-600/15 border-blue-500/20",
    },
    typescript: {
      label: "TS",
      color: "text-blue-400",
      bgColor: "bg-blue-600/15 border-blue-500/20",
    },
    ts: {
      label: "TS",
      color: "text-blue-400",
      bgColor: "bg-blue-600/15 border-blue-500/20",
    },
    javascript: {
      label: "JS",
      color: "text-yellow-400",
      bgColor: "bg-yellow-600/15 border-yellow-500/20",
    },
    js: {
      label: "JS",
      color: "text-yellow-400",
      bgColor: "bg-yellow-600/15 border-yellow-500/20",
    },
    jsx: {
      label: "JSX",
      color: "text-yellow-400",
      bgColor: "bg-yellow-600/15 border-yellow-500/20",
    },
    python: {
      label: "PY",
      color: "text-green-400",
      bgColor: "bg-green-600/15 border-green-500/20",
    },
    py: {
      label: "PY",
      color: "text-green-400",
      bgColor: "bg-green-600/15 border-green-500/20",
    },
    html: {
      label: "HTML",
      color: "text-orange-400",
      bgColor: "bg-orange-600/15 border-orange-500/20",
    },
    css: {
      label: "CSS",
      color: "text-pink-400",
      bgColor: "bg-pink-600/15 border-pink-500/20",
    },
    json: {
      label: "JSON",
      color: "text-white/60",
      bgColor: "bg-white/10 border-white/15",
    },
    sql: {
      label: "SQL",
      color: "text-cyan-400",
      bgColor: "bg-cyan-600/15 border-cyan-500/20",
    },
    rust: {
      label: "RS",
      color: "text-orange-400",
      bgColor: "bg-orange-600/15 border-orange-500/20",
    },
    go: {
      label: "GO",
      color: "text-cyan-400",
      bgColor: "bg-cyan-600/15 border-cyan-500/20",
    },
    markdown: {
      label: "MD",
      color: "text-violet-400",
      bgColor: "bg-violet-600/15 border-violet-500/20",
    },
    md: {
      label: "MD",
      color: "text-violet-400",
      bgColor: "bg-violet-600/15 border-violet-500/20",
    },
  }
  return (
    map[lang.toLowerCase()] || {
      label: lang.toUpperCase().slice(0, 4),
      color: "text-white/50",
      bgColor: "bg-white/8 border-white/12",
    }
  )
}

function filenameFromLang(lang: string, index: number): string {
  const ext: Record<string, string> = {
    tsx: "tsx",
    typescript: "ts",
    ts: "ts",
    javascript: "js",
    js: "js",
    jsx: "jsx",
    python: "py",
    py: "py",
    html: "html",
    css: "css",
    json: "json",
    sql: "sql",
    rust: "rs",
    go: "go",
    java: "java",
    cpp: "cpp",
    c: "c",
  }
  const e = ext[lang.toLowerCase()] || lang.toLowerCase() || "txt"
  return `artifact_${index + 1}.${e}`
}

/* ------------------------------------------------------------------ */
/*  Empty state                                                        */
/* ------------------------------------------------------------------ */

function EmptyArtifacts({ lang }: { lang: "zh-TW" | "en" }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 px-6">
      <div className="w-14 h-14 rounded-2xl border border-white/10 bg-white/[0.03] flex items-center justify-center">
        <Code2 size={24} className="text-white/20" />
      </div>
      <div className="text-center space-y-1.5">
        <p className="text-sm font-medium text-white/50">
          {lang === "en" ? "No Artifacts Yet" : "尚無 Artifacts"}
        </p>
        <p className="text-xs text-white/30 max-w-[260px] leading-relaxed">
          {lang === "en"
            ? "When AI generates code in a conversation, it will appear here for editing and preview."
            : "當 AI 在對話中產生程式碼時，會顯示在此處供編輯與預覽。"}
        </p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

interface ArtifactsPanelProps {
  onClose?: () => void
  /** Filter artifacts by source — only accept events from this source */
  source?: "chat" | "widget"
}

export default function ArtifactsPanel({
  onClose,
  source,
}: ArtifactsPanelProps) {
  const { settings } = useSettings()
  const lang = settings.language
  const { user } = useAuth()
  const userId = user?.id ?? "anonymous"

  const [artifacts, setArtifacts] = useState<Artifact[]>(() =>
    loadUserData<Artifact[]>(userId, "artifacts", []),
  )
  const [activeIndex, setActiveIndex] = useState(0)
  const [activeTab, setActiveTab] = useState<"code" | "preview">(
    "code",
  )
  const [copied, setCopied] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  /* ---- Listen for artifact-update events from ChatInterface ---- */
  useEffect(() => {
    function handleArtifactUpdate(e: Event) {
      const detail = (e as CustomEvent).detail
      if (!detail) return
      // Filter by source: only accept events matching the panel's source
      const eventSource = (detail as any).source as string | undefined
      if (source && eventSource && eventSource !== source) return
      const { code, language, filename } = detail as {
        code: string
        language: string
        filename?: string
      }
      const newArtifact: Artifact = {
        id: `art-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        filename:
          filename ||
          filenameFromLang(
            language,
            artifacts.length,
          ),
        language: language || "text",
        code,
        createdAt: new Date().toISOString(),
      }
      setArtifacts((prev) => {
        const next = [...prev, newArtifact]
        setActiveIndex(next.length - 1)
        return next
      })
      const lang_lower = (language || "").toLowerCase()
      if (lang_lower === "html" || lang_lower === "css" || lang_lower === "markdown" || lang_lower === "md") {
        setActiveTab("preview")
      } else {
        setActiveTab("code")
      }
    }

    window.addEventListener("artifact-update", handleArtifactUpdate)
    return () =>
      window.removeEventListener(
        "artifact-update",
        handleArtifactUpdate,
      )
  }, [artifacts.length])

  /* ---- Persist artifacts to localStorage ---- */
  useEffect(() => {
    saveUserData(userId, "artifacts", artifacts)
  }, [artifacts, userId])

  const current = artifacts[activeIndex]

  const handleCopy = () => {
    if (!current) return
    navigator.clipboard.writeText(current.code)
    setCopied(true)
    toast.success(
      lang === "en" ? "Copied to clipboard" : "已複製到剪貼簿",
    )
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    if (!current) return
    const blob = new Blob([current.code], {
      type: "text/plain;charset=utf-8",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = current.filename
    a.click()
    URL.revokeObjectURL(url)
    toast.success(
      lang === "en" ? "File downloaded" : "檔案已下載",
    )
  }

  const handleRemoveArtifact = (index: number) => {
    setArtifacts((prev) => prev.filter((_, i) => i !== index))
    if (activeIndex >= artifacts.length - 1) {
      setActiveIndex(Math.max(0, artifacts.length - 2))
    }
  }

  /* ---- Drop handler for notepad tabs ---- */
  const handleArtifactDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "copy"
  }

  const handleArtifactDrop = (e: React.DragEvent) => {
    e.preventDefault()
    try {
      const raw = e.dataTransfer.getData("application/json")
      if (!raw) return
      const data = JSON.parse(raw)
      if (data.type === "notepad-tab") {
        const newArtifact: Artifact = {
          id: `art-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          filename: `${data.title}.md`,
          language: "markdown",
          code: data.content,
          createdAt: new Date().toISOString(),
        }
        setArtifacts((prev) => {
          const next = [...prev, newArtifact]
          setActiveIndex(next.length - 1)
          return next
        })
        setActiveTab("preview")
        toast.success(
          lang === "en"
            ? `Added "${data.title}" as artifact`
            : `已新增「${data.title}」為 artifact`,
        )
      }
    } catch {
      /* not valid JSON — ignore */
    }
  }

  /* ---- Empty state ---- */
  if (artifacts.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col h-full border-l border-white/[0.06] bg-[oklch(0.10_0.015_265)]",
          isFullscreen && "fixed inset-0 z-50 border-l-0",
        )}
        onDragOver={handleArtifactDragOver}
        onDrop={handleArtifactDrop}
      >
        <div className="flex items-center gap-2 px-4 h-14 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2 flex-1">
            <Code2 size={14} className="text-white/40" />
            <span className="text-sm font-medium text-white/50">
              Artifacts
            </span>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <EmptyArtifacts lang={lang} />
      </div>
    )
  }

  const badge = langBadge(current?.language || "text")
  const codeLines = current ? current.code.split("\n") : []

  return (
    <div
      className={cn(
        "flex flex-col h-full border-l border-white/[0.06] bg-[oklch(0.10_0.015_265)]",
        isFullscreen && "fixed inset-0 z-50 border-l-0",
      )}
      onDragOver={handleArtifactDragOver}
      onDrop={handleArtifactDrop}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 h-14 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-5 h-5 rounded-md bg-blue-600/20 border border-blue-500/20 flex items-center justify-center">
            <FileCode size={11} className="text-blue-400" />
          </div>
          <span className="text-sm font-medium text-white/80 truncate">
            {current?.filename}
          </span>
          <span
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-md border shrink-0",
              badge.color,
              badge.bgColor,
            )}
          >
            {badge.label}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors text-xs"
          >
            {copied ? (
              <Check size={12} className="text-emerald-400" />
            ) : (
              <Copy size={12} />
            )}
            <span>
              {copied
                ? lang === "en"
                  ? "Copied"
                  : "已複製"
                : lang === "en"
                  ? "Copy"
                  : "複製"}
            </span>
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors text-xs"
          >
            <Download size={12} />
            <span>{lang === "en" ? "Download" : "下載"}</span>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Artifact tabs (when multiple) */}
      {artifacts.length > 1 && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-white/[0.06] shrink-0 overflow-x-auto">
          {artifacts.map((art, i) => (
            <div
              key={art.id}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-md text-[11px] cursor-pointer transition-all group shrink-0",
                i === activeIndex
                  ? "bg-blue-600/15 text-blue-300 border border-blue-500/20"
                  : "text-white/40 hover:text-white/60 hover:bg-white/5 border border-transparent",
              )}
              onClick={() => setActiveIndex(i)}
            >
              <span className="truncate max-w-[100px]">
                {art.filename}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleRemoveArtifact(i)
                }}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-500/15 text-white/30 hover:text-red-400 transition-all"
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Code / Preview tabs */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-white/[0.06] shrink-0">
        {(
          [
            {
              id: "code" as const,
              label: lang === "en" ? "Code" : "程式碼",
              icon: <Code2 size={12} />,
            },
            {
              id: "preview" as const,
              label: lang === "en" ? "Preview" : "預覽",
              icon: <Eye size={12} />,
            },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150",
              activeTab === tab.id
                ? "bg-blue-600/20 text-blue-300 border border-blue-500/20"
                : "text-white/40 hover:text-white/60 hover:bg-white/5",
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => setIsFullscreen((prev) => !prev)}
          className="p-1.5 rounded-lg text-white/25 hover:text-white/50 hover:bg-white/5 transition-colors"
        >
          {isFullscreen ? (
            <X size={12} />
          ) : (
            <Maximize2 size={12} />
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden min-h-0">
        {activeTab === "code" ? (
          <div className="h-full overflow-y-auto py-3 pr-2">
            {codeLines.map((line, i) => (
              <CodeLine key={i} line={line} lineNum={i + 1} />
            ))}
          </div>
        ) : (
          <div className="h-full overflow-y-auto p-4">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              {(current?.language === "markdown" ||
                current?.language === "md") ? (
                <div className="prose prose-invert prose-sm max-w-none
                  prose-headings:text-white/90 prose-headings:font-semibold
                  prose-p:text-white/75 prose-p:leading-relaxed
                  prose-code:text-blue-300 prose-code:bg-blue-900/30 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
                  prose-pre:bg-[oklch(0.10_0.015_265)] prose-pre:border prose-pre:border-white/8 prose-pre:rounded-xl
                  prose-strong:text-white/90
                  prose-blockquote:border-l-blue-500/50 prose-blockquote:text-white/60
                  prose-li:text-white/75
                  prose-table:border-collapse
                  prose-th:border prose-th:border-white/15 prose-th:px-3 prose-th:py-2 prose-th:text-white/80 prose-th:bg-white/5
                  prose-td:border prose-td:border-white/10 prose-td:px-3 prose-td:py-2 prose-td:text-white/65
                ">
                  <Streamdown>{current.code}</Streamdown>
                </div>
              ) : (current?.language === "html" ||
                current?.language === "css") ? (
                <>
                  <p className="text-xs text-white/40 mb-3">
                    {lang === "en"
                      ? "Preview is available for HTML/CSS artifacts. For other languages, use the code view."
                      : "預覽功能適用於 HTML/CSS artifacts。其他語言請使用程式碼檢視。"}
                  </p>
                  <iframe
                    srcDoc={current.code}
                    className="w-full h-[400px] rounded-lg border border-white/10 bg-white"
                    sandbox="allow-scripts"
                    referrerPolicy="no-referrer"
                    title="Preview"
                  />
                </>
              ) : (
                <>
                  <p className="text-xs text-white/40 mb-3">
                    {lang === "en"
                      ? "Preview is available for HTML/CSS artifacts. For other languages, use the code view."
                      : "預覽功能適用於 HTML/CSS artifacts。其他語言請使用程式碼檢視。"}
                  </p>
                  <pre className="text-xs text-white/60 font-mono whitespace-pre-wrap overflow-auto max-h-[400px] p-3 rounded-lg bg-[oklch(0.08_0.015_265)] border border-white/8">
                    {current?.code}
                  </pre>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 px-4 py-2 border-t border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span className="text-[10px] text-white/30">
            {lang === "en"
              ? `${artifacts.length} artifact${artifacts.length !== 1 ? "s" : ""}`
              : `${artifacts.length} 個 artifact`}
          </span>
        </div>
        <span className="text-[10px] text-white/25 font-mono">
          {codeLines.length}{" "}
          {lang === "en" ? "lines" : "行"}
        </span>
      </div>
    </div>
  )
}
