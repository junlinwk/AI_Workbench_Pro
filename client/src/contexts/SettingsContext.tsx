/**
 * SettingsContext — Global settings store
 *
 * Persistence layer: uses the storage facade (IndexedDB + Supabase sync).
 * API keys are obfuscated via the encryption module.
 */
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react"
import {
  loadUserData,
  saveUserData,
} from "@/lib/storage"
import {
  obfuscateKeys,
  deobfuscateKeys,
  setEncryptionUserId,
} from "@/lib/storage/encryption"
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase"

export type ThemeMode = "dark" | "light" | "system"
export type Language = "zh-TW" | "en"
export type MembershipTier = "classic" | "pro" | "ultra"
export type SendKey = "enter" | "ctrl-enter"
export type FontSize = "small" | "medium" | "large" // legacy discrete values
export type FontSizeValue = number // numeric px value (10–35)
export type MessageDensity = "compact" | "comfortable" | "spacious"

export interface APIKeyEntry {
  provider: string
  key: string
  addedAt: string
}

export interface CustomModel {
  id: string
  name: string
  providerId: string
  endpoint: string
  contextWindow: string
}

export interface Settings {
  // Appearance
  theme: ThemeMode
  fontSize: FontSize
  fontSizePx: number // 10–35, default 14
  messageDensity: MessageDensity
  showAvatars: boolean
  avatarDisplay: "both" | "user" | "ai" | "none"
  enableAnimations: boolean

  // Language
  language: Language

  // Chat
  sendKey: SendKey
  enableStreaming: boolean
  showTimestamps: boolean
  enableMarkdownRendering: boolean
  maxTokens: number
  temperature: number
  systemPrompt: string

  // Web Search
  webSearchEnabled: boolean

  // Model
  selectedModelId: string

  // API Keys (stored obfuscated)
  apiKeys: Record<string, string>

  // Custom Models
  customModels: CustomModel[]

  // Membership
  membershipTier: MembershipTier

  // Privacy
  saveHistory: boolean
  shareAnalytics: boolean

  // Voice
  voiceLanguage: "auto" | "zh" | "en"

  // Notifications
  enableNotifications: boolean
  soundEnabled: boolean

  // User Profile (optional — for AI personalization)
  userProfile: {
    displayName: string
    bio: string
    role: string
    customInstructions: string
  }
}

const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  fontSize: "medium",
  fontSizePx: 14,
  messageDensity: "comfortable",
  showAvatars: true,
  avatarDisplay: "both",
  enableAnimations: true,
  language: "zh-TW",
  sendKey: "enter",
  enableStreaming: true,
  showTimestamps: true,
  enableMarkdownRendering: true,
  maxTokens: 4096,
  temperature: 0.7,
  systemPrompt: "",
  webSearchEnabled: true,
  selectedModelId: "gpt-4o",
  apiKeys: {},
  customModels: [],
  membershipTier: "classic",
  saveHistory: true,
  shareAnalytics: false,
  voiceLanguage: "auto",
  enableNotifications: true,
  soundEnabled: false,
  userProfile: {
    displayName: "",
    bio: "",
    role: "",
    customInstructions: "",
  },
}

/* ------------------------------------------------------------------ */
/*  Settings validation                                                */
/* ------------------------------------------------------------------ */

const VALID_THEMES: ThemeMode[] = ["dark", "light", "system"]
const VALID_LANGUAGES: Language[] = ["zh-TW", "en"]
const VALID_SEND_KEYS: SendKey[] = ["enter", "ctrl-enter"]
const VALID_FONT_SIZES: FontSize[] = ["small", "medium", "large"]
const VALID_DENSITIES: MessageDensity[] = [
  "compact",
  "comfortable",
  "spacious",
]
const VALID_TIERS: MembershipTier[] = ["classic", "pro", "ultra"]

