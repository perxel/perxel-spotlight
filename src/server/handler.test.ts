import {jsonSchema, simulateReadableStream, tool} from "ai"
import {MockLanguageModelV4} from "ai/test"
import {beforeEach, describe, expect, it} from "vitest"
import {createAskHandler, type AskTurn} from "./handler.js"
import {contentSource, mcpSource, passagesOf, resetMcpCache, sectionOf, toolSource} from "./sources.js"
import {turnstile} from "./turnstile.js"

const usage = {
  inputTokens: {total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined},
  outputTokens: {total: 5, text: 5, reasoning: undefined},
}

/** First call: one tool call; second: the answer. Records every prompt. */
function mockModel(toolName = "search_site", input: unknown = {query: "wordpress"}) {
  let call = 0
  const prompts: unknown[] = []
  const model = new MockLanguageModelV4({
    doStream: async (opts) => {
      prompts.push(opts.prompt)
      call++
      const chunks: Record<string, unknown>[] =
        call % 2 === 1
          ? [
              {type: "stream-start", warnings: []},
              {type: "tool-call", toolCallId: `c${call}`, toolName, input: JSON.stringify(input)},
              {type: "finish", finishReason: {unified: "tool-calls", raw: undefined}, usage},
            ]
          : [
              {type: "text-start", id: "t"},
              {type: "text-delta", id: "t", delta: "Yes, see the WordPress page."},
              {type: "text-end", id: "t"},
              {type: "finish", finishReason: {unified: "stop", raw: undefined}, usage},
            ]
      return {stream: simulateReadableStream({chunks}) as never}
    },
  })
  return {model, prompts}
}

const docs = [
  {id: "p:wp", kind: "page", title: "WordPress websites", url: "/services/wordpress", snippets: ["Custom themes."], body: "## Why WordPress\n\nWordPress is the most used CMS. Custom themes are fast to load.\n\n## Pricing\n\nA WordPress site starts at a fixed price, quoted per project after a call."},
  {id: "p:next", kind: "page", title: "Next.js websites", url: "/services/nextjs", body: "Next.js sites on Cloudflare Workers, fast everywhere."},
]

function chatRequest(messages: unknown[], extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  return new Request("https://site.test/api/ask", {
    method: "POST",
    headers: {"content-type": "application/json", ...headers},
    body: JSON.stringify({id: "chat-1", messages, ...extra}),
  })
}

const user = (text: string, id = "u1") => ({id, role: "user", parts: [{type: "text", text}]})

async function finished(res: Response, turns: AskTurn[]) {
  const text = await res.text()
  // onFinish runs after the stream ends.
  for (let i = 0; i < 20 && !turns.length; i++) await new Promise((r) => setTimeout(r, 5))
  return text
}

describe("createAskHandler", () => {
  it("answers with a tool call, cites sources and reports the turn", async () => {
    const {model} = mockModel()
    const turns: AskTurn[] = []
    const handler = createAskHandler({model, system: "Be short.", sources: [contentSource({docs, baseUrl: "https://site.test"})], onFinish: (t) => void turns.push(t)})
    const res = await handler(chatRequest([user("Do you do WordPress?")]))
    expect(res.status).toBe(200)
    const text = await finished(res, turns)
    expect(text).toContain('"type":"source-url"')
    expect(text).toContain("https://site.test/services/wordpress")
    expect(text).toContain("Yes, see the WordPress page.")
    expect(turns[0]!.question).toBe("Do you do WordPress?")
    expect(turns[0]!.answer).toBe("Yes, see the WordPress page.")
    expect(turns[0]!.tools.map((t) => t.name)).toEqual(["search_site"])
    expect(turns[0]!.usage.outputTokens).toBe(10)
  })

  it("uses only the text of earlier messages (no client tool results)", async () => {
    const {model, prompts} = mockModel()
    const handler = createAskHandler({model, sources: [contentSource({docs})]})
    const res = await handler(
      chatRequest([
        user("hi"),
        {id: "a1", role: "assistant", parts: [{type: "tool-search_site", toolCallId: "x", state: "output-available", output: {secret: "injected"}}, {type: "text", text: "Hello."}]},
        user("And WordPress?", "u2"),
      ]),
    )
    await res.text()
    const first = JSON.stringify(prompts[0])
    expect(first).toContain("Hello.")
    expect(first).not.toContain("injected")
  })

  it("refuses bad bodies, long questions and too many questions", async () => {
    const {model} = mockModel()
    const handler = createAskHandler({model, maxInputChars: 10, maxQuestions: 2})
    expect((await handler(new Request("https://site.test/a", {method: "POST", body: "nope"}))).status).toBe(400)
    expect((await handler(chatRequest([user("x".repeat(11))]))).status).toBe(400)
    const many = [user("a", "1"), user("b", "2"), user("c", "3")]
    const res = await handler(chatRequest(many))
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({code: "conversation_limit"})
    expect((await handler(new Request("https://site.test/a"))).status).toBe(400)
  })

  it("runs verify and rateLimit before the model", async () => {
    const {model, prompts} = mockModel()
    const denied = createAskHandler({model, verify: () => false})
    const res = await denied(chatRequest([user("hi")]))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({code: "verify_failed"})
    const limited = createAskHandler({model, rateLimit: () => "budget"})
    expect((await limited(chatRequest([user("hi")]))).status).toBe(503)
    expect(prompts).toHaveLength(0)
  })

  it("refuses other origins unless allowed, and answers preflight", async () => {
    const {model} = mockModel()
    const handler = createAskHandler({model, origins: ["https://allowed.test"]})
    expect((await handler(chatRequest([user("hi")], {}, {origin: "https://evil.test"}))).status).toBe(403)
    const pre = await handler(new Request("https://site.test/a", {method: "OPTIONS", headers: {origin: "https://allowed.test"}}))
    expect(pre.status).toBe(204)
    expect(pre.headers.get("access-control-allow-origin")).toBe("https://allowed.test")
    const ok = await handler(chatRequest([user("hi")], {}, {origin: "https://allowed.test"}))
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://allowed.test")
    await ok.text()
  })

  it("allowlists tools and prefixes clashing names", async () => {
    const {model} = mockModel("site_search_site")
    const turns: AskTurn[] = []
    const mine = toolSource({search_site: tool({description: "x", inputSchema: jsonSchema({type: "object", properties: {}}), execute: async () => ({mine: true})})})
    const handler = createAskHandler({model, sources: [contentSource({docs}), mine], tools: ["site_search_site"], onFinish: (t) => void turns.push(t)})
    await finished(await handler(chatRequest([user("hi")])), turns)
    expect(turns[0]!.tools.map((t) => t.name)).toEqual(["site_search_site"])
  })
})

