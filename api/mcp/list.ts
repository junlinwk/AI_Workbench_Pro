/**
 * POST /api/mcp/list — List tools exposed by one MCP server.
 *
 * Body: { serverId: string }
 * Returns: { tools: [{ name, description, inputSchema }], serverName }
 *
 * Caller authenticates with Supabase JWT. Server config (URL, auth header)
 * is looked up from user_mcp_servers with RLS enforced by user_id check.
 */
import {
  getAuthenticatedUserId,
  loadServer,
  mcpPost,
  nextRpcId,
  resolveAuthHeader,
  urlIsSafe,
} from "./_shared.js"

export default async function handler(req: any, res: any) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" })

  const userId = await getAuthenticatedUserId(req.headers.authorization)
  if (!userId) return res.status(401).json({ error: "Unauthorized" })

  const { serverId } = req.body || {}
  if (typeof serverId !== "string" || !serverId)
    return res.status(400).json({ error: "Missing serverId" })

  const row = await loadServer(userId, serverId)
  if (!row) return res.status(404).json({ error: "Server not found" })
  if (!row.enabled) return res.status(400).json({ error: "Server disabled" })
  if (!urlIsSafe(row.url))
    return res.status(400).json({ error: "Server URL is not allowed" })

  const authHeader = resolveAuthHeader(row)

  try {
    // Some MCP servers require an `initialize` handshake before `tools/list`.
    // Send it best-effort; ignore errors since stateless servers accept
    // tools/list directly.
    await mcpPost(
      row.url,
      {
        jsonrpc: "2.0",
        id: nextRpcId(),
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "AI Workbench", version: "1.0" },
        },
      },
      authHeader,
      10_000,
    ).catch(() => undefined)

    const resp = await mcpPost(
      row.url,
      { jsonrpc: "2.0", id: nextRpcId(), method: "tools/list" },
      authHeader,
      15_000,
    )

    if (resp.error)
      return res
        .status(502)
        .json({ error: `MCP error: ${resp.error.message}` })

    const result = (resp.result as any) || {}
    const tools = Array.isArray(result.tools) ? result.tools : []
    const sanitized = tools.slice(0, 100).map((t: any) => ({
      name: String(t?.name ?? "").slice(0, 128),
      description: String(t?.description ?? "").slice(0, 2000),
      inputSchema:
        t?.inputSchema && typeof t.inputSchema === "object"
          ? t.inputSchema
          : { type: "object", properties: {} },
    }))

    return res.status(200).json({
      tools: sanitized,
      serverName: row.name,
    })
  } catch (err: any) {
    return res
      .status(502)
      .json({ error: err?.message || "MCP list failed" })
  }
}
