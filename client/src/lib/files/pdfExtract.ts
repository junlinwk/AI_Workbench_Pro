/**
 * Client-side PDF text extraction via pdfjs-dist.
 *
 * pdfjs is lazy-loaded so the main bundle does not pay for it until a user
 * actually attaches a PDF. The worker is resolved through Vite's `?url`
 * suffix so it ships as a hashed asset at build time.
 */

const MAX_CHARS = 100_000

let workerConfigured = false

async function configureWorker(pdfjs: {
  GlobalWorkerOptions: { workerSrc: string }
}): Promise<void> {
  if (workerConfigured) return
  const workerUrl = (
    await import("pdfjs-dist/build/pdf.worker.mjs?url")
  ).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  workerConfigured = true
}

export async function extractPdfText(file: File | Blob): Promise<string> {
  try {
    const pdfjs = await import("pdfjs-dist")
    await configureWorker(pdfjs)

    const arrayBuffer = await file.arrayBuffer()
    const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise

    const pages: string[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const textContent = await page.getTextContent()
      const text = textContent.items
        .map((item: unknown) => {
          const rec = item as { str?: unknown }
          return typeof rec.str === "string" ? rec.str : ""
        })
        .join(" ")
      pages.push(`--- Page ${i} ---\n\n${text}`)
    }

    const joined = pages.join("\n\n")
    return joined.length > MAX_CHARS
      ? joined.slice(0, MAX_CHARS) + "\n\n[... truncated ...]"
      : joined
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`PDF text extraction failed: ${msg}`)
  }
}
