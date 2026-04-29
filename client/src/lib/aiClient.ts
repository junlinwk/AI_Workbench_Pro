/**
 * Shared AI client — multi-provider API call helper
 *
 * Server-side key management: API keys are stored encrypted on the server.
 * The client sends the Supabase auth token; the proxy fetches and injects
 * the correct API key. The raw key NEVER appears in client code.
 *
 * Supports multimodal messages (text + image) via ContentPart arrays.
 */
import { ALL_MODELS, MODEL_PROVIDERS } from "@/components/ModelSwitcher"
import { getAuthToken } from "@/lib/supabase"
import { detectQuota } from "@/lib/priorityRouter"

/**
 * Structured AI error. Thrown by callAI / callAIWithTools so callers (notably
 * the priority-fallback router) can branch on status / quota state without
 * string-matching `err.message`.
 */
export class AIError extends Error {
  status: number
  retryAfterMs?: number
  providerCode?: string
  bodyText?: string

  constructor(
    message: string,
    opts: {
      status: number
      retryAfterMs?: number
      providerCode?: string
      bodyText?: string
    },
  ) {
    super(message)
    this.name = "AIError"
    this.status = opts.status
    this.retryAfterMs = opts.retryAfterMs
    this.providerCode = opts.providerCode
    this.bodyText = opts.bodyText
  }

  /** True if the failure looks like a rate-limit / quota / overload signal. */
  isQuotaLike(): boolean {
    if (this.status === 429 || this.status === 529) return true
    if (this.providerCode) {
      const c = this.providerCode.toLowerCase()
      return (
        c === "insufficient_quota" ||
        c === "rate_limit_exceeded" ||
        c === "rate_limit_error" ||
        c === "overloaded_error" ||
        c === "resource_exhausted" ||
        c === "quota_exceeded" ||
        c === "billing_hard_limit_reached" ||
        c === "too_many_requests"
      )
    }
    return false
  }

  /** Categorise into the QuotaReason taxonomy. */
  quotaReason(): "rate_limit" | "quota_exceeded" | "overloaded" | "auth_failed" | "unknown" {
    if (this.status === 401 || this.status === 404) return "auth_failed"
    if (this.status === 529) return "overloaded"
    const c = (this.providerCode ?? "").toLowerCase()
    if (c === "overloaded_error") return "overloaded"
    if (c === "insufficient_quota" || c === "billing_hard_limit_reached" || c === "quota_exceeded")
      return "quota_exceeded"
    if (this.status === 429 || c.includes("rate_limit") || c === "resource_exhausted" || c === "too_many_requests")
      return "rate_limit"
    return "unknown"
  }
}

/**
 * Inspect a non-OK fetch response and throw the matching AIError.
 * Reads the body once; closes the stream.
 */
async function throwAIError(res: Response): Promise<never> {
  const bodyText = await res.text().catch(() => "")
  const retryAfterHeader = res.headers.get("retry-after")
  const retryAfterMs = retryAfterHeader
    ? Number.isFinite(parseInt(retryAfterHeader, 10))
      ? parseInt(retryAfterHeader, 10) * 1000
      : undefined
    : undefined

  if (res.status === 401) {
    throw new AIError(
      "Authentication required — please log in and save your API key in Settings.",
      { status: 401, bodyText },
    )
  }
  if (res.status === 404) {
    throw new AIError(
      "No API key found — please add your API key in Settings.",
      { status: 404, bodyText },
    )
  }

  // Quota detection covers 429/529 and parses provider-specific codes from the body
  const q = detectQuota(res.status, bodyText)
  if (q.isQuota) {
    const waitMsg =
      retryAfterMs && Number.isFinite(retryAfterMs)
        ? `Rate limited. Retry after ${Math.round(retryAfterMs / 1000)}s.`
        : q.reason === "quota_exceeded"
          ? "Quota exhausted on this model. Add credits or switch models."
          : q.reason === "overloaded"
            ? "Provider is overloaded. Try again shortly."
            : "Rate limited. Please wait a moment and try again."
    throw new AIError(waitMsg, {
      status: res.status,
      retryAfterMs,
      providerCode: q.providerCode,
      bodyText,
    })
  }

  throw new AIError(
    `API error (${res.status}): ${bodyText.slice(0, 200)}`,
    { status: res.status, bodyText },
  )
}

/** Vision-capable models that accept image inputs */
export const VISION_MODELS = new Set([
  // OpenAI
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
  // Anthropic
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  // Google
  "gemini-3.1-flash-lite-preview",
  "gemini-3-flash-preview",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  // Groq (vision)
  "meta-llama/llama-4-scout-17b-16e-instruct",
  // OpenRouter vision models
  "openai/gpt-4o",
  "anthropic/claude-sonnet-4-6",
  "anthropic/claude-opus-4-6",
  "google/gemini-2.5-pro",
])

