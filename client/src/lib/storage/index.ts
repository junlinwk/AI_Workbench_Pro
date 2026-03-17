/**
 * Storage facade — synchronous API backed by in-memory cache,
 * with async persistence to IndexedDB and Supabase sync queue.
 *
 * Components call loadUserData/saveUserData synchronously (no changes needed).
 * On app startup, initStorage() hydrates the cache from IndexedDB.
 */
import {
  idbGet,
  idbPut,
  idbDelete,
  idbGetAllForUser,
  makeKey,
  syncQueueAdd,
  setCurrentUser,
  clearCurrentUser,
  closeDB,
} from "./idb"
import { migrateFromLocalStorage } from "./migration"
import { getNamespaceRoute } from "./types"
import type { UserDataRow } from "./types"

// ---------------------------------------------------------------------------
//  In-memory cache (provides synchronous reads)
// ---------------------------------------------------------------------------

const cache = new Map<string, unknown>()

function cacheKey(userId: string, namespace: string): string {
  return `${userId}:${namespace}`
}

// ---------------------------------------------------------------------------
//  Public synchronous API (drop-in replacement for old storage.ts)
// ---------------------------------------------------------------------------

/**
 * Synchronously load user data from the in-memory cache.
 * Returns `fallback` if not found.
 */
export function loadUserData<T>(
  userId: string,
  namespace: string,
  fallback: T,
): T {
  const key = cacheKey(userId, namespace)
  if (cache.has(key)) {
    return cache.get(key) as T
  }

  // Fallback: try localStorage for pre-init reads (e.g. before hydration)
  try {
    const lsKey = `ai-wb-${namespace}-${userId}`
    const raw = localStorage.getItem(lsKey)
    if (raw) {
      const parsed = JSON.parse(raw) as T
      cache.set(key, parsed)
      return parsed
    }
  } catch {}

  return fallback
}

/**
 * Synchronously save user data.
 * Updates in-memory cache immediately, then async-writes to IndexedDB
 * and enqueues a Supabase sync if the namespace is syncable.
 */
export function saveUserData<T>(
  userId: string,
  namespace: string,
  data: T,
): void {
  const key = cacheKey(userId, namespace)
  cache.set(key, data)

  // Async persist — fire and forget
  persistToIDB(userId, namespace, data).catch(() => {})

  // Also write to localStorage as a fallback (until fully migrated)
  try {
    const lsKey = `ai-wb-${namespace}-${userId}`
    localStorage.setItem(lsKey, JSON.stringify(data))
  } catch {}
}

/**
 * Remove user data from cache, IndexedDB, and localStorage.
 */
export function removeUserData(
  userId: string,
  namespace: string,
): void {
  const key = cacheKey(userId, namespace)
  cache.delete(key)

  // Async cleanup
  idbDelete(userId, namespace).catch(() => {})

  try {
    const lsKey = `ai-wb-${namespace}-${userId}`
    localStorage.removeItem(lsKey)
  } catch {}
}

// ---------------------------------------------------------------------------
//  Enumeration API (for SemanticSearch and similar)
// ---------------------------------------------------------------------------

/**
 * List all conversations for a user by scanning cache keys.
 * Returns an array of { namespace, data } for namespaces matching the pattern.
 */
export function listUserDataByPattern(
  userId: string,
  pattern: string,
): Array<{ namespace: string; data: unknown }> {
  const results: Array<{ namespace: string; data: unknown }> = []
  const prefix = `${userId}:`

  for (const [key, value] of cache.entries()) {
    if (!key.startsWith(prefix)) continue
    const ns = key.slice(prefix.length)
    if (ns.includes(pattern)) {
      results.push({ namespace: ns, data: value })
    }
  }

  // Also scan localStorage for entries not yet in cache
  try {
    const lsPrefix = `ai-wb-`
    for (let i = 0; i < localStorage.length; i++) {
      const lsKey = localStorage.key(i)
      if (!lsKey || !lsKey.startsWith(lsPrefix)) continue
      if (!lsKey.endsWith(`-${userId}`)) continue
      const withoutPrefix = lsKey.slice(lsPrefix.length)
      const ns = withoutPrefix.slice(
        0,
        withoutPrefix.length - userId.length - 1,
      )
      if (!ns.includes(pattern)) continue
      const ck = cacheKey(userId, ns)
      if (cache.has(ck)) continue // Already included
      try {
        const raw = localStorage.getItem(lsKey)
        if (raw) {
          const parsed = JSON.parse(raw)
          results.push({ namespace: ns, data: parsed })
        }
      } catch {}
    }
  } catch {}

  return results
}

