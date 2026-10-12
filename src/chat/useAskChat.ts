"use client"

import {useChat} from "@ai-sdk/react"
import {DefaultChatTransport, type ChatTransport, type UIMessage} from "ai"
import {useEffect, useMemo, useRef, useState} from "react"
import {mergeCopy} from "../core/copy.js"
import {calledTool, sourcesOf, textOf, toolOutputOf} from "../core/messages.js"
import {useSpotlight} from "../react/provider.js"
import type {Action, AskConfig, ChatMessage} from "../types.js"

const resolve = async <T,>(v: T | (() => T | Promise<T>) | undefined): Promise<T | undefined> => (typeof v === "function" ? (v as () => T | Promise<T>)() : v)

/**
 * The default transport: the AI SDK UI message stream, the whole conversation sent each turn,
 * `ask.body` and `ask.headers` added per request. A JSON error response's `code` becomes the
 * error's message (mapped to `copy.errors`).
 */
export function defaultTransport(ask: AskConfig): ChatTransport<UIMessage> {
  return new DefaultChatTransport<UIMessage>({
    api: ask.endpoint,
    prepareSendMessagesRequest: async ({id, messages, body}) => ({
      body: {...body, id, messages, ...(await resolve(ask.body))},
      headers: (await resolve(ask.headers)) ?? {},
    }),
    fetch: async (input, init) => {
      const res = await fetch(input, init)
      if (!res.ok) {
        const code = await res
          .json()
          .then((b: {code?: unknown}) => (typeof b.code === "string" ? b.code : "generic"))
          .catch(() => "generic")
        throw new Error(code)
      }
      return res
    },
  })
}

export type ChatView =
  | {kind: "chat"}
  | {kind: "action"; action: Action; input: unknown; key: number}

export interface UseAskChatOptions {
  /**
   * Tool names that only drive the interface (an action, a "show the contact options" tool): the
   * answer text is not cut at them (see `textOf`). The actions' own tools are added.
   */
  uiTools?: string[]
}

/**
 * The panel's state: the AI SDK chat on the configured transport, the conversation kept through
 * `persist`, the gate's requests (ask, open an action, show), actions opened from answers, and
 * which view shows (the conversation or an action's view). Must be inside `SpotlightProvider`
 * with `ask`.
 */
