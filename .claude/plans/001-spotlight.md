# Plan 018: `@perxel/spotlight` (search or ask, as a standalone React package)

Status (2026-10-13): released. `@perxel/spotlight@0.1.0` on npm (tag v0.1.0, github.com/perxel/perxel-spotlight); perxel-mcp (ingest) and perxel.com (Ask on the package) deployed; phucbm.com committed and pushed, its deploy hit the Cloudflare free-plan KV write limit (10048) and re-runs after 00:00 UTC. Owner browser pass done before release. 0.1.1 the same day (the `config` error code, after phucbm.com's empty key; see "0.1.1"), published through a GitHub release with trusted publishing; both sites on `^0.1.1`. Open: phucbm.com's own capped OpenRouter key (it uses the borrowed one).
Written: 2026-10-12, from a discussion with the owner the same day.
Related: plan 010 (Ask Perxel), plan 013 (Ask actions), plan 014 (search or ask), plan 015 (search gate), plan 017 (social kit: the packaging precedent), folio-2026-vol2 plan 001 ("MCP and Ask (deferred)", superseded by this plan for phucbm.com).

## Goal

The Spotlight-style "search or ask" feature that perxel.com has today (⌘K gate, results as you type, Enter asks, chat panel) becomes a standalone React package, `@perxel/spotlight`, with as little hardcoded as possible. Two real consumers before the first release:

1. **perxel.com** (this repo): today's feature, rebuilt on the package. Liquid skin, two locales, **Ask answers from an MCP** (perxel-mcp), the lead and newsletter actions.
2. **phucbm.com** (`~/PHUC-LOCAL/phucbm/folio-2026-vol2`): a "research paper" design that has nothing in common with the liquid glass, one locale (English), **Ask answers with no MCP**: its own pages (`contentSource`) and its own live data (`toolSource`).

The two consumers deliberately use different kinds of source, so both ways of feeding Ask are tried on a real site before 0.1.0 (decision 7).

Two consumers this different are the test of "standalone": whatever phucbm.com has to work around is a hardcoded assumption to remove before 0.1.0.

Flow: **split the package → perxel.com runs on it → phucbm.com set up on it → fix what phucbm.com found → release 0.1.0 with both consumers on the npm version.**

## Principles (owner, 2026-10-12)

1. **Search and Ask are independent.** Search needs only documents; Ask needs only an endpoint. Neither imports the other's code. Each loads lazily, only when present.

   | `search` given | `ask` given | The gate |
   |---|---|---|
   | yes | yes | Results as you type; Enter with nothing highlighted asks (today's perxel.com) |
   | yes | no | Plain Spotlight search; Enter opens the first result; the chat code is never loaded |
   | no | yes | A prompt box; Enter asks; the search code and index are never loaded |
   | no | no | Nothing renders, ⌘K stays unbound |

2. **No platform assumptions.** A React package: no Next.js import in the client (navigation is a prop), no Cloudflare or Vercel in the server helper (it is a Web `Request → Response` function), no AI provider (the server helper takes an AI SDK model), no MCP required (MCP is one kind of source).
3. **Our look is the default, not the only one.** The liquid glass ships as an optional skin themed with CSS variables. Under it is a headless layer (behaviour, keys, focus, ARIA, state as `data-*` attributes) that a site can dress with shadcn, AI Elements, plain Tailwind or its own CSS. phucbm.com is the proof: it uses the headless layer with its own paper styling.
4. **Everything site-specific is a module or a prop.** Actions (Perxel's lead form and newsletter), copy, navigation, persistence, the chat transport, bot protection. The package ships none of Perxel's actions, copy or brand.
5. **Nothing goes into a page's first load** beyond the trigger and the provider (perxel.com's current rule, `performance.md`, "Ask adds nothing to first load"): the gate, the panel, the index and the AI SDK are separate lazy chunks.

## What the package provides

### Entry points

| Import | What | Runs in |
|---|---|---|
| `@perxel/spotlight` | Core, no React: search engine (`buildIndex`, `search`, `fold`, `markTerms`, snippets; today's `lib/search-ask/core.ts`), types (`SearchDoc`, `Action`, `ChatTransport`), conversation store logic | anywhere |
| `@perxel/spotlight/react` | Headless: `<Spotlight.Provider>`, gate parts, chat parts, hooks (`useSpotlight`, `useSearchAsk`, `useAskChat`), ⌘K, the iOS keyboard bridge | browser |
| `@perxel/spotlight/liquid` + `@perxel/spotlight/liquid.css` | The default skin: `<SpotlightLiquid>` (gate + panel, styled), its CSS | browser |
| `@perxel/spotlight/server` | `createAskHandler(...)`, sources (`mcpSource`, `contentSource`), verify helpers (`turnstile`) | server, any Web-standard runtime |
| `@perxel/spotlight/build` | `buildSearchDocs(...)`, `writeSearchIndex(...)`, heading filter: build-time index helpers | Node, build time |

### Search (client)

- Input: `search={{ docs }}` or `search={{ load: (locale) => import(...) }}` (lazy, the default and recommended). `SearchDoc` stays as today (`id`, `kind`, `title`, `subtitle?`, `url?`, `keywords?`, `snippets?`).
- Matching and ranking unchanged from plan 014 (accent folding, every word must match, snippets explaining the match). Options: `limit`, `kindOrder`, `snippetLength`.
- Build helper: `buildSearchDocs({items, pages, headings?})` with the "drop headings found in 3 or more posts" filter from plan 014; `writeSearchIndex(docs, path)`. A site maps its own content to items; the package does not read any CMS.

### Ask (client)

- Input: `ask={{ endpoint }}` (default transport) or `ask={{ transport }}` (custom).
- **Default transport: the AI SDK UI message stream**, the client sending the whole conversation each turn (the AI SDK's standard, so any `useChat`-compatible endpoint works, including the package's own server helper).
- **Custom transport:** an object with `prepare()` (called when the gate opens, e.g. fetch a bot-check token), `send({messages, ...})` and optional hooks for session headers and retries. Neither consumer needs one at 0.1.0 (both use the default with the package's server helper, decision 11); the interface exists for backends that keep their own history or sessions.
- Conversation persistence: `persist={localStorageAdapter({key, days})}` (default), or `persist={false}`, or a custom adapter. "Continue if the last question is under N hours old" is an option (`continueHours`), today's `askConfig.continueHours`.
- Message rendering: the headless parts hand over message parts (text, sources, tool results); the liquid skin renders markdown with Streamdown (a dependency of the skin entry only).

### Actions (modules)

An action is registered by the site, never shipped by the package:

```ts
const leadAction = defineAction({
  id: "lead",
  search: { title: "...", keywords: [...] },   // optional: makes it a search result
  tool: "prepare_lead",                         // optional: the model may open it from an answer
  view: LeadForm,                               // what opens (inside the panel, or the site's own dialog)
})
<Spotlight actions={[leadAction, subscribeAction]} />
```

- From search: the result opens the view with the typed text as input (today's behaviour, plan 014).
- From an answer: when a finished answer holds the action's tool output, the panel opens the view and keeps a row under the answer to reopen it (plan 013).
- The view gets `{input, conversation, close, back}`; it posts wherever the site wants. Perxel's lead and newsletter forms stay in this repo.

### Copy, navigation, chrome

- Copy: a dictionary with English defaults only (decision 6); every string overridable, perxel.com passes its Vietnamese. No brand name in the package: "Ask Perxel" is Perxel's copy.
- `navigate(url, {newTab})`: default `location.assign`; perxel.com passes its router plus page tide, phucbm.com Next's router.
- Slots for site chrome inside the panel: `privacyNote`, `handoff` (Perxel's "Send to Perxel" block), header logo.
- Pass-through attributes on the roots (`rootProps`), for Perxel's `data-no-magnet`, `data-lenis-prevent`, `data-no-tide`.
- Triggers: `<Spotlight.Trigger>` (headless) and `useSpotlight().open()`, so a site wires any button, its nav or a dock. ⌘K on by default, configurable or off.

### Server helper (optional)

```ts
export const POST = createAskHandler({
  model: openrouter("anthropic/claude-haiku-5.5"),     // any AI SDK model
  system: "...",
  sources: [
    mcpSource({ url: "https://mcp.example.com/mcp", headers, tools: ["search_content", "get_item"] }),
    contentSource({ docs, bodies }),                     // no MCP: search + read the site's own content
    toolSource({ get_repos: tool({ ... }) }),            // the site's own functions (AI SDK tools): live or structured data
  ],
  verify: turnstile({ secret }),                         // optional bot check
  rateLimit,                                             // optional hook
  onFinish,                                              // optional: log, store, metrics
})
```

- Web-standard: mounts as a Next route handler, a Worker `fetch`, Vercel, Hono, Node.
- Stateless by default (the client sends the history). Storage, metrics and conversation review are the site's `onFinish`; the package keeps no database.
- `contentSource` gives the model two tools built from the same documents as search plus full text (`search_site`, `get_page`), so a site with no MCP still gets grounded answers. phucbm.com is its first user.
- `toolSource` takes plain AI SDK tools the site writes; they run in the same route. phucbm.com's first two: `get_stats({year})` (commits, npm downloads, jsDelivr hits, WordPress downloads, books, summed from `getLive()`, the same numbers `/stats` and `/oss` show) and `get_repos` (the tracked repos across phucbm, viivue and perxel with stars, description, year). Only the tracked repos, not every repo in the orgs (no GitHub API call at question time).
- **Token budget, same as perxel-mcp's tools**: `search_site` returns a few short matching passages per hit (perxel-mcp's search hits carry passages, so most answers need no second call), not whole pages; `get_page` returns a page capped in length, or one section by heading. Options: `maxHits`, `passageLength`, `pageLength`. Nothing is stuffed into the system prompt. Measure input tokens per turn on phucbm.com against perxel-mcp's figures (`ask.turn` rows) in phase 6.
- Three kinds of source, mixed freely: `contentSource` (pages and text), `toolSource` (plain AI SDK tools the site writes, run in the same route: live numbers, filters over structured data, an outside API), `mcpSource` (tools on a remote MCP, when the data lives in another system or is shared with other agents). phucbm.com uses the first two: its live data (GitHub stars per repo, npm downloads, books; `lib/live.ts`, KV) is not in its pages' text, so "which repo has the most stars" needs a `toolSource` tool reading `getLive()`.
- Tool names are prefixed per source when two sources clash; `tools` allowlists what the model may call.
- The API key lives only in the server's environment; the client never sees it.

### What stays out of the package

perxel-mcp, the MCP kit, the kit's `/ask` endpoint, Perxel's actions and forms, the dock capsule, the page tide, the cursor magnet, Perxel copy and brand, conversation storage and dashboards.

## Repo and tooling

- **Repos touched:** `perxel/perxel-spotlight` (new), `perxel-web-2026`, `folio-2026-vol2`, and `perxel-mcp` (decision 11: the turn-log ingest endpoint and the lead flag; a push there deploys mcp.perxel.com, so it ships before perxel.com's new Ask). Later, a kit-repo plan removes `kit/ask`.
- **Checked 2026-10-12:** `gh` can create repos in the `perxel` org; npm is logged in as a user with write on `@perxel/*`; `@perxel/spotlight` is free; mcp.perxel.com answers `tools/list` anonymously (public tools only), so `mcpSource` needs no token.

- New public repo **`perxel/perxel-spotlight`** at `~/PHUC-LOCAL/perxel/perxel-spotlight`, set up like the social kit (plan 017): MIT, pnpm, `tsc` build to `dist/`, `exports` per entry point, `publishConfig.access: public`, GitHub release → npm via `phucbm/publish-npm-action` with OIDC trusted publishing, its own `CLAUDE.md` and `.claude/plans/`.
- Peer dependencies: `react >=19`, `react-dom >=19`; `ai` and `@ai-sdk/react` as optional peers (only the Ask parts import them); `@radix-ui/react-dialog` a dependency (focus trap, scroll lock, portal); Streamdown a dependency of `liquid` only; no `lucide-react` (inline SVG icons).
- The liquid skin's CSS is **plain CSS with `sp-` classes and CSS variables**, shipped prebuilt, so a consumer needs no Tailwind and no `@source` line. (Today's gate and panel use Tailwind classes; they get rewritten.)
- Tests in the package: Vitest for the core (today's `core.test.ts` moves there), the hook's key handling, the transport, the server helper with a mock model. The perxel.com rule limiting tests does not apply to the package repo.
- `examples/next` in the package repo: a minimal Next app with the four modes behind a switch, used for the package's own checks and screenshots for the README.
- During development both sites depend on it with `link:../perxel-spotlight` (perxel.com) and `link:../../perxel/perxel-spotlight` (phucbm.com), the package in `tsc --watch`. Turbopack may refuse files outside the project root: set `turbopack.root` or use `pnpm pack` tarballs if it does (check first, phase 1).

## Parallel tracks

The phases below are the units of work; this is the order they run in. Three repos (package, perxel.com, phucbm.com) and separate folders inside the package (`src/react`, `src/server`, `src/liquid`) keep tracks from touching the same files. Each track runs in its own git worktree (or its own repo), so nothing half-done lands on a site's `main`; perxel.com and phucbm.com push only at the end of their own phase (a push deploys both).

**Stage A, one track (must come first):** phase 0, phase 1, and the **contracts**: `src/types.ts` with `SearchDoc`, `ChatTransport`, `Action` / `defineAction`, `SpotlightProps`, the part names and `data-*` attributes, the server helper's options and source interface, and the list of CSS variables. Every other track codes against these. A later change to them is made in Stage A's file only, by one track, and announced to the others.

**Stage B, five tracks at once:**

| Track | Work | Repo / folder | Needs |
|---|---|---|---|
| B1 Headless | Phase 2 | package `src/react` | contracts |
| B2 Server | Phase 4's server half: `createAskHandler`, `mcpSource`, `contentSource`, `toolSource`, `turnstile`, tests with a mock model, the example route | package `src/server`, `examples/next/app/api` | contracts |
| B3 Liquid CSS | Phase 3's stylesheet only: tokens, both liquid tones, gate and panel layout, motion and fallbacks, written against the part names and `data-*` attributes | package `src/liquid/*.css` | contracts |
| B4 perxel.com prep | `app/api/ask` routes on `createAskHandler` + `mcpSource` (decision 11), perxel-mcp's ingest endpoint, `leadAction` / `subscribeAction` around today's forms, the Vietnamese and English dictionaries from `i18n/common.*.ts`, Perxel's variable values | perxel.com, a worktree | contracts |
| B5 phucbm.com prep | Search adapter + `writeSearchIndex` in its `content-meta.mjs`, the `get_stats` / `get_repos` functions over `getLive()`, the system prompt, privacy note and `/colophon` line drafted (its `copywriting` skill) | phucbm.com, a worktree | phase 1 |

**Stage C, three tracks at once** (after B1; B3 for C1, B2 for C3's Ask):

| Track | Work | Needs |
|---|---|---|
| C1 Liquid skin | Phase 3's components: B3's CSS on B1's parts, then `examples/next` with all four modes | B1, B3 |
| C2 perxel.com | Phase 5 on the package, parity checklist, performance checks | C1, B4 |
| C3 phucbm.com | Phase 6: the paper skin on the headless parts (does not wait for C1), the Ask route on B2, the findings log | B1, B2, B5 |

C3 starts before C1 ends, so phucbm.com's findings reach the API early, before the liquid skin and perxel.com have been built on the wrong shape.

**Stage D, one track:** phase 7 (fix round across all three repos), then phase 8 (release).

```
A ──┬─ B1 headless ──┬─ C1 liquid skin ── C2 perxel.com ─┐
    ├─ B3 liquid CSS ┘                                    ├─ D fix round → 0.1.0
    ├─ B2 server ────────── C3 phucbm.com ───────────────┘
    ├─ B4 perxel prep ────── (into C2)
    └─ B5 phucbm prep ────── (into C3)
```

**Who runs what.** Claude supervises: Stage A, B1, B2, C1, C2 and every merge are Claude's (API design and parity need judgement). B3, B4's dictionaries, B5's adapter and the README's example blocks are mechanical against a written contract: hand them to opencode (`opencode-delegate` skill, global rule) and review. Subagents in worktrees for B1/B2 in parallel when the owner wants speed over Claude usage. Browser checks stay the owner's (or a CDP script), never Chrome MCP without asking.

**Sync points.** End of Stage A (contracts frozen for Stage B), end of B1 (headless API shown to the owner with `examples/next` unstyled), first C3 finding round (API changes before C1/C2 go further), end of C2 (owner's browser pass, then perxel.com push), end of D.

## Phases

Each phase ends with the checks listed. Browser checks need the owner's go-ahead (global rule); without it they are listed as not done.

### Phase 0: decisions and scaffold
- Create the repo (README stub, LICENSE, `package.json` with the entry points, tsconfig, Vitest, publish workflow idle until the first release, `CLAUDE.md`).
- Copy this plan into the package repo as its plan 001; this file keeps the perxel.com and phucbm.com sides.
- Check: `pnpm build` and `pnpm test` pass on the empty scaffold; perxel.com installs it through `link:` and `next dev` starts.

### Phase 1: core and build helpers
- Move `lib/search-ask/core.ts` and its tests into `src/core/` unchanged, then the index helpers from `scripts/search-index.mjs` (generic part only) into `src/build/`.
- perxel.com: `lib/search-index.ts` (the adapter) and `scripts/search-index.mjs` stay, now calling `@perxel/spotlight/build`; `lib/search-ask/core.ts` deleted, imports point at the package.
- Check: perxel.com's generated `content/search.<locale>.generated.json` byte-identical before and after; a fixed list of about 30 queries (both locales, accents, snippets, actions) returns the same results before and after (a throwaway script, not kept as a perxel.com test).

### Phase 2: headless React layer
- `Spotlight.Provider`: open state, the request handed from gate to panel (today's `AskRequest`, generalised: `ask`, `action`, `show`), the four modes, lazy loading of gate, panel and index, `prepare()` on gate open, ⌘K, the iOS keyboard bridge (plan 015, decision 8), focus return.
- Gate parts: `Gate`, `Input`, `Results`, `Item`, `Hint`, `Close`; the hook from `lib/search-ask/react.ts` grows into these (keys, ARIA, highlight, `askRow`, `extras`).
- Chat parts: `Panel`, `Messages`, `Message`, `Sources`, `Composer`, `Stop`, `NewChat`, `ActionRow`; `useAskChat` wraps `useChat` with the transport and persistence.
- State as `data-*`: `data-state="open|closed"`, `data-highlighted`, `data-mode`, `data-status="streaming|ready|error"`.
- Check: `examples/next` runs the four modes with unstyled parts; keyboard-only run of each mode (owner or a CDP script, not Chrome MCP without asking).

### Phase 3: liquid skin
- Port `AskGate` and `AskPanel`'s look to `src/liquid/` on the headless parts: the white and blue liquid tones, the gate layout (desktop and phone), the panel (desktop card, phone sheet, glass header and composer, the tide), motion with `prefers-reduced-motion` and `prefers-reduced-transparency` fallbacks. Spec: the "Ask Perxel (chat panel)" section of `.claude/docs/design.md`.
- CSS variables (first cut): `--sp-accent` (Perxel brand blue), `--sp-ink` (navy), `--sp-surface`, `--sp-glass-fill`, `--sp-glass-edge`, `--sp-glow`, `--sp-lift`, `--sp-radius`, `--sp-font`, `--sp-font-display`, `--sp-dim`, `--sp-z`. Perxel's values in this repo's CSS; the package's defaults neutral (grey glass, system font).
- Scroll areas inside the skin: the package's own thin scrollbar (no shadcn dependency); perxel.com's ScrollArea rule (`design.md`, "Scrollable areas") is met by passing the same look through the variables.
- Check: side by side with today's perxel.com (screenshots by the owner or a CDP script): no visible difference beyond what is listed as accepted.

### Phase 4: Ask transport, actions, server helper
- Default transport (AI SDK stream, full history) and the `ChatTransport` interface.
- `defineAction`, action results in search, action tool outputs in answers, the reopen row.
- `createAskHandler`, `mcpSource` (AI SDK MCP client), `contentSource`, `toolSource`, `turnstile`, tool prefixing and allowlist. Tests with a mock model.
- Check: `examples/next` asks through `createAskHandler` with a real OpenRouter key from `.env.local`, once per kind of source: `contentSource` over its sample pages, a `toolSource` tool, and `mcpSource` against mcp.perxel.com's public tools (anonymous, so only `access: "public"` tools are listed); package tests green.

### Phase 5: perxel.com on the package
- Replace `components/ask/*` and `lib/search-ask/*` with the package. What stays in this repo:
  - `app/api/ask/route.ts` (decision 11): `createAskHandler` + `mcpSource` (mcp.perxel.com, public tools allowlisted) + `turnstile`, `onFinish` to perxel-mcp's ingest endpoint; `app/api/ask/summary/route.ts` for the lead form. On the perxel-mcp side (its repo): the ingest endpoint writing `ask.turn` rows and the lead flag.
  - Actions: `leadAction`, `subscribeAction` with today's `LeadForm` and `SubscribeForm`.
  - Copy from `i18n/common.*.ts` mapped to the package dictionary; privacy note and handoff block as slots.
  - Wiring: the header button (`Button variant="liquid"`), `AskHeroButton`, the dock capsule (through `useSpotlight()`), `navigate` with the page tide, `rootProps` for `data-no-magnet` and `data-lenis-prevent`.
  - Perxel's CSS variable values.
- Parity checklist, one line per behaviour in `design.md` ("Ask Perxel") and plans 013 to 015: four modes not needed here (both on), every gate behaviour, every panel behaviour, actions from search and from answers, Turnstile on gate open, conversation continuing after 24 h, `px-ask` storage kept (same key, so visitors keep their conversation), iOS keyboard.
- Performance: no prerendered HTML references the gate, panel or index chunks; every `/_next/static` path in the HTML exists; first-load JS on `/` within 1 KB brotli of before; panel chunk size noted.
- Docs: `architecture.md` "Ask Perxel" rewritten around the package (what lives where), `design.md` points the Ask sections at the skin plus Perxel's variables, `CLAUDE.md`'s test line (no more `lib/search-ask/core.ts`).
- Check: `pnpm build`, `pnpm test`, owner's browser pass on desktop and an iPhone, then push (a push deploys).

### Phase 6: phucbm.com on the package
- Search: index from its catalog (`lib/content/` is a copy of Perxel's, so the adapter is short) plus its static pages (`/stats`, `/oss`, `/reading`, `/references`, `/colophon`, `/cv`…); `writeSearchIndex` in its `scripts/content-meta.mjs`.
- Ask (decisions 1 and 7): an `app/api/ask/route.ts` on its OpenNext Worker with `createAskHandler`, `contentSource` from its catalog and `content/body.generated.json` (already generated), OpenRouter key and Turnstile secret as Worker secrets, no storage (decision 3), a first-person system prompt.
- Skin: **headless parts with the paper styling** (tokens from its `.claude/docs/design.md`: paper, ink, rule, accent; serif/sans/mono roles; no glass), built in its `components/spotlight/`. The `paper` skill's rules apply.
- Tools: `toolSource` with `get_stats` and `get_repos` (B5). Test questions: "which repo has the most stars", "how many npm downloads this year", "what did you write about OG images" (the last through `contentSource`).
- Trigger: in the running head, plus ⌘K.
- Privacy: a short note in the panel and a line on `/colophon` (what is sent, to whom, kept or not). Copy through phucbm.com's own `copywriting` skill.
- **Issue log**: every workaround, missing prop, wrong default or hardcoded assumption found goes into "phucbm.com findings" below, with what changes in the package.
- Check: its `pnpm build` (with `check-paper` and `check-seo`), `pnpm cf:build`, `pnpm preview`; owner's browser pass.

### Phase 7: fix round
- Every finding from phase 6 fixed in the package; both sites updated to the changed API; parity checklist rerun on perxel.com.
- API review before freezing 0.1: names, defaults, what is exported, what is internal.

### Phase 8: release 0.1.0
- README: what it is, the four modes (with a screenshot each from `examples/next`), install, search setup, Ask setup (endpoint, server helper, custom transport), actions, headless usage, theming variables, performance notes (what loads when), the two consumers as examples.
- `CHANGELOG.md`, GitHub release `v0.1.0` → npm.
- Both sites switch from `link:` to `^0.1.0`, build, deploy.
- Suggested, not part of this plan unless asked: a product page on perxel.com (like the social kit's) and a note on phucbm.com.

## Risks

- **API design is the hard part.** A headless layer that suits shadcn users without making the liquid skin awkward. phucbm.com is the counterweight; resist exporting internals "just in case" before it needs them.
- **Parity on perxel.com.** The current gate and panel carry many small decisions (design.md, plans 013 to 015). The checklist in phase 5 is the guard; regressions there are visible on the main site.
- **perxel.com's Ask moves off the kit's `/ask`** (decision 11): the dashboard, review, lead summary and flag must work again before phase 5 ships, and the first answer must not wait on a cold Worker. Checked in phase 5 against today's numbers on `mcp.perxel.com/dash`.
- **AI SDK churn.** `ai` 7 and `@ai-sdk/react` 4 today; majors move fast. Optional peer ranges, tested on the versions both sites use.
- **Linked packages in Turbopack** (phase 0 check).
- **Bot cost on phucbm.com.** An open `/api/ask` spends the OpenRouter key; it needs Turnstile or a rate limit from day one, and a spending cap on the OpenRouter key.
- **Private data near a public chat.** perxel-mcp will hold projects, quotations and accounting (decision 8). The public Ask is anonymous and must only ever see `access: "public"` tools; a private tool marked public by mistake would be readable by any visitor. Guard: an Ask-side allowlist of tool names (`tools` in `mcpSource`, or the kit's own filter), not only the access flag, and a test that lists what an anonymous caller sees.
- **Scope creep:** a third skin, a shadcn registry entry, an MCP kit adapter, a hosted Ask: all after 0.1.0.

## Decisions (owner, 2026-10-12)

1. **phucbm.com gets search and Ask**: `createAskHandler` on its own Worker with `contentSource` (its pages) and `toolSource` (`get_stats`, `get_repos` over its live data). No MCP.
2. **Bot protection on phucbm.com: Turnstile** (`turnstile()` verify helper; its own widget for phucbm.com).
3. **No server-side storage on phucbm.com**: stateless handler, nothing kept or logged beyond what the AI provider sees. The conversation stays only in the visitor's browser (`localStorage`, the package default) unless that is turned off; the privacy note says both.
4. **New public repo `perxel/perxel-spotlight`, MIT**, set up like the social kit.
5. **Neutral defaults in the package** (grey glass, system font); Perxel's blue only in perxel.com's variables.
6. **The package ships English copy only.** Vietnamese lives in perxel.com (`i18n/common.vi.ts`), passed in as a dictionary like any site's copy. Matching stays accent-folding for every language (that is search logic, not copy).

7. **Three kinds of source, one per consumer where it fits** (2026-10-12): `contentSource` for a site's page text, `toolSource` for a site's own data and functions (live numbers, filters, an outside API), `mcpSource` for data in another system or shared with other agents. An MCP is not needed for a site's chat to answer about the site; it pays off when people's own AI (Claude, ChatGPT, Cursor) should reach the data, or the data is private and used from the owner's own Claude. perxel.com tries the MCP path, phucbm.com the other two.
8. **perxel-mcp stays, with a new main purpose**: Perxel's internal MCP, used from the owner's own Claude, for private data to come (projects, quotations, accounting), behind auth (per-person OAuth, scopes per kind of data, accounting in its own scope or its own MCP, read-only first, every private call logged). That work is its own plan in the perxel-mcp repo, not this one. The public site Ask only ever gets its public tools.
9. **No phucbm-mcp in this plan.** phucbm.com's data needs no other agent for now; one can be made from the kit later (the cost is small), and Ask would add it with one `mcpSource` line.
10. **`contentSource` and `toolSource` keep answers cheap the way perxel-mcp's tools do**: short passages, capped pages, small structured results (see "Server helper"). Input tokens per turn compared with perxel-mcp's in phase 6.

11. **perxel.com's Ask runs on the package** (owner, 2026-10-12: this is a refactor, so perxel.com uses the package's own path, not a transport around the old one). `app/api/ask/route.ts` with `createAskHandler` + `mcpSource("https://mcp.perxel.com/mcp")` (public tools only, allowlisted). What the kit's `/ask` did for perxel.com is rebuilt, not dropped (phase 5):
    - **Turn log and dashboard**: `onFinish` posts each turn (question, answer, tools, timings, tokens, cost) to a small ingest endpoint on perxel-mcp, which writes the same `ask.turn` rows, so `mcp.perxel.com/dash` (latency, cost, conversation review) keeps working.
    - **Lead summary**: `/api/ask/summary` on perxel.com, same model, from the conversation the client sends.
    - **Lead flag**: the lead submission carries the conversation id; the ingest endpoint marks it.
    - **History**: client-side (the package default), so the server is stateless.
    - **Cold start**: the route runs on perxel.com's OpenNext Worker, which can take 1 to 3 s cold (`performance.md`). The gate's `prepare()` sends a cheap wake-up request to the route when the gate opens, so the Worker is warm by the time Enter is pressed; nothing calls it during page load.
    - **The kit's Ask add-on is retired after phase 5.** Checked 2026-10-12: perxel-mcp is its only user (openrace-mcp has no `ask` block; openwallet-mcp is not built on the kit). Ask lives in `@perxel/spotlight/server` from then on; the kit keeps only the turn-log ingest and the dashboard that reads it. Removing `kit/ask` (handler, sessions, summary, lead, cron) is a kit-repo plan, after perxel.com has run on the package for a while.

## Secrets and keys (set up 2026-10-12)

| What | Where it is now | Still to do |
|---|---|---|
| perxel.com local: `OPENROUTER_API_KEY` (copied from perxel-mcp), `TURNSTILE_SECRET` (Cloudflare's test secret, pairs with the test site key `next dev` uses), `ASK_INGEST_TOKEN` (new, random) | `perxel-web-2026/.dev.vars` (gitignored) | — |
| perxel-mcp local: `ASK_INGEST_TOKEN` (same value) | `perxel-mcp/.dev.vars` | — |
| perxel.com production: the three as Worker secrets on `perxel-website-2026`; ingest token also on perxel-mcp | not set | Phase 5, just before the push: `wrangler secret put`. The production Turnstile secret is the existing widget's ("perxel-mcp Ask", site key `0x4AAAAAAFS-u0WYj1d-610j`, perxel.com); read it then with the Cloudflare API (`GET /accounts/<id>/challenges/widgets/<sitekey>`, global key in `.dev.vars`), never written to a file. OpenRouter: perxel-mcp's key (same account) |
| phucbm.com Turnstile widget | **created**: "phucbm.com Ask", site key `0x4AAAAAAFUwylA9NiF0vugk`, domain phucbm.com, managed | Phase 6: site key in the code, secret (read via the API as above) as a Worker secret on `phucbm-com-2026-vol2` |
| phucbm.com local: `OPENROUTER_API_KEY` (borrowed from perxel-mcp), `TURNSTILE_SECRET` (test secret) | `folio-2026-vol2/.dev.vars` (gitignored) | — |

## Owner tasks

- **An OpenRouter key for phucbm.com with a monthly spending cap** (openrouter.ai → Keys; no provisioning key here, so Claude cannot make it). Before phucbm.com's Ask is deployed (end of phase 6); local work uses the borrowed key until then.
- ~~**npm trusted publishing**~~ for `@perxel/spotlight`: set 2026-10-13 (GitHub Actions, `perxel` / `perxel-spotlight`, `publish.yml`, no environment). A GitHub release now publishes.
- **Browser passes** at the sync points (desktop and an iPhone): Claude does not drive Chrome without asking.

## phucbm.com findings

Each found while putting phucbm.com (and perxel.com) on the package; all fixed in the package unless marked.

| # | Found | Change |
|---|---|---|
| 1 | A `link:` dependency brought the package's own dev copies of React and the AI SDK (two `ai` types, "Invalid hook call" risk) | Both sites use a pnpm injected dependency (`file:` + `dependenciesMeta.injected`); `scripts/sync.sh` in the package copies `dist/` in after a change; README "Local development" |
| 2 | Both sites needed the same client Turnstile code | `turnstileWidget({siteKey})` in `./react` (pairs with `turnstile()` on the server); perxel.com still uses its own `components/ask/turnstile.ts` (works; can switch later) |
| 3 | No markdown renderer for a headless panel | `Chat.Markdown` (Streamdown, unstyled) |
| 4 | No dialog for a headless panel (Radix is the package's dependency, not the site's) | `Chat.Panel`, `Chat.Title`, `Chat.Close` |
| 5 | The default `navigate` opened other sites in the same tab (phucbm.com's rule: outside links in a new tab) | Default opens other origins in a new tab |
| 6 | `./react` re-exported the gate's parts, so the provider's chunk carried Radix and the search engine into every page | Gate parts moved to `./gate`, imported only by the lazy gate module |
| 7 | Core modules too coarse: one helper pulled every message helper into first load; the English defaults sat in the provider | Core split (`storage`, `messages`, `fold`); default copy merged in the gate and chat; `useSpotlight().copy` is the site's overrides |
| 8 | The skin's CSS as a site-wide import added render-blocking CSS to every page | The skin's gate and panel chunks import it; `liquid.css` still exported |
| 9 | phucbm.com has no build-time TypeScript loader (perxel.com uses jiti) | None needed: its index is a prerendered route (`/search.json`) and `search.load` fetches it; README shows both ways |
| 10 | `contentSource`'s `get_page({section})` assumed markdown headings; phucbm.com's body text has them as plain lines | Plain-text heading fallback (`sectionOf`, `headingsOf`) |
| 11 | Pages without a CSS reset (the example) broke the rows (`content-box`) | The skin sets `border-box` on its own elements |
| 12 | The skin's spacing in px looked smaller than the original on perxel.com (18px root on desktop) | Spacing in rem, as the original Tailwind classes were; px kept where the original used px |
| 13 | (phucbm.com) `next dev` does not read `.dev.vars` (no `initOpenNextCloudflareForDev`), so Ask has no secrets there | Not a package issue. First: put them in `.env.local` (never done, so local Ask refused every question). Since 0.1.1: `next.config.ts` calls `initOpenNextCloudflareForDev()` in dev, as perxel.com |
| 14 | (phucbm.com, live) Every question ended "The answer could not be written": the Worker's `OPENROUTER_API_KEY` was empty, OpenRouter answered 401 `Missing Authentication header`, and the package called it `upstream` ("try again"); the cause only showed in `wrangler tail` | 0.1.1: `config` code (no key, or the provider refused it), the default log says to check the key, a `model` function that throws refuses with `config`. Both sites throw on an empty key; phucbm.com's `GET /api/ask?check` and deploy step (see "0.1.1") |

Token cost per turn (input tokens, one question each, Claude Haiku): `contentSource` on the example's pages 1,567 (one search); phucbm.com similar size; perxel.com through `mcpSource` 4,192 for a WordPress question (two tools). Same order as perxel-mcp's `ask.turn` rows; not measured over a question set.

## Progress (2026-10-13)

- **Package** `~/PHUC-LOCAL/perxel/perxel-spotlight` (local git, no GitHub repo yet): core, `./react`, `./gate`, `./chat`, `./liquid`, `./server`, `./build`; 38 tests; `examples/next` with the modes and an Ask route on all three kinds of source (each answered a real question through OpenRouter); README, CHANGELOG. Checked headlessly (CDP script): gate in each mode, desktop and phone, a streamed answer in the panel, the conversation stored.
- **perxel.com** (`main`, 2 commits, not pushed): phase 1 (search core from the package: index byte-identical, 32 queries identical) and phase 5 (Ask on the package, `/api/ask` on this Worker, `/api/ask/summary`, `/api/ask/lead`). Real questions answered locally (pricing through `mcpSource`, `prepare_lead` keeping only the written phone number, no token refused). Performance: no prerendered HTML references the gate, panel, index or skin CSS; every static path exists; first-load JS +2.5 KB brotli on every page against the pre-package build (target was 1 KB; what it is: `performance.md`, "Ask on @perxel/spotlight"). Parity screenshots (headless, old build vs new): desktop gate matches; on phones the new one fixes rows that overflowed sideways.
- **perxel-mcp** (`main`, 1 commit, not pushed): `/ask/ingest` (turn log, refusals, lead flag, today's spend), tests.
- **phucbm.com** (`main`, 1 commit, not pushed): search (`/search.json`), Ask (`contentSource` + `get_stats` + `get_repos`), paper-styled gate and panel, colophon section. Its three test questions answered correctly; `check-paper` and `check-seo` pass.

**Left for phase 8 (needs the owner):**
1. Browser pass on perxel.com (desktop and iPhone) and phucbm.com, in `pnpm dev` or `pnpm preview`.
2. Secrets: `wrangler secret put` on `perxel-website-2026`: `OPENROUTER_API_KEY`, `TURNSTILE_SECRET` (the "perxel-mcp Ask" widget's secret), `ASK_INGEST_TOKEN`; on perxel-mcp: `ASK_INGEST_TOKEN`; on `phucbm-com-2026-vol2`: `OPENROUTER_API_KEY` (its own capped key, owner task), `TURNSTILE_SECRET` ("phucbm.com Ask" widget).
3. Deploy order: perxel-mcp first (ingest), then perxel.com, then phucbm.com.
4. Create `perxel/perxel-spotlight` on GitHub, first npm publish (token or `npm login`), then trusted publishing; switch both sites from the injected copy to `^0.1.0`.

## Release (2026-10-13)

- Secrets set: `perxel-website-2026` (`OPENROUTER_API_KEY`, `TURNSTILE_SECRET` from the "perxel-mcp Ask" widget, `ASK_INGEST_TOKEN`), `perxel-mcp` (`ASK_INGEST_TOKEN`), `phucbm-com-2026-vol2` (`OPENROUTER_API_KEY` borrowed, `TURNSTILE_SECRET` from "phucbm.com Ask").
- perxel-mcp deployed (5daa3eb): `/ask/ingest` answers 401 without the token, `/ask/ingest/spend` with it.
- `@perxel/spotlight@0.1.0` published by the owner (npm 2FA), tag `v0.1.0`. No GitHub release yet: `publish.yml` would try 0.1.0 again and fail (the action has no skip for an existing version); the next version goes through a release once trusted publishing is set on npmjs.com.
- perxel.com deployed (7e45d00, on `^0.1.0`; the push also carried another session's b991d48). Smoke check: 9 of 10 at first, "front HTML differs" was a one-off right after deploy (identical when checked again). Live: `GET /api/ask` 204, a question without a token `verify_failed`.
- phucbm.com: pushed (7425d5d); the deploy failed at OpenNext's cache upload, `your account has reached the free usage limit for this operation for today [code: 10048]` (KV writes, the whole account: several deploys that day). The live site kept the previous version. Re-run queued for 00:05 UTC. Each deploy rewrites every prerendered page into KV, so a day with many deploys across perxel.com, phucbm.com and the MCPs can hit it again.

## 0.1.1 (2026-10-13)

Found when phucbm.com answered every question with "The answer could not be written" (finding 14).

- **Cause:** phucbm.com's Worker secret `OPENROUTER_API_KEY` existed but was empty; Turnstile passed, then OpenRouter refused the call (401). Locally the route had no secrets at all (finding 13). perxel.com was fine: `initOpenNextCloudflareForDev` since its move to Workers (July), secrets set by hand in phase 5.
- **Package** (9980098, release v0.1.1, published by `publish.yml` with trusted publishing): `config` error code and copy, `modelErrorCode(err)`, the hint in the default log, a throwing `model` function refused with `config` (503); README: where keys come from per platform. 41 tests.
- **phucbm.com** (9617601, be0bf02): the key set again (the borrowed one); `initOpenNextCloudflareForDev()` under `next dev`; the `model` function throws on an empty key; `GET /api/ask?check` (both secrets set and OpenRouter's free `/api/v1/key` takes the key: 204, else 503 with the problems); the deploy runs it. Cloudflare's bot protection challenges GitHub's runners (403 "Just a moment..."), so in CI the check fails only on the route's 503 and warns otherwise; after changing a secret, `curl https://phucbm.com/api/ask?check` by hand. Owner checked Ask on the live site.
- **perxel.com:** `model()` throws on an empty key; `/api/ask/summary` answers `config` for a missing or refused key; on `^0.1.1`.
- **Setting a secret:** `wrangler secret put NAME` and paste at the prompt; never pipe a variable that may be empty.
