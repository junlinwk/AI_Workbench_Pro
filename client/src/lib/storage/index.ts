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
//  Debounced sync queue — coalesce rapid writes to the same namespace
// ---------------------------------------------------------------------------

const pendingSyncs = new Map<string, ReturnType<typeof setTimeout>>()
const SYNC_DEBOUNCE_MS = 1500 // Wait 1.5s after last write before queuing

function debouncedSyncEnqueue(
  userId: string,
  namespace: string,
  data: string,
): void {
  const route = getNamespaceRoute(namespace)
  if (!route.supabaseTable) return

  const key = `${userId}:${namespace}`
  // Cancel any pending enqueue for this namespace
  const existing = pendingSyncs.get(key)
  if (existing) clearTimeout(existing)

  // Schedule new enqueue
  pendingSyncs.set(
    key,
    setTimeout(() => {
      pendingSyncs.delete(key)
      syncQueueAdd({
        userId,
        namespace,
        data,
        createdAt: new Date().toISOString(),
        retries: 0,
      }).catch(() => {})
    }, SYNC_DEBOUNCE_MS),
  )
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
 * and enqueues a debounced Supabase sync.
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

  // Also write to localStorage as a fallback
  try {
    const lsKey = `ai-wb-${namespace}-${userId}`
    localStorage.setItem(lsKey, JSON.stringify(data))
  } catch {}
}

/**
 * Remove user data from cache, IndexedDB, localStorage, AND Supabase.
 */
export function removeUserData(
  userId: string,
  namespace: string,
): void {
  const key = cacheKey(userId, namespace)
  cache.delete(key)

  // Cancel any pending sync for this namespace
  const pendingKey = `${userId}:${namespace}`
  const pending = pendingSyncs.get(pendingKey)
  if (pending) {
    clearTimeout(pending)
    pendingSyncs.delete(pendingKey)
  }

  // Async cleanup from IDB
  idbDelete(userId, namespace).catch(() => {})

  // Cleanup from localStorage
  try {
    const lsKey = `ai-wb-${namespace}-${userId}`
    localStorage.removeItem(lsKey)
  } catch {}

  // Delete from Supabase
  deleteFromCloud(userId, namespace).catch(() => {})
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
 * Clear all user data from cache, IndexedDB, localStorage, AND Supabase.
 */
export async function clearAllUserData(userId: string): Promise<void> {
  // Collect namespaces before clearing (for cloud delete)
  const namespacesToDelete: string[] = []
  const prefix = `${userId}:`
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      namespacesToDelete.push(key.slice(prefix.length))
    }
  }

  // Clear from cache
  for (const key of [...cache.keys()]) {
    if (key.startsWith(prefix)) {
      cache.delete(key)
    }
  }

  // Cancel all pending syncs for this user
  for (const [key, timer] of pendingSyncs.entries()) {
    if (key.startsWith(prefix)) {
      clearTimeout(timer)
      pendingSyncs.delete(key)
    }
  }

  // Clear from IndexedDB
  try {
    const { idbClearUser } = await import("./idb")
    await idbClearUser(userId)
  } catch {}

  // Clear from localStorage
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

  // Delete all user data from Supabase
  deleteAllFromCloud(userId).catch(() => {})
}

// ---------------------------------------------------------------------------
//  Initialization (called once at app startup)
// ---------------------------------------------------------------------------

let initialized = false

/**
 * Initialize the storage layer:
 * 1. Migrate localStorage → IndexedDB (one-time)
 * 2. Hydrate in-memory cache from IndexedDB
 * 3. Start sync engine
 */
export async function initStorage(userId: string): Promise<void> {
  if (initialized) return

  // Set current user for per-user IndexedDB isolation
  setCurrentUser(userId)

  // Step 1: Migrate localStorage data to IndexedDB
  await migrateFromLocalStorage(userId)

  // Step 2: Hydrate cache from IndexedDB
  await hydrateCache(userId)

  // Step 3: Start sync engine — pass cache ref so remote pulls update in-memory
  try {
    const { startSyncEngine, setSyncCacheRef } = await import("./supabase-sync")
    setSyncCacheRef(cache)
    startSyncEngine(userId)
  } catch {
    // Sync engine not available — continue with local only
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

  // Cancel all pending syncs
  for (const [, timer] of pendingSyncs) {
    clearTimeout(timer)
  }
  pendingSyncs.clear()

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

  // Debounced sync enqueue — coalesces rapid writes
  debouncedSyncEnqueue(userId, namespace, serialised)
}

// ---------------------------------------------------------------------------
//  Cloud delete helpers
// ---------------------------------------------------------------------------

async function deleteFromCloud(userId: string, namespace: string): Promise<void> {
  try {
    const { getSupabase, isSupabaseConfigured } = await import("../supabase")
    const supabase = getSupabase()
    if (!supabase || !isSupabaseConfigured()) return

    await supabase
      .from("user_data")
      .delete()
      .eq("user_id", userId)
      .eq("namespace", namespace)
  } catch {
    // Silent fail — will be orphaned on cloud but harmless
  }
}

async function deleteAllFromCloud(userId: string): Promise<void> {
  try {
    const { getSupabase, isSupabaseConfigured } = await import("../supabase")
    const supabase = getSupabase()
    if (!supabase || !isSupabaseConfigured()) return

    await supabase
      .from("user_data")
      .delete()
      .eq("user_id", userId)
  } catch {
    // Silent fail
  }
}
