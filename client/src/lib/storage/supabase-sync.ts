/**
 * SyncEngine — background synchronisation between IndexedDB and Supabase
 *
 * Flow:
 *   startup → initialPull() → drainSyncQueue() → subscribeRealtime()
 *   write   → cache → IDB → syncQueue → debounced drainSyncQueue()
 *   online  → drainSyncQueue() → subscribeRealtime()
 *   offline → unsubscribe() → writes accumulate in syncQueue
 */
import { getSupabase, isSupabaseConfigured } from "../supabase"
import {
  syncQueueGetAll,
  syncQueueDelete,
} from "./sync-queue"
import { idbGet, idbPut, makeKey } from "./idb"
import { getNamespaceRoute } from "./types"
import { resolveConflict } from "./conflict-resolver"
import type { UserDataRow } from "./types"
import type { RealtimeChannel } from "@supabase/supabase-js"

let syncActive = false
let currentUserId: string | null = null
let realtimeChannel: RealtimeChannel | null = null
let onlineHandler: (() => void) | null = null
let offlineHandler: (() => void) | null = null
let drainTimer: ReturnType<typeof setTimeout> | null = null

// Cache reference for updating in-memory cache from remote pulls
let cacheRef: Map<string, unknown> | null = null

/**
 * Set the in-memory cache reference so sync can update it directly.
 */
export function setSyncCacheRef(cache: Map<string, unknown>) {
  cacheRef = cache
}

/**
 * Start the sync engine for a given user.
 */
export function startSyncEngine(userId: string): void {
  if (syncActive || !isSupabaseConfigured()) return
  syncActive = true
  currentUserId = userId
  console.log("[SyncEngine] Starting for user:", userId.slice(0, 8) + "...")

  initialPull(userId)
    .then(() => {
      console.log("[SyncEngine] Initial pull complete")
      return drainSyncQueue(userId)
    })
    .then(() => {
      console.log("[SyncEngine] Sync queue drained, subscribing to realtime")
      subscribeRealtime(userId)
    })
    .catch((err) => {
      console.warn("[SyncEngine] Startup error:", err)
    })

  // Periodic drain every 10 seconds to catch queued writes
  drainTimer = setInterval(() => {
    if (navigator.onLine && currentUserId) {
      drainSyncQueue(currentUserId).catch(() => {})
    }
  }, 10_000)

  onlineHandler = () => {
    console.log("[SyncEngine] Online — draining queue")
    drainSyncQueue(userId)
      .then(() => subscribeRealtime(userId))
      .catch(() => {})
  }
  offlineHandler = () => {
    console.log("[SyncEngine] Offline — pausing sync")
    unsubscribeRealtime()
  }

  window.addEventListener("online", onlineHandler)
  window.addEventListener("offline", offlineHandler)
}

/**
 * Stop the sync engine and clean up.
 */
export function stopSyncEngine(): void {
  syncActive = false
  currentUserId = null
  unsubscribeRealtime()

  if (drainTimer) {
    clearInterval(drainTimer)
    drainTimer = null
  }
  if (onlineHandler) {
    window.removeEventListener("online", onlineHandler)
    onlineHandler = null
  }
  if (offlineHandler) {
    window.removeEventListener("offline", offlineHandler)
    offlineHandler = null
  }
}

/**
 * Trigger an immediate sync drain (called after important writes like settings).
 */
export function triggerSync(): void {
  if (currentUserId && navigator.onLine) {
    drainSyncQueue(currentUserId).catch(() => {})
  }
}

// ---------------------------------------------------------------------------
//  Pull remote data on startup — writes to IDB AND in-memory cache
// ---------------------------------------------------------------------------

