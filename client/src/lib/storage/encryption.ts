/**
 * API key encryption/obfuscation
 *
 * - Online: calls Supabase Edge Function for AES-256-GCM encryption
 * - Offline: falls back to XOR obfuscation with device fingerprint
 */
import { getSupabase, isSupabaseConfigured } from "../supabase"

// ---------------------------------------------------------------------------
//  XOR obfuscation (local fallback — same as original SettingsContext)
// ---------------------------------------------------------------------------

function deriveKeyBytes(): number[] {
  const seed =
    (typeof navigator !== "undefined" ? navigator.userAgent : "") +
    (typeof screen !== "undefined"
      ? `${screen.width}x${screen.height}`
      : "")
  const bytes: number[] = []
  for (let i = 0; i < seed.length && bytes.length < 32; i++) {
    bytes.push(seed.charCodeAt(i) & 0xff)
  }
  while (bytes.length < 32) bytes.push(0x42)
  return bytes
}

export function obfuscateKey(plain: string): string {
  try {
    const keyBytes = deriveKeyBytes()
    const encoded = new TextEncoder().encode(plain)
    const encrypted = new Uint8Array(encoded.length)
    for (let i = 0; i < encoded.length; i++) {
      encrypted[i] = encoded[i] ^ keyBytes[i % keyBytes.length]
    }
    return "enc2:" + btoa(String.fromCharCode(...encrypted))
  } catch {
    return plain
  }
}

export function deobfuscateKey(stored: string): string {
  try {
    if (stored.startsWith("enc2:")) {
      const keyBytes = deriveKeyBytes()
      const raw = atob(stored.slice(5))
      const bytes = new Uint8Array(raw.length)
      for (let i = 0; i < raw.length; i++) {
        bytes[i] = raw.charCodeAt(i) ^ keyBytes[i % keyBytes.length]
      }
      return new TextDecoder().decode(bytes)
    }
    // Legacy enc1: base64
    if (stored.startsWith("enc1:")) {
      return decodeURIComponent(escape(atob(stored.slice(5))))
    }
    // Plaintext legacy
    return stored
  } catch {
    return stored
  }
}

export function obfuscateKeys(
  keys: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(keys)) {
    out[k] = obfuscateKey(v)
  }
  return out
}

export function deobfuscateKeys(
  keys: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(keys)) {
    out[k] = deobfuscateKey(v)
  }
  return out
}

// ---------------------------------------------------------------------------
//  Server-side encryption via Supabase Edge Function (when available)
// ---------------------------------------------------------------------------

/**
 * Encrypt API keys using Supabase Edge Function (AES-256-GCM).
 * Falls back to local XOR obfuscation if Edge Function is unavailable.
 */
export async function encryptKeysRemote(
  keys: Record<string, string>,
): Promise<string> {
  const supabase = getSupabase()
  if (!supabase || !isSupabaseConfigured()) {
    // Fallback: local obfuscation, serialised as JSON
    return JSON.stringify(obfuscateKeys(keys))
  }

  try {
    const { data, error } = await supabase.functions.invoke(
      "encrypt-keys",
      {
        body: { keys },
      },
    )
    if (error) throw error
    return data.encrypted as string
  } catch {
    // Fallback to local
    return JSON.stringify(obfuscateKeys(keys))
  }
}

/**
 * Decrypt API keys using Supabase Edge Function.
 * Falls back to local XOR deobfuscation.
 */
export async function decryptKeysRemote(
  encrypted: string,
): Promise<Record<string, string>> {
  // Check if it's locally obfuscated JSON
  try {
    const parsed = JSON.parse(encrypted)
    if (typeof parsed === "object" && parsed !== null) {
      return deobfuscateKeys(parsed)
    }
  } catch {}

  const supabase = getSupabase()
  if (!supabase || !isSupabaseConfigured()) {
    return {}
  }

  try {
    const { data, error } = await supabase.functions.invoke(
      "decrypt-keys",
      {
        body: { encrypted },
      },
    )
    if (error) throw error
    return (data.keys as Record<string, string>) ?? {}
  } catch {
    return {}
  }
}
