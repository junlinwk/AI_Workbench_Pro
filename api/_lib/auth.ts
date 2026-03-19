/**
 * Server-side Supabase auth helper for Vercel API routes.
 *
 * Uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (server-only env vars)
 * to validate the client's JWT and perform DB operations that bypass RLS.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let serviceClient: SupabaseClient | null = null

/**
 * Get a Supabase client with the service role key (bypasses RLS).
 * Only use server-side!
 */
export function getServiceSupabase(): SupabaseClient {
  if (serviceClient) return serviceClient

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
  }

  serviceClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return serviceClient
}

/**
 * Validate the Authorization header and return the authenticated user ID.
 * Expects `Authorization: Bearer <supabase-access-token>`.
 */
export async function getAuthenticatedUserId(
  authHeader: string | string[] | undefined,
): Promise<string | null> {
  if (!authHeader || typeof authHeader !== "string") return null
  const token = authHeader.replace(/^Bearer\s+/i, "").trim()
  if (!token) return null

  try {
    const supabase = getServiceSupabase()
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data?.user) return null
    return data.user.id
  } catch {
    return null
  }
}
