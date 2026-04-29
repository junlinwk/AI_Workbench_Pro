/**
 * PriorityRouter — Quota-aware fallback chain.
 *
 * When the user picks the "priority" pseudo-model, every AI call is wrapped in
 * `withPriority`, which tries each model in their configured priority order
 * (skipping any currently marked blocked in QuotaRegistry). When a call fails
 * with a quota / rate-limit error, the model is marked blocked and the chain
 * advances to the next entry.
 *
 * Recovery is implicit: each new user message starts again from the top of the
 * priority list, and entries auto-expire as their `blockedUntil` time passes.
 */
import { AIError } from "./aiClient"
import {
  getEntry,
  isBlocked,
  markBlocked,
  type QuotaReason,
} from "./quotaRegistry"

export interface PriorityResult<T> {
  /** Model that ultimately served the response. */
  modelId: string
  /** Whether we had to fall through one or more blocked / failing models. */
  felThrough: boolean
  /** Any models we skipped or marked along the way. */
  skipped: Array<{ modelId: string; reason: QuotaReason; message?: string }>
  /** The actual return value of `invoke`. */
  value: T
}

export class AllModelsExhaustedError extends Error {
  attempts: Array<{ modelId: string; reason: QuotaReason; message?: string }>
  constructor(
    attempts: Array<{ modelId: string; reason: QuotaReason; message?: string }>,
  ) {
    super(
      `All priority models are unavailable (${attempts.length} tried). Add credits, wait for the cap to reset, or pick a specific model.`,
    )
    this.name = "AllModelsExhaustedError"
    this.attempts = attempts
  }
}

/**
 * Run `invoke` against the first usable model in `priorityList`. On a quota
 * error, mark blocked and try the next one. On any non-quota error (e.g. user
 * abort, network, malformed schema), bubble immediately — those don't mean the
 * model is unhealthy.
 */
export async function withPriority<T>(
  priorityList: string[],
  invoke: (modelId: string) => Promise<T>,
  opts?: {
    /** Optional callback fired each time a model is skipped or marked blocked. */
    onSkip?: (modelId: string, reason: QuotaReason, message?: string) => void
    /** If every model is currently in the blocked map, try the *first* one anyway as a last-ditch attempt. Default true. */
    bypassWhenAllBlocked?: boolean
  },
): Promise<PriorityResult<T>> {
  if (!priorityList || priorityList.length === 0) {
    throw new Error("Priority list is empty. Configure models in Settings → Priority.")
  }

  const skipped: Array<{ modelId: string; reason: QuotaReason; message?: string }> = []
  let felThrough = false

  for (let i = 0; i < priorityList.length; i++) {
    const modelId = priorityList[i]
    if (!modelId) continue

    if (isBlocked(modelId)) {
      const entry = getEntry(modelId)
      const reason = entry?.reason ?? "rate_limit"
      skipped.push({ modelId, reason, message: entry?.message })
      opts?.onSkip?.(modelId, reason, entry?.message)
      felThrough = true
      continue
    }

    try {
      const value = await invoke(modelId)
      return { modelId, felThrough, skipped, value }
    } catch (err) {
      if (err instanceof AIError && err.isQuotaLike()) {
        const reason = err.quotaReason()
        markBlocked(modelId, {
          retryAfterMs: err.retryAfterMs,
          reason,
          message: err.message,
        })
        skipped.push({ modelId, reason, message: err.message })
        opts?.onSkip?.(modelId, reason, err.message)
        felThrough = true
        continue
      }
      // Auth failure on a specific provider — also fall through, but block longer.
      if (err instanceof AIError && err.status === 401) {
        markBlocked(modelId, {
          reason: "auth_failed",
          message: err.message,
        })
        skipped.push({ modelId, reason: "auth_failed", message: err.message })
        opts?.onSkip?.(modelId, "auth_failed", err.message)
        felThrough = true
        continue
      }
      if (err instanceof AIError && err.status === 404) {
        // No API key for this provider — block briefly and try next.
        markBlocked(modelId, {
          reason: "auth_failed",
          retryAfterMs: 60_000,
          message: err.message,
        })
        skipped.push({ modelId, reason: "auth_failed", message: err.message })
        opts?.onSkip?.(modelId, "auth_failed", err.message)
        felThrough = true
        continue
      }
      // Anything else: re-throw immediately.
      throw err
    }
  }

  // All models in the list are currently blocked. As a courtesy, try the first
  // entry once anyway — quotas reset on the providers' clock, not ours, and
  // this lets the user recover faster when their cap rolls over.
  if (opts?.bypassWhenAllBlocked !== false && priorityList.length > 0) {
    const fallback = priorityList[0]!
    try {
      const value = await invoke(fallback)
      return { modelId: fallback, felThrough: true, skipped, value }
    } catch {
      // fall through to error
    }
  }

  throw new AllModelsExhaustedError(skipped)
}