function validateSettings(raw: any): Partial<Settings> {
  const out: Partial<Settings> = {}
  if (!raw || typeof raw !== "object") return out

  if (VALID_THEMES.includes(raw.theme)) out.theme = raw.theme
  if (VALID_FONT_SIZES.includes(raw.fontSize))
    out.fontSize = raw.fontSize
  if (typeof raw.fontSizePx === "number" && raw.fontSizePx >= 10 && raw.fontSizePx <= 35)
    out.fontSizePx = raw.fontSizePx
  if (VALID_DENSITIES.includes(raw.messageDensity))
    out.messageDensity = raw.messageDensity
  if (typeof raw.showAvatars === "boolean")
    out.showAvatars = raw.showAvatars
  if (["both", "user", "ai", "none"].includes(raw.avatarDisplay))
    out.avatarDisplay = raw.avatarDisplay
  if (typeof raw.enableAnimations === "boolean")
    out.enableAnimations = raw.enableAnimations
  if (VALID_LANGUAGES.includes(raw.language))
    out.language = raw.language
  if (VALID_SEND_KEYS.includes(raw.sendKey))
    out.sendKey = raw.sendKey
  if (typeof raw.enableStreaming === "boolean")
    out.enableStreaming = raw.enableStreaming
  if (typeof raw.showTimestamps === "boolean")
    out.showTimestamps = raw.showTimestamps
  if (typeof raw.enableMarkdownRendering === "boolean")
    out.enableMarkdownRendering = raw.enableMarkdownRendering
  if (
    typeof raw.maxTokens === "number" &&
    raw.maxTokens >= 1 &&
    raw.maxTokens <= 128000
  )
    out.maxTokens = raw.maxTokens
  if (
    typeof raw.temperature === "number" &&
    raw.temperature >= 0 &&
    raw.temperature <= 2
  )
    out.temperature = raw.temperature
  if (typeof raw.systemPrompt === "string")
    out.systemPrompt = raw.systemPrompt.slice(0, 8192)
  if (typeof raw.webSearchEnabled === "boolean")
    out.webSearchEnabled = raw.webSearchEnabled
  if (typeof raw.selectedModelId === "string")
    out.selectedModelId = raw.selectedModelId.slice(0, 128)
  if (typeof raw.saveHistory === "boolean")
    out.saveHistory = raw.saveHistory
  if (typeof raw.shareAnalytics === "boolean")
    out.shareAnalytics = raw.shareAnalytics
  if (["auto", "zh", "en"].includes(raw.voiceLanguage))
    out.voiceLanguage = raw.voiceLanguage
  if (typeof raw.enableNotifications === "boolean")
    out.enableNotifications = raw.enableNotifications
  if (typeof raw.soundEnabled === "boolean")
    out.soundEnabled = raw.soundEnabled
  if (Array.isArray(raw.customModels)) out.customModels = raw.customModels
  if (VALID_TIERS.includes(raw.membershipTier))
    out.membershipTier = raw.membershipTier

  if (raw.userProfile && typeof raw.userProfile === "object") {
    out.userProfile = {
      displayName:
        typeof raw.userProfile.displayName === "string"
          ? raw.userProfile.displayName.slice(0, 100)
          : "",
      bio:
        typeof raw.userProfile.bio === "string"
          ? raw.userProfile.bio.slice(0, 500)
          : "",
      role:
        typeof raw.userProfile.role === "string"
          ? raw.userProfile.role.slice(0, 100)
          : "",
      customInstructions:
        typeof raw.userProfile.customInstructions === "string"
          ? raw.userProfile.customInstructions.slice(0, 2000)
          : "",
    }
  }

  return out
}

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

interface SettingsContextType {
  settings: Settings
  updateSetting: <K extends keyof Settings>(
    key: K,
    value: Settings[K],
  ) => void
  updateSettings: (partial: Partial<Settings>) => void
  resetSettings: () => void
  setApiKey: (provider: string, key: string) => void
  removeApiKey: (provider: string) => void
  getApiKey: (provider: string) => string | undefined
  hasApiKey: (provider: string) => boolean
  addCustomModel: (model: CustomModel) => void
  removeCustomModel: (modelId: string) => void
  exportSettings: () => string
  importSettings: (json: string) => boolean
}

const SettingsContext = createContext<SettingsContextType | undefined>(
  undefined,
)

const SETTINGS_NAMESPACE = "settings"

function loadSettings(userId?: string): Settings {
  if (!userId) return { ...DEFAULT_SETTINGS }

  const stored = loadUserData<Settings | null>(
    userId,
    SETTINGS_NAMESPACE,
    null,
  )
  if (stored) {
    // Deobfuscate API keys on load
    const apiKeys =
      stored.apiKeys && typeof stored.apiKeys === "object"
        ? deobfuscateKeys(stored.apiKeys)
        : {}
    return { ...DEFAULT_SETTINGS, ...stored, apiKeys }
  }

  // Legacy fallback: try reading from old localStorage key
  try {
    const legacyKeys = [
      `ai-workbench-settings-${userId}`,
      "ai-workbench-settings",
    ]
    for (const key of legacyKeys) {
      const raw = localStorage.getItem(key)
      if (raw) {
        const parsed = JSON.parse(raw)
        const apiKeys =
          parsed.apiKeys && typeof parsed.apiKeys === "object"
            ? deobfuscateKeys(parsed.apiKeys)
            : {}
        return { ...DEFAULT_SETTINGS, ...parsed, apiKeys }
      }
    }
  } catch {}

  return { ...DEFAULT_SETTINGS }
}

