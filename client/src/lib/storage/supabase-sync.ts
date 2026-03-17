/**
 * SyncEngine — background synchronisation between IndexedDB and Supabase
 *
 * Flow:
 *   startup → initialPull() → drainSyncQueue() → subscribeRealtime()
 *   write   → cache → IDB → online? upsert : syncQueue.add()
 *   online  → drainSyncQueue() → subscribeRealtime()
 *   offline → unsubscribe() → writes go to syncQueue
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
let realtimeChannel: RealtimeChannel | null = null
let onlineHandler: (() => void) | null = null
let offlineHandler: (() => void) | null = null

/**
 * Start the sync engine for a given user.
 * Safe to call multiple times — only the first call takes effect.
 */
export function startSyncEngine(userId: string): void {
  if (syncActive || !isSupabaseConfigured()) return
  syncActive = true

  // Initial sync
  initialPull(userId)
    .then(() => drainSyncQueue(userId))
    .then(() => subscribeRealtime(userId))
    .catch(() => {})

  // Listen for online/offline events
  onlineHandler = () => {
    drainSyncQueue(userId)
      .then(() => subscribeRealtime(userId))
      .catch(() => {})
  }
  offlineHandler = () => {
    unsubscribeRealtime()
  }

  window.addEventListener("online", onlineHandler)
  window.addEventListener("offline", offlineHandler)
}

/**
 * Stop the sync engine and clean up listeners.
 */
export function stopSyncEngine(): void {
  syncActive = false
  unsubscribeRealtime()

  if (onlineHandler) {
    window.removeEventListener("online", onlineHandler)
    onlineHandler = null
  }
  if (offlineHandler) {
    window.removeEventListener("offline", offlineHandler)
    offlineHandler = null
  }
}

// ---------------------------------------------------------------------------
//  Internal: Pull remote data on startup
// ---------------------------------------------------------------------------

async function initialPull(userId: string): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) return

  try {
    const { data, error } = await supabase
      .from("user_data")
      .select("*")
      .eq("user_id", userId)

    if (error || !data) return

    for (const row of data) {
      const namespace = row.namespace as string
      const remoteData = row.data
      const remoteVersion = (row.version as number) ?? 0

      // Check if we have a local version
      const local = await idbGet(userId, namespace)

      if (!local) {
        // No local data — accept remote
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
      } else {
        // Conflict resolution
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
          meta: {
            ...local.meta,
            synced: true,
          },
        })
      }
    }
  } catch {
    // Network error — continue with local data
  }
}

// ---------------------------------------------------------------------------
//  Internal: Push offline writes to Supabase
// ---------------------------------------------------------------------------

async function drainSyncQueue(userId: string): Promise<void> {
  const supabase = getSupabase()
  if (!supabase || !navigator.onLine) return

  const entries = await syncQueueGetAll()
  const userEntries = entries.filter((e) => e.userId === userId)

  for (const entry of userEntries) {
    try {
      const route = getNamespaceRoute(entry.namespace)
      if (!route.supabaseTable) {
        // Not syncable — just remove from queue
        if (entry.id) await syncQueueDelete(entry.id)
        continue
      }

      const { error } = await supabase.from(route.supabaseTable).upsert(
        {
          user_id: userId,
          namespace: entry.namespace,
          data: JSON.parse(entry.data),
          updated_at: new Date().toISOString(),
          version: Date.now(),
        },
        { onConflict: "user_id,namespace" },
      )

      if (!error && entry.id) {
        await syncQueueDelete(entry.id)
        // Mark as synced in IDB
        const local = await idbGet(userId, entry.namespace)
        if (local) {
          await idbPut({
            ...local,
            meta: { ...local.meta, synced: true },
          })
        }
      }
    } catch {
      // Will retry on next online event
    }
  }
}

// ---------------------------------------------------------------------------
//  Internal: Realtime subscription for remote changes
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

        const namespace = (newRow as Record<string, unknown>)
          .namespace as string
        const remoteData = (newRow as Record<string, unknown>).data
        const remoteVersion =
          ((newRow as Record<string, unknown>).version as number) ?? 0

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
        }
      },
    )
    .subscribe()
}

function unsubscribeRealtime(): void {
  if (realtimeChannel) {
    realtimeChannel.unsubscribe()
    realtimeChannel = null
  }
}
