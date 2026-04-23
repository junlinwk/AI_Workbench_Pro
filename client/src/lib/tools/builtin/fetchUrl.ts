import type { Tool, ToolResultPayload } from "@/lib/tools/types"

interface FetchInput {
  url?: unknown
}

const MAX_OUTPUT_CHARS = 5000

export const fetchUrlTool: Tool = {
  name: "fetch_url",
  description:
    "Retrieve a URL and return its extracted text content. Use this when the user shares a link, or when web_search results reference a page whose full contents you need.",
  source: "builtin",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The absolute http(s) URL to fetch.",
      },
    },
    required: ["url"],
  },
  async execute(input): Promise<ToolResultPayload> {
    const { url } = (input ?? {}) as FetchInput
    if (typeof url !== "string" || url.trim().length === 0) {
      return { content: "Fetch failed: missing url", isError: true }
    }
    try {
      const res = await fetch(
        `/api/fetch-url?url=${encodeURIComponent(url)}`,
      )
      if (!res.ok) {
        return {
          content: `Fetch failed: HTTP ${res.status}`,
          isError: true,
        }
      }
      const data = (await res.json()) as {
        title?: string
        text?: string
        error?: string
      }
      if (data.error || !data.text) {
        return {
          content: `Fetch failed: ${data.error || "empty response"}`,
          isError: true,
        }
      }
      const title = data.title?.trim() || "(untitled)"
      let body = `Title: ${title}\n\n${data.text}`
      if (body.length > MAX_OUTPUT_CHARS) {
        body = body.slice(0, MAX_OUTPUT_CHARS) + "\n\n[truncated]"
      }
      return { content: body }
    } catch (err) {
      return {
        content: `Fetch failed: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
        isError: true,
      }
    }
  },
}
