/**
 * QuotaRegistry — Per-model "blocked until" map for the priority-fallback router.
 *
 * Persisted to localStorage so that hitting a quota cap survives reloads, with a
 * BroadcastChannel for instant cross-tab sync (one tab gets 429 → all tabs skip
 * that model). Falls back to the `storage` event for browsers without BC.
 *
 * Entries auto-expire on read; we never run a timer.
 */

const STORAGE_KEY = "ai-workbench-quota-registry-v1"
const CHANNEL_NAME = "ai-workbench-quota"

export type QuotaReason =
  | "rate_limit"
  | "quota_exceeded"
  | "overloaded"
  | "auth_failed"
  | "unknown"

export interface QuotaEntry {
  modelId: string
  blockedUntil: number // epoch ms
  reason: QuotaReason
  message?: string
}

interface PersistedShape {
  version: 1
  entries: QuotaEntry[]
}

/* ------------------------------------------------------------------ */
/*  Storage                                                            */
/* ------------------------------------------------------------------ */

function readAll(): QuotaEntry[] {
  if (typeof localStorage === "undefined") return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as PersistedShape
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.entries)) return []
    const now = Date.now()
    // Filter out expired entries on every read so the file stays small.
    return parsed.entries.filter(
      (e) =>
        e &&
        typeof e.modelId === "string" &&
        typeof e.blockedUntil === "number" &&
        e.blockedUntil > now,
    )
  } catch {
    return []
  }
}

function writeAll(entries: QuotaEntry[]) {
  if (typeof localStorage === "undefined") return
  try {
    const payload: PersistedShape = { version: 1, entries }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Quota / privacy mode — silently no-op
  }
}

/* ------------------------------------------------------------------ */
/*  Cross-tab sync                                                     */
/* ------------------------------------------------------------------ */

type Listener = () => void
const listeners = new Set<Listener>()

let channel: BroadcastChannel | null = null

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null
  if (channel) return channel
  try {
    channel = new BroadcastChannel(CHANNEL_NAME)
    channel.onmessage = () => {
      for (const l of listeners) l()
    }
  } catch {
    channel = null
  }
  return channel
}

if (typeof window !== "undefined") {
  // Storage event covers the BroadcastChannel-less fallback path.
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) {
      for (const l of listeners) l()
    }
  })
}

function notifyAll() {
  // Local listeners
  for (const l of listeners) l()
  // Other tabs
  const ch = getChannel()
  if (ch) {
    try {
      ch.postMessage({ kind: "quota-update", at: Date.now() })
    } catch {}
  }
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/** Default block duration when the provider didn't tell us how long to wait. */
const DEFAULT_BLOCK_MS: Record<QuotaReason, number> = {
  rate_limit: 60_000, // 1 min
  overloaded: 30_000, // 30 s — usually transient
  quota_exceeded: 3_600_000, // 1 hour — billing-level, won't recover fast
  auth_failed: 300_000, // 5 min — usually misconfig, no point hammering
  unknown: 60_000,
}

export function markBlocked(
  modelId: string,
  opts?: {
    retryAfterMs?: number
    reason?: QuotaReason
    message?: string
  },
): QuotaEntry {
  const reason = opts?.reason ?? "rate_limit"
  const dur = opts?.retryAfterMs ?? DEFAULT_BLOCK_MS[reason]
  const entry: QuotaEntry = {
    modelId,
    blockedUntil: Date.now() + dur,
    reason,
    message: opts?.message,
  }
  const existing = readAll().filter((e) => e.modelId !== modelId)
  writeAll([...existing, entry])
  notifyAll()
  return entry
}

export function clearBlocked(modelId: string) {
  const existing = readAll()
  const next = existing.filter((e) => e.modelId !== modelId)
  if (next.length !== existing.length) {
    writeAll(next)
    notifyAll()
  }
}

export function clearAll() {
  writeAll([])
  notifyAll()
}

export function isBlocked(modelId: string): boolean {
  const e = getEntry(modelId)
  return !!e
}

export function getEntry(modelId: string): QuotaEntry | null {
  const all = readAll()
  return all.find((e) => e.modelId === modelId) ?? null
}

export function getAllEntries(): QuotaEntry[] {
  return readAll()
}

/** Subscribe to changes. Returns an unsubscribe function. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  // Force the channel to be created so we receive cross-tab events.
  getChannel()
  return () => {
    listeners.delete(listener)
  }
}
