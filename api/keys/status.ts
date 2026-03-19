/**
 * GET /api/keys/status — List which providers have saved keys.
 * Returns: { keys: [{ provider, prefix, updatedAt }] }
 * NEVER returns the actual key values.
 */
import { getAuthenticatedUserId, getServiceSupabase } from "../_lib/auth"

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const userId = await getAuthenticatedUserId(req.headers.authorization)
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" })
  }

  try {
    const supabase = getServiceSupabase()
    const { data, error } = await supabase
      .from("user_api_keys")
      .select("provider, key_prefix, updated_at")
      .eq("user_id", userId)

    if (error) {
      console.error("[keys/status] DB error:", error.message)
      return res.status(500).json({ error: "Failed to fetch key status" })
    }

    const keys = (data || []).map((row: any) => ({
      provider: row.provider,
      prefix: row.key_prefix,
      updatedAt: row.updated_at,
    }))

    return res.status(200).json({ keys })
  } catch (err: any) {
    console.error("[keys/status] Error:", err.message)
    return res.status(500).json({ error: "Internal error" })
  }
}
