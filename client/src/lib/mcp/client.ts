/**
 * Browser-side MCP client.
 *
 * All MCP traffic goes through our Vercel proxy (api/mcp/*). This module
 * only talks to the proxy — it never dials MCP servers directly (avoids
 * CORS and keeps auth headers server-side).
 */
import { getAuthToken } from "@/lib/supabase"

export interface McpServerSummary {
  id: string
  name: string
  url: string
  auth_hint: string | null
  enabled: boolean
  created_at?: string
  updated_at?: string
}

export interface McpToolInfo {
  name: string
  description: string
  inputSchema: unknown
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken()
  const h: Record<string, string> = { "Content-Type": "application/json" }
  if (token) h["Authorization"] = `Bearer ${token}`
  return h
}

export async function listMcpServers(): Promise<McpServerSummary[]> {
  const res = await fetch("/api/mcp/servers", {
    method: "GET",
    headers: await authHeaders(),
  })
  if (!res.ok) return []
  const data = await res.json().catch(() => ({}))
  return Array.isArray(data.servers) ? data.servers : []
}

export async function upsertMcpServer(input: {
  id?: string
  name: string
  url: string
  /** Full header value, e.g. "Bearer sk-abc". null = clear. undefined = unchanged. */
  authHeader?: string | null
  enabled?: boolean
}): Promise<McpServerSummary | null> {
  const res = await fetch("/api/mcp/servers", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(input),
  })
  if (!res.ok) return null
  const data = await res.json().catch(() => ({}))
  return data.server || null
}

export async function deleteMcpServer(id: string): Promise<boolean> {
  const res = await fetch(`/api/mcp/servers?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: await authHeaders(),
  })
  return res.ok
}

export async function listMcpTools(
  serverId: string,
): Promise<{ tools: McpToolInfo[]; serverName: string } | { error: string }> {
  const res = await fetch("/api/mcp/list", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ serverId }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return { error: data.error || `HTTP ${res.status}` }
  return {
    tools: Array.isArray(data.tools) ? data.tools : [],
    serverName: typeof data.serverName === "string" ? data.serverName : "",
  }
}

export async function callMcpTool(
  serverId: string,
  toolName: string,
  input: unknown,
  signal?: AbortSignal,
): Promise<{ content: string; isError?: boolean }> {
  const res = await fetch("/api/mcp/call", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ serverId, toolName, input }),
    signal,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    return {
      content: data.error || `HTTP ${res.status}`,
      isError: true,
    }
  }
  return {
    content: typeof data.content === "string" ? data.content : "(empty)",
    isError: data.isError === true,
  }
}
