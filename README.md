# @perxel/spotlight

Search or ask, like Spotlight. Press ⌘K: the box searches your site as you type, in the browser, with no request and no model call. Press Enter with nothing highlighted and the question goes to an AI chat that answers from your site.

![The liquid skin on perxel.com: results as you type "next", the typed word marked in each row](https://raw.githubusercontent.com/perxel/perxel-spotlight/main/docs/perxel-gate.webp)

- **Search and Ask are independent.** Give it documents, an endpoint, or both. Whatever you leave out is never loaded.
- **Headless first.** Behaviour, keys, focus, ARIA and state (`data-*`) in React parts you style yourself. A **liquid glass skin** ships as the default, themed with CSS variables.
- **No platform assumptions.** No Next.js import in the client (navigation is a prop), a Web-standard server helper (`Request` → `Response`: Next route handlers, Workers, Hono, Node), any [AI SDK](https://ai-sdk.dev) model, MCP optional.
- **Nothing in first load** but the provider and your trigger: the box, the chat, the index and the AI SDK are lazy chunks.

Built for [perxel.com](https://perxel.com) (liquid skin, answers through an MCP server) and [phucbm.com](https://phucbm.com) (its own "research paper" styling on the headless parts, answers from its pages and live data, no MCP).

| perxel.com: the liquid skin's chat panel | phucbm.com: the headless parts, its own styling |
|---|---|
| ![The chat panel answering a question, with the pages it used folded under the answer](https://raw.githubusercontent.com/perxel/perxel-spotlight/main/docs/perxel-panel.webp) | ![A plain, paper-like search box on phucbm.com](https://raw.githubusercontent.com/perxel/perxel-spotlight/main/docs/phucbm-gate.webp) |

| Search only | Ask only | Both |
|---|---|---|
| Plain site search; Enter opens the first result; the chat code never loads | A prompt box; the search code and index never load | Results as you type; Enter with nothing highlighted asks |

## Install

```sh
pnpm add @perxel/spotlight
# for Ask:
pnpm add ai @ai-sdk/react
```

React 19. `ai` and `@ai-sdk/react` are optional peers, needed only for Ask.

## Quick start (liquid skin)

```tsx
"use client"
import {SpotlightLiquid, Trigger} from "@perxel/spotlight/liquid"

export function Providers({children}: {children: React.ReactNode}) {
  return (
    <SpotlightLiquid
      search={{load: () => fetch("/search.json").then((r) => r.json())}}
      ask={{endpoint: "/api/ask"}}
    >
      {children}
      <Trigger>Search ⌘K</Trigger>
    </SpotlightLiquid>
  )
}
```

The skin imports its own CSS from its lazy chunks (`@perxel/spotlight/liquid.css` is exported too, for bundlers that skip CSS imported from packages).

## Search

A document is a `SearchDoc`:

```ts
{id: "note:og-images", kind: "note", title: "Dynamic OG images", subtitle: "Note", url: "/notes/og-images",
 keywords: ["satori", "next/og"],          // matched, never shown
 snippets: ["Fonts", "What broke", "…"]}   // matched, and shown under a result whose title lacks a typed word
```

Matching: every typed word must match; accents and case are folded (`đ` → `d`, so Vietnamese works typed without accents); one- and two-letter words only match word starts. When nothing matches every word, the documents matching the most words show. Options: `limit` (8), `kindOrder`, `snippetLength` (80).

Give it `search={{docs}}` for a few documents, or `search={{load}}` (recommended) for a lazy file: a dynamic `import()` of a generated JSON, or a `fetch` of a static route. Build helpers for Node: `@perxel/spotlight/build` (`markdownHeadings`, `dropCommonHeadings` for template headings found in many posts, `buildSearchDocs`, `writeSearchIndex`). The package reads no CMS: you map your content.

## Ask

The default transport is the AI SDK UI message stream with the whole conversation in each request, so any `useChat`-compatible endpoint works.

```ts
ask={{
  endpoint: "/api/ask",
  body: async () => ({locale, turnstileToken: await bot.token()}),   // per request
  prepare: () => bot.prepare(),                                       // when the box opens
  persist: localStorageAdapter({key: "my-chat", days: 7}),            // default; `false` for none
  continueHours: 24,      // a question from the box continues a conversation younger than this
  maxInput: 1000,
}}
```

`transport` takes any AI SDK `ChatTransport` instead of `endpoint`, for a backend that keeps its own history or sessions.

### The server helper

```ts
// app/api/ask/route.ts
import {createOpenRouter} from "@openrouter/ai-sdk-provider"
import {contentSource, createAskHandler, mcpSource, toolSource, turnstile} from "@perxel/spotlight/server"

export const POST = createAskHandler({
  model: createOpenRouter({apiKey: process.env.OPENROUTER_API_KEY})("anthropic/claude-haiku-5.5"),
  system: "You answer questions about this site, only from tool results…",
  sources: [
    contentSource({docs, baseUrl: "https://example.com"}),       // the site's pages: search_site, get_page
    toolSource({get_stats: tool({...})}),                         // the site's own functions
    mcpSource({url: "https://mcp.example.com/mcp", tools: ["search_content", "get_item"]}),
  ],
  verify: turnstile({secret: process.env.TURNSTILE_SECRET}),
  rateLimit: async (ctx) => true,          // or false / an error code
  onFinish: (turn) => log(turn),           // question, answer, tools, sources, tokens, timing
})
```

- **Stateless**: the client sends the history; only its text reaches the model (tool results and sources from the client are dropped).
- **Three kinds of source**, mixed freely. `contentSource` searches and reads your pages with short passages per hit and capped pages (no MCP needed). `toolSource` runs your own AI SDK tools in the route (live numbers, structured data). `mcpSource` calls a remote MCP server over streamable HTTP with no SDK, any runtime with `fetch`; `fixed` sets arguments the model never sees (a locale), `tools` allowlists: an anonymous chat must never reach a private tool.
- **Sources cited**: `{url, title}` pairs in tool results become `source-url` parts (4 at most, 2 per result; `cite: false` turns it off).
- **Refusals** are `{code}` JSON (`verify_failed`, `rate_limited`, `conversation_limit`, `budget`, `bad_request`, `origin`, `upstream`); the panel shows `copy.errors[code]`.
- **Limits**: `maxInputChars` (1000), `maxQuestions` (20), `maxHistory` (20), `maxSteps` (4), `maxOutputTokens` (700). CORS only when `origins` is set.
- On Workers, pass `waitUntil` so `onFinish` outlives the response.

Bot check on the client: `turnstileWidget({siteKey})` from `@perxel/spotlight/react` (script injected on `prepare()`, invisible unless Cloudflare is unsure, a fresh token per question).

## Actions

Things a visitor can do from the box or from an answer (a contact form, a newsletter signup). The package ships none.

```tsx
const contact = defineAction({
  id: "contact",
  search: {title: "Send us a message", keywords: ["contact", "hire"]},  // a search result (or a doc with id "action:contact" in your index)
  fromSearch: (typed) => ({message: typed}),
  tool: "prepare_contact",           // a finished answer with this tool's output opens it
  fromTool: (output) => output,
  view: ContactForm,                 // shown in the panel: ({input, messages, conversationId, back, close})
  title: "Contact", label: "Open the contact form", hint: "to open the form",
})
```

An action can `run(input)` instead of showing a view (navigate, open your own dialog). Keep views lazy (`React.lazy`) so forms stay out of first load.

## Headless

```tsx
import {SpotlightProvider, Trigger, useSpotlight} from "@perxel/spotlight/react"
<SpotlightProvider search={…} ask={…} gate={() => import("./MyGate")} panel={() => import("./MyPanel")}>
```

The gate module (`@perxel/spotlight/gate`): `Gate.Root` (Radix dialog, focus in and back, Escape clears a highlight first), `Gate.Input`, `Gate.Results` (render function per result), `Gate.Item` (link or button, `data-highlighted`, `data-kind`), `Gate.Marked`, `Gate.Hint` (`data-on` while Enter does something), `Gate.Send`, `Gate.Close`; `useGateContext()` for everything else. The panel module (`@perxel/spotlight/chat`): `useAskChat()` (messages, send, stop, status, `errorCode`, the current view, actions from answers, `textOf`, `sourcesOf`), `Chat.Panel`, `Chat.Title`, `Chat.Close`, `Chat.Messages` + `Chat.Content` (stick to bottom), `Chat.ScrollButton`, `Chat.Composer`, `Chat.Submit`, `Chat.Markdown`. Import these two entries only from your lazy gate and panel modules.

Other props: `navigate(url, {newTab, from})` (default: `location`, other sites in a new tab), `shortcut` (`"mod+k"`, another key, or `false`), `enabled`, `copy` (English defaults; pass your language), `prefetch` (the box's code once the page is idle).

## Theming the liquid skin

Set the variables on `:root` or on the skin's `className`:

| Variable | What |
|---|---|
| `--sp-accent` | Marks, the highlight's tint, the tide, the send button's hover |
| `--sp-ink` | Text on the accent glass |
| `--sp-text`, `--sp-muted`, `--sp-subtle` | Text tones |
| `--sp-surface`, `--sp-bubble`, `--sp-quiet` | Panel, the visitor's bubble, quiet fills |
| `--sp-button`, `--sp-button-text`, `--sp-button-hover` | The round send/stop button |
| `--sp-glass-fill`, `--sp-glass-edge`, `--sp-glow`, `--sp-lift` | The glass |
| `--sp-gate-fill`, `--sp-pill-fill` | The box over the page; the panel's header pill |
| `--sp-font`, `--sp-font-display`, `--sp-display-weight` | Type |
| `--sp-dim`, `--sp-dim-blur`, `--sp-z` | The page behind the box; stacking |

Skin options: `logo`, `privacyNote`, `handoff(chat)`, `composerExtra(chat)`, `uiTools`, `localHosts`, `tide`, `gateProps` / `panelProps` (attributes on the roots), `className`. Reduced motion and reduced transparency are respected.

## Local development against a site

Link it as a pnpm injected dependency, so the package resolves the site's own React and AI SDK (a plain `link:` brings its dev copies along):

```json
"dependencies": {"@perxel/spotlight": "file:../perxel-spotlight"},
"dependenciesMeta": {"@perxel/spotlight": {"injected": true}}
```

After a change, `scripts/sync.sh ../my-site` rebuilds and copies `dist/` in.

## License

MIT © Perxel
