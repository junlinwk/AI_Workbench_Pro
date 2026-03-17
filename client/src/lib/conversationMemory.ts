/**
 * Conversation Memory — extraction, compaction, migration, and persistence
 *
 * Each conversation has an auto-maintained memory document.
 * Memory entries are branch-aware and auto-compact when they grow large.
 */

import { loadUserData, saveUserData } from "./storage"
import type {
  MemoryEntry,
  ConversationMemory,
  Message,
  ConversationBranch,
  BranchPoint,
} from "./branchLineage"

export type { MemoryEntry, ConversationMemory }

const MEMORY_NS = "conv-memory"
const MESSAGES_NS = "conv-messages"

function getMemoryKey(conversationId: string): string {
  return `${MEMORY_NS}:${conversationId}`
}

export function getMessagesKey(conversationId: string): string {
  return `${MESSAGES_NS}:${conversationId}`
}

/* ------------------------------------------------------------------ */
/*  Load / Save helpers                                                */
/* ------------------------------------------------------------------ */

export function loadMemory(
  userId: string,
  conversationId: string,
): ConversationMemory {
  return loadUserData<ConversationMemory>(
    userId,
    getMemoryKey(conversationId),
    { entries: [], lastCompactedAt: null, version: 1 },
  )
}

export function saveMemory(
  userId: string,
  conversationId: string,
  memory: ConversationMemory,
): void {
  saveUserData(userId, getMemoryKey(conversationId), memory)
}

export function loadUnifiedMessages(
  userId: string,
  conversationId: string,
): Message[] | null {
  return loadUserData<Message[] | null>(
    userId,
    getMessagesKey(conversationId),
    null,
  )
}

export function saveUnifiedMessages(
  userId: string,
  conversationId: string,
  messages: Message[],
): void {
  saveUserData(userId, getMessagesKey(conversationId), messages)
}

/* ------------------------------------------------------------------ */
/*  Migration: per-branch storage → unified storage                    */
/* ------------------------------------------------------------------ */

interface BranchData {
  branches: ConversationBranch[]
  branchPoints: BranchPoint[]
  activeBranchId: string
}

/**
 * Migrate old per-branch message storage to a single unified array.
 * - Load main messages from `chat-${conversationId}`
 * - Load each branch's messages from `chat-${conversationId}-${branchId}`
 * - Deduplicate by message id
 * - Tag untagged messages with appropriate branchId
 * - Save to new unified key
 */
export function migrateToUnifiedMessages(
  userId: string,
  conversationId: string,
  branchData: BranchData | null,
): Message[] {
  const mainKey = conversationId
    ? `chat-${conversationId}`
    : "chat-default"

  // Load main messages
  const mainMessages = loadUserData<Message[]>(userId, mainKey, [])

  // Tag main messages
  const taggedMain = mainMessages.map((m) => ({
    ...m,
    branchId: m.branchId || "main",
  }))

  const allMessages: Message[] = [...taggedMain]
  const seenIds = new Set(taggedMain.map((m) => m.id))

  // Load branch messages
  if (branchData?.branches) {
    for (const branch of branchData.branches) {
      if (branch.id === "main") continue
      const branchKey = conversationId
        ? `chat-${conversationId}-${branch.id}`
        : `chat-default-${branch.id}`
      const branchMessages = loadUserData<Message[]>(
        userId,
        branchKey,
        [],
      )

      // Find the branch point to know which messages were copied from parent
      const bp = branch.branchPointId
        ? branchData.branchPoints.find(
            (p) => p.id === branch.branchPointId,
          )
        : null

      for (const m of branchMessages) {
        if (seenIds.has(m.id)) continue
        seenIds.add(m.id)
        allMessages.push({
          ...m,
          branchId: m.branchId || branch.id,
        })
      }
    }
  }

  // Persist to unified key
  if (allMessages.length > 0) {
    saveUnifiedMessages(userId, conversationId || "default", allMessages)
  }

  return allMessages
}

/* ------------------------------------------------------------------ */
/*  Memory extraction                                                  */
/* ------------------------------------------------------------------ */

const EXTRACT_PROMPT = `You are a conversation memory assistant. Extract 1-3 bullet points of key information from this exchange. Be extremely concise. Format:
- [topic]: key point

Focus on: decisions made, facts stated, code patterns, user preferences, problems identified, solutions proposed.
Skip: greetings, filler, obvious context.`

/**
 * Extract memory from a user+AI exchange in the background.
 * Uses the same AI provider the user has selected.
 */
