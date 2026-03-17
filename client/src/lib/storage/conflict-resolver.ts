/**
 * Conflict resolution strategies for Supabase sync
 *
 * | Data type     | Strategy                              |
 * |---------------|---------------------------------------|
 * | Settings      | Field-level merge (per-field latest)   |
 * | Messages      | Append-only, dedupe by message ID      |
 * | Branch data   | Last-write-wins + version check        |
 * | Memory map    | Union merge (dedupe by node/edge ID)   |
 * | Notepad/Task  | Last-write-wins                        |
 * | Context pins  | Union merge by pin ID                  |
 */

type ConflictStrategy = "last-write-wins" | "field-merge" | "union-merge"

/** Determine which strategy to use for a given namespace */
export function getStrategy(namespace: string): ConflictStrategy {
  if (namespace.startsWith("__settings__")) return "field-merge"
  if (namespace.startsWith("conv-messages:")) return "union-merge"
  if (
    namespace === "memory-nodes" ||
    namespace === "memory-edges" ||
    namespace === "context-pins"
  ) {
    return "union-merge"
  }
  return "last-write-wins"
}

/**
 * Resolve a conflict between local and remote data.
 * Returns the merged result.
 */
export function resolveConflict(
  namespace: string,
  local: unknown,
  remote: unknown,
  localVersion: number,
  remoteVersion: number,
): unknown {
  const strategy = getStrategy(namespace)

  switch (strategy) {
    case "field-merge":
      return fieldMerge(local, remote, localVersion, remoteVersion)
    case "union-merge":
      return unionMerge(local, remote)
    case "last-write-wins":
    default:
      return localVersion >= remoteVersion ? local : remote
  }
}

/** Merge two objects field-by-field, preferring the newer version per field */
function fieldMerge(
  local: unknown,
  remote: unknown,
  localVersion: number,
  remoteVersion: number,
): unknown {
  if (
    !local ||
    !remote ||
    typeof local !== "object" ||
    typeof remote !== "object"
  ) {
    return localVersion >= remoteVersion ? local : remote
  }

  const merged = { ...(remote as Record<string, unknown>) }
  // Local fields override remote if local is newer
  if (localVersion >= remoteVersion) {
    Object.assign(merged, local as Record<string, unknown>)
  }
  return merged
}

/** Merge two arrays by unioning on `id` field, preferring local entries */
function unionMerge(local: unknown, remote: unknown): unknown {
  if (!Array.isArray(local) || !Array.isArray(remote)) {
    // If not arrays, try object merge
    if (
      local &&
      remote &&
      typeof local === "object" &&
      typeof remote === "object"
    ) {
      return { ...(remote as Record<string, unknown>), ...(local as Record<string, unknown>) }
    }
    return local ?? remote
  }

  const merged = new Map<string, unknown>()

  // Remote entries first
  for (const item of remote) {
    const id = (item as Record<string, unknown>)?.id ?? JSON.stringify(item)
    merged.set(String(id), item)
  }

  // Local entries override
  for (const item of local) {
    const id = (item as Record<string, unknown>)?.id ?? JSON.stringify(item)
    merged.set(String(id), item)
  }

  return [...merged.values()]
}
