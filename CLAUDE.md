# @perxel/spotlight

Search or ask, like Spotlight: a ⌘K box that searches a site as you type (in the browser, no request) and hands a question to an AI chat on Enter. Public on GitHub (perxel/perxel-spotlight) and npm (`@perxel/spotlight`), MIT. Plan: `.claude/plans/001-spotlight.md` (a copy of perxel-web-2026's plan 018, which keeps the perxel.com and phucbm.com sides). Consumers: perxel.com (`../perxel-web-2026`, liquid skin, `mcpSource`) and phucbm.com (`../../phucbm/folio-2026-vol2`, headless parts with its own paper styling, `contentSource` + `toolSource`).

## Commands

- `pnpm build`: `tsc` to `dist/` (gitignored) plus `liquid.css`. **Rebuild after every change**: linked sites run `dist/`.
- `pnpm dev`: `tsc --watch` (copy the CSS by hand, or run `pnpm build`, after editing `liquid.css`).
- `pnpm test`: Vitest (core search, conversation helpers, build helpers, server helper with a mock model, sources, MCP client, Turnstile).
- `pnpm typecheck`
- `examples/next`: a minimal Next app with the four modes (`pnpm --dir examples/next dev`).

## Layout

```
src/
  types.ts          the contracts: SearchConfig, AskConfig, Action/defineAction, SpotlightRequest, copy, props
  index.ts          `.`: core (no React, no AI SDK): search engine, conversation store, message helpers
  core/search.ts    buildIndex, search, fold, markTerms, snippets (from perxel.com plan 014)
  core/conversation.ts  localStorageAdapter, conversationState, textOf, sourcesOf, toolOutputOf
  core/copy.ts      English defaults
  react/            `./react`: SpotlightProvider (state, ⌘K, lazy gate/panel, iOS keyboard bridge), Trigger, Gate parts, useGate, useSearchAsk
  chat/             `./chat`: useAskChat (AI SDK useChat + transport + persistence + requests + actions), Chat parts. Only the panel imports it.
  liquid/           `./liquid` + `liquid.css`: SpotlightLiquid, the glass gate and panel (lazy chunks), plain CSS with `sp-` classes and `--sp-*` variables
  server/           `./server`: createAskHandler (Web Request → Response), contentSource, toolSource, mcpSource (fetch-only MCP client), turnstile
  build/            `./build`: markdownHeadings, dropCommonHeadings, buildSearchDocs, writeSearchIndex (Node)
```

## Rules

- Search and Ask are independent: the core and `./react` never import `ai` or `@ai-sdk/react`; only `./chat`, `./liquid/panel` and `./server` do. A page that never asks never loads the AI SDK.
- No platform assumptions: no Next.js import anywhere (navigation is a prop), no Cloudflare/Vercel API in `./server`, no AI provider (the site passes an AI SDK model).
- No Perxel copy, brand or actions in the package. English defaults only; sites pass their copy.
- The liquid skin is plain CSS (no Tailwind); state comes from `data-*` attributes on the headless parts.
- Imports inside `src/` end in `.js` (NodeNext).
