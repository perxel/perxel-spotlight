"use client"

// The search hook: search-as-you-type for one text field, with an optional "ask" on Enter.
// No Next, no styling, no copy (the host renders the field, the rows and every label).
// Imports only React and the core.

import {useId, useMemo, useState, type KeyboardEvent} from "react"
import {groupByKind, search, type SearchDoc, type SearchIndex, type SearchResult} from "../core/search.js"

export interface UseSearchAskOptions {
  index: SearchIndex | null
  /** The field's current text. The host owns it (it is usually also the chat composer's value). */
  query: string
  /** Off: no results, no key handling, plain field props (e.g. once a conversation has started). */
  enabled?: boolean
  /** Open a result: navigate to `doc.url`, or run the host's own action for docs without one. */
  onOpen: (doc: SearchDoc) => void
  /**
   * Send the text as a question. With it, Enter asks unless a result is highlighted, and the
   * last option is the ask row. Without it (plain site search), Enter opens the first result.
   */
  onAsk?: (query: string) => void
  /** With `onAsk`: list the ask row after the results (default). Off, Enter still asks; the host shows the hint itself. */
  askRow?: boolean
  /**
   * Rows listed after the results and the ask row, walked by the same arrow keys and opened with
   * `onOpen` (e.g. a welcome list while nothing is typed or nothing matches). Shown on an empty
   * query too. The host decides when to pass them.
   */
  extras?: SearchDoc[]
  limit?: number
  kindOrder?: string[]
  snippetLength?: number
}

export interface SearchAskOption {
  id: string
  role: "option"
  "aria-selected": boolean
  /** Keeps the focus in the field when a row is clicked. */
  onMouseDown: (e: {preventDefault: () => void}) => void
}

const NO_EXTRAS: SearchDoc[] = []

export function useSearchAsk({index, query, enabled = true, onOpen, onAsk, extras = NO_EXTRAS, askRow = true, limit = 8, kindOrder = [], snippetLength}: UseSearchAskOptions) {
  const base = useId()
  const listboxId = `${base}-results`
  // `on`: text typed and the index loaded, so there are results (maybe none) and an ask row.
  const on = enabled && !!index && query.trim().length > 0
  const extraDocs = enabled ? extras : NO_EXTRAS

  const kindKey = kindOrder.join("\u0000")
  const groups = useMemo(
    () => (on ? groupByKind(search(index!, query, {limit, kindOrder, snippetLength}), kindOrder) : []),
    // `kindOrder` by value: callers often pass a new array literal each render.
    [on, index, query, limit, kindKey, snippetLength],
  )
  // Flat, in display order: what the arrow keys walk through.
  const results: SearchResult[] = useMemo(() => groups.flatMap((g) => g.results), [groups])
  const askable = on && !!onAsk && askRow
  const askIndex = askable ? results.length : -1
  const extraStart = results.length + (askable ? 1 : 0)
  const count = extraStart + extraDocs.length
  // The list shows when it has anything to show.
  const listed = enabled && count > 0

  // The highlighted option, valid only for the query it was set on: typing clears it.
  const [highlight, setHighlight] = useState<{query: string; i: number}>({query: "", i: -1})
  const active = listed && highlight.query === query && highlight.i < count ? highlight.i : -1
  const setActive = (i: number) => setHighlight({query, i})

  const optionId = (i: number) => `${base}-opt-${i}`

  const activate = (i: number) => {
    if (i === askIndex) onAsk!(query.trim())
    else if (i >= extraStart) {
      if (extraDocs[i - extraStart]) onOpen(extraDocs[i - extraStart])
    } else if (results[i]) onOpen(results[i].doc)
  }

  /** The field's key handler. Returns true when it handled the key (the host then does nothing). */
  const onKeyDown = (e: KeyboardEvent<HTMLElement>): boolean => {
    if (!enabled || e.nativeEvent.isComposing) return false
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!count) return false
      e.preventDefault()
      const step = e.key === "ArrowDown" ? 1 : -1
      // From nothing, down goes to the first row and up to the last; both wrap through nothing.
      const next = active === -1 ? (step > 0 ? 0 : count - 1) : active + step
      setActive(next < 0 || next >= count ? -1 : next)
      return true
    }
    if (e.key === "Escape" && active !== -1) {
      // Clear the highlight only; a second Escape reaches the host (and closes its dialog).
      e.preventDefault()
      e.stopPropagation()
      setActive(-1)
      return true
    }
    if (e.key === "Enter" && !e.shiftKey) {
      if (active !== -1) activate(active)
      else if (!on) return false
      else if (onAsk) onAsk(query.trim())
      else if (results[0]) onOpen(results[0].doc)
      else return false
      e.preventDefault()
      return true
    }
    return false
  }

  const option = (i: number): SearchAskOption => ({
    id: optionId(i),
    role: "option",
    "aria-selected": i === active,
    onMouseDown: (e) => e.preventDefault(),
  })

  return {
    /** Results in display order, and the same grouped by kind (each with its flat `index`). */
    results,
    groups: useMemo(() => {
      let i = 0
      return groups.map((g) => ({kind: g.kind, results: g.results.map((r) => ({...r, index: i++}))}))
    }, [groups]),
    /** True while text is typed and searched (results, maybe none, and the ask row). */
    open: on,
    /** True while the list has any row (results, the ask row or extras). */
    listed,
    /** The extras, each with its flat `index` (for `optionProps`). */
    extras: useMemo(() => extraDocs.map((doc, i) => ({doc, index: extraStart + i})), [extraDocs, extraStart]),
    /** The highlighted option, -1 for none. The ask row is `results.length`. */
    active,
    setActive,
    onKeyDown,
    /** Open result `i` or, at `results.length`, ask. For row clicks. */
    activate,
    /** Number of results, for the host's live region ("3 results"). */
    count: results.length,
    /** Spread on the text field (combobox pattern; the focus never leaves it). Empty while disabled. */
    inputProps: enabled && index
      ? {
          role: "combobox" as const,
          "aria-expanded": listed,
          "aria-controls": listed ? listboxId : undefined,
          "aria-autocomplete": "list" as const,
          "aria-activedescendant": active === -1 ? undefined : optionId(active),
        }
      : {},
    /** Spread on the element that holds every option. */
    listboxProps: {id: listboxId, role: "listbox" as const},
    /** Spread on result row `i` (its flat index). */
    optionProps: option,
    /** Spread on the ask row; null without `onAsk`. */
    askOptionProps: askable ? option(askIndex) : null,
  }
}
