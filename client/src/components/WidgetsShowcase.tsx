/**
 * WidgetsShowcase — Void Glass Design System
 * Real AI chat interface for creating interactive widgets.
 * Users chat with AI to generate and refine widgets.
 * Reuses the core AI calling logic from ChatInterface.
 */
import { useState, useRef, useEffect, useCallback } from "react"
import {
  Send,
  Zap,
  Sparkles,
  User,
  StopCircle,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Streamdown } from "streamdown"
import { useSettings } from "@/contexts/SettingsContext"
import { useAuth } from "@/contexts/AuthContext"
import { loadUserData, saveUserData, sanitizeText } from "@/lib/storage"
import { t } from "@/i18n"
import { ALL_MODELS, MODEL_PROVIDERS, getAllModels } from "./ModelSwitcher"

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: string
  model?: string
}

/* ------------------------------------------------------------------ */
/*  Widget system prompt                                               */
/* ------------------------------------------------------------------ */

const WIDGET_SYSTEM_PROMPT = `You are a Widget Builder assistant integrated into AI Workbench. Your specialty is creating interactive widgets — small, self-contained UI components that users can use directly.

When asked to create a widget, output:
1. A brief description of what the widget does
2. The complete code in a fenced code block (use \`\`\`tsx or \`\`\`html)
3. Usage instructions

Widget types you can create include:
- Data trackers (expense trackers, habit trackers, time logs)
- Calculators (loan, BMI, unit conversion, tax)
- Charts & dashboards (bar, pie, line charts with sample data)
- Forms & surveys (multi-step forms, feedback collectors)
- Mini tools (countdown timer, pomodoro, color picker, password generator)
- Interactive lists (todo, kanban, shopping list)

Always write clean, modern code. For React widgets, use hooks and Tailwind CSS. Keep widgets self-contained.`

/* ------------------------------------------------------------------ */
/*  API call (simplified from ChatInterface)                           */
/* ------------------------------------------------------------------ */

