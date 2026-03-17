/**
 * TaskDAG — Interactive Logic Graph Editor with Real AI Execution
 * Void Glass Design System: dark glassmorphism, oklch colors, blue/violet gradients
 * Visual node-based logic graph editor where each node represents an AI task/role.
 * Nodes can be freely dragged, connected with edges, and the graph supports
 * branches, loops, and parallel paths.
 * Each node calls the real AI API when executed.
 */
import { useState, useEffect, useCallback, useRef } from "react"
import { cn } from "@/lib/utils"
import { useSettings } from "@/contexts/SettingsContext"
import { useAuth } from "@/contexts/AuthContext"
import { loadUserData, saveUserData } from "@/lib/storage"
import {
  Play,
  Square,
  Plus,
  Trash2,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  CheckCircle2,
  Loader2,
  AlertCircle,
  X,
  Brain,
  Search,
  Code,
  FileText,
  LogIn,
  LogOut,
  Repeat,
  ArrowRight,
  Diamond,
} from "lucide-react"
import { toast } from "sonner"
import { ALL_MODELS } from "./ModelSwitcher"

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type NodeStatus = "idle" | "running" | "completed" | "error"

interface DAGNode {
  id: string
  nodeIndex: number // human-readable number: #1, #2, #3...
  x: number
  y: number
  label: string
  prompt: string
  role: string
  passCondition: string
  loopPrompt: string
  maxIterations: number
  status: NodeStatus
  output: string
  visitCount: number
  deletable?: boolean
  nodeType: "task" | "conditional" | "entry" | "exit"
  conditionExamine: string
  conditionSuccess: string
  conditionFailure: string
  conditionImprove: string
}

type EdgeType = "default" | "pass" | "fail"

interface DAGEdge {
  id: string
  from: string
  to: string
  type: EdgeType
  color: string
  label: string
  prompt: string
  status: "idle" | "active" | "completed"
}

interface DAGState {
  nodes: DAGNode[]
  edges: DAGEdge[]
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const NODE_W = 160
const NODE_H = 80
const PORT_R = 5

const ENTRY_NODE_ID = "node_entry"
const EXIT_NODE_ID = "node_exit"

const EDGE_COLOR_DEFAULT = "rgba(255,255,255,0.25)"
const EDGE_COLOR_PASS = "#34d399"
const EDGE_COLOR_FAIL = "#fbbf24"

/* ------------------------------------------------------------------ */
/*  ID generator                                                       */
/* ------------------------------------------------------------------ */

let _idCounter = 0
function genId(prefix = "n") {
  return `${prefix}_${Date.now()}_${++_idCounter}`
}

/* ------------------------------------------------------------------ */
/*  Entry / Exit node factories                                        */
/* ------------------------------------------------------------------ */

function createEntryNode(en: boolean): DAGNode {
  return {
    id: ENTRY_NODE_ID,
    nodeIndex: 0,
    x: 80,
    y: 150,
    label: en ? "Entry" : "\u5165\u53e3",
    prompt: en
      ? "This is the entry point. Define the overall task goal here."
      : "\u9019\u662f\u5165\u53e3\u9ede\u3002\u5728\u6b64\u5b9a\u7fa9\u6574\u9ad4\u4efb\u52d9\u76ee\u6a19\u3002",
    role: en
      ? "You are the task orchestrator."
      : "\u4f60\u662f\u4efb\u52d9\u7de8\u6392\u5668\u3002",
    passCondition: "",
    loopPrompt: "",
    maxIterations: 3,
    status: "idle",
    output: "",
    visitCount: 0,
    deletable: false,
    nodeType: "entry",
    conditionExamine: "",
    conditionSuccess: "",
    conditionFailure: "",
    conditionImprove: "",
  }
}

function createExitNode(en: boolean): DAGNode {
  return {
    id: EXIT_NODE_ID,
    nodeIndex: 99,
    x: 500,
    y: 150,
    label: en ? "Exit" : "\u51fa\u53e3",
    prompt: en
      ? "This is the exit point. Final output will be collected here."
      : "\u9019\u662f\u51fa\u53e3\u9ede\u3002\u6700\u7d42\u8f38\u51fa\u5c07\u5728\u6b64\u6536\u96c6\u3002",
    role: en
      ? "You are the result aggregator."
      : "\u4f60\u662f\u7d50\u679c\u5f59\u7e3d\u5668\u3002",
    passCondition: "",
    loopPrompt: "",
    maxIterations: 3,
    status: "idle",
    output: "",
    visitCount: 0,
    deletable: false,
    nodeType: "exit",
    conditionExamine: "",
    conditionSuccess: "",
    conditionFailure: "",
    conditionImprove: "",
  }
}

/* ------------------------------------------------------------------ */
/*  Migrate legacy data (add new fields)                               */
/* ------------------------------------------------------------------ */

function migrateNode(n: any, index: number): DAGNode {
  if (!n || typeof n !== "object") {
    return {
      id: genId("n"),
      nodeIndex: index,
      x: 0,
      y: 0,
      label: "",
      prompt: "",
      role: "",
      passCondition: "",
      loopPrompt: "",
      maxIterations: 3,
      status: "idle",
      output: "",
      visitCount: 0,
      nodeType: "task",
      conditionExamine: "",
      conditionSuccess: "",
      conditionFailure: "",
      conditionImprove: "",
    }
  }
  // Assign nodeIndex: Entry=0, Exit=99, others use saved value or fallback to position-based index
  const idx = typeof n.nodeIndex === "number"
    ? n.nodeIndex
    : n.id === ENTRY_NODE_ID ? 0
    : n.id === EXIT_NODE_ID ? 99
    : index
  return {
    id: n.id ?? genId("n"),
    nodeIndex: idx,
    x: typeof n.x === "number" ? n.x : 0,
    y: typeof n.y === "number" ? n.y : 0,
    label: n.label ?? "",
    prompt: n.prompt ?? "",
    role: n.role ?? "",
    passCondition: n.passCondition ?? "",
    loopPrompt: n.loopPrompt ?? "",
    maxIterations: typeof n.maxIterations === "number" ? n.maxIterations : 3,
    status: "idle",
    output: "",
    visitCount: 0,
    deletable: n.deletable,
    nodeType: n.nodeType || (n.id === ENTRY_NODE_ID ? "entry" : n.id === EXIT_NODE_ID ? "exit" : "task"),
    conditionExamine: n.conditionExamine ?? "",
    conditionSuccess: n.conditionSuccess ?? "",
    conditionFailure: n.conditionFailure ?? "",
    conditionImprove: n.conditionImprove ?? "",
  }
}

function migrateEdge(e: any): DAGEdge {
  if (!e || typeof e !== "object") {
    return {
      id: genId("e"),
      from: "",
      to: "",
      type: "default",
      color: EDGE_COLOR_DEFAULT,
      label: "",
      prompt: "",
      status: "idle",
    }
  }
  return {
    id: e.id ?? genId("e"),
    from: e.from ?? "",
    to: e.to ?? "",
    type: e.type ?? "default",
    color: e.color ?? EDGE_COLOR_DEFAULT,
    label: e.label ?? "",
    prompt: e.prompt ?? "",
    status: "idle",
  }
}

/* ------------------------------------------------------------------ */
/*  Node icon helper                                                   */
/* ------------------------------------------------------------------ */

function nodeIcon(node: DAGNode) {
  if (node.id === ENTRY_NODE_ID) return <LogIn size={14} />
  if (node.id === EXIT_NODE_ID) return <LogOut size={14} />
  if (node.nodeType === "conditional") return <Diamond size={14} />
  const l = node.label.toLowerCase()
  if (l.includes("research") || l.includes("\u7814\u7a76"))
    return <Search size={14} />
  if (
    l.includes("implement") ||
    l.includes("\u5be6\u4f5c") ||
    l.includes("code") ||
    l.includes("\u7a0b\u5f0f")
  )
    return <Code size={14} />
  if (l.includes("report") || l.includes("\u5831\u544a"))
    return <FileText size={14} />
  return <Brain size={14} />
}

/* ------------------------------------------------------------------ */
/*  Bezier path helper                                                 */
/* ------------------------------------------------------------------ */

function edgePath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): string {
  const dx = x2 - x1

  // Loop/backward edge: target is at or before source
  if (dx <= 0) {
    const loopHeight = Math.max(120, Math.abs(dx) * 0.5)
    return `M ${x1} ${y1} C ${x1 + 60} ${y1 - loopHeight}, ${x2 - 60} ${y2 - loopHeight}, ${x2} ${y2}`
  }

  // Normal forward edge
  const cpOffset = Math.max(Math.abs(dx) * 0.4, 40)
  return `M ${x1} ${y1} C ${x1 + cpOffset} ${y1}, ${x2 - cpOffset} ${y2}, ${x2} ${y2}`
}

/* ------------------------------------------------------------------ */
/*  Arrow marker helper                                                */
/* ------------------------------------------------------------------ */

function arrowPoints(
  x2: number,
  y2: number,
  x1: number,
  y1: number,
): string {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const size = 8
  const ax = x2 - size * Math.cos(angle - 0.35)
  const ay = y2 - size * Math.sin(angle - 0.35)
  const bx = x2 - size * Math.cos(angle + 0.35)
  const by = y2 - size * Math.sin(angle + 0.35)
  return `${x2},${y2} ${ax},${ay} ${bx},${by}`
}

/* ------------------------------------------------------------------ */
/*  Edge midpoint helper                                               */
/* ------------------------------------------------------------------ */

function edgeMidpoint(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { x: number; y: number } {
  const dx = x2 - x1
  if (dx <= 0) {
    const loopHeight = Math.max(120, Math.abs(dx) * 0.5)
    // Midpoint of a cubic bezier at t=0.5
    const mx = (x1 + 3 * (x1 + 60) + 3 * (x2 - 60) + x2) / 8
    const my =
      (y1 +
        3 * (y1 - loopHeight) +
        3 * (y2 - loopHeight) +
        y2) /
      8
    return { x: mx, y: my }
  }
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 }
}

/* ------------------------------------------------------------------ */
/*  Cycle detection                                                    */
/* ------------------------------------------------------------------ */

function detectsCycle(
  from: string,
  to: string,
  edges: DAGEdge[],
): boolean {
  // DFS from `to` following existing edges; if we reach `from`, it's a cycle
  const visited = new Set<string>()
  const stack = [to]
  while (stack.length > 0) {
    const curr = stack.pop()!
    if (curr === from) return false // forward edge
    if (visited.has(curr)) continue
    visited.add(curr)
    for (const e of edges) {
      if (e.from === curr) stack.push(e.to)
    }
  }
  // If we could NOT reach `from` by going forward from `to`,
  // then adding from->to creates no cycle. But wait, we want
  // to detect if adding from->to would form a cycle. That means
  // we check if `from` is reachable from `to` via existing edges.
  // Let me redo: if from IS reachable from to, adding from->to creates a cycle.
  const visited2 = new Set<string>()
  const stack2 = [to]
  while (stack2.length > 0) {
    const curr = stack2.pop()!
    if (curr === from) return true // cycle!
    if (visited2.has(curr)) continue
    visited2.add(curr)
    for (const e of edges) {
      if (e.from === curr) stack2.push(e.to)
    }
  }
  return false
}

/* ------------------------------------------------------------------ */
/*  AI API caller (multi-provider)                                     */
/* ------------------------------------------------------------------ */

