// The search engine: instant, client-side search over a small set of documents (a site's pages,
// posts, actions). No React, no Next, no dependencies: pure functions, safe anywhere.
// Imports only `fold`.

import {fold} from "./fold.js"

export {fold}

/** One searchable thing. The host builds these (usually at build time) from its own content. */
export interface SearchDoc {
  /** Unique across the set. */
  id: string
  /** What it is ("page", "insight", "action"…). Results are grouped and tie-broken by it. */
  kind: string
  /** Shown and ranked first. */
  title: string
  /** Shown under or beside the title (a category, a short label). Matched, weakly. */
  subtitle?: string
  /** Where opening it goes. Omit for things that are not links (actions): the host handles them in `onOpen`. */
  url?: string
  /** Extra text to match but not show (short titles, tags, synonyms). */
  keywords?: string[]
  /**
   * Readable text, matched like `keywords` and shown as the result's `snippet` when the title
   * does not explain the match (section headings, an excerpt). Ordered by preference: the first
   * one holding the most of the words missing from the title is shown.
   */
  snippets?: string[]
}

/** A built index: the docs plus their folded text. Plain data, so it can be serialized. */
export interface SearchIndex {
  docs: SearchDoc[]
  /** Per doc: folded title, folded subtitle, folded keywords and snippets (joined). */
  text: [title: string, subtitle: string, keywords: string][]
}

export interface SearchOptions {
  /** At most this many results (default 8). */
  limit?: number
  /** Kinds in display order; also breaks score ties. Kinds not listed come after, in first-seen order. */
  kindOrder?: string[]
  /** A snippet longer than this many characters is cut to a window around its first match (default 80). */
  snippetLength?: number
}

/** A doc's snippet with the typed words marked: `[start, end)` ranges into `text`, in order. */
export interface Snippet {
  text: string
  marks: [start: number, end: number][]
}

export interface SearchResult {
  doc: SearchDoc
  score: number
  /** Where the typed words are in `doc.title`, as `[start, end)` ranges (see `markTerms`). Empty when only other fields matched. */
  titleMarks: [start: number, end: number][]
  /** Set when some typed word is not in the title but is in one of the doc's `snippets`. */
  snippet?: Snippet
}

/** The title with in-word dots split ("Next.js" → "next js"), so "next js" finds it too. */
function splitDots(text: string): string {
  return fold(text.replace(/[.]/g, " "))
}

export function buildIndex(docs: SearchDoc[]): SearchIndex {
  return {
    docs,
    text: docs.map((d) => {
      const title = fold(d.title)
      const split = splitDots(d.title)
      const extra = [...(d.keywords ?? []), ...(d.snippets ?? [])]
      return [title, fold(d.subtitle ?? ""), [fold(extra.join(" ")), split === title ? "" : split].join(" ").trim()]
    }),
  }
}

/** True when `term` starts a word in `text` (both folded). */
function wordPrefix(text: string, term: string): boolean {
  return text.startsWith(term) || text.includes(" " + term)
}

/** True when `term` matches `text` (both folded): a word start, or anywhere for terms of 3+ characters. */
function hits(text: string, term: string): boolean {
  return wordPrefix(text, term) || (term.length >= 3 && text.includes(term))
}

/**
 * How well one query term matches a doc's folded text, 0 for not at all. Terms of one or two
 * characters only match the start of a word, so "a" does not match every doc.
 */
function termScore([title, subtitle, keywords]: SearchIndex["text"][number], term: string): number {
  if (wordPrefix(title, term)) return 10
  const short = term.length < 3
  if (!short && title.includes(term)) return 6
  if (wordPrefix(keywords, term)) return 4
  if (wordPrefix(subtitle, term)) return 3
  if (!short && (keywords.includes(term) || subtitle.includes(term))) return 1
  return 0
}

/**
 * Every query term must match somewhere (title, subtitle, keywords or snippets). Ranking: the whole
 * query starting the title, then per term: word prefix in the title, substring in the title,
 * word prefix in keywords, then subtitle, then substring there. Ties go by `kindOrder`, then
 * the docs' own order. An empty query returns nothing.
 *
 * When no doc matches every term ("quote landing page": the action matches "quote", a post
 * "landing page"), the docs matching the most terms are returned instead, so a query that
 * mixes an intent and a topic still finds both.
 */
export function search(index: SearchIndex, query: string, {limit = 8, kindOrder = [], snippetLength = 80}: SearchOptions = {}): SearchResult[] {
  const q = fold(query)
  if (!q) return []
  const terms = [...new Set(q.split(" "))]
  const rank = kindRank(index.docs, kindOrder)
  const all: {doc: SearchDoc; score: number; i: number; matched: number}[] = []
  index.text.forEach((text, i) => {
    let score = 0
    let matched = 0
    for (const term of terms) {
      const s = termScore(text, term)
      if (s) matched++
      score += s
    }
    if (!matched) return
    if (text[0].startsWith(q)) score += 20
    else if (text[0].includes(q) && terms.length > 1) score += 8
    all.push({doc: index.docs[i], score, i, matched})
  })
  const most = Math.max(0, ...all.map((h) => h.matched))
  const found = all.filter((h) => h.matched === most)
  found.sort((a, b) => b.score - a.score || rank(a.doc.kind) - rank(b.doc.kind) || a.i - b.i)
  return found.slice(0, limit).map(({doc, score, i}) => {
    const snippet = snippetFor(doc, index.text[i][0], terms, snippetLength)
    const titleMarks = markTerms(doc.title, terms)
    return snippet ? {doc, score, titleMarks, snippet} : {doc, score, titleMarks}
  })
}

