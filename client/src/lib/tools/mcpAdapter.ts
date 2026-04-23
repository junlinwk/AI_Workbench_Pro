/**
 * Bridge MCP tools into our canonical Tool interface so runToolLoop can
 * invoke them transparently alongside builtins. MCP executors call the
 * proxy at /api/mcp/call.
 */
import { callMcpTool, listMcpServers, listMcpTools } from "../mcp/client"
import type { JSONSchema, Tool } from "./types"

/**
 * Collect tools from all enabled MCP servers for the current user.
 * Failures on individual servers are logged and skipped — one bad server
 * must not block the rest.
 */
export async function getMcpTools(opts?: {
  enabled: boolean
  onServerError?: (serverName: string, error: string) => void
}): Promise<Tool[]> {
  if (opts && opts.enabled === false) return []

  const servers = await listMcpServers()
  const enabled = servers.filter((s) => s.enabled)
  if (enabled.length === 0) return []

  const tools: Tool[] = []
  const seen = new Set<string>()

  for (const server of enabled) {
    const result = await listMcpTools(server.id)
    if ("error" in result) {
      opts?.onServerError?.(server.name, result.error)
      continue
    }
    for (const info of result.tools) {
      // Name collision: later MCP servers lose to earlier ones, and any
      // builtin wins over all MCP tools (builtins must be merged on top
      // downstream).
      if (seen.has(info.name)) continue
      seen.add(info.name)
      tools.push({
        name: info.name,
        description: info.description || `Tool from ${server.name}`,
        inputSchema: (info.inputSchema as JSONSchema) || {
          type: "object",
          properties: {},
        },
        source: "mcp",
        mcpServerId: server.id,
        execute: async (input, ctx) => {
          const r = await callMcpTool(
            server.id,
            info.name,
            input,
            ctx.signal,
          )
          return { content: r.content, isError: r.isError }
        },
      })
    }
  }
  return tools
}

/** Merge builtin + MCP. Builtins win on name collision; MCP tools are appended. */
export function mergeTools(builtin: Tool[], mcp: Tool[]): Tool[] {
  const byName = new Set(builtin.map((t) => t.name))
  return [...builtin, ...mcp.filter((t) => !byName.has(t.name))]
}
