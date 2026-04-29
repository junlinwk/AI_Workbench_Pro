/**
 * Tool-execution loop.
 *
 * Given a message history, a list of tools, and a model, keep calling the
 * model until it returns plain text (or we hit the round cap). Tool calls
 * are executed and their results appended to the message array as canonical
 * tool_use / tool_result content parts.
 */
import { AIError, callAIWithTools, type ChatMessage, type ContentPart } from "../aiClient"
import { isBlocked, markBlocked } from "../quotaRegistry"
import {
  DEFAULT_MAX_TOOL_ROUNDS,
  type AIResponse,
  type Tool,
  type ToolContext,
  type ToolResultPayload,
} from "./types"

export interface ToolLoopOptions {
  modelId: string
  fallbackApiKey?: string
  temperature: number
  maxTokens: number
  systemPrompt: string
  signal?: AbortSignal
  tools: Tool[]
  toolContext: ToolContext
  maxRounds?: number
  /**
   * Optional priority-fallback chain. When set, each round tries these models
   * in order, skipping any currently rate-limited and falling through on
   * AIError that looks quota-like. When unset, `modelId` is used for every
   * round.
   */
  priorityList?: string[]
  /** Fired when the loop switches to a different model mid-conversation. */
  onModelChange?: (info: {
    round: number
    modelId: string
    previousModelId?: string
    reason: "first" | "fallback"
  }) => void
  /** Called once per tool invocation. Lets the UI show progress. */
  onToolCall?: (info: {
    round: number
    name: string
    input: unknown
    result: ToolResultPayload
  }) => void
  /** Called after the model emits text each round (tool_use or final). */
  onRoundText?: (text: string) => void
}

export interface ToolLoopResult {
  /** Final assistant text shown to the user. */
  text: string
  /** How many tool-use rounds were executed before returning text. */
  rounds: number
  /** Whether we bailed out because we hit maxRounds. */
  truncated: boolean
  /** All tool_use content parts emitted (for transcript / UI). */
  toolUseParts: ContentPart[]
  /** All tool_result content parts emitted. */
  toolResultParts: ContentPart[]
  /** Last model that produced a successful response (useful when priorityList is set). */
  finalModelId: string
}

/**
 * Run one round against either a fixed model or a priority chain. On a
 * quota-like AIError the failing model is marked blocked and we fall through
 * to the next entry. Tool results carry no per-model state, so a mid-loop
 * model switch is safe.
 */
async function callOneRound(
  messages: ChatMessage[],
  callOpts: {
    fallbackApiKey?: string
    temperature: number
    maxTokens: number
    systemPrompt: string
    signal?: AbortSignal
    tools: Tool[]
  },
  modelOpts: { modelId: string; priorityList?: string[] },
  onModelChange: (modelId: string, reason: "first" | "fallback") => void,
  prevModelId: string | undefined,
): Promise<{ resp: AIResponse; modelId: string }> {
  if (!modelOpts.priorityList || modelOpts.priorityList.length === 0) {
    if (modelOpts.modelId !== prevModelId) onModelChange(modelOpts.modelId, prevModelId ? "fallback" : "first")
    const resp = await callAIWithTools(messages, { ...callOpts, modelId: modelOpts.modelId })
    return { resp, modelId: modelOpts.modelId }
  }

  let lastErr: unknown = null
  for (const modelId of modelOpts.priorityList) {
    if (!modelId || isBlocked(modelId)) continue
    try {
      if (modelId !== prevModelId) onModelChange(modelId, prevModelId ? "fallback" : "first")
      const resp = await callAIWithTools(messages, { ...callOpts, modelId })
      return { resp, modelId }
    } catch (err) {
      lastErr = err
      if (err instanceof AIError && err.isQuotaLike()) {
        markBlocked(modelId, {
          retryAfterMs: err.retryAfterMs,
          reason: err.quotaReason() === "auth_failed" ? "auth_failed" : err.quotaReason(),
          message: err.message,
        })
        continue
      }
      if (err instanceof AIError && (err.status === 401 || err.status === 404)) {
        markBlocked(modelId, { reason: "auth_failed", message: err.message })
        continue
      }
      throw err
    }
  }
  // Last-ditch: try the first entry anyway (caps may have rolled over since registry was last updated)
  const last = modelOpts.priorityList[0]
  if (last) {
    if (last !== prevModelId) onModelChange(last, "fallback")
    const resp = await callAIWithTools(messages, { ...callOpts, modelId: last })
    return { resp, modelId: last }
  }
  throw lastErr instanceof Error ? lastErr : new Error("All priority models exhausted")
}