export interface ImageAttachment {
  base64: string // base64 data (without data:... prefix)
  mimeType: string // e.g. "image/png"
}

/**
 * Canonical content parts. Tool-use and file variants are handled by the
 * per-provider converters in ./tools/converters.ts — legacy `callAI` only
 * understands text+image and will degrade other parts to text placeholders.
 */
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image"; base64: string; mimeType: string }
  | { type: "file"; base64: string; mimeType: string; name: string }
  | {
      type: "tool_use"
      id: string
      name: string
      input: unknown
      /** Gemini-only: required by Google's API on the next turn. */
      thoughtSignature?: string
    }
  | {
      type: "tool_result"
      toolCallId: string
      content: string
      isError?: boolean
    }

export type MessageContent = string | ContentPart[]

export interface ChatMessage {
  role: string
  content: MessageContent
}

/** Convert ContentPart[] to OpenAI/Groq multimodal format. Legacy path: drops tool parts. */
function toOpenAIContent(content: MessageContent) {
  if (typeof content === "string") return content
  const out: Array<Record<string, unknown>> = []
  for (const part of content) {
    if (part.type === "text") out.push({ type: "text", text: part.text })
    else if (part.type === "image")
      out.push({
        type: "image_url",
        image_url: { url: `data:${part.mimeType};base64,${part.base64}` },
      })
    else if (part.type === "file")
      out.push({ type: "text", text: `[file: ${part.name}]` })
    // tool_use / tool_result: dropped in legacy path
  }
  return out.length > 0 ? out : ""
}

/** Convert ContentPart[] to Anthropic multimodal format. Legacy path: drops tool parts. */
function toAnthropicContent(content: MessageContent) {
  if (typeof content === "string") return content
  const out: Array<Record<string, unknown>> = []
  for (const part of content) {
    if (part.type === "text") {
      out.push({ type: "text", text: part.text })
    } else if (part.type === "image") {
      out.push({
        type: "image",
        source: { type: "base64", media_type: part.mimeType, data: part.base64 },
      })
    } else if (part.type === "file" && part.mimeType === "application/pdf") {
      out.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: part.base64 },
      })
    } else if (part.type === "file") {
      out.push({ type: "text", text: `[file: ${part.name}]` })
    }
  }
  return out.length > 0 ? out : ""
}

/** Convert ContentPart[] to Google Gemini multimodal format. Legacy path: drops tool parts. */
function toGoogleParts(content: MessageContent) {
  if (typeof content === "string") return [{ text: content }]
  const out: Array<Record<string, unknown>> = []
  for (const part of content) {
    if (part.type === "text") out.push({ text: part.text })
    else if (part.type === "image" || part.type === "file")
      out.push({ inline_data: { mime_type: part.mimeType, data: part.base64 } })
  }
  return out.length > 0 ? out : [{ text: "" }]
}

/** Get plain text from message content (for non-vision fallbacks) */
function getTextContent(content: MessageContent): string {
  if (typeof content === "string") return content
  return content
    .filter((p) => p.type === "text")
    .map((p) => (p as { type: "text"; text: string }).text)
    .join("\n")
}

