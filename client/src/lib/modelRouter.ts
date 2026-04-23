/**
 * modelRouter — Phase 4 auto-routing library
 *
 * Picks an effective model id for the "auto" pseudo-model based on message
 * characteristics. Two tiers:
 *
 *   Tier-1 (always runs): zero-cost heuristics (attachments, length, keywords)
 *   Tier-2 (optional):    cheap classifier LLM when user enables ai-assisted
 *
 * Integration happens in Phase 5 — this module has no side effects and does
 * not touch UI. The caller is responsible for supplying RoutingContext.
 */
import type { RoutingPrefs } from "@/contexts/SettingsContext"
import { callAI, VISION_MODELS } from "@/lib/aiClient"

export interface RoutingContext {
  /** The user's new message text (just the latest input, not history) */
  text: string
  /** Current user message attachments */
  hasImage: boolean
  hasPdf: boolean
  hasOtherFile: boolean
  /** Rough token estimate across entire conversation history being sent */
  totalHistoryTokens: number
  /** Available models (filter out any the user doesn't have API keys for) */
  availableModelIds: Set<string>
}

export interface RoutingDecision {
  modelId: string
  /** Category chosen, for UI display */
  bucket: "vision" | "reasoning" | "cheap" | "longContext" | "balanced"
  /** Which tier made the decision, for debugging */
  tier: "heuristic" | "ai-assisted"
  /** Short human-readable reason */
  reason: string
}

/** Rough token estimate: ~4 chars per token (OpenAI rule of thumb). */
export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}

const REASONING_RE =
  /\b(prove|theorem|derive|step.?by.?step|reason (through|about)|analyze deeply|think carefully|mathematical|calculate|algorithm complexity)\b/i

const GREETING_RE = /^(hi|hello|hey|thanks|ok|你好|嗨|哈囉|謝|好|嗯)/i

type Bucket = RoutingDecision["bucket"]

interface Tier1Hit {
  bucket: Bucket
  modelId: string
  reason: string
}

function pickLongContextModel(prefs: RoutingPrefs): string {
  return prefs.defaults.longContext
}

/**
 * Tier-1 heuristic. Returns a bucket+model+reason or null when no rule fires.
 */
function tier1(ctx: RoutingContext, prefs: RoutingPrefs): Tier1Hit | null {
  if (ctx.hasImage) {
    return {
      bucket: "vision",
      modelId: prefs.defaults.vision,
      reason: "image attachment",
    }
  }

  if (ctx.hasPdf) {
    // Prefer long-context native PDF reader (Claude/Gemini). If the user has
    // configured a non-Gemini long-context model and claude-sonnet-4-6 is
    // available, keep the user's preference. Otherwise use the long-context
    // default directly.
    const longCtx = prefs.defaults.longContext
    const isGemini = /gemini/i.test(longCtx)
    if (
      !isGemini &&
      ctx.availableModelIds.size > 0 &&
      ctx.availableModelIds.has("claude-sonnet-4-6")
    ) {
      // Keep the user's long-context preference as-is.
      return {
        bucket: "longContext",
        modelId: longCtx,
        reason:
          "PDF attachment — prefer long-context native reader",
      }
    }
    return {
      bucket: "longContext",
      modelId: longCtx,
      reason: "PDF attachment — prefer long-context native reader",
    }
  }

  if (ctx.totalHistoryTokens > 50_000) {
    return {
      bucket: "longContext",
      modelId: pickLongContextModel(prefs),
      reason: `history ~${ctx.totalHistoryTokens} tokens exceeds 50k threshold`,
    }
  }

  if (REASONING_RE.test(ctx.text)) {
    return {
      bucket: "reasoning",
      modelId: prefs.defaults.reasoning,
      reason: "reasoning keyword detected",
    }
  }

  if (ctx.text.length < 30 && GREETING_RE.test(ctx.text.trim())) {
    return {
      bucket: "cheap",
      modelId: prefs.defaults.cheap,
      reason: "short greeting / trivial message",
    }
  }

  return null
}

/** Parse classifier response into a bucket. Defaults to "balanced". */
function parseBucket(raw: string): Bucket {
  const s = raw.trim().toLowerCase()
  // Take the first token-like word to be resilient to extra prose.
  const first = s.split(/[^a-z]+/).filter(Boolean)[0] ?? ""
  if (first === "cheap") return "cheap"
  if (first === "reasoning") return "reasoning"
  if (first === "longcontext" || first === "long") return "longContext"
  if (first === "balanced") return "balanced"
  return "balanced"
}

