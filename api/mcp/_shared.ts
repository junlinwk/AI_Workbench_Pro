/**
 * Shared helpers for MCP proxy endpoints. Imported by list.ts and call.ts.
 *
 * Transport: we target MCP "Streamable HTTP" transport (stateless POST with
 * JSON-RPC 2.0). Some servers respond with `text/event-stream`; we parse the
 * first `data:` line as JSON.
 *
 * stdio transport is unsupported (Vercel serverless).
 */
import { createClient } from "@supabase/supabase-js"
import { createDecipheriv, createHash } from "crypto"

export function getServiceSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key)
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function getAuthenticatedUserId(
  authHeader: string | string[] | undefined,
): Promise<string | null> {
  if (!authHeader || typeof authHeader !== "string") return null
  const token = authHeader.replace(/^Bearer\s+/i, "").trim()
  if (!token) return null
  try {
    const supabase = getServiceSupabase()
    const { data, error } = await (supabase.auth as any).getUser(token)
    if (error || !data?.user) return null
    return data.user.id
  } catch {
    return null
  }
}

function decryptAuth(ciphertextB64: string, ivB64: string): string {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET
  if (!secret) throw new Error("API_KEY_ENCRYPTION_SECRET is not set")
  const key = createHash("sha256").update(secret).digest()
  const ciphertext = Buffer.from(ciphertextB64, "base64")
  const iv = Buffer.from(ivB64, "base64")
  const encrypted = ciphertext.subarray(0, ciphertext.length - 16)
  const tag = ciphertext.subarray(ciphertext.length - 16)
  const decipher = createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    "utf8",
  )
}

export interface McpServerRow {
  id: string
  name: string
  url: string
  enabled: boolean
  encrypted_auth: string | null
  auth_iv: string | null
}

export async function loadServer(
  userId: string,
  serverId: string,
): Promise<McpServerRow | null> {
  const supabase = getServiceSupabase()
  const { data, error } = await supabase
    .from("user_mcp_servers")
    .select("id, name, url, enabled, encrypted_auth, auth_iv")
    .eq("user_id", userId)
    .eq("id", serverId)
    .single()
  if (error || !data) return null
  return data as McpServerRow
}

export function resolveAuthHeader(row: McpServerRow): string | null {
  if (!row.encrypted_auth || !row.auth_iv) return null
  try {
    return decryptAuth(row.encrypted_auth, row.auth_iv)
  } catch {
    return null
  }
}

/** Basic SSRF re-check on stored URL (defence in depth — write-time also checks). */
export function urlIsSafe(raw: string): boolean {
  try {
    const u = new URL(raw)
    if (u.protocol !== "http:" && u.protocol !== "https:") return false
    const h = u.hostname
    if (h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0") return false
    if (h === "[::1]" || h === "[::]") return false
    const parts = h.split(".")
    if (parts.length === 4 && parts.every((p) => /^\d+$/.test(p))) {
      const [a, b] = parts.map(Number)
      if (a === 10) return false
      if (a === 172 && b >= 16 && b <= 31) return false
      if (a === 192 && b === 168) return false
      if (a === 169 && b === 254) return false
      if (a === 127 || a === 0) return false
    }
    if (h.endsWith(".internal") || h.endsWith(".local")) return false
    return true
  } catch {
    return false
  }
}

export interface JsonRpcRequest {
  jsonrpc: "2.0"
  id: number
  method: string
  params?: Record<string, unknown>
}

export interface JsonRpcResponse {
  jsonrpc: "2.0"
  id: number
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

/**
 * POST a JSON-RPC request to an MCP endpoint. Accepts either a plain JSON
 * response or an SSE stream (we read the first `data:` event as JSON).
 */
export async function mcpPost(
  url: string,
  body: JsonRpcRequest,
  authHeader: string | null,
  timeoutMs = 15000,
): Promise<JsonRpcResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  }
  if (authHeader) headers["Authorization"] = authHeader

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(
      `MCP server HTTP ${res.status}: ${text.slice(0, 200) || res.statusText}`,
    )
  }

  const ct = res.headers.get("content-type") || ""
  if (ct.includes("text/event-stream")) {
    const text = await res.text()
    // Find the first `data: { ... }` line containing a JSON-RPC response
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^data:\s*(\{.*\})$/)
      if (!m) continue
      try {
        const parsed = JSON.parse(m[1]) as JsonRpcResponse
        if (parsed.jsonrpc === "2.0" && parsed.id === body.id) return parsed
      } catch {
        continue
      }
    }
    throw new Error("MCP server returned SSE without a matching response")
  }

  const json = (await res.json()) as JsonRpcResponse
  if (json.jsonrpc !== "2.0")
    throw new Error("MCP server returned non-JSON-RPC response")
  return json
}

let idCounter = 1
export function nextRpcId(): number {
  idCounter = (idCounter % 1_000_000) + 1
  return idCounter
}
