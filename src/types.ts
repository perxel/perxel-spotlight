// The contracts every part codes against: the search config, the Ask config, actions, the
// request the gate hands the panel, the copy dictionary, persistence. No React values here,
// only types (and `defineAction`, an identity helper), so any entry point may import it.

import type {ComponentType, ReactNode} from "react"
import type {SearchDoc} from "./core/search.js"

export type {SearchDoc, SearchIndex, SearchOptions, SearchResult, Snippet} from "./core/search.js"

/**
 * A chat message, structurally the AI SDK's `UIMessage` (so `useChat` messages fit), without
 * importing `ai`: the core and the search parts never load the AI SDK.
 */
export interface ChatMessage {
  id: string
  role: "system" | "user" | "assistant"
  parts: ChatPart[]
  metadata?: unknown
}

export type ChatPart = {type: string} & Record<string, unknown>

// ---------------------------------------------------------------------------------------------
// Search

export interface SearchConfig {
  /** The documents, when they are already in the page's code (small sets). */
  docs?: SearchDoc[]
  /**
   * Load the documents lazily (recommended): a dynamic `import()` of a generated JSON file, so
   * the index is a chunk of its own, fetched when the gate opens. A module with a `default`
   * export is unwrapped.
   */
  load?: () => Promise<SearchDoc[] | {default: SearchDoc[]}>
  /** At most this many results (default 8). */
  limit?: number
  /** Result kinds in display order; also breaks score ties. */
  kindOrder?: string[]
  /** A snippet longer than this is cut around its first match (default 80 characters). */
  snippetLength?: number
}

// ---------------------------------------------------------------------------------------------
// Ask

/** Where the conversation is kept between visits. `localStorageAdapter()` is the default. */
export interface PersistAdapter {
  read(): StoredConversation | null
  write(value: StoredConversation | null): void
}

export interface StoredConversation {
  id: string
  messages: ChatMessage[]
  /** When the visitor last sent a message (ms). */
  savedAt: number
}

export interface AskConfig {
  /**
   * The chat endpoint for the default transport: any endpoint that speaks the AI SDK UI message
   * stream and takes the whole conversation (`createAskHandler` from `@perxel/spotlight/server`,
   * or any `useChat`-compatible route).
   */
  endpoint?: string
  /**
   * A custom transport instead of `endpoint`: an AI SDK `ChatTransport` (typed loosely here so
   * the contracts do not import `ai`). For backends that keep their own history or sessions.
   */
  transport?: unknown
  /** Extra fields sent with every request (locale, page). A function runs per request. */
  body?: Record<string, unknown> | (() => Record<string, unknown> | Promise<Record<string, unknown>>)
  /** Extra headers sent with every request. A function runs per request. */
  headers?: Record<string, string> | (() => Record<string, string> | Promise<Record<string, string>>)
  /**
   * Called when the gate opens (once per opening): warm the endpoint, mount a bot check. Never
   * called during page load.
   */
  prepare?: () => void | Promise<void>
  /** Where the conversation is kept: `localStorageAdapter(...)` (default), `false` for nowhere, or your own. */
  persist?: PersistAdapter | false
  /**
   * A question from the gate continues the kept conversation if its last question is younger
   * than this many hours; older, it starts a new one (default 24).
   */
  continueHours?: number
  /** Characters in one question (default 1000). */
  maxInput?: number
}

// ---------------------------------------------------------------------------------------------
// Actions

/** What an action's view gets. */
export interface ActionViewProps<I = unknown> {
  /** What opened it: the typed text mapped by `fromSearch`, or the tool output mapped by `fromTool`. */
  input: I
  /** The conversation so far (empty when opened from the gate with none). */
  messages: ChatMessage[]
  /** The conversation id, for a backend that keeps conversations. */
  conversationId: string | null
  /** Back to the conversation, or to the gate when there is none. */
  back: () => void
  /** Close the panel. */
  close: () => void
}

/**
 * Something a visitor can do from the gate or from an answer (contact form, newsletter signup).
 * Registered by the site; the package ships none.
 */
