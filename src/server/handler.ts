import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  type LanguageModel,
  type ModelMessage,
  type Tool,
  type ToolSet,
} from "ai"
import type {AskContext, AskSource, Cited, ToolRun} from "./types.js"

/**
 * `createAskHandler(options)`: a Web-standard `(Request) => Promise<Response>` that answers a chat
 * from the AI SDK's `useChat` (the whole conversation in each request) with a streamed UI message
 * response. Mount it as a Next route handler (`export const POST = handler`), a Worker's `fetch`,
 * Hono, Node. Stateless: the history comes from the client and only its text is used (tool
 * parts and sources from the client are dropped, so a client cannot hand the model tool results).
 *
 * Checks, in order: CORS origin (when `origins` is set) → method and size → body shape and limits
 * → `verify` (bot check) → `rateLimit` → the model call. A refusal is `{code}` JSON with an HTTP
 * status; the panel maps the code to its copy.
 */

export type AskErrorCode = "origin" | "bad_request" | "verify_failed" | "rate_limited" | "conversation_limit" | "budget" | "upstream"

const STATUS: Record<AskErrorCode, number> = {
  origin: 403,
  bad_request: 400,
  verify_failed: 403,
  rate_limited: 429,
  conversation_limit: 429,
  budget: 503,
  upstream: 502,
}

/** One answered turn, for `onFinish` (log it, store it, count its cost). */
export interface AskTurn {
  /** The chat id the client sent (`useChat`'s id), if any. */
  id: string | null
  question: string
  answer: string
  /** Every tool the model ran this turn, in order. */
  tools: ToolRun[]
  /** The sources sent to the client. */
  sources: Cited[]
  /** Number of messages in the conversation, this question included. */
  messages: number
  model: string
  usage: {inputTokens: number; outputTokens: number}
  timing: {
    totalMs: number
    /** Until the first answer text, -1 when none. */
    firstTextMs: number
    /** Model time (step time minus tool time). */
    modelMs: number
    toolMs: number
    steps: number
  }
  /** The AI SDK's end event, for what is not lifted out above (provider metadata, cost). */
  raw: unknown
}