async function callAI(
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
      endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`
      headers = { "Content-Type": "application/json" }
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
    default:
      throw new Error(`Unsupported provider: ${model.providerId}`)
  }

  let res: Response
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
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
    throw new Error(`API error (${res.status}): ${err.slice(0, 200)}`)
  }

  let data: any
  try {
    data = await res.json()
  } catch {
    throw new Error("Invalid JSON response from API")
  }

  if (model.providerId === "anthropic") {
    return data.content?.[0]?.text || "(No response)"
  }
  if (model.providerId === "google") {
    return (
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      "(No response)"
    )
  }
  return data.choices?.[0]?.message?.content || "(No response)"
}

/* ------------------------------------------------------------------ */
/*  Suggestion chips for widgets                                       */
/* ------------------------------------------------------------------ */

const WIDGET_SUGGESTIONS = [
  { en: "Build an expense tracker", zh: "建立記帳追蹤器" },
  { en: "Create a countdown timer", zh: "建立倒數計時器" },
  { en: "Make a todo list widget", zh: "建立待辦清單 Widget" },
  { en: "Design a calculator", zh: "設計一個計算機" },
]

/* ------------------------------------------------------------------ */
/*  Message Bubble                                                     */
/* ------------------------------------------------------------------ */

function WidgetMessageBubble({
  message,
  lang,
  onRegenerate,
}: {
  message: Message
  lang: "zh-TW" | "en"
  onRegenerate?: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null)
  const isUser = message.role === "user"

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className={cn(
        "flex gap-3 group",
        isUser ? "flex-row-reverse" : "flex-row",
      )}
    >
      <div
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1",
          isUser
            ? "bg-gradient-to-br from-blue-500 to-violet-600"
            : "bg-gradient-to-br from-amber-500 to-orange-600 ring-1 ring-white/10",
        )}
      >
        {isUser ? (
          <User size={14} className="text-white" />
        ) : (
          <Zap size={14} className="text-white" />
        )}
      </div>

      <div
        className={cn(
          "flex-1 min-w-0 flex flex-col gap-1",
          isUser ? "items-end" : "items-start",
        )}
      >
        <div
          className={cn(
            "max-w-[85%] rounded-2xl px-4 py-3",
            isUser
              ? "bg-blue-600/25 border border-blue-500/20 text-white/90 rounded-tr-sm"
              : "bg-white/5 border border-white/8 text-white/85 rounded-tl-sm",
          )}
        >
          <div
            className="prose prose-invert prose-sm max-w-none
            prose-headings:text-white/90 prose-headings:font-semibold
            prose-p:text-white/75 prose-p:leading-relaxed
            prose-code:text-blue-300 prose-code:bg-blue-900/30 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono
            prose-pre:bg-[oklch(0.10_0.015_265)] prose-pre:border prose-pre:border-white/8 prose-pre:rounded-xl
            prose-strong:text-white/90
            prose-li:text-white/75"
          >
            <Streamdown>{message.content}</Streamdown>
          </div>
        </div>

        {/* Actions for AI messages */}
        {!isUser && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
            >
              {copied ? (
                <Check size={11} className="text-emerald-400" />
              ) : (
                <Copy size={11} />
              )}
              <span className="text-[10px]">
                {copied ? t("chat.copied", lang) : t("chat.copy", lang)}
              </span>
            </button>
            <button
              onClick={onRegenerate}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
            >
              <RefreshCw size={11} />
              <span className="text-[10px]">
                {t("chat.regenerate", lang)}
              </span>
            </button>
            <button
              onClick={() => {
                setFeedback("up")
                toast.success(t("chat.markedHelpful", lang))
              }}
              className={cn(
                "p-1 rounded-lg transition-colors",
                feedback === "up"
                  ? "text-emerald-400 bg-emerald-500/10"
                  : "text-white/30 hover:text-emerald-400 hover:bg-white/5",
              )}
            >
              <ThumbsUp size={11} />
            </button>
            <button
              onClick={() => {
                setFeedback("down")
                toast.info(t("chat.thanksFeedback", lang))
              }}
              className={cn(
                "p-1 rounded-lg transition-colors",
                feedback === "down"
                  ? "text-red-400 bg-red-500/10"
                  : "text-white/30 hover:text-red-400 hover:bg-white/5",
              )}
            >
              <ThumbsDown size={11} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Typing indicator                                                   */
/* ------------------------------------------------------------------ */

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 ring-1 ring-white/10 flex items-center justify-center shrink-0">
        <Zap size={14} className="text-white" />
      </div>
      <div className="bg-white/5 border border-white/8 rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex gap-1.5 items-center h-4">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 typing-dot" />
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 typing-dot" />
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 typing-dot" />
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function WidgetsShowcase() {
  const { settings, hasApiKey, getApiKey } = useSettings()
  const { user } = useAuth()
  const lang = settings.language
  const userId = user?.id || "anonymous"

  const [messages, setMessages] = useState<Message[]>(() =>
    loadUserData<Message[]>(userId, "widget-chat", []),
  )
  const [input, setInput] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Persist messages
  useEffect(() => {
    const timer = setTimeout(() => {
      saveUserData(userId, "widget-chat", messages)
    }, 300)
    return () => clearTimeout(timer)
  }, [messages, userId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isTyping])

  const allModels = getAllModels(settings.customModels)
  const currentModel = allModels.find(
    (m) => m.id === settings.selectedModelId,
  )
  const currentProvider = currentModel
    ? MODEL_PROVIDERS.find((p) => p.id === currentModel.providerId)
    : null
  const apiKey = currentModel
    ? getApiKey(currentModel.providerId)
    : undefined
  const canSend = hasApiKey(currentModel?.providerId || "")

  const handleChipClick = useCallback((text: string) => {
    setInput(text)
    textareaRef.current?.focus()
  }, [])

  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed) return

    const sanitized = sanitizeText(trimmed, 4096)

    if (!canSend || !apiKey) {
      toast.error(
        lang === "en"
          ? `Please set your ${currentProvider?.name || "model"} API key in Settings > Models & API.`
          : `請先在設定 → 模型與 API 中設定 ${currentProvider?.name || "模型"} 的 API Key。`,
      )
      return
    }

    const userMsg: Message = {
      id: `wm${Date.now()}`,
      role: "user",
      content: sanitized,
      timestamp: new Date().toLocaleTimeString("zh-TW", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    }
    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setIsTyping(true)

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }

    try {
      const abort = new AbortController()
      abortRef.current = abort

      const chatHistory = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }))
      chatHistory.push({ role: "user", content: userMsg.content })

      // Combine user system prompt with widget prompt
      const combinedPrompt = settings.systemPrompt
        ? `${WIDGET_SYSTEM_PROMPT}\n\nAdditional instructions:\n${settings.systemPrompt}`
        : WIDGET_SYSTEM_PROMPT

      const response = await callAI(
        chatHistory,
        settings.selectedModelId,
        apiKey,
        settings.temperature,
        settings.maxTokens,
        combinedPrompt,
        abort.signal,
      )

      setIsTyping(false)
      const aiMsg: Message = {
        id: `wm${Date.now() + 1}`,
        role: "assistant",
        content: response,
        timestamp: new Date().toLocaleTimeString("zh-TW", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        model: settings.selectedModelId,
      }
      setMessages((prev) => [...prev, aiMsg])

      // Dispatch code blocks to Artifacts panel
      const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g
      let match
      while ((match = codeBlockRegex.exec(response)) !== null) {
        const language = match[1] || "text"
        const code = match[2].trim()
        if (code.length > 20) {
          window.dispatchEvent(
            new CustomEvent("artifact-update", {
              detail: { code, language, source: "widget" },
            }),
          )
        }
      }
    } catch (err: any) {
      setIsTyping(false)
      if (err.name === "AbortError") return
      const errMsg: Message = {
        id: `wm${Date.now() + 1}`,
        role: "assistant",
        content: `**${lang === "en" ? "Error" : "發生錯誤"}**\n\n${err.message}`,
        timestamp: new Date().toLocaleTimeString("zh-TW", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        model: settings.selectedModelId,
      }
      setMessages((prev) => [...prev, errMsg])
      toast.error(t("chat.apiFailed", lang))
    } finally {
      abortRef.current = null
    }
  }

  const handleStop = () => {
    abortRef.current?.abort()
    setIsTyping(false)
    toast.info(t("chat.stopped", lang))
  }

  const handleRegenerate = async (msgIndex: number) => {
    const precedingMessages = messages.slice(0, msgIndex)
    const lastUserIdx = precedingMessages.findLastIndex(
      (m) => m.role === "user",
    )
    if (lastUserIdx === -1) return
    if (!canSend || !apiKey) {
      toast.error(t("chat.needApiKey", lang))
      return
    }

    setMessages((prev) => prev.filter((_, i) => i !== msgIndex))
    setIsTyping(true)

    try {
      const chatHistory = messages
        .slice(0, msgIndex)
        .map((m) => ({ role: m.role, content: m.content }))

      const combinedPrompt = settings.systemPrompt
        ? `${WIDGET_SYSTEM_PROMPT}\n\nAdditional instructions:\n${settings.systemPrompt}`
        : WIDGET_SYSTEM_PROMPT

      const response = await callAI(
        chatHistory,
        settings.selectedModelId,
        apiKey,
        settings.temperature,
        settings.maxTokens,
        combinedPrompt,
      )

      setIsTyping(false)
      const aiMsg: Message = {
        id: `wm${Date.now()}`,
        role: "assistant",
        content: response,
        timestamp: new Date().toLocaleTimeString("zh-TW", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        model: settings.selectedModelId,
      }
      setMessages((prev) => {
        const copy = [...prev]
        copy.splice(msgIndex, 0, aiMsg)
        return copy
      })
    } catch (err: any) {
      setIsTyping(false)
      toast.error(
        (lang === "en" ? "Regeneration failed: " : "重新生成失敗：") +
          err.message,
      )
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const sendWithEnter = settings.sendKey === "enter"
    if (sendWithEnter && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    } else if (
      !sendWithEnter &&
      e.key === "Enter" &&
      (e.ctrlKey || e.metaKey)
    ) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleTextareaInput = (
    e: React.ChangeEvent<HTMLTextAreaElement>,
  ) => {
    setInput(e.target.value)
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = "auto"
      ta.style.height = Math.min(ta.scrollHeight, 160) + "px"
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* No API Key notice */}
      {!canSend && (
        <div className="mx-6 mt-3 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-2">
          <AlertCircle
            size={14}
            className="text-amber-400 shrink-0"
          />
          <p className="text-xs text-amber-300/80">
            {lang === "en"
              ? `No ${currentProvider?.name} API key set — go to Settings > Models & API to configure.`
              : `尚未設定 ${currentProvider?.name} API Key — 開啟設定 → 模型與 API 來設定。`}
          </p>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 min-h-0 space-y-6">
        {messages.length === 0 && !isTyping ? (
          <div className="flex flex-col items-center justify-center h-full gap-6 px-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 ring-1 ring-white/10 flex items-center justify-center shadow-lg shadow-amber-900/30">
              <Zap size={28} className="text-white" />
            </div>
            <div className="text-center space-y-1">
              <h2 className="text-lg font-semibold text-white/90">
                {lang === "en"
                  ? "Widget Builder"
                  : "Widget 建構器"}
              </h2>
              <p className="text-sm text-white/40">
                {lang === "en"
                  ? "Ask AI to create interactive widgets for you"
                  : "讓 AI 為您建立互動式 Widget"}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 max-w-md">
              {WIDGET_SUGGESTIONS.map((chip, i) => {
                const label = lang === "en" ? chip.en : chip.zh
                return (
                  <button
                    key={i}
                    onClick={() => handleChipClick(label)}
                    className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-white/60 hover:bg-white/10 hover:text-white/80 hover:border-white/20 transition-all duration-150"
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <WidgetMessageBubble
                key={msg.id}
                message={msg}
                lang={lang}
                onRegenerate={() => handleRegenerate(i)}
              />
            ))}
            {isTyping && <TypingIndicator />}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="shrink-0 px-4 pb-4">
        <div
          className="relative rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden
          focus-within:border-amber-500/40 focus-within:bg-white/7 transition-all duration-200
          shadow-lg shadow-black/20"
        >
          <div className="flex items-end gap-2 p-3">
            <div className="p-2 rounded-xl text-amber-400/60 shrink-0">
              <Zap size={16} />
            </div>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleTextareaInput}
              onKeyDown={handleKeyDown}
              maxLength={4096}
              placeholder={
                lang === "en"
                  ? "Describe the widget you want to create..."
                  : "描述您想建立的 Widget..."
              }
              rows={1}
              className="flex-1 bg-transparent text-sm text-white/85 placeholder:text-white/25 resize-none focus:outline-none leading-relaxed py-1 min-h-[28px] max-h-40"
            />

            {isTyping ? (
              <button
                onClick={handleStop}
                className="p-2 rounded-xl bg-red-600/80 hover:bg-red-500 text-white shadow-lg transition-all duration-150 shrink-0"
              >
                <StopCircle size={16} />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className={cn(
                  "p-2 rounded-xl transition-all duration-150 shrink-0",
                  input.trim()
                    ? "bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-900/40"
                    : "text-white/20 bg-white/5 cursor-not-allowed",
                )}
              >
                <Send size={16} />
              </button>
            )}
          </div>

          <div className="px-4 pb-2 flex items-center justify-between">
            <span className="text-[10px] text-white/20">
              {settings.sendKey === "enter"
                ? t("chat.sendHint_enter", lang)
                : t("chat.sendHint_ctrl", lang)}
            </span>
            <span className="text-[10px] text-white/20">
              {input.length}/4096
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