/* ------------------------------------------------------------------ */
/*  Provider-error parsing                                             */
/* ------------------------------------------------------------------ */

/**
 * Detect a quota / rate-limit signal in an arbitrary provider error response.
 *
 * Used by aiClient before throwing AIError. We check both HTTP status (429,
 * 529 for Anthropic overloaded) and parse the body for provider-specific codes
 * since some providers signal monthly-quota-exhausted with non-429 statuses.
 */
const QUOTA_CODES = new Set([
  // OpenAI / DeepSeek / xAI / Mistral / Groq / OpenRouter (OpenAI-compat)
  "insufficient_quota",
  "rate_limit_exceeded",
  "billing_hard_limit_reached",
  // Anthropic
  "rate_limit_error",
  "overloaded_error",
  // Google
  "resource_exhausted",
  // Generic
  "quota_exceeded",
  "too_many_requests",
])

export function detectQuota(
  status: number,
  bodyText: string,
): {
  isQuota: boolean
  reason: QuotaReason
  providerCode?: string
} {
  if (status === 429) {
    return { isQuota: true, reason: "rate_limit", providerCode: classifyBody(bodyText) }
  }
  if (status === 529) {
    return { isQuota: true, reason: "overloaded", providerCode: "overloaded_error" }
  }

  const code = classifyBody(bodyText)
  if (code && QUOTA_CODES.has(code)) {
    if (code === "insufficient_quota" || code === "billing_hard_limit_reached") {
      return { isQuota: true, reason: "quota_exceeded", providerCode: code }
    }
    if (code === "overloaded_error") {
      return { isQuota: true, reason: "overloaded", providerCode: code }
    }
    return { isQuota: true, reason: "rate_limit", providerCode: code }
  }
  return { isQuota: false, reason: "unknown" }
}

function classifyBody(bodyText: string): string | undefined {
  if (!bodyText) return undefined
  // Try JSON first.
  try {
    const j = JSON.parse(bodyText) as {
      error?: { code?: unknown; type?: unknown; status?: unknown; message?: unknown }
    }
    const candidates = [j?.error?.code, j?.error?.type, j?.error?.status]
    for (const c of candidates) {
      if (typeof c === "string") return c.toLowerCase()
    }
    // Some providers put the code in error.message free-text.
    const msg = j?.error?.message
    if (typeof msg === "string") return scanMessage(msg)
  } catch {
    // Not JSON — scan raw body.
  }
  return scanMessage(bodyText)
}

function scanMessage(s: string): string | undefined {
  const lower = s.toLowerCase()
  for (const code of QUOTA_CODES) {
    if (lower.includes(code)) return code
  }
  // Heuristic phrases.
  if (/insufficient[\s_-]?quota/.test(lower)) return "insufficient_quota"
  if (/rate[\s_-]?limit/.test(lower)) return "rate_limit_exceeded"
  if (/quota[\s_-]?exceeded/.test(lower)) return "quota_exceeded"
  if (/resource[\s_-]?exhausted/.test(lower)) return "resource_exhausted"
  if (/over[\s_-]?capacity|overloaded/.test(lower)) return "overloaded_error"
  if (/too many requests/.test(lower)) return "too_many_requests"
  return undefined
}
