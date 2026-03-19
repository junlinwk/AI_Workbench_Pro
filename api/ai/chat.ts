// ─── AI Chat Proxy — Server-side key injection ─────────────────────────────
//
// New flow: client sends { endpoint, body, provider } — NO raw API keys.
// The proxy fetches the encrypted key from the DB, decrypts it, and injects
// the correct auth header before forwarding to the AI provider.
//
// Backward compat: if `headers` with an auth key is present (old client),
// it is still accepted but will be removed in a future version.

import { getAuthenticatedUserId, getServiceSupabase } from "../_lib/auth"
import { decryptApiKey } from "../_lib/encryption"

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

/**
 * Fetch the user's API key for a given provider from the DB, decrypt it.
 */
async function getStoredApiKey(userId: string, provider: string): Promise<string | null> {
  try {
    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from("user_api_keys")
      .select("encrypted_key, iv")
      .eq("user_id", userId)
      .eq("provider", provider)
      .single()

    if (error || !data) return null
    const ciphertext = Buffer.from(data.encrypted_key, "base64")
    const iv = Buffer.from(data.iv, "base64")
    return decryptApiKey(ciphertext, iv)
  } catch {
    return null
  }
}

/**
 * Build the correct auth headers for each AI provider.
 */
function buildProviderHeaders(provider: string, apiKey: string): Record<string, string> {
  switch (provider) {
    case "anthropic":
      return {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      }
    case "google":
      return {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      }
    case "openrouter":
      return {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://ai-workbench.app",
        "X-OpenRouter-Title": "AI Workbench",
      }
    default:
      // OpenAI, DeepSeek, xAI, Groq, Meta, Mistral — all use Bearer
      return {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      }
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

  // ── New flow: provider-based, fetch key from DB ──
  if (provider && typeof provider === "string") {
    const userId = await getAuthenticatedUserId(req.headers.authorization)
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized — login required for server-side keys" })
    }

    // Groq and Meta share the same key
    const lookupProvider = provider === "meta" ? "groq" : provider

    const apiKey = await getStoredApiKey(userId, lookupProvider)
    if (!apiKey) {
      return res.status(404).json({ error: `No API key found for provider: ${provider}` })
    }

    finalHeaders = buildProviderHeaders(provider, apiKey)
  }
  // ── Legacy flow: client sends raw headers (backward compat) ──
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
