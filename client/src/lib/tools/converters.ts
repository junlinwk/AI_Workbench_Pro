/**
 * Per-provider conversion layer for tool-calling.
 *
 * Responsibilities:
 *   1. Tool schema → provider-native tools[] format
 *   2. Canonical messages (with tool_use / tool_result parts) → provider messages
 *   3. Provider response → canonical AIResponse
 *
 * Canonical content parts (from aiClient.ts):
 *   - { type: "text", text }
 *   - { type: "image", base64, mimeType }
 *   - { type: "file",  base64, mimeType, name }
 *   - { type: "tool_use",    id, name, input }
 *   - { type: "tool_result", toolCallId, content, isError? }
 */
import type { ChatMessage, ContentPart } from "../aiClient"
import type { AIResponse, Tool, ToolCall } from "./types"

/* ================================================================== *
 *  Tool schema conversion                                             *
 * ================================================================== */

export function toolsForOpenAI(tools: Tool[]) {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }))
}

export function toolsForAnthropic(tools: Tool[]) {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }))
}

export function toolsForGoogle(tools: Tool[]) {
  // Gemini wraps all function declarations in a single tools[0].functionDeclarations
  return [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: sanitizeSchemaForGoogle(t.inputSchema),
      })),
    },
  ]
}

/** Gemini's schema subset disallows some JSON-Schema keywords. Strip them. */
function sanitizeSchemaForGoogle(schema: unknown): unknown {
  if (!schema || typeof schema !== "object") return schema
  const s = schema as Record<string, unknown>
  const out: Record<string, unknown> = {}
  const allowedKeys = new Set([
    "type",
    "properties",
    "required",
    "items",
    "enum",
    "description",
    "format",
    "nullable",
  ])
  for (const [k, v] of Object.entries(s)) {
    if (!allowedKeys.has(k)) continue
    if (k === "properties" && v && typeof v === "object") {
      const props: Record<string, unknown> = {}
      for (const [pk, pv] of Object.entries(v as Record<string, unknown>)) {
        props[pk] = sanitizeSchemaForGoogle(pv)
      }
      out[k] = props
    } else if (k === "items") {
      out[k] = sanitizeSchemaForGoogle(v)
    } else {
      out[k] = v
    }
  }
  return out
}

/* ================================================================== *
 *  Message conversion — OpenAI / Groq / DeepSeek / xAI / OpenRouter   *
 * ================================================================== */

