/**
 * Sync queue CRUD operations for offline-first writes
 */
import {
  syncQueueAdd,
  syncQueueGetAll,
  syncQueueDelete,
  syncQueueClear,
} from "./idb"
import type { SyncQueueEntry } from "./types"

export { syncQueueAdd, syncQueueGetAll, syncQueueDelete, syncQueueClear }

/** Get the count of pending sync entries */
export async function syncQueueCount(): Promise<number> {
  const all = await syncQueueGetAll()
  return all.length
}

/** Increment retry count for a failed entry */
export async function syncQueueRetry(
  entry: SyncQueueEntry,
): Promise<void> {
  if (!entry.id) return
  // Remove and re-add with incremented retry count
  await syncQueueDelete(entry.id)
  if (entry.retries < 5) {
    await syncQueueAdd({
      userId: entry.userId,
      namespace: entry.namespace,
      data: entry.data,
      createdAt: entry.createdAt,
      retries: entry.retries + 1,
    })
  }
  // After 5 retries, drop the entry (data is still in IndexedDB)
}
