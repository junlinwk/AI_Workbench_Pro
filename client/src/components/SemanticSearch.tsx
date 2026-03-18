/**
 * SemanticSearch — Semantic Search with Highlighting & Jump
 * Void Glass Design System
 * Full-text search interface with fuzzy matching, keyword highlighting,
 * preview panel with breathing glow, and jump-to navigation
 */
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useSettings } from "@/contexts/SettingsContext";
import { useAuth } from "@/contexts/AuthContext";
import { listUserDataByPattern } from "@/lib/storage";
import {
  Search,
  X,
  MessageSquare,
  Code2,
  ArrowRight,
  Clock,
  Tag,
  ChevronRight,
  Sparkles,
  FileText,
  Zap,
  ExternalLink,
  Database,
} from "lucide-react";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ResultType = "chat" | "code" | "data" | "file";
type FilterKey = "all" | "code" | "conversations" | "files";
type SortKey = "relevance" | "date" | "type";

interface SearchEntry {
  id: string;
  title: string;
  date: string;
  type: ResultType;
  content: string;
  language?: string;
  tags: string[];
}

interface ScoredResult extends SearchEntry {
  score: number;
  matchedTerms: string[];
}

/* ------------------------------------------------------------------ */
/*  Empty search database — real conversations are loaded dynamically  */
/* ------------------------------------------------------------------ */

const SEARCH_DATABASE: SearchEntry[] = [
];

/* ------------------------------------------------------------------ */
/*  Semantic expansion map — broader matching when semantic mode on    */
/* ------------------------------------------------------------------ */

const SEMANTIC_EXPANSION: Record<string, string[]> = {
  // English expansions
  optimize: ["performance", "efficiency", "speed", "fast", "improve", "cache", "memo"],
  performance: ["optimize", "efficiency", "speed", "fast", "improve", "cache"],
  memory: ["allocation", "heap", "stack", "pool", "RAII", "leak", "garbage"],
  architecture: ["design", "pattern", "structure", "microservices", "system"],
  database: ["schema", "SQL", "PostgreSQL", "table", "ERD", "query"],
  deploy: ["Docker", "Kubernetes", "CI/CD", "container", "pipeline"],
  frontend: ["React", "TypeScript", "component", "UI", "CSS", "hooks"],
  backend: ["API", "server", "FastAPI", "REST", "endpoint", "database"],
  ai: ["machine learning", "ML", "Transformer", "LLM", "fine-tuning", "RAG", "deep learning"],
  code: ["programming", "coding", "development", "software"],
  coding: ["programming", "code", "development", "software"],
  travel: ["trip", "journey", "vacation", "itinerary", "plan"],
  fitness: ["workout", "exercise", "gym", "training", "health"],
  // Chinese expansions
  "優化": ["效能", "速度", "改善", "快取", "performance", "optimize"],
  "效能": ["優化", "速度", "改善", "performance"],
  "記憶體": ["配置", "管理", "memory", "allocation", "pool", "heap"],
  "架構": ["設計", "模式", "結構", "微服務", "architecture"],
  "資料庫": ["schema", "SQL", "表格", "ERD", "database"],
  "部署": ["Docker", "Kubernetes", "容器", "pipeline", "deploy"],
  "程式碼": ["code", "programming", "coding", "開發", "軟體"],
  "旅遊": ["旅行", "行程", "規劃", "travel", "trip"],
  "健身": ["運動", "訓練", "健康", "workout", "fitness"],
  "機器學習": ["ML", "深度學習", "模型", "AI", "machine learning"],
};

/* ------------------------------------------------------------------ */
/*  Search scoring engine                                              */
/* ------------------------------------------------------------------ */

