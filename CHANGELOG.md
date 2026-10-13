# Changelog

## 0.1.1

- Server: a new error code, `config`, for a route that is set up wrong: the model has no API key, or the provider refused it (401/403). It used to end as `upstream` ("Please try again"), which hid the cause. The default `onError` log says to check the key. A `model` function that throws (a site checking its key) now refuses with `config` (503) before any call. `modelErrorCode(err)` is exported.
- Copy: `errors.config` ("Ask is not available right now.").
- README: where API keys come from per platform (OpenNext: `getCloudflareContext().env`, `initOpenNextCloudflareForDev()` for `next dev`).

## 0.1.0

First release. Built from perxel.com's Ask Perxel (search gate and chat panel) and tried on two sites before release: perxel.com (liquid skin, answers through an MCP server) and phucbm.com (its own paper styling on the headless parts, answers from its pages and live data, no MCP).

- Core (`@perxel/spotlight`): the search engine (accent folding, every word must match, snippets that explain a match), conversation storage, message helpers, the contracts.
- Headless React: `./react` (provider, ⌘K, the iOS keyboard bridge, lazy gate and panel, trigger, `turnstileWidget`), `./gate` (gate parts and hooks), `./chat` (`useAskChat` on the AI SDK, chat parts, markdown).
- Liquid skin: `./liquid` and its CSS, themed with `--sp-*` variables, reduced motion and reduced transparency respected.
- Server: `createAskHandler` (Web `Request` → `Response`, stateless), `contentSource`, `toolSource`, `mcpSource` (no SDK), `turnstile`.
- Build: `markdownHeadings`, `dropCommonHeadings`, `buildSearchDocs`, `writeSearchIndex`.