async function callNodeAI(
  prompt: string,
  modelId: string,
  apiKey: string,
  temperature: number,
  maxTokens: number,
): Promise<string> {
  const model = ALL_MODELS.find((m) => m.id === modelId) || {
    id: modelId,
    providerId: "openai",
  }

  let endpoint: string
  let headers: Record<string, string>
  let body: unknown

  switch (model.providerId) {
    case "openai":
    case "deepseek":
    case "xai": {
      const baseUrl =
        model.providerId === "deepseek"
          ? "https://api.deepseek.com"
          : model.providerId === "xai"
            ? "https://api.x.ai"
            : "https://api.openai.com"
      endpoint = `${baseUrl}/v1/chat/completions`
      headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      }
      body = {
        model: modelId,
        messages: [{ role: "system", content: prompt }],
        temperature,
        max_tokens: maxTokens,
      }
      break
    }
    case "anthropic": {
      endpoint = "https://api.anthropic.com/v1/messages"
      headers = {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      }
      body = {
        model: modelId,
        system: prompt,
        messages: [
          { role: "user", content: "Execute this task." },
        ],
        max_tokens: maxTokens,
        temperature,
      }
      break
    }
    case "google": {
      endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`
      headers = { "Content-Type": "application/json" }
      body = {
        contents: [
          { role: "user", parts: [{ text: prompt }] },
        ],
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
        },
      }
      break
    }
    case "meta": {
      endpoint =
        "https://api.groq.com/openai/v1/chat/completions"
      headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      }
      body = {
        model: modelId,
        messages: [{ role: "system", content: prompt }],
        temperature,
        max_tokens: maxTokens,
      }
      break
    }
    case "mistral": {
      endpoint =
        "https://api.mistral.ai/v1/chat/completions"
      headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      }
      body = {
        model: modelId,
        messages: [{ role: "system", content: prompt }],
        temperature,
        max_tokens: maxTokens,
      }
      break
    }
    case "openrouter": {
      endpoint =
        "https://openrouter.ai/api/v1/chat/completions"
      headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": typeof window !== "undefined" ? window.location.origin : "",
        "X-OpenRouter-Title": "AI Workbench",
      }
      body = {
        model: modelId,
        messages: [{ role: "system", content: prompt }],
        temperature,
        max_tokens: maxTokens,
      }
      break
    }
    default:
      throw new Error(`Unsupported provider: ${model.providerId}`)
  }

  // Only use server proxy on localhost (Vercel Hobby has 10s timeout)
  const useProxy =
    typeof window !== "undefined" &&
    window.location.hostname === "localhost"

  let res: Response
  if (useProxy) {
    res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint, headers, body }),
    })
  } else {
    res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    })
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(
      `API error (${res.status}): ${text.slice(0, 200)}`,
    )
  }
  const data = await res.json()

  if (model.providerId === "anthropic")
    return data.content?.[0]?.text || ""
  if (model.providerId === "google")
    return (
      data.candidates?.[0]?.content?.parts?.[0]?.text || ""
    )
  return data.choices?.[0]?.message?.content || ""
}

/* ------------------------------------------------------------------ */
/*  Parse AI response for structured JSON                              */
/* ------------------------------------------------------------------ */

interface ParsedResponse {
  status: "completed" | "needs_retry" | "unknown"
  result: string
  summary: string
  raw: string
}

function parseAIResponse(raw: string): ParsedResponse {
  // Try to extract JSON from the response
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0])
      if (
        parsed.status === "completed" ||
        parsed.status === "needs_retry"
      ) {
        return {
          status: parsed.status,
          result: parsed.result || raw,
          summary: parsed.summary || "",
          raw,
        }
      }
    } catch {
      // JSON parse failed, fallback
    }
  }
  // Fallback: treat any response as completed
  return {
    status: "completed",
    result: raw,
    summary: raw.slice(0, 80),
    raw,
  }
}

/* ------------------------------------------------------------------ */
/*  Build full prompt for a node                                       */
/* ------------------------------------------------------------------ */

/** Build the full topology context string so the AI knows the entire graph structure */
function buildTopologyContext(
  node: DAGNode,
  allNodes: DAGNode[],
  allEdges: DAGEdge[],
): string {
  const inEdges = allEdges.filter((e) => e.to === node.id)
  const outEdges = allEdges.filter((e) => e.from === node.id)

  const inNodes = inEdges.map((e) => {
    const src = allNodes.find((n) => n.id === e.from)
    return src ? `#${src.nodeIndex} "${src.label}" [${e.type}]` : e.from
  })
  const outNodes = outEdges.map((e) => {
    const tgt = allNodes.find((n) => n.id === e.to)
    return tgt ? `#${tgt.nodeIndex} "${tgt.label}" [${e.type}]` : e.to
  })

  let topo = `\n\n=== Node Topology ===`
  topo += `\nYou are Node #${node.nodeIndex} "${node.label}"`
  topo += `\nIncoming (${inNodes.length}): ${inNodes.length > 0 ? inNodes.join(", ") : "(none — entry point)"}`
  topo += `\nOutgoing (${outNodes.length}): ${outNodes.length > 0 ? outNodes.join(", ") : "(none — terminal)"}`

  // Full graph map for awareness
  topo += `\n\n--- Full Graph ---`
  for (const n of allNodes) {
    const nIn = allEdges.filter((e) => e.to === n.id).map((e) => {
      const s = allNodes.find((x) => x.id === e.from)
      return s ? `#${s.nodeIndex}` : "?"
    })
    const nOut = allEdges.filter((e) => e.from === n.id).map((e) => {
      const t = allNodes.find((x) => x.id === e.to)
      return t ? `#${t.nodeIndex}` : "?"
    })
    const marker = n.id === node.id ? " ← YOU" : ""
    topo += `\n  #${n.nodeIndex} "${n.label}" | in:[${nIn.join(",")}] → out:[${nOut.join(",")}]${marker}`
  }

  return topo
}

function buildNodePrompt(
  node: DAGNode,
  allNodes: DAGNode[],
  allEdges: DAGEdge[],
  predecessorOutputs: Map<string, string>,
  incomingEdgePrompt?: string,
  visitCounts?: Map<string, number>,
): string {
  let prompt: string

  if (node.nodeType === "conditional") {
    prompt = `Role: ${node.role}\n\nNode #${node.nodeIndex} "${node.label}" — CONDITIONAL EVALUATION NODE\n\n`
    prompt += `## What This Node Examines\n${node.conditionExamine}\n\n`
    prompt += `## Success Criteria\n${node.conditionSuccess}\n\n`
    prompt += `## Failure Criteria\n${node.conditionFailure}\n\n`
    prompt += `## Improvement Guidance (if failing)\n${node.conditionImprove}\n\n`
    prompt += `IMPORTANT: You MUST evaluate the input against the criteria above and respond with:\n`
    prompt += `- status: "completed" if SUCCESS criteria are met\n`
    prompt += `- status: "needs_retry" if FAILURE criteria are met\n`
    prompt += `In your result, explain WHY you made this determination.\n`
  } else {
    prompt = `Role: ${node.role}\n\nNode #${node.nodeIndex} "${node.label}"\n\n${node.prompt}`
  }

  // Inject full topology so the AI knows where it sits in the graph
  prompt += buildTopologyContext(node, allNodes, allEdges)

  if (incomingEdgePrompt) {
    prompt += `\n\nAdditional context from incoming edges:\n${incomingEdgePrompt}`
  }

  const inputCount = predecessorOutputs.size

  if (inputCount > 0) {
    prompt += `\n\n--- Collected Inputs (${inputCount} predecessor${inputCount > 1 ? "s" : ""}) ---`
    for (const [label, output] of predecessorOutputs) {
      prompt += `\n\n[From: ${label}]\n${output}`
    }
  }

  // Multi-input aggregation instruction
  if (inputCount > 1 && node.id !== EXIT_NODE_ID) {
    prompt += `\n\nIMPORTANT — CONFLUENCE NODE: This node receives outputs from ${inputCount} predecessor nodes listed above. You MUST:
1. Read and understand ALL ${inputCount} inputs thoroughly — do NOT skip any
2. Aggregate, synthesize, and merge the information from every input
3. Produce a single unified result that incorporates insights from all predecessors
4. In your result, explicitly reference which predecessor provided what information
Do NOT ignore any input. Every predecessor's output must be reflected in your result.`
  }

  // Special handling for Exit node: instruct aggregation
  if (node.id === EXIT_NODE_ID) {
    prompt += `\n\nIMPORTANT — FINAL AGGREGATION: You are the Exit node #${node.nodeIndex}. You received outputs from ${inputCount} predecessor node${inputCount > 1 ? "s" : ""}. You MUST aggregate ALL the previous node outputs above into a single coherent final answer. Read every input carefully, synthesize and summarize the key results from each predecessor into one comprehensive final output. Do not omit any predecessor's contribution.

You must respond in this exact JSON format:
{
  "status": "completed",
  "result": "your aggregated final output here",
  "summary": "one-line summary of the overall result"
}`
  } else {
    prompt += `\n\nYou must respond in this exact JSON format:
{
  "status": "completed" | "needs_retry",
  "result": "your detailed output here",
  "summary": "one-line summary of what was done"
}`
  }

  // Loop-aware prompt injection when node is re-visited
  const visits = visitCounts?.get(node.id) || node.visitCount || 0
  if (visits > 1) {
    prompt += `\n\n⚠️ AUTO-LOOP ITERATION #${visits}\n`
    prompt += `This node is being re-executed as part of an iterative development loop.\n`
    prompt += `Previous output was sent back because it did not meet the conditional check.\n`
    prompt += `You MUST:\n`
    prompt += `1. Review the previous output and the failure feedback\n`
    prompt += `2. Identify specific areas that need improvement\n`
    prompt += `3. Make concrete changes — do NOT repeat the same output\n`
    prompt += `4. Address the improvement guidance from the conditional node\n`
    prompt += `Progress tracking: Iteration ${visits}/${node.maxIterations}\n`
  }

  return prompt
}

/* ------------------------------------------------------------------ */
/*  Stagnation detection helper                                        */
/* ------------------------------------------------------------------ */

