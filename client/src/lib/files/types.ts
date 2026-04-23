/**
 * File-attachment types and capability tables.
 *
 * `AttachedFile` is the normalized shape produced by `prepareAttachment`
 * and consumed by the chat composer. `handling` tells the caller how to
 * splice the file into a ChatMessage: "native" becomes a ContentPart file
 * (provider converts to document/inline_data), "text" is flattened into a
 * text part using `extractedText`.
 */

export interface AttachedFile {
  base64: string
  mimeType: string
  name: string
  size: number
  handling: "native" | "text"
  extractedText?: string
}

/**
 * Models with native PDF ingestion. Anthropic Claude 4.x document blocks
 * and Google Gemini inline_data both accept application/pdf directly.
 */
export const NATIVE_PDF_MODELS: Set<string> = new Set([
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite-preview",
  "anthropic/claude-opus-4-6",
  "anthropic/claude-sonnet-4-6",
  "anthropic/claude-haiku-4-5",
  "google/gemini-2.5-pro",
])

export const TEXT_MIME_PREFIXES: readonly string[] = [
  "text/",
  "application/json",
  "application/xml",
  "application/x-yaml",
  "application/yaml",
  "application/toml",
  "application/x-sh",
  "application/javascript",
  "application/typescript",
  "application/sql",
]

export const CODE_EXTENSIONS: readonly string[] = [
  "ts",
  "tsx",
  "js",
  "jsx",
  "py",
  "go",
  "rs",
  "java",
  "c",
  "cpp",
  "h",
  "css",
  "html",
  "md",
  "yaml",
  "yml",
  "toml",
  "sh",
  "sql",
]

export function supportsNativePdf(modelId: string): boolean {
  return NATIVE_PDF_MODELS.has(modelId)
}

export function isTextFile(file: File): boolean {
  const mime = (file.type || "").toLowerCase()
  if (mime) {
    for (const prefix of TEXT_MIME_PREFIXES) {
      if (mime === prefix || mime.startsWith(prefix)) return true
    }
  }
  const name = file.name.toLowerCase()
  const dot = name.lastIndexOf(".")
  if (dot === -1) return false
  const ext = name.slice(dot + 1)
  return CODE_EXTENSIONS.includes(ext)
}
