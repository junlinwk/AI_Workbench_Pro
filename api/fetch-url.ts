// ─── Inline helpers ──────────────────────────────────────────────────

function validateUrl(raw: string): URL | null {
  try {
    const u = new URL(raw)
    if (u.protocol !== "http:" && u.protocol !== "https:") return null
    const h = u.hostname
    if (h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0") return null
    const parts = h.split(".")
    if (parts.length === 4 && parts.every((p) => /^\d+$/.test(p))) {
      const a = Number(parts[0]), b = Number(parts[1])
      if (a === 10 || a === 127 || a === 0) return null
      if (a === 172 && b >= 16 && b <= 31) return null
      if (a === 192 && b === 168) return null
      if (a === 169 && b === 254) return null
    }
    if (h.endsWith(".internal") || h.endsWith(".local")) return null
    if (u.username || u.password) return null
    return u
  } catch { return null }
}

function strip(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ").trim()
}

// ─── Handler ────────────────────────────────────────────────────────

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    return res.status(405).json({ text: "", error: "Method not allowed" })
  }

  const targetUrl = (
    (typeof req.query.url === "string" ? req.query.url : "") || ""
  ).trim()
  if (!targetUrl) return res.json({ text: "", error: "No URL" })

  const parsed = validateUrl(targetUrl)
  if (!parsed) {
    return res.status(400).json({ text: "", error: "Invalid or blocked URL" })
  }

  try {
    const response = await fetch(parsed.href, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AIWorkbench/1.0)",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(9000),
    })
    if (!response.ok) return res.json({ text: "", error: `HTTP ${response.status}` })

    const ct = response.headers.get("content-type") || ""
    if (!ct.includes("text/html") && !ct.includes("text/plain") && !ct.includes("application/xhtml")) {
      return res.json({ text: "", error: "Unsupported content type" })
    }

    const rawHtml = await response.text()
    const titleMatch = rawHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    const title = titleMatch ? strip(titleMatch[1]) : ""
    let text = strip(rawHtml)
    if (text.length > 4000) text = text.slice(0, 4000) + "... (truncated)"
    res.json({ title, text, url: parsed.href })
  } catch {
    res.json({ text: "", error: "Fetch failed" })
  }
}
