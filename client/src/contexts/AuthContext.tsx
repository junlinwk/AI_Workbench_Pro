/**
 * AuthContext — Authentication state management
 * Supports:
 *  - Supabase OAuth (Google, GitHub, etc.) when configured
 *  - Demo account login as fallback
 *  - Legacy localStorage auth for backward compatibility
 *
 * Persists auth state via Supabase session or localStorage fallback
 */
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react"
import { toast } from "sonner"
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase"
import { initStorage, resetStorage } from "@/lib/storage"

export interface AuthUser {
  id: string
  username: string
  email: string
  avatar: string
  provider: "local" | "google" | "supabase"
}

interface AuthContextType {
  user: AuthUser | null
  isAuthenticated: boolean
  isAdmin: boolean
  isLoading: boolean
  login: (username: string, password: string) => Promise<boolean>
  loginWithGoogle: () => Promise<void>
  register: (
    email: string,
    password: string,
  ) => Promise<{ success: boolean; message: string }>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const AUTH_STORAGE_KEY = "ai-workbench-auth"

const DEMO_USER: AuthUser = {
  id: "demo-user-001",
  username: "demo",
  email: "demo@ai-workbench.local",
  avatar: "",
  provider: "local",
}

// ---------------------------------------------------------------------------
//  localStorage fallback helpers (used when Supabase is not configured)
// ---------------------------------------------------------------------------

function loadAuthState(): AuthUser | null {
  try {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch {}
  return null
}

function saveAuthState(user: AuthUser | null) {
  try {
    if (user) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user))
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY)
    }
  } catch {}
}