export async function extractMemoryInBackground(
  userId: string,
  conversationId: string,
  aiMsg: Message,
  userMsg: Message,
  modelId: string,
  apiKey: string,
  callAI: (
    messages: { role: string; content: string }[],
    modelId: string,
    apiKey: string,
    temperature: number,
    maxTokens: number,
    systemPrompt: string,
  ) => Promise<string>,
  branchId: string,
): Promise<void> {
  try {
    const userSnippet = userMsg.content.slice(0, 500)
    const aiSnippet = aiMsg.content.slice(0, 1500)

    const extractionMessages = [
      {
        role: "user",
        content: `User: "${userSnippet}"\nAI: "${aiSnippet}"\n\nKey points:`,
      },
    ]

    const result = await callAI(
      extractionMessages,
      modelId,
      apiKey,
      0.1,
      200,
      EXTRACT_PROMPT,
    )

    if (!result || result.trim().length < 5) return

    const memory = loadMemory(userId, conversationId)
    const newEntry: MemoryEntry = {
      id: `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      messageId: aiMsg.id,
      branchId,
      content: result.trim(),
      timestamp: new Date().toISOString(),
      isCompacted: false,
    }

    memory.entries.push(newEntry)
    saveMemory(userId, conversationId, memory)

    // Check if compaction is needed
    const branchEntries = memory.entries.filter(
      (e) => e.branchId === branchId && !e.isCompacted,
    )
    const totalChars = branchEntries.reduce(
      (sum, e) => sum + e.content.length,
      0,
    )
    if (branchEntries.length >= 20 || totalChars >= 2000) {
      await compactMemory(
        userId,
        conversationId,
        branchId,
        modelId,
        apiKey,
        callAI,
      )
    }
  } catch (err) {
    console.warn("[conversationMemory] extraction failed:", err)
  }
}

/* ------------------------------------------------------------------ */
/*  Memory compaction                                                  */
/* ------------------------------------------------------------------ */

const COMPACT_PROMPT = `Compact these conversation memory notes into a shorter summary. Rules:
1. Preserve ALL facts, decisions, code patterns, user preferences
2. Merge related points, remove redundancy
3. Keep bullet format (- [topic]: point)
4. Aim for 40-60% of original length
5. Never drop a fact mentioned only once`

// Prevent concurrent compactions
const compactionInProgress = new Set<string>()

async function compactMemory(
  userId: string,
  conversationId: string,
  branchId: string,
  modelId: string,
  apiKey: string,
  callAI: (
    messages: { role: string; content: string }[],
    modelId: string,
    apiKey: string,
    temperature: number,
    maxTokens: number,
    systemPrompt: string,
  ) => Promise<string>,
): Promise<void> {
  const lockKey = `${conversationId}:${branchId}`
  if (compactionInProgress.has(lockKey)) return
  compactionInProgress.add(lockKey)

  try {
    const memory = loadMemory(userId, conversationId)
    const branchEntries = memory.entries.filter(
      (e) => e.branchId === branchId && !e.isCompacted,
    )

    if (branchEntries.length < 10) return

    const entriesText = branchEntries
      .map((e) => e.content)
      .join("\n")

    const result = await callAI(
      [
        {
          role: "user",
          content: `Notes:\n${entriesText}\n\nCompacted:`,
        },
      ],
      modelId,
      apiKey,
      0.1,
      500,
      COMPACT_PROMPT,
    )

    if (!result || result.trim().length < 10) return

    // Mark old entries as compacted
    const compactedIds = branchEntries.map((e) => e.id)
    for (const entry of memory.entries) {
      if (compactedIds.includes(entry.id)) {
        entry.isCompacted = true
      }
    }

    // Add new compacted entry
    memory.entries.push({
      id: `mem_compact_${Date.now().toString(36)}`,
      messageId: "compacted",
      branchId,
      content: result.trim(),
      timestamp: new Date().toISOString(),
      isCompacted: false,
      compactedFrom: compactedIds,
    })

    memory.lastCompactedAt = new Date().toISOString()
    saveMemory(userId, conversationId, memory)
  } catch (err) {
    console.warn("[conversationMemory] compaction failed:", err)
  } finally {
    compactionInProgress.delete(lockKey)
  }
}

/* ------------------------------------------------------------------ */
/*  Format memory for system prompt injection                          */
/* ------------------------------------------------------------------ */

export function formatMemoryForPrompt(
  entries: MemoryEntry[],
): string {
  if (entries.length === 0) return ""

  const content = entries.map((e) => e.content).join("\n")
  return `\n\n--- Conversation Memory ---\nKey points from this conversation so far:\n${content}\n--- End Memory ---`
}
