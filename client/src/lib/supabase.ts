/**
 * Supabase client singleton
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? ""
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ""

let client: SupabaseClient | null = null

/**
 * Returns the Supabase client, or null if env vars are not configured.
 */
export function getSupabase(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null

  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  }
  return client
}

/**
 * Check if Supabase is configured
 */
export function isSupabaseConfigured(): boolean {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY)
}

/**
 * Get the current Supabase access token for authenticated API calls.
 * Returns null if not logged in or Supabase is not configured.
 */
export async function getAuthToken(): Promise<string | null> {
  const sb = getSupabase()
  if (!sb) return null
  try {
    const { data } = await sb.auth.getSession()
    return data.session?.access_token ?? null
  } catch {
    return null
  }
}
