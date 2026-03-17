/**
 * IndexedDB schema and low-level read/write operations
 * Uses the `idb` library for a promise-based API
 *
 * Security: Each userId gets its own IndexedDB database name to provide
 * hard isolation. Even if XSS occurs, the attacker can only access the
 * currently logged-in user's database (they'd need to guess other DB names).
 */
import { openDB, type IDBPDatabase } from "idb"
import type { UserDataRow, SyncQueueEntry } from "./types"

const DB_PREFIX = "ai-wb-u-"
const DB_VERSION = 1

export interface WorkbenchDB {
  userdata: {
    key: string // namespace
    value: UserDataRow
    indexes: Record<string, never>
  }
  syncQueue: {
    key: number
    value: SyncQueueEntry
    indexes: Record<string, never>
  }
}

/** Map of userId → db promise for per-user isolation */
const dbCache = new Map<
  string,
  Promise<IDBPDatabase<WorkbenchDB>>
>()

/**
 * Sanitise a userId for use in an IndexedDB database name.
 * Only allow alphanumeric, dash, underscore, dot characters.
 */
function sanitiseUserId(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9\-_.]/g, "_").slice(0, 128)
}

/**
 * Get or open the IndexedDB database for a specific user.
 * Each user gets a separate database for hard data isolation.
 */
export function getDB(
  userId?: string,
): Promise<IDBPDatabase<WorkbenchDB>> {
  const dbName = userId
    ? `${DB_PREFIX}${sanitiseUserId(userId)}`
    : `${DB_PREFIX}__default__`

  if (!dbCache.has(dbName)) {
    const promise = openDB<WorkbenchDB>(dbName, DB_VERSION, {
      upgrade(db) {
        // userdata store — keyed by namespace (userId is implicit via DB)
        if (!db.objectStoreNames.contains("userdata")) {
          db.createObjectStore("userdata", {
            keyPath: "key",
          })
        }

        // syncQueue store — offline write queue
        if (!db.objectStoreNames.contains("syncQueue")) {
          db.createObjectStore("syncQueue", {
            keyPath: "id",
            autoIncrement: true,
          })
        }
      },
    })
    dbCache.set(dbName, promise)
  }
  return dbCache.get(dbName)!
}

/**
 * Close and remove a user's database from the cache.
 * Called on logout to prevent stale references.
 */
export async function closeDB(userId?: string): Promise<void> {
  const dbName = userId
    ? `${DB_PREFIX}${sanitiseUserId(userId)}`
    : `${DB_PREFIX}__default__`

  const promise = dbCache.get(dbName)
  if (promise) {
    const db = await promise
    db.close()
    dbCache.delete(dbName)
  }
}

// Current user context for DB operations
let currentUserId: string | undefined

export function setCurrentUser(userId: string): void {
  currentUserId = userId
}

export function clearCurrentUser(): void {
  currentUserId = undefined
}

function getCurrentDB(): Promise<IDBPDatabase<WorkbenchDB>> {
  return getDB(currentUserId)
}

/** Compose the compound key used in the userdata store */
export function makeKey(userId: string, namespace: string): string {
  // Since each user has their own DB, we just use namespace as key
  // but keep the compound format for backward compat with sync layer
  return namespace
}

/** Read a single entry from the userdata store */
export async function idbGet(
  userId: string,
  namespace: string,
): Promise<UserDataRow | undefined> {
  const db = await getDB(userId)
  return db.get("userdata", makeKey(userId, namespace))
}

/** Write an entry to the userdata store */
export async function idbPut(row: UserDataRow): Promise<void> {
  const db = await getDB(row.userId)
  await db.put("userdata", { ...row, key: row.namespace })
}

/** Delete an entry from the userdata store */
export async function idbDelete(
  userId: string,
  namespace: string,
): Promise<void> {
  const db = await getDB(userId)
  await db.delete("userdata", makeKey(userId, namespace))
}

/** Get all entries for a user */
export async function idbGetAllForUser(
  userId: string,
): Promise<UserDataRow[]> {
  const db = await getDB(userId)
  return db.getAll("userdata")
}

/** List all namespace keys for a user (for search/enumeration) */
export async function idbListNamespaces(
  userId: string,
): Promise<string[]> {
  const rows = await idbGetAllForUser(userId)
  return rows.map((r) => r.namespace)
}

/** Add an entry to the sync queue */
export async function syncQueueAdd(
  entry: Omit<SyncQueueEntry, "id">,
): Promise<void> {
  const db = await getDB(entry.userId)
  await db.add("syncQueue", entry as SyncQueueEntry)
}

/** Get all pending sync queue entries */
export async function syncQueueGetAll(): Promise<SyncQueueEntry[]> {
  const db = await getCurrentDB()
  return db.getAll("syncQueue")
}

/** Remove a sync queue entry by id */
export async function syncQueueDelete(id: number): Promise<void> {
  const db = await getCurrentDB()
  await db.delete("syncQueue", id)
}

/** Clear all sync queue entries */
export async function syncQueueClear(): Promise<void> {
  const db = await getCurrentDB()
  await db.clear("syncQueue")
}

/** Clear all userdata for a specific user */
export async function idbClearUser(userId: string): Promise<void> {
  const db = await getDB(userId)
  const tx = db.transaction("userdata", "readwrite")
  await tx.store.clear()
  await tx.done
}
