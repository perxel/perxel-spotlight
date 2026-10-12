"use client"

import {createContext, useContext, type HTMLAttributes, type ReactNode} from "react"
import type {AskChat} from "../chat/useAskChat.js"

/** The liquid skin's own options, read by its gate and panel (lazy chunks) from context. */
export interface LiquidOptions {
  /** The mark in the panel's header and next to "thinking" (an `<img>`, an SVG). */
  logo?: ReactNode
  /** Heads every conversation: what happens to the questions. */
  privacyNote?: ReactNode
  /** Under the conversation, when it returns something (e.g. contact options after a handoff tool call or an error). */
  handoff?: (chat: AskChat) => ReactNode
  /** Left of the send button in the composer (e.g. a "send to us" link). */
  composerExtra?: (chat: AskChat) => ReactNode
  /** Tools that only drive the interface: the answer text is not cut at them. */
  uiTools?: string[]
  /** Hosts whose links in answers and sources stay in the app (made relative, then `navigate`). The page's own host always does. */
  localHosts?: string[]
  /** The moving pools of accent colour behind the composer. */
  tide?: boolean
  /** Extra attributes on the gate's and the panel's roots (`data-*` for a site's own scripts). */
  gateProps?: HTMLAttributes<HTMLDivElement> & Record<`data-${string}`, string | boolean | undefined>
  panelProps?: HTMLAttributes<HTMLDivElement> & Record<`data-${string}`, string | boolean | undefined>
  /** Class on both roots (to set the theme variables on). */
  className?: string
}

export const LiquidContext = createContext<LiquidOptions>({})

export function useLiquid(): LiquidOptions {
  return useContext(LiquidContext)
}
