/**
 * Storage layer type definitions
 */

/** Metadata attached to every persisted entry for sync coordination */
export interface SyncMeta {
  /** Monotonically increasing version for conflict detection */
  version: number
  /** ISO timestamp of last local write */
  updatedAt: string
  /** Whether this entry has been pushed to Supabase */
  synced: boolean
}

/** A queued write waiting to be pushed to Supabase */
export interface SyncQueueEntry {
  id?: number // auto-increment
  userId: string
  namespace: string
  /** The serialised JSON payload */
  data: string
  /** ISO timestamp when the write was enqueued */
  createdAt: string
  /** Number of failed push attempts */
  retries: number
}

/** Shape of a row in the generic `userdata` object store */
export interface UserDataRow {
  /** Compound key: `${userId}:${namespace}` */
  key: string
  userId: string
  namespace: string
  data: string // JSON-serialised
  meta: SyncMeta
}

/** Namespace → store routing */
export type StoreName =
  | "settings"
  | "conversations"
  | "messages"
  | "userdata"
  | "syncQueue"

/** Mapping from namespace patterns to IndexedDB stores and Supabase tables */
export interface NamespaceRoute {
  store: StoreName
  /** Supabase table name, or null if local-only */
  supabaseTable: string | null
}

/** Namespace routing map */
export const NAMESPACE_ROUTES: Record<string, NamespaceRoute> = {
  "semantic-embeddings": {
    store: "userdata",
    supabaseTable: null, // can be recomputed
  },
}

/** Default route for namespaces not explicitly mapped */
export const DEFAULT_ROUTE: NamespaceRoute = {
  store: "userdata",
  supabaseTable: "user_data",
}

export function getNamespaceRoute(namespace: string): NamespaceRoute {
  // Check for exact match first
  if (namespace in NAMESPACE_ROUTES) {
    return NAMESPACE_ROUTES[namespace]
  }
  // Check for prefix patterns
  if (namespace.startsWith("conv-messages:")) {
    return { store: "messages", supabaseTable: "messages" }
  }
  if (namespace.startsWith("conv-branches:")) {
    return { store: "userdata", supabaseTable: "branches" }
  }
  if (namespace.startsWith("conv-memory:")) {
    return { store: "userdata", supabaseTable: "conversation_memory" }
  }
  return DEFAULT_ROUTE
}
