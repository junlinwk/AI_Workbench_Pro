// ─── Shared security utilities for Vercel Serverless Functions ──────────────

// ─── Rate limiter (in-memory, per-IP) ────────────────────────────────────
// NOTE: In Vercel serverless, each function invocation may run in a separate
// container, so this rate limiter is best-effort. For production, consider
// using Vercel KV or Upstash Redis.
interface RateBucket {
  count: number
  resetAt: number
}
const rateBuckets = new Map<string, RateBucket>()

export function rateLimit(
  ip: string,
  windowMs: number,
  maxRequests: number,
): boolean {
  const now = Date.now()
  const bucket = rateBuckets.get(ip)

  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + windowMs })
    return true
  }

  if (bucket.count >= maxRequests) {
    return false
  }

  bucket.count++
  return true
}

// ─── SSRF protection: block private/reserved IP ranges ──────────────────
export function isPrivateOrReserved(hostname: string): boolean {
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "[::1]" ||
    hostname === "[::]"
  ) {
    return true
  }

  const parts = hostname.split(".")
  if (parts.length === 4 && parts.every((p) => /^\d+$/.test(p))) {
    const [a, b] = parts.map(Number)
    if (a === 10) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 169 && b === 254) return true
    if (a === 127) return true
    if (a === 0) return true
  }

  if (
    hostname.endsWith(".internal") ||
    hostname.endsWith(".local") ||
    hostname === "metadata.google.internal"
  ) {
    return true
  }

  return false
}

export function validatePublicUrl(rawUrl: string): URL | null {
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    if (isPrivateOrReserved(url.hostname)) return null
    if (url.username || url.password) return null
    return url
  } catch {
    return null
  }
}

// ─── Helper: strip HTML ──────────────────────────────────────────────
export function htmlToText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

// ─── Allowed AI provider endpoints (whitelist) ──────────────────────
export const ALLOWED_AI_ENDPOINTS: Record<string, string[]> = {
  openai: ["https://api.openai.com/"],
  anthropic: ["https://api.anthropic.com/"],
  google: ["https://generativelanguage.googleapis.com/"],
  deepseek: ["https://api.deepseek.com/"],
  xai: ["https://api.x.ai/"],
  groq: ["https://api.groq.com/"],
  mistral: ["https://api.mistral.ai/"],
  openrouter: ["https://openrouter.ai/"],
}

export function isAllowedAIEndpoint(url: string): boolean {
  return Object.values(ALLOWED_AI_ENDPOINTS)
    .flat()
    .some((prefix) => url.startsWith(prefix))
}

// ─── Extract client IP from Vercel request headers ──────────────────
export function getClientIp(headers: Record<string, string | string[] | undefined>): string {
  const forwarded = headers["x-forwarded-for"]
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0]?.trim() || "unknown"
  }
  if (Array.isArray(forwarded)) {
    return forwarded[0]?.split(",")[0]?.trim() || "unknown"
  }
  return (headers["x-real-ip"] as string) || "unknown"
}

// ─── Blocked headers for AI proxy forwarding ────────────────────────
export const BLOCKED_HEADERS = new Set([
  "host",
  "cookie",
  "set-cookie",
  "origin",
  "referer",
  "x-forwarded-for",
  "x-real-ip",
])
