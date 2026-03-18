/**
 * LoginPage — Void Glass Design Login & Registration
 * Glassmorphism card with Login/Register tabs, Google OAuth, and demo mode
 *
 * Registration uses Supabase Auth signUp which sends a confirmation email
 * automatically. No custom email service needed — Supabase handles it.
 *
 * To customize the verification email template, go to:
 * Supabase Dashboard -> Authentication -> Email Templates -> Confirm signup
 */
import React, { useState, useMemo } from "react"
import { useAuth } from "@/contexts/AuthContext"

// ---------------------------------------------------------------------------
//  Disposable / temporary email domain blocklist
// ---------------------------------------------------------------------------
const DISPOSABLE_DOMAINS = new Set([
  "tempmail.com",
  "throwaway.email",
  "guerrillamail.com",
  "mailinator.com",
  "10minutemail.com",
  "trashmail.com",
  "yopmail.com",
  "temp-mail.org",
  "fakeinbox.com",
  "sharklasers.com",
  "guerrillamailblock.com",
  "grr.la",
  "dispostable.com",
  "maildrop.cc",
  "mailnesia.com",
  "tempail.com",
  "mohmal.com",
  "burpcollaborator.net",
  "minutemail.com",
  "emailondeck.com",
  "tempinbox.com",
  "getairmail.com",
  "meltmail.com",
  "nada.email",
  "33mail.com",
  "getnada.com",
  "spamgourmet.com",
  "tmail.com",
  "tempmailo.com",
  "disposable.email",
  "mailcatch.com",
  "deadaddress.com",
  "dropmail.me",
  "harakirimail.com",
  "tempmailaddress.com",
  "burnermail.io",
  "inboxkitten.com",
  "jetable.org",
  "moakt.cc",
  "trashmail.me",
])

function isDisposableEmail(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase()
  if (!domain) return true
  return DISPOSABLE_DOMAINS.has(domain)
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// ---------------------------------------------------------------------------
//  i18n labels
// ---------------------------------------------------------------------------
const labels = {
  "zh-TW": {
    title: "AI Workbench",
    subtitle: "Build your AI workspace easily",
    loginTab: "\u767b\u5165",
    registerTab: "\u8a3b\u518a",
    email: "\u4fe1\u7bb1",
    password: "\u5bc6\u78bc",
    confirmPassword: "\u78ba\u8a8d\u5bc6\u78bc",
    login: "\u767b\u5165",
    register: "\u8a3b\u518a",
    or: "\u6216",
    googleLogin:
      "\u4f7f\u7528 Google \u5e33\u865f\u767b\u5165",
    loginError:
      "\u4fe1\u7bb1\u6216\u5bc6\u78bc\u932f\u8aa4",
    emailExists:
      "\u6b64\u4fe1\u7bb1\u5df2\u88ab\u8a3b\u518a",
    invalidEmail:
      "\u8acb\u8f38\u5165\u6709\u6548\u7684\u4fe1\u7bb1",
    disposableEmail:
      "\u4e0d\u5141\u8a31\u4f7f\u7528\u62cb\u68c4\u5f0f\u4fe1\u7bb1",
    passwordTooShort:
      "\u5bc6\u78bc\u81f3\u5c11\u9700\u8981 6 \u500b\u5b57\u5143",
    passwordMismatch:
      "\u5169\u6b21\u8f38\u5165\u7684\u5bc6\u78bc\u4e0d\u4e00\u81f4",
    registerSuccess:
      "\u9a57\u8b49\u4fe1\u5df2\u5bc4\u51fa\uff01\u8acb\u67e5\u6536\u4fe1\u7bb1\u3002",
    supabaseNotConfigured:
      "Supabase \u5c1a\u672a\u8a2d\u5b9a\uff0c\u7121\u6cd5\u8a3b\u518a",
    footer: "AI Workbench v1.0",
    emailPlaceholder: "\u8f38\u5165\u4fe1\u7bb1",
    passwordPlaceholder: "\u8f38\u5165\u5bc6\u78bc",
    confirmPasswordPlaceholder:
      "\u518d\u6b21\u8f38\u5165\u5bc6\u78bc",
    passwordHint:
      "\u5bc6\u78bc\u81f3\u5c11 6 \u500b\u5b57\u5143",
  },
  en: {
    title: "AI Workbench",
    subtitle: "Intelligent Workspace",
    loginTab: "Login",
    registerTab: "Register",
    email: "Email",
    password: "Password",
    confirmPassword: "Confirm Password",
    login: "Login",
    register: "Register",
    or: "or",
    googleLogin: "Sign in with Google",
    loginError: "Email or password incorrect",
    emailExists: "This email is already registered",
    invalidEmail: "Please enter a valid email",
    disposableEmail: "Disposable emails are not allowed",
    passwordTooShort:
      "Password must be at least 6 characters",
    passwordMismatch: "Passwords do not match",
    registerSuccess:
      "Verification email sent! Check your inbox.",
    supabaseNotConfigured:
      "Supabase is not configured. Registration unavailable.",
    footer: "AI Workbench v1.0",
    emailPlaceholder: "Enter email",
    passwordPlaceholder: "Enter password",
    confirmPasswordPlaceholder: "Re-enter password",
    passwordHint: "Minimum 6 characters",
  },
}

// Read language preference from cookie or localStorage fallback
function getStoredLanguage(): "zh-TW" | "en" {
  try {
    const match = document.cookie.match(
      /(?:^|;\s*)ai-wb-lang=(\S+)/,
    )
    if (match) {
      const lang = match[1]
      if (lang === "zh-TW" || lang === "en") return lang
    }
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith("ai-workbench-settings")) {
        const stored = localStorage.getItem(key)
        if (stored) {
          const parsed = JSON.parse(stored)
          if (parsed.language) return parsed.language
        }
      }
    }
  } catch {}
  return "zh-TW"
}

