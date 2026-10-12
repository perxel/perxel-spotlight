import {describe, expect, it} from "vitest"
import {buildSearchDocs, dropCommonHeadings, markdownHeadings} from "./index.js"

describe("build helpers", () => {
  it("reads ## and ### headings outside code fences", () => {
    expect(markdownHeadings("# T\n## One [link](/x)\n```\n## not\n```\n### `Two`\n#### Four")).toEqual(["One link", "Two"])
  })
  it("drops headings shared by 3+ documents of a group", () => {
    const out = dropCommonHeadings({a: ["FAQ", "A"], b: ["FAQ"], c: ["FAQ"], "en/d": ["FAQ"]}, {group: (k) => (k.startsWith("en/") ? "en" : "vi")})
    expect(out).toEqual({a: ["A"], b: [], c: [], "en/d": ["FAQ"]})
  })
  it("puts headings first in snippets and drops empty fields", () => {
    expect(buildSearchDocs({items: [{id: "i", kind: "post", title: "T", keywords: [""], snippets: ["excerpt"], headingsKey: "k"}], headings: {k: ["H"]}})).toEqual([
      {id: "i", kind: "post", title: "T", snippets: ["H", "excerpt"]},
    ])
  })
})
