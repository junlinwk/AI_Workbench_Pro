/**
 * POST /api/keys/save — Store an encrypted API key server-side.
 * Body: { provider: string, key: string }
 * Returns: { success: true, provider, prefix }
 * The raw key is NEVER returned.
 */
import { createClient } from "@supabase/supabase-js"
import { createCipheriv, createHash, randomBytes } from "crypto"

// ── Inline auth helper ──
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

// ── Inline encryption helper ──
function encryptApiKey(plaintext: string): { ciphertext: Buffer; iv: Buffer } {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET
  if (!secret) throw new Error("API_KEY_ENCRYPTION_SECRET is not set")
  const key = createHash("sha256").update(secret).digest()
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return { ciphertext: Buffer.concat([encrypted, tag]), iv }
}

// ── Valid providers ──
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
    return res.status(500).json({ error: err.message || "Internal error" })
  }
}