export async function runToolLoop(
  initialMessages: ChatMessage[],
  opts: ToolLoopOptions,
): Promise<ToolLoopResult> {
  const maxRounds = opts.maxRounds ?? DEFAULT_MAX_TOOL_ROUNDS
  const toolByName = new Map(opts.tools.map((t) => [t.name, t]))

  // Working copy — we mutate it across rounds.
  const messages: ChatMessage[] = initialMessages.map((m) => ({ ...m }))
  const toolUseParts: ContentPart[] = []
  const toolResultParts: ContentPart[] = []
  let activeModelId = opts.modelId

  const handleModelChange = (modelId: string, reason: "first" | "fallback") => {
    const prev = activeModelId
    activeModelId = modelId
    if (reason === "fallback" || prev !== modelId) {
      opts.onModelChange?.({
        round: 0, // populated below if we know the round
        modelId,
        previousModelId: prev,
        reason,
      })
    }
  }

  for (let round = 0; round < maxRounds; round++) {
    if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError")

    const callOpts = {
      fallbackApiKey: opts.fallbackApiKey,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
      systemPrompt: opts.systemPrompt,
      signal: opts.signal,
      tools: opts.tools,
    }
    const { resp, modelId: usedModelId } = await callOneRound(
      messages,
      callOpts,
      { modelId: opts.modelId, priorityList: opts.priorityList },
      handleModelChange,
      round === 0 ? undefined : activeModelId,
    )
    activeModelId = usedModelId

    if (resp.type === "text") {
      opts.onRoundText?.(resp.text)
      return {
        text: resp.text,
        rounds: round,
        truncated: false,
        toolUseParts,
        toolResultParts,
        finalModelId: activeModelId,
      }
    }

    // tool_use branch ------------------------------------------------
    if (resp.partialText) opts.onRoundText?.(resp.partialText)

    // Record the assistant's tool-use message (so the model sees it next round).
    const assistantParts: ContentPart[] = []
    if (resp.partialText) assistantParts.push({ type: "text", text: resp.partialText })
    for (const call of resp.toolCalls) {
      assistantParts.push({
        type: "tool_use",
        id: call.id,
        name: call.name,
        input: call.input,
      })
      toolUseParts.push({
        type: "tool_use",
        id: call.id,
        name: call.name,
        input: call.input,
      })
    }
    messages.push({ role: "assistant", content: assistantParts })

    // Execute each tool sequentially; collect results into one user message.
    const resultParts: ContentPart[] = []
    for (const call of resp.toolCalls) {
      const tool = toolByName.get(call.name)
      let payload: ToolResultPayload
      if (!tool) {
        payload = {
          content: `Tool "${call.name}" is not available.`,
          isError: true,
        }
      } else {
        try {
          payload = await tool.execute(call.input, opts.toolContext)
        } catch (err) {
          payload = {
            content:
              err instanceof Error ? err.message : "Tool execution failed",
            isError: true,
          }
        }
      }
      const part: ContentPart = {
        type: "tool_result",
        toolCallId: call.id,
        content: typeof payload.content === "string" ? payload.content : JSON.stringify(payload.content),
        isError: payload.isError,
      }
      resultParts.push(part)
      toolResultParts.push(part)
      opts.onToolCall?.({
        round,
        name: call.name,
        input: call.input,
        result: payload,
      })
    }
    messages.push({ role: "tool", content: resultParts })
  }

  // Hit the round cap. Make one last text-only call so the user gets *something*.
  const finalCallOpts = {
    fallbackApiKey: opts.fallbackApiKey,
    temperature: opts.temperature,
    maxTokens: opts.maxTokens,
    systemPrompt:
      opts.systemPrompt +
      "\n\n[System: Tool-call budget exhausted. Summarize what you found and answer directly — do not request more tools.]",
    signal: opts.signal,
    tools: [] as Tool[],
  }
  const { resp: final, modelId: finalModelId } = await callOneRound(
    messages,
    finalCallOpts,
    { modelId: opts.modelId, priorityList: opts.priorityList },
    handleModelChange,
    activeModelId,
  )
  activeModelId = finalModelId
  return {
    text: final.type === "text" ? final.text : "(Tool budget exceeded)",
    rounds: maxRounds,
    truncated: true,
    toolUseParts,
    toolResultParts,
    finalModelId: activeModelId,
  }
}
