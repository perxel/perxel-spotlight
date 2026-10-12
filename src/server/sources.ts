import {jsonSchema, tool, type Tool, type ToolSet} from "ai"
import {buildIndex, fold, search, type SearchDoc} from "../core/search.js"
import type {AskContext, AskSource} from "./types.js"

// ---------------------------------------------------------------------------------------------
// toolSource: the site's own functions

/**
 * The site's own AI SDK tools (live numbers, filters over structured data, an outside API), run
 * in the same route. A function gets the request context (locale, say) and returns the tools.
 */
export function toolSource(tools: ToolSet | ((ctx: AskContext) => ToolSet | Promise<ToolSet>), {name = "site"}: {name?: string} = {}): AskSource {
  return {name, tools: (ctx) => (typeof tools === "function" ? tools(ctx) : tools)}
}

// ---------------------------------------------------------------------------------------------
// contentSource: search and read the site's own pages

/** A page for `contentSource`: a search document, with its full text if there is one. */
export type ContentDoc = SearchDoc & {body?: string}

export interface ContentSourceOptions {
  /** The pages: the same documents as search (with a `url`), or a function of the request (locale). */
  docs: ContentDoc[] | ((ctx: AskContext) => ContentDoc[] | Promise<ContentDoc[]>)
  /** Full text by document id, when it is not on the documents (`body`). Markdown headings (`#`) mark sections. */
  bodies?: Record<string, string> | ((ctx: AskContext) => Record<string, string> | Promise<Record<string, string>>)
  /** Makes relative urls absolute in what the model sees (and in the cited sources). */
  baseUrl?: string
  /** Hits per search (default 5). */
  maxHits?: number
  /** Passages per hit, from its full text (default 2), and their length in characters (default 320). */
  passages?: number
  passageLength?: number
  /** Characters of a page `get_page` returns (default 6000); longer pages are cut and list their sections. */
  pageLength?: number
  /** Tool names (default `search_site`, `get_page`). */
  names?: {search?: string; page?: string}
  /** What the tools say they search ("this site's pages"). */
  about?: string
  name?: string
}

const STOP = new Set(["the", "and", "for", "you", "your", "what", "which", "how", "does", "did", "are", "was", "with", "about", "from", "this", "that", "have", "has", "can", "any", "all", "who", "why", "when", "where", "much", "many"])

/** The query's words worth matching in body text: folded, 3+ characters, common English words out. */
function terms(query: string): string[] {
  return [...new Set(fold(query).split(" ").filter((t) => t.length >= 3 && !STOP.has(t)))]
}

/** Up to `count` paragraphs of `body` holding the most terms, each cut around its first match. */
export function passagesOf(body: string, words: string[], count: number, length: number): string[] {
  if (!words.length || !count) return []
  const paragraphs = body.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter((p) => p.length > 40 && !p.startsWith("#"))
  const scored = paragraphs
    .map((p, i) => {
      const f = fold(p)
      return {p, i, f, n: words.filter((w) => f.includes(w)).length}
    })
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .slice(0, count)
    .sort((a, b) => a.i - b.i)
  return scored.map(({p, f}) => {
    if (p.length <= length) return p
    const at = Math.min(...words.map((w) => f.indexOf(w)).filter((i) => i >= 0))
    // Folding keeps lengths close enough for a window; cut on spaces.
    let start = Math.max(0, at - Math.floor(length * 0.3))
    if (start > 0) start = p.indexOf(" ", start) + 1 || start
    let end = Math.min(p.length, start + length)
    if (end < p.length) end = p.lastIndexOf(" ", end) > start ? p.lastIndexOf(" ", end) : end
    return (start > 0 ? "… " : "") + p.slice(start, end).trim() + (end < p.length ? " …" : "")
  })
}

