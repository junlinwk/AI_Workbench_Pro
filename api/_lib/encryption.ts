/**
 * Server-side AES-256-GCM encryption for API keys.
 *
 * The encryption secret comes from the env var API_KEY_ENCRYPTION_SECRET
 * (set in Vercel dashboard / .env — never exposed to the client).
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto"

const ALGO = "aes-256-gcm"
const IV_BYTES = 12
const TAG_BYTES = 16

function deriveKey(): Buffer {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET
  if (!secret) throw new Error("API_KEY_ENCRYPTION_SECRET is not set")
  return createHash("sha256").update(secret).digest()
}

/**
 * Encrypt a plaintext API key.
 * Returns ciphertext (with appended auth tag) and a random IV.
 */
export function encryptApiKey(plaintext: string): { ciphertext: Buffer; iv: Buffer } {
  const key = deriveKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGO, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  // Append the 16-byte auth tag to ciphertext for storage
  return { ciphertext: Buffer.concat([encrypted, tag]), iv }
}

/**
 * Decrypt an API key from ciphertext (with appended auth tag) and IV.
 */
export function decryptApiKey(ciphertext: Buffer, iv: Buffer): string {
  const key = deriveKey()
  // Last 16 bytes are the auth tag
  const encrypted = ciphertext.subarray(0, ciphertext.length - TAG_BYTES)
  const tag = ciphertext.subarray(ciphertext.length - TAG_BYTES)
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8")
}
