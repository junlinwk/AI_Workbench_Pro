/**
 * Tool-execution loop.
 *
 * Given a message history, a list of tools, and a model, keep calling the
 * model until it returns plain text (or we hit the round cap). Tool calls
 * are executed and their results appended to the message array as canonical
 * tool_use / tool_result content parts.
 */
import { callAIWithTools, type ChatMessage, type ContentPart } from "../aiClient"
import {
  DEFAULT_MAX_TOOL_ROUNDS,
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

  for (let round = 0; round < maxRounds; round++) {
    if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError")

    const resp = await callAIWithTools(messages, {
      modelId: opts.modelId,
      fallbackApiKey: opts.fallbackApiKey,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
      systemPrompt: opts.systemPrompt,
      signal: opts.signal,
      tools: opts.tools,
    })

    if (resp.type === "text") {
      opts.onRoundText?.(resp.text)
      return {
        text: resp.text,
        rounds: round,
        truncated: false,
        toolUseParts,
        toolResultParts,
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
  const final = await callAIWithTools(messages, {
    modelId: opts.modelId,
    fallbackApiKey: opts.fallbackApiKey,
    temperature: opts.temperature,
    maxTokens: opts.maxTokens,
    systemPrompt:
      opts.systemPrompt +
      "\n\n[System: Tool-call budget exhausted. Summarize what you found and answer directly — do not request more tools.]",
    signal: opts.signal,
    tools: [],
  })
  return {
    text: final.type === "text" ? final.text : "(Tool budget exceeded)",
    rounds: maxRounds,
    truncated: true,
    toolUseParts,
    toolResultParts,
  }
}
