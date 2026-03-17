/**
 * Semantic Embedding — Gemini Embedding API integration
 *
 * Uses Google Gemini's embedding models to compute vector embeddings
 * for memory nodes, then calculates cosine similarity to create
 * semantic edges between related nodes.
 */

import { loadUserData, saveUserData } from "./storage"

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface NodeEmbedding {
  nodeId: string
  vector: number[]
  text: string // the text that was embedded (for cache invalidation)
  model: string
  timestamp: string
}

export interface EmbeddingCache {
  embeddings: NodeEmbedding[]
  version: number
}

export interface SemanticEdge {
  from: string
  to: string
  similarity: number // 0..1
  sharedTopics: string[] // extracted common themes
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const CACHE_NS = "semantic-embeddings"
const PRIMARY_MODEL = "gemini-embedding-2-preview"
const FALLBACK_MODEL = "gemini-embedding-001"

/* ------------------------------------------------------------------ */
/*  Cache                                                              */
/* ------------------------------------------------------------------ */

export function loadEmbeddingCache(userId: string): EmbeddingCache {
  return loadUserData<EmbeddingCache>(userId, CACHE_NS, {
    embeddings: [],
    version: 1,
  })
}

function saveEmbeddingCache(
  userId: string,
  cache: EmbeddingCache,
): void {
  saveUserData(userId, CACHE_NS, cache)
}

/* ------------------------------------------------------------------ */
/*  Gemini Embedding API                                               */
/* ------------------------------------------------------------------ */

async function callGeminiEmbedding(
  text: string,
  apiKey: string,
  modelId: string,
): Promise<number[]> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:embedContent?key=${apiKey}`

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${modelId}`,
      content: { parts: [{ text }] },
    }),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => "")
    throw new Error(`Embedding API error (${res.status}): ${err.slice(0, 200)}`)
  }

  const data = await res.json()
  const values = data?.embedding?.values
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("Invalid embedding response")
  }
  return values
}

/**
 * Get embedding for a text, using primary model with fallback.
 */
async function getEmbedding(
  text: string,
  apiKey: string,
): Promise<{ vector: number[]; model: string }> {
  try {
    const vector = await callGeminiEmbedding(text, apiKey, PRIMARY_MODEL)
    return { vector, model: PRIMARY_MODEL }
  } catch {
    // Fallback to older model
    const vector = await callGeminiEmbedding(text, apiKey, FALLBACK_MODEL)
    return { vector, model: FALLBACK_MODEL }
  }
}

/* ------------------------------------------------------------------ */
/*  Cosine Similarity                                                  */
/* ------------------------------------------------------------------ */

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

/* ------------------------------------------------------------------ */
/*  Build text for embedding from a node                               */
/* ------------------------------------------------------------------ */

interface MemoryNodeLike {
  id: string
  label: string
  category: string
  keywords?: string[]
  conversations?: { topic: string; excerpt: string }[]
}

function buildNodeText(node: MemoryNodeLike): string {
  const parts: string[] = []
  parts.push(`Topic: ${node.label}`)
  parts.push(`Category: ${node.category}`)
  if (node.keywords?.length) {
    parts.push(`Keywords: ${node.keywords.join(", ")}`)
  }
  if (node.conversations?.length) {
    // Use the most recent 3 conversation excerpts
    const recent = node.conversations.slice(-3)
    for (const c of recent) {
      parts.push(`${c.topic}: ${c.excerpt.slice(0, 150)}`)
    }
  }
  return parts.join("\n")
}

/* ------------------------------------------------------------------ */
/*  Extract shared topics between two nodes                            */
/* ------------------------------------------------------------------ */