export function AuthProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Initialize auth — check Supabase session or localStorage
  useEffect(() => {
    let cancelled = false

    async function init() {
      const supabase = getSupabase()

      if (supabase) {
        // Supabase mode: check existing session
        try {
          const {
            data: { session },
          } = await supabase.auth.getSession()

          if (session?.user && !cancelled) {
            const authUser: AuthUser = {
              id: session.user.id,
              username:
                session.user.user_metadata?.full_name ??
                session.user.email ??
                "User",
              email: session.user.email ?? "",
              avatar:
                session.user.user_metadata?.avatar_url ?? "",
              provider: "supabase",
            }
            setUser(authUser)
            // Initialize storage with Supabase user ID
            await initStorage(authUser.id)
          }
        } catch {}

        // Listen for auth state changes
        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange(
          async (_event, session) => {
            if (cancelled) return
            if (session?.user) {
              const authUser: AuthUser = {
                id: session.user.id,
                username:
                  session.user.user_metadata?.full_name ??
                  session.user.email ??
                  "User",
                email: session.user.email ?? "",
                avatar:
                  session.user.user_metadata?.avatar_url ?? "",
                provider: "supabase",
              }
              setUser(authUser)
              await initStorage(authUser.id)
            } else {
              setUser(null)
              await resetStorage()
            }
          },
        )

        if (!cancelled) setIsLoading(false)
        return () => {
          cancelled = true
          subscription.unsubscribe()
        }
      } else {
        // Fallback: localStorage auth
        const stored = loadAuthState()
        if (stored && !cancelled) {
          setUser(stored)
          await initStorage(stored.id)
        }
        if (!cancelled) setIsLoading(false)
      }
    }

    init()
    return () => {
      cancelled = true
    }
  }, [])

  // Persist auth state changes (localStorage fallback)
  useEffect(() => {
    if (!isSupabaseConfigured()) {
      saveAuthState(user)
    }
  }, [user])

  const login = useCallback(
    async (
      username: string,
      password: string,
    ): Promise<boolean> => {
      const supabase = getSupabase()

      if (supabase) {
        // Supabase email/password auth
        try {
          const { data, error } =
            await supabase.auth.signInWithPassword({
              email: username,
              password,
            })
          if (error) {
            // Fall back to demo check
            if (
              username === "demo" &&
              password === "demo"
            ) {
              setUser(DEMO_USER)
              await initStorage(DEMO_USER.id)
              return true
            }
            return false
          }
          if (data.user) {
            const authUser: AuthUser = {
              id: data.user.id,
              username:
                data.user.user_metadata?.full_name ??
                data.user.email ??
                username,
              email: data.user.email ?? "",
              avatar:
                data.user.user_metadata?.avatar_url ?? "",
              provider: "supabase",
            }
            setUser(authUser)
            await initStorage(authUser.id)
            return true
          }
          return false
        } catch {
          // Network error — try demo fallback
          if (username === "demo" && password === "demo") {
            setUser(DEMO_USER)
            await initStorage(DEMO_USER.id)
            return true
          }
          return false
        }
      }

      // No Supabase — demo account check
      if (username === "demo" && password === "demo") {
        setUser(DEMO_USER)
        await initStorage(DEMO_USER.id)
        return true
      }
      return false
    },
    [],
  )

  const loginWithGoogle = useCallback(async () => {
    const supabase = getSupabase()

    if (supabase) {
      // Supabase Google OAuth
      try {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: window.location.origin,
          },
        })
        if (error) {
          toast.error("Google login failed", {
            description: error.message,
          })
        }
        // Auth state change listener will handle the rest
      } catch (err) {
        toast.error("Google login failed", {
          description: String(err),
        })
      }
      return
    }

    // Fallback: legacy Google Identity Services flow
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID

    if (
      !clientId ||
      clientId === "YOUR_GOOGLE_CLIENT_ID_HERE"
    ) {
      toast.error("Configure Google Client ID in .env", {
        description:
          "Set VITE_GOOGLE_CLIENT_ID or configure Supabase to enable Google OAuth.",
        duration: 4000,
      })
      return
    }

    try {
      if (!(window as any).google?.accounts?.id) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script")
          script.src =
            "https://accounts.google.com/gsi/client"
          script.async = true
          script.defer = true
          script.onload = () => resolve()
          script.onerror = () =>
            reject(
              new Error(
                "Failed to load Google Identity Services",
              ),
            )
          document.head.appendChild(script)
        })
      }

      const google = (window as any).google
      google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response: any) => {
          try {
            const payload = JSON.parse(
              atob(response.credential.split(".")[1]),
            )
            const googleUser: AuthUser = {
              id: `google-${payload.sub}`,
              username:
                payload.name || payload.email,
              email: payload.email,
              avatar: payload.picture || "",
              provider: "google",
            }
            setUser(googleUser)
            await initStorage(googleUser.id)
          } catch {
            toast.error("Google login failed")
          }
        },
      })

      google.accounts.id.prompt(
        (notification: any) => {
          if (
            notification.isNotDisplayed() ||
            notification.isSkippedMoment()
          ) {
            toast.error(
              "Google sign-in popup was blocked. Please allow popups.",
            )
          }
        },
      )
    } catch (err) {
      toast.error("Google login failed", {
        description: String(err),
      })
    }
  }, [])

  const register = useCallback(
    async (
      email: string,
      password: string,
    ): Promise<{
      success: boolean
      message: string
    }> => {
      const supabase = getSupabase()
      if (!supabase) {
        return {
          success: false,
          message: "Supabase not configured",
        }
      }
      try {
        const { data, error } =
          await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: window.location.origin,
            },
          })
        if (error) {
          return {
            success: false,
            message: error.message,
          }
        }
        // Supabase returns an empty identities array when the
        // email is already registered (with email confirmation on)
        if (data.user?.identities?.length === 0) {
          return {
            success: false,
            message: "Email already registered",
          }
        }
        return {
          success: true,
          message: "Verification email sent",
        }
      } catch (err) {
        return {
          success: false,
          message: String(err),
        }
      }
    },
    [],
  )

  const logout = useCallback(async () => {
    const supabase = getSupabase()
    if (supabase) {
      await supabase.auth.signOut()
    }
    setUser(null)
    await resetStorage()

    // Also clear localStorage auth
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY)
    } catch {}
  }, [])

  const adminEmail = import.meta.env.VITE_ADMIN_EMAIL ?? ""
  const isAdmin =
    !!user?.email &&
    !!adminEmail &&
    user.email.toLowerCase() === adminEmail.toLowerCase()

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isAdmin,
        isLoading,
        login,
        loginWithGoogle,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx)
    throw new Error(
      "useAuth must be used within AuthProvider",
    )
  return ctx
}
