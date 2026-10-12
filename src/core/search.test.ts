import {describe, expect, it} from "vitest"
import {buildIndex, fold, groupByKind, markTerms, search, type SearchDoc} from "./search.js"

const docs: SearchDoc[] = [
  {id: "p:services", kind: "page", title: "Dịch vụ", url: "/services"},
  {id: "s:wp", kind: "service", title: "Website WordPress", subtitle: "WordPress", url: "/services/wp", keywords: ["Custom theme, Gutenberg"]},
  {id: "i:pagespeed", kind: "insight", title: "Đọc điểm PageSpeed", subtitle: "Performance", url: "/insights/pagespeed", keywords: ["Core Web Vitals"]},
  {id: "i:wp-plugins", kind: "insight", title: "Danh sách plugin WordPress", subtitle: "WordPress", url: "/insights/wp-plugins"},
  {id: "a:subscribe", kind: "action", title: "Nhận bài viết mới qua email", keywords: ["newsletter", "đăng ký"]},
]
const index = buildIndex(docs)
const kindOrder = ["action", "page", "service", "work", "insight", "product"]
const ids = (q: string, limit?: number) => search(index, q, {kindOrder, limit}).map((r) => r.doc.id)

describe("fold", () => {
  it("drops accents and folds đ", () => {
    expect(fold("Đọc điểm PageSpeed")).toBe("doc diem pagespeed")
    expect(fold("Dịch vụ & SEO!")).toBe("dich vu seo")
    expect(fold("  ")).toBe("")
    expect(fold("Next.js, Node.js")).toBe("nextjs nodejs")
  })
})

describe("search", () => {
  it("returns nothing for an empty query", () => {
    expect(ids("")).toEqual([])
    expect(ids("  ?! ")).toEqual([])
  })

  it("matches with or without accents", () => {
    expect(ids("dịch vụ")).toEqual(["p:services"])
    expect(ids("dich vu")).toEqual(["p:services"])
    expect(ids("DOC DIEM")).toEqual(["i:pagespeed"])
  })

  it("prefers docs that match every term", () => {
    expect(ids("wordpress plugin")).toEqual(["i:wp-plugins"])
  })

  it("falls back to the docs matching the most terms", () => {
    expect(ids("wordpress nothing")).toEqual(["s:wp", "i:wp-plugins"])
    expect(ids("đăng ký gutenberg")).toEqual(["a:subscribe"])
    expect(ids("nothing at all")).toEqual([])
  })

  it("finds dotted names joined or split", () => {
    const idx = buildIndex([{id: "n", kind: "service", title: "Next.js & Headless CMS"}])
    for (const q of ["nextjs", "next.js", "next js", "next"]) expect(search(idx, q).map((r) => r.doc.id)).toEqual(["n"])
  })

  it("ranks a title start over a match in keywords", () => {
    expect(ids("word")).toEqual(["s:wp", "i:wp-plugins"])
    expect(ids("gutenberg")).toEqual(["s:wp"])
    expect(ids("vitals")).toEqual(["i:pagespeed"])
  })

  it("matches short terms only at the start of a word", () => {
    expect(ids("vu")).toEqual(["p:services"])
    expect(ids("ic")).toEqual([])
  })

  it("matches substrings of longer terms", () => {
    expect(ids("speed")).toEqual(["i:pagespeed"])
  })

  it("breaks ties by kind order", () => {
    // Both have "WordPress" as a title word; the service comes before the insight.
    expect(ids("wordpress")).toEqual(["s:wp", "i:wp-plugins"])
  })

  it("finds actions by their keywords", () => {
    expect(ids("dang ky")).toEqual(["a:subscribe"])
    expect(ids("newsletter")).toEqual(["a:subscribe"])
  })

  it("respects the limit", () => {
    expect(ids("w", 1)).toHaveLength(1)
  })
})

describe("groupByKind", () => {
  it("orders groups by kind order", () => {
    const groups = groupByKind(search(index, "wordpress", {kindOrder}), ["insight", "service"])
    expect(groups.map((g) => g.kind)).toEqual(["insight", "service"])
  })
})

describe("snippets", () => {
  const idx = buildIndex([
    {id: "x", kind: "insight", title: "Cross-browser testing", url: "/x", snippets: ["Phạm vi hỗ trợ trình duyệt", "Một phạm vi testing rõ ràng về browser, device và screen size giúp agency và khách hàng tránh hiểu nhầm về mức độ tương thích của website."]},
    {id: "n", kind: "service", title: "Next.js & Headless CMS", url: "/n", snippets: ["Next.js cho website nhanh"]},
  ])
  const first = (q: string) => search(idx, q)[0]
  const marked = (q: string) => {
    const s = first(q).snippet!
    return s.marks.map(([a, b]) => s.text.slice(a, b))
  }

  it("matches snippet text", () => {
    expect(first("trinh duyet").doc.id).toBe("x")
  })

  it("shows none while the title holds every term", () => {
    expect(first("browser").snippet).toBeUndefined()
    expect(first("next js").snippet).toBeUndefined()
  })

  it("marks the original text, accents kept", () => {
    expect(first("trinh duyet").snippet!.text).toBe("Phạm vi hỗ trợ trình duyệt")
    expect(marked("trinh duyet")).toEqual(["trình duyệt"])
  })

  it("picks the snippet holding the most missing terms", () => {
    expect(marked("browser agency")).toEqual(["browser", "agency"])
  })

  it("cuts a long snippet around its first match", () => {
    const s = first("tuong thich").snippet!
    expect(s.text.startsWith("…")).toBe(true)
    expect(s.text.length).toBeLessThanOrEqual(82)
    expect(s.marks.map(([a, b]) => s.text.slice(a, b))).toEqual(["tương thích"])
  })

  it("marks short terms at word starts only", () => {
    expect(markTerms("Phạm vi hỗ trợ", ["vi", "tro"])).toEqual([[5, 7], [11, 14]])
    expect(markTerms("davi", ["vi"])).toEqual([])
  })

  it("keeps dotted names whole", () => {
    expect(markTerms("Dùng Next.js", ["nextjs"]).map(([a, b]) => "Dùng Next.js".slice(a, b))).toEqual(["Next.js"])
  })
})

describe("titleMarks", () => {
  it("marks the typed words in the title", () => {
    const [r] = search(buildIndex([{id: "a", kind: "page", title: "Đọc điểm PageSpeed"}]), "doc speed")
    expect(r.titleMarks.map(([a, b]) => "Đọc điểm PageSpeed".slice(a, b))).toEqual(["Đọc", "Speed"])
  })

  it("is empty when only other fields matched", () => {
    const [r] = search(buildIndex([{id: "a", kind: "page", title: "Chi phí", keywords: ["bao nhiêu"]}]), "bao nhieu")
    expect(r.titleMarks).toEqual([])
  })
})