/**
 * The snippet to show under a result: none while every term is in the title (the title explains
 * the match); else the first of `doc.snippets` holding the most of the missing terms, every
 * term marked, cut to `max` characters around its first mark.
 */
function snippetFor(doc: SearchDoc, title: string, terms: string[], max: number): Snippet | undefined {
  const titleText = title + " " + splitDots(doc.title)
  const missing = terms.filter((t) => !hits(titleText, t))
  if (!missing.length || !doc.snippets?.length) return
  let best: string | undefined
  let bestCount = 0
  for (const text of doc.snippets) {
    const folded = fold(text)
    const count = missing.filter((t) => hits(folded, t)).length
    if (count > bestCount) [best, bestCount] = [text, count]
  }
  if (!best) return
  return cutAround({text: best, marks: markTerms(best, terms)}, max)
}

/**
 * Where `terms` (folded) match in `text` (not folded), as ranges into `text`: word starts, and
 * anywhere for terms of 3+ characters, like the search. Folds one character at a time, so each
 * folded character knows the original it came from ("trình" marks all of "trình" for "trinh").
 */
export function markTerms(text: string, terms: string[]): [number, number][] {
  let folded = ""
  const from: number[] = []
  const to: number[] = []
  const chars = Array.from(text)
  let at = 0
  chars.forEach((c, k) => {
    const end = at + c.length
    const f = c.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase().replace(/đ/g, "d")
    const word = (x: string | undefined) => !!x && /[\p{L}\p{N}]/u.test(x)
    if (f && /^[\p{L}\p{N}]+$/u.test(f)) {
      for (const ch of f) {
        folded += ch
        from.push(at)
        to.push(end)
      }
    } else if (!f) {
      // A combining mark of decomposed text: part of the previous character.
      if (to.length) to[to.length - 1] = end
    } else if (/[.'’]/.test(c) && word(folded.at(-1)) && word(chars[k + 1])) {
      // A dot or apostrophe inside a word is dropped, as in `fold`.
    } else if (folded && !folded.endsWith(" ")) {
      folded += " "
      from.push(at)
      to.push(end)
    }
    at = end
  })
  const ranges: [number, number][] = []
  for (const term of terms) {
    if (!term) continue
    for (let p = folded.indexOf(term); p !== -1; p = folded.indexOf(term, p + 1)) {
      if (term.length < 3 && p > 0 && folded[p - 1] !== " ") continue
      ranges.push([from[p], to[p + term.length - 1]])
    }
  }
  ranges.sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const r of ranges) {
    const last = merged.at(-1)
    // Overlapping, or only a space apart: one mark ("trình duyệt", not two).
    if (last && (r[0] <= last[1] || !text.slice(last[1], r[0]).trim())) last[1] = Math.max(last[1], r[1])
    else merged.push([...r])
  }
  return merged
}

/** Cuts a long snippet to about `max` characters on word boundaries, starting a little before its first mark, with "…" where cut. */
function cutAround({text, marks}: Snippet, max: number): Snippet {
  if (text.length <= max || !marks.length) return {text, marks}
  const first = marks[0][0]
  let start = Math.max(0, Math.min(first - Math.floor(max * 0.3), text.length - max))
  if (start > 0) {
    const space = text.indexOf(" ", start)
    start = space !== -1 && space < first ? space + 1 : start
  }
  let end = Math.min(text.length, start + max)
  if (end < text.length) {
    const space = text.lastIndexOf(" ", end)
    if (space > Math.max(start, marks[0][1])) end = space
  }
  const lead = start > 0 ? "…" : ""
  const shift = lead.length - start
  return {
    text: lead + text.slice(start, end).trimEnd() + (end < text.length ? "…" : ""),
    marks: marks
      .filter(([a, b]) => a >= start && b <= end)
      .map(([a, b]) => [a + shift, b + shift] as [number, number]),
  }
}

/** Results in display order: grouped by kind, groups in `kindOrder`, best first inside a group. */
export function groupByKind(results: SearchResult[], kindOrder: string[] = []): {kind: string; results: SearchResult[]}[] {
  const groups = new Map<string, SearchResult[]>()
  for (const r of results) groups.set(r.doc.kind, [...(groups.get(r.doc.kind) ?? []), r])
  const rank = kindRank(results.map((r) => r.doc), kindOrder)
  return [...groups].sort(([a], [b]) => rank(a) - rank(b)).map(([kind, results]) => ({kind, results}))
}

function kindRank(docs: SearchDoc[], kindOrder: string[]): (kind: string) => number {
  const order = [...kindOrder]
  for (const d of docs) if (!order.includes(d.kind)) order.push(d.kind)
  return (kind) => order.indexOf(kind)
}