/** Build legacy auth headers for fallback mode (when server-side key storage is unavailable) */
function buildLegacyHeaders(providerId: string, apiKey: string, endpoint: string): Record<string, string> {
  switch (providerId) {
    case "anthropic":
      return { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" }
    case "google":
      return { "Content-Type": "application/json", "x-goog-api-key": apiKey }
    case "openrouter":
      return { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "HTTP-Referer": window.location.origin, "X-OpenRouter-Title": "AI Workbench" }
    default:
      return { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }
  }
}

export async function callAI(
  messages: ChatMessage[],
  modelId: string,
  fallbackApiKey: string | undefined, // used as legacy fallback when server-side keys unavailable
  temperature: number,
  maxTokens: number,
  systemPrompt: string,
  signal?: AbortSignal,
): Promise<string> {
  const model = ALL_MODELS.find((m) => m.id === modelId) || {
    id: modelId,
    name: modelId,
    providerId: "openai",
    description: "",
    speed: 3,
    intelligence: 3,
    contextWindow: "",
  }

  let endpoint: string
  let body: any

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
      const allMessages = [
        ...(systemPrompt
          ? [{ role: "system", content: systemPrompt }]
          : []),
        ...messages.map((m) => ({
          role: m.role,
          content: toOpenAIContent(m.content),
        })),
      ]
      body = {
        model: modelId,
        messages: allMessages,
        temperature,
        max_tokens: maxTokens,
      }
      break
    }
    case "anthropic": {
      endpoint = "https://api.anthropic.com/v1/messages"
      const anthropicMessages = messages.map((m) => ({
        role: m.role,
        content: toAnthropicContent(m.content),
      }))
      body = {
        model: modelId,
        messages: anthropicMessages,
        max_tokens: maxTokens,
        temperature,
        ...(systemPrompt && { system: systemPrompt }),
      }
      break
    }
    case "google": {
      endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`
      body = {
        contents: messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: toGoogleParts(m.content),
        })),
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
        },
        ...(systemPrompt && {
          systemInstruction: { parts: [{ text: systemPrompt }] },
        }),
      }
      break
    }
    case "meta":
    case "groq": {
      endpoint = "https://api.groq.com/openai/v1/chat/completions"
      const groqMessages = [
        ...(systemPrompt
          ? [{ role: "system", content: systemPrompt }]
          : []),
        ...messages.map((m) => ({
          role: m.role,
          content: toOpenAIContent(m.content),
        })),
      ]
      body = {
        model: modelId,
        messages: groqMessages,
        temperature,
        max_tokens: maxTokens,
      }
      break
    }
    case "mistral": {
      endpoint = "https://api.mistral.ai/v1/chat/completions"
      const mistralMessages = [
        ...(systemPrompt
          ? [{ role: "system", content: systemPrompt }]
          : []),
        ...messages.map((m) => ({
          role: m.role,
          content: getTextContent(m.content),
        })),
      ]
      body = {
        model: modelId,
        messages: mistralMessages,
        temperature,
        max_tokens: maxTokens,
      }
      break
    }
    case "openrouter": {
      endpoint = "https://openrouter.ai/api/v1/chat/completions"
      const orMessages = [
        ...(systemPrompt
          ? [{ role: "system", content: systemPrompt }]
          : []),
        ...messages.map((m) => ({
          role: m.role,
          content: toOpenAIContent(m.content),
        })),
      ]
      body = {
        model: modelId,
        messages: orMessages,
        temperature,
        max_tokens: maxTokens,
      }
      break
    }
    default:
      throw new Error(`Unsupported provider: ${model.providerId}`)
  }

  // Always route through the server proxy — keys are injected server-side
  const authToken = await getAuthToken()
  const proxyHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  }
  if (authToken) {
    proxyHeaders["Authorization"] = `Bearer ${authToken}`
  }

  let res: Response
  try {
    res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: proxyHeaders,
      body: JSON.stringify({
        endpoint,
        body,
        provider: model.providerId,
      }),
      signal,
    })
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error(
        "Network error — please check your internet connection and try again.",
      )
    }
    throw err
  }

  // If server-side key lookup failed but we have a local fallback key,
  // retry with legacy headers mode (key sent directly through proxy)
  if ((res.status === 401 || res.status === 404) && fallbackApiKey && fallbackApiKey !== "[server-stored]") {
    const legacyHeaders = buildLegacyHeaders(model.providerId, fallbackApiKey, endpoint)
    try {
      res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint,
          body,
          headers: legacyHeaders,
        }),
        signal,
      })
    } catch (err) {
      if (err instanceof TypeError) {
        throw new Error("Network error — please check your internet connection and try again.")
      }
      throw err
    }
  }

  if (!res.ok) {
    await throwAIError(res)
  }

  let data: any
  try {
    data = await res.json()
  } catch {
    throw new AIError("Invalid JSON response from API", { status: res.status })
  }

  // Parse response based on provider
  if (model.providerId === "anthropic") {
    return data.content?.[0]?.text || "(No response)"
  }
  if (model.providerId === "google") {
    return (
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      "(No response)"
    )
  }
  // OpenAI-compatible
  return data.choices?.[0]?.message?.content || "(No response)"
}

/* ================================================================== *
 *  Tool-calling path — callAIWithTools                                 *
 *                                                                      *
 *  Provider-agnostic single-turn request that may return a tool-use    *
 *  response. Callers wrap this in a loop (see ChatInterface tool loop) *
 *  and feed tool results back as canonical ChatMessage objects with    *
 *  tool_use / tool_result content parts.                               *
 * ================================================================== */
import {
  messagesForAnthropic,
  messagesForGoogle,
  messagesForOpenAI,
  parseAnthropicResponse,
  parseGoogleResponse,
  parseOpenAIResponse,
  toolsForAnthropic,
  toolsForGoogle,
  toolsForOpenAI,
} from "./tools/converters"
import {
  supportsTools,
  type AIResponse,
  type Tool,
} from "./tools/types"

export interface CallAIOptions {
  modelId: string
  fallbackApiKey?: string
  temperature: number
  maxTokens: number
  systemPrompt: string
  signal?: AbortSignal
  /** When empty, falls back to plain `callAI` string path and wraps as text response. */
  tools?: Tool[]
}

export async function callAIWithTools(
  messages: ChatMessage[],
  opts: CallAIOptions,
): Promise<AIResponse> {
  const { modelId, fallbackApiKey, temperature, maxTokens, systemPrompt, signal } = opts
  const tools = opts.tools ?? []

  const model = ALL_MODELS.find((m) => m.id === modelId) || {
    id: modelId,
    name: modelId,
    providerId: "openai",
    description: "",
    speed: 3,
    intelligence: 3,
    contextWindow: "",
  }

  // No tools or provider doesn't support tools → shortcut through legacy callAI
  const useTools = tools.length > 0 && supportsTools(model.providerId, modelId)
  if (!useTools) {
    const text = await callAI(
      messages,
      modelId,
      fallbackApiKey,
      temperature,
      maxTokens,
      systemPrompt,
      signal,
    )
    return { type: "text", text }
  }

  let endpoint: string
  let body: any
  let parseFn: (data: any) => AIResponse

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
      body = {
        model: modelId,
        messages: messagesForOpenAI(messages, systemPrompt),
        temperature,
        max_tokens: maxTokens,
        tools: toolsForOpenAI(tools),
        tool_choice: "auto",
      }
      parseFn = parseOpenAIResponse
      break
    }
    case "anthropic": {
      endpoint = "https://api.anthropic.com/v1/messages"
      body = {
        model: modelId,
        messages: messagesForAnthropic(messages),
        max_tokens: maxTokens,
        temperature,
        tools: toolsForAnthropic(tools),
        ...(systemPrompt && { system: systemPrompt }),
      }
      parseFn = parseAnthropicResponse
      break
    }
    case "google": {
      endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`
      body = {
        contents: messagesForGoogle(messages),
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
        },
        tools: toolsForGoogle(tools),
        ...(systemPrompt && {
          systemInstruction: { parts: [{ text: systemPrompt }] },
        }),
      }
      parseFn = parseGoogleResponse
      break
    }
    case "meta":
    case "groq": {
      endpoint = "https://api.groq.com/openai/v1/chat/completions"
      body = {
        model: modelId,
        messages: messagesForOpenAI(messages, systemPrompt),
        temperature,
        max_tokens: maxTokens,
        tools: toolsForOpenAI(tools),
        tool_choice: "auto",
      }
      parseFn = parseOpenAIResponse
      break
    }
    case "openrouter": {
      endpoint = "https://openrouter.ai/api/v1/chat/completions"
      body = {
        model: modelId,
        messages: messagesForOpenAI(messages, systemPrompt),
        temperature,
        max_tokens: maxTokens,
        tools: toolsForOpenAI(tools),
        tool_choice: "auto",
      }
      parseFn = parseOpenAIResponse
      break
    }
    default:
      // Unknown / non-tool-capable provider — return text-only via legacy path
      const text = await callAI(
        messages,
        modelId,
        fallbackApiKey,
        temperature,
        maxTokens,
        systemPrompt,
        signal,
      )
      return { type: "text", text }
  }

  const authToken = await getAuthToken()
  const proxyHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  }
  if (authToken) proxyHeaders["Authorization"] = `Bearer ${authToken}`

  let res: Response
  try {
    res = await fetch("/api/ai/chat", {
      method: "POST",
      headers: proxyHeaders,
      body: JSON.stringify({
        endpoint,
        body,
        provider: model.providerId,
      }),
      signal,
    })
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error(
        "Network error — please check your internet connection and try again.",
      )
    }
    throw err
  }

  if ((res.status === 401 || res.status === 404) && fallbackApiKey && fallbackApiKey !== "[server-stored]") {
    const legacyHeaders = buildLegacyHeaders(model.providerId, fallbackApiKey, endpoint)
    try {
      res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint,
          body,
          headers: legacyHeaders,
        }),
        signal,
      })
    } catch (err) {
      if (err instanceof TypeError) {
        throw new Error("Network error — please check your internet connection and try again.")
      }
      throw err
    }
  }

  if (!res.ok) {
    await throwAIError(res)
  }

  let data: any
  try {
    data = await res.json()
  } catch {
    throw new AIError("Invalid JSON response from API", { status: res.status })
  }

  return parseFn(data)
}
