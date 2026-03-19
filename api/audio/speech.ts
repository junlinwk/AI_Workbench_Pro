// ─── Text-to-speech proxy (Groq TTS) — server-side key injection ──────────
import type { IncomingMessage, ServerResponse } from "http"
import { createClient } from "@supabase/supabase-js"
import { createDecipheriv, createHash } from "crypto"

interface VercelReq extends IncomingMessage {
  body?: any
  method?: string
  headers: Record<string, string | string[] | undefined>
}

// ── Inline helpers ──

function getServiceSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Missing Supabase config")
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

async function getStoredGroqKey(userId: string): Promise<string | null> {
  try {
    const supabase = getServiceSupabase()
    for (const provider of ["groq", "meta"]) {
      const { data, error } = await supabase
        .from("user_api_keys").select("encrypted_key, iv")
        .eq("user_id", userId).eq("provider", provider).single()
      if (!error && data) {
        const secret = process.env.API_KEY_ENCRYPTION_SECRET
        if (!secret) return null
        const key = createHash("sha256").update(secret).digest()
        const ct = Buffer.from(data.encrypted_key, "base64")
        const iv = Buffer.from(data.iv, "base64")
        const encrypted = ct.subarray(0, ct.length - 16)
        const tag = ct.subarray(ct.length - 16)
        const decipher = createDecipheriv("aes-256-gcm", key, iv)
        decipher.setAuthTag(tag)
        return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8")
      }
    }
    return null
  } catch { return null }
}

// ── Rate limiter ──

const buckets = new Map<string, { count: number; resetAt: number }>()
function rateLimit(ip: string, windowMs: number, max: number): boolean {
  const now = Date.now()
  const b = buckets.get(ip)
  if (!b || now > b.resetAt) { buckets.set(ip, { count: 1, resetAt: now + windowMs }); return true }
  if (b.count >= max) return false
  b.count++; return true
}

function getIp(headers: Record<string, string | string[] | undefined>): string {
  const fwd = headers["x-forwarded-for"]
  if (typeof fwd === "string") return fwd.split(",")[0]?.trim() || "unknown"
  return "unknown"
}

// ── Handler ──

export default async function handler(req: VercelReq, res: ServerResponse & { status: (code: number) => any; json: (data: any) => void; send: (data: any) => void; setHeader: (k: string, v: string) => void }) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })

  const ip = getIp(req.headers)
  if (!rateLimit(ip, 60_000, 20)) return res.status(429).json({ error: "Rate limited" })

  const { text, apiKey: legacyKey, voice } = req.body || {}
  if (!text) return res.status(400).json({ error: "Missing text" })

  let resolvedKey = legacyKey
  const userId = await getAuthenticatedUserId(req.headers.authorization)
  if (userId) {
    const storedKey = await getStoredGroqKey(userId)
    if (storedKey) resolvedKey = storedKey
  }
  if (!resolvedKey) return res.status(400).json({ error: "No Groq API key available" })

  try {
    const groqRes = await fetch("https://api.groq.com/openai/v1/audio/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resolvedKey}` },
      body: JSON.stringify({ model: "playai-tts", input: String(text).slice(0, 4096), voice: voice || "Arista-PlayAI", response_format: "wav" }),
    })
    if (!groqRes.ok) {
      const errText = await groqRes.text().catch(() => "")
      return res.status(groqRes.status).json({ error: errText.slice(0, 200) })
    }
    const audioBuffer = await groqRes.arrayBuffer()
    res.setHeader("Content-Type", "audio/wav")
    return res.status(200).send(Buffer.from(audioBuffer))
  } catch (err: any) {
    return res.status(500).json({ error: err.message?.slice(0, 200) || "Internal error" })
  }
}