// ---------------------------------------------------------------------------
//  Shared input style helpers
// ---------------------------------------------------------------------------
const inputStyle = {
  background: "oklch(0.1 0.008 265 / 60%)",
  border: "1px solid oklch(1 0 0 / 8%)",
  color: "oklch(0.9 0 0)",
  boxShadow: "inset 0 1px 3px oklch(0 0 0 / 20%)",
}

function handleInputFocus(
  e: React.FocusEvent<HTMLInputElement>,
) {
  e.target.style.borderColor = "oklch(0.6 0.2 255 / 50%)"
  e.target.style.boxShadow =
    "inset 0 1px 3px oklch(0 0 0 / 20%), 0 0 0 3px oklch(0.6 0.2 255 / 10%)"
}

function handleInputBlur(
  e: React.FocusEvent<HTMLInputElement>,
) {
  e.target.style.borderColor = "oklch(1 0 0 / 8%)"
  e.target.style.boxShadow =
    "inset 0 1px 3px oklch(0 0 0 / 20%)"
}

// ---------------------------------------------------------------------------
//  Component
// ---------------------------------------------------------------------------
export default function LoginPage() {
  const { login, loginWithGoogle, register } = useAuth()
  const [activeTab, setActiveTab] = useState<
    "login" | "register"
  >("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [loading, setLoading] = useState(false)
  const [lang, setLang] = useState<"zh-TW" | "en">(
    getStoredLanguage,
  )

  const t = labels[lang]

  // Derived validation states
  const emailIsDisposable = useMemo(
    () => email.includes("@") && isDisposableEmail(email),
    [email],
  )
  const emailIsInvalid = useMemo(
    () => email.length > 0 && !isValidEmail(email),
    [email],
  )
  const passwordTooShort =
    password.length > 0 && password.length < 6
  const passwordsMismatch =
    confirmPassword.length > 0 && password !== confirmPassword

  // ---- Login handler ----
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccess("")
    setLoading(true)
    try {
      const ok = await login(email, password)
      if (!ok) {
        setError(t.loginError)
      }
    } finally {
      setLoading(false)
    }
  }

  // ---- Register handler ----
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSuccess("")

    if (!isValidEmail(email)) {
      setError(t.invalidEmail)
      return
    }
    if (isDisposableEmail(email)) {
      setError(t.disposableEmail)
      return
    }
    if (password.length < 6) {
      setError(t.passwordTooShort)
      return
    }
    if (password !== confirmPassword) {
      setError(t.passwordMismatch)
      return
    }

    setLoading(true)
    try {
      const result = await register(email, password)
      if (result.success) {
        setSuccess(t.registerSuccess)
        setEmail("")
        setPassword("")
        setConfirmPassword("")
      } else {
        // Map common Supabase error messages to localized ones
        if (
          result.message
            .toLowerCase()
            .includes("already registered") ||
          result.message
            .toLowerCase()
            .includes("already been registered")
        ) {
          setError(t.emailExists)
        } else if (
          result.message === "Supabase not configured"
        ) {
          setError(t.supabaseNotConfigured)
        } else {
          setError(result.message)
        }
      }
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setError("")
    setSuccess("")
    await loginWithGoogle()
  }

  // Determine if the primary action button should be disabled
  const loginDisabled = loading || !email || !password
  const registerDisabled =
    loading ||
    !email ||
    !password ||
    !confirmPassword ||
    emailIsDisposable ||
    emailIsInvalid ||
    passwordTooShort ||
    passwordsMismatch

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
      style={{ background: "oklch(0.09 0.012 265)" }}
    >
      {/* Background gradient effects */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 80% 50% at 20% 0%, oklch(0.62 0.22 255 / 6%) 0%, transparent 60%),
            radial-gradient(ellipse 60% 40% at 80% 100%, oklch(0.55 0.25 290 / 5%) 0%, transparent 60%)
          `,
        }}
      />

      {/* Animated orbs */}
      <div
        className="absolute w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, oklch(0.5 0.2 255 / 4%) 0%, transparent 70%)",
          top: "-200px",
          left: "-100px",
          animation: "pulse 8s ease-in-out infinite",
        }}
      />
      <div
        className="absolute w-[400px] h-[400px] rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, oklch(0.5 0.2 290 / 3%) 0%, transparent 70%)",
          bottom: "-150px",
          right: "-50px",
          animation:
            "pulse 10s ease-in-out infinite reverse",
        }}
      />

      {/* Language toggle */}
      <button
        onClick={() =>
          setLang(lang === "zh-TW" ? "en" : "zh-TW")
        }
        className="absolute top-6 right-6 z-10 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
        style={{
          background: "oklch(1 0 0 / 5%)",
          border: "1px solid oklch(1 0 0 / 10%)",
          color: "oklch(0.7 0 0)",
        }}
      >
        {lang === "zh-TW" ? "EN" : "\u4e2d\u6587"}
      </button>

      {/* Card */}
      <div
        className="relative z-10 w-full max-w-md mx-4 rounded-2xl p-6 sm:p-8"
        style={{
          background: "oklch(0.13 0.012 265 / 80%)",
          backdropFilter: "blur(40px) saturate(1.5)",
          border: "1px solid oklch(1 0 0 / 8%)",
          boxShadow: `
            0 0 0 1px oklch(1 0 0 / 3%),
            0 20px 60px oklch(0 0 0 / 40%),
            0 0 80px oklch(0.5 0.2 255 / 5%),
            inset 0 1px 0 oklch(1 0 0 / 5%)
          `,
        }}
      >
        {/* Logo — uses unified /logos/app-logo.png */}
        <div className="flex flex-col items-center mb-6">
          <img
            src="/logos/app-logo.png"
            alt="AI Workbench"
            width={64}
            height={64}
            className="mb-4 rounded-2xl"
            style={{ boxShadow: "0 8px 32px oklch(0.5 0.2 255 / 30%)" }}
          />
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: "oklch(0.95 0 0)" }}
          >
            {t.title}
          </h1>
          <p
            className="text-sm mt-1"
            style={{ color: "oklch(0.55 0 0)" }}
          >
            {t.subtitle}
          </p>
        </div>

        {/* Tabs */}
        <div
          className="flex mb-6 rounded-xl p-1"
          style={{
            background: "oklch(0.1 0.008 265 / 60%)",
            border: "1px solid oklch(1 0 0 / 6%)",
          }}
        >
          {(["login", "register"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab)
                setError("")
                setSuccess("")
              }}
              className="flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-200"
              style={{
                background:
                  activeTab === tab
                    ? "linear-gradient(135deg, oklch(0.6 0.2 255 / 20%), oklch(0.55 0.25 290 / 20%))"
                    : "transparent",
                color:
                  activeTab === tab
                    ? "oklch(0.9 0 0)"
                    : "oklch(0.5 0 0)",
                border:
                  activeTab === tab
                    ? "1px solid oklch(0.6 0.2 255 / 25%)"
                    : "1px solid transparent",
              }}
            >
              {tab === "login"
                ? t.loginTab
                : t.registerTab}
            </button>
          ))}
        </div>

        {/* Error message */}
        {error && (
          <div
            className="mb-4 p-3 rounded-lg text-sm"
            style={{
              background: "oklch(0.4 0.15 25 / 15%)",
              border:
                "1px solid oklch(0.6 0.2 25 / 30%)",
              color: "oklch(0.75 0.12 25)",
            }}
          >
            {error}
          </div>
        )}

        {/* Success message */}
        {success && (
          <div
            className="mb-4 p-3 rounded-lg text-sm"
            style={{
              background: "oklch(0.4 0.15 145 / 15%)",
              border:
                "1px solid oklch(0.6 0.2 145 / 30%)",
              color: "oklch(0.75 0.12 145)",
            }}
          >
            {success}
          </div>
        )}

        {/* ============ LOGIN TAB ============ */}
        {activeTab === "login" && (
          <>
            <form
              onSubmit={handleLogin}
              className="space-y-4"
            >
              <div>
                <label
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: "oklch(0.6 0 0)" }}
                >
                  {t.email}
                </label>
                <input
                  type="text"
                  value={email}
                  onChange={(e) =>
                    setEmail(e.target.value)
                  }
                  placeholder={t.emailPlaceholder}
                  autoComplete="email"
                  className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                  style={inputStyle}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                />
              </div>

              <div>
                <label
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: "oklch(0.6 0 0)" }}
                >
                  {t.password}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) =>
                    setPassword(e.target.value)
                  }
                  placeholder={t.passwordPlaceholder}
                  autoComplete="current-password"
                  className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                  style={inputStyle}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                />
              </div>

              <button
                type="submit"
                disabled={loginDisabled}
                className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background:
                    "linear-gradient(135deg, oklch(0.6 0.2 255), oklch(0.55 0.25 290))",
                  color: "white",
                  boxShadow:
                    "0 4px 16px oklch(0.5 0.2 255 / 30%)",
                }}
                onMouseEnter={(e) => {
                  if (!loading)
                    e.currentTarget.style.transform =
                      "translateY(-1px)"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform =
                    "translateY(0)"
                }}
              >
                {loading ? "..." : t.login}
              </button>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-4 my-6">
              <div
                className="flex-1 h-px"
                style={{
                  background: "oklch(1 0 0 / 8%)",
                }}
              />
              <span
                className="text-xs"
                style={{ color: "oklch(0.45 0 0)" }}
              >
                {t.or}
              </span>
              <div
                className="flex-1 h-px"
                style={{
                  background: "oklch(1 0 0 / 8%)",
                }}
              />
            </div>

            {/* Google OAuth button */}
            <button
              onClick={handleGoogleLogin}
              className="w-full flex items-center justify-center gap-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer"
              style={{
                background: "oklch(0.97 0 0)",
                color: "oklch(0.3 0 0)",
                boxShadow:
                  "0 2px 8px oklch(0 0 0 / 15%)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background =
                  "oklch(0.93 0 0)"
                e.currentTarget.style.transform =
                  "translateY(-1px)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background =
                  "oklch(0.97 0 0)"
                e.currentTarget.style.transform =
                  "translateY(0)"
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 48 48"
              >
                <path
                  fill="#EA4335"
                  d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                />
                <path
                  fill="#4285F4"
                  d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                />
                <path
                  fill="#FBBC05"
                  d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                />
                <path
                  fill="#34A853"
                  d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                />
              </svg>
              {t.googleLogin}
            </button>

          </>
        )}

        {/* ============ REGISTER TAB ============ */}
        {activeTab === "register" && (
          <form
            onSubmit={handleRegister}
            className="space-y-4"
          >
            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: "oklch(0.6 0 0)" }}
              >
                {t.email}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t.emailPlaceholder}
                autoComplete="email"
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                style={inputStyle}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
              />
              {emailIsDisposable && (
                <p
                  className="text-xs mt-1.5"
                  style={{
                    color: "oklch(0.7 0.15 25)",
                  }}
                >
                  {t.disposableEmail}
                </p>
              )}
              {emailIsInvalid && !emailIsDisposable && (
                <p
                  className="text-xs mt-1.5"
                  style={{
                    color: "oklch(0.7 0.15 25)",
                  }}
                >
                  {t.invalidEmail}
                </p>
              )}
            </div>

            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: "oklch(0.6 0 0)" }}
              >
                {t.password}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) =>
                  setPassword(e.target.value)
                }
                placeholder={t.passwordPlaceholder}
                autoComplete="new-password"
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                style={inputStyle}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
              />
              <p
                className="text-xs mt-1.5"
                style={{
                  color: passwordTooShort
                    ? "oklch(0.7 0.15 25)"
                    : "oklch(0.45 0 0)",
                }}
              >
                {t.passwordHint}
              </p>
            </div>

            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: "oklch(0.6 0 0)" }}
              >
                {t.confirmPassword}
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) =>
                  setConfirmPassword(e.target.value)
                }
                placeholder={t.confirmPasswordPlaceholder}
                autoComplete="new-password"
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                style={inputStyle}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
              />
              {passwordsMismatch && (
                <p
                  className="text-xs mt-1.5"
                  style={{
                    color: "oklch(0.7 0.15 25)",
                  }}
                >
                  {t.passwordMismatch}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={registerDisabled}
              className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background:
                  "linear-gradient(135deg, oklch(0.6 0.2 255), oklch(0.55 0.25 290))",
                color: "white",
                boxShadow:
                  "0 4px 16px oklch(0.5 0.2 255 / 30%)",
              }}
              onMouseEnter={(e) => {
                if (!loading)
                  e.currentTarget.style.transform =
                    "translateY(-1px)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform =
                  "translateY(0)"
              }}
            >
              {loading ? "..." : t.register}
            </button>
          </form>
        )}
      </div>

      {/* Footer */}
      <p
        className="mt-8 text-xs relative z-10"
        style={{ color: "oklch(0.35 0 0)" }}
      >
        {t.footer}
      </p>

      {/* Pulse animation keyframe */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.05); }
        }
      `}</style>
    </div>
  )
}
