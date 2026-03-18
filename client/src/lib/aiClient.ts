/**
 * Shared AI client — multi-provider API call helper
 *
 * Extracted from ChatInterface so that other components (Notepad, TaskDAG, etc.)
 * can call AI models without duplicating provider-specific logic.
 */
import { ALL_MODELS, MODEL_PROVIDERS } from "@/components/ModelSwitcher"

export async function callAI(
  messages: { role: string; content: string }[],
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

  const sysMessages = systemPrompt
    ? [{ role: "system", content: systemPrompt }]
    : []
  const allMessages = [...sysMessages, ...messages]

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
        content: m.content,
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
          parts: [{ text: m.content }],
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
    case "meta": {
      // Via Groq
      endpoint = "https://api.groq.com/openai/v1/chat/completions"
      headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      }
      body = {
        model: modelId,
        messages: allMessages,
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
      body = {
        model: modelId,
        messages: allMessages,
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
      body = {
        model: modelId,
        messages: allMessages,
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
    // Use proxy on localhost always, and on production for CORS-blocked providers (OpenRouter)
    const useProxy =
      window.location.hostname === "localhost" ||
      model.providerId === "openrouter"

    if (useProxy) {
      res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint, headers, body }),
        signal,
      })
    } else {
      res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal,
      })
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
