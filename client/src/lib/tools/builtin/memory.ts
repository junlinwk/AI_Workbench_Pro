import type { Tool, ToolResultPayload } from "@/lib/tools/types"
import { loadMemory } from "@/lib/conversationMemory"
import { loadUserData, saveUserData } from "@/lib/storage"

interface MemoryNode {
  id: string
  label: string
  category: string
  x: number
  y: number
  size: number
  conversations: Array<{
    id: string
    date: string
    excerpt: string
    topic: string
    conversationId?: string
  }>
  keywords?: string[]
}
interface MemoryEdge {
  from: string
  to: string
  strength: number
  label?: string
}

const USER_NODE: MemoryNode = {
  id: "user",
  label: "",
  category: "user",
  x: 150,
  y: 150,
  size: 34,
  conversations: [],
  keywords: [],
}

function persistMemoryNode(
  userId: string,
  conversationId: string,
  label: string,
  category: string,
  keywords: string[],
) {
  const nodes = loadUserData<MemoryNode[]>(userId, "memory-nodes", [USER_NODE])
  const edges = loadUserData<MemoryEdge[]>(userId, "memory-edges", [])
  const trimmed = label.trim()
  const existing = nodes.find(
    (n) => n.label.toLowerCase() === trimmed.toLowerCase() && n.id !== "user",
  )
  if (existing) {
    existing.keywords = Array.from(
      new Set([...(existing.keywords || []), ...keywords]),
    )
  } else {
    const angle = Math.random() * Math.PI * 2
    const distance = 60 + Math.random() * 80
    nodes.push({
      id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label: trimmed,
      category,
      x: Math.max(-30, Math.min(360, 150 + Math.cos(angle) * distance)),
      y: Math.max(-30, Math.min(360, 150 + Math.sin(angle) * distance)),
      size: 18 + Math.random() * 8,
      conversations: [
        {
          id: `conv-${Date.now()}`,
          date: new Date().toLocaleDateString(),
          excerpt: trimmed,
          topic: trimmed,
          conversationId,
        },
      ],
      keywords,
    })
    edges.push({
      from: "user",
      to: nodes[nodes.length - 1].id,
      strength: 0.5 + Math.random() * 0.5,
      label: category,
    })
  }
  saveUserData(userId, "memory-nodes", nodes)
  saveUserData(userId, "memory-edges", edges)
}

type MemoryCategory =
  | "core"
  | "technical"
  | "personal"
  | "project"
  | "career"

const CATEGORIES: MemoryCategory[] = [
  "core",
  "technical",
  "personal",
  "project",
  "career",
]

interface MemoryAddInput {
  category?: unknown
  label?: unknown
  keywords?: unknown
}

interface MemoryQueryInput {
  query?: unknown
  limit?: unknown
}

const DEFAULT_QUERY_LIMIT = 5

export const memoryAddTool: Tool = {
  name: "memory_add",
  description:
    "Record a durable fact about the user or the current project to the memory graph. Use sparingly — only for information worth remembering across future conversations.",
  source: "builtin",
  inputSchema: {
    type: "object",
    properties: {
      category: {
        type: "string",
        enum: CATEGORIES,
        description: "Which bucket the memory belongs to.",
      },
      label: {
        type: "string",
        description: "Short human-readable title for the memory node.",
      },
      keywords: {
        type: "array",
        items: { type: "string" },
        description: "Optional keywords to aid later retrieval.",
      },
    },
    required: ["category", "label"],
  },
  async execute(input, ctx): Promise<ToolResultPayload> {
    const { category, label, keywords } = (input ?? {}) as MemoryAddInput
    if (typeof label !== "string" || label.trim().length === 0) {
      return { content: "memory_add failed: missing label", isError: true }
    }
    const cat: MemoryCategory =
      typeof category === "string" &&
      (CATEGORIES as string[]).includes(category)
        ? (category as MemoryCategory)
        : "technical"
    const kws = Array.isArray(keywords)
      ? keywords.filter((k): k is string => typeof k === "string")
      : []

    try {
      persistMemoryNode(ctx.userId, ctx.conversationId, label, cat, kws)
    } catch (err) {
      return {
        content: `memory_add failed: ${err instanceof Error ? err.message : "storage error"}`,
        isError: true,
      }
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("memory-add", {
          detail: { label: label.trim(), category: cat, keywords: kws },
        }),
      )
    }
    return { content: `Added memory "${label.trim()}" to ${cat}.` }
  },
}

export const memoryQueryTool: Tool = {
  name: "memory_query",
  description:
    "Search the current conversation's stored memory for relevant notes. Use before asking the user to repeat information they may have already provided.",
  source: "builtin",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Keywords or phrase to match against memory entries.",
      },
      limit: {
        type: "integer",
        description: "Maximum number of entries to return (default 5).",
        default: DEFAULT_QUERY_LIMIT,
      },
    },
    required: ["query"],
  },
  async execute(input, ctx): Promise<ToolResultPayload> {
    const { query, limit } = (input ?? {}) as MemoryQueryInput
    if (typeof query !== "string" || query.trim().length === 0) {
      return { content: "memory_query failed: missing query", isError: true }
    }
    const max =
      typeof limit === "number" && limit > 0
        ? Math.floor(limit)
        : DEFAULT_QUERY_LIMIT

    const words = query
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 0)
    if (words.length === 0) {
      return { content: "(no matching memories)" }
    }

    const memory = loadMemory(ctx.userId, ctx.conversationId)
    const matches = memory.entries.filter((e) => {
      const lower = e.content.toLowerCase()
      return words.some((w) => lower.includes(w))
    })
    if (matches.length === 0) {
      return { content: "(no matching memories)" }
    }
    const top = matches.slice(0, max)
    const lines = top.map((e) => `- ${e.content}`)
    return { content: lines.join("\n") }
  },
}