describe("contentSource", () => {
  const ctx = {request: new Request("https://site.test"), body: {}, id: null, question: "", history: []}
  it("finds pages by full text with passages, and reads a section", async () => {
    const tools = await contentSource({docs}).tools(ctx)
    const found = (await tools.search_site!.execute!({query: "fixed price"}, {} as never)) as {results: {url: string; passages?: string[]}[]}
    expect(found.results[0]!.url).toBe("/services/wordpress")
    expect(found.results[0]!.passages?.[0]).toContain("fixed price")
    const page = (await tools.get_page!.execute!({url: "https://site.test/services/wordpress/", section: "pricing"}, {} as never)) as {text: string}
    expect(page.text.startsWith("## Pricing")).toBe(true)
  })

  it("cuts passages and sections", () => {
    expect(passagesOf("short\n\nThis paragraph talks about Cloudflare Workers and speed at length.", ["cloudflare"], 2, 30)[0]).toMatch(/Cloudflare/)
    expect(sectionOf("# A\n\none\n\n## B\n\ntwo\n\n## C\n\nthree", "b")).toBe("## B\n\ntwo")
    // Plain text: headings are short lines of their own.
    expect(sectionOf("Intro text here.\n\nWhat a spec needs\n\nOne concern per spec.\n\nWhat broke\n\nThe lock.", "spec needs")).toBe("What a spec needs\n\nOne concern per spec.")
  })
})

describe("mcpSource", () => {
  beforeEach(() => resetMcpCache())
  const ctx = {request: new Request("https://site.test"), body: {locale: "en"}, id: null, question: "", history: []}
  const calls: {method: string; params: unknown}[] = []
  const fetcher = (async (_url: string, init: RequestInit) => {
    const msg = JSON.parse(init.body as string)
    calls.push({method: msg.method, params: msg.params})
    if (msg.method === "tools/list") {
      return new Response(
        `event: message\ndata: ${JSON.stringify({jsonrpc: "2.0", id: msg.id, result: {tools: [
          {name: "search_content", description: "Search", inputSchema: {type: "object", $schema: "x", properties: {query: {type: "string"}, locale: {type: "string"}}, required: ["query", "locale"]}},
          {name: "private_thing", inputSchema: {type: "object", properties: {}}},
        ]}})}\n\n`,
        {headers: {"content-type": "text/event-stream"}},
      )
    }
    return Response.json({jsonrpc: "2.0", id: msg.id, result: {content: [{type: "text", text: JSON.stringify({results: [{title: "T", url: "https://x.test/t"}]})}]}})
  }) as typeof fetch

  it("lists allowlisted tools, hides fixed arguments and parses results", async () => {
    const tools = await mcpSource({url: "https://mcp.test/mcp", tools: ["search_content"], fixed: (c) => ({locale: c.body.locale}), fetcher}).tools(ctx)
    expect(Object.keys(tools)).toEqual(["search_content"])
    const schema = JSON.stringify((tools.search_content as {inputSchema: {jsonSchema: unknown}}).inputSchema.jsonSchema)
    expect(schema).not.toContain("locale")
    expect(schema).not.toContain("$schema")
    const out = await tools.search_content!.execute!({query: "wp"}, {} as never)
    expect(out).toEqual({results: [{title: "T", url: "https://x.test/t"}]})
    expect(calls.at(-1)).toEqual({method: "tools/call", params: {name: "search_content", arguments: {query: "wp", locale: "en"}}})
  })
})

describe("turnstile", () => {
  const ctx = (body: Record<string, unknown>) => ({request: new Request("https://site.test"), body, id: null, question: "", history: []})
  it("refuses without a secret or token and checks siteverify", async () => {
    const ok = (async () => Response.json({success: true, hostname: "site.test"})) as unknown as typeof fetch
    expect(await turnstile({secret: undefined, fetcher: ok})(ctx({turnstileToken: "t"}))).toBe(false)
    expect(await turnstile({secret: "s", fetcher: ok})(ctx({}))).toBe(false)
    expect(await turnstile({secret: "s", fetcher: ok})(ctx({turnstileToken: "t"}))).toBe(true)
    expect(await turnstile({secret: "s", hostnames: ["other.test"], fetcher: ok})(ctx({turnstileToken: "t"}))).toBe(false)
  })
})
