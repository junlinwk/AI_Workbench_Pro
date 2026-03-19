// ─── Audio transcription proxy (Groq Whisper) — server-side key injection ───

import type { IncomingMessage, ServerResponse } from "http"
import { getAuthenticatedUserId, getServiceSupabase } from "../_lib/auth"
import { decryptApiKey } from "../_lib/encryption"

interface VercelReq extends IncomingMessage {
  body?: any
  method?: string
  headers: Record<string, string | string[] | undefined>
}

const buckets = new Map<string, { count: number; resetAt: number }>()
function rateLimit(ip: string, windowMs: number, max: number): boolean {
  const now = Date.now()
  const b = buckets.get(ip)
  if (!b || now > b.resetAt) {
    buckets.set(ip, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (b.count >= max) return false
  b.count++
  return true
}

function getIp(headers: Record<string, string | string[] | undefined>): string {
  const fwd = headers["x-forwarded-for"]
  if (typeof fwd === "string") return fwd.split(",")[0]?.trim() || "unknown"
  return "unknown"
}

async function getStoredGroqKey(userId: string): Promise<string | null> {
  try {
    const supabase = getServiceSupabase()
    for (const provider of ["groq", "meta"]) {
      const { data, error } = await supabase
        .from("user_api_keys")
        .select("encrypted_key, iv")
        .eq("user_id", userId)
        .eq("provider", provider)
        .single()
      if (!error && data) {
        const ciphertext = Buffer.from(data.encrypted_key, "base64")
        const iv = Buffer.from(data.iv, "base64")
        return decryptApiKey(ciphertext, iv)
      }
    }
    return null
  } catch {
    return null
  }
}

export default async function handler(req: VercelReq, res: ServerResponse & { status: (code: number) => any; json: (data: any) => void; send: (data: any) => void; setHeader: (k: string, v: string) => void }) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const ip = getIp(req.headers)
  if (!rateLimit(ip, 60_000, 20)) {
    return res.status(429).json({ error: "Rate limited" })
  }

  const { audio, apiKey: legacyKey } = req.body || {}
  if (!audio) {
    return res.status(400).json({ error: "Missing audio" })
  }

  // Resolve API key: prefer server-side stored key, fall back to legacy
  let resolvedKey = legacyKey
  const userId = await getAuthenticatedUserId(req.headers.authorization)
  if (userId) {
    const storedKey = await getStoredGroqKey(userId)
    if (storedKey) resolvedKey = storedKey
  }

  if (!resolvedKey) {
    return res.status(400).json({ error: "No Groq API key available" })
  }

  try {
    const buffer = Buffer.from(audio, "base64")
    const boundary = "----AudioBoundary" + Date.now()
    const parts: Buffer[] = []

    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="recording.webm"\r\nContent-Type: audio/webm\r\n\r\n`,
      ),
    )
    parts.push(buffer)
    parts.push(Buffer.from("\r\n"))
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-large-v3-turbo\r\n`,
      ),
    )
    parts.push(Buffer.from(`--${boundary}--\r\n`))

    const body = Buffer.concat(parts)

    const groqRes = await fetch(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resolvedKey}`,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
        body,
      },
    )

    if (!groqRes.ok) {
      const errText = await groqRes.text().catch(() => "")
      return res.status(groqRes.status).json({ error: errText.slice(0, 200) })
    }

    const data = await groqRes.json()
    return res.status(200).json({ text: data.text || "" })
  } catch (err: any) {
    return res.status(500).json({ error: err.message?.slice(0, 200) || "Internal error" })
  }
}