/**
 * Clear all user data from cache, IndexedDB, and localStorage.
 */
export async function clearAllUserData(userId: string): Promise<void> {
  // Clear from cache
  const prefix = `${userId}:`
  for (const key of [...cache.keys()]) {
    if (key.startsWith(prefix)) {
      cache.delete(key)
    }
  }

  // Clear from IndexedDB
  try {
    const { idbClearUser } = await import("./idb")
    await idbClearUser(userId)
  } catch {}

  // Clear from localStorage — use exact suffix match to avoid
  // clearing another user whose ID is a substring of this one
  try {
    const suffix = `-${userId}`
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith("ai-wb-") && key.endsWith(suffix)) {
        keysToRemove.push(key)
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key)
    }
  } catch {}
}

// ---------------------------------------------------------------------------
//  Initialization (called once at app startup)
// ---------------------------------------------------------------------------

let initialized = false

/**
 * Initialize the storage layer:
 * 1. Migrate localStorage → IndexedDB (one-time)
 * 2. Hydrate in-memory cache from IndexedDB
 * 3. Start sync engine (Phase 3)
 *
 * Must be called after auth, before first render.
 */
export async function initStorage(userId: string): Promise<void> {
  if (initialized) return

  // Set current user for per-user IndexedDB isolation
  setCurrentUser(userId)

  // Step 1: Migrate localStorage data to IndexedDB
  await migrateFromLocalStorage(userId)

  // Step 2: Hydrate cache from IndexedDB
  await hydrateCache(userId)

  // Step 3: Start sync engine (Phase 3 — will be a no-op until implemented)
  try {
    const { startSyncEngine } = await import("./supabase-sync")
    startSyncEngine(userId)
  } catch {
    // Sync engine not available yet — that's fine
  }

  initialized = true
}

/**
 * Reset initialization flag (for logout/user switch)
 */
export async function resetStorage(): Promise<void> {
  // Stop sync engine
  try {
    const { stopSyncEngine } = await import("./supabase-sync")
    stopSyncEngine()
  } catch {}

  cache.clear()
  clearCurrentUser()
  initialized = false
}

// ---------------------------------------------------------------------------
//  Internal helpers
// ---------------------------------------------------------------------------

async function hydrateCache(userId: string): Promise<void> {
  try {
    const rows = await idbGetAllForUser(userId)
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.data)
        cache.set(cacheKey(userId, row.namespace), parsed)
      } catch {}
    }
  } catch {}

  // Also hydrate from localStorage for any keys not in IndexedDB
  try {
    const lsPrefix = "ai-wb-"
    for (let i = 0; i < localStorage.length; i++) {
      const lsKey = localStorage.key(i)
      if (!lsKey || !lsKey.startsWith(lsPrefix)) continue
      if (!lsKey.endsWith(`-${userId}`)) continue
      const withoutPrefix = lsKey.slice(lsPrefix.length)
      const ns = withoutPrefix.slice(
        0,
        withoutPrefix.length - userId.length - 1,
      )
      if (!ns) continue
      const ck = cacheKey(userId, ns)
      if (cache.has(ck)) continue // IDB version takes precedence
      try {
        const raw = localStorage.getItem(lsKey)
        if (raw) {
          cache.set(ck, JSON.parse(raw))
        }
      } catch {}
    }
  } catch {}
}

async function persistToIDB<T>(
  userId: string,
  namespace: string,
  data: T,
): Promise<void> {
  const serialised = JSON.stringify(data)
  const row: UserDataRow = {
    key: makeKey(userId, namespace),
    userId,
    namespace,
    data: serialised,
    meta: {
      version: Date.now(),
      updatedAt: new Date().toISOString(),
      synced: false,
    },
  }
  await idbPut(row)

  // Enqueue sync if the namespace should be synced
  const route = getNamespaceRoute(namespace)
  if (route.supabaseTable) {
    await syncQueueAdd({
      userId,
      namespace,
      data: serialised,
      createdAt: new Date().toISOString(),
      retries: 0,
    }).catch(() => {})
  }
}
