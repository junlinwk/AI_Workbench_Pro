// ─── Inline security utilities (avoids ESM import issues on Vercel) ──────

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

// Headers to strip — NOTE: "http-referer" is NOT blocked (OpenRouter needs it)
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

// ─── Handler ────────────────────────────────────────────────────────────

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const { endpoint, headers: fwdHeaders, body } = (req.body || {}) as {
    endpoint?: string
    headers?: Record<string, string>
    body?: unknown
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

  const safeHeaders: Record<string, string> = {}
  if (fwdHeaders && typeof fwdHeaders === "object") {
    for (const [k, v] of Object.entries(fwdHeaders)) {
      if (typeof v === "string" && !BLOCKED.has(k.toLowerCase())) {
        safeHeaders[k] = v
      }
    }
  }

  try {
    const apiRes = await fetch(parsed.href, {
      method: "POST",
      headers: safeHeaders,
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
