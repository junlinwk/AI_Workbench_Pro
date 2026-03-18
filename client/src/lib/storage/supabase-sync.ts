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
  syncQueueClear,
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
let isDraining = false // Prevent concurrent drains (race condition guard)

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
    .then(async () => {
      console.log("[SyncEngine] Initial pull complete — draining pending writes before clearing queue")
      // Drain pending writes FIRST so local changes aren't lost, THEN clear stale entries
      await drainSyncQueue(userId)
      await syncQueueClear()
      console.log("[SyncEngine] Queue drained and cleared, subscribing to realtime")
      subscribeRealtime(userId)
    })
    .catch((err) => {
      console.warn("[SyncEngine] Startup error:", err)
    })

  // Periodic drain every 3 seconds to catch queued writes
  drainTimer = setInterval(() => {
    if (navigator.onLine && currentUserId && !isDraining) {
      drainSyncQueue(currentUserId).catch(() => { })
    }
  }, 3_000)

  onlineHandler = () => {
    console.log("[SyncEngine] Online — draining queue")
    drainSyncQueue(userId)
      .then(() => subscribeRealtime(userId))
      .catch(() => { })
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
    drainSyncQueue(currentUserId).catch(() => { })
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
  if (isDraining) return // Prevent concurrent drains
  isDraining = true
  try {
    await _drainSyncQueueInner(userId)
  } finally {
    isDraining = false
  }
}

async function _drainSyncQueueInner(userId: string): Promise<void> {
  const supabase = getSupabase()
  if (!supabase || !navigator.onLine) return

  const entries = await syncQueueGetAll()
  const userEntries = entries.filter((e) => e.userId === userId)

  if (userEntries.length === 0) return

  console.log(`[SyncEngine] Draining ${userEntries.length} queued writes`)

  // Deduplicate: only push the latest entry per namespace
  const latestByNs = new Map<string, typeof userEntries[0]>()
  for (const entry of userEntries) {
    latestByNs.set(entry.namespace, entry) // last one wins
  }

  for (const [ns, entry] of latestByNs) {
    try {
      const route = getNamespaceRoute(ns)
      if (!route.supabaseTable) {
        // Remove all queue entries for this non-syncable namespace
        for (const e of userEntries.filter(x => x.namespace === ns)) {
          if (e.id) await syncQueueDelete(e.id)
        }
        continue
      }

      // Use LATEST IDB data (not stale queue data) to prevent data loss
      const latestLocal = await idbGet(userId, ns)
      const dataToSync = latestLocal
        ? JSON.parse(latestLocal.data)
        : JSON.parse(entry.data)

      const { error } = await supabase.from("user_data").upsert(
        {
          user_id: userId,
          namespace: ns,
          data: dataToSync,
          updated_at: new Date().toISOString(),
          version: Date.now(),
        },
        { onConflict: "user_id,namespace" },
      )

      if (error) {
        console.warn(`[SyncEngine] Upsert failed for ${ns}:`, error.message)
      } else {
        // Remove ALL queue entries for this namespace (not just the latest)
        for (const e of userEntries.filter(x => x.namespace === ns)) {
          if (e.id) await syncQueueDelete(e.id)
        }
        if (latestLocal) {
          await idbPut({
            ...latestLocal,
            meta: { ...latestLocal.meta, synced: true },
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

        // Notify listeners (e.g. SettingsContext) of remote changes
        window.dispatchEvent(
          new CustomEvent("storage-remote-update", {
            detail: { namespace, data: remoteData },
          }),
        )

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
      if (status === "CHANNEL_ERROR") {
        // Retry after a short delay — CHANNEL_ERROR often resolves on reconnect
        console.warn("[SyncEngine] Channel error — will retry in 3s")
        setTimeout(() => {
          unsubscribeRealtime()
          if (syncActive && currentUserId) subscribeRealtime(currentUserId)
        }, 3000)
      }
    })
}

function unsubscribeRealtime(): void {
  if (realtimeChannel) {
    realtimeChannel.unsubscribe()
    realtimeChannel = null
  }
}
