/**
 * POST /api/keys/delete — Remove a stored API key.
 * Body: { provider: string }
 */
import { getAuthenticatedUserId, getServiceSupabase } from "../_lib/auth"

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