function modelForBucket(bucket: Bucket, prefs: RoutingPrefs): string {
  switch (bucket) {
    case "vision":
      return prefs.defaults.vision
    case "reasoning":
      return prefs.defaults.reasoning
    case "cheap":
      return prefs.defaults.cheap
    case "longContext":
      return prefs.defaults.longContext
    case "balanced":
    default:
      return prefs.defaults.balanced
  }
}

async function tier2(
  ctx: RoutingContext,
  prefs: RoutingPrefs,
  opts: { fallbackApiKey?: string; signal?: AbortSignal },
): Promise<{ bucket: Bucket; modelId: string; reason: string }> {
  const snippet = ctx.text.slice(0, 500)
  const prompt =
    "Classify this user message into exactly one category and respond " +
    "with ONLY the category name, nothing else.\n\n" +
    "Categories:\n" +
    "- cheap    (simple question, small talk, quick edit)\n" +
    "- balanced (general question, normal reasoning)\n" +
    "- reasoning (complex math/logic/stepwise analysis)\n" +
    "- longContext (requires large context window)\n\n" +
    `User message: "${snippet}"\n\n` +
    "Category:"

  try {
    const raw = await callAI(
      [{ role: "user", content: prompt }],
      prefs.classifierModel,
      opts.fallbackApiKey,
      0,
      10,
      "Output only one word: the category name.",
      opts.signal,
    )
    const bucket = parseBucket(raw)
    return {
      bucket,
      modelId: modelForBucket(bucket, prefs),
      reason: `classifier → ${bucket}`,
    }
  } catch {
    return {
      bucket: "balanced",
      modelId: prefs.defaults.balanced,
      reason: "classifier failed — fallback to balanced",
    }
  }
}

/**
 * Apply availability guardrail. If the chosen id isn't available, fall back
 * through: chosen → balanced → first available. Keeps the original bucket
 * but appends " (fallback)" to the reason when a substitution happens.
 */
function guardAvailability(
  chosenId: string,
  bucket: Bucket,
  reason: string,
  prefs: RoutingPrefs,
  available: Set<string>,
): { modelId: string; reason: string } {
  if (available.size === 0) return { modelId: chosenId, reason }
  if (available.has(chosenId)) return { modelId: chosenId, reason }

  const balanced = prefs.defaults.balanced
  if (available.has(balanced)) {
    return { modelId: balanced, reason: `${reason} (fallback)` }
  }

  const first = available.values().next().value
  if (typeof first === "string") {
    return { modelId: first, reason: `${reason} (fallback)` }
  }

  // Should be unreachable because size > 0, but keep type-safe.
  return { modelId: chosenId, reason }
}

/**
 * Pick an effective model id for the current message. Always resolves to a
 * RoutingDecision — never throws. On classifier failure, falls back to the
 * balanced default.
 */
export async function pickModel(
  ctx: RoutingContext,
  prefs: RoutingPrefs,
  opts?: {
    fallbackApiKey?: string
    signal?: AbortSignal
  },
): Promise<RoutingDecision> {
  const hit = tier1(ctx, prefs)

  if (hit) {
    const guarded = guardAvailability(
      hit.modelId,
      hit.bucket,
      hit.reason,
      prefs,
      ctx.availableModelIds,
    )
    return {
      modelId: guarded.modelId,
      bucket: hit.bucket,
      tier: "heuristic",
      reason: guarded.reason,
    }
  }

  if (prefs.mode === "ai-assisted") {
    const result = await tier2(ctx, prefs, {
      fallbackApiKey: opts?.fallbackApiKey,
      signal: opts?.signal,
    })
    const guarded = guardAvailability(
      result.modelId,
      result.bucket,
      result.reason,
      prefs,
      ctx.availableModelIds,
    )
    return {
      modelId: guarded.modelId,
      bucket: result.bucket,
      tier: "ai-assisted",
      reason: guarded.reason,
    }
  }

  // Heuristic-only mode and no tier-1 hit → balanced default.
  const guarded = guardAvailability(
    prefs.defaults.balanced,
    "balanced",
    "no tier-1 match — default balanced",
    prefs,
    ctx.availableModelIds,
  )
  return {
    modelId: guarded.modelId,
    bucket: "balanced",
    tier: "heuristic",
    reason: guarded.reason,
  }
}

/**
 * Re-export VISION_MODELS for callers that need to cross-check availability
 * before marking `hasImage` true. Keeps the router the single import surface
 * for Phase 5 integration code.
 */
export { VISION_MODELS }