/** The section of a markdown body under the heading that matches `section` (until the next heading of its level or higher). */
export function sectionOf(body: string, section: string): string | null {
  const lines = body.split("\n")
  const want = fold(section)
  const at = lines.findIndex((l) => /^#{1,6}\s/.test(l) && fold(l.replace(/^#+\s*/, "")).includes(want))
  if (at < 0) return null
  const level = lines[at]!.match(/^#+/)![0].length
  let end = lines.findIndex((l, i) => i > at && /^#{1,6}\s/.test(l) && l.match(/^#+/)![0].length <= level)
  if (end < 0) end = lines.length
  return lines.slice(at, end).join("\n").trim()
}

function headingsOf(body: string): string[] {
  return body.split("\n").filter((l) => /^#{2,3}\s/.test(l)).map((l) => l.replace(/^#+\s*/, "").trim())
}

/**
 * Search and read the site's own pages, with no MCP: two tools built from the same documents as
 * the gate's search plus their full text. Answers stay cheap: a search returns a few short
 * passages per hit (most answers need nothing more), a page is capped or read one section at a
 * time.
 */
export function contentSource(options: ContentSourceOptions): AskSource {
  const {baseUrl, maxHits = 5, passages = 2, passageLength = 320, pageLength = 6000, about = "this website's pages and posts"} = options
  const searchName = options.names?.search ?? "search_site"
  const pageName = options.names?.page ?? "get_page"
  const abs = (url: string) => (baseUrl && url.startsWith("/") ? baseUrl.replace(/\/$/, "") + url : url)
  // Docs and their index are built once per list (per isolate when the list is a constant).
  const cache = new WeakMap<ContentDoc[], ReturnType<typeof buildIndex>>()

  return {
    name: options.name ?? "content",
    async tools(ctx) {
      const docs = (typeof options.docs === "function" ? await options.docs(ctx) : options.docs).filter((d) => d.url)
      const bodies = typeof options.bodies === "function" ? await options.bodies(ctx) : options.bodies ?? {}
      const bodyOf = (d: ContentDoc) => d.body ?? bodies[d.id] ?? ""
      let index = cache.get(docs)
      if (!index) {
        index = buildIndex(docs)
        cache.set(docs, index)
      }
      const idx = index
      const byUrl = (url: string) => {
        const path = url.replace(/^https?:\/\/[^/]+/, "").replace(/\/$/, "") || "/"
        return docs.find((d) => d.url === url || (d.url!.replace(/^https?:\/\/[^/]+/, "").replace(/\/$/, "") || "/") === path)
      }

      const searchTool: Tool = tool({
        description:
          `Searches ${about}: titles, descriptions and full text. Returns the best hits (title, url, kind, excerpt) ` +
          `with the passages of each page that match the query. Use ${pageName} only when the passages do not answer.`,
        inputSchema: jsonSchema<{query: string}>({
          type: "object",
          properties: {query: {type: "string", description: "Keywords to look for", minLength: 1}},
          required: ["query"],
          additionalProperties: false,
        }),
        execute: async ({query}) => {
          const words = terms(query)
          // Title and keyword matches from the search engine, then full-text matches.
          const fromIndex = search(idx, query, {limit: 20})
          const scores = new Map<ContentDoc, number>()
          fromIndex.forEach((r) => scores.set(r.doc as ContentDoc, r.score))
          if (words.length) {
            for (const d of docs) {
              const body = bodyOf(d)
              if (!body) continue
              const f = fold(body)
              const n = words.filter((w) => f.includes(w)).length
              if (n) scores.set(d, (scores.get(d) ?? 0) + n * 3)
            }
          }
          const hits = [...scores].sort((a, b) => b[1] - a[1]).slice(0, maxHits)
          return {
            results: hits.map(([d], i) => {
              const excerpt = d.snippets?.at(-1) ?? d.subtitle ?? ""
              const p = i < 3 ? passagesOf(bodyOf(d), words, passages, passageLength) : []
              return {
                title: d.title,
                url: abs(d.url!),
                kind: d.kind,
                ...(excerpt ? {excerpt: excerpt.slice(0, 300)} : {}),
                ...(p.length ? {passages: p} : {}),
              }
            }),
          }
        },
      })

      const pageTool: Tool = tool({
        description: `Reads one page of ${about} by its url (from ${searchName}): its text, capped; pass a section heading to read only that section.`,
        inputSchema: jsonSchema<{url: string; section?: string}>({
          type: "object",
          properties: {
            url: {type: "string", description: "The page's url, as returned by search"},
            section: {type: "string", description: "Optional: a section heading to read only that part"},
          },
          required: ["url"],
          additionalProperties: false,
        }),
        execute: async ({url, section}) => {
          const d = byUrl(url)
          if (!d) return {error: "No page with that url."}
          const body = bodyOf(d) || [d.subtitle, ...(d.snippets ?? [])].filter(Boolean).join("\n\n")
          const part = section ? sectionOf(body, section) : null
          const text = part ?? body
          const truncated = text.length > pageLength
          return {
            title: d.title,
            url: abs(d.url!),
            text: truncated ? text.slice(0, pageLength) + " …" : text,
            ...(truncated ? {truncated: true, sections: headingsOf(body)} : {}),
          }
        },
      })

      return {[searchName]: searchTool, [pageName]: pageTool}
    },
  }
}

// ---------------------------------------------------------------------------------------------
// mcpSource: tools on a remote MCP server (streamable HTTP)

export interface McpSourceOptions {
  /** The server's MCP endpoint (streamable HTTP), e.g. `https://mcp.example.com/mcp`. */
  url: string
  /** Headers on every call (an API key). A function runs per request. */
  headers?: Record<string, string> | ((ctx: AskContext) => Record<string, string> | Promise<Record<string, string>>)
  /** Allowlist of the server's tool names to offer. Recommended: a tool added to the server later is not offered by accident. */
  tools?: string[]
  /**
   * Arguments set by the site, hidden from the model: e.g. `{locale: ctx.body.locale}` for a tool
   * whose input has a `locale`. Only applied to tools whose schema has that property.
   */
  fixed?: (ctx: AskContext) => Record<string, unknown>
  /** How long the tool list is kept (per server instance, default 5 minutes). */
  listTtlMs?: number
  /** Per call (default 15 s). */
  timeoutMs?: number
  name?: string
  fetcher?: typeof fetch
}

interface McpToolDef {
  name: string
  description?: string
  inputSchema?: {type?: string; properties?: Record<string, unknown>; required?: string[]} & Record<string, unknown>
}

let rpcId = 0
const lists = new Map<string, {at: number; tools: McpToolDef[]}>()
const sessions = new Map<string, string>()

/** One JSON-RPC call over streamable HTTP; the answer may be JSON or an SSE stream. */
async function rpc(url: string, method: string, params: unknown, headers: Record<string, string>, timeoutMs: number, fetcher: typeof fetch): Promise<unknown> {
  const id = ++rpcId
  const session = sessions.get(url)
  const res = await fetcher(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(session ? {"mcp-session-id": session} : {}),
      ...headers,
    },
    body: JSON.stringify({jsonrpc: "2.0", id, method, ...(params === undefined ? {} : {params})}),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const sid = res.headers.get("mcp-session-id")
  if (sid) sessions.set(url, sid)
  if (!res.ok) throw new McpHttpError(res.status, await res.text().catch(() => ""))
  let msg: {result?: unknown; error?: {message?: string}} | undefined
  if ((res.headers.get("content-type") ?? "").includes("text/event-stream")) {
    const text = await res.text()
    for (const block of text.split(/\n\n/)) {
      const data = block.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("\n")
      if (!data) continue
      try {
        const m = JSON.parse(data)
        if (m.id === id || (m.id === undefined && (m.result || m.error))) msg = m
      } catch {
        // Not JSON: skip.
      }
    }
  } else msg = (await res.json()) as typeof msg
  if (!msg) throw new Error(`MCP ${method}: no response`)
  if (msg.error) throw new Error(`MCP ${method}: ${msg.error.message ?? "error"}`)
  return msg.result
}

class McpHttpError extends Error {
  constructor(public status: number, body: string) {
    super(`MCP HTTP ${status}: ${body.slice(0, 200)}`)
  }
}

/** Calls `method`; a server that needs a session gets `initialize` first, then the call again. */
async function call(url: string, method: string, params: unknown, headers: Record<string, string>, timeoutMs: number, fetcher: typeof fetch) {
  try {
    return await rpc(url, method, params, headers, timeoutMs, fetcher)
  } catch (err) {
    if (!(err instanceof McpHttpError) || ![400, 404].includes(err.status)) throw err
    sessions.delete(url)
    await rpc(url, "initialize", {protocolVersion: "2025-06-18", capabilities: {}, clientInfo: {name: "@perxel/spotlight", version: "0"}}, headers, timeoutMs, fetcher)
    await fetcher(url, {
      method: "POST",
      headers: {"content-type": "application/json", accept: "application/json, text/event-stream", ...(sessions.get(url) ? {"mcp-session-id": sessions.get(url)!} : {}), ...headers},
      body: JSON.stringify({jsonrpc: "2.0", method: "notifications/initialized"}),
    }).catch(() => undefined)
    return rpc(url, method, params, headers, timeoutMs, fetcher)
  }
}

/** A tool result's data: `structuredContent`, else its text parsed as JSON, else the text. */
function resultData(result: unknown): unknown {
  const r = result as {structuredContent?: unknown; content?: {type: string; text?: string}[]; isError?: boolean}
  if (r?.structuredContent !== undefined) return r.structuredContent
  const text = (r?.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n")
  const data = (() => {
    try {
      return JSON.parse(text)
    } catch {
      return text
    }
  })()
  return r?.isError ? {error: data} : data
}

/**
 * Tools on a remote MCP server, called over streamable HTTP with no SDK (works on any runtime
 * with `fetch`). The tool list is fetched once and kept for `listTtlMs`. Use `tools` to allowlist:
 * an anonymous chat must only reach tools meant for the public.
 */
export function mcpSource(options: McpSourceOptions): AskSource {
  const {url, listTtlMs = 5 * 60 * 1000, timeoutMs = 15_000, fetcher = fetch} = options
  return {
    name: options.name ?? "mcp",
    async tools(ctx) {
      const headers = typeof options.headers === "function" ? await options.headers(ctx) : options.headers ?? {}
      let cached = lists.get(url)
      if (!cached || Date.now() - cached.at > listTtlMs) {
        const result = (await call(url, "tools/list", {}, headers, timeoutMs, fetcher)) as {tools?: McpToolDef[]}
        cached = {at: Date.now(), tools: result.tools ?? []}
        lists.set(url, cached)
      }
      const fixed = options.fixed?.(ctx) ?? {}
      const out: ToolSet = {}
      for (const def of cached.tools) {
        if (options.tools && !options.tools.includes(def.name)) continue
        const schema = {type: "object", properties: {}, ...def.inputSchema} as NonNullable<McpToolDef["inputSchema"]>
        // Fixed arguments are the site's, not the model's: out of the schema the model sees.
        const hidden = Object.keys(fixed).filter((k) => k in (schema.properties ?? {}))
        const properties = Object.fromEntries(Object.entries(schema.properties ?? {}).filter(([k]) => !hidden.includes(k)))
        const required = (schema.required ?? []).filter((k) => !hidden.includes(k))
        const {$schema: _drop, ...rest} = schema as Record<string, unknown>
        out[def.name] = tool({
          description: def.description ?? def.name,
          inputSchema: jsonSchema({...rest, properties, required}),
          execute: async (input: unknown) => {
            const args = {...(input as Record<string, unknown>), ...Object.fromEntries(hidden.map((k) => [k, fixed[k]]))}
            return resultData(await call(url, "tools/call", {name: def.name, arguments: args}, headers, timeoutMs, fetcher))
          },
        })
      }
      return out
    },
  }
}

/** Test hook: forget the cached tool lists and sessions. */
export function resetMcpCache(): void {
  lists.clear()
  sessions.clear()
}