function persistSettings(settings: Settings, userId?: string) {
  if (!userId) return

  // Obfuscate API keys before saving
  const toSave = {
    ...settings,
    apiKeys: obfuscateKeys(settings.apiKeys),
  }
  saveUserData(userId, SETTINGS_NAMESPACE, toSave)

  // Trigger immediate sync so settings (incl. API keys) get pushed to cloud ASAP
  import("@/lib/storage/supabase-sync")
    .then(({ triggerSync }) => triggerSync())
    .catch(() => {})
}

/** Pull settings from Supabase (called on login) */
async function pullSettingsFromCloud(userId: string): Promise<Settings | null> {
  const supabase = getSupabase()
  if (!supabase || !isSupabaseConfigured()) return null

  try {
    const { data, error } = await supabase
      .from("user_data")
      .select("data")
      .eq("user_id", userId)
      .eq("namespace", SETTINGS_NAMESPACE)
      .single()

    if (error || !data?.data) return null

    const remote = data.data as Settings
    // Deobfuscate API keys from cloud
    const apiKeys =
      remote.apiKeys && typeof remote.apiKeys === "object"
        ? deobfuscateKeys(remote.apiKeys)
        : {}
    return { ...DEFAULT_SETTINGS, ...remote, apiKeys }
  } catch {
    return null
  }
}

/** Pull membership tier from profiles table (admin writes here) */
async function pullMembershipTier(userId: string): Promise<MembershipTier | null> {
  const supabase = getSupabase()
  if (!supabase || !isSupabaseConfigured()) return null

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("membership_tier")
      .eq("id", userId)
      .single()

    if (error || !data?.membership_tier) return null
    const tier = data.membership_tier as string
    if (["classic", "pro", "ultra"].includes(tier)) {
      return tier as MembershipTier
    }
    return null
  } catch {
    return null
  }
}

function getResolvedTheme(mode: ThemeMode): "dark" | "light" {
  if (mode === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light"
  }
  return mode
}

