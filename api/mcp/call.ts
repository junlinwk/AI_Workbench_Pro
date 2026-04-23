/**
 * POST /api/mcp/call — Invoke a tool on one of the user's MCP servers.
 *
 * Body: { serverId: string, toolName: string, input: object }
 * Returns: { content: string, isError?: boolean }
 *
 * The MCP `tools/call` result shape is
 *   { content: [{ type: "text", text: "..." }, ...], isError?: boolean }
 * We flatten text parts into a single string; non-text parts are summarized.
 */
import {
  getAuthenticatedUserId,
  loadServer,
  mcpPost,
  nextRpcId,
  resolveAuthHeader,
  urlIsSafe,
} from "./_shared"

export default async function handler(req: any, res: any) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" })

  const userId = await getAuthenticatedUserId(req.headers.authorization)
  if (!userId) return res.status(401).json({ error: "Unauthorized" })

  const { serverId, toolName, input } = req.body || {}
  if (typeof serverId !== "string" || !serverId)
    return res.status(400).json({ error: "Missing serverId" })
  if (typeof toolName !== "string" || !toolName)
    return res.status(400).json({ error: "Missing toolName" })
  if (toolName.length > 128)
    return res.status(400).json({ error: "toolName too long" })

  const row = await loadServer(userId, serverId)
  if (!row) return res.status(404).json({ error: "Server not found" })
  if (!row.enabled) return res.status(400).json({ error: "Server disabled" })
  if (!urlIsSafe(row.url))
    return res.status(400).json({ error: "Server URL is not allowed" })

  const authHeader = resolveAuthHeader(row)

  try {
    const resp = await mcpPost(
      row.url,
      {
        jsonrpc: "2.0",
        id: nextRpcId(),
        method: "tools/call",
        params: {
          name: toolName,
          arguments: input && typeof input === "object" ? input : {},
        },
      },
      authHeader,
      25_000,
    )

    if (resp.error)
      return res.status(200).json({
        content: `MCP error: ${resp.error.message}`,
        isError: true,
      })

    const result = (resp.result as any) || {}
    const parts = Array.isArray(result.content) ? result.content : []
    const text = parts
      .map((p: any) => {
        if (p?.type === "text" && typeof p.text === "string") return p.text
        if (p?.type === "image") return "[image returned]"
        if (p?.type === "resource") return `[resource: ${p?.resource?.uri ?? "?"}]`
        return ""
      })
      .filter(Boolean)
      .join("\n")

    return res.status(200).json({
      content: text || "(empty result)",
      isError: result.isError === true,
    })
  } catch (err: any) {
    return res.status(200).json({
      content: err?.message || "MCP call failed",
      isError: true,
    })
  }
}
