/**
 * `prepareAttachment` — the single entry point the chat composer should use
 * to turn a browser File into a provider-ready AttachedFile.
 *
 * Routing rules:
 *   - PDF + model with native PDF support      -> handling "native" (base64)
 *   - PDF + any other model                    -> handling "text"   (pdf.js)
 *   - text/code file                           -> handling "text"
 *   - anything else                            -> throw
 *
 * Images should NOT pass through this helper; they flow through the
 * existing image-upload path which uses ContentPart.image directly.
 */

import { extractPdfText } from "./pdfExtract"
import { extractTextFile } from "./textExtract"
import {
  isTextFile,
  supportsNativePdf,
  type AttachedFile,
} from "./types"

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== "string") {
        reject(new Error("Unexpected FileReader result"))
        return
      }
      const comma = result.indexOf(",")
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () =>
      reject(reader.error ?? new Error("FileReader error"))
    reader.readAsDataURL(file)
  })
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export async function prepareAttachment(
  file: File,
  modelId: string,
  maxSizeMB: number,
): Promise<AttachedFile> {
  const maxBytes = maxSizeMB * 1024 * 1024
  if (file.size > maxBytes) {
    throw new Error(
      `File too large: ${formatBytes(file.size)} exceeds limit of ${maxSizeMB} MB`,
    )
  }

  const mime = (file.type || "").toLowerCase()

  if (mime === "application/pdf") {
    const base64 = await fileToBase64(file)
    if (supportsNativePdf(modelId)) {
      return {
        base64,
        mimeType: "application/pdf",
        name: file.name,
        size: file.size,
        handling: "native",
      }
    }
    const extractedText = await extractPdfText(file)
    return {
      base64,
      mimeType: "application/pdf",
      name: file.name,
      size: file.size,
      handling: "text",
      extractedText,
    }
  }

  if (isTextFile(file)) {
    const extractedText = await extractTextFile(file)
    const base64 = await fileToBase64(file)
    return {
      base64,
      mimeType: mime || "text/plain",
      name: file.name,
      size: file.size,
      handling: "text",
      extractedText,
    }
  }

  throw new Error(
    `Unsupported file type: ${mime || "unknown"} (${file.name})`,
  )
}