export interface AskHandlerOptions {
  /** Any AI SDK language model, or one per request. */
  model: LanguageModel | ((ctx: AskContext) => LanguageModel)
  /** Instructions for the model; a function gets the request context (locale in the body, say). */
  system?: string | ((ctx: AskContext) => string | Promise<string>)
  /** Where the model's tools come from: `contentSource`, `toolSource`, `mcpSource`, mixed freely. */
  sources?: AskSource[]
  /** Allowlist of tool names the model may call (after prefixing); all when omitted. */
  tools?: string[]
  /**
   * Tools that only drive the interface (an action, a handoff): not counted as lookups, and their
   * results are never searched for sources.
   */
  uiTools?: string[]
  /** Bot check: true to go on, false (or an error code) to refuse. `turnstile({secret})` is one. */
  verify?: (ctx: AskContext) => boolean | string | Promise<boolean | string>
  /** Rate limit or budget: true to go on, false (`rate_limited`) or an error code to refuse. */
  rateLimit?: (ctx: AskContext) => boolean | string | Promise<boolean | string>
  /** After each answered turn. Runs after the response has finished streaming. */
  onFinish?: (turn: AskTurn, ctx: AskContext) => void | Promise<void>
  /** Keeps `onFinish` alive past the response on platforms that need it (a Worker's `ctx.waitUntil`). */
  waitUntil?: (promise: Promise<unknown>) => void
  /** Allowed `Origin`s for cross-origin calls (CORS); same-origin only when omitted. */
  origins?: string[]
  /** Headers on every answer (a session, a version). */
  headers?: (ctx: AskContext) => HeadersInit | undefined | Promise<HeadersInit | undefined>
  /** Cite sources: `{url, title}` pairs found in tool results become `source-url` parts. Default on, 4 at most, 2 per tool result. */
  cite?: false | {max?: number; perResult?: number}
  /** Characters in the visitor's question (default 1000). */
  maxInputChars?: number
  /** Questions in one conversation (default 20); more is `conversation_limit`. */
  maxQuestions?: number
  /** Earlier messages kept for the model (default 20, the newest). */
  maxHistory?: number
  /** Characters kept per earlier message (default 4000). */
  maxHistoryChars?: number
  /** Model steps per answer, tool calls included (default 4). */
  maxSteps?: number
  /** Output tokens per answer (default 700). */
  maxOutputTokens?: number
  /** Request body bytes (default 256 KB). */
  maxBodyBytes?: number
  /** Called with errors (model, tool, `onFinish`); default `console.error`. */
  onError?: (error: unknown, where: "model" | "tool" | "finish") => void
  /** Extra `streamText` settings (temperature, providerOptions…). */
  settings?: Record<string, unknown>
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

/** The text of a client message: its text parts joined. */
function messageText(m: Record<string, unknown>): string {
  if (!Array.isArray(m.parts)) return typeof m.content === "string" ? m.content : ""
  return m.parts
    .filter((p): p is {type: "text"; text: string} => isRecord(p) && p.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("\n")
    .trim()
}

function cors(res: Response, origin: string | null): Response {
  if (!origin) return res
  const headers = new Headers(res.headers)
  headers.set("access-control-allow-origin", origin)
  headers.set("access-control-expose-headers", "*")
  headers.append("vary", "Origin")
  return new Response(res.body, {status: res.status, statusText: res.statusText, headers})
}

/** Every `{url, title}` pair in a tool result, in order (urls: http(s) or a path). Bounded walk. */
export function sourcesIn(data: unknown, limit = 50): Cited[] {
  const out: Cited[] = []
  const queue: unknown[] = [data]
  let seen = 0
  while (queue.length && seen < 500 && out.length < limit) {
    const node = queue.shift()
    seen++
    if (Array.isArray(node)) queue.push(...node)
    else if (isRecord(node)) {
      const {url, title} = node
      if (typeof url === "string" && /^(https?:\/\/|\/)/.test(url) && typeof title === "string" && title.trim() && !out.some((o) => o.url === url)) {
        out.push({url, title: title.trim()})
      }
      for (const v of Object.values(node)) if (typeof v === "object" && v !== null) queue.push(v)
    }
  }
  return out
}

export function createAskHandler(options: AskHandlerOptions): (request: Request) => Promise<Response> {
  const {
    sources = [],
    uiTools = [],
    maxInputChars = 1000,
    maxQuestions = 20,
    maxHistory = 20,
    maxHistoryChars = 4000,
    maxSteps = 4,
    maxOutputTokens = 700,
    maxBodyBytes = 256 * 1024,
    onError = (err: unknown, where: string) => console.error(`[spotlight] ${where}:`, err),
  } = options
  const cite = options.cite === false ? null : {max: options.cite?.max ?? 4, perResult: options.cite?.perResult ?? 2}
  const ui = new Set(uiTools)

  return async function handle(request: Request): Promise<Response> {
    const t0 = Date.now()
    const requestOrigin = request.headers.get("origin")
    const sameOrigin = !requestOrigin || requestOrigin === new URL(request.url).origin
    const allowed = !sameOrigin && requestOrigin && options.origins?.includes(requestOrigin) ? requestOrigin : null
    const refuse = (code: AskErrorCode, headers?: HeadersInit) => cors(Response.json({code}, {status: STATUS[code], headers}), allowed)

    if (request.method === "OPTIONS") {
      if (!allowed) return new Response(null, {status: 403})
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": allowed,
          "access-control-allow-methods": "POST, OPTIONS",
          "access-control-allow-headers": request.headers.get("access-control-request-headers") ?? "content-type",
          "access-control-max-age": "86400",
          vary: "Origin",
        },
      })
    }
    if (!sameOrigin && !allowed) return refuse("origin")
    if (request.method !== "POST") return refuse("bad_request")