export function SettingsProvider({
  children,
  userId,
}: {
  children: React.ReactNode
  userId?: string
}) {
  const [settings, setSettings] = useState<Settings>(() =>
    loadSettings(userId),
  )

  // Apply theme
  useEffect(() => {
    const resolved = getResolvedTheme(settings.theme)
    const root = document.documentElement
    root.classList.toggle("dark", resolved === "dark")
    root.classList.toggle("light", resolved === "light")
    root.setAttribute("data-theme", resolved)

    if (settings.theme === "system") {
      const mql = window.matchMedia("(prefers-color-scheme: dark)")
      const handler = () => {
        const r = mql.matches ? "dark" : "light"
        root.classList.toggle("dark", r === "dark")
        root.classList.toggle("light", r === "light")
        root.setAttribute("data-theme", r)
      }
      mql.addEventListener("change", handler)
      return () => mql.removeEventListener("change", handler)
    }
  }, [settings.theme])

  // Persist language to cookie (for LoginPage, which runs before auth)
  useEffect(() => {
    try {
      document.cookie = `ai-wb-lang=${settings.language};path=/;max-age=31536000;SameSite=Lax`
    } catch {}
  }, [settings.language])

  // Apply font size (numeric px value takes priority over legacy discrete)
  useEffect(() => {
    const root = document.documentElement
    root.setAttribute("data-font-size", settings.fontSize)
    root.style.fontSize = `${settings.fontSizePx}px`
  }, [settings.fontSize, settings.fontSizePx])

  // Reload settings when userId changes + set encryption key + pull from cloud
  useEffect(() => {
    setEncryptionUserId(userId ?? null)
    const local = loadSettings(userId)
    setSettings(local)

    // Try to pull from cloud — if cloud has API keys but local doesn't, merge them in
    if (userId) {
      pullSettingsFromCloud(userId).then((cloud) => {
        if (!cloud) return
        setSettings((prev) => {
          const localHasKeys = Object.keys(prev.apiKeys).length > 0
          const cloudHasKeys = Object.keys(cloud.apiKeys).length > 0
          if (!localHasKeys && cloudHasKeys) {
            return { ...prev, apiKeys: cloud.apiKeys }
          }
          return prev
        })
      })

      // Also pull membership tier from profiles table (admin may have changed it)
      pullMembershipTier(userId).then((tier) => {
        if (tier) {
          setSettings((prev) => {
            if (prev.membershipTier !== tier) {
              return { ...prev, membershipTier: tier }
            }
            return prev
          })
        }
      })
    }
  }, [userId])

  // Periodic membership tier check (picks up admin changes without refresh)
  useEffect(() => {
    if (!userId) return
    const interval = setInterval(() => {
      pullMembershipTier(userId).then((tier) => {
        if (tier) {
          setSettings((prev) =>
            prev.membershipTier !== tier ? { ...prev, membershipTier: tier } : prev
          )
        }
      })
    }, 30_000) // Check every 30 seconds
    return () => clearInterval(interval)
  }, [userId])

  // Listen for remote settings changes (from other devices via Realtime)
  useEffect(() => {
    function handleRemoteUpdate(e: Event) {
      const { namespace, data } = (e as CustomEvent).detail || {}
      if (namespace !== SETTINGS_NAMESPACE || !data) return
      const remote = data as Settings
      const apiKeys =
        remote.apiKeys && typeof remote.apiKeys === "object"
          ? deobfuscateKeys(remote.apiKeys)
          : {}
      setSettings((prev) => ({
        ...prev,
        ...remote,
        apiKeys: Object.keys(apiKeys).length > 0 ? apiKeys : prev.apiKeys,
      }))
    }
    window.addEventListener("storage-remote-update", handleRemoteUpdate)
    return () => window.removeEventListener("storage-remote-update", handleRemoteUpdate)
  }, [])

  // Persist
  useEffect(() => {
    persistSettings(settings, userId)
  }, [settings, userId])

  const updateSetting = useCallback(
    <K extends keyof Settings>(key: K, value: Settings[K]) => {
      setSettings((prev) => ({ ...prev, [key]: value }))
    },
    [],
  )

  const updateSettings = useCallback(
    (partial: Partial<Settings>) => {
      setSettings((prev) => ({ ...prev, ...partial }))
    },
    [],
  )

  const resetSettings = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS })
  }, [])

  const setApiKey = useCallback(
    (provider: string, key: string) => {
      setSettings((prev) => ({
        ...prev,
        apiKeys: { ...prev.apiKeys, [provider]: key },
      }))
    },
    [],
  )

  const removeApiKey = useCallback((provider: string) => {
    setSettings((prev) => {
      const next = { ...prev.apiKeys }
      delete next[provider]
      return { ...prev, apiKeys: next }
    })
  }, [])

  const getApiKey = useCallback(
    (provider: string) => {
      if (settings.apiKeys[provider]) return settings.apiKeys[provider]
      // Groq and Meta share the same Groq API endpoint/key
      if (provider === "groq") return settings.apiKeys["meta"]
      if (provider === "meta") return settings.apiKeys["groq"]
      return undefined
    },
    [settings.apiKeys],
  )

  const hasApiKey = useCallback(
    (provider: string) => {
      if (settings.apiKeys[provider]) return true
      // Groq and Meta share the same Groq API endpoint/key
      if (provider === "groq") return !!settings.apiKeys["meta"]
      if (provider === "meta") return !!settings.apiKeys["groq"]
      return false
    },
    [settings.apiKeys],
  )

  const addCustomModel = useCallback((model: CustomModel) => {
    setSettings((prev) => ({
      ...prev,
      customModels: [
        ...prev.customModels.filter((m) => m.id !== model.id),
        model,
      ],
    }))
  }, [])

  const removeCustomModel = useCallback((modelId: string) => {
    setSettings((prev) => ({
      ...prev,
      customModels: prev.customModels.filter(
        (m) => m.id !== modelId,
      ),
    }))
  }, [])

  const exportSettings = useCallback(() => {
    // Never export API keys
    const exportable = { ...settings, apiKeys: {} }
    return JSON.stringify(exportable, null, 2)
  }, [settings])

  const importSettings = useCallback((json: string) => {
    try {
      const parsed = JSON.parse(json)
      const validated = validateSettings(parsed)
      if (Object.keys(validated).length === 0) return false
      // Preserve existing API keys — never import them
      setSettings((prev) => ({
        ...prev,
        ...validated,
        apiKeys: prev.apiKeys,
      }))
      return true
    } catch {
      return false
    }
  }, [])

  return (
    <SettingsContext.Provider
      value={{
        settings,
        updateSetting,
        updateSettings,
        resetSettings,
        setApiKey,
        removeApiKey,
        getApiKey,
        hasApiKey,
        addCustomModel,
        removeCustomModel,
        exportSettings,
        importSettings,
      }}
    >
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx)
    throw new Error(
      "useSettings must be used within SettingsProvider",
    )
  return ctx
}
