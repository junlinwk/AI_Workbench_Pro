import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Rate limiter (in-memory, per-IP) ────────────────────────────────────
interface RateBucket {
  count: number;
  resetAt: number;
}
const rateBuckets = new Map<string, RateBucket>();

function rateLimit(
  ip: string,
  windowMs: number,
  maxRequests: number,
): boolean {
  const now = Date.now();
  const key = ip;
  const bucket = rateBuckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (bucket.count >= maxRequests) {
    return false;
  }

  bucket.count++;
  return true;
}

// Clean stale buckets every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (now > bucket.resetAt) rateBuckets.delete(key);
  }
}, 5 * 60 * 1000);

// ─── SSRF protection: block private/reserved IP ranges ──────────────────
function isPrivateOrReserved(hostname: string): boolean {
  // Block obvious private hostnames
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "[::1]" ||
    hostname === "[::]"
  ) {
    return true;
  }

  // Check for private IP ranges
  const parts = hostname.split(".");
  if (parts.length === 4 && parts.every((p) => /^\d+$/.test(p))) {
    const [a, b] = parts.map(Number);
    // 10.0.0.0/8
    if (a === 10) return true;
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16
    if (a === 192 && b === 168) return true;
    // 169.254.0.0/16 (link-local / AWS metadata)
    if (a === 169 && b === 254) return true;
    // 127.0.0.0/8
    if (a === 127) return true;
    // 0.0.0.0/8
    if (a === 0) return true;
  }

  // Block metadata endpoints
  if (
    hostname.endsWith(".internal") ||
    hostname.endsWith(".local") ||
    hostname === "metadata.google.internal"
  ) {
    return true;
  }

  return false;
}