type OpenAIMessage = {
  role: "system" | "user" | "assistant" | "tool"
  content?: string | Array<Record<string, unknown>> | null
  tool_calls?: Array<{
    id: string
    type: "function"
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
  name?: string
}

export function messagesForOpenAI(
  messages: ChatMessage[],
  systemPrompt: string,
): OpenAIMessage[] {
  const out: OpenAIMessage[] = []
  if (systemPrompt) out.push({ role: "system", content: systemPrompt })

  for (const m of messages) {
    const parts = normalizeParts(m.content)

    // Tool result parts become separate role=tool messages
    const toolResults = parts.filter((p) => p.type === "tool_result") as Extract<
      ContentPart,
      { type: "tool_result" }
    >[]
    for (const tr of toolResults) {
      out.push({
        role: "tool",
        tool_call_id: tr.toolCallId,
        content: tr.content,
      })
    }

    // Everything else stays on the original message
    const remaining = parts.filter((p) => p.type !== "tool_result")
    if (remaining.length === 0) continue

    const toolCalls = remaining.filter((p) => p.type === "tool_use") as Extract<
      ContentPart,
      { type: "tool_use" }
    >[]
    const contentParts = remaining.filter(
      (p) => p.type !== "tool_use",
    )

    const mapped = mapContentForOpenAI(contentParts)
    const role = normalizeRole(m.role, toolCalls.length > 0)

    const msg: OpenAIMessage = {
      role,
      content: mapped,
    }
    if (toolCalls.length > 0) {
      msg.tool_calls = toolCalls.map((c) => ({
        id: c.id,
        type: "function",
        function: { name: c.name, arguments: JSON.stringify(c.input ?? {}) },
      }))
      // OpenAI requires content: null when only tool_calls present
      if (
        Array.isArray(mapped)
          ? mapped.length === 0
          : !mapped
      ) {
        msg.content = null
      }
    }
    out.push(msg)
  }
  return out
}

function mapContentForOpenAI(parts: ContentPart[]) {
  if (parts.length === 0) return ""
  // If only a single text part, send as string (cheaper, simpler)
  if (parts.length === 1 && parts[0].type === "text") return parts[0].text

  return parts
    .map((p) => {
      if (p.type === "text") return { type: "text", text: p.text }
      if (p.type === "image")
        return {
          type: "image_url",
          image_url: { url: `data:${p.mimeType};base64,${p.base64}` },
        }
      if (p.type === "file")
        // OpenAI has no native PDF/file input — caller should pre-extract for GPT-4o family.
        // If we reach here, fall back to a textual placeholder so the model is at least aware.
        return {
          type: "text",
          text: `[Attached file: ${p.name} (${p.mimeType}) — content not inline for this provider]`,
        }
      return null
    })
    .filter(Boolean) as Array<Record<string, unknown>>
}

function normalizeRole(role: string, hasToolCalls: boolean): OpenAIMessage["role"] {
  if (hasToolCalls) return "assistant"
  if (role === "assistant" || role === "user" || role === "system" || role === "tool")
    return role
  return "user"
}

/* ================================================================== *
 *  Message conversion — Anthropic                                      *
 * ================================================================== */

type AnthropicMessage = {
  role: "user" | "assistant"
  content: string | Array<Record<string, unknown>>
}

export function messagesForAnthropic(
  messages: ChatMessage[],
): AnthropicMessage[] {
  const out: AnthropicMessage[] = []
  for (const m of messages) {
    const parts = normalizeParts(m.content)
    if (parts.length === 0) continue

    // Anthropic keeps tool_use (assistant side) and tool_result (user side)
    // as content blocks. Role mapping:
    //   - "assistant" → assistant
    //   - "tool" or messages containing tool_result → user
    //   - "user" / anything else → user
    const hasToolResult = parts.some((p) => p.type === "tool_result")
    const role: AnthropicMessage["role"] =
      m.role === "assistant" && !hasToolResult ? "assistant" : "user"

    const mapped = parts
      .map((p) => {
        if (p.type === "text") return { type: "text", text: p.text }
        if (p.type === "image")
          return {
            type: "image",
            source: {
              type: "base64",
              media_type: p.mimeType,
              data: p.base64,
            },
          }
        if (p.type === "file") {
          // Anthropic 4.6 accepts PDFs as `document` with base64 source
          if (p.mimeType === "application/pdf") {
            return {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: p.base64,
              },
            }
          }
          return {
            type: "text",
            text: `[Attached file: ${p.name} (${p.mimeType}) — not natively supported, consider extracting text]`,
          }
        }
        if (p.type === "tool_use")
          return {
            type: "tool_use",
            id: p.id,
            name: p.name,
            input: p.input ?? {},
          }
        if (p.type === "tool_result")
          return {
            type: "tool_result",
            tool_use_id: p.toolCallId,
            content: p.content,
            ...(p.isError ? { is_error: true } : {}),
          }
        return null
      })
      .filter(Boolean) as Array<Record<string, unknown>>

    if (mapped.length === 0) continue

    // Simplify single-text case
    if (mapped.length === 1 && mapped[0].type === "text") {
      out.push({ role, content: (mapped[0] as any).text })
    } else {
      out.push({ role, content: mapped })
    }
  }
  return mergeAdjacentSameRole(out)
}

/** Anthropic rejects consecutive messages with the same role. Merge them. */
function mergeAdjacentSameRole(msgs: AnthropicMessage[]): AnthropicMessage[] {
  const out: AnthropicMessage[] = []
  for (const m of msgs) {
    const last = out[out.length - 1]
    if (last && last.role === m.role) {
      const lastContent = Array.isArray(last.content)
        ? last.content
        : [{ type: "text", text: last.content }]
      const newContent = Array.isArray(m.content)
        ? m.content
        : [{ type: "text", text: m.content }]
      last.content = [...lastContent, ...newContent]
    } else {
      out.push({ ...m })
    }
  }
  return out
}

/* ================================================================== *
 *  Message conversion — Google Gemini                                  *
 * ================================================================== */

type GoogleContent = {
  role: "user" | "model"
  parts: Array<Record<string, unknown>>
}

