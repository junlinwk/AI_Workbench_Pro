/**
 * UTF-8 text file reader with a hard length cap so a stray 50MB log
 * cannot blow up the prompt budget.
 */

const MAX_CHARS = 100_000

export async function extractTextFile(file: File): Promise<string> {
  try {
    const text = await file.text()
    return text.length > MAX_CHARS
      ? text.slice(0, MAX_CHARS) + "\n\n[... truncated ...]"
      : text
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`Text file read failed: ${msg}`)
  }
}
