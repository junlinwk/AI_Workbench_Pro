/**
 * One-time migration: localStorage → IndexedDB
 *
 * Scans all localStorage keys matching the `ai-wb-*` pattern,
 * copies them into IndexedDB userdata store, then marks migration done.
 */
import { idbPut, makeKey } from "./idb"
import type { UserDataRow } from "./types"

const MIGRATION_FLAG = "ai-wb-idb-migrated"

/** Check if migration has already run */
export function isMigrated(): boolean {
  try {
    return localStorage.getItem(MIGRATION_FLAG) === "1"
  } catch {
    return false
  }
}

/** Mark migration as complete */
function markMigrated(): void {
  try {
    localStorage.setItem(MIGRATION_FLAG, "1")
  } catch {}
}

/**
 * Migrate all `ai-wb-*` keys from localStorage into IndexedDB.
 * This is idempotent — safe to call multiple times.
 */
export async function migrateFromLocalStorage(
  userId: string,
): Promise<void> {
  if (isMigrated()) return

  const PREFIX = "ai-wb-"
  const keysToMigrate: Array<{ lsKey: string; namespace: string }> = []

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const lsKey = localStorage.key(i)
      if (!lsKey || !lsKey.startsWith(PREFIX)) continue
      // Key format: ai-wb-{namespace}-{userId}
      // We need to extract the namespace
      const withoutPrefix = lsKey.slice(PREFIX.length)
      // The userId is at the end, separated by the last `-`
      // But namespace can contain `-`, so we match against the known userId
      if (!withoutPrefix.endsWith(`-${userId}`)) continue
      const namespace = withoutPrefix.slice(
        0,
        withoutPrefix.length - userId.length - 1,
      )
      if (!namespace) continue
      keysToMigrate.push({ lsKey, namespace })
    }

    // Also migrate settings (different key pattern)
    const settingsKeys = [
      `ai-workbench-settings-${userId}`,
      "ai-workbench-settings",
    ]
    for (const sk of settingsKeys) {
      const val = localStorage.getItem(sk)
      if (val) {
        keysToMigrate.push({
          lsKey: sk,
          namespace: `__settings__${sk}`,
        })
      }
    }
  } catch {}

  // Write each key to IndexedDB
  for (const { lsKey, namespace } of keysToMigrate) {
    try {
      const raw = localStorage.getItem(lsKey)
      if (raw === null) continue
      const row: UserDataRow = {
        key: makeKey(userId, namespace),
        userId,
        namespace,
        data: raw, // Already JSON string
        meta: {
          version: 1,
          updatedAt: new Date().toISOString(),
          synced: false,
        },
      }
      await idbPut(row)
    } catch {
      // Skip entries that fail — they'll stay in localStorage
    }
  }

  markMigrated()
}
