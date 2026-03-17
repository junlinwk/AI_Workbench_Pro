import {
  rateLimit,
  getClientIp,
  validatePublicUrl,
  htmlToText,
} from "./_lib/security"

// Inline types to avoid @vercel/node dependency
interface VercelRequest {
  method?: string
  headers: Record<string, string | string[] | undefined>
  query: Record<string, string | string[] | undefined>
}

interface VercelResponse {
  status(code: number): VercelResponse
  json(body: unknown): VercelResponse
  setHeader(name: string, value: string): VercelResponse
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ text: "", error: "Method not allowed" })
  }

  const clientIp = getClientIp(req.headers)

  if (!rateLimit(clientIp, 60_000, 20)) {
    return res.status(429).json({ text: "", error: "Rate limited" })
  }

  const targetUrl = (
    (typeof req.query.url === "string" ? req.query.url : "") || ""
  ).trim()
  if (!targetUrl) return res.json({ text: "", error: "No URL" })

  // SSRF protection: validate URL
  const parsed = validatePublicUrl(targetUrl)
  if (!parsed) {
    return res
      .status(400)
      .json({ text: "", error: "Invalid or blocked URL" })
  }

  try {
    const response = await fetch(parsed.href, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,zh-TW;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok)
      return res.json({
        text: "",
        error: `HTTP ${response.status}`,
      })

    // Check content type — only process text/html
    const ct = response.headers.get("content-type") || ""
    if (
      !ct.includes("text/html") &&
      !ct.includes("text/plain") &&
      !ct.includes("application/xhtml")
    ) {
      return res.json({
        text: "",
        error: "Unsupported content type",
      })
    }

    const rawHtml = await response.text()
    const titleMatch = rawHtml.match(
      /<title[^>]*>([\s\S]*?)<\/title>/i,
    )
    const title = titleMatch ? htmlToText(titleMatch[1]) : ""
    let text = htmlToText(rawHtml)
    if (text.length > 4000)
      text = text.slice(0, 4000) + "... (truncated)"
    res.json({ title, text, url: parsed.href })
  } catch (err: any) {
    res.json({ text: "", error: "Fetch failed" })
  }
}
