"use client"

import * as Dialog from "@radix-ui/react-dialog"
import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react"
import {conversationState, type ConversationState} from "../core/storage.js"
import {mergeCopy} from "../core/copy.js"
import {buildIndex, type SearchDoc, type SearchIndex, type SearchResult, type Snippet} from "../core/search.js"
import type {Action} from "../types.js"
import {useSpotlight, type SpotlightState} from "../react/provider.js"
import {useSearchAsk} from "./useSearchAsk.js"

const ACTION_PREFIX = "action:"

/** The action a search document opens, if any (`action:<id>`). */
function actionFor(doc: SearchDoc, actions: Action[]): Action | undefined {
  if (!doc.id.startsWith(ACTION_PREFIX)) return undefined
  const id = doc.id.slice(ACTION_PREFIX.length)
  return actions.find((a) => a.id === id)
}

/** Actions with `search` as documents, unless the loaded index already holds one with that id. */
function actionDocs(actions: Action[], docs: SearchDoc[]): SearchDoc[] {
  const have = new Set(docs.map((d) => d.id))
  return actions
    .filter((a) => a.search && !have.has(ACTION_PREFIX + a.id))
    .map((a) => ({
      id: ACTION_PREFIX + a.id,
      kind: a.search!.kind ?? "action",
      title: a.search!.title,
      ...(a.search!.subtitle ? {subtitle: a.search!.subtitle} : {}),
      ...(a.search!.keywords ? {keywords: a.search!.keywords} : {}),
    }))
}

