import type {SearchDoc} from "@perxel/spotlight"

/** Sample pages: what the gate searches and what the Ask route reads (`body`). */
export const docs: (SearchDoc & {body?: string})[] = [
  {id: "page:/", kind: "page", title: "Home", url: "/", snippets: ["A sample studio site for @perxel/spotlight."]},
  {id: "page:/pricing", kind: "page", title: "Pricing", url: "/pricing", keywords: ["price", "cost", "quote"], snippets: ["Websites from $4,000, maintenance from $200 a month."],
    body: "## Websites\n\nA marketing website starts at $4,000, quoted per project after a call.\n\n## Maintenance\n\nMaintenance starts at $200 a month and covers updates, backups and small changes."},
  {id: "post:speed", kind: "post", title: "Making a site load in one second", url: "/posts/speed", subtitle: "Performance", snippets: ["Fonts", "Images", "What we measure"],
    body: "## Fonts\n\nSelf-host one cut-down font file per family.\n\n## Images\n\nServe images at the size of their slot, WebP or AVIF.\n\n## What we measure\n\nLighthouse with real throttling, five runs, the median."},
  {id: "post:search", kind: "post", title: "Search before you ask", url: "/posts/search", subtitle: "Design", snippets: ["Why search first", "The Enter key"],
    body: "## Why search first\n\nMost questions are answered by a page that already exists. Search finds it with no model call.\n\n## The Enter key\n\nEnter with nothing highlighted asks the question instead."},
  {id: "page:/contact", kind: "page", title: "Contact", url: "/contact", keywords: ["email", "call"], snippets: ["hello@example.com"]},
]
