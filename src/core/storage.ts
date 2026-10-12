// The conversation kept in the browser. No React, no AI SDK: the gate asks whether there is a
// conversation without loading the chat code.

import type {PersistAdapter, StoredConversation} from "../types.js"

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

