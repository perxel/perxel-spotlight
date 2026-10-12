// Helpers that read chat messages (AI SDK `UIMessage`s, structurally). No React, no AI SDK.

import type {ChatMessage, ChatPart} from "../types.js"
import {EMAIL_IN_TEXT} from "./fold.js"

/** A tool part (`tool-<name>`, or `dynamic-tool` with `toolName`). */
export function toolName(part: ChatPart): string | null {
  if (part.type === "dynamic-tool") return typeof part.toolName === "string" ? part.toolName : null
  return part.type.startsWith("tool-") ? part.type.slice(5) : null
}

/**
 * A message's text. For an answer, only what follows its last content tool call: what a model
 * writes between tool steps ("let me check…") is not the answer. Tools named in `uiTools` (ones
 * that only drive the interface, like an action) do not cut the text.
 */
export function textOf(m: ChatMessage, uiTools: ReadonlySet<string> = new Set()): string {
  let parts = m.parts
  if (m.role === "assistant") {
    const lastTool = parts.findLastIndex((p) => {
      const name = toolName(p)
      return name !== null && !uiTools.has(name)
    })
    const after = parts.slice(lastTool + 1)
    if (lastTool >= 0 && after.some((p) => p.type === "text" && String(p.text ?? "").trim())) parts = after
  }
  return parts.map((p) => (p.type === "text" ? String(p.text ?? "") : "")).join("").trim()
}

/** The sources an answer cited (`source-url` parts), deduplicated. */
export function sourcesOf(m: ChatMessage): {url: string; title: string}[] {
  const out: {url: string; title: string}[] = []
  for (const p of m.parts) {
    if (p.type !== "source-url" || typeof p.url !== "string") continue
    if (out.some((s) => s.url === p.url)) continue
    out.push({url: p.url, title: typeof p.title === "string" && p.title ? p.title : p.url})
  }
  return out
}

/** The first finished call of one of `tools` in a message: its call id, tool name and output. */
export function toolOutputOf(m: ChatMessage, tools: Iterable<string>): {callId: string; tool: string; output: unknown} | null {
  const names = new Set(tools)
  for (const p of m.parts) {
    const name = toolName(p)
    if (!name || !names.has(name)) continue
    if (p.state === "output-available" && p.output !== undefined) return {callId: String(p.toolCallId), tool: name, output: p.output}
  }
  return null
}

/** True when the message called `tool` (any state). */
export function calledTool(m: ChatMessage, tool: string): boolean {
  return m.parts.some((p) => toolName(p) === tool)
}

const PHONE_IN_TEXT = /\+?\d[\d\s.-]{6,}\d/g

/** The latest email (or, for `contact`, email or phone number) in the visitor's own messages. */
export function latestFromVisitor(messages: ChatMessage[], kind: "email" | "contact"): string | undefined {
  for (const m of [...messages].reverse()) {
    if (m.role !== "user") continue
    const text = textOf(m)
    const email = text.match(EMAIL_IN_TEXT)?.at(-1)
    if (email) return email
    if (kind === "contact") {
      const phone = text.match(PHONE_IN_TEXT)?.findLast((n) => n.replace(/\D/g, "").length >= 8)
      if (phone) return phone.trim()
    }
  }
  return undefined
}