async function initialPull(userId: string): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return

  try {
    const { data, error } = await supabase
      .from("user_data")
      .select("*")
      .eq("user_id", userId)

    if (error) {
      console.warn("[SyncEngine] initialPull error:", error.message)
      return
    }
    if (!data || data.length === 0) {
      console.log("[SyncEngine] No remote data found")
      return
    }

    console.log(`[SyncEngine] Pulled ${data.length} entries from cloud`)

    for (const row of data) {
      const namespace = row.namespace as string
      const remoteData = row.data
      const remoteVersion = (row.version as number) ?? 0

      const local = await idbGet(userId, namespace)

      if (!local) {
        // No local — accept remote
        await idbPut({
          key: makeKey(userId, namespace),
          userId,
          namespace,
          data: JSON.stringify(remoteData),
          meta: {
            version: remoteVersion,
            updatedAt: row.updated_at ?? new Date().toISOString(),
            synced: true,
          },
        })
        // Update in-memory cache so the app sees it immediately
        if (cacheRef) {
          cacheRef.set(`${userId}:${namespace}`, remoteData)
        }
      } else {
        const localData = JSON.parse(local.data)
        const localVersion = local.meta.version
        const merged = resolveConflict(
          namespace,
          localData,
          remoteData,
          localVersion,
          remoteVersion,
        )
        await idbPut({
          ...local,
          data: JSON.stringify(merged),
          meta: { ...local.meta, synced: true },
        })
        // Update cache with merged data
        if (cacheRef) {
          cacheRef.set(`${userId}:${namespace}`, merged)
        }
      }
    }
  } catch (err) {
    console.warn("[SyncEngine] initialPull network error:", err)
  }
}

// ---------------------------------------------------------------------------
//  Push queued writes to Supabase
// ---------------------------------------------------------------------------

async function drainSyncQueue(userId: string): Promise<void> {
  const supabase = getSupabase()
  if (!supabase || !navigator.onLine) return

  const entries = await syncQueueGetAll()
  const userEntries = entries.filter((e) => e.userId === userId)

  if (userEntries.length === 0) return

  console.log(`[SyncEngine] Draining ${userEntries.length} queued writes`)

  for (const entry of userEntries) {
    try {
      const route = getNamespaceRoute(entry.namespace)
      if (!route.supabaseTable) {
        if (entry.id) await syncQueueDelete(entry.id)
        continue
      }

      // All sync goes to user_data table regardless of route mapping
      // (messages, branches, etc. tables may not exist — user_data is the catch-all)
      const { error } = await supabase.from("user_data").upsert(
        {
          user_id: userId,
          namespace: entry.namespace,
          data: JSON.parse(entry.data),
          updated_at: new Date().toISOString(),
          version: Date.now(),
        },
        { onConflict: "user_id,namespace" },
      )

      if (error) {
        console.warn(`[SyncEngine] Upsert failed for ${entry.namespace}:`, error.message)
      } else {
        if (entry.id) await syncQueueDelete(entry.id)
        const local = await idbGet(userId, entry.namespace)
        if (local) {
          await idbPut({
            ...local,
            meta: { ...local.meta, synced: true },
          })
        }
      }
    } catch {
      // Will retry on next drain cycle
    }
  }
}

// ---------------------------------------------------------------------------
//  Realtime subscription for remote changes (from other devices)
// ---------------------------------------------------------------------------

function subscribeRealtime(userId: string): void {
  const supabase = getSupabase()
  if (!supabase || realtimeChannel) return

  realtimeChannel = supabase
    .channel(`user_data:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "user_data",
        filter: `user_id=eq.${userId}`,
      },
      async (payload) => {
        const { new: newRow } = payload
        if (!newRow) return

        const namespace = (newRow as Record<string, unknown>).namespace as string
        const remoteData = (newRow as Record<string, unknown>).data
        const remoteVersion = ((newRow as Record<string, unknown>).version as number) ?? 0

        console.log(`[SyncEngine] Realtime update: ${namespace}`)

        const local = await idbGet(userId, namespace)
        if (local) {
          const localData = JSON.parse(local.data)
          const merged = resolveConflict(
            namespace,
            localData,
            remoteData,
            local.meta.version,
            remoteVersion,
          )
          await idbPut({
            ...local,
            data: JSON.stringify(merged),
            meta: {
              version: Math.max(local.meta.version, remoteVersion),
              updatedAt: new Date().toISOString(),
              synced: true,
            },
          })
          if (cacheRef) {
            cacheRef.set(`${userId}:${namespace}`, merged)
          }
        } else {
          await idbPut({
            key: makeKey(userId, namespace),
            userId,
            namespace,
            data: JSON.stringify(remoteData),
            meta: {
              version: remoteVersion,
              updatedAt: new Date().toISOString(),
              synced: true,
            },
          })
          if (cacheRef) {
            cacheRef.set(`${userId}:${namespace}`, remoteData)
          }
        }
      },
    )
    .subscribe((status) => {
      console.log("[SyncEngine] Realtime status:", status)
    })
}

function unsubscribeRealtime(): void {
  if (realtimeChannel) {
    realtimeChannel.unsubscribe()
    realtimeChannel = null
  }
}
