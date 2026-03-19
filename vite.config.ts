import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";

// =============================================================================
// Manus Debug Collector - Vite Plugin
// Writes browser logs directly to files, trimmed when exceeding size limit
// =============================================================================

const PROJECT_ROOT = import.meta.dirname;
const LOG_DIR = path.join(PROJECT_ROOT, ".manus-logs");
const MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024; // 1MB per log file
const TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6); // Trim to 60% to avoid constant re-trimming

type LogSource = "browserConsole" | "networkRequests" | "sessionReplay";

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function trimLogFile(logPath: string, maxSize: number) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) {
      return;
    }

    const lines = fs.readFileSync(logPath, "utf-8").split("\n");
    const keptLines: string[] = [];
    let keptBytes = 0;

    // Keep newest lines (from end) that fit within 60% of maxSize
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}\n`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }

    fs.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
    /* ignore trim errors */
  }
}

function writeToLogFile(source: LogSource, entries: unknown[]) {
  if (entries.length === 0) return;

  ensureLogDir();
  const logPath = path.join(LOG_DIR, `${source}.log`);

  // Format entries with timestamps
  const lines = entries.map((entry) => {
    const ts = new Date().toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });

  // Append to log file
  fs.appendFileSync(logPath, `${lines.join("\n")}\n`, "utf-8");

  // Trim if exceeds max size
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}

/**
 * Vite plugin to collect browser debug logs
 * - POST /__manus__/logs: Browser sends logs, written directly to files
 * - Files: browserConsole.log, networkRequests.log, sessionReplay.log
 * - Auto-trimmed when exceeding 1MB (keeps newest entries)
 */
function vitePluginManusDebugCollector(): Plugin {
  return {
    name: "manus-debug-collector",

    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
              defer: true,
            },
            injectTo: "head",
          },
        ],
      };
    },

    configureServer(server: ViteDevServer) {
      // POST /__manus__/logs: Browser sends logs (written directly to files)
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }

        const handlePayload = (payload: any) => {
          // Write logs directly to files
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };

        const reqBody = (req as { body?: unknown }).body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }

        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });

        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    },
  };
}

/** Strip HTML tags and decode entities */
function htmlToText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Vite plugin: Search + URL fetch proxy for dev server
 */
function vitePluginSearchProxy(): Plugin {
  return {
    name: "search-proxy",
    configureServer(server: ViteDevServer) {
      // ── /api/search — DuckDuckGo Instant Answer + Wikipedia ──
      server.middlewares.use("/api/search", async (req, res) => {
        const url = new URL(req.url || "/", "http://localhost");
        const query = (url.searchParams.get("q") || "").trim();
        if (!query) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ results: [] }));
          return;
        }

        try {
          const results: { title: string; snippet: string; url: string }[] = [];

          // Source 1: DuckDuckGo Instant Answer API (always works, no captcha)
          const ddgRes = await fetch(
            `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
            { headers: { "User-Agent": "Mozilla/5.0 (compatible; AIWorkbench/1.0)" } }
          );
          if (ddgRes.ok) {
            const ddg = await ddgRes.json();
            if (ddg.AbstractText) {
              results.push({
                title: ddg.Heading || query,
                snippet: ddg.AbstractText,
                url: ddg.AbstractURL || "",
              });
            }
            if (ddg.Answer) {
              results.push({ title: "Direct Answer", snippet: ddg.Answer, url: "" });
            }
            if (ddg.RelatedTopics) {
              for (const topic of ddg.RelatedTopics.slice(0, 6)) {
                if (topic.Text) {
                  results.push({
                    title: topic.FirstURL?.split("/").pop()?.replace(/_/g, " ") || "",
                    snippet: topic.Text,
                    url: topic.FirstURL || "",
                  });
                }
                // Handle sub-topics (category groups)
                if (topic.Topics) {
                  for (const sub of topic.Topics.slice(0, 3)) {
                    if (sub.Text) {
                      results.push({
                        title: sub.FirstURL?.split("/").pop()?.replace(/_/g, " ") || "",
                        snippet: sub.Text,
                        url: sub.FirstURL || "",
                      });
                    }
                  }
                }
              }
            }
          }

          // Source 2: Wikipedia API for richer content
          const wikiRes = await fetch(
            `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`,
            { headers: { "User-Agent": "AIWorkbench/1.0" } }
          );
          if (wikiRes.ok) {
            const wiki = await wikiRes.json();
            if (wiki.extract && wiki.extract.length > 50) {
              results.push({
                title: `Wikipedia: ${wiki.title || query}`,
                snippet: wiki.extract,
                url: wiki.content_urls?.desktop?.page || "",
              });
            }
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ results: results.slice(0, 10) }));
        } catch (err: any) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ results: [], error: err.message }));
        }
      });

      // ── /api/fetch-url — Extract readable text from a URL (SSRF-protected) ──
      server.middlewares.use("/api/fetch-url", async (req, res) => {
        const url = new URL(req.url || "/", "http://localhost");
        const targetUrl = (url.searchParams.get("url") || "").trim();
        if (!targetUrl) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ text: "", error: "No URL provided" }));
          return;
        }

        // SSRF protection: validate URL
        let parsedTarget: URL;
        try {
          parsedTarget = new URL(targetUrl);
          if (parsedTarget.protocol !== "http:" && parsedTarget.protocol !== "https:") {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ text: "", error: "Only http(s) allowed" }));
            return;
          }
          if (parsedTarget.username || parsedTarget.password) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ text: "", error: "Credentials in URL not allowed" }));
            return;
          }
          const h = parsedTarget.hostname;
          const isPrivate = h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0" || h === "[::1]" ||
            h.endsWith(".local") || h.endsWith(".internal") || h === "metadata.google.internal";
          if (!isPrivate) {
            const parts = h.split(".");
            if (parts.length === 4 && parts.every(p => /^\d+$/.test(p))) {
              const [a, b] = parts.map(Number);
              if (a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) ||
                  (a === 192 && b === 168) || (a === 169 && b === 254)) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ text: "", error: "Private IP blocked" }));
                return;
              }
            }
          } else {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ text: "", error: "Private hostname blocked" }));
            return;
          }
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ text: "", error: "Invalid URL" }));
          return;
        }

        try {
          const response = await fetch(parsedTarget.href, {
            headers: {
              "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0",
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "en-US,en;q=0.9,zh-TW;q=0.8,zh;q=0.7",
            },
            redirect: "follow",
            signal: AbortSignal.timeout(15000),
          });

          if (!response.ok) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ text: "", error: `HTTP ${response.status}` }));
            return;
          }

          const contentType = response.headers.get("content-type") || "";
          const rawHtml = await response.text();

          // Extract title
          const titleMatch = rawHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
          const title = titleMatch ? htmlToText(titleMatch[1]) : "";

          // Extract main text content
          let text = htmlToText(rawHtml);
          // Limit to ~4000 chars to avoid token explosion
          if (text.length > 4000) text = text.slice(0, 4000) + "... (truncated)";

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ title, text, url: targetUrl, contentType }));
        } catch (err: any) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ text: "", error: err.message }));
        }
      });
      // ── Helper: parse JSON body from request ──
      function parseBody(req: any): Promise<any> {
        return new Promise((resolve, reject) => {
          const reqBody = (req as { body?: unknown }).body;
          if (reqBody && typeof reqBody === "object") return resolve(reqBody);
          let body = "";
          req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
          req.on("end", () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
        });
      }

      // ── Helper: validate Supabase JWT and return user ID ──
      async function getDevUserId(req: any): Promise<string | null> {
        const auth = req.headers?.authorization;
        if (!auth || typeof auth !== "string") return null;
        const token = auth.replace(/^Bearer\s+/i, "").trim();
        if (!token) return null;
        const sbUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!sbUrl || !sbKey) return null;
        try {
          const { createClient } = await import("@supabase/supabase-js");
          const sb = createClient(sbUrl, sbKey, { auth: { persistSession: false } });
          const { data, error } = await sb.auth.getUser(token);
          if (error || !data?.user) return null;
          return data.user.id;
        } catch { return null; }
      }

      // ── Helper: get encrypted key from DB ──
      async function getDevStoredKey(userId: string, provider: string): Promise<string | null> {
        const sbUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const encSecret = process.env.API_KEY_ENCRYPTION_SECRET;
        if (!sbUrl || !sbKey || !encSecret) return null;
        try {
          const { createClient } = await import("@supabase/supabase-js");
          const crypto = await import("crypto");
          const sb = createClient(sbUrl, sbKey, { auth: { persistSession: false } });
          // Try the provider, then fallback for groq/meta sharing
          const providers = provider === "meta" ? ["groq", "meta"] : provider === "groq" ? ["groq", "meta"] : [provider];
          for (const p of providers) {
            const { data, error } = await sb.from("user_api_keys").select("encrypted_key, iv").eq("user_id", userId).eq("provider", p).single();
            if (!error && data) {
              const key = crypto.createHash("sha256").update(encSecret).digest();
              const iv = Buffer.from(data.iv, "base64");
              const ct = Buffer.from(data.encrypted_key, "base64");
              const encrypted = ct.subarray(0, ct.length - 16);
              const tag = ct.subarray(ct.length - 16);
              const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
              decipher.setAuthTag(tag);
              return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
            }
          }
          return null;
        } catch { return null; }
      }

      // ── Helper: build auth headers for AI provider ──
      function buildProviderHeaders(provider: string, apiKey: string): Record<string, string> {
        switch (provider) {
          case "anthropic": return { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" };
          case "google": return { "Content-Type": "application/json", "x-goog-api-key": apiKey };
          case "openrouter": return { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "HTTP-Referer": "https://ai-workbench.app", "X-OpenRouter-Title": "AI Workbench" };
          default: return { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };
        }
      }

      // ── /api/keys/save — Store encrypted API key ──
      server.middlewares.use("/api/keys/save", async (req, res, next) => {
        if (req.method !== "POST") return next();
        const userId = await getDevUserId(req);
        if (!userId) { res.writeHead(401, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Unauthorized" })); return; }
        try {
          const body = await parseBody(req);
          const { provider, key } = body;
          if (!provider || !key) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Invalid" })); return; }
          const crypto = await import("crypto");
          const encSecret = process.env.API_KEY_ENCRYPTION_SECRET;
          if (!encSecret) { res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Encryption not configured" })); return; }
          const encKey = crypto.createHash("sha256").update(encSecret).digest();
          const iv = crypto.randomBytes(12);
          const cipher = crypto.createCipheriv("aes-256-gcm", encKey, iv);
          const encrypted = Buffer.concat([cipher.update(key, "utf8"), cipher.final()]);
          const tag = cipher.getAuthTag();
          const ciphertext = Buffer.concat([encrypted, tag]);
          const { createClient } = await import("@supabase/supabase-js");
          const sb = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "", { auth: { persistSession: false } });
          await sb.from("user_api_keys").upsert({ user_id: userId, provider, encrypted_key: ciphertext.toString("base64"), iv: iv.toString("base64"), key_prefix: key.slice(0, 4) + "…", updated_at: new Date().toISOString() }, { onConflict: "user_id,provider" });
          res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ success: true, provider, prefix: key.slice(0, 4) + "…" }));
        } catch { res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Internal error" })); }
      });

      // ── /api/keys/delete — Remove API key ──
      server.middlewares.use("/api/keys/delete", async (req, res, next) => {
        if (req.method !== "POST") return next();
        const userId = await getDevUserId(req);
        if (!userId) { res.writeHead(401, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Unauthorized" })); return; }
        try {
          const body = await parseBody(req);
          const { createClient } = await import("@supabase/supabase-js");
          const sb = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "", { auth: { persistSession: false } });
          await sb.from("user_api_keys").delete().eq("user_id", userId).eq("provider", body.provider);
          res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ success: true }));
        } catch { res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Internal error" })); }
      });

      // ── /api/keys/status — List saved key providers ──
      server.middlewares.use("/api/keys/status", async (req, res, next) => {
        if (req.method !== "GET") return next();
        const userId = await getDevUserId(req);
        if (!userId) { res.writeHead(401, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Unauthorized" })); return; }
        try {
          const { createClient } = await import("@supabase/supabase-js");
          const sb = createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "", { auth: { persistSession: false } });
          const { data } = await sb.from("user_api_keys").select("provider, key_prefix, updated_at").eq("user_id", userId);
          const keys = (data || []).map((r: any) => ({ provider: r.provider, prefix: r.key_prefix, updatedAt: r.updated_at }));
          res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ keys }));
        } catch { res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Internal error" })); }
      });

      // ── /api/audio/speech — TTS proxy (server-side keys) ──
      server.middlewares.use("/api/audio/speech", async (req, res, next) => {
        if (req.method !== "POST") return next();
        try {
          const body = await parseBody(req);
          let groqKey = body.apiKey; // legacy fallback
          const userId = await getDevUserId(req);
          if (userId) { const stored = await getDevStoredKey(userId, "groq"); if (stored) groqKey = stored; }
          if (!groqKey) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "No Groq key" })); return; }
          const groqRes = await fetch("https://api.groq.com/openai/v1/audio/speech", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` }, body: JSON.stringify({ model: "playai-tts", input: String(body.text).slice(0, 4096), voice: body.voice || "Arista-PlayAI", response_format: "wav" }) });
          if (!groqRes.ok) { const err = await groqRes.text().catch(() => ""); res.writeHead(groqRes.status, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: err.slice(0, 200) })); return; }
          const buf = await groqRes.arrayBuffer();
          res.writeHead(200, { "Content-Type": "audio/wav" }); res.end(Buffer.from(buf));
        } catch { res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Internal error" })); }
      });

      // ── /api/audio/transcribe — STT proxy (server-side keys) ──
      server.middlewares.use("/api/audio/transcribe", async (req, res, next) => {
        if (req.method !== "POST") return next();
        try {
          const body = await parseBody(req);
          let groqKey = body.apiKey;
          const userId = await getDevUserId(req);
          if (userId) { const stored = await getDevStoredKey(userId, "groq"); if (stored) groqKey = stored; }
          if (!groqKey) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "No Groq key" })); return; }
          const buffer = Buffer.from(body.audio, "base64");
          const boundary = "----AudioBoundary" + Date.now();
          const parts = [Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="recording.webm"\r\nContent-Type: audio/webm\r\n\r\n`), buffer, Buffer.from("\r\n"), Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-large-v3-turbo\r\n`), Buffer.from(`--${boundary}--\r\n`)];
          const groqRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": `multipart/form-data; boundary=${boundary}` }, body: Buffer.concat(parts) });
          if (!groqRes.ok) { const err = await groqRes.text().catch(() => ""); res.writeHead(groqRes.status, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: err.slice(0, 200) })); return; }
          const data = await groqRes.json();
          res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ text: data.text || "" }));
        } catch { res.writeHead(500, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Internal error" })); }
      });

      // ── /api/ai/chat — AI API proxy (whitelist-only, server-side key injection) ──
      server.middlewares.use("/api/ai/chat", async (req, res, next) => {
        if (req.method !== "POST") return next();

        const ALLOWED_PREFIXES = [
          "https://api.openai.com/",
          "https://api.anthropic.com/",
          "https://generativelanguage.googleapis.com/",
          "https://api.deepseek.com/",
          "https://api.x.ai/",
          "https://api.groq.com/",
          "https://api.mistral.ai/",
          "https://openrouter.ai/",
        ];

        try {
          const parsed = await parseBody(req);
          const { endpoint, headers: fwdHeaders, body: reqBody, provider } = parsed;
          if (!endpoint || !ALLOWED_PREFIXES.some((p: string) => endpoint.startsWith(p))) {
            res.writeHead(403, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Endpoint not allowed" }));
            return;
          }

          let finalHeaders: Record<string, string> = {};

          // New flow: provider-based, fetch key from DB
          if (provider && typeof provider === "string") {
            const userId = await getDevUserId(req);
            if (!userId) { res.writeHead(401, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: "Unauthorized" })); return; }
            const apiKey = await getDevStoredKey(userId, provider);
            if (!apiKey) { res.writeHead(404, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: `No key for ${provider}` })); return; }
            finalHeaders = buildProviderHeaders(provider, apiKey);
          }
          // Legacy flow: client sends raw headers
          else if (fwdHeaders && typeof fwdHeaders === "object") {
            const BLOCKED = new Set(["host", "cookie", "set-cookie", "origin", "referer", "x-forwarded-for", "x-real-ip"]);
            for (const [k, v] of Object.entries(fwdHeaders)) {
              if (typeof v === "string" && !BLOCKED.has(k.toLowerCase())) finalHeaders[k] = v;
            }
          }

          const apiRes = await fetch(endpoint, {
            method: "POST",
            headers: finalHeaders,
            body: typeof reqBody === "string" ? reqBody : JSON.stringify(reqBody),
            signal: AbortSignal.timeout(120_000),
          });
          res.writeHead(apiRes.status, { "Content-Type": apiRes.headers.get("content-type") || "application/json" });
          const resBody = await apiRes.text();
          res.end(resBody);
        } catch (err: any) {
          res.writeHead(502, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "AI API request failed" }));
        }
      });
    },
  };
}

const plugins = [react(), tailwindcss(), jsxLocPlugin(), vitePluginManusRuntime(), vitePluginManusDebugCollector(), vitePluginSearchProxy()];

export default defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      "@liquid-glass": path.resolve(import.meta.dirname, "liquid-glass-react-master", "src", "index.tsx"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    strictPort: false, // Will find next available port if 3000 is busy
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1",
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
