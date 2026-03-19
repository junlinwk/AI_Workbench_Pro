// ─── AI Chat Proxy — Server-side key injection ─────────────────────────────
import { createClient } from "@supabase/supabase-js"
import { createDecipheriv, createHash } from "crypto"

// ── Inline helpers (avoid cross-file import issues on Vercel ESM) ──

function getServiceSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function getAuthenticatedUserId(authHeader: string | string[] | undefined): Promise<string | null> {
  if (!authHeader || typeof authHeader !== "string") return null
  const token = authHeader.replace(/^Bearer\s+/i, "").trim()
  if (!token) return null
  try {
    const supabase = getServiceSupabase()
    const { data, error } = await (supabase.auth as any).getUser(token)
    if (error || !data?.user) return null
    return data.user.id
  } catch { return null }
}

function decryptApiKey(ciphertext: Buffer, iv: Buffer): string {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET
  if (!secret) throw new Error("API_KEY_ENCRYPTION_SECRET is not set")
  const key = createHash("sha256").update(secret).digest()
  const encrypted = ciphertext.subarray(0, ciphertext.length - 16)
  const tag = ciphertext.subarray(ciphertext.length - 16)
  const decipher = createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8")
}

// ── Constants ──

const ALLOWED_PREFIXES = [
  "https://api.openai.com/",
  "https://api.anthropic.com/",
  "https://generativelanguage.googleapis.com/",
  "https://api.deepseek.com/",
  "https://api.x.ai/",
  "https://api.groq.com/",
  "https://api.mistral.ai/",
  "https://openrouter.ai/",
]

const BLOCKED = new Set([
  "host", "cookie", "set-cookie", "origin",
  "x-forwarded-for", "x-real-ip",
])

function isAllowed(url: string) {
  return ALLOWED_PREFIXES.some((p) => url.startsWith(p))
}

function validateUrl(raw: string): URL | null {
  try {
    const u = new URL(raw)
    if (u.protocol !== "http:" && u.protocol !== "https:") return null
    const h = u.hostname
    if (h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0") return null
    if (u.username || u.password) return null
    return u
  } catch { return null }
}

async function getStoredApiKey(userId: string, provider: string): Promise<string | null> {
  try {
    const supabase = getServiceSupabase()
    const lookupProviders = provider === "meta" ? ["groq", "meta"] : provider === "groq" ? ["groq", "meta"] : [provider]
    for (const p of lookupProviders) {
      const { data, error } = await supabase
        .from("user_api_keys")
        .select("encrypted_key, iv")
        .eq("user_id", userId)
        .eq("provider", p)
        .single()
      console.log(`[getStoredApiKey] userId=${userId.slice(0,8)}… provider=${p} found=${!!data} error=${error?.message || "none"}`)
      if (!error && data) {
        const ciphertext = Buffer.from(data.encrypted_key, "base64")
        const iv = Buffer.from(data.iv, "base64")
        return decryptApiKey(ciphertext, iv)
      }
    }
    return null
  } catch (err: any) {
    console.error("[getStoredApiKey] Exception:", err.message)
    return null
  }
}

function buildProviderHeaders(provider: string, apiKey: string): Record<string, string> {
  switch (provider) {
    case "anthropic":
      return { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" }
    case "google":
      return { "Content-Type": "application/json", "x-goog-api-key": apiKey }
    case "openrouter":
      return { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "HTTP-Referer": "https://ai-workbench.app", "X-OpenRouter-Title": "AI Workbench" }
    default:
      return { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }
  }
}

// ─── Handler ────────────────────────────────────────────────────────────

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const { endpoint, headers: fwdHeaders, body, provider } = (req.body || {}) as {
    endpoint?: string
    headers?: Record<string, string>
    body?: unknown
    provider?: string
  }

  if (!endpoint || typeof endpoint !== "string") {
    return res.status(400).json({ error: "Missing endpoint" })
  }

  if (!isAllowed(endpoint)) {
    return res.status(403).json({ error: "Endpoint not allowed" })
  }

  const parsed = validateUrl(endpoint)
  if (!parsed) {
    return res.status(400).json({ error: "Invalid endpoint URL" })
  }

  let finalHeaders: Record<string, string> = {}

  // New flow: provider-based, fetch key from DB
  if (provider && typeof provider === "string") {
    const userId = await getAuthenticatedUserId(req.headers.authorization)
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized — login required for server-side keys" })
    }

    const apiKey = await getStoredApiKey(userId, provider)
    if (!apiKey) {
      return res.status(404).json({ error: `No API key found for provider: ${provider}` })
    }

    finalHeaders = buildProviderHeaders(provider, apiKey)
  }
  // Legacy flow: client sends raw headers (backward compat)
  else if (fwdHeaders && typeof fwdHeaders === "object") {
    for (const [k, v] of Object.entries(fwdHeaders)) {
      if (typeof v === "string" && !BLOCKED.has(k.toLowerCase())) {
        finalHeaders[k] = v
      }
    }
  }

  try {
    const apiRes = await fetch(parsed.href, {
      method: "POST",
      headers: finalHeaders,
      body: typeof body === "string" ? body : JSON.stringify(body),
    })

    const responseText = await apiRes.text()

    res.status(apiRes.status)
    const ct = apiRes.headers.get("content-type")
    if (ct) res.setHeader("content-type", ct)
    const retryAfter = apiRes.headers.get("retry-after")
    if (retryAfter) res.setHeader("retry-after", retryAfter)

    return res.send(responseText)
  } catch (err: any) {
    console.error("[ai/chat] Proxy error:", err?.message || err)
    if (!res.headersSent) {
      return res.status(502).json({
        error: "AI API request failed",
        detail: err?.message || "Unknown error",
      })
    }
  }
}