export function messagesForGoogle(messages: ChatMessage[]): GoogleContent[] {
  const out: GoogleContent[] = []
  for (const m of messages) {
    const parts = normalizeParts(m.content)
    if (parts.length === 0) continue

    const hasToolResult = parts.some((p) => p.type === "tool_result")
    const role: GoogleContent["role"] =
      m.role === "assistant" && !hasToolResult ? "model" : "user"

    const mapped = parts
      .map((p) => {
        if (p.type === "text") return { text: p.text }
        if (p.type === "image")
          return { inline_data: { mime_type: p.mimeType, data: p.base64 } }
        if (p.type === "file")
          return { inline_data: { mime_type: p.mimeType, data: p.base64 } }
        if (p.type === "tool_use")
          return {
            functionCall: {
              name: p.name,
              args: (p.input as Record<string, unknown>) ?? {},
            },
          }
        if (p.type === "tool_result")
          return {
            functionResponse: {
              name: extractNameFromToolId(p.toolCallId),
              response: { content: p.content },
            },
          }
        return null
      })
      .filter(Boolean) as Array<Record<string, unknown>>

    out.push({ role, parts: mapped })
  }
  return mergeAdjacentSameRoleGoogle(out)
}

function mergeAdjacentSameRoleGoogle(
  msgs: GoogleContent[],
): GoogleContent[] {
  const out: GoogleContent[] = []
  for (const m of msgs) {
    const last = out[out.length - 1]
    if (last && last.role === m.role) {
      last.parts = [...last.parts, ...m.parts]
    } else {
      out.push({ ...m, parts: [...m.parts] })
    }
  }
  return out
}

/**
 * Google's functionResponse requires the original function name. Our canonical
 * tool_result only tracks the id. We encode id as "name::uuid" when producing
 * results so we can recover name here. Fallback: use the raw id.
 */
function extractNameFromToolId(id: string): string {
  const sep = id.indexOf("::")
  if (sep > 0) return id.slice(0, sep)
  return id
}

/* ================================================================== *
 *  Response parsing                                                    *
 * ================================================================== */

export function parseOpenAIResponse(data: any): AIResponse {
  const msg = data?.choices?.[0]?.message
  const finishReason = data?.choices?.[0]?.finish_reason
  const rawText: string = msg?.content ?? ""

  const toolCalls = Array.isArray(msg?.tool_calls) ? msg.tool_calls : []
  if (toolCalls.length > 0 || finishReason === "tool_calls") {
    const calls: ToolCall[] = toolCalls.map((tc: any) => ({
      id: String(tc.id ?? cryptoRandomId()),
      name: String(tc.function?.name ?? ""),
      input: safeJsonParse(tc.function?.arguments ?? "{}"),
    }))
    return {
      type: "tool_use",
      toolCalls: calls,
      partialText: typeof rawText === "string" ? rawText : "",
    }
  }

  return {
    type: "text",
    text: typeof rawText === "string" ? rawText : "(No response)",
  }
}

export function parseAnthropicResponse(data: any): AIResponse {
  const blocks = Array.isArray(data?.content) ? data.content : []
  const stopReason = data?.stop_reason
  const textParts: string[] = []
  const calls: ToolCall[] = []

  for (const b of blocks) {
    if (b?.type === "text" && typeof b.text === "string") textParts.push(b.text)
    if (b?.type === "tool_use")
      calls.push({
        id: String(b.id ?? cryptoRandomId()),
        name: String(b.name ?? ""),
        input: b.input ?? {},
      })
  }

  const partialText = textParts.join("")
  if (calls.length > 0 || stopReason === "tool_use") {
    return { type: "tool_use", toolCalls: calls, partialText }
  }
  return {
    type: "text",
    text: partialText || "(No response)",
  }
}

export function parseGoogleResponse(data: any): AIResponse {
  const parts = data?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) return { type: "text", text: "(No response)" }

  const textParts: string[] = []
  const calls: ToolCall[] = []
  for (const p of parts) {
    if (typeof p?.text === "string") textParts.push(p.text)
    if (p?.functionCall?.name) {
      calls.push({
        id: `${p.functionCall.name}::${cryptoRandomId()}`,
        name: String(p.functionCall.name),
        input: p.functionCall.args ?? {},
      })
    }
  }

  const partialText = textParts.join("")
  if (calls.length > 0) {
    return { type: "tool_use", toolCalls: calls, partialText }
  }
  return { type: "text", text: partialText || "(No response)" }
}

/* ================================================================== *
 *  Helpers                                                             *
 * ================================================================== */

function normalizeParts(content: ChatMessage["content"]): ContentPart[] {
  if (typeof content === "string") {
    return content === "" ? [] : [{ type: "text", text: content }]
  }
  return content
}

function safeJsonParse(s: string): unknown {
  if (typeof s !== "string") return s
  try {
    return JSON.parse(s)
  } catch {
    return { _raw: s }
  }
}

function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}