export interface Action<I = any> {
  /** Unique. A search document with id `action:<id>` opens it too (for indexes built ahead). */
  id: string
  /** Makes it a search result (kind `"action"` unless set). */
  search?: {title: string; subtitle?: string; keywords?: string[]; kind?: string}
  /** The input when opened from the gate, from the typed text. Default: `undefined`. */
  fromSearch?: (query: string, doc: SearchDoc) => I
  /** The tool whose output in a finished answer opens it (e.g. `"prepare_lead"`). */
  tool?: string
  /** The input when opened from an answer, from the tool's output. Default: the output itself. */
  fromTool?: (output: unknown, messages: ChatMessage[]) => I
  /** What opens, inside the panel (needs `ask`). */
  view?: ComponentType<ActionViewProps<I>>
  /** Or: run something instead of opening a view (navigate, open the site's own dialog). */
  run?: (input: I) => void
  /** The panel title while the view is open, and the label of the row that reopens it under an answer. */
  title?: string
  label?: string
  /** Hint by the gate's Enter key while this action is highlighted ("to open the form"). */
  hint?: string
}

/** Identity helper, for inference: `defineAction({...})`. */
export function defineAction<I>(action: Action<I>): Action<I> {
  return action
}

// ---------------------------------------------------------------------------------------------
// The gate → panel hand-off

/** What the gate hands the panel. `fresh`: the kept conversation is stale, start a new one. */
export type SpotlightRequest =
  | {kind: "ask"; text: string; fresh: boolean}
  | {kind: "action"; id: string; input: unknown}
  | {kind: "show"}

/** Which halves are on: `search` given, `ask` given, both, or neither. */
export type SpotlightMode = "both" | "search" | "ask" | "none"

// ---------------------------------------------------------------------------------------------
// Copy (English defaults in `defaultCopy`; every string overridable)

export interface SpotlightCopy {
  /** The gate's accessible title. */
  gateTitle: string
  /** The gate's field, by mode. */
  placeholder: string
  placeholderSearch: string
  placeholderAsk: string
  /** Hint by Enter: ask, open the highlighted page. */
  hintAsk: string
  hintOpen: string
  /** Result kind labels (`page`, `post`…); a kind without one shows as is. */
  kinds: Record<string, string>
  /** Live region: the number of results. */
  results: (count: number) => string
  /** The panel. */
  panelTitle: string
  newChat: string
  close: string
  back: string
  send: string
  stop: string
  thinking: string
  sources: string
  /** The button back to the newest message. */
  scrollToEnd: string
  /** Error messages by code (the `code` field of a JSON error response, or `generic`). */
  errors: Record<string, string>
}

// ---------------------------------------------------------------------------------------------
// Navigation

export interface NavigateOptions {
  /** Open in a new tab (modified click). */
  newTab?: boolean
  /** Where it came from: a search result, a link in an answer or a source. */
  from: "search" | "answer"
}

/** Default: `location.assign` (or `window.open` for a new tab). */
export type Navigate = (url: string, options: NavigateOptions) => void

// ---------------------------------------------------------------------------------------------
// The provider

/** What the gate and the panel modules receive from the provider. */
export interface GateProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export interface PanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export type Loader<P> = () => Promise<{default: ComponentType<P>}>

export interface SpotlightProps {
  /** Search: documents or a loader. Omit for an ask-only prompt box. */
  search?: SearchConfig
  /** Ask: an endpoint or a transport. Omit for plain search; the chat code is then never loaded. */
  ask?: AskConfig
  actions?: Action[]
  /** The gate component's module, loaded lazily (a skin passes its own). */
  gate: Loader<GateProps>
  /** The panel component's module, loaded lazily; needed with `ask`. */
  panel?: Loader<PanelProps>
  navigate?: Navigate
  /** The keyboard shortcut: `"mod+k"` (default: ⌘K on Apple keyboards, Ctrl K elsewhere), another `mod+<key>`, or `false`. */
  shortcut?: string | false
  /** Off: nothing renders and the shortcut is unbound (e.g. a page without Ask). Default on. */
  enabled?: boolean
  copy?: Partial<SpotlightCopy>
  /**
   * Fetch the gate's code once the page is idle, so the first open is instant. `true` (default):
   * 1.5 s after load or on the first input; a number: that many ms after load; `false`: only on a
   * trigger's `prefetch` (pointer enter, focus).
   */
  prefetch?: boolean | number
  children?: ReactNode
}
