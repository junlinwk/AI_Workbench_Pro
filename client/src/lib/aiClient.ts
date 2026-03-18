/**
 * Shared AI client — multi-provider API call helper
 *
 * Extracted from ChatInterface so that other components (Notepad, TaskDAG, etc.)
 * can call AI models without duplicating provider-specific logic.
 *
 * Supports multimodal messages (text + image) via ContentPart arrays.
 */
import { ALL_MODELS, MODEL_PROVIDERS } from "@/components/ModelSwitcher"

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

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image"; base64: string; mimeType: string }

export type MessageContent = string | ContentPart[]

export interface ChatMessage {
  role: string
  content: MessageContent
}

/** Convert ContentPart[] to OpenAI/Groq multimodal format */
function toOpenAIContent(content: MessageContent) {
  if (typeof content === "string") return content
  return content.map((part) => {
    if (part.type === "text") return { type: "text" as const, text: part.text }
    return {
      type: "image_url" as const,
      image_url: { url: `data:${part.mimeType};base64,${part.base64}` },
    }
  })
}

/** Convert ContentPart[] to Anthropic multimodal format */
function toAnthropicContent(content: MessageContent) {
  if (typeof content === "string") return content
  return content.map((part) => {
    if (part.type === "text") return { type: "text" as const, text: part.text }
    return {
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: part.mimeType,
        data: part.base64,
      },
    }
  })
}

/** Convert ContentPart[] to Google Gemini multimodal format */
function toGoogleParts(content: MessageContent) {
  if (typeof content === "string") return [{ text: content }]
  return content.map((part) => {
    if (part.type === "text") return { text: part.text }
    return { inline_data: { mime_type: part.mimeType, data: part.base64 } }
  })
}

/** Get plain text from message content (for non-vision fallbacks) */
function getTextContent(content: MessageContent): string {
  if (typeof content === "string") return content
  return content
    .filter((p) => p.type === "text")
    .map((p) => (p as { type: "text"; text: string }).text)
    .join("\n")
}

export async function callAI(
  messages: ChatMessage[],
  modelId: string,
  apiKey: string,
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
  let headers: Record<string, string>
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
      headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      }
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
      headers = {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      }
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
      headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      }
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
      // Both route through Groq API
      endpoint = "https://api.groq.com/openai/v1/chat/completions"
      headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      }
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
      headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      }
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
      headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": window.location.origin,
        "X-OpenRouter-Title": "AI Workbench",
      }
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

  let res: Response
  try {
    // Use proxy for CORS-blocked providers; direct for others
    const needsProxy =
      window.location.hostname === "localhost" ||
      model.providerId === "openrouter"

    if (needsProxy) {
      res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint, headers, body }),
        signal,
      })
    } else {
      try {
        res = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal,
        })
      } catch (directErr) {
        // CORS or network error on direct call — fallback to proxy
        console.warn("[aiClient] Direct call failed, retrying via proxy:", directErr)
        res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint, headers, body }),
          signal,
        })
      }
    }
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error(
        "Network error — please check your internet connection and try again.",
      )
    }
    throw err
  }

  if (res.status === 429) {
    const retryAfter = res.headers.get("retry-after")
    const waitSeconds = retryAfter ? parseInt(retryAfter, 10) : null
    const waitMsg = waitSeconds
      ? `Rate limited. Please retry after ${waitSeconds} seconds.`
      : "Rate limited. Please wait a moment and try again."
    throw new Error(waitMsg)
  }

  if (!res.ok) {
    const err = await res.text().catch(() => "")
    throw new Error(
      `API error (${res.status}): ${err.slice(0, 200)}`,
    )
  }

  let data: any
  try {
    data = await res.json()
  } catch {
    throw new Error("Invalid JSON response from API")
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
