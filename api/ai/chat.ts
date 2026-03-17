import {
  rateLimit,
  getClientIp,
  validatePublicUrl,
  isAllowedAIEndpoint,
  BLOCKED_HEADERS,
} from "../_lib/security"

// Inline types to avoid @vercel/node dependency
interface VercelRequest {
  method?: string
  headers: Record<string, string | string[] | undefined>
  query: Record<string, string | string[] | undefined>
  body?: any
}

interface VercelResponse {
  status(code: number): VercelResponse
  json(body: unknown): VercelResponse
  setHeader(name: string, value: string): VercelResponse
  send(body: any): VercelResponse
  headersSent: boolean
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const clientIp = getClientIp(req.headers)

  if (!rateLimit(clientIp, 60_000, 60)) {
    return res.status(429).json({ error: "Rate limited" })
  }

  const { endpoint, headers: fwdHeaders, body } = (req.body || {}) as {
    endpoint?: string
    headers?: Record<string, string>
    body?: unknown
  }

  if (!endpoint || typeof endpoint !== "string") {
    return res.status(400).json({ error: "Missing endpoint" })
  }

  if (!isAllowedAIEndpoint(endpoint)) {
    return res.status(403).json({ error: "Endpoint not allowed" })
  }

  const parsed = validatePublicUrl(endpoint)
  if (!parsed) {
    return res.status(400).json({ error: "Invalid endpoint URL" })
  }

  const safeHeaders: Record<string, string> = {}
  if (fwdHeaders && typeof fwdHeaders === "object") {
    for (const [k, v] of Object.entries(fwdHeaders)) {
      if (
        typeof v === "string" &&
        !BLOCKED_HEADERS.has(k.toLowerCase())
      ) {
        safeHeaders[k] = v
      }
    }
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 55_000)

    const apiRes = await fetch(parsed.href, {
      method: "POST",
      headers: safeHeaders,
      body: typeof body === "string" ? body : JSON.stringify(body),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    // Read full response as text (no streaming — Vercel serverless doesn't support it well)
    const responseText = await apiRes.text()

    res.status(apiRes.status)

    const ct = apiRes.headers.get("content-type")
    if (ct) res.setHeader("content-type", ct)

    const retryAfter = apiRes.headers.get("retry-after")
    if (retryAfter) res.setHeader("retry-after", retryAfter)

    return res.send(responseText)
  } catch (err: any) {
    if (err?.name === "AbortError") {
      return res.status(504).json({ error: "AI API request timed out" })
    }
    if (!res.headersSent) {
      return res.status(502).json({ error: "AI API request failed" })
    }
  }
}
