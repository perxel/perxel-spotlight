// The conversation kept in the browser, and helpers that read chat messages. No React, no AI SDK:
// the gate asks whether there is a conversation without loading the chat code.

import type {ChatMessage, ChatPart, PersistAdapter, StoredConversation} from "../types.js"

const DAY = 24 * 60 * 60 * 1000

/**
 * Keeps the conversation in `localStorage` under `key` for `days` after the visitor's last
 * question. Private mode or blocked storage: the conversation just does not survive a reload.
 */
export function localStorageAdapter({key = "spotlight-chat", days = 7}: {key?: string; days?: number} = {}): PersistAdapter {
  return {
    read() {
      try {
        const raw = localStorage.getItem(key)
        if (!raw) return null
        const v = JSON.parse(raw) as StoredConversation
        if (typeof v.id !== "string" || !Array.isArray(v.messages)) return null
        if (!(Date.now() - v.savedAt < days * DAY)) {
          localStorage.removeItem(key)
          return null
        }
        return v
      } catch {
        return null
      }
    },
    write(v) {
      try {
        if (v) localStorage.setItem(key, JSON.stringify(v))
        else localStorage.removeItem(key)
      } catch {
        // Storage blocked.
      }
    },
  }
}

/** Nowhere: the conversation lives as long as the page. */
export const noPersist: PersistAdapter = {read: () => null, write: () => {}}

/**
 * What a question from the gate does: `none` (no conversation), `recent` (continues it) or
 * `stale` (kept, but its last question is older than `continueHours`: a new one starts).
 */
export type ConversationState = "none" | "recent" | "stale"

export function conversationState(persist: PersistAdapter, continueHours = 24): ConversationState {
  const v = persist.read()
  if (!v?.messages.length) return "none"
  return Date.now() - v.savedAt < continueHours * 60 * 60 * 1000 ? "recent" : "stale"
}

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

const EMAIL_IN_TEXT = /[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[a-z]{2,}/gi
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

/** The first email address in a text. */
export function emailIn(text: string): string | undefined {
  return text.match(new RegExp(EMAIL_IN_TEXT.source, "i"))?.[0]
}
