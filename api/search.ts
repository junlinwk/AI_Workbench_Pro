export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    return res.status(405).json({ results: [], error: "Method not allowed" })
  }

  const query = (
    (typeof req.query.q === "string" ? req.query.q : "") || ""
  )
    .trim()
    .slice(0, 500)
  if (!query) return res.json({ results: [] })

  try {
    const results: { title: string; snippet: string; url: string }[] = []

    // DuckDuckGo instant answer API
    const ddgRes = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; AIWorkbench/1.0)",
        },
        signal: AbortSignal.timeout(10000),
      },
    )
    if (ddgRes.ok) {
      const ddg = (await ddgRes.json()) as any
      if (ddg.AbstractText)
        results.push({
          title: ddg.Heading || query,
          snippet: ddg.AbstractText,
          url: ddg.AbstractURL || "",
        })
      if (ddg.Answer)
        results.push({
          title: "Direct Answer",
          snippet: ddg.Answer,
          url: "",
        })
      if (ddg.RelatedTopics) {
        for (const topic of ddg.RelatedTopics.slice(0, 6)) {
          if (topic.Text)
            results.push({
              title:
                topic.FirstURL?.split("/")
                  .pop()
                  ?.replace(/_/g, " ") || "",
              snippet: topic.Text,
              url: topic.FirstURL || "",
            })
          if (topic.Topics)
            for (const sub of topic.Topics.slice(0, 3)) {
              if (sub.Text)
                results.push({
                  title:
                    sub.FirstURL?.split("/")
                      .pop()
                      ?.replace(/_/g, " ") || "",
                  snippet: sub.Text,
                  url: sub.FirstURL || "",
                })
            }
        }
      }
    }

    // Wikipedia summary
    const wikiRes = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`,
      {
        headers: { "User-Agent": "AIWorkbench/1.0" },
        signal: AbortSignal.timeout(10000),
      },
    )
    if (wikiRes.ok) {
      const wiki = (await wikiRes.json()) as any
      if (wiki.extract && wiki.extract.length > 50)
        results.push({
          title: `Wikipedia: ${wiki.title || query}`,
          snippet: wiki.extract,
          url: wiki.content_urls?.desktop?.page || "",
        })
    }

    res.json({ results: results.slice(0, 10) })
  } catch (err: any) {
    console.error("Search proxy error:", err.message)
    res.json({ results: [], error: "Search failed" })
  }
}