function extractSharedTopics(
  a: MemoryNodeLike,
  b: MemoryNodeLike,
): string[] {
  const shared: string[] = []

  // Check category match
  if (a.category === b.category) {
    shared.push(a.category)
  }

  // Check keyword overlap
  const aKeys = new Set((a.keywords || []).map((k) => k.toLowerCase()))
  const bKeys = (b.keywords || []).map((k) => k.toLowerCase())
  for (const k of bKeys) {
    if (aKeys.has(k)) shared.push(k)
  }

  // Check label word overlap (for multi-word labels)
  const aWords = new Set(a.label.toLowerCase().split(/\s+/).filter((w) => w.length > 2))
  const bWords = b.label.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
  for (const w of bWords) {
    if (aWords.has(w)) shared.push(w)
  }

  return [...new Set(shared)].slice(0, 4)
}

/* ------------------------------------------------------------------ */
/*  Main: compute embeddings for all nodes and find semantic edges     */
/* ------------------------------------------------------------------ */

// Prevent concurrent runs
let isComputing = false

export async function computeSemanticEdges(
  userId: string,
  nodes: MemoryNodeLike[],
  apiKey: string,
  threshold: number,
  onProgress?: (done: number, total: number) => void,
): Promise<SemanticEdge[]> {
  if (isComputing) return []
  isComputing = true

  try {
    // Filter out the "user" hub node
    const contentNodes = nodes.filter((n) => n.id !== "user" && n.label)
    if (contentNodes.length < 2) return []

    const cache = loadEmbeddingCache(userId)
    const cacheMap = new Map(
      cache.embeddings.map((e) => [e.nodeId, e]),
    )

    // Compute embeddings for nodes that aren't cached or have changed
    const embeddings: Map<string, number[]> = new Map()
    let done = 0
    const total = contentNodes.length

    for (const node of contentNodes) {
      const text = buildNodeText(node)
      const cached = cacheMap.get(node.id)

      if (cached && cached.text === text) {
        embeddings.set(node.id, cached.vector)
      } else {
        try {
          const { vector, model } = await getEmbedding(text, apiKey)
          embeddings.set(node.id, vector)

          // Update cache
          cacheMap.set(node.id, {
            nodeId: node.id,
            vector,
            text,
            model,
            timestamp: new Date().toISOString(),
          })
        } catch (err) {
          console.warn(
            `[semanticEmbedding] Failed to embed node "${node.label}":`,
            err,
          )
          // Skip this node
        }
      }

      done++
      onProgress?.(done, total)

      // Rate limit: small delay between API calls
      if (done < total && !cacheMap.get(node.id)?.text) {
        await new Promise((r) => setTimeout(r, 100))
      }
    }

    // Save updated cache
    saveEmbeddingCache(userId, {
      embeddings: Array.from(cacheMap.values()),
      version: 1,
    })

    // Compute pairwise similarities
    const nodeIds = Array.from(embeddings.keys())
    const nodeMap = new Map(contentNodes.map((n) => [n.id, n]))
    const edges: SemanticEdge[] = []

    for (let i = 0; i < nodeIds.length; i++) {
      for (let j = i + 1; j < nodeIds.length; j++) {
        const idA = nodeIds[i]
        const idB = nodeIds[j]
        const vecA = embeddings.get(idA)!
        const vecB = embeddings.get(idB)!

        // Only compare embeddings of the same dimension
        if (vecA.length !== vecB.length) continue

        const similarity = cosineSimilarity(vecA, vecB)

        if (similarity >= threshold) {
          const nodeA = nodeMap.get(idA)
          const nodeB = nodeMap.get(idB)
          edges.push({
            from: idA,
            to: idB,
            similarity,
            sharedTopics: nodeA && nodeB
              ? extractSharedTopics(nodeA, nodeB)
              : [],
          })
        }
      }
    }

    // Sort by similarity descending
    edges.sort((a, b) => b.similarity - a.similarity)

    return edges
  } finally {
    isComputing = false
  }
}

/**
 * Remove cached embeddings for deleted nodes.
 */
export function pruneEmbeddingCache(
  userId: string,
  existingNodeIds: Set<string>,
): void {
  const cache = loadEmbeddingCache(userId)
  const pruned = cache.embeddings.filter((e) =>
    existingNodeIds.has(e.nodeId),
  )
  if (pruned.length !== cache.embeddings.length) {
    saveEmbeddingCache(userId, { ...cache, embeddings: pruned })
  }
}