async function checkStagnation(
  history: string[],
  modelId: string,
  apiKey: string,
): Promise<boolean> {
  if (history.length < 3) return false
  const last3 = history.slice(-3)

  // Quick heuristic: if last 3 outputs are very similar in length
  const lengths = last3.map((o) => o.length)
  const avgLen = lengths.reduce((a, b) => a + b, 0) / 3
  const lenVariance =
    lengths.reduce((a, b) => a + Math.abs(b - avgLen), 0) / 3

  // If lengths are within 10% of each other, likely converging
  if (avgLen > 0 && lenVariance / avgLen < 0.1) {
    try {
      const analysisPrompt = `Analyze these 3 consecutive outputs from an iterative AI task loop. Are they converging/stagnating (producing essentially the same result each time)? Answer only "yes" or "no".\n\nOutput 1:\n${last3[0].slice(0, 500)}\n\nOutput 2:\n${last3[1].slice(0, 500)}\n\nOutput 3:\n${last3[2].slice(0, 500)}`

      const result = await callNodeAI(
        analysisPrompt,
        modelId,
        apiKey,
        0,
        50,
      )
      return /yes/i.test(result.trim())
    } catch {
      return true // Assume stagnation if analysis fails
    }
  }
  return false
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function TaskDAG() {
  const { settings, getApiKey, hasApiKey } = useSettings()
  const { user } = useAuth()
  const en = settings.language === "en"
  const userId = user?.id || "anon"

  /* ---- State ---- */
  const [nodes, setNodes] = useState<DAGNode[]>(() => {
    try {
      const saved = loadUserData<DAGState>(userId, "task-dag", {
        nodes: [],
        edges: [],
      })
      if (Array.isArray(saved?.nodes) && saved.nodes.length > 0) {
        return saved.nodes.map((n: any, i: number) => migrateNode(n, i + 1))
      }
    } catch {
      // corrupted data, fall through to defaults
    }
    return [createEntryNode(en), createExitNode(en)]
  })

  const [edges, setEdges] = useState<DAGEdge[]>(() => {
    try {
      const saved = loadUserData<DAGState>(userId, "task-dag", {
        nodes: [],
        edges: [],
      })
      if (Array.isArray(saved?.edges) && saved.edges.length > 0) {
        return saved.edges.map(migrateEdge)
      }
    } catch {
      // corrupted data, fall through to defaults
    }
    return []
  })

  const [selectedId, setSelectedId] = useState<string | null>(
    null,
  )
  const [isRunning, setIsRunning] = useState(false)

  // Refs for async execution
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])
  useEffect(() => {
    edgesRef.current = edges
  }, [edges])

  // Persistence
  useEffect(() => {
    try {
      if (!Array.isArray(nodes) || !Array.isArray(edges)) return
      const toSave: DAGState = {
        nodes: nodes.map((n) => ({
          ...n,
          status: "idle" as NodeStatus,
          output: "",
          visitCount: 0,
        })),
        edges: edges.map((e) => ({
          ...e,
          status: "idle" as const,
        })),
      }
      saveUserData(userId, "task-dag", toSave)
    } catch {
      // Silently ignore save errors (e.g. quota exceeded, serialization failure)
    }
  }, [nodes, edges, userId])

  // Clear All confirmation
  const [clearConfirm, setClearConfirm] = useState(false)
  const clearTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null)

  // Canvas pan/zoom
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)

  // Dragging nodes
  const draggingRef = useRef<{
    nodeId: string
    startMouseX: number
    startMouseY: number
    startNodeX: number
    startNodeY: number
  } | null>(null)

  // Connecting edges
  const [connecting, setConnecting] = useState<{
    fromId: string
    mouseX: number
    mouseY: number
  } | null>(null)

  // Panning canvas
  const panningRef = useRef<{
    startMouseX: number
    startMouseY: number
    startPanX: number
    startPanY: number
  } | null>(null)

  // Edge hover for delete
  const [hoveredEdge, setHoveredEdge] = useState<
    string | null
  >(null)

  // Label editing
  const [editingLabelId, setEditingLabelId] = useState<
    string | null
  >(null)
  const [editingLabelValue, setEditingLabelValue] =
    useState("")

  // Execution refs
  const runningRef = useRef(false)
  const stopRef = useRef(false)
  const svgRef = useRef<SVGSVGElement>(null)

  const selectedNode =
    nodes.find((n) => n.id === selectedId) ?? null

  // Check if selected node has loop edges
  const selectedNodeHasLoopEdge = selectedNode
    ? edges.some(
        (e) =>
          (e.from === selectedNode.id &&
            e.type === "fail") ||
          (e.to === selectedNode.id &&
            edges.some(
              (e2) =>
                e2.from === selectedNode.id &&
                e2.type === "fail",
            )),
      )
    : false

  // Edges from selected node
  const selectedNodeEdges = selectedNode
    ? edges.filter((e) => e.from === selectedNode.id)
    : []

  /* ---- viewBox ---- */
  const vbX = -200 / zoom + pan.x
  const vbY = -200 / zoom + pan.y
  const vbW = 600 / zoom
  const vbH = 600 / zoom
  const viewBox = `${vbX} ${vbY} ${vbW} ${vbH}`

  /* ---- SVG coordinate helper ---- */
  const svgPoint = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current
      if (!svg) return { x: 0, y: 0 }
      const rect = svg.getBoundingClientRect()
      const ratioX = vbW / rect.width
      const ratioY = vbH / rect.height
      return {
        x: vbX + (clientX - rect.left) * ratioX,
        y: vbY + (clientY - rect.top) * ratioY,
      }
    },
    [vbX, vbY, vbW, vbH],
  )

  /* ---- Port positions ---- */
  const outputPort = useCallback(
    (node: DAGNode) => ({
      x: node.x + NODE_W,
      y: node.y + NODE_H / 2,
    }),
    [],
  )
  const inputPort = useCallback(
    (node: DAGNode) => ({
      x: node.x,
      y: node.y + NODE_H / 2,
    }),
    [],
  )
  // Conditional nodes: top/bottom ports for fail (loop-back) edges
  const topPort = useCallback(
    (node: DAGNode) => ({
      x: node.x + NODE_W / 2,
      y: node.y,
    }),
    [],
  )
  const bottomPort = useCallback(
    (node: DAGNode) => ({
      x: node.x + NODE_W / 2,
      y: node.y + NODE_H,
    }),
    [],
  )

  /* ---- Mouse handlers ---- */

  // Background mousedown = start panning
  const handleBgMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return
      const target = e.target as SVGElement
      if (
        target.tagName === "svg" ||
        target.getAttribute("data-bg") === "true"
      ) {
        panningRef.current = {
          startMouseX: e.clientX,
          startMouseY: e.clientY,
          startPanX: pan.x,
          startPanY: pan.y,
        }
        e.preventDefault()
      }
    },
    [pan],
  )

  // Node mousedown = start dragging
  const handleNodeMouseDown = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      if (e.button !== 0) return
      e.stopPropagation()
      const node = nodes.find((n) => n.id === nodeId)
      if (!node) return
      draggingRef.current = {
        nodeId,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startNodeX: node.x,
        startNodeY: node.y,
      }
      setSelectedId(nodeId)
    },
    [nodes],
  )

  // Output port mousedown = start connecting
  const handlePortMouseDown = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      e.stopPropagation()
      e.preventDefault()
      const pt = svgPoint(e.clientX, e.clientY)
      setConnecting({
        fromId: nodeId,
        mouseX: pt.x,
        mouseY: pt.y,
      })
    },
    [svgPoint],
  )

  // Input port mouseup = finish connecting
  const handleInputPortMouseUp = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      e.stopPropagation()
      if (connecting && connecting.fromId !== nodeId) {
        // Check if edge already exists
        const exists = edges.some(
          (ed) =>
            ed.from === connecting.fromId &&
            ed.to === nodeId,
        )
        if (!exists) {
          const isCycle = detectsCycle(
            connecting.fromId,
            nodeId,
            edges,
          )

          if (isCycle) {
            // This is a backward/loop edge
            // Mark this new edge as "fail" (loop-back)
            const newEdge: DAGEdge = {
              id: genId("e"),
              from: connecting.fromId,
              to: nodeId,
              type: "fail",
              color: EDGE_COLOR_FAIL,
              label: en ? "retry" : "\u91cd\u8a66",
              prompt: "",
              status: "idle",
            }
            setEdges((prev) => {
              // Also try to mark another outgoing edge from fromId as "pass"
              const updated = prev.map((e) => {
                if (
                  e.from === connecting.fromId &&
                  e.type === "default"
                ) {
                  return {
                    ...e,
                    type: "pass" as EdgeType,
                    color: EDGE_COLOR_PASS,
                    label:
                      e.label ||
                      (en ? "pass" : "\u901a\u904e"),
                  }
                }
                return e
              })
              return [...updated, newEdge]
            })
          } else {
            // Normal forward edge
            setEdges((prev) => [
              ...prev,
              {
                id: genId("e"),
                from: connecting.fromId,
                to: nodeId,
                type: "default" as EdgeType,
                color: EDGE_COLOR_DEFAULT,
                label: "",
                prompt: "",
                status: "idle" as const,
              },
            ])
          }
        }
      }
      setConnecting(null)
    },
    [connecting, edges, en],
  )

  // Global mousemove
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Dragging node
      if (draggingRef.current) {
        const svg = svgRef.current
        if (!svg) return
        const rect = svg.getBoundingClientRect()
        const ratioX = vbW / rect.width
        const ratioY = vbH / rect.height
        const dx =
          (e.clientX - draggingRef.current.startMouseX) *
          ratioX
        const dy =
          (e.clientY - draggingRef.current.startMouseY) *
          ratioY
        const newX = draggingRef.current.startNodeX + dx
        const newY = draggingRef.current.startNodeY + dy
        setNodes((prev) =>
          prev.map((n) =>
            n.id === draggingRef.current!.nodeId
              ? { ...n, x: newX, y: newY }
              : n,
          ),
        )
        return
      }

      // Panning
      if (panningRef.current) {
        const svg = svgRef.current
        if (!svg) return
        const rect = svg.getBoundingClientRect()
        const ratioX = vbW / rect.width
        const ratioY = vbH / rect.height
        const dx =
          (e.clientX - panningRef.current.startMouseX) *
          ratioX
        const dy =
          (e.clientY - panningRef.current.startMouseY) *
          ratioY
        setPan({
          x: panningRef.current.startPanX - dx,
          y: panningRef.current.startPanY - dy,
        })
        return
      }

      // Connecting
      if (connecting) {
        const pt = svgPoint(e.clientX, e.clientY)
        setConnecting((prev) =>
          prev
            ? { ...prev, mouseX: pt.x, mouseY: pt.y }
            : null,
        )
      }
    }

    const handleMouseUp = () => {
      draggingRef.current = null
      panningRef.current = null
      if (connecting) setConnecting(null)
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
    return () => {
      window.removeEventListener(
        "mousemove",
        handleMouseMove,
      )
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [connecting, svgPoint, vbW, vbH])

  // Scroll = zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      setZoom((z) => Math.max(0.3, Math.min(3, z * delta)))
    },
    [],
  )

  // Double-click canvas = add node
  const handleDblClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as SVGElement
      if (
        target.tagName !== "svg" &&
        target.getAttribute("data-bg") !== "true"
      )
        return
      const pt = svgPoint(e.clientX, e.clientY)
      const usedIdx = new Set(nodes.map((n) => n.nodeIndex))
      let nextIdx = 1
      while (usedIdx.has(nextIdx) || nextIdx === 99) nextIdx++
      const newNode: DAGNode = {
        id: genId("n"),
        nodeIndex: nextIdx,
        x: pt.x - NODE_W / 2,
        y: pt.y - NODE_H / 2,
        label: en
          ? `Task #${nextIdx}`
          : `\u4efb\u52d9 #${nextIdx}`,
        prompt: en
          ? "Describe what this node should do..."
          : "\u63cf\u8ff0\u9019\u500b\u7bc0\u9ede\u61c9\u8a72\u505a\u4ec0\u9ebc...",
        role: en
          ? "You are a helpful assistant."
          : "\u4f60\u662f\u4e00\u500b\u6709\u7528\u7684\u52a9\u624b\u3002",
        passCondition: "",
        loopPrompt: "",
        maxIterations: 3,
        status: "idle",
        output: "",
        visitCount: 0,
        nodeType: "task",
        conditionExamine: "",
        conditionSuccess: "",
        conditionFailure: "",
        conditionImprove: "",
      }
      setNodes((prev) => [...prev, newNode])
      setSelectedId(newNode.id)
    },
    [en, svgPoint, nodes],
  )

  // Delete key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "Delete" &&
        selectedId &&
        !editingLabelId
      ) {
        if (isRunning) return
        const node = nodes.find(
          (n) => n.id === selectedId,
        )
        if (node && node.deletable === false) return
        deleteNode(selectedId)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () =>
      window.removeEventListener("keydown", handleKeyDown)
  }, [selectedId, editingLabelId, isRunning, nodes])

  /* ---- Actions ---- */

  const deleteNode = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId)
      if (node && node.deletable === false) return
      setNodes((prev) =>
        prev.filter((n) => n.id !== nodeId),
      )
      setEdges((prev) =>
        prev.filter(
          (e) => e.from !== nodeId && e.to !== nodeId,
        ),
      )
      if (selectedId === nodeId) setSelectedId(null)
    },
    [selectedId, nodes],
  )

  const deleteEdge = useCallback((edgeId: string) => {
    setEdges((prev) =>
      prev.filter((e) => e.id !== edgeId),
    )
    setHoveredEdge(null)
  }, [])

  const addNode = useCallback(() => {
    const cx = vbX + vbW / 2
    const cy = vbY + vbH / 2
    // Auto-assign next available nodeIndex (skip 0=Entry, 99=Exit)
    const usedIndices = new Set(nodes.map((n) => n.nodeIndex))
    let nextIdx = 1
    while (usedIndices.has(nextIdx) || nextIdx === 99) nextIdx++
    const newNode: DAGNode = {
      id: genId("n"),
      nodeIndex: nextIdx,
      x: cx - NODE_W / 2,
      y: cy - NODE_H / 2,
      label: en
        ? `Task #${nextIdx}`
        : `\u4efb\u52d9 #${nextIdx}`,
      prompt: en
        ? "Describe what this node should do..."
        : "\u63cf\u8ff0\u9019\u500b\u7bc0\u9ede\u61c9\u8a72\u505a\u4ec0\u9ebc...",
      role: en
        ? "You are a helpful assistant."
        : "\u4f60\u662f\u4e00\u500b\u6709\u7528\u7684\u52a9\u624b\u3002",
      passCondition: "",
      loopPrompt: "",
      maxIterations: 3,
      status: "idle",
      output: "",
      visitCount: 0,
      nodeType: "task",
      conditionExamine: "",
      conditionSuccess: "",
      conditionFailure: "",
      conditionImprove: "",
    }
    setNodes((prev) => [...prev, newNode])
    setSelectedId(newNode.id)
  }, [en, vbX, vbY, vbW, vbH, nodes])

  const addConditionalNode = useCallback(() => {
    const cx = vbX + vbW / 2
    const cy = vbY + vbH / 2
    const usedIndices = new Set(nodes.map((n) => n.nodeIndex))
    let nextIdx = 1
    while (usedIndices.has(nextIdx) || nextIdx === 99) nextIdx++
    const newNode: DAGNode = {
      id: genId("n"),
      nodeIndex: nextIdx,
      x: cx - NODE_W / 2,
      y: cy - NODE_H / 2,
      label: en
        ? `Condition #${nextIdx}`
        : `\u689d\u4ef6 #${nextIdx}`,
      prompt: "",
      role: en
        ? "You are a quality evaluator."
        : "\u4f60\u662f\u54c1\u8cea\u8a55\u4f30\u5668\u3002",
      passCondition: "",
      loopPrompt: "",
      maxIterations: 5,
      status: "idle",
      output: "",
      visitCount: 0,
      nodeType: "conditional",
      conditionExamine: en
        ? "Examine the input for completeness and correctness."
        : "\u6aa2\u67e5\u8f38\u5165\u7684\u5b8c\u6574\u6027\u8207\u6b63\u78ba\u6027\u3002",
      conditionSuccess: en
        ? "The output meets all requirements."
        : "\u8f38\u51fa\u7b26\u5408\u6240\u6709\u8981\u6c42\u3002",
      conditionFailure: en
        ? "The output is incomplete or contains errors."
        : "\u8f38\u51fa\u4e0d\u5b8c\u6574\u6216\u5305\u542b\u932f\u8aa4\u3002",
      conditionImprove: en
        ? "Review the failure points and make specific improvements."
        : "\u6aa2\u8996\u5931\u6557\u9ede\u4e26\u9032\u884c\u5177\u9ad4\u6539\u9032\u3002",
    }
    setNodes((prev) => [...prev, newNode])
    setSelectedId(newNode.id)
  }, [en, vbX, vbY, vbW, vbH, nodes])

  // Stagnation warning state
  const [stagnationWarning, setStagnationWarning] = useState<{
    nodeId: string
    nodeLabel: string
    iterations: number
  } | null>(null)

  const resetAll = useCallback(() => {
    stopRef.current = true
    setIsRunning(false)
    runningRef.current = false
    setNodes((prev) =>
      prev.map((n) => ({
        ...n,
        status: "idle" as NodeStatus,
        output: "",
        visitCount: 0,
      })),
    )
    setEdges((prev) =>
      prev.map((e) => ({
        ...e,
        status: "idle" as const,
      })),
    )
    setSelectedId(null)
  }, [])

  const clearAll = useCallback(() => {
    if (!clearConfirm) {
      setClearConfirm(true)
      if (clearTimerRef.current)
        clearTimeout(clearTimerRef.current)
      clearTimerRef.current = setTimeout(() => {
        setClearConfirm(false)
      }, 3000)
      return
    }
    setClearConfirm(false)
    if (clearTimerRef.current)
      clearTimeout(clearTimerRef.current)
    stopRef.current = true
    setIsRunning(false)
    runningRef.current = false
    setNodes((prev) => {
      const entry = prev.find(
        (n) => n.id === ENTRY_NODE_ID,
      )
      const exit = prev.find(
        (n) => n.id === EXIT_NODE_ID,
      )
      const kept: DAGNode[] = []
      if (entry)
        kept.push({
          ...entry,
          status: "idle",
          output: "",
          visitCount: 0,
        })
      else kept.push(createEntryNode(en))
      if (exit)
        kept.push({
          ...exit,
          status: "idle",
          output: "",
          visitCount: 0,
        })
      else kept.push(createExitNode(en))
      return kept
    })
    setEdges([])
    setSelectedId(null)
  }, [clearConfirm, en])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (clearTimerRef.current)
        clearTimeout(clearTimerRef.current)
    }
  }, [])

  const handleStop = useCallback(() => {
    stopRef.current = true
    setIsRunning(false)
    runningRef.current = false
  }, [])

  /* ---- Execution engine (REAL AI) ---- */

  const runAll = useCallback(async () => {
    if (runningRef.current) return

    // Check API key
    const currentModel =
      ALL_MODELS.find(
        (m) => m.id === settings.selectedModelId,
      ) || ALL_MODELS[0]
    if (!hasApiKey(currentModel.providerId)) {
      toast.error(
        en
          ? `No API key for ${currentModel.providerId}. Please set it in Settings.`
          : `\u5c1a\u672a\u8a2d\u5b9a ${currentModel.providerId} \u7684 API Key\u3002\u8acb\u5728\u8a2d\u5b9a\u4e2d\u914d\u7f6e\u3002`,
      )
      return
    }

    const apiKey = getApiKey(currentModel.providerId)
    if (!apiKey) return

    runningRef.current = true
    stopRef.current = false
    setIsRunning(true)

    // Reset all nodes
    setNodes((prev) =>
      prev.map((n) => ({
        ...n,
        status: "idle" as NodeStatus,
        output: "",
        visitCount: 0,
      })),
    )
    setEdges((prev) =>
      prev.map((e) => ({
        ...e,
        status: "idle" as const,
      })),
    )

    // Wait a tick for state to settle
    await new Promise((r) => setTimeout(r, 50))

    // Build adjacency using refs
    const currentEdges = edgesRef.current
    const currentNodes = nodesRef.current
    const incomingCount = new Map<string, number>()
    currentNodes.forEach((n) =>
      incomingCount.set(n.id, 0),
    )
    currentEdges.forEach((e) => {
      incomingCount.set(
        e.to,
        (incomingCount.get(e.to) || 0) + 1,
      )
    })

    const entryIds: string[] = []
    const hasEntryNode = currentNodes.some(
      (n) => n.id === ENTRY_NODE_ID,
    )
    if (hasEntryNode) {
      entryIds.push(ENTRY_NODE_ID)
    }
    currentNodes
      .filter(
        (n) =>
          (incomingCount.get(n.id) || 0) === 0 &&
          n.id !== EXIT_NODE_ID &&
          !entryIds.includes(n.id),
      )
      .forEach((n) => entryIds.push(n.id))

    if (entryIds.length === 0) {
      toast.error(
        en
          ? "No entry nodes found"
          : "\u627e\u4e0d\u5230\u5165\u53e3\u7bc0\u9ede",
      )
      setIsRunning(false)
      runningRef.current = false
      return
    }

    // ══════════════════════════════════════════════════════════════════
    //  Mailbox-based execution engine (no Promises for barriers)
    //  Each node has a "mailbox" that collects outputs keyed by sender ID.
    //  When all expected deposits arrive, the node fires.
    // ══════════════════════════════════════════════════════════════════

    const allEdgesSnapshot = edgesRef.current
    const allNodesSnapshot = nodesRef.current

    // ── Pre-compute expected in-degree for each node (non-fail, non-self) ──
    const expectedIn = new Map<string, Set<string>>()
    for (const n of allNodesSnapshot) {
      const sources = new Set<string>()
      for (const e of allEdgesSnapshot) {
        if (e.to === n.id && e.type !== "fail" && e.from !== n.id) {
          sources.add(e.from)
        }
      }
      expectedIn.set(n.id, sources)
    }

    // ── Mailbox: collected outputs per node, keyed by sender nodeId ──
    const mailbox = new Map<string, Map<string, string>>()
    for (const n of allNodesSnapshot) {
      mailbox.set(n.id, new Map())
    }

    // ── Accumulated edge prompts per node ──
    const edgePrompts = new Map<string, Map<string, string>>()
    for (const n of allNodesSnapshot) {
      edgePrompts.set(n.id, new Map())
    }

    // ── Final output storage ──
    const nodeOutputs = new Map<string, string>()
    const visitCounts = new Map<string, number>()
    const nodeOutputHistory = new Map<string, string[]>()

    // ── Execute a single node (called only when all inputs are collected) ──
    const executeNode = async (nodeId: string): Promise<void> => {
      if (stopRef.current) return

      const node = allNodesSnapshot.find((n) => n.id === nodeId)
      if (!node) return

      const visits = (visitCounts.get(nodeId) || 0) + 1
      visitCounts.set(nodeId, visits)

      // Max iterations guard
      if (visits > node.maxIterations) {
        const output = nodeOutputs.get(nodeId) || (en ? "Max iterations reached" : "\u5df2\u9054\u6700\u5927\u8fed\u4ee3\u6b21\u6578")
        nodeOutputs.set(nodeId, output)
        setNodes((p) => p.map((n) => n.id === nodeId ? { ...n, status: "completed" as NodeStatus, output, visitCount: visits } : n))
        onNodeComplete(nodeId)
        return
      }

      // Set running
      setNodes((p) => p.map((n) => n.id === nodeId ? { ...n, status: "running" as NodeStatus, visitCount: visits } : n))
      setEdges((p) => p.map((e) => e.to === nodeId ? { ...e, status: "active" as const } : e))

      // ── Collect ALL predecessor outputs from mailbox, keyed by "#index label" ──
      const predecessorOutputs = new Map<string, string>()
      const mb = mailbox.get(nodeId) || new Map()
      for (const [senderId, output] of mb) {
        const sender = allNodesSnapshot.find((n) => n.id === senderId)
        const key = sender ? `#${sender.nodeIndex} ${sender.label}` : senderId
        predecessorOutputs.set(key, output)
      }

      // Merge edge prompts
      const ep = edgePrompts.get(nodeId)
      let mergedEdgePrompt: string | undefined
      if (ep && ep.size > 0) {
        mergedEdgePrompt = Array.from(ep.values()).join("\n\n")
      }

      const fullPrompt = buildNodePrompt(node, allNodesSnapshot, allEdgesSnapshot, predecessorOutputs, mergedEdgePrompt, visitCounts)

      try {
        const rawResponse = await callNodeAI(fullPrompt, settings.selectedModelId, apiKey, settings.temperature, settings.maxTokens)
        if (stopRef.current) return

        const parsed = parseAIResponse(rawResponse)
        nodeOutputs.set(nodeId, parsed.result)

        // Track output history for stagnation detection
        const history = nodeOutputHistory.get(nodeId) || []
        history.push(parsed.result)
        nodeOutputHistory.set(nodeId, history)

        // Check stagnation after 3+ iterations
        if (visits >= 3) {
          checkStagnation(history, settings.selectedModelId, apiKey).then(
            (isStagnant) => {
              if (isStagnant) {
                setStagnationWarning({
                  nodeId,
                  nodeLabel: node.label,
                  iterations: visits,
                })
              }
            },
          )
        }

        setNodes((p) => p.map((n) => n.id === nodeId ? { ...n, status: "completed" as NodeStatus, output: parsed.raw } : n))
        setEdges((p) => p.map((e) => e.to === nodeId ? { ...e, status: "completed" as const } : e))

        // Determine next edges
        const outEdges = allEdgesSnapshot.filter((e) => e.from === nodeId)
        const hasPassFail = outEdges.some((e) => e.type === "pass" || e.type === "fail")

        let nextEdges: DAGEdge[]
        if (hasPassFail) {
          if (parsed.status === "completed") {
            nextEdges = outEdges.filter((e) => e.type === "pass" || e.type === "default")
          } else {
            nextEdges = outEdges.filter((e) => e.type === "fail")
            // Reset loop targets
            for (const fe of nextEdges) {
              mailbox.set(fe.to, new Map())
              edgePrompts.set(fe.to, new Map())
              expectedIn.set(fe.to, new Set(
                allEdgesSnapshot.filter((e) => e.to === fe.to && e.type !== "fail" && e.from !== fe.to).map((e) => e.from)
              ))
            }
            // For conditional nodes, include improvement guidance in fail edge deposit
            if (node.nodeType === "conditional") {
              const improvementContext = `\n\n--- Conditional Check Failed (Iteration ${visits}) ---\nReason: ${parsed.result}\nImprovement guidance: ${node.conditionImprove}\n--- End Conditional Feedback ---`
              for (const fe of nextEdges) {
                deposit(fe.to, nodeId, (nodeOutputs.get(fe.from) || "") + improvementContext, fe.prompt || undefined)
              }
              // Skip onNodeComplete and default deposit — only fail edges should fire
              return
            }
          }
        } else {
          nextEdges = outEdges
        }

        // Signal completion to downstream
        onNodeComplete(nodeId)

        // Also deposit into downstream mailboxes for next edges
        for (const edge of nextEdges) {
          deposit(edge.to, nodeId, parsed.result, edge.prompt || undefined)
        }
      } catch (err) {
        if (stopRef.current) return
        const errMsg = err instanceof Error ? err.message : String(err)
        nodeOutputs.set(nodeId, errMsg)
        setNodes((p) => p.map((n) => n.id === nodeId ? { ...n, status: "error" as NodeStatus, output: errMsg } : n))
        // Still signal completion so downstream doesn't hang
        onNodeComplete(nodeId)
      }
    }

    // ── Deposit: a predecessor drops its output into a downstream node's mailbox ──
    const deposit = (
      targetNodeId: string,
      fromNodeId: string,
      output: string,
      edgePrompt?: string,
    ) => {
      const mb = mailbox.get(targetNodeId)
      if (mb) mb.set(fromNodeId, output)
      if (edgePrompt) {
        const ep = edgePrompts.get(targetNodeId)
        if (ep) ep.set(fromNodeId, edgePrompt)
      }
      tryFire(targetNodeId)
    }

    // ── Try to fire a node: check if all expected inputs have arrived ──
    const pendingFires = new Set<string>()
    const tryFire = (nodeId: string) => {
      if (pendingFires.has(nodeId)) return // already queued
      const expected = expectedIn.get(nodeId)
      const mb = mailbox.get(nodeId)
      if (!expected || !mb) return

      // Check: have all expected senders deposited?
      for (const src of expected) {
        if (!mb.has(src)) return // still waiting
      }

      // All inputs collected — fire!
      pendingFires.add(nodeId)
      executeNode(nodeId).finally(() => pendingFires.delete(nodeId))
    }

    // ── When a node completes via fallthrough (max-iteration / error) — deposit to all downstream ──
    const onNodeComplete = (nodeId: string) => {
      const output = nodeOutputs.get(nodeId) || ""
      for (const edge of allEdgesSnapshot.filter((e) => e.from === nodeId && e.type !== "fail")) {
        deposit(edge.to, nodeId, output, edge.prompt || undefined)
      }
    }

    // ── Launch: seed entry nodes (they have 0 expected inputs, so fire immediately) ──
    for (const eid of entryIds) {
      tryFire(eid)
    }

    // ── Wait for all nodes to finish via a polling promise ──
    await new Promise<void>((resolve) => {
      const check = () => {
        if (stopRef.current) { resolve(); return }
        // Check if Exit node is completed, or all nodes with outEdges are done
        const exitOutput = nodeOutputs.has(EXIT_NODE_ID)
        const allNodesCompleted = allNodesSnapshot.every(
          (n) => nodeOutputs.has(n.id) || (expectedIn.get(n.id)?.size === 0 && entryIds.includes(n.id) && nodeOutputs.has(n.id))
        )
        if (exitOutput || allNodesCompleted || pendingFires.size === 0) {
          // Give a final tick for any remaining fires
          setTimeout(() => {
            if (pendingFires.size === 0) resolve()
            else setTimeout(check, 200)
          }, 300)
        } else {
          setTimeout(check, 200)
        }
      }
      setTimeout(check, 500)
    })

    setIsRunning(false)
    runningRef.current = false

    if (!stopRef.current) {
      toast.success(
        en
          ? "Execution complete!"
          : "\u57f7\u884c\u5b8c\u6210\uff01",
      )
    }
  }, [
    en,
    settings.selectedModelId,
    settings.temperature,
    settings.maxTokens,
    hasApiKey,
    getApiKey,
  ])

  // Run single node
  const runSingleNode = useCallback(
    async (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId)
      if (!node) return

      const currentModel =
        ALL_MODELS.find(
          (m) => m.id === settings.selectedModelId,
        ) || ALL_MODELS[0]
      if (!hasApiKey(currentModel.providerId)) {
        toast.error(
          en
            ? `No API key for ${currentModel.providerId}. Please set it in Settings.`
            : `\u5c1a\u672a\u8a2d\u5b9a ${currentModel.providerId} \u7684 API Key\u3002`,
        )
        return
      }
      const apiKey = getApiKey(currentModel.providerId)
      if (!apiKey) return

      setNodes((prev) =>
        prev.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                status: "running" as NodeStatus,
              }
            : n,
        ),
      )

      // Gather predecessor outputs
      const predecessorOutputs = new Map<
        string,
        string
      >()
      for (const ie of edges.filter(
        (e) => e.to === nodeId,
      )) {
        const fromNode = nodes.find(
          (n) => n.id === ie.from,
        )
        if (fromNode && fromNode.output) {
          predecessorOutputs.set(
            fromNode.label,
            fromNode.output,
          )
        }
      }

      const fullPrompt = buildNodePrompt(
        node,
        nodes,
        edges,
        predecessorOutputs,
      )

      try {
        const rawResponse = await callNodeAI(
          fullPrompt,
          settings.selectedModelId,
          apiKey,
          settings.temperature,
          settings.maxTokens,
        )
        setNodes((prev) =>
          prev.map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  status: "completed" as NodeStatus,
                  output: rawResponse,
                }
              : n,
          ),
        )
      } catch (err) {
        const errMsg =
          err instanceof Error
            ? err.message
            : String(err)
        setNodes((prev) =>
          prev.map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  status: "error" as NodeStatus,
                  output: errMsg,
                }
              : n,
          ),
        )
      }
    },
    [
      nodes,
      edges,
      en,
      settings.selectedModelId,
      settings.temperature,
      settings.maxTokens,
      hasApiKey,
      getApiKey,
    ],
  )

  /* ---- Label editing ---- */
  const startEditLabel = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId)
      if (!node) return
      setEditingLabelId(nodeId)
      setEditingLabelValue(node.label)
    },
    [nodes],
  )

  const saveLabelEdit = useCallback(() => {
    if (!editingLabelId) return
    setNodes((prev) =>
      prev.map((n) =>
        n.id === editingLabelId
          ? { ...n, label: editingLabelValue }
          : n,
      ),
    )
    setEditingLabelId(null)
  }, [editingLabelId, editingLabelValue])

  /* ---- Zoom controls ---- */
  const zoomIn = useCallback(
    () => setZoom((z) => Math.min(3, z * 1.2)),
    [],
  )
  const zoomOut = useCallback(
    () => setZoom((z) => Math.max(0.3, z / 1.2)),
    [],
  )
  const zoomReset = useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  /* ---- Edge color resolver ---- */
  function resolveEdgeColor(
    edge: DAGEdge,
    isHovered: boolean,
  ): string {
    if (edge.status === "completed")
      return "rgba(52,211,153,0.5)"
    if (edge.status === "active")
      return "rgba(59,130,246,0.6)"
    if (edge.type === "pass") return EDGE_COLOR_PASS
    if (edge.type === "fail") return EDGE_COLOR_FAIL
    if (edge.color && edge.color !== EDGE_COLOR_DEFAULT)
      return edge.color
    if (isHovered) return "rgba(255,255,255,0.35)"
    return "rgba(255,255,255,0.12)"
  }

  /* ---- Render ---- */
  return (
    <div
      className="flex flex-col h-full"
      style={{ background: "oklch(0.09 0.005 270)" }}
    >
      {/* Toolbar */}
      <div className="shrink-0 px-4 pt-4 pb-2">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white/90">
              {en
                ? "Logic Graph Editor"
                : "\u908f\u8f2f\u5716\u7de8\u8f2f\u5668"}
            </h2>
            <p className="text-xs text-white/35 mt-0.5">
              {en
                ? "Double-click canvas to add nodes. Drag ports to connect."
                : "\u96d9\u64ca\u756b\u5e03\u65b0\u589e\u7bc0\u9ede\u3002\u62d6\u66f3\u57e0\u53e3\u5efa\u7acb\u9023\u7dda\u3002"}
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Add Node */}
            <button
              onClick={addNode}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/60 hover:text-white/90 bg-white/5 hover:bg-white/10 border border-white/8 transition-all"
            >
              <Plus size={12} />
              {en
                ? "Add Node"
                : "\u65b0\u589e\u7bc0\u9ede"}
            </button>

            {/* Add Conditional */}
            <button
              onClick={addConditionalNode}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-amber-400/70 hover:text-amber-300 bg-amber-500/5 hover:bg-amber-500/10 border border-amber-500/15 transition-all"
            >
              <Diamond size={12} />
              {en
                ? "Conditional"
                : "\u689d\u4ef6\u5206\u652f"}
            </button>

            {/* Run All */}
            <button
              onClick={runAll}
              disabled={isRunning || nodes.length === 0}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                isRunning || nodes.length === 0
                  ? "bg-white/5 text-white/30 cursor-not-allowed border border-white/5"
                  : "bg-gradient-to-r from-blue-600 to-violet-600 text-white hover:from-blue-500 hover:to-violet-500 shadow-lg shadow-blue-600/20",
              )}
            >
              <Play size={12} />
              {en
                ? "Run All"
                : "\u57f7\u884c\u5168\u90e8"}
            </button>

            {/* Stop */}
            <button
              onClick={handleStop}
              disabled={!isRunning}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all border",
                !isRunning
                  ? "bg-white/5 text-white/20 cursor-not-allowed border-white/5"
                  : "text-red-400 bg-red-500/10 border-red-500/20 hover:bg-red-500/20",
              )}
            >
              <Square size={12} />
              {en ? "Stop" : "\u505c\u6b62"}
            </button>

            {/* Reset */}
            <button
              onClick={resetAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-white/50 hover:text-white/80 bg-white/5 hover:bg-white/10 border border-white/8 transition-all"
            >
              <RotateCcw size={12} />
              {en ? "Reset" : "\u91cd\u7f6e"}
            </button>

            {/* Clear All - with two-step confirmation */}
            <button
              onClick={clearAll}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all border",
                clearConfirm
                  ? "text-red-300 bg-red-500/20 border-red-500/40 font-semibold animate-pulse"
                  : "text-white/40 hover:text-red-400 bg-white/5 hover:bg-red-500/10 border-white/8 hover:border-red-500/20",
              )}
            >
              <Trash2 size={12} />
              {clearConfirm
                ? en
                  ? "Confirm?"
                  : "\u78ba\u8a8d\uff1f"
                : en
                  ? "Clear"
                  : "\u6e05\u9664"}
            </button>

            {/* Zoom divider */}
            <div className="w-px h-5 bg-white/10 mx-1" />

            {/* Zoom controls */}
            <button
              onClick={zoomOut}
              className="p-1.5 rounded-lg text-white/40 hover:text-white/70 bg-white/5 hover:bg-white/10 border border-white/8 transition-all"
            >
              <ZoomOut size={13} />
            </button>
            <span className="text-[10px] text-white/40 font-mono w-10 text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={zoomIn}
              className="p-1.5 rounded-lg text-white/40 hover:text-white/70 bg-white/5 hover:bg-white/10 border border-white/8 transition-all"
            >
              <ZoomIn size={13} />
            </button>
            <button
              onClick={zoomReset}
              className="p-1.5 rounded-lg text-white/40 hover:text-white/70 bg-white/5 hover:bg-white/10 border border-white/8 transition-all"
            >
              <Maximize2 size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Stagnation warning banner */}
      {stagnationWarning && (
        <div className="mx-4 mb-2 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center gap-3 animate-in slide-in-from-top">
          <AlertCircle size={16} className="text-amber-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-amber-300/90 font-medium">
              {en
                ? "Possible Loop Stagnation Detected"
                : "\u5075\u6e2c\u5230\u53ef\u80fd\u7684\u5faa\u74b0\u505c\u6ede"}
            </p>
            <p className="text-[11px] text-amber-300/60 mt-0.5">
              {en
                ? `Node "${stagnationWarning.nodeLabel}" has iterated ${stagnationWarning.iterations} times with similar outputs. Consider modifying the prompt or checking manually.`
                : `\u7bc0\u9ede\u300c${stagnationWarning.nodeLabel}\u300d\u5df2\u8fed\u4ee3 ${stagnationWarning.iterations} \u6b21\u4e14\u8f38\u51fa\u76f8\u4f3c\u3002\u5efa\u8b70\u4fee\u6539\u63d0\u793a\u8a5e\u6216\u624b\u52d5\u6aa2\u67e5\u3002`}
            </p>
          </div>
          <button
            onClick={() => setStagnationWarning(null)}
            className="shrink-0 p-1 rounded-lg text-amber-300/50 hover:text-amber-300 hover:bg-amber-500/15 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {/* SVG Canvas */}
        <div
          className={cn(
            "flex-1 overflow-hidden relative",
            selectedNode ? "w-[60%]" : "w-full",
          )}
        >
          <svg
            ref={svgRef}
            className="w-full h-full cursor-grab active:cursor-grabbing"
            viewBox={viewBox}
            onMouseDown={handleBgMouseDown}
            onWheel={handleWheel}
            onDoubleClick={handleDblClick}
          >
            <defs>
              {/* Dot grid pattern */}
              <pattern
                id="dotgrid"
                x="0"
                y="0"
                width="20"
                height="20"
                patternUnits="userSpaceOnUse"
              >
                <circle
                  cx="10"
                  cy="10"
                  r="0.8"
                  fill="rgba(255,255,255,0.06)"
                />
              </pattern>

              {/* Glow filters */}
              <filter
                id="glow-blue-node"
                x="-30%"
                y="-30%"
                width="160%"
                height="160%"
              >
                <feGaussianBlur
                  stdDeviation="6"
                  result="blur"
                />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>

              <filter
                id="glow-selected"
                x="-20%"
                y="-20%"
                width="140%"
                height="140%"
              >
                <feGaussianBlur
                  stdDeviation="4"
                  result="blur"
                />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Background rect with dot grid */}
            <rect
              data-bg="true"
              x={vbX - 1000}
              y={vbY - 1000}
              width={vbW + 2000}
              height={vbH + 2000}
              fill="url(#dotgrid)"
            />

            {/* Edges */}
            {edges.map((edge) => {
              const fromNode = nodes.find(
                (n) => n.id === edge.from,
              )
              const toNode = nodes.find(
                (n) => n.id === edge.to,
              )
              if (!fromNode || !toNode) return null

              // For conditional nodes: fail edges exit from bottom angle,
              // but always arrive at the target's LEFT input port (standard in-port)
              const isFailFromConditional =
                edge.type === "fail" && fromNode.nodeType === "conditional"
              const out = isFailFromConditional
                ? bottomPort(fromNode)
                : outputPort(fromNode)
              // Fail edges always target the LEFT input port of the target node
              const inp = inputPort(toNode)

              // Build path: for fail-from-conditional, curve from bottom of diamond
              // down → loop around → arrive at target's left input port
              let d: string
              if (isFailFromConditional) {
                // Drop below both nodes, swing left, then up to target's left port
                const loopY = Math.max(out.y, inp.y) + 80
                const leftX = Math.min(out.x, inp.x) - 60
                d = `M ${out.x} ${out.y} C ${out.x} ${loopY}, ${leftX} ${loopY}, ${leftX} ${(out.y + inp.y) / 2}`
                  + ` S ${inp.x - 40} ${inp.y}, ${inp.x} ${inp.y}`
              } else {
                d = edgePath(out.x, out.y, inp.x, inp.y)
              }

              const isHovered =
                hoveredEdge === edge.id
              const isLoop = isFailFromConditional || inp.x <= out.x

              const strokeColor = resolveEdgeColor(
                edge,
                isHovered,
              )

              // Compute arrow control point for arrow head direction
              let cpX: number, cpY: number
              if (isFailFromConditional) {
                // Arrow points right into the left input port
                cpX = inp.x - 40
                cpY = inp.y
              } else if (isLoop) {
                cpX = inp.x - 60
                cpY = inp.y -
                  Math.max(
                    120,
                    Math.abs(inp.x - out.x) * 0.5,
                  )
              } else {
                cpX = inp.x -
                  Math.max(
                    Math.abs(inp.x - out.x) * 0.4,
                    40,
                  )
                cpY = inp.y
              }

              // Edge midpoint for label
              const mid = isFailFromConditional
                ? {
                    x: Math.min(out.x, inp.x) - 60,
                    y: (out.y + inp.y) / 2,
                  }
                : edgeMidpoint(
                    out.x,
                    out.y,
                    inp.x,
                    inp.y,
                  )

              return (
                <g key={edge.id}>
                  {/* Invisible thick path for click target */}
                  <path
                    d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={14}
                    className="cursor-pointer"
                    onMouseEnter={() =>
                      setHoveredEdge(edge.id)
                    }
                    onMouseLeave={() =>
                      setHoveredEdge(null)
                    }
                    onClick={(e) => {
                      e.stopPropagation()
                      if (!isRunning)
                        deleteEdge(edge.id)
                    }}
                  />

                  {/* Visible path */}
                  <path
                    d={d}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={
                      edge.status === "active"
                        ? 2.5
                        : edge.type !== "default"
                          ? 2
                          : 1.5
                    }
                    strokeDasharray={
                      edge.status === "completed"
                        ? "none"
                        : edge.type === "fail"
                          ? "4 3"
                          : "6 4"
                    }
                    pointerEvents="none"
                  />

                  {/* Animated overlay for active edges */}
                  {edge.status === "active" && (
                    <path
                      d={d}
                      fill="none"
                      stroke="rgba(59,130,246,0.8)"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      strokeLinecap="round"
                      pointerEvents="none"
                    >
                      <animate
                        attributeName="stroke-dashoffset"
                        from="0"
                        to="-20"
                        dur="0.8s"
                        repeatCount="indefinite"
                      />
                    </path>
                  )}

                  {/* Arrow head */}
                  <polygon
                    points={arrowPoints(
                      inp.x,
                      inp.y,
                      cpX,
                      cpY,
                    )}
                    fill={strokeColor}
                    pointerEvents="none"
                  />

                  {/* Edge label at midpoint */}
                  {edge.label && (
                    <g pointerEvents="none">
                      <rect
                        x={mid.x - 20}
                        y={mid.y - 7}
                        width={40}
                        height={14}
                        rx={4}
                        fill="rgba(0,0,0,0.6)"
                        stroke={
                          edge.type === "pass"
                            ? EDGE_COLOR_PASS
                            : edge.type === "fail"
                              ? EDGE_COLOR_FAIL
                              : "rgba(255,255,255,0.15)"
                        }
                        strokeWidth={0.5}
                      />
                      <text
                        x={mid.x}
                        y={mid.y + 3}
                        fontSize={8}
                        fill={
                          edge.type === "pass"
                            ? EDGE_COLOR_PASS
                            : edge.type === "fail"
                              ? EDGE_COLOR_FAIL
                              : "rgba(255,255,255,0.5)"
                        }
                        textAnchor="middle"
                        fontFamily="system-ui, sans-serif"
                        fontWeight={500}
                      >
                        {edge.label.length > 6
                          ? edge.label.slice(0, 6) +
                            "\u2026"
                          : edge.label}
                      </text>
                    </g>
                  )}

                  {/* Edge type icon at midpoint (if no label) */}
                  {!edge.label &&
                    edge.type !== "default" && (
                      <g pointerEvents="none">
                        <circle
                          cx={mid.x}
                          cy={mid.y}
                          r={6}
                          fill="rgba(0,0,0,0.5)"
                          stroke={
                            edge.type === "pass"
                              ? EDGE_COLOR_PASS
                              : EDGE_COLOR_FAIL
                          }
                          strokeWidth={0.5}
                        />
                        <foreignObject
                          x={mid.x - 5}
                          y={mid.y - 5}
                          width={10}
                          height={10}
                          style={{
                            pointerEvents: "none",
                          }}
                        >
                          <div
                            className="flex items-center justify-center w-full h-full"
                            style={{
                              color:
                                edge.type === "pass"
                                  ? EDGE_COLOR_PASS
                                  : EDGE_COLOR_FAIL,
                            }}
                          >
                            {edge.type === "pass" ? (
                              <ArrowRight size={7} />
                            ) : (
                              <Repeat size={7} />
                            )}
                          </div>
                        </foreignObject>
                      </g>
                    )}

                  {/* Delete button on hover */}
                  {isHovered && !isRunning && (
                    <g
                      className="cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteEdge(edge.id)
                      }}
                    >
                      <circle
                        cx={mid.x + 25}
                        cy={mid.y}
                        r={8}
                        fill="rgba(239,68,68,0.8)"
                      />
                      <foreignObject
                        x={mid.x + 25 - 6}
                        y={mid.y - 6}
                        width={12}
                        height={12}
                        style={{
                          pointerEvents: "none",
                        }}
                      >
                        <div className="flex items-center justify-center w-3 h-3 text-white">
                          <X size={10} />
                        </div>
                      </foreignObject>
                    </g>
                  )}
                </g>
              )
            })}

            {/* Connecting line (temp while dragging from port) */}
            {connecting &&
              (() => {
                const fromNode = nodes.find(
                  (n) => n.id === connecting.fromId,
                )
                if (!fromNode) return null
                const out = outputPort(fromNode)
                const d = edgePath(
                  out.x,
                  out.y,
                  connecting.mouseX,
                  connecting.mouseY,
                )
                return (
                  <path
                    d={d}
                    fill="none"
                    stroke="rgba(59,130,246,0.5)"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    pointerEvents="none"
                  />
                )
              })()}

            {/* Nodes */}
            {nodes.map((node) => {
              const isSelected =
                selectedId === node.id
              const isEditing =
                editingLabelId === node.id
              const isEntryNode =
                node.id === ENTRY_NODE_ID
              const isExitNode =
                node.id === EXIT_NODE_ID
              const isSpecial =
                isEntryNode || isExitNode

              const isConditional = node.nodeType === "conditional"

              const borderColor =
                node.status === "running"
                  ? "rgba(59,130,246,0.5)"
                  : node.status === "completed"
                    ? "rgba(52,211,153,0.35)"
                    : node.status === "error"
                      ? "rgba(239,68,68,0.4)"
                      : isEntryNode
                        ? "rgba(52,211,153,0.3)"
                        : isExitNode
                          ? "rgba(239,68,68,0.3)"
                          : isConditional
                            ? isSelected
                              ? "rgba(251,191,36,0.5)"
                              : "rgba(251,191,36,0.3)"
                            : isSelected
                              ? "rgba(59,130,246,0.4)"
                              : "rgba(255,255,255,0.1)"

              const bgColor =
                node.status === "running"
                  ? "rgba(59,130,246,0.08)"
                  : node.status === "completed"
                    ? "rgba(52,211,153,0.06)"
                    : node.status === "error"
                      ? "rgba(239,68,68,0.06)"
                      : isEntryNode
                        ? "rgba(52,211,153,0.05)"
                        : isExitNode
                          ? "rgba(239,68,68,0.05)"
                          : isConditional
                            ? "rgba(251,191,36,0.08)"
                            : "rgba(255,255,255,0.04)"

              const statusDotColor =
                node.status === "running"
                  ? "#60a5fa"
                  : node.status === "completed"
                    ? "#34d399"
                    : node.status === "error"
                      ? "#f87171"
                      : isEntryNode
                        ? "#34d399"
                        : isExitNode
                          ? "#f87171"
                          : isConditional
                            ? "#fbbf24"
                            : "rgba(255,255,255,0.2)"

              const out = outputPort(node)
              const inp = inputPort(node)

              return (
                <g key={node.id}>
                  {/* Running glow */}
                  {node.status === "running" && (
                    <rect
                      x={node.x - 4}
                      y={node.y - 4}
                      width={NODE_W + 8}
                      height={NODE_H + 8}
                      rx={16}
                      fill="none"
                      stroke="rgba(59,130,246,0.4)"
                      strokeWidth={2}
                      filter="url(#glow-blue-node)"
                    >
                      <animate
                        attributeName="opacity"
                        values="0.4;0.9;0.4"
                        dur="1.8s"
                        repeatCount="indefinite"
                      />
                    </rect>
                  )}

                  {/* Selected glow */}
                  {isSelected &&
                    node.status === "idle" && (
                      <rect
                        x={node.x - 3}
                        y={node.y - 3}
                        width={NODE_W + 6}
                        height={NODE_H + 6}
                        rx={15}
                        fill="none"
                        stroke={
                          isEntryNode
                            ? "rgba(52,211,153,0.25)"
                            : isExitNode
                              ? "rgba(239,68,68,0.25)"
                              : isConditional
                                ? "rgba(251,191,36,0.25)"
                                : "rgba(59,130,246,0.25)"
                        }
                        strokeWidth={1.5}
                        filter="url(#glow-selected)"
                      />
                    )}

                  {/* Node body */}
                  {isConditional ? (
                    <polygon
                      points={`${node.x + NODE_W / 2},${node.y} ${node.x + NODE_W},${node.y + NODE_H / 2} ${node.x + NODE_W / 2},${node.y + NODE_H} ${node.x},${node.y + NODE_H / 2}`}
                      fill={bgColor}
                      stroke={borderColor}
                      strokeWidth={
                        isSelected ? 2 : 1
                      }
                      strokeLinejoin="round"
                      className="cursor-move"
                      onMouseDown={(e) =>
                        handleNodeMouseDown(e, node.id)
                      }
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        startEditLabel(node.id)
                      }}
                    />
                  ) : (
                    <rect
                      x={node.x}
                      y={node.y}
                      width={NODE_W}
                      height={NODE_H}
                      rx={12}
                      fill={bgColor}
                      stroke={borderColor}
                      strokeWidth={
                        isSelected || isSpecial ? 2 : 1
                      }
                      className="cursor-move"
                      onMouseDown={(e) =>
                        handleNodeMouseDown(e, node.id)
                      }
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        startEditLabel(node.id)
                      }}
                    />
                  )}

                  {/* Glassmorphism top highlight */}
                  {!isConditional && (
                  <rect
                    x={node.x + 1}
                    y={node.y + 1}
                    width={NODE_W - 2}
                    height={NODE_H / 2.5}
                    rx={11}
                    fill="rgba(255,255,255,0.025)"
                    pointerEvents="none"
                  />
                  )}

                  {/* Node index badge — top-right corner */}
                  <rect
                    x={node.x + NODE_W - 30}
                    y={node.y + 4}
                    width={26}
                    height={14}
                    rx={7}
                    fill={
                      isEntryNode
                        ? "rgba(16,185,129,0.25)"
                        : isExitNode
                          ? "rgba(239,68,68,0.25)"
                          : isConditional
                            ? "rgba(251,191,36,0.25)"
                            : "rgba(99,102,241,0.25)"
                    }
                    pointerEvents="none"
                  />
                  <text
                    x={node.x + NODE_W - 17}
                    y={node.y + 14}
                    fontSize={8}
                    fontWeight={700}
                    fill={
                      isEntryNode
                        ? "rgba(110,231,183,0.9)"
                        : isExitNode
                          ? "rgba(252,165,165,0.9)"
                          : isConditional
                            ? "rgba(253,224,71,0.9)"
                            : "rgba(165,180,252,0.9)"
                    }
                    textAnchor="middle"
                    fontFamily="monospace"
                    pointerEvents="none"
                  >
                    #{node.nodeIndex}
                  </text>

                  {/* Icon — hidden for conditional (diamond has centered text) */}
                  {!isConditional && (
                  <foreignObject
                    x={node.x + 10}
                    y={node.y + 10}
                    width={20}
                    height={20}
                    style={{ pointerEvents: "none" }}
                  >
                    <div
                      className={cn(
                        "flex items-center justify-center w-5 h-5",
                        node.status === "running"
                          ? "text-blue-400"
                          : node.status ===
                              "completed"
                            ? "text-emerald-400"
                            : node.status === "error"
                              ? "text-red-400"
                              : isEntryNode
                                ? "text-emerald-400"
                                : isExitNode
                                  ? "text-red-400"
                                  : "text-white/40",
                      )}
                    >
                      {nodeIcon(node)}
                    </div>
                  </foreignObject>
                  )}

                  {/* Label */}
                  {isEditing ? (
                    <foreignObject
                      x={node.x + 32}
                      y={node.y + 8}
                      width={NODE_W - 60}
                      height={24}
                    >
                      <input
                        autoFocus
                        value={editingLabelValue}
                        onChange={(e) =>
                          setEditingLabelValue(
                            e.target.value,
                          )
                        }
                        onBlur={saveLabelEdit}
                        onKeyDown={(e) => {
                          if (e.key === "Enter")
                            saveLabelEdit()
                          if (e.key === "Escape")
                            setEditingLabelId(null)
                        }}
                        className="w-full bg-white/10 border border-blue-500/40 rounded px-1 py-0.5 text-[11px] text-white/90 outline-none"
                        style={{
                          fontSize: "11px",
                          lineHeight: "16px",
                        }}
                      />
                    </foreignObject>
                  ) : (
                    <text
                      x={isConditional ? node.x + NODE_W / 2 : node.x + 34}
                      y={isConditional ? node.y + NODE_H / 2 + 4 : node.y + 23}
                      fontSize={isConditional ? 10 : 11}
                      fontWeight={600}
                      fill={
                        node.status === "running"
                          ? "rgba(147,197,253,0.95)"
                          : node.status ===
                              "completed"
                            ? "rgba(110,231,183,0.9)"
                            : node.status === "error"
                              ? "rgba(252,165,165,0.9)"
                              : isEntryNode
                                ? "rgba(110,231,183,0.8)"
                                : isExitNode
                                  ? "rgba(252,165,165,0.8)"
                                  : isConditional
                                    ? "rgba(253,224,71,0.8)"
                                    : "rgba(255,255,255,0.6)"
                      }
                      textAnchor={isConditional ? "middle" : undefined}
                      fontFamily="system-ui, sans-serif"
                      pointerEvents="none"
                    >
                      {node.label.length > (isConditional ? 9 : 11)
                        ? node.label.slice(0, isConditional ? 9 : 11) +
                          "\u2026"
                        : node.label}
                    </text>
                  )}

                  {/* Prompt preview — clipped to node width (hidden for diamond) */}
                  {!isConditional && (
                  <text
                    x={node.x + 12}
                    y={node.y + 42}
                    fontSize={8}
                    fill="rgba(255,255,255,0.25)"
                    fontFamily="system-ui, sans-serif"
                    pointerEvents="none"
                    clipPath={`inset(0 0 0 0)`}
                  >
                    {node.prompt.length > 18
                      ? node.prompt.slice(0, 18) + "\u2026"
                      : node.prompt}
                  </text>
                  )}

                  {/* Status indicator */}
                  <circle
                    cx={node.x + 14}
                    cy={node.y + NODE_H - 14}
                    r={3.5}
                    fill={statusDotColor}
                    pointerEvents="none"
                  >
                    {node.status === "running" && (
                      <animate
                        attributeName="opacity"
                        values="1;0.3;1"
                        dur="1.2s"
                        repeatCount="indefinite"
                      />
                    )}
                  </circle>

                  {/* Status text */}
                  <text
                    x={node.x + 24}
                    y={node.y + NODE_H - 10}
                    fontSize={8}
                    fill="rgba(255,255,255,0.3)"
                    fontFamily="system-ui, sans-serif"
                    pointerEvents="none"
                  >
                    {node.status === "idle"
                      ? isEntryNode
                        ? en
                          ? "Entry"
                          : "\u5165\u53e3"
                        : isExitNode
                          ? en
                            ? "Exit"
                            : "\u51fa\u53e3"
                          : en
                            ? "Idle"
                            : "\u5f85\u6a5f"
                      : node.status === "running"
                        ? en
                          ? "Running..."
                          : "\u57f7\u884c\u4e2d..."
                        : node.status === "completed"
                          ? en
                            ? "Done"
                            : "\u5b8c\u6210"
                          : en
                            ? "Error"
                            : "\u932f\u8aa4"}
                    {node.visitCount > 1
                      ? ` (x${node.visitCount})`
                      : ""}
                  </text>

                  {/* Status icon — pure SVG (follows zoom/pan) */}
                  {node.status === "completed" && (
                    <g pointerEvents="none">
                      <circle cx={node.x + NODE_W - 14} cy={node.y + NODE_H - 14} r={5} fill="rgba(16,185,129,0.2)" stroke="rgba(52,211,153,0.6)" strokeWidth={1} />
                      <path d={`M${node.x + NODE_W - 17} ${node.y + NODE_H - 14} l2 2 l4 -4`} fill="none" stroke="rgba(110,231,183,0.9)" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" />
                    </g>
                  )}
                  {node.status === "running" && (
                    <g transform={`translate(${node.x + NODE_W - 14}, ${node.y + NODE_H - 14})`} pointerEvents="none">
                      <circle r={5} fill="none" stroke="rgba(96,165,250,0.3)" strokeWidth={1.5} />
                      <path d="M0,-5 A5,5 0 0,1 5,0" fill="none" stroke="rgba(96,165,250,0.9)" strokeWidth={1.5} strokeLinecap="round">
                        <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="0.8s" repeatCount="indefinite" />
                      </path>
                    </g>
                  )}
                  {node.status === "error" && (
                    <g pointerEvents="none">
                      <circle cx={node.x + NODE_W - 14} cy={node.y + NODE_H - 14} r={5} fill="rgba(239,68,68,0.2)" stroke="rgba(239,68,68,0.5)" strokeWidth={1} />
                      <text x={node.x + NODE_W - 14} y={node.y + NODE_H - 10.5} fontSize={8} fontWeight={700} fill="rgba(252,165,165,0.9)" textAnchor="middle" fontFamily="monospace">!</text>
                    </g>
                  )}

                  {/* Delete button (top-right corner) */}
                  {isSelected &&
                    !isRunning &&
                    node.deletable !== false && (
                      <g
                        className="cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteNode(node.id)
                        }}
                      >
                        <circle
                          cx={node.x + NODE_W - 4}
                          cy={node.y - 4}
                          r={8}
                          fill="rgba(239,68,68,0.7)"
                        />
                        <foreignObject
                          x={
                            node.x + NODE_W - 4 - 6
                          }
                          y={node.y - 4 - 6}
                          width={12}
                          height={12}
                          style={{
                            pointerEvents: "none",
                          }}
                        >
                          <div className="flex items-center justify-center w-3 h-3 text-white">
                            <X size={10} />
                          </div>
                        </foreignObject>
                      </g>
                    )}

                  {/* Output port (right side) - not shown for Exit node */}
                  {!isExitNode && (
                    <circle
                      cx={out.x}
                      cy={out.y}
                      r={PORT_R}
                      fill={
                        connecting?.fromId ===
                        node.id
                          ? "rgba(59,130,246,0.8)"
                          : isEntryNode
                            ? "rgba(52,211,153,0.5)"
                            : isConditional
                              ? "rgba(251,191,36,0.5)"
                              : "rgba(255,255,255,0.2)"
                      }
                      stroke={
                        isEntryNode
                          ? "rgba(52,211,153,0.3)"
                          : isConditional
                            ? "rgba(251,191,36,0.3)"
                            : "rgba(255,255,255,0.1)"
                      }
                      strokeWidth={1}
                      className="cursor-crosshair hover:fill-[rgba(255,255,255,0.5)]"
                      onMouseDown={(e) =>
                        handlePortMouseDown(
                          e,
                          node.id,
                        )
                      }
                    />
                  )}

                  {/* Input port (left side) - not shown for Entry node */}
                  {!isEntryNode && (
                    <circle
                      cx={inp.x}
                      cy={inp.y}
                      r={PORT_R}
                      fill={
                        connecting
                          ? "rgba(59,130,246,0.5)"
                          : isExitNode
                            ? "rgba(239,68,68,0.5)"
                            : "rgba(255,255,255,0.2)"
                      }
                      stroke={
                        isExitNode
                          ? "rgba(239,68,68,0.3)"
                          : "rgba(255,255,255,0.1)"
                      }
                      strokeWidth={1}
                      className={cn(
                        connecting
                          ? "cursor-crosshair hover:fill-[rgba(59,130,246,0.9)]"
                          : "",
                      )}
                      onMouseUp={(e) =>
                        handleInputPortMouseUp(
                          e,
                          node.id,
                        )
                      }
                    />
                  )}


                  {/* Bottom port (output for conditional fail edges) */}
                  {isConditional && (
                    <circle
                      cx={node.x + NODE_W / 2}
                      cy={node.y + NODE_H}
                      r={PORT_R}
                      fill={
                        connecting?.fromId === node.id
                          ? "rgba(251,191,36,0.8)"
                          : "rgba(239,68,68,0.4)"
                      }
                      stroke="rgba(239,68,68,0.3)"
                      strokeWidth={1}
                      className="cursor-crosshair hover:fill-[rgba(239,68,68,0.7)]"
                      onMouseDown={(e) =>
                        handlePortMouseDown(
                          e,
                          node.id,
                        )
                      }
                    />
                  )}
                </g>
              )
            })}
          </svg>

          {/* Legend overlay bottom-left */}
          <div className="absolute bottom-3 left-3 flex flex-wrap items-center gap-3 px-3 py-1.5 rounded-lg bg-black/40 border border-white/8 backdrop-blur-sm">
            {(
              [
                "idle",
                "running",
                "completed",
                "error",
              ] as NodeStatus[]
            ).map((s) => (
              <div
                key={s}
                className="flex items-center gap-1.5"
              >
                <div
                  className={cn(
                    "w-2 h-2 rounded-full",
                    s === "idle" && "bg-white/25",
                    s === "running" && "bg-blue-400",
                    s === "completed" &&
                      "bg-emerald-400",
                    s === "error" && "bg-red-400",
                  )}
                />
                <span className="text-[10px] text-white/35">
                  {s === "idle"
                    ? en
                      ? "Idle"
                      : "\u5f85\u6a5f"
                    : s === "running"
                      ? en
                        ? "Running"
                        : "\u57f7\u884c\u4e2d"
                      : s === "completed"
                        ? en
                          ? "Done"
                          : "\u5b8c\u6210"
                        : en
                          ? "Error"
                          : "\u932f\u8aa4"}
                </span>
              </div>
            ))}
            <div className="w-px h-3 bg-white/10" />
            <div className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rotate-45 border border-amber-400/60 bg-amber-400/15"
              />
              <span className="text-[10px] text-white/35">
                {en ? "Conditional" : "\u689d\u4ef6"}
              </span>
            </div>
            <div className="w-px h-3 bg-white/10" />
            <div className="flex items-center gap-1.5">
              <div
                className="w-4 h-0.5 rounded-full"
                style={{
                  backgroundColor: EDGE_COLOR_PASS,
                }}
              />
              <span className="text-[10px] text-white/35">
                {en ? "Pass" : "\u901a\u904e"}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div
                className="w-4 h-0.5 rounded-full"
                style={{
                  backgroundColor: EDGE_COLOR_FAIL,
                }}
              />
              <span className="text-[10px] text-white/35">
                {en
                  ? "Retry/Loop"
                  : "\u91cd\u8a66/\u8ff4\u5708"}
              </span>
            </div>
          </div>
        </div>

        {/* Detail panel */}
        {selectedNode && (
          <div className="w-[340px] shrink-0 border-l border-white/8 bg-white/[0.02] flex flex-col overflow-y-auto">
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "w-2 h-2 rounded-full",
                    selectedNode.status === "running" &&
                      "bg-blue-400",
                    selectedNode.status ===
                      "completed" && "bg-emerald-400",
                    selectedNode.status === "error" &&
                      "bg-red-400",
                    selectedNode.status === "idle" &&
                      selectedNode.id ===
                        ENTRY_NODE_ID &&
                      "bg-emerald-400",
                    selectedNode.status === "idle" &&
                      selectedNode.id ===
                        EXIT_NODE_ID &&
                      "bg-red-400",
                    selectedNode.status === "idle" &&
                      selectedNode.id !==
                        ENTRY_NODE_ID &&
                      selectedNode.id !==
                        EXIT_NODE_ID &&
                      "bg-white/25",
                  )}
                />
                <span className="text-sm font-semibold text-white/90">
                  {selectedNode.label}
                </span>
              </div>
              <button
                onClick={() => setSelectedId(null)}
                className="p-1 rounded-md text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            <div className="p-4 space-y-4 flex-1">
              {/* Status badge + Node Index */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] px-2 py-0.5 rounded-md border bg-indigo-500/15 border-indigo-500/25 text-indigo-300 font-mono font-bold">
                  #{selectedNode.nodeIndex}
                </span>
                <span
                  className={cn(
                    "text-[10px] px-2 py-0.5 rounded-md border font-medium",
                    selectedNode.status ===
                      "completed" &&
                      "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
                    selectedNode.status === "running" &&
                      "bg-blue-500/10 border-blue-500/20 text-blue-400",
                    selectedNode.status === "error" &&
                      "bg-red-500/10 border-red-500/20 text-red-400",
                    selectedNode.status === "idle" &&
                      "bg-white/5 border-white/10 text-white/40",
                  )}
                >
                  {selectedNode.status === "idle"
                    ? en
                      ? "Idle"
                      : "\u5f85\u6a5f"
                    : selectedNode.status === "running"
                      ? en
                        ? "Running"
                        : "\u57f7\u884c\u4e2d"
                      : selectedNode.status ===
                          "completed"
                        ? en
                          ? "Completed"
                          : "\u5df2\u5b8c\u6210"
                        : en
                          ? "Error"
                          : "\u932f\u8aa4"}
                </span>
                {selectedNode.nodeType === "conditional" && (
                  <span className="text-[10px] px-2 py-0.5 rounded-md border bg-amber-500/10 border-amber-500/20 text-amber-400 font-medium">
                    {en ? "Conditional" : "\u689d\u4ef6\u5206\u652f"}
                  </span>
                )}
                {selectedNode.deletable === false && (
                  <span className="text-[10px] px-2 py-0.5 rounded-md border bg-white/5 border-white/10 text-white/30">
                    {en
                      ? "Permanent"
                      : "\u6c38\u4e45"}
                  </span>
                )}
              </div>

              {/* ── Connectivity Map (In / Out) ── */}
              {(() => {
                const inEdges = edges.filter((e) => e.to === selectedNode.id)
                const outEdges = edges.filter((e) => e.from === selectedNode.id)
                const inNodes = inEdges.map((e) => {
                  const src = nodes.find((n) => n.id === e.from)
                  return src ? { index: src.nodeIndex, label: src.label, type: e.type } : null
                }).filter(Boolean) as { index: number; label: string; type: EdgeType }[]
                const outNodes = outEdges.map((e) => {
                  const tgt = nodes.find((n) => n.id === e.to)
                  return tgt ? { index: tgt.nodeIndex, label: tgt.label, type: e.type } : null
                }).filter(Boolean) as { index: number; label: string; type: EdgeType }[]

                return (
                  <div className="rounded-xl border border-white/8 bg-white/[0.02] p-2.5 space-y-2">
                    <div className="flex items-center gap-2">
                      <LogIn size={10} className="text-cyan-400" />
                      <span className="text-[10px] text-cyan-400 font-semibold uppercase tracking-wider">
                        {en ? `Inputs (${inNodes.length})` : `\u8f38\u5165 (${inNodes.length})`}
                      </span>
                    </div>
                    {inNodes.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {inNodes.map((n, i) => (
                          <span
                            key={i}
                            className={cn(
                              "text-[9px] px-1.5 py-0.5 rounded-md border font-mono",
                              n.type === "fail"
                                ? "bg-amber-500/10 border-amber-500/20 text-amber-300"
                                : n.type === "pass"
                                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                                  : "bg-cyan-500/10 border-cyan-500/20 text-cyan-300"
                            )}
                          >
                            #{n.index} {n.label}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[9px] text-white/20 italic">
                        {en ? "No inputs (entry point)" : "\u7121\u8f38\u5165\uff08\u5165\u53e3\u9ede\uff09"}
                      </span>
                    )}

                    <div className="border-t border-white/6 pt-2 flex items-center gap-2">
                      <LogOut size={10} className="text-violet-400" />
                      <span className="text-[10px] text-violet-400 font-semibold uppercase tracking-wider">
                        {en ? `Outputs (${outNodes.length})` : `\u8f38\u51fa (${outNodes.length})`}
                      </span>
                    </div>
                    {outNodes.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {outNodes.map((n, i) => (
                          <span
                            key={i}
                            className={cn(
                              "text-[9px] px-1.5 py-0.5 rounded-md border font-mono",
                              n.type === "fail"
                                ? "bg-amber-500/10 border-amber-500/20 text-amber-300"
                                : n.type === "pass"
                                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                                  : "bg-violet-500/10 border-violet-500/20 text-violet-300"
                            )}
                          >
                            #{n.index} {n.label}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[9px] text-white/20 italic">
                        {en ? "No outputs (terminal)" : "\u7121\u8f38\u51fa\uff08\u7d42\u9ede\uff09"}
                      </span>
                    )}
                  </div>
                )
              })()}

              {/* Label */}
              <div className="space-y-1.5">
                <span className="text-[10px] text-white/30 uppercase tracking-wider">
                  {en ? "Label" : "\u6a19\u7c64"}
                </span>
                <input
                  value={selectedNode.label}
                  onChange={(e) =>
                    setNodes((prev) =>
                      prev.map((n) =>
                        n.id === selectedNode.id
                          ? {
                              ...n,
                              label: e.target.value,
                            }
                          : n,
                      ),
                    )
                  }
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white/80 placeholder:text-white/25 focus:outline-none focus:border-blue-500/40 transition-colors"
                />
              </div>

              {/* Role */}
              <div className="space-y-1.5">
                <span className="text-[10px] text-white/30 uppercase tracking-wider">
                  {en
                    ? "Role Description"
                    : "\u89d2\u8272\u63cf\u8ff0"}
                </span>
                <input
                  value={selectedNode.role}
                  onChange={(e) =>
                    setNodes((prev) =>
                      prev.map((n) =>
                        n.id === selectedNode.id
                          ? {
                              ...n,
                              role: e.target.value,
                            }
                          : n,
                      ),
                    )
                  }
                  placeholder={
                    en
                      ? "e.g. You are a data analyst"
                      : "\u4f8b\u5982\uff1a\u4f60\u662f\u4e00\u4f4d\u8cc7\u6599\u5206\u6790\u5e2b"
                  }
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white/80 placeholder:text-white/25 focus:outline-none focus:border-blue-500/40 transition-colors"
                />
              </div>

              {/* Prompt / Condition sections */}
              {selectedNode.nodeType === "conditional" ? (
                <>
                  {/* Examining */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] text-amber-400/60 uppercase tracking-wider flex items-center gap-1">
                      <Diamond size={9} />
                      {en ? "Examining" : "\u6b63\u5728\u6aa2\u67e5\u4ec0\u9ebc"}
                    </span>
                    <textarea
                      value={selectedNode.conditionExamine}
                      onChange={(e) =>
                        setNodes((prev) =>
                          prev.map((n) =>
                            n.id === selectedNode.id
                              ? { ...n, conditionExamine: e.target.value }
                              : n,
                          ),
                        )
                      }
                      rows={2}
                      placeholder={en ? "What this node examines..." : "\u9019\u500b\u7bc0\u9ede\u6aa2\u67e5\u4ec0\u9ebc..."}
                      className="w-full bg-amber-500/5 border border-amber-500/15 rounded-xl px-3 py-2 text-xs text-white/70 placeholder:text-white/25 focus:outline-none focus:border-amber-500/40 resize-none transition-colors leading-relaxed"
                    />
                  </div>
                  {/* Success Criteria */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] text-emerald-400/60 uppercase tracking-wider">
                      {en ? "Success Criteria" : "\u6210\u529f\u689d\u4ef6"}
                    </span>
                    <textarea
                      value={selectedNode.conditionSuccess}
                      onChange={(e) =>
                        setNodes((prev) =>
                          prev.map((n) =>
                            n.id === selectedNode.id
                              ? { ...n, conditionSuccess: e.target.value }
                              : n,
                          ),
                        )
                      }
                      rows={2}
                      placeholder={en ? "How to determine success..." : "\u5982\u4f55\u5224\u65b7\u6210\u529f..."}
                      className="w-full bg-emerald-500/5 border border-emerald-500/15 rounded-xl px-3 py-2 text-xs text-white/70 placeholder:text-white/25 focus:outline-none focus:border-emerald-500/40 resize-none transition-colors leading-relaxed"
                    />
                  </div>
                  {/* Failure Criteria */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] text-red-400/60 uppercase tracking-wider">
                      {en ? "Failure Criteria" : "\u5931\u6557\u689d\u4ef6"}
                    </span>
                    <textarea
                      value={selectedNode.conditionFailure}
                      onChange={(e) =>
                        setNodes((prev) =>
                          prev.map((n) =>
                            n.id === selectedNode.id
                              ? { ...n, conditionFailure: e.target.value }
                              : n,
                          ),
                        )
                      }
                      rows={2}
                      placeholder={en ? "How to determine failure..." : "\u5982\u4f55\u5224\u65b7\u5931\u6557..."}
                      className="w-full bg-red-500/5 border border-red-500/15 rounded-xl px-3 py-2 text-xs text-white/70 placeholder:text-white/25 focus:outline-none focus:border-red-500/40 resize-none transition-colors leading-relaxed"
                    />
                  </div>
                  {/* Improvement Notes */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] text-violet-400/60 uppercase tracking-wider">
                      {en ? "Improvement Notes" : "\u6539\u5584\u5efa\u8b70"}
                    </span>
                    <textarea
                      value={selectedNode.conditionImprove}
                      onChange={(e) =>
                        setNodes((prev) =>
                          prev.map((n) =>
                            n.id === selectedNode.id
                              ? { ...n, conditionImprove: e.target.value }
                              : n,
                          ),
                        )
                      }
                      rows={2}
                      placeholder={en ? "What to improve if not succeeding..." : "\u5982\u679c\u672a\u6210\u529f\u8981\u6539\u5584\u4ec0\u9ebc..."}
                      className="w-full bg-violet-500/5 border border-violet-500/15 rounded-xl px-3 py-2 text-xs text-white/70 placeholder:text-white/25 focus:outline-none focus:border-violet-500/40 resize-none transition-colors leading-relaxed"
                    />
                  </div>
                </>
              ) : (
              <div className="space-y-1.5">
                <span className="text-[10px] text-white/30 uppercase tracking-wider">
                  {en
                    ? "System Prompt"
                    : "\u7cfb\u7d71\u63d0\u793a\u8a5e"}
                </span>
                <textarea
                  value={selectedNode.prompt}
                  onChange={(e) =>
                    setNodes((prev) =>
                      prev.map((n) =>
                        n.id === selectedNode.id
                          ? {
                              ...n,
                              prompt: e.target.value,
                            }
                          : n,
                      ),
                    )
                  }
                  rows={4}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white/70 placeholder:text-white/25 focus:outline-none focus:border-blue-500/40 resize-none transition-colors leading-relaxed overflow-y-auto"
                />
              </div>
              )}

              {/* Pass condition */}
              <div className="space-y-1.5">
                <span className="text-[10px] text-white/30 uppercase tracking-wider">
                  {en
                    ? "Pass Condition"
                    : "\u901a\u904e\u689d\u4ef6"}
                </span>
                <input
                  value={selectedNode.passCondition}
                  onChange={(e) =>
                    setNodes((prev) =>
                      prev.map((n) =>
                        n.id === selectedNode.id
                          ? {
                              ...n,
                              passCondition:
                                e.target.value,
                            }
                          : n,
                      ),
                    )
                  }
                  placeholder={
                    en
                      ? 'JSON field to check (default: "status"="completed")'
                      : "\u6aa2\u67e5\u7684 JSON \u6b04\u4f4d\uff08\u9810\u8a2d: status=completed\uff09"
                  }
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white/70 placeholder:text-white/25 focus:outline-none focus:border-blue-500/40 transition-colors"
                />
              </div>

              {/* Loop Condition Prompt (only shown when node has loop edges) */}
              {selectedNodeHasLoopEdge && (
                <>
                  <div className="space-y-1.5">
                    <span className="text-[10px] text-amber-400/60 uppercase tracking-wider flex items-center gap-1">
                      <Repeat size={9} />
                      {en
                        ? "Loop Condition Prompt"
                        : "\u8ff4\u5708\u689d\u4ef6\u63d0\u793a\u8a5e"}
                    </span>
                    <textarea
                      value={selectedNode.loopPrompt}
                      onChange={(e) =>
                        setNodes((prev) =>
                          prev.map((n) =>
                            n.id === selectedNode.id
                              ? {
                                  ...n,
                                  loopPrompt:
                                    e.target.value,
                                }
                              : n,
                          ),
                        )
                      }
                      rows={2}
                      placeholder={
                        en
                          ? "Additional context for loop evaluation..."
                          : "\u8ff4\u5708\u8a55\u4f30\u7684\u984d\u5916\u63d0\u793a..."
                      }
                      className="w-full bg-amber-500/5 border border-amber-500/15 rounded-xl px-3 py-2 text-xs text-white/70 placeholder:text-white/25 focus:outline-none focus:border-amber-500/40 resize-none transition-colors leading-relaxed"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[10px] text-amber-400/60 uppercase tracking-wider flex items-center gap-1">
                      <Repeat size={9} />
                      {en
                        ? "Max Iterations"
                        : "\u6700\u5927\u8fed\u4ee3\u6b21\u6578"}
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={
                        selectedNode.maxIterations
                      }
                      onChange={(e) =>
                        setNodes((prev) =>
                          prev.map((n) =>
                            n.id === selectedNode.id
                              ? {
                                  ...n,
                                  maxIterations:
                                    Math.max(
                                      1,
                                      Math.min(
                                        20,
                                        parseInt(
                                          e.target
                                            .value,
                                        ) || 3,
                                      ),
                                    ),
                                }
                              : n,
                          ),
                        )
                      }
                      className="w-24 bg-amber-500/5 border border-amber-500/15 rounded-xl px-3 py-2 text-xs text-white/70 focus:outline-none focus:border-amber-500/40 transition-colors"
                    />
                  </div>
                </>
              )}

              {/* Edges from this node */}
              {selectedNodeEdges.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[10px] text-white/30 uppercase tracking-wider">
                    {en
                      ? "Outgoing Edges"
                      : "\u8f38\u51fa\u908a"}
                  </span>
                  <div className="space-y-1">
                    {selectedNodeEdges.map((edge) => {
                      const targetNode = nodes.find(
                        (n) => n.id === edge.to,
                      )
                      return (
                        <div
                          key={edge.id}
                          className="space-y-1 px-2 py-1.5 rounded-lg bg-white/[0.03] border border-white/6"
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{
                                backgroundColor:
                                  edge.type === "pass"
                                    ? EDGE_COLOR_PASS
                                    : edge.type ===
                                        "fail"
                                      ? EDGE_COLOR_FAIL
                                      : "rgba(255,255,255,0.3)",
                              }}
                            />
                            <span className="text-[10px] text-white/50 shrink-0">
                              {edge.type === "pass"
                                ? en
                                  ? "Pass"
                                  : "\u901a\u904e"
                                : edge.type === "fail"
                                  ? en
                                    ? "Fail/Loop"
                                    : "\u5931\u6557/\u8ff4\u5708"
                                  : en
                                    ? "Default"
                                    : "\u9810\u8a2d"}
                            </span>
                            <ArrowRight
                              size={8}
                              className="text-white/20 shrink-0"
                            />
                            <span className="text-[10px] text-white/60 truncate">
                              {targetNode?.label ||
                                edge.to}
                            </span>
                            <input
                              value={edge.label}
                              onChange={(e) =>
                                setEdges((prev) =>
                                  prev.map((ed) =>
                                    ed.id === edge.id
                                      ? {
                                          ...ed,
                                          label:
                                            e.target
                                              .value,
                                        }
                                      : ed,
                                  ),
                                )
                              }
                              placeholder={
                                en
                                  ? "label"
                                  : "\u6a19\u7c64"
                              }
                              className="flex-1 min-w-0 bg-white/5 border border-white/8 rounded px-1.5 py-0.5 text-[10px] text-white/60 placeholder:text-white/20 focus:outline-none focus:border-blue-500/30"
                            />
                            <select
                              value={edge.type}
                              onChange={(e) => {
                                const newType = e.target
                                  .value as EdgeType
                                setEdges((prev) =>
                                  prev.map((ed) =>
                                    ed.id === edge.id
                                      ? {
                                          ...ed,
                                          type: newType,
                                          color:
                                            newType ===
                                            "pass"
                                              ? EDGE_COLOR_PASS
                                              : newType ===
                                                  "fail"
                                                ? EDGE_COLOR_FAIL
                                                : EDGE_COLOR_DEFAULT,
                                        }
                                      : ed,
                                  ),
                                )
                              }}
                              className="bg-white/5 border border-white/8 rounded px-1 py-0.5 text-[10px] text-white/50 focus:outline-none appearance-none cursor-pointer"
                            >
                              <option value="default">
                                default
                              </option>
                              <option value="pass">
                                pass
                              </option>
                              <option value="fail">
                                fail
                              </option>
                            </select>
                          </div>
                          <textarea
                            value={edge.prompt}
                            onChange={(e) =>
                              setEdges((prev) =>
                                prev.map((ed) =>
                                  ed.id === edge.id
                                    ? {
                                        ...ed,
                                        prompt:
                                          e.target
                                            .value,
                                      }
                                    : ed,
                                ),
                              )
                            }
                            rows={2}
                            placeholder={
                              en
                                ? "Edge prompt (additional context for next node)..."
                                : "\u908a\u63d0\u793a\u8a5e\uff08\u50b3\u905e\u7d66\u4e0b\u4e00\u7bc0\u9ede\u7684\u984d\u5916\u4e0a\u4e0b\u6587\uff09..."
                            }
                            className="w-full bg-white/5 border border-white/8 rounded px-1.5 py-1 text-[10px] text-white/60 placeholder:text-white/20 focus:outline-none focus:border-blue-500/30 resize-none overflow-y-auto"
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Wrapped prompt preview */}
              <div className="space-y-1.5">
                <span className="text-[10px] text-white/30 uppercase tracking-wider">
                  {en
                    ? "Wrapped Prompt (Preview)"
                    : "\u5305\u88dd\u5f8c\u63d0\u793a\u8a5e\uff08\u9810\u89bd\uff09"}
                </span>
                <div className="rounded-xl bg-white/[0.03] border border-white/6 px-3 py-2.5 text-[10px] text-white/30 font-mono leading-relaxed whitespace-pre-wrap max-h-32 overflow-y-auto">
                  {selectedNode.nodeType === "conditional"
                    ? `Role: ${selectedNode.role}\n\nCONDITIONAL EVALUATION NODE\n\n## Examining\n${selectedNode.conditionExamine}\n\n## Success\n${selectedNode.conditionSuccess}\n\n## Failure\n${selectedNode.conditionFailure}\n\n## Improve\n${selectedNode.conditionImprove}\n\nRespond: status "completed" or "needs_retry"`
                    : `Role: ${selectedNode.role}\n\n${selectedNode.prompt}\n\nIMPORTANT: Respond in JSON:\n{ "status": "completed"|"needs_retry",\n  "result": "...",\n  "summary": "..." }`}
                </div>
              </div>

              {/* Output */}
              <div className="space-y-1.5">
                <span className={cn(
                  "text-[10px] uppercase tracking-wider",
                  selectedNode.id === EXIT_NODE_ID && selectedNode.output
                    ? "text-violet-400/70 font-semibold"
                    : "text-white/30",
                )}>
                  {selectedNode.id === EXIT_NODE_ID
                    ? en
                      ? "Final Output"
                      : "\u6700\u7d42\u8f38\u51fa"
                    : en
                      ? "Output"
                      : "\u8f38\u51fa\u7d50\u679c"}
                </span>
                <div className={cn(
                  "rounded-xl px-3 py-2.5 max-h-48 overflow-y-auto",
                  selectedNode.id === EXIT_NODE_ID && selectedNode.output
                    ? "bg-violet-500/[0.06] border-2 border-violet-500/20"
                    : "bg-white/[0.03] border border-white/6",
                )}>
                  {selectedNode.output ? (
                    (() => {
                      const parsed = parseAIResponse(
                        selectedNode.output,
                      )
                      if (
                        parsed.status !== "unknown"
                      ) {
                        return (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  "text-[10px] px-1.5 py-0.5 rounded border font-medium",
                                  parsed.status ===
                                    "completed"
                                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                                    : "bg-amber-500/10 border-amber-500/20 text-amber-400",
                                )}
                              >
                                {parsed.status}
                              </span>
                              {parsed.summary && (
                                <span className="text-[10px] text-white/40 truncate">
                                  {parsed.summary}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-emerald-400/80 leading-relaxed whitespace-pre-wrap">
                              {parsed.result}
                            </p>
                          </div>
                        )
                      }
                      return (
                        <p className="text-xs text-emerald-400/80 leading-relaxed whitespace-pre-wrap">
                          {selectedNode.output}
                        </p>
                      )
                    })()
                  ) : selectedNode.status ===
                    "running" ? (
                    <div className="flex items-center gap-2">
                      <Loader2
                        size={12}
                        className="text-blue-400 animate-spin"
                      />
                      <span className="text-xs text-blue-400/70">
                        {en
                          ? "Calling AI..."
                          : "\u547c\u53eb AI \u4e2d..."}
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs text-white/25 italic">
                      {en
                        ? "No output yet"
                        : "\u5c1a\u7121\u8f38\u51fa"}
                    </p>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-1.5">
                <span className="text-[10px] text-white/30 uppercase tracking-wider">
                  {en ? "Actions" : "\u64cd\u4f5c"}
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() =>
                      runSingleNode(selectedNode.id)
                    }
                    disabled={
                      selectedNode.status ===
                        "running" || isRunning
                    }
                    className={cn(
                      "flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors",
                      selectedNode.status ===
                        "running" || isRunning
                        ? "bg-white/5 text-white/20 cursor-not-allowed border border-white/5"
                        : "text-blue-400 bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20",
                    )}
                  >
                    <Play size={12} />
                    {en
                      ? "Run This"
                      : "\u57f7\u884c\u6b64\u7bc0\u9ede"}
                  </button>
                  <button
                    onClick={() =>
                      deleteNode(selectedNode.id)
                    }
                    disabled={
                      isRunning ||
                      selectedNode.deletable === false
                    }
                    className={cn(
                      "flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors",
                      isRunning ||
                        selectedNode.deletable ===
                          false
                        ? "bg-white/5 text-white/20 cursor-not-allowed border border-white/5"
                        : "text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20",
                    )}
                  >
                    <Trash2 size={12} />
                    {en ? "Delete" : "\u522a\u9664"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
