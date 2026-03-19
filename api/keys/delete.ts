/**
 * POST /api/keys/delete — Remove a stored API key.
 * Body: { provider: string }
 */
import { createClient } from "@supabase/supabase-js"

function getServiceSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function getAuthenticatedUserId(authHeader: string | string[] | undefined): Promise<string | null> {
  if (!authHeader || typeof authHeader !== "string") return null
  const token = authHeader.replace(/^Bearer\s+/i, "").trim()
  if (!token) return null
  try {
    const supabase = getServiceSupabase()
    const { data, error } = await (supabase.auth as any).getUser(token)
    if (error || !data?.user) return null
    return data.user.id
  } catch { return null }
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const userId = await getAuthenticatedUserId(req.headers.authorization)
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" })
  }

  const { provider } = req.body || {}
  if (!provider || typeof provider !== "string") {
    return res.status(400).json({ error: "Invalid provider" })
  }

  try {
    const supabase = getServiceSupabase()
    const { error } = await supabase
      .from("user_api_keys")
      .delete()
      .eq("user_id", userId)
      .eq("provider", provider)

    if (error) {
      console.error("[keys/delete] DB error:", error.message)
      return res.status(500).json({ error: "Failed to delete key" })
    }

    return res.status(200).json({ success: true })
  } catch (err: any) {
    console.error("[keys/delete] Error:", err.message)
    return res.status(500).json({ error: "Internal error" })
  }
}
