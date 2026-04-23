/**
 * /api/mcp/servers — CRUD for user's MCP server configs.
 *
 *   GET                 → list this user's servers (no secrets)
 *   POST { id?, name, url, auth_header?, enabled? } → upsert
 *   DELETE ?id=<uuid>   → remove one
 *
 * auth_header is encrypted with the same AES-256-GCM scheme as user_api_keys.
 */
import { createClient } from "@supabase/supabase-js"
import { createCipheriv, createHash, randomBytes } from "crypto"

function getServiceSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key)
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function getAuthenticatedUserId(
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

function encryptAuth(plaintext: string): {
  ciphertext: Buffer
  iv: Buffer
} {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET
  if (!secret) throw new Error("API_KEY_ENCRYPTION_SECRET is not set")
  const key = createHash("sha256").update(secret).digest()
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return { ciphertext: Buffer.concat([encrypted, tag]), iv }
}

function validUrl(raw: string): URL | null {
  try {
    const u = new URL(raw)
    if (u.protocol !== "http:" && u.protocol !== "https:") return null
    // Block localhost / private ranges to avoid SSRF (matches api/_lib/security.ts)
    const h = u.hostname
    if (h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0") return null
    if (h === "[::1]" || h === "[::]") return null
    const parts = h.split(".")
    if (parts.length === 4 && parts.every((p) => /^\d+$/.test(p))) {
      const [a, b] = parts.map(Number)
      if (a === 10) return null
      if (a === 172 && b >= 16 && b <= 31) return null
      if (a === 192 && b === 168) return null
      if (a === 169 && b === 254) return null
      if (a === 127 || a === 0) return null
    }
    if (h.endsWith(".internal") || h.endsWith(".local")) return null
    if (u.username || u.password) return null
    return u
  } catch {
    return null
  }
}

export default async function handler(req: any, res: any) {
  const userId = await getAuthenticatedUserId(req.headers.authorization)
  if (!userId) return res.status(401).json({ error: "Unauthorized" })
  const supabase = getServiceSupabase()

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("user_mcp_servers")
      .select("id, name, url, auth_hint, enabled, created_at, updated_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ servers: data || [] })
  }

  if (req.method === "POST") {
    const { id, name, url, authHeader, enabled } = req.body || {}
    if (!name || typeof name !== "string" || name.length > 100)
      return res.status(400).json({ error: "Invalid name" })
    if (typeof url !== "string" || !validUrl(url))
      return res
        .status(400)
        .json({ error: "Invalid URL — must be http(s) and public" })

    const row: any = {
      user_id: userId,
      name: name.slice(0, 100),
      url,
      enabled: enabled !== false,
      updated_at: new Date().toISOString(),
    }

    if (typeof authHeader === "string" && authHeader.length > 0) {
      if (authHeader.length > 2000)
        return res.status(400).json({ error: "Auth header too long" })
      try {
        const { ciphertext, iv } = encryptAuth(authHeader)
        row.encrypted_auth = ciphertext.toString("base64")
        row.auth_iv = iv.toString("base64")
        row.auth_hint = authHeader.slice(0, 12) + "…"
      } catch (err: any) {
        return res
          .status(500)
          .json({ error: err.message || "Encryption failed" })
      }
    } else if (authHeader === null) {
      row.encrypted_auth = null
      row.auth_iv = null
      row.auth_hint = null
    }

    let result
    if (typeof id === "string" && id.length > 0) {
      result = await supabase
        .from("user_mcp_servers")
        .update(row)
        .eq("id", id)
        .eq("user_id", userId)
        .select("id, name, url, auth_hint, enabled")
        .single()
    } else {
      result = await supabase
        .from("user_mcp_servers")
        .insert(row)
        .select("id, name, url, auth_hint, enabled")
        .single()
    }
    if (result.error)
      return res.status(500).json({ error: result.error.message })
    return res.status(200).json({ server: result.data })
  }

  if (req.method === "DELETE") {
    const id = typeof req.query?.id === "string" ? req.query.id : null
    if (!id) return res.status(400).json({ error: "Missing id" })
    const { error } = await supabase
      .from("user_mcp_servers")
      .delete()
      .eq("id", id)
      .eq("user_id", userId)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ success: true })
  }

  return res.status(405).json({ error: "Method not allowed" })
}