function validatePublicUrl(rawUrl: string): URL | null {
  try {
    const url = new URL(rawUrl);
    // Only allow http(s)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    // Block private IPs
    if (isPrivateOrReserved(url.hostname)) return null;
    // Block credentials in URL
    if (url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

// ─── Helper: strip HTML ──────────────────────────────────────────────
function htmlToText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Allowed AI provider endpoints (whitelist) ──────────────────────
const ALLOWED_AI_ENDPOINTS: Record<string, string[]> = {
  openai: ["https://api.openai.com/"],
  anthropic: ["https://api.anthropic.com/"],
  google: ["https://generativelanguage.googleapis.com/"],
  deepseek: ["https://api.deepseek.com/"],
  xai: ["https://api.x.ai/"],
  groq: ["https://api.groq.com/"],
  mistral: ["https://api.mistral.ai/"],
  openrouter: ["https://openrouter.ai/"],
};

function isAllowedAIEndpoint(url: string): boolean {
  return Object.values(ALLOWED_AI_ENDPOINTS)
    .flat()
    .some((prefix) => url.startsWith(prefix));
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // ─── JSON body parser (limit payload size) ──────────────────────────
  app.use(express.json({ limit: "1mb" }));

  // ─── Security headers ──────────────────────────────────────────────
  app.use((_req, res, next) => {
    // Prevent clickjacking
    res.setHeader("X-Frame-Options", "DENY");
    // Prevent MIME sniffing
    res.setHeader("X-Content-Type-Options", "nosniff");
    // XSS filter (legacy browsers)
    res.setHeader("X-XSS-Protection", "1; mode=block");
    // Referrer policy
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    // Permissions policy
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    // CSP — allow self + known CDN/API domains
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: blob: https:",
        "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com https://api.deepseek.com https://api.x.ai https://api.groq.com https://api.mistral.ai https://openrouter.ai https://accounts.google.com",
        "frame-src https://accounts.google.com",
        "object-src 'none'",
        "base-uri 'self'",
      ].join("; "),
    );
    // HSTS (when behind HTTPS)
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
    next();
  });

  // ─── /api/search — DuckDuckGo + Wikipedia proxy ──────────────────
  app.get("/api/search", async (req, res) => {
    const clientIp =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      "unknown";

    if (!rateLimit(clientIp, 60_000, 30)) {
      return res.status(429).json({ results: [], error: "Rate limited" });
    }

    const query = (req.query.q as string || "").trim().slice(0, 500);
    if (!query) return res.json({ results: [] });

    try {
      const results: { title: string; snippet: string; url: string }[] =
        [];

      const ddgRes = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; AIWorkbench/1.0)",
          },
          signal: AbortSignal.timeout(10000),
        },
      );
      if (ddgRes.ok) {
        const ddg = (await ddgRes.json()) as any;
        if (ddg.AbstractText)
          results.push({
            title: ddg.Heading || query,
            snippet: ddg.AbstractText,
            url: ddg.AbstractURL || "",
          });
        if (ddg.Answer)
          results.push({
            title: "Direct Answer",
            snippet: ddg.Answer,
            url: "",
          });
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
              });
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
                  });
              }
          }
        }
      }

      const wikiRes = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`,
        {
          headers: { "User-Agent": "AIWorkbench/1.0" },
          signal: AbortSignal.timeout(10000),
        },
      );
      if (wikiRes.ok) {
        const wiki = (await wikiRes.json()) as any;
        if (wiki.extract && wiki.extract.length > 50)
          results.push({
            title: `Wikipedia: ${wiki.title || query}`,
            snippet: wiki.extract,
            url: wiki.content_urls?.desktop?.page || "",
          });
      }

      res.json({ results: results.slice(0, 10) });
    } catch (err: any) {
      console.error("Search proxy error:", err.message);
      res.json({ results: [], error: "Search failed" });
    }
  });

  // ─── /api/fetch-url — Extract readable text (SSRF-protected) ─────
  app.get("/api/fetch-url", async (req, res) => {
    const clientIp =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      "unknown";

    if (!rateLimit(clientIp, 60_000, 20)) {
      return res
        .status(429)
        .json({ text: "", error: "Rate limited" });
    }

    const targetUrl = (req.query.url as string || "").trim();
    if (!targetUrl) return res.json({ text: "", error: "No URL" });

    // SSRF protection: validate URL
    const parsed = validatePublicUrl(targetUrl);
    if (!parsed) {
      return res
        .status(400)
        .json({ text: "", error: "Invalid or blocked URL" });
    }

    try {
      const response = await fetch(parsed.href, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0",
          Accept:
            "text/html,application/xhtml+xml,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9,zh-TW;q=0.8",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        return res.json({
          text: "",
          error: `HTTP ${response.status}`,
        });

      // Check content type — only process text/html
      const ct = response.headers.get("content-type") || "";
      if (
        !ct.includes("text/html") &&
        !ct.includes("text/plain") &&
        !ct.includes("application/xhtml")
      ) {
        return res.json({
          text: "",
          error: "Unsupported content type",
        });
      }

      const rawHtml = await response.text();
      const titleMatch = rawHtml.match(
        /<title[^>]*>([\s\S]*?)<\/title>/i,
      );
      const title = titleMatch ? htmlToText(titleMatch[1]) : "";
      let text = htmlToText(rawHtml);
      if (text.length > 4000)
        text = text.slice(0, 4000) + "... (truncated)";
      res.json({ title, text, url: parsed.href });
    } catch (err: any) {
      res.json({ text: "", error: "Fetch failed" });
    }
  });

  // ─── /api/ai/chat — Server-side AI API proxy ──────────────────────
  // API keys never leave the browser in this design (each user supplies
  // their own key). The proxy validates the target endpoint against a
  // whitelist so the server cannot be used as an open HTTP relay.
  app.post("/api/ai/chat", async (req, res) => {
    const clientIp =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.socket.remoteAddress ||
      "unknown";

    // Rate limit: 60 requests per minute per IP
    if (!rateLimit(clientIp, 60_000, 60)) {
      return res.status(429).json({ error: "Rate limited" });
    }

    const { endpoint, headers: fwdHeaders, body } = req.body as {
      endpoint?: string;
      headers?: Record<string, string>;
      body?: unknown;
    };

    if (!endpoint || typeof endpoint !== "string") {
      return res.status(400).json({ error: "Missing endpoint" });
    }

    // Whitelist check
    if (!isAllowedAIEndpoint(endpoint)) {
      return res
        .status(403)
        .json({ error: "Endpoint not allowed" });
    }

    // Validate URL against SSRF
    const parsed = validatePublicUrl(endpoint);
    if (!parsed) {
      return res
        .status(400)
        .json({ error: "Invalid endpoint URL" });
    }

    // Strip any dangerous headers from forwarded set
    const safeHeaders: Record<string, string> = {};
    const BLOCKED_HEADERS = new Set([
      "host",
      "cookie",
      "set-cookie",
      "origin",
      "referer",
      "x-forwarded-for",
      "x-real-ip",
    ]);
    if (fwdHeaders && typeof fwdHeaders === "object") {
      for (const [k, v] of Object.entries(fwdHeaders)) {
        if (
          typeof v === "string" &&
          !BLOCKED_HEADERS.has(k.toLowerCase())
        ) {
          safeHeaders[k] = v;
        }
      }
    }

    try {
      const apiRes = await fetch(parsed.href, {
        method: "POST",
        headers: safeHeaders,
        body: typeof body === "string" ? body : JSON.stringify(body),
        signal: AbortSignal.timeout(120_000), // 2 min for AI responses
      });

      // Stream the response back to the client
      res.status(apiRes.status);
      for (const [key, value] of apiRes.headers) {
        // Only forward safe response headers
        if (
          key === "content-type" ||
          key === "retry-after" ||
          key === "x-ratelimit-remaining"
        ) {
          res.setHeader(key, value);
        }
      }

      if (apiRes.body) {
        const reader = apiRes.body.getReader();
        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              res.end();
              return;
            }
            res.write(value);
          }
        };
        await pump();
      } else {
        const text = await apiRes.text();
        res.send(text);
      }
    } catch (err: any) {
      if (!res.headersSent) {
        res.status(502).json({ error: "AI API request failed" });
      }
    }
  });

  // ─── Static files ──────────────────────────────────────────────────
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  // Handle client-side routing
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
