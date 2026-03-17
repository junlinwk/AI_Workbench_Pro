/**
 * AdminPage — Admin panel for managing user membership tiers
 *
 * Only accessible to users whose email matches VITE_ADMIN_EMAIL.
 * Uses Supabase `profiles` table to read/write membership_tier.
 */
import { useState, useEffect } from "react"
import { useLocation } from "wouter"
import {
  ArrowLeft,
  Search,
  Shield,
  Crown,
  Zap,
  Star,
  AlertTriangle,
  Check,
  Copy,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/contexts/AuthContext"
import { useSettings } from "@/contexts/SettingsContext"
import type { MembershipTier } from "@/contexts/SettingsContext"
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase"
import { t } from "@/i18n"
import { toast } from "sonner"

const TIER_CONFIG: Record<
  MembershipTier,
  {
    label: (lang: "zh-TW" | "en") => string
    icon: React.ReactNode
    color: string
    bgColor: string
    borderColor: string
  }
> = {
  classic: {
    label: (lang) => t("membership.classic", lang),
    icon: <Star size={16} />,
    color: "text-white/60",
    bgColor: "bg-white/8",
    borderColor: "border-white/12",
  },
  pro: {
    label: (lang) => t("membership.pro", lang),
    icon: <Zap size={16} />,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/25",
  },
  ultra: {
    label: (lang) => t("membership.ultra", lang),
    icon: <Crown size={16} />,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/25",
  },
}

interface LookedUpUser {
  id: string
  username: string | null
  avatar_url: string | null
  membership_tier: MembershipTier
}

export default function AdminPage() {
  const { isAdmin } = useAuth()
  const { settings } = useSettings()
  const lang = settings.language
  const [, navigate] = useLocation()

  const [userIdInput, setUserIdInput] = useState("")
  const [lookedUpUser, setLookedUpUser] = useState<LookedUpUser | null>(null)
  const [selectedTier, setSelectedTier] = useState<MembershipTier>("classic")
  const [isLoading, setIsLoading] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)

  // Redirect non-admin users
  useEffect(() => {
    if (!isAdmin) {
      toast.error(t("admin.notAdmin", lang))
      navigate("/")
    }
  }, [isAdmin, navigate, lang])

  if (!isAdmin) {
    return null
  }

  const supabaseReady = isSupabaseConfigured()

  const handleLookup = async () => {
    const trimmed = userIdInput.trim()
    if (!trimmed) return

    if (!supabaseReady) {
      toast.error(t("admin.requiresSupabase", lang))
      return
    }

    setIsLoading(true)
    setLookedUpUser(null)

    try {
      const supabase = getSupabase()
      if (!supabase) {
        toast.error(t("admin.requiresSupabase", lang))
        return
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, avatar_url, membership_tier")
        .eq("id", trimmed)
        .single()

      if (error || !data) {
        toast.error(t("admin.userNotFound", lang))
        return
      }

      const user: LookedUpUser = {
        id: data.id,
        username: data.username,
        avatar_url: data.avatar_url,
        membership_tier:
          (data.membership_tier as MembershipTier) || "classic",
      }
      setLookedUpUser(user)
      setSelectedTier(user.membership_tier)
    } catch {
      toast.error(t("admin.userNotFound", lang))
    } finally {
      setIsLoading(false)
    }
  }

  const handleUpdateTier = async () => {
    if (!lookedUpUser || !supabaseReady) return

    setIsUpdating(true)
    try {
      const supabase = getSupabase()
      if (!supabase) {
        toast.error(t("admin.requiresSupabase", lang))
        return
      }

      const { error } = await supabase
        .from("profiles")
        .update({ membership_tier: selectedTier })
        .eq("id", lookedUpUser.id)

      if (error) {
        toast.error(t("admin.updateFailed", lang), {
          description: error.message,
        })
        return
      }

      setLookedUpUser({
        ...lookedUpUser,
        membership_tier: selectedTier,
      })
      toast.success(t("admin.updated", lang))
    } catch {
      toast.error(t("admin.updateFailed", lang))
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "oklch(0.09 0.012 265)" }}
    >
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => navigate("/")}
            className="p-2 rounded-xl text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-2">
            <Shield size={22} className="text-blue-400" />
            <div>
              <h1 className="text-xl font-bold text-white/90">
                {t("admin.title", lang)}
              </h1>
              <p className="text-xs text-white/35">
                {t("admin.subtitle", lang)}
              </p>
            </div>
          </div>
        </div>

        {/* Supabase not configured warning */}
        {!supabaseReady && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/8 p-4 mb-6 flex items-start gap-3">
            <AlertTriangle
              size={18}
              className="text-amber-400 shrink-0 mt-0.5"
            />
            <div>
              <p className="text-sm text-amber-300 font-medium">
                {t("admin.requiresSupabase", lang)}
              </p>
              <p className="text-xs text-amber-300/50 mt-1">
                {lang === "en"
                  ? "Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env to enable admin functions."
                  : "請在 .env 中設定 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY 以啟用管理功能。"}
              </p>
            </div>
          </div>
        )}

        {/* Lookup section */}
        <div className="rounded-2xl border border-white/8 bg-white/3 backdrop-blur-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/6">
            <p className="text-sm font-semibold text-white/80">
              {t("admin.userId", lang)}
            </p>
            <p className="text-xs text-white/35 mt-0.5">
              {t("admin.lookupDesc", lang)}
            </p>
          </div>

          <div className="px-6 py-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={userIdInput}
                onChange={(e) => setUserIdInput(e.target.value)}
                placeholder={t("admin.userIdPlaceholder", lang)}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-mono text-white/80 placeholder:text-white/20 focus:outline-none focus:border-blue-500/40 transition-colors"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleLookup()
                }}
              />
              <button
                onClick={handleLookup}
                disabled={
                  !userIdInput.trim() || isLoading || !supabaseReady
                }
                className={cn(
                  "px-5 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2",
                  userIdInput.trim() && !isLoading && supabaseReady
                    ? "bg-blue-600/80 text-white hover:bg-blue-500"
                    : "bg-white/5 text-white/20 cursor-not-allowed"
                )}
              >
                {isLoading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Search size={16} />
                )}
                {t("admin.lookup", lang)}
              </button>
            </div>
          </div>

          {/* Looked up user result */}
          {lookedUpUser && (
            <div className="px-6 py-5 border-t border-white/6 space-y-5">
              {/* User info */}
              <div className="flex items-center gap-3">
                {lookedUpUser.avatar_url ? (
                  <img
                    src={lookedUpUser.avatar_url}
                    alt=""
                    className="w-10 h-10 rounded-full border border-white/10"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-white/8 flex items-center justify-center text-white/40 text-sm font-medium">
                    {(
                      lookedUpUser.username ??
                      lookedUpUser.id.slice(0, 2)
                    )
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white/85 truncate">
                    {lookedUpUser.username ?? "Unknown"}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <p className="text-[10px] font-mono text-white/30 truncate">
                      {lookedUpUser.id}
                    </p>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(lookedUpUser.id)
                        toast.success(t("membership.copied", lang))
                      }}
                      className="text-white/20 hover:text-white/50 transition-colors shrink-0"
                    >
                      <Copy size={10} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Current tier */}
              <div>
                <p className="text-xs text-white/40 mb-2">
                  {t("admin.currentTier", lang)}
                </p>
                <div
                  className={cn(
                    "inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border",
                    TIER_CONFIG[lookedUpUser.membership_tier]
                      .bgColor,
                    TIER_CONFIG[lookedUpUser.membership_tier]
                      .borderColor,
                    TIER_CONFIG[lookedUpUser.membership_tier].color
                  )}
                >
                  {TIER_CONFIG[lookedUpUser.membership_tier].icon}
                  <span className="text-sm font-medium">
                    {TIER_CONFIG[
                      lookedUpUser.membership_tier
                    ].label(lang)}
                  </span>
                </div>
              </div>

              {/* Change tier */}
              <div>
                <p className="text-xs text-white/40 mb-2">
                  {t("admin.changeTo", lang)}
                </p>
                <div className="flex gap-2">
                  {(
                    Object.keys(TIER_CONFIG) as MembershipTier[]
                  ).map((tier) => {
                    const config = TIER_CONFIG[tier]
                    const isSelected = selectedTier === tier
                    return (
                      <button
                        key={tier}
                        onClick={() => setSelectedTier(tier)}
                        className={cn(
                          "flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-xl border transition-all",
                          isSelected
                            ? cn(
                                config.bgColor,
                                config.borderColor,
                                config.color
                              )
                            : "bg-white/3 border-white/6 text-white/30 hover:bg-white/5 hover:text-white/50"
                        )}
                      >
                        {config.icon}
                        <span className="text-sm font-medium">
                          {config.label(lang)}
                        </span>
                        {isSelected && (
                          <Check size={14} className="ml-1" />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Update button */}
              <button
                onClick={handleUpdateTier}
                disabled={
                  selectedTier ===
                    lookedUpUser.membership_tier ||
                  isUpdating
                }
                className={cn(
                  "w-full py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2",
                  selectedTier !==
                    lookedUpUser.membership_tier && !isUpdating
                    ? "bg-blue-600/80 text-white hover:bg-blue-500 shadow-lg shadow-blue-900/30"
                    : "bg-white/5 text-white/20 cursor-not-allowed"
                )}
              >
                {isUpdating && (
                  <Loader2 size={16} className="animate-spin" />
                )}
                {t("admin.update", lang)}
              </button>
            </div>
          )}
        </div>

        {/* Back link */}
        <div className="text-center mt-6">
          <button
            onClick={() => navigate("/")}
            className="text-xs text-white/30 hover:text-white/50 transition-colors"
          >
            {t("admin.backToWorkbench", lang)}
          </button>
        </div>
      </div>
    </div>
  )
}
