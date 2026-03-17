/**
 * User-scoped storage utility
 *
 * Re-exports from the new storage facade (IndexedDB + Supabase sync).
 * The in-memory cache provides synchronous reads; IndexedDB and Supabase
 * are written to asynchronously in the background.
 *
 * Also exports input validation helpers that remain unchanged.
 */

// Re-export core storage API from the new facade
export {
  loadUserData,
  saveUserData,
  removeUserData,
  listUserDataByPattern,
  clearAllUserData,
  initStorage,
  resetStorage,
} from "./storage/index"

// Keep the key-building utility for backward compat
const PREFIX = "ai-wb"

export function getUserKey(
  userId: string,
  namespace: string,
): string {
  return `${PREFIX}-${namespace}-${userId}`
}

/**
 * Input validation helpers
 */

/**
 * Sanitize user input text:
 * - Truncate to maxLen
 * - Strip all HTML tags (script, style, iframe, embed, object, svg, etc.)
 * - Strip HTML event handlers (with or without quotes)
 * - Strip dangerous URI schemes (javascript:, data:, vbscript:)
 * - Normalise whitespace variants that could bypass filters
 */
export function sanitizeText(
  input: string,
  maxLen = 4096,
): string {
  return (
    input
      .slice(0, maxLen)
      // Remove null bytes and zero-width chars used to bypass filters
      .replace(/[\x00\u200B\u200C\u200D\uFEFF]/g, "")
      // Strip dangerous tags entirely (with content)
      .replace(
        /<\s*(script|style|iframe|embed|object|applet|form|base|link|meta)\b[^>]*>[\s\S]*?<\/\s*\1\s*>/gi,
        "",
      )
      // Strip self-closing dangerous tags
      .replace(
        /<\s*(script|style|iframe|embed|object|applet|form|base|link|meta)\b[^>]*\/?>/gi,
        "",
      )
      // Strip SVG with event handlers
      .replace(/<\s*svg\b[^>]*>[\s\S]*?<\/\s*svg\s*>/gi, "")
      // Strip ALL event handlers (on*=...) with or without quotes
      .replace(/\bon\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, "")
      // Strip dangerous URI schemes (handles whitespace/encoding tricks)
      .replace(
        /(?:java\s*script|vbscript|data)\s*:/gi,
        "",
      )
  )
}

export function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === "https:" || u.protocol === "http:"
  } catch {
    return false
  }
}

export function validateApiKeyFormat(
  provider: string,
  key: string,
): string | null {
  const trimmed = key.trim()
  if (!trimmed) return "API Key cannot be empty"
  if (trimmed.length < 10) return "API Key is too short"
  if (trimmed.length > 256) return "API Key is too long"

  const patterns: Record<string, RegExp> = {
    openai: /^sk-/,
    anthropic: /^sk-ant-/,
    google: /^AIza/,
    xai: /^xai-/,
  }

  const pat = patterns[provider]
  if (pat && !pat.test(trimmed)) {
    return `Key format doesn't match ${provider} pattern`
  }
  return null
}
