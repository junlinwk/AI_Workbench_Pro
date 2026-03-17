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
  write(chunk: any): boolean
  end(): VercelResponse
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

  // Rate limit: 60 requests per minute per IP
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

  // Whitelist check
  if (!isAllowedAIEndpoint(endpoint)) {
    return res.status(403).json({ error: "Endpoint not allowed" })
  }

  // Validate URL against SSRF
  const parsed = validatePublicUrl(endpoint)
  if (!parsed) {
    return res.status(400).json({ error: "Invalid endpoint URL" })
  }

  // Strip any dangerous headers from forwarded set
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
    const apiRes = await fetch(parsed.href, {
      method: "POST",
      headers: safeHeaders,
      body: typeof body === "string" ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(120_000), // 2 min for AI responses
    })

    // Forward status code
    res.status(apiRes.status)

    // Only forward safe response headers
    for (const [key, value] of apiRes.headers) {
      if (
        key === "content-type" ||
        key === "retry-after" ||
        key === "x-ratelimit-remaining"
      ) {
        res.setHeader(key, value)
      }
    }

    // Stream the response back to the client
    if (apiRes.body) {
      const reader = apiRes.body.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          res.end()
          return
        }
        res.write(value)
      }
    } else {
      const text = await apiRes.text()
      res.send(text)
    }
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(502).json({ error: "AI API request failed" })
    }
  }
}
