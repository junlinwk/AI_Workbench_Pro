/**
 * Tool-calling type system — provider-agnostic.
 *
 * Tools carry their own executors. Format converters in ./converters.ts
 * translate between this canonical form and each provider's wire format.
 */

/** Minimal JSON Schema (draft-07 subset) */
export type JSONSchema = {
  type?:
    | "object"
    | "string"
    | "number"
    | "integer"
    | "boolean"
    | "array"
    | "null"
  properties?: Record<string, JSONSchema>
  required?: string[]
  items?: JSONSchema
  enum?: (string | number)[]
  description?: string
  default?: unknown
  [key: string]: unknown
}

/** Context passed to tool executors */
export interface ToolContext {
  userId: string
  conversationId: string
  signal?: AbortSignal
  /** Optional progress reporter (tool → UI) */
  onProgress?: (msg: string) => void
  /** Anthropic/OpenAI-style fallback auth key if server-stored lookup fails */
  fallbackApiKey?: string
}

/** What a tool executor returns */
export interface ToolResultPayload {
  /** Text content returned to the model (will be stringified if needed) */
  content: string
  /** Error flag — model sees it but gets the content too */
  isError?: boolean
  /** Optional structured metadata (not sent to model, kept for UI) */
  meta?: Record<string, unknown>
}

/** A tool the model can choose to call */
export interface Tool {
  name: string
  description: string
  inputSchema: JSONSchema
  source: "builtin" | "mcp"
  /** Identifies which MCP server hosts this tool, if source === "mcp" */
  mcpServerId?: string
  /** Executor. Must handle its own errors and return ToolResultPayload. */
  execute: (input: unknown, ctx: ToolContext) => Promise<ToolResultPayload>
}

/** A tool call emitted by the model within one turn */
export interface ToolCall {
  /** Provider-assigned call id — reused when returning results */
  id: string
  name: string
  /** Parsed JSON object; never a string */
  input: unknown
}

/** Tool result formatted for round-trip back to the model */
export interface ToolResult {
  toolCallId: string
  toolName: string
  content: string
  isError?: boolean
}

/** One AI turn's outcome */
export type AIResponse =
  | { type: "text"; text: string }
  | {
      type: "tool_use"
      toolCalls: ToolCall[]
      /** Any text the model emitted alongside the tool call (can be empty) */
      partialText: string
    }

/** Hard cap on how many tool-use rounds a single user message can trigger */
export const DEFAULT_MAX_TOOL_ROUNDS = 8

/** Providers that support native tool-calling. Mistral excluded (no support). */
export const TOOL_CAPABLE_PROVIDERS = new Set([
  "openai",
  "anthropic",
  "google",
  "deepseek",
  "xai",
  "groq",
  "meta",
  "openrouter",
])

/** Models that reliably do tool-calling. Empty list for a provider = all models on that provider. */
export const TOOL_CAPABLE_MODELS: Record<string, Set<string> | null> = {
  openai: null, // all modern OpenAI models
  anthropic: null,
  google: null,
  deepseek: null,
  xai: null,
  groq: null,
  meta: null,
  openrouter: null,
  mistral: new Set(), // none, signals "skip tools"
}

export function supportsTools(providerId: string, modelId: string): boolean {
  if (!TOOL_CAPABLE_PROVIDERS.has(providerId)) return false
  const whitelist = TOOL_CAPABLE_MODELS[providerId]
  if (whitelist === null) return true
  if (whitelist.size === 0) return false
  return whitelist.has(modelId)
}
