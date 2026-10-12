import {describe, expect, it} from "vitest"
import {latestFromVisitor, sourcesOf, textOf, toolOutputOf} from "./conversation.js"

describe("message helpers", () => {
  const answer = {
    id: "a",
    role: "assistant" as const,
    parts: [
      {type: "text", text: "Let me check."},
      {type: "tool-search", toolCallId: "1", state: "output-available", output: {}},
      {type: "source-url", url: "https://x.test/a", title: "A"},
      {type: "text", text: "The answer."},
      {type: "tool-prepare_lead", toolCallId: "2", state: "output-available", output: {action: "lead"}},
      {type: "text", text: " Form ready."},
    ],
  }
  it("keeps only the text after the last content tool", () => {
    expect(textOf(answer, new Set(["prepare_lead"]))).toBe("The answer. Form ready.")
  })
  it("reads sources and tool outputs", () => {
    expect(sourcesOf(answer)).toEqual([{url: "https://x.test/a", title: "A"}])
    expect(toolOutputOf(answer, ["prepare_lead"])).toEqual({callId: "2", tool: "prepare_lead", output: {action: "lead"}})
  })
  it("finds the visitor's latest contact", () => {
    const msgs = [{id: "1", role: "user" as const, parts: [{type: "text", text: "call me at +84 906 680 492"}]}]
    expect(latestFromVisitor(msgs, "contact")).toBe("+84 906 680 492")
    expect(latestFromVisitor(msgs, "email")).toBeUndefined()
  })
})
