import type { Tool, ToolResultPayload } from "@/lib/tools/types"

interface SearchInput {
  query?: unknown
  max_results?: unknown
}

interface SearchResult {
  title?: string
  snippet?: string
  url?: string
}

const MAX_OUTPUT_CHARS = 3000
const DEFAULT_MAX_RESULTS = 5

export const webSearchTool: Tool = {
  name: "web_search",
  description:
    "Search the web for up-to-date information. Use this whenever the user asks about current events, recent data, product versions, news, or any fact you are not fully confident about from training data.",
  source: "builtin",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query.",
      },
      max_results: {
        type: "integer",
        description: "Maximum number of results to return (default 5).",
        default: DEFAULT_MAX_RESULTS,
      },
    },
    required: ["query"],
  },
  async execute(input): Promise<ToolResultPayload> {
    const { query, max_results } = (input ?? {}) as SearchInput
    if (typeof query !== "string" || query.trim().length === 0) {
      return { content: "Search failed: missing query", isError: true }
    }
    const limit =
      typeof max_results === "number" && max_results > 0
        ? Math.floor(max_results)
        : DEFAULT_MAX_RESULTS

    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(query)}`,
      )
      if (!res.ok) {
        return {
          content: `Search failed: HTTP ${res.status}`,
          isError: true,
        }
      }
      const data = (await res.json()) as { results?: SearchResult[] }
      const results = Array.isArray(data.results)
        ? data.results.slice(0, limit)
        : []
      if (results.length === 0) {
        return { content: `No results for "${query}".` }
      }

      const lines: string[] = [`Search results for "${query}":`, ""]
      results.forEach((r, i) => {
        const title = r.title?.trim() || "(untitled)"
        const snippet = r.snippet?.trim() || ""
        const url = r.url?.trim() || ""
        lines.push(`${i + 1}. ${title}`)
        if (url) lines.push(`   ${url}`)
        if (snippet) lines.push(`   ${snippet}`)
        lines.push("")
      })
      let text = lines.join("\n")
      if (text.length > MAX_OUTPUT_CHARS) {
        text = text.slice(0, MAX_OUTPUT_CHARS) + "\n\n[truncated]"
      }
      return { content: text }
    } catch (err) {
      return {
        content: `Search failed: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
        isError: true,
      }
    }
  },
}