/** The search index, loaded the first time the gate mounts and kept while it stays mounted. */
function useIndex(s: SpotlightState): SearchIndex | null {
  const [index, setIndex] = useState<SearchIndex | null>(null)
  const {search, actions} = s
  useEffect(() => {
    if (!search) return
    let cancelled = false
    const got = search.docs ? Promise.resolve(search.docs) : search.load ? search.load() : Promise.resolve([])
    got
      .then((m) => {
        if (cancelled) return
        const docs = Array.isArray(m) ? m : m.default
        setIndex(buildIndex([...actionDocs(actions, docs), ...docs]))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [search, actions])
  return index
}

export interface UseGateOptions {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Everything a gate needs, for a gate built from scratch. `Gate.Root` calls it and shares it with the parts. */
export function useGate({open, onOpenChange}: UseGateOptions) {
  const s = useSpotlight()
  const {mode, actions, navigate} = s
  const copy = useMemo(() => mergeCopy(s.copy), [s.copy])
  const maxInput = s.ask?.maxInput ?? 1000
  const [query, setQuery] = useState("")
  const index = useIndex(s)
  const input = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)

  // Read on every opening: the panel writes the store as the conversation changes.
  const [conversation, setConversation] = useState<ConversationState>("none")
  useEffect(() => {
    if (!open) return
    setConversation(s.ask ? conversationState(s.persist, s.ask.continueHours) : "none")
    // A new opening starts empty, like Spotlight.
    setQuery("")
  }, [open])

  const typed = query.trim()
  const askable = mode === "both" || mode === "ask"

  const ask = (text: string) => {
    const t = text.trim().slice(0, maxInput)
    if (t && askable) s.handOff({kind: "ask", text: t, fresh: conversation === "stale"})
  }

  const runAction = (action: Action, doc: SearchDoc) => {
    const value = action.fromSearch ? action.fromSearch(typed, doc) : undefined
    if (action.view && s.ask) return s.handOff({kind: "action", id: action.id, input: value})
    onOpenChange(false)
    action.run?.(value)
  }

  const onOpen = (doc: SearchDoc) => {
    if (doc.url) {
      // A real click on the row's link, so a site's own link handling (a page transition
      // listening to clicks) runs as for any other link.
      const el = document.getElementById(searchApi.optionProps(searchApi.results.findIndex((r) => r.doc.id === doc.id)).id)
      if (el instanceof HTMLAnchorElement) el.click()
      else {
        onOpenChange(false)
        navigate(doc.url, {from: "search"})
      }
      return
    }
    const action = actionFor(doc, actions)
    if (action) runAction(action, doc)
  }

  const searchApi = useSearchAsk({
    index,
    query,
    enabled: !!s.search,
    onOpen,
    ...(askable ? {onAsk: ask} : {}),
    askRow: false,
    ...(s.search?.limit ? {limit: s.search.limit} : {}),
    kindOrder: s.search?.kindOrder ?? [],
    ...(s.search?.snippetLength ? {snippetLength: s.search.snippetLength} : {}),
  })

  // What Enter does right now: ask, open the highlighted page, or the highlighted action's hint.
  const active: SearchResult | undefined = searchApi.results[searchApi.active]
  const activeAction = active ? actionFor(active.doc, actions) : undefined
  const hint = !active ? (askable ? copy.hintAsk : searchApi.count ? copy.hintOpen : null) : activeAction?.hint ?? copy.hintOpen

  /** Result links: modified clicks open a tab as usual; a click a site handler already took closes the gate; else navigate. */
  const onLinkClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    if (e.defaultPrevented) return onOpenChange(false)
    e.preventDefault()
    onOpenChange(false)
    navigate(e.currentTarget.href, {from: "search"})
  }

  const placeholder = mode === "search" ? copy.placeholderSearch : mode === "ask" ? copy.placeholderAsk : copy.placeholder

  return {
    spotlight: s,
    mode,
    open,
    onOpenChange,
    copy,
    query,
    setQuery,
    typed,
    index,
    conversation,
    focused,
    inputRef: input,
    search: searchApi,
    ask,
    askable,
    onOpen,
    onLinkClick,
    /** What Enter does, for a hint by the field (`null`: nothing). */
    hint,
    /** The highlighted result's action, if it is one. */
    activeAction,
    actionFor: (doc: SearchDoc) => actionFor(doc, actions),
    kindLabel: (kind: string) => copy.kinds[kind] ?? kind,
    /** Spread on the text field. */
    inputProps: {
      ref: input,
      value: query,
      onChange: (e: {target: {value: string}}) => setQuery(e.target.value),
      onFocus: () => setFocused(true),
      onBlur: () => setFocused(false),
      ...searchApi.inputProps,
      onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
        if (searchApi.onKeyDown(e)) return
        // Typed before the index arrived, or ask-only: Enter asks.
        if (e.key === "Enter" && !e.nativeEvent.isComposing && typed && askable) {
          e.preventDefault()
          ask(query)
        }
      },
      placeholder,
      "aria-label": placeholder,
      maxLength: maxInput,
      enterKeyHint: askable ? ("send" as const) : ("search" as const),
      autoComplete: "off",
      autoCorrect: "off",
      spellCheck: false,
    },
  }
}

export type GateApi = ReturnType<typeof useGate>

const GateContext = createContext<GateApi | null>(null)

/** The gate's state, inside `Gate.Root`. */
export function useGateContext(): GateApi {
  const g = useContext(GateContext)
  if (!g) throw new Error("Gate parts must be inside <Gate.Root>")
  return g
}

type DivProps = ComponentPropsWithoutRef<"div">

/**
 * The gate: a modal dialog (Radix) with an overlay, the focus moved into the field on open and
 * back where it was on close, Escape clearing a highlighted row before it closes, and a press on
 * the content box itself (the gaps between pieces) closing it like a press outside.
 * State: `data-state` (open/closed), `data-mode`, `data-has-results` on the content.
 */
function Root({open, onOpenChange, children, overlayProps, ...props}: UseGateOptions & DivProps & {overlayProps?: DivProps; children: ReactNode}) {
  const g = useGate({open, onOpenChange})
  return (
    <GateContext.Provider value={g}>
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay data-spotlight-overlay="" {...overlayProps}/>
          <Dialog.Content
            data-spotlight-gate=""
            data-mode={g.mode}
            data-has-results={g.search.count > 0 || undefined}
            aria-describedby={undefined}
            {...props}
            onPointerDown={(e) => {
              props.onPointerDown?.(e)
              if (e.target === e.currentTarget) onOpenChange(false)
            }}
            onOpenAutoFocus={(e) => {
              e.preventDefault()
              g.inputRef.current?.focus({preventScroll: true})
            }}
            onCloseAutoFocus={(e) => {
              e.preventDefault()
              g.spotlight.restoreFocus()
            }}
            onEscapeKeyDown={(e) => {
              if (g.search.active === -1) return
              e.preventDefault()
              g.search.setActive(-1)
            }}
          >
            <Dialog.Title style={srOnly}>{g.copy.gateTitle}</Dialog.Title>
            {children}
            {/* Always mounted: a live region added with its text is often not read. */}
            <p style={srOnly} role="status" aria-live="polite">{g.search.open ? g.copy.results(g.search.count) : ""}</p>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </GateContext.Provider>
  )
}

const srOnly = {position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0} as const

/** The text field. */
function Input(props: ComponentPropsWithoutRef<"input">) {
  const g = useGateContext()
  return <input data-spotlight-input="" {...g.inputProps} {...props}/>
}

/** The listbox. Renders only while there are results; by default one `Gate.Item` per result. */
function Results({children, ...props}: Omit<DivProps, "children"> & {children?: (result: SearchResult & {index: number}) => ReactNode}) {
  const g = useGateContext()
  if (!g.search.count) return null
  return (
    <div data-spotlight-results="" {...g.search.listboxProps} aria-label={g.copy.gateTitle} {...props}>
      {g.search.results.map((r, index) => (children ? <Fragment key={r.doc.id}>{children({...r, index})}</Fragment> : <Item key={r.doc.id} result={r} index={index}/>))}
    </div>
  )
}

/**
 * One result: a link for a document with a `url`, a button for an action. State:
 * `data-highlighted` (the arrow keys' row; also `aria-selected`), `data-kind`. Children default to
 * the marked title and the snippet or subtitle.
 */
function Item({result, index, children, ...props}: {result: SearchResult; index: number; children?: ReactNode} & Omit<ComponentPropsWithoutRef<"a">, "children">) {
  const g = useGateContext()
  const option = g.search.optionProps(index)
  const shared = {
    ...option,
    "data-spotlight-item": "",
    "data-kind": result.doc.kind,
    "data-highlighted": option["aria-selected"] || undefined,
  }
  const body = children ?? (
    <>
      <span data-spotlight-title=""><Marked text={result.doc.title} marks={result.titleMarks}/></span>
      {result.snippet ? (
        <span data-spotlight-snippet=""><Marked {...result.snippet}/></span>
      ) : result.doc.subtitle ? (
        <span data-spotlight-subtitle="">{result.doc.subtitle}</span>
      ) : null}
    </>
  )
  if (result.doc.url) {
    return (
      <a
        href={result.doc.url}
        {...shared}
        {...props}
        onClick={(e) => {
          props.onClick?.(e)
          g.onLinkClick(e)
        }}
      >
        {body}
      </a>
    )
  }
  const {className, style} = props
  return (
    <button type="button" {...shared} className={className} style={style} onClick={() => g.search.activate(index)}>
      {body}
    </button>
  )
}

/** Text with marked ranges in `<mark>` (style `mark[data-spotlight-mark]`). */
export function Marked({text, marks}: {text: string; marks: Snippet["marks"]}) {
  const parts: ReactNode[] = []
  let at = 0
  for (const [a, b] of marks) {
    if (a > at) parts.push(text.slice(at, a))
    parts.push(<mark key={a} data-spotlight-mark="">{text.slice(a, b)}</mark>)
    at = b
  }
  parts.push(text.slice(at))
  return <>{parts}</>
}

/** What Enter does, while it does something and the field has focus (`data-on`); children override the text. */
function Hint({children, ...props}: DivProps) {
  const g = useGateContext()
  const on = g.focused && !!g.typed && !!g.hint
  return <span data-spotlight-hint="" data-on={on || undefined} aria-hidden {...props}>{children ?? g.hint}</span>
}

/** Closes the gate. */
function Close(props: ComponentPropsWithoutRef<"button">) {
  const g = useGateContext()
  return <Dialog.Close aria-label={g.copy.close} data-spotlight-close="" {...props}/>
}

/** Sends the typed text as a question (a send button for touch screens); only while there is text and Ask is on. */
function Send(props: ComponentPropsWithoutRef<"button">) {
  const g = useGateContext()
  if (!g.typed || !g.askable) return null
  return (
    <button
      type="button"
      aria-label={g.copy.send}
      data-spotlight-send=""
      {...props}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => g.ask(g.query)}
    />
  )
}

export const Gate = {Root, Input, Results, Item, Hint, Close, Send, Marked}