    // Body: size, JSON, messages.
    if (Number(request.headers.get("content-length") ?? 0) > maxBodyBytes) return refuse("bad_request")
    const raw = await request.text().catch(() => "")
    if (!raw || raw.length > maxBodyBytes) return refuse("bad_request")
    let body: Record<string, unknown>
    try {
      const parsed = JSON.parse(raw)
      if (!isRecord(parsed)) return refuse("bad_request")
      body = parsed
    } catch {
      return refuse("bad_request")
    }
    const list = Array.isArray(body.messages) ? body.messages.filter(isRecord) : []
    const turns = list
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({role: m.role as "user" | "assistant", text: messageText(m)}))
      .filter((m) => m.text)
    const last = turns.at(-1)
    if (!last || last.role !== "user" || last.text.length > maxInputChars) return refuse("bad_request")
    if (turns.filter((m) => m.role === "user").length > maxQuestions) return refuse("conversation_limit")

    const {messages: _messages, ...fields} = body
    const ctx: AskContext = {
      request,
      body: fields,
      id: typeof body.id === "string" ? body.id.slice(0, 100) : null,
      question: last.text,
      history: turns.slice(0, -1),
    }

    const verified = options.verify ? await options.verify(ctx) : true
    if (verified !== true) return refuse(typeof verified === "string" ? (verified as AskErrorCode) : "verify_failed")
    const limited = options.rateLimit ? await options.rateLimit(ctx) : true
    if (limited !== true) return refuse(typeof limited === "string" ? (limited as AskErrorCode) : "rate_limited", {"retry-after": "60"})

    const model = typeof options.model === "function" ? options.model(ctx) : options.model
    const system = typeof options.system === "function" ? await options.system(ctx) : options.system
    const history: ModelMessage[] = turns
      .slice(0, -1)
      .slice(-maxHistory)
      .map((m) => ({role: m.role, content: m.text.slice(0, maxHistoryChars)}) as ModelMessage)

    const runs: ToolRun[] = []
    const cited: Cited[] = []
    let firstTextMs = -1

    const stream = createUIMessageStream({
      execute: async ({writer}) => {
        // Tools from every source; a name taken by an earlier source gets the source's prefix.
        const tools: ToolSet = {}
        const taken = new Set<string>()
        for (const source of sources) {
          let set: ToolSet
          try {
            set = await source.tools(ctx)
          } catch (err) {
            onError(err, "tool")
            continue
          }
          for (const [name, t] of Object.entries(set)) {
            const key = taken.has(name) ? `${source.name}_${name}` : name
            taken.add(key)
            if (options.tools && !options.tools.includes(key)) continue
            tools[key] = wrapTool(key, t as Tool, (run, result) => {
              runs.push(run)
              if (!cite || ui.has(key) || !run.ok) return
              for (const s of sourcesIn(result, cite.perResult)) {
                if (cited.length >= cite.max || cited.some((c) => c.url === s.url)) continue
                cited.push(s)
                writer.write({type: "source-url", sourceId: s.url, url: s.url, title: s.title})
              }
            }, (err) => onError(err, "tool"))
          }
        }

        const result = streamText({
          ...options.settings,
          model,
          ...(system ? {instructions: system} : {}),
          messages: [...history, {role: "user", content: ctx.question}],
          tools,
          stopWhen: isStepCount(maxSteps),
          maxOutputTokens,
          maxRetries: 1,
          onChunk: ({chunk}) => {
            if (firstTextMs < 0 && chunk.type === "text-delta") firstTextMs = Date.now() - t0
          },
          onEnd: (event) => {
            if (!options.onFinish) return
            let modelMs = 0
            let toolMs = 0
            for (const s of event.steps as readonly {performance?: {stepTimeMs?: number; toolExecutionMs?: Readonly<Record<string, number>>}}[]) {
              const tools = Object.values(s.performance?.toolExecutionMs ?? {}).reduce((a, b) => a + b, 0)
              modelMs += Math.max(0, (s.performance?.stepTimeMs ?? 0) - tools)
              toolMs += tools
            }
            const turn: AskTurn = {
              id: ctx.id,
              question: ctx.question,
              answer: event.text,
              tools: runs,
              sources: cited,
              messages: turns.length,
              model: event.response?.modelId ?? "",
              usage: {inputTokens: event.totalUsage.inputTokens ?? 0, outputTokens: event.totalUsage.outputTokens ?? 0},
              timing: {totalMs: Date.now() - t0, firstTextMs, modelMs: Math.round(modelMs), toolMs: Math.round(toolMs), steps: event.steps.length},
              raw: event,
            }
            const done = Promise.resolve()
              .then(() => options.onFinish!(turn, ctx))
              .catch((err) => onError(err, "finish"))
            options.waitUntil?.(done)
          },
        })
        writer.merge(
          toUIMessageStream({
            stream: result.stream,
            onError: (err) => {
              onError(err, "model")
              return "upstream"
            },
          }),
        )
      },
      onError: (err) => {
        onError(err, "model")
        return "upstream"
      },
    })

    const headers = options.headers ? await options.headers(ctx) : undefined
    return cors(createUIMessageStreamResponse({stream, ...(headers ? {headers} : {})}), allowed)
  }
}

/** The tool with its runs recorded; a thrown error becomes `{error}` for the model, not a failed turn. */
function wrapTool(name: string, t: Tool, done: (run: ToolRun, result: unknown) => void, onError: (err: unknown) => void): Tool {
  if (!t.execute) return t
  const execute = t.execute
  return {
    ...t,
    execute: async (input: unknown, opts: unknown) => {
      const start = Date.now()
      try {
        const result = await (execute as (i: unknown, o: unknown) => Promise<unknown>)(input, opts)
        done({name, ms: Date.now() - start, ok: true, input}, result)
        return result
      } catch (err) {
        onError(err)
        done({name, ms: Date.now() - start, ok: false, input}, null)
        return {error: err instanceof Error ? err.message : "The tool failed."}
      }
    },
  } as Tool
}
