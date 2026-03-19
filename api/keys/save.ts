/**
 * POST /api/keys/save — Store an encrypted API key server-side.
 * Body: { provider: string, key: string }
 * Returns: { success: true, provider, prefix }
 * The raw key is NEVER returned.
 */
import { getAuthenticatedUserId, getServiceSupabase } from "../_lib/auth"
import { encryptApiKey } from "../_lib/encryption"

const VALID_PROVIDERS = new Set([
  "openai", "anthropic", "google", "deepseek",
  "xai", "groq", "meta", "mistral", "openrouter",
])

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const userId = await getAuthenticatedUserId(req.headers.authorization)
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" })
  }

  const { provider, key } = req.body || {}
  if (!provider || typeof provider !== "string" || !VALID_PROVIDERS.has(provider)) {
    return res.status(400).json({ error: "Invalid provider" })
  }
  if (!key || typeof key !== "string" || key.length < 5 || key.length > 500) {
    return res.status(400).json({ error: "Invalid API key" })
  }

  try {
    const { ciphertext, iv } = encryptApiKey(key)
    const prefix = key.slice(0, 4) + "…"

    const supabase = getServiceSupabase()
    const { error } = await supabase
      .from("user_api_keys")
      .upsert(
        {
          user_id: userId,
          provider,
          encrypted_key: ciphertext.toString("base64"),
          iv: iv.toString("base64"),
          key_prefix: prefix,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,provider" },
      )

    if (error) {
      console.error("[keys/save] DB error:", error.message)
      return res.status(500).json({ error: "Failed to save key" })
    }

    return res.status(200).json({ success: true, provider, prefix })
  } catch (err: any) {
    console.error("[keys/save] Error:", err.message)
    return res.status(500).json({ error: "Internal error" })
  }
}