function computeScore(
  entry: SearchEntry,
  query: string,
  semanticMode: boolean,
): ScoredResult | null {
  const q = query.toLowerCase().trim();
  if (!q) return null;

  const queryTerms = q.split(/\s+/).filter(Boolean);
  let totalScore = 0;
  const matchedTerms: string[] = [];

  // Build expanded terms if semantic mode is on
  let expandedTerms: string[] = [];
  if (semanticMode) {
    for (const term of queryTerms) {
      const expansions = SEMANTIC_EXPANSION[term] || SEMANTIC_EXPANSION[term.toLowerCase()];
      if (expansions) {
        expandedTerms.push(...expansions.map((e) => e.toLowerCase()));
      }
    }
  }

  const allTerms = [...queryTerms, ...expandedTerms];
  const titleLower = entry.title.toLowerCase();
  const contentLower = entry.content.toLowerCase();
  const tagsLower = entry.tags.map((t) => t.toLowerCase());

  for (const term of allTerms) {
    const isExpanded = expandedTerms.includes(term);
    const weight = isExpanded ? 0.5 : 1.0;

    // Title match (highest weight)
    if (titleLower.includes(term)) {
      totalScore += 30 * weight;
      if (!matchedTerms.includes(term)) matchedTerms.push(term);
    }

    // Tag exact match
    if (tagsLower.some((t) => t === term || t.includes(term))) {
      totalScore += 25 * weight;
      if (!matchedTerms.includes(term)) matchedTerms.push(term);
    }

    // Content match
    if (contentLower.includes(term)) {
      // Count occurrences (capped at 5)
      const occurrences = Math.min(
        (contentLower.match(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")) || []).length,
        5,
      );
      totalScore += (10 + occurrences * 3) * weight;
      if (!matchedTerms.includes(term)) matchedTerms.push(term);
    }
  }

  // Bonus for type-based queries
  const typeAliases: Record<string, ResultType[]> = {
    code: ["code"],
    coding: ["code"],
    "程式碼": ["code"],
    chat: ["chat"],
    "對話": ["chat"],
    data: ["data"],
    file: ["file"],
    "檔案": ["data", "file"],
    "資料": ["data"],
  };
  for (const term of queryTerms) {
    const matchingTypes = typeAliases[term];
    if (matchingTypes && matchingTypes.includes(entry.type)) {
      totalScore += 15;
    }
  }

  // Recency bonus (max 10 points for entries within 30 days)
  const daysDiff = Math.max(
    0,
    (Date.now() - new Date(entry.date).getTime()) / (1000 * 60 * 60 * 24),
  );
  if (daysDiff < 30) totalScore += Math.round(10 * (1 - daysDiff / 30));

  if (totalScore === 0) return null;

  // Normalize to 0-100 range
  const normalizedScore = Math.min(99, Math.round(totalScore * 0.8));

  return {
    ...entry,
    score: normalizedScore,
    matchedTerms,
  };
}

/* ------------------------------------------------------------------ */
/*  Highlighted text renderer                                          */
/* ------------------------------------------------------------------ */

function HighlightedText({
  text,
  keywords,
  breathing = false,
}: {
  text: string;
  keywords: string[];
  breathing?: boolean;
}) {
  if (!keywords.length) return <span>{text}</span>;

  const escaped = keywords
    .filter(Boolean)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!escaped.length) return <span>{text}</span>;

  const regex = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = text.split(regex);

  return (
    <span>
      {parts.map((part, i) => {
        const isMatch = keywords.some(
          (k) => k.toLowerCase() === part.toLowerCase(),
        );
        if (isMatch) {
          return (
            <mark
              key={i}
              className={cn(
                "bg-amber-400/20 text-amber-200 border-b border-amber-400/50 rounded-sm px-0.5",
                breathing && "animate-breathing-glow",
              )}
            >
              {part}
            </mark>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Code block renderer with basic syntax highlighting                 */
/* ------------------------------------------------------------------ */

function CodeBlock({ code, language }: { code: string; language?: string }) {
  // Basic keyword highlighting per language
  const keywordSets: Record<string, string[]> = {
    cpp: ["template", "class", "struct", "public", "private", "void", "return", "const", "auto", "using", "typename", "new", "delete", "if", "for", "while", "namespace", "virtual", "override", "size_t", "bool", "int", "float", "char"],
    tsx: ["import", "export", "function", "const", "let", "return", "from", "default", "interface", "type", "extends", "implements", "useState", "useEffect", "useRef", "useMemo", "useCallback"],
    ts: ["import", "export", "function", "const", "let", "return", "type", "interface", "extends", "keyof", "infer", "readonly", "never", "any", "string", "number", "boolean", "void"],
    py: ["import", "from", "class", "def", "return", "async", "await", "if", "for", "in", "with", "as", "None", "True", "False", "self", "raise", "try", "except"],
    sql: ["CREATE", "TABLE", "INSERT", "SELECT", "FROM", "WHERE", "JOIN", "ON", "PRIMARY", "KEY", "REFERENCES", "NOT", "NULL", "DEFAULT", "UNIQUE", "INDEX", "VARCHAR", "INTEGER", "TEXT", "DECIMAL", "DATE", "UUID", "TIMESTAMPTZ"],
    yaml: ["name", "on", "jobs", "runs-on", "steps", "uses", "with", "run", "if", "needs", "env"],
    dockerfile: ["FROM", "AS", "WORKDIR", "COPY", "RUN", "CMD", "EXPOSE", "USER", "ENV", "ARG", "ENTRYPOINT"],
  };

  const keywords = keywordSets[language || ""] || [];

  function highlightLine(line: string) {
    if (!keywords.length) return <span>{line}</span>;

    // Comment highlighting
    const commentPatterns = [/^(\s*\/\/.*)$/, /^(\s*#.*)$/, /^(\s*--.*)$/];
    for (const pat of commentPatterns) {
      if (pat.test(line)) {
        return <span className="text-white/30 italic">{line}</span>;
      }
    }

    // String highlighting
    // Simple word-boundary keyword highlighting
    const kwPattern = new RegExp(
      `\\b(${keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
      "g",
    );
    const segments = line.split(kwPattern);

    return (
      <span>
        {segments.map((seg, i) => {
          if (keywords.some((k) => k === seg)) {
            return (
              <span key={i} className="text-blue-400">
                {seg}
              </span>
            );
          }
          // Highlight strings
          const strParts = seg.split(/("[^"]*"|'[^']*')/g);
          return strParts.map((sp, j) =>
            /^["']/.test(sp) ? (
              <span key={`${i}-${j}`} className="text-emerald-400">
                {sp}
              </span>
            ) : (
              <span key={`${i}-${j}`}>{sp}</span>
            ),
          );
        })}
      </span>
    );
  }

  return (
    <pre className="rounded-lg bg-black/40 border border-white/8 p-3 overflow-x-auto text-xs font-mono leading-relaxed">
      <code>
        {code.split("\n").map((line, i) => (
          <div key={i} className="flex">
            <span className="select-none text-white/20 w-8 shrink-0 text-right pr-3">
              {i + 1}
            </span>
            <span className="text-white/70">{highlightLine(line)}</span>
          </div>
        ))}
      </code>
    </pre>
  );
}

/* ------------------------------------------------------------------ */
/*  Content renderer — handles code blocks within content              */
/* ------------------------------------------------------------------ */

function ContentRenderer({
  content,
  keywords,
  language,
  breathing = false,
}: {
  content: string;
  keywords: string[];
  language?: string;
  breathing?: boolean;
}) {
  // Split content by code blocks
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  const parts: { type: "text" | "code"; content: string; lang?: string }[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", content: content.slice(lastIndex, match.index) });
    }
    parts.push({ type: "code", content: match[2].trim(), lang: match[1] || language });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    parts.push({ type: "text", content: content.slice(lastIndex) });
  }

  return (
    <div className="space-y-3">
      {parts.map((part, i) =>
        part.type === "code" ? (
          <CodeBlock key={i} code={part.content} language={part.lang} />
        ) : (
          <p
            key={i}
            className="text-sm text-white/65 leading-relaxed whitespace-pre-wrap"
          >
            <HighlightedText text={part.content} keywords={keywords} breathing={breathing} />
          </p>
        ),
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Skeleton loader                                                    */
/* ------------------------------------------------------------------ */

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4 space-y-3 animate-pulse">
      <div className="flex items-center gap-2">
        <div className="w-20 h-4 rounded bg-white/10" />
        <div className="w-12 h-4 rounded bg-white/8" />
      </div>
      <div className="space-y-2">
        <div className="w-full h-3 rounded bg-white/8" />
        <div className="w-4/5 h-3 rounded bg-white/8" />
        <div className="w-3/5 h-3 rounded bg-white/8" />
      </div>
      <div className="flex items-center gap-2">
        <div className="w-16 h-5 rounded-full bg-white/8" />
        <div className="flex-1" />
        <div className="w-24 h-2 rounded bg-white/8" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Type badge                                                         */
/* ------------------------------------------------------------------ */

const TYPE_CONFIG: Record<
  ResultType,
  { icon: typeof MessageSquare; label: string; labelEn: string; color: string }
> = {
  chat: {
    icon: MessageSquare,
    label: "對話",
    labelEn: "Chat",
    color: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  },
  code: {
    icon: Code2,
    label: "程式碼",
    labelEn: "Code",
    color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  },
  data: {
    icon: Database,
    label: "資料",
    labelEn: "Data",
    color: "bg-purple-500/15 text-purple-400 border-purple-500/20",
  },
  file: {
    icon: FileText,
    label: "檔案",
    labelEn: "File",
    color: "bg-orange-500/15 text-orange-400 border-orange-500/20",
  },
};

function TypeBadge({ type, lang }: { type: ResultType; lang: string }) {
  const cfg = TYPE_CONFIG[type];
  const Icon = cfg.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md border",
        cfg.color,
      )}
    >
      <Icon className="w-3 h-3" />
      {lang === "en" ? cfg.labelEn : cfg.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Language badge for code entries                                     */
/* ------------------------------------------------------------------ */

const LANG_LABELS: Record<string, string> = {
  cpp: "C++",
  tsx: "TSX",
  ts: "TypeScript",
  py: "Python",
  sql: "SQL",
  yaml: "YAML",
  dockerfile: "Dockerfile",
};

function LanguageBadge({ language }: { language?: string }) {
  if (!language) return null;
  return (
    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/8 text-white/40 border border-white/6">
      {LANG_LABELS[language] || language}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Relevance bar                                                      */
/* ------------------------------------------------------------------ */

function RelevanceBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-white/8 overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-700",
            score >= 80
              ? "bg-emerald-400"
              : score >= 60
                ? "bg-blue-400"
                : score >= 40
                  ? "bg-amber-400"
                  : "bg-white/30",
          )}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-[10px] font-mono text-white/40 w-8 text-right">
        {score}%
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Extract first meaningful excerpt from content                      */
/* ------------------------------------------------------------------ */

function getExcerpt(content: string, maxLen = 160): string {
  // Remove code blocks for excerpt
  const withoutCode = content.replace(/```[\s\S]*?```/g, "").trim();
  // Take first meaningful line(s)
  const lines = withoutCode.split("\n").filter((l) => l.trim().length > 0);
  let excerpt = "";
  for (const line of lines) {
    if (excerpt.length + line.length > maxLen) break;
    excerpt += (excerpt ? " " : "") + line.trim();
  }
  return excerpt || withoutCode.slice(0, maxLen);
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

/**
 * Build search database from user's actual conversations via storage API
 */
function buildUserSearchDB(userId: string): SearchEntry[] {
  const entries: SearchEntry[] = [];
  try {
    // Search both old "chat-" namespaces and new "conv-messages:" namespaces
    const convEntries = [
      ...listUserDataByPattern(userId, "conv-messages:"),
      ...listUserDataByPattern(userId, "chat-"),
    ];
    const seenIds = new Set<string>();
    for (const { namespace, data } of convEntries) {
      const messages = data as any[];
      if (!Array.isArray(messages) || messages.length === 0) continue;
      // Extract conversation ID: "conv-messages:c-123" → "c-123", "chat-123" → "chat-123"
      const convId = namespace.startsWith("conv-messages:")
        ? namespace.slice("conv-messages:".length)
        : namespace;
      if (seenIds.has(convId)) continue;
      seenIds.add(convId);
      const fullContent = messages.map((m: any) => `${m.role === "user" ? "User" : "AI"}: ${m.content}`).join("\n\n");
      const firstUserMsg = messages.find((m: any) => m.role === "user");
      const title = firstUserMsg?.content?.slice(0, 60)?.replace(/\n/g, " ") || `Chat ${convId.slice(0, 8)}`;
      const hasCode = fullContent.includes("```");
      entries.push({
        id: convId,
        title,
        date: messages[messages.length - 1]?.timestamp || new Date().toISOString().slice(0, 10),
        type: hasCode ? "code" : "chat",
        language: hasCode ? "tsx" : undefined,
        tags: [],
        content: fullContent,
      });
    }
  } catch {}
  return entries;
}

export default function SemanticSearch() {
  const { settings } = useSettings();
  const lang = settings.language;

  const [query, setQuery] = useState("");
  const [semanticMode, setSemanticMode] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("relevance");
  const [results, setResults] = useState<ScoredResult[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // Build search DB from user's real conversations
  const { user } = useAuth();
  const searchDB = useMemo(() => {
    try {
      const userId = user?.id ?? "anon";
      return buildUserSearchDB(userId);
    } catch {
      return [];
    }
  }, [query, user?.id]); // Rebuild when searching (in case new chats were added)

  const selectedResult = results.find((r) => r.id === selectedId) ?? null;

  /* Keyboard shortcut: Cmd+K / Ctrl+K */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  /* Active keywords for highlighting */
  const activeKeywords = useMemo(() => {
    if (!query.trim()) return [];
    const terms = query.trim().split(/\s+/).filter(Boolean);
    // Add semantic expansions if enabled
    if (semanticMode) {
      const expanded: string[] = [];
      for (const term of terms) {
        const exps = SEMANTIC_EXPANSION[term] || SEMANTIC_EXPANSION[term.toLowerCase()];
        if (exps) expanded.push(...exps);
      }
      return [...terms, ...expanded];
    }
    return terms;
  }, [query, semanticMode]);

  /* Search logic with debounce */
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSelectedId(null);
      return;
    }

    setIsSearching(true);
    const timeout = setTimeout(() => {
      // Score all entries
      let scored: ScoredResult[] = [];
      for (const entry of searchDB) {
        const result = computeScore(entry, query, semanticMode);
        if (result) scored.push(result);
      }

      // Filter
      if (filter === "code") scored = scored.filter((r) => r.type === "code");
      else if (filter === "conversations") scored = scored.filter((r) => r.type === "chat");
      else if (filter === "files") scored = scored.filter((r) => r.type === "data" || r.type === "file");

      // Sort
      if (sort === "date") scored.sort((a, b) => b.date.localeCompare(a.date));
      else if (sort === "type") scored.sort((a, b) => a.type.localeCompare(b.type));
      else scored.sort((a, b) => b.score - a.score);

      setResults(scored);
      setIsSearching(false);
      if (scored.length > 0) setSelectedId(scored[0].id);
      else setSelectedId(null);
    }, 300);

    return () => clearTimeout(timeout);
  }, [query, filter, sort, semanticMode]);

  /* Jump handler — navigate to conversation in Chat tab */
  const handleJump = useCallback(
    (id: string) => {
      setSelectedId(id);
      // Switch to Chat tab with this conversation
      window.dispatchEvent(
        new CustomEvent("feature-switch", { detail: { feature: "chat" } }),
      );
      // Tell Sidebar to select this conversation
      window.dispatchEvent(
        new CustomEvent("select-conversation", { detail: { chatId: id } }),
      );
      toast.success(lang === "en" ? "Opening conversation..." : "正在開啟對話...", {
        duration: 1500,
      });
    },
    [lang],
  );

  const handleOpenInChat = useCallback(() => {
    if (selectedId) {
      handleJump(selectedId);
    }
  }, [selectedId, handleJump]);

  /* Filter / Sort options */
  const FILTERS: { key: FilterKey; label: string; labelEn: string }[] = [
    { key: "all", label: "全部", labelEn: "All" },
    { key: "code", label: "程式碼", labelEn: "Code" },
    { key: "conversations", label: "對話", labelEn: "Conversations" },
    { key: "files", label: "檔案", labelEn: "Files" },
  ];

  const SORTS: { key: SortKey; label: string; labelEn: string }[] = [
    { key: "relevance", label: "相關度", labelEn: "Relevance" },
    { key: "date", label: "日期", labelEn: "Date" },
    { key: "type", label: "類型", labelEn: "Type" },
  ];

  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* ---- CSS for breathing glow animation ---- */}
      <style>{`
        @keyframes breathing-glow {
          0%, 100% { box-shadow: 0 0 4px 0 rgba(251, 191, 36, 0.15); background-color: rgba(251, 191, 36, 0.12); }
          50% { box-shadow: 0 0 12px 2px rgba(251, 191, 36, 0.3); background-color: rgba(251, 191, 36, 0.22); }
        }
        .animate-breathing-glow {
          animation: breathing-glow 2.5s ease-in-out infinite;
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .shimmer-bg {
          background: linear-gradient(90deg, transparent 25%, rgba(255,255,255,0.06) 50%, transparent 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s ease-in-out infinite;
        }
      `}</style>

      {/* ============================================================ */}
      {/*  SEARCH BAR                                                   */}
      {/* ============================================================ */}
      <div className="px-4 pt-4 pb-3 border-b border-white/8">
        <div
          className={cn(
            "flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-all duration-300",
            "bg-white/[0.04] border-white/10",
            "focus-within:border-blue-500/40 focus-within:bg-white/[0.06]",
            "focus-within:shadow-[0_0_20px_-4px_rgba(59,130,246,0.25)]",
          )}
        >
          <Search className="w-5 h-5 text-white/40 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              lang === "en"
                ? "Search conversations, code, files..."
                : "搜尋對話、程式碼、檔案..."
            }
            className="flex-1 bg-transparent text-sm text-white/90 placeholder:text-white/30 outline-none"
          />

          {/* Semantic toggle */}
          <button
            onClick={() => setSemanticMode((v) => !v)}
            className={cn(
              "flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md border transition-all",
              semanticMode
                ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
                : "bg-white/5 text-white/40 border-white/10",
            )}
          >
            <Sparkles className="w-3 h-3" />
            Semantic
          </button>

          {/* Result count */}
          {query && !isSearching && (
            <span className="text-[10px] text-white/35 font-mono whitespace-nowrap">
              {results.length} {lang === "en" ? "results" : "筆結果"}
            </span>
          )}

          {/* Clear */}
          {query && (
            <button
              onClick={() => setQuery("")}
              className="text-white/30 hover:text-white/60 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* Keyboard hint */}
          <kbd className="hidden sm:inline-flex items-center gap-0.5 text-[10px] text-white/25 border border-white/10 rounded px-1.5 py-0.5 font-mono">
            <span className="text-[9px]">⌘</span>K
          </kbd>
        </div>

        {/* Filters & Sort */}
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          {/* Filter tabs */}
          <div className="flex items-center gap-1">
            <Tag className="w-3 h-3 text-white/30 mr-1" />
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  "text-[11px] px-2 py-0.5 rounded-md border transition-all",
                  filter === f.key
                    ? "bg-white/10 text-white/80 border-white/15"
                    : "bg-transparent text-white/35 border-transparent hover:text-white/50",
                )}
              >
                {lang === "en" ? f.labelEn : f.label}
              </button>
            ))}
          </div>

          <div className="w-px h-4 bg-white/10" />

          {/* Sort */}
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3 text-white/30 mr-1" />
            {SORTS.map((s) => (
              <button
                key={s.key}
                onClick={() => setSort(s.key)}
                className={cn(
                  "text-[11px] px-2 py-0.5 rounded-md border transition-all",
                  sort === s.key
                    ? "bg-white/10 text-white/80 border-white/15"
                    : "bg-transparent text-white/35 border-transparent hover:text-white/50",
                )}
              >
                {lang === "en" ? s.labelEn : s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/*  BODY: Results List + Preview Panel                           */}
      {/* ============================================================ */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ---- Results List ---- */}
        <div className="w-full md:w-[380px] shrink-0 overflow-y-auto border-r border-white/8 p-3 space-y-2 custom-scrollbar">
          {/* Searching skeleton */}
          {isSearching && (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          )}

          {/* No query */}
          {!query && !isSearching && (
            <div className="flex flex-col items-center justify-center h-full text-center px-4 gap-3 py-12">
              <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/8 flex items-center justify-center">
                <Search className="w-6 h-6 text-white/20" />
              </div>
              <p className="text-sm text-white/35">
                {lang === "en"
                  ? "Type to search across all conversations"
                  : "輸入關鍵字搜尋所有對話紀錄"}
              </p>
              <p className="text-[11px] text-white/20">
                {lang === "en"
                  ? 'Try "C++", "React hooks", "insurance", "Docker", "fitness"'
                  : '試試 "C++"、"React hooks"、"保險"、"Docker"、"健身"'}
              </p>
            </div>
          )}

          {/* No results */}
          {query && !isSearching && results.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center px-4 gap-3 py-12">
              <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/8 flex items-center justify-center">
                <Zap className="w-6 h-6 text-white/20" />
              </div>
              <p className="text-sm text-white/35">
                {lang === "en" ? "No results found" : "找不到相關結果"}
              </p>
              <p className="text-[11px] text-white/20">
                {lang === "en"
                  ? "Try different keywords or toggle Semantic mode"
                  : "請嘗試不同的關鍵字或切換語義模式"}
              </p>
            </div>
          )}

          {/* Result cards */}
          {!isSearching &&
            results.map((r) => (
              <button
                key={r.id}
                onClick={() => handleJump(r.id)}
                className={cn(
                  "w-full text-left rounded-xl border p-3.5 transition-all duration-200 group",
                  "hover:bg-white/[0.06] hover:border-white/15 hover:shadow-lg hover:shadow-black/20",
                  "hover:-translate-y-0.5",
                  selectedId === r.id
                    ? "bg-white/[0.07] border-blue-500/30 shadow-lg shadow-blue-500/5"
                    : "bg-white/[0.03] border-white/8",
                )}
              >
                {/* Title row */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-sm font-medium text-white/85 leading-snug line-clamp-1">
                    <HighlightedText
                      text={r.title}
                      keywords={activeKeywords}
                    />
                  </h3>
                  <div className="flex items-center gap-1 shrink-0">
                    <LanguageBadge language={r.language} />
                    <TypeBadge type={r.type} lang={lang} />
                  </div>
                </div>

                {/* Excerpt */}
                <p className="text-xs text-white/45 leading-relaxed line-clamp-2 mb-2.5">
                  <HighlightedText
                    text={getExcerpt(r.content)}
                    keywords={activeKeywords}
                  />
                </p>

                {/* Tags */}
                <div className="flex flex-wrap gap-1 mb-2">
                  {r.tags.slice(0, 4).map((tag) => (
                    <span
                      key={tag}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-white/30 border border-white/6"
                    >
                      {tag}
                    </span>
                  ))}
                  {r.tags.length > 4 && (
                    <span className="text-[9px] text-white/20">
                      +{r.tags.length - 4}
                    </span>
                  )}
                </div>

                {/* Footer: date + relevance + jump */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-white/30 font-mono">
                    {r.date}
                  </span>
                  <div className="flex-1">
                    <RelevanceBar score={r.score} />
                  </div>
                  <span className="flex items-center gap-0.5 text-[10px] text-blue-400/70 opacity-0 group-hover:opacity-100 transition-opacity">
                    {lang === "en" ? "Jump" : "跳轉"}
                    <ChevronRight className="w-3 h-3" />
                  </span>
                </div>
              </button>
            ))}
        </div>

        {/* ---- Preview Panel ---- */}
        <div
          ref={previewRef}
          className="hidden md:flex flex-1 flex-col overflow-y-auto p-4 custom-scrollbar"
        >
          {!selectedResult && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/8 flex items-center justify-center">
                <FileText className="w-7 h-7 text-white/15" />
              </div>
              <p className="text-sm text-white/30">
                {lang === "en"
                  ? "Select a result to preview"
                  : "選取搜尋結果以預覽"}
              </p>
            </div>
          )}

          {selectedResult && (
            <div className="space-y-4">
              {/* Preview header */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-white/90 mb-1">
                    <HighlightedText
                      text={selectedResult.title}
                      keywords={activeKeywords}
                    />
                  </h2>
                  <div className="flex items-center gap-2 text-[11px] text-white/40 flex-wrap">
                    <Clock className="w-3 h-3" />
                    {selectedResult.date}
                    <span className="mx-1">·</span>
                    <TypeBadge type={selectedResult.type} lang={lang} />
                    <LanguageBadge language={selectedResult.language} />
                    <span className="mx-1">·</span>
                    <span className="font-mono">
                      {selectedResult.score}%{" "}
                      {lang === "en" ? "match" : "相符"}
                    </span>
                  </div>
                </div>
                <button
                  onClick={handleOpenInChat}
                  className={cn(
                    "flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg shrink-0",
                    "bg-blue-500/15 text-blue-400 border border-blue-500/25",
                    "hover:bg-blue-500/25 transition-all",
                  )}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  {lang === "en" ? "Open in Chat" : "在聊天中開啟"}
                </button>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-1.5">
                {selectedResult.tags.map((tag) => (
                  <span
                    key={tag}
                    className={cn(
                      "text-[10px] px-2 py-0.5 rounded-md border",
                      selectedResult.matchedTerms.some(
                        (m) => tag.toLowerCase().includes(m.toLowerCase()),
                      )
                        ? "bg-amber-400/10 text-amber-300 border-amber-400/20"
                        : "bg-white/5 text-white/35 border-white/8",
                    )}
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {/* Matched content highlight block */}
              <div
                className={cn(
                  "rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-4",
                  "animate-breathing-glow",
                )}
              >
                <div className="flex items-center gap-1.5 mb-3">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400/70" />
                  <span className="text-[11px] font-medium text-amber-400/70">
                    {lang === "en" ? "Matched Content" : "匹配內容"}
                  </span>
                  {selectedResult.matchedTerms.length > 0 && (
                    <span className="text-[10px] text-amber-400/50 ml-2">
                      {lang === "en" ? "Matched:" : "命中："}{" "}
                      {selectedResult.matchedTerms.slice(0, 5).join(", ")}
                    </span>
                  )}
                </div>
                <p className="text-sm text-white/70 leading-relaxed">
                  <HighlightedText
                    text={getExcerpt(selectedResult.content, 300)}
                    keywords={activeKeywords}
                    breathing
                  />
                </p>
              </div>

              {/* Full content */}
              <div>
                <div className="flex items-center gap-1.5 mb-3">
                  <MessageSquare className="w-3.5 h-3.5 text-white/30" />
                  <span className="text-[11px] font-medium text-white/40">
                    {lang === "en" ? "Full Content" : "完整內容"}
                  </span>
                </div>
                <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
                  <ContentRenderer
                    content={selectedResult.content}
                    keywords={activeKeywords}
                    language={selectedResult.language}
                  />
                </div>
              </div>

              {/* Jump / Open actions */}
              <div className="flex items-center gap-2 pt-2 border-t border-white/8">
                <button
                  onClick={handleOpenInChat}
                  className={cn(
                    "flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg transition-all",
                    "bg-white/5 text-white/50 border border-white/10",
                    "hover:bg-white/10 hover:text-white/70",
                  )}
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  {lang === "en" ? "Open Full Conversation" : "開啟完整對話"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
