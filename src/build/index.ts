// `@perxel/spotlight/build`: build-time helpers for the search index (Node). A site maps its own
// content to `SearchDoc`s; these read headings out of markdown, drop template headings and write
// the index file. The package reads no CMS.

import fs from "node:fs"
import path from "node:path"
import type {SearchDoc} from "../core/search.js"

/**
 * The plain text of every heading of `levels` (default `##` and `###`) outside code fences: links
 * keep their text, inline code and emphasis lose their marks.
 */
export function markdownHeadings(markdown: string, {levels = [2, 3]}: {levels?: number[]} = {}): string[] {
  let fence = false
  const out: string[] = []
  for (const line of markdown.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence
    const m = !fence && line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (!m || !levels.includes(m[1]!.length)) continue
    out.push(m[2]!.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[`*_]/g, "").trim())
  }
  return out
}

/**
 * Drops headings found in `threshold` (default 3) or more documents of one group: template
 * sections ("FAQ", "Conclusion") name no topic and would bring up every post that has them.
 * `group` puts keys in groups (a locale); one group by default.
 */
export function dropCommonHeadings(
  headings: Record<string, string[]>,
  {threshold = 3, group = () => ""}: {threshold?: number; group?: (key: string) => string} = {},
): Record<string, string[]> {
  const seen = new Map<string, number>()
  for (const [key, list] of Object.entries(headings)) {
    for (const h of new Set(list)) seen.set(`${group(key)}|${h}`, (seen.get(`${group(key)}|${h}`) ?? 0) + 1)
  }
  return Object.fromEntries(Object.entries(headings).map(([key, list]) => [key, list.filter((h) => (seen.get(`${group(key)}|${h}`) ?? 0) < threshold)]))
}

/** A content item for `buildSearchDocs`: a document plus the key of its headings. */
export type SearchItem = SearchDoc & {headingsKey?: string}

/**
 * Documents from content items and static pages: each item's headings (by `headingsKey`) go first
 * in its `snippets` (short, and they name a section), empty fields dropped.
 */
export function buildSearchDocs({items = [], pages = [], headings = {}}: {items?: SearchItem[]; pages?: SearchDoc[]; headings?: Record<string, string[]>}): SearchDoc[] {
  const clean = (d: SearchDoc): SearchDoc => {
    const out: SearchDoc = {id: d.id, kind: d.kind, title: d.title}
    if (d.subtitle) out.subtitle = d.subtitle
    if (d.url) out.url = d.url
    const keywords = (d.keywords ?? []).filter(Boolean)
    if (keywords.length) out.keywords = keywords
    const snippets = (d.snippets ?? []).filter(Boolean)
    if (snippets.length) out.snippets = snippets
    return out
  }
  return [
    ...pages.map(clean),
    ...items.map(({headingsKey, ...d}) => clean({...d, snippets: [...(headingsKey ? headings[headingsKey] ?? [] : []), ...(d.snippets ?? [])]})),
  ]
}

/** Writes the documents as JSON (one line), only when the content changed. Returns true when it wrote. */
export function writeSearchIndex(docs: SearchDoc[], file: string): boolean {
  const json = JSON.stringify(docs) + "\n"
  if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === json) return false
  fs.mkdirSync(path.dirname(file), {recursive: true})
  fs.writeFileSync(file, json)
  return true
}
