/**
 * Branch Lineage — pure functions for branch ancestry and message/memory filtering
 *
 * Provides lineage computation so that each branch sees only its own
 * messages + ancestor messages up to the fork point.
 */

export interface BranchPoint {
  id: string
  messageId: string
  messagePreview: string
  createdAt: string
  sourceBranchId: string
}

export interface ConversationBranch {
  id: string
  name: string
  color: string
  branchPointId: string | null
  messageCount: number
  parentBranchId: string | null
  mergedInto?: string | null
  temperature?: number
}

export interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: string
  citations?: any[]
  model?: string
  branchId: string
  imageData?: string
  imageMimeType?: string
}

export interface MemoryEntry {
  id: string
  messageId: string
  branchId: string
  content: string
  timestamp: string
  isCompacted: boolean
  compactedFrom?: string[]
}

export interface ConversationMemory {
  entries: MemoryEntry[]
  lastCompactedAt: string | null
  version: number
}

/**
 * Returns the lineage chain: [main, ..., grandparent, parent, self]
 * Walks parentBranchId until null (which is main).
 */
export function getBranchLineage(
  branchId: string,
  branches: ConversationBranch[],
): string[] {
  const chain: string[] = []
  let current = branchId
  const visited = new Set<string>()

  while (current) {
    if (visited.has(current)) break // prevent cycles
    visited.add(current)
    chain.unshift(current)
    const branch = branches.find((b) => b.id === current)
    if (!branch || !branch.parentBranchId) break
    current = branch.parentBranchId
  }

  // Ensure "main" is at the front if not already
  if (chain[0] !== "main") {
    chain.unshift("main")
  }

  return chain
}

/**
 * Get messages visible to a branch:
 * - For each ancestor, include messages up to the fork point where the next branch splits off
 * - For the current branch, include all its messages
 * - Also include messages from branches that were merged INTO the current branch
 */
export function getVisibleMessages(
  branchId: string,
  allMessages: Message[],
  branches: ConversationBranch[],
  branchPoints: BranchPoint[],
): Message[] {
  const lineage = getBranchLineage(branchId, branches)
  const resultIds = new Set<string>()
  const result: Message[] = []

  function addMessages(msgs: Message[]) {
    for (const m of msgs) {
      if (!resultIds.has(m.id)) {
        resultIds.add(m.id)
        result.push(m)
      }
    }
  }

  if (lineage.length === 1 && lineage[0] === "main") {
    addMessages(allMessages.filter((m) => m.branchId === "main"))
  } else {
    for (let i = 0; i < lineage.length; i++) {
      const ancestorId = lineage[i]
      const isLast = i === lineage.length - 1

      const ancestorMessages = allMessages.filter(
        (m) => m.branchId === ancestorId,
      )

      if (isLast) {
        addMessages(ancestorMessages)
      } else {
        const childBranchId = lineage[i + 1]
        const childBranch = branches.find((b) => b.id === childBranchId)
        const bp = childBranch?.branchPointId
          ? branchPoints.find((p) => p.id === childBranch.branchPointId)
          : null

        if (bp) {
          const cutoffIdx = ancestorMessages.findIndex(
            (m) => m.id === bp.messageId,
          )
          if (cutoffIdx !== -1) {
            addMessages(ancestorMessages.slice(0, cutoffIdx + 1))
          } else {
            addMessages(ancestorMessages)
          }
        } else {
          addMessages(ancestorMessages)
        }
      }
    }
  }

  // Also include messages from branches merged INTO the current branch
  const mergedChildren = branches.filter((b) => b.mergedInto === branchId)
  for (const child of mergedChildren) {
    addMessages(allMessages.filter((m) => m.branchId === child.id))
  }

  // Sort by original order
  const indexMap = new Map(allMessages.map((m, i) => [m.id, i]))
  result.sort(
    (a, b) => (indexMap.get(a.id) ?? 0) - (indexMap.get(b.id) ?? 0),
  )

  return result
}

/**
 * Get memory entries visible to a branch.
 * Same ancestry rules as messages: for each ancestor, only include
 * memory entries whose messageId was created before the fork point.
 * For the current branch, include all.
 */
export function getVisibleMemory(
  branchId: string,
  memory: ConversationMemory,
  branches: ConversationBranch[],
  allMessages: Message[],
  branchPoints: BranchPoint[],
): MemoryEntry[] {
  const lineage = getBranchLineage(branchId, branches)

  // Build a set of visible message IDs using the same logic as getVisibleMessages
  const visibleMsgIds = new Set(
    getVisibleMessages(branchId, allMessages, branches, branchPoints).map(
      (m) => m.id,
    ),
  )

  const lineageSet = new Set(lineage)

  return memory.entries.filter(
    (e) =>
      !e.isCompacted &&
      lineageSet.has(e.branchId) &&
      // Memory from compacted entries (messageId === "compacted") are always visible
      // if they belong to the lineage
      (e.messageId === "compacted" || visibleMsgIds.has(e.messageId)),
  )
}

/**
 * Determine the merge target for a branch:
 * - If parentBranch still exists and is not itself merged, merge into parent
 * - If parentBranch was already merged, merge into main
 */
export function getMergeTarget(
  branchId: string,
  branches: ConversationBranch[],
): string {
  const branch = branches.find((b) => b.id === branchId)
  if (!branch || !branch.parentBranchId) return "main"

  const parent = branches.find((b) => b.id === branch.parentBranchId)
  if (parent && parent.id !== "main" && !parent.mergedInto) return parent.id
  return "main"
}

/**
 * Re-tag source branch's memory entries to target branch (for merge).
 */
export function mergeMemory(
  sourceBranchId: string,
  targetBranchId: string,
  memory: ConversationMemory,
): ConversationMemory {
  return {
    ...memory,
    entries: memory.entries.map((e) =>
      e.branchId === sourceBranchId
        ? { ...e, branchId: targetBranchId }
        : e,
    ),
  }
}