export function useAskChat({uiTools = []}: UseAskChatOptions = {}) {
  const s = useSpotlight()
  const ask = s.ask ?? {}
  const persist = s.persist
  const maxInput = ask.maxInput ?? 1000
  const initial = useMemo(() => persist.read(), [persist])
  const [id, setId] = useState(() => initial?.id ?? crypto.randomUUID())
  // When the visitor last sent a message: the storage time counts from here, not from each visit.
  const lastSent = useRef(initial?.savedAt ?? 0)
  const [input, setInput] = useState("")
  const [view, setView] = useState<ChatView>({kind: "chat"})
  const viewKey = useRef(0)

  const transport = useMemo(
    () => (ask.transport as ChatTransport<UIMessage> | undefined) ?? defaultTransport(ask),
    // The config object may be recreated per render; the endpoint and transport are what matter.
    [ask.transport, ask.endpoint],
  )
  const askRef = useRef(ask)
  askRef.current = ask

  const chat = useChat({
    id,
    messages: initial?.id === id ? (initial.messages as UIMessage[]) : [],
    transport,
  })
  const {messages, sendMessage, status, error, stop, setMessages, clearError} = chat
  const list = messages as unknown as ChatMessage[]

  useEffect(() => {
    persist.write(list.length ? {id, messages: list, savedAt: lastSent.current} : null)
  }, [id, messages, status])

  const actionTools = useMemo(() => new Map(s.actions.filter((a) => a.tool).map((a) => [a.tool!, a])), [s.actions])
  const ui = useMemo(() => new Set([...uiTools, ...actionTools.keys()]), [uiTools.join("\u0000"), actionTools])

  const busy = status === "submitted" || status === "streaming"
  const copy = useMemo(() => mergeCopy(s.copy), [s.copy])
  const errorCode = error ? (error.message in copy.errors ? error.message : "generic") : null
  const lastAssistant = [...list].reverse().find((m) => m.role === "assistant")
  const text = (m: ChatMessage) => textOf(m, ui)
  // Waiting: sent, and no answer text yet.
  const waiting = busy && !(lastAssistant && status === "streaming" && text(lastAssistant))

  /** The action an answer prepared (its tool has returned), with its input. */
  const actionOf = (m: ChatMessage): {action: Action; input: unknown; callId: string} | null => {
    if (m.role !== "assistant" || !actionTools.size) return null
    const out = toolOutputOf(m, actionTools.keys())
    if (!out) return null
    const action = actionTools.get(out.tool)!
    return {action, input: action.fromTool ? action.fromTool(out.output, list) : out.output, callId: out.callId}
  }

  const openAction = (action: Action, value: unknown) => {
    if (action.view) setView({kind: "action", action, input: value, key: ++viewKey.current})
    else action.run?.(value)
  }

  // An answer that prepared an action opens it once the answer is done. Ones restored from
  // storage stay closed.
  const opened = useRef(new Set((initial?.messages ?? []).flatMap((m) => {
    const out = toolOutputOf(m, s.actions.flatMap((a) => (a.tool ? [a.tool] : [])))
    return out ? [out.callId] : []
  })))
  const pending = lastAssistant ? actionOf(lastAssistant) : null
  useEffect(() => {
    if (busy || !pending || opened.current.has(pending.callId)) return
    opened.current.add(pending.callId)
    openAction(pending.action, pending.input)
  }, [busy, pending?.callId])

  const send = (value: string) => {
    const t = value.trim().slice(0, maxInput)
    if (!t || busy) return
    clearError()
    setInput("")
    lastSent.current = Date.now()
    void sendMessage({text: t})
  }

  const reset = () => {
    stop()
    setMessages([])
    clearError()
    setView({kind: "chat"})
    setId(crypto.randomUUID())
    persist.write(null)
  }

  // The gate's request. A question waits in `queued` until the chat can take it: after a reset
  // (a new `id`, so a new chat instance next render) or once a running answer has stopped.
  const [queued, setQueued] = useState<string | null>(null)
  const handled = useRef(0)
  const request = s.request
  useEffect(() => {
    if (!request || request.n === handled.current) return
    handled.current = request.n
    const r = request.r
    if (r.kind === "ask") {
      if (r.fresh && list.length) reset()
      else if (busy) void stop()
      setView({kind: "chat"})
      setQueued(r.text)
    } else if (r.kind === "action") {
      const action = s.actions.find((a) => a.id === r.id)
      if (action) openAction(action, r.input)
    } else setView({kind: "chat"})
    // Once per request; the handlers read the current state.
  }, [request?.n])
  useEffect(() => {
    if (queued === null || busy) return
    setQueued(null)
    send(queued)
  }, [queued, busy, id])

  /** Start over through the gate: the panel has no empty state of its own. */
  const newChat = () => {
    reset()
    s.setPanelOpen(false)
    s.openGate()
  }
  /** An action view's back: to the conversation, or (opened from the gate with none) back to the gate. */
  const back = () => {
    if (list.length) return setView({kind: "chat"})
    s.setPanelOpen(false)
    s.openGate()
  }

  return {
    id,
    messages: list,
    status,
    busy,
    waiting,
    error,
    /** The error's code, a key of `copy.errors` (`generic` for unknown ones); null without an error. */
    errorCode,
    input,
    setInput,
    send,
    stop,
    reset,
    newChat,
    back,
    close: () => s.setPanelOpen(false),
    view,
    setView,
    openAction,
    actionOf,
    lastAssistant,
    /** A message's text (answers: after the last content tool call). */
    textOf: text,
    sourcesOf,
    /** True when the message called `tool` (e.g. a handoff tool that shows contact options). */
    calledTool,
    copy,
    chat,
  }
}

export type AskChat = ReturnType<typeof useAskChat>
