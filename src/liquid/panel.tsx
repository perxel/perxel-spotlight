"use client"

import * as Dialog from "@radix-ui/react-dialog"
import {memo, useEffect, useRef, useState, type MouseEvent, type PointerEvent, type RefObject} from "react"
import {Streamdown} from "streamdown"
import {Chat} from "../chat/parts.js"
import {useAskChat} from "../chat/useAskChat.js"
import {useSpotlight} from "../react/provider.js"
import type {PanelProps} from "../types.js"
import {useLiquid} from "./context.js"
import {ArrowDownIcon, ArrowLeftIcon, ArrowUpIcon, ArrowUpRightIcon, ChevronDownIcon, FileTextIcon, SquareIcon, SquarePenIcon, XIcon} from "./icons.js"
import {cx, PHONE_QUERY, useMedia} from "./util.js"

const Markdown = memo(
  ({text}: {text: string}) => (
    <Streamdown className="sp-md" linkSafety={{enabled: false}}>
      {text}
    </Streamdown>
  ),
  (a, b) => a.text === b.text,
)

/**
 * The liquid panel: a floating card on desktop (non-modal: the page stays usable), a bottom sheet
 * on phones (dim backdrop, swipe down to close, the page behind does not scroll). The header and
 * composer float over the conversation as glass; it scrolls under them.
 */
export default function LiquidPanel({open, onOpenChange}: PanelProps) {
  const liquid = useLiquid()
  const s = useSpotlight()
  const chat = useAskChat({uiTools: liquid.uiTools ?? []})
  const {copy, view} = chat
  const phone = useMedia(PHONE_QUERY)
  const composer = useRef<HTMLTextAreaElement>(null)

  // Desktop: ready for a follow-up after a question or "show" from the gate (also when the panel
  // was already open, so no open focus runs).
  const req = s.request
  useEffect(() => {
    if (!req || phone) return
    if (req.r.kind === "ask" || req.r.kind === "show") requestAnimationFrame(() => composer.current?.focus({preventScroll: true}))
  }, [req?.n])

  // Links in answers and sources: in-app ones navigate without a page load; phones close the sheet
  // (it covers the page), the conversation stays. Streamdown opens links in a new tab: overridden.
  const local = new Set([...(liquid.localHosts ?? [])])
  const onLinkClick = (e: MouseEvent<HTMLElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const a = (e.target as Element).closest?.("a[href]") as HTMLAnchorElement | null
    if (!a || a.hasAttribute("download")) return
    if (a.target && a.target !== "_self" && a.dataset.streamdown !== "link") return
    const url = new URL(a.href, location.href)
    if (url.origin !== location.origin && !local.has(url.hostname)) return
    e.preventDefault()
    s.navigate(url.pathname + url.search + url.hash, {from: "answer"})
    if (phone) onOpenChange(false)
  }
  const localPath = (href: string) => {
    try {
      const u = new URL(href)
      return local.has(u.hostname) ? u.pathname + u.search + u.hash : href
    } catch {
      return href
    }
  }

  const viewport = usePhoneViewport(open && phone)
  const sheet = useRef<HTMLDivElement | null>(null)
  const drag = useSheetDrag(sheet, () => onOpenChange(false), open && phone)
  useEffect(() => {
    if (!open || !phone) return
    const html = document.documentElement
    const prev = html.style.overflow
    html.style.overflow = "hidden"
    return () => {
      html.style.overflow = prev
    }
  }, [open, phone])
  // Phones: as tall as the visible screen allows; with the keyboard up, all of what is left.
  const sheetStyle = viewport
    ? (() => {
        const keyboard = viewport.height < window.innerHeight * 0.75
        const height = keyboard ? viewport.height : Math.round(viewport.height * 0.92)
        return {top: viewport.top + viewport.height - height, height}
      })()
    : undefined

  const [head, setHead] = useState<HTMLElement | null>(null)
  const [foot, setFoot] = useState<HTMLElement | null>(null)
  useOverlayInsets(head, foot)

  const title = view.kind === "action" ? view.action.title ?? copy.panelTitle : copy.panelTitle
  const handoff = liquid.handoff?.(chat)
  const ActionView = view.kind === "action" ? view.action.view : undefined

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <Dialog.Portal>
        {phone && <div aria-hidden onClick={() => onOpenChange(false)} data-state={open ? "open" : "closed"} className={cx("sp-backdrop", liquid.className)}/>}
        <Dialog.Content
          ref={sheet}
          data-spotlight-panel=""
          data-status={chat.status}
          data-view={view.kind}
          aria-describedby={undefined}
          {...liquid.panelProps}
          className={cx("sp-panel", liquid.className, liquid.panelProps?.className)}
          style={sheetStyle}
          onClickCapture={onLinkClick}
          onInteractOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            // Desktop: the cursor goes to the composer. Phones: nothing, so the keyboard does not cover the answer.
            if (!phone) composer.current?.focus({preventScroll: true})
          }}
        >
          <div ref={setHead} {...drag} className="sp-panel-head">
            <div aria-hidden className="sp-grab"/>
            <header className="sp-liquid sp-panel-pill">
              {view.kind !== "chat" && (
                <button type="button" onClick={chat.back} className="sp-icon-button sp-back" aria-label={copy.back} title={copy.back}>
                  <ArrowLeftIcon/>
                </button>
              )}
              <Dialog.Title className="sp-panel-title">
                {view.kind === "chat" && liquid.logo && <span aria-hidden className="sp-logo">{liquid.logo}</span>}
                <span className="sp-truncate">{title}</span>
              </Dialog.Title>
              {view.kind === "chat" && chat.messages.length > 0 && (
                <button type="button" onClick={chat.newChat} className="sp-icon-button" aria-label={copy.newChat} title={copy.newChat}>
                  <SquarePenIcon/>
                </button>
              )}
              <Dialog.Close className="sp-icon-button" aria-label={copy.close}>
                <XIcon/>
              </Dialog.Close>
            </header>
          </div>

          {ActionView && view.kind === "action" ? (
            <div className="sp-view" key={view.key} data-lenis-prevent="">
              <ActionView input={view.input} messages={chat.messages} conversationId={chat.messages.length ? chat.id : null} back={chat.back} close={chat.close}/>
            </div>
          ) : (
            <>
              <Chat.Messages className="sp-messages">
                <Chat.Content className="sp-messages-content" viewportProps={{className: "sp-messages-viewport sp-scroll"}}>
                  {liquid.privacyNote && <div className="sp-privacy">{liquid.privacyNote}</div>}
                  {chat.messages.map((m, i) => {
                    const text = chat.textOf(m)
                    const sources = m.role === "assistant" ? chat.sourcesOf(m) : []
                    const action = chat.actionOf(m)
                    if (!text && !sources.length && !action) return null
                    return (
                      <div key={m.id} data-role={m.role} className={cx("sp-message", m.role === "user" && i > 0 && "sp-message-gap")}>
                        {text && (m.role === "assistant" ? <div className="sp-answer"><Markdown text={text}/></div> : <p className="sp-bubble">{text}</p>)}
                        {sources.length > 0 && (
                          <details className="sp-sources">
                            <summary>
                              {copy.sources} ({sources.length})
                              <ChevronDownIcon className="sp-chevron"/>
                            </summary>
                            <div className="sp-sources-list">
                              {sources.map((src) => (
                                <a key={src.url} href={localPath(src.url)}>
                                  <FileTextIcon/>
                                  <span>{src.title}</span>
                                </a>
                              ))}
                            </div>
                          </details>
                        )}
                        {/* Reopens the view this answer prepared (it opened by itself once). */}
                        {action && (
                          <button type="button" className="sp-action-row" onClick={() => chat.openAction(action.action, action.input)}>
                            {action.action.label ?? action.action.title ?? action.action.id}
                            <ArrowUpRightIcon/>
                          </button>
                        )}
                      </div>
                    )
                  })}
                  {chat.waiting && (
                    <div className="sp-waiting" role="status">
                      {liquid.logo && <span aria-hidden className="sp-logo sp-pulse">{liquid.logo}</span>}
                      {copy.thinking}
                    </div>
                  )}
                  {chat.errorCode && !chat.busy && (
                    <p className="sp-error" role="alert">{copy.errors[chat.errorCode] ?? copy.errors.generic}</p>
                  )}
                  {!chat.busy && handoff}
                </Chat.Content>
                <Chat.ScrollButton className="sp-scroll-button" aria-label={copy.scrollToEnd}>
                  <ArrowDownIcon/>
                </Chat.ScrollButton>
              </Chat.Messages>

              <Chat.Composer chat={chat} ref={setFoot} className="sp-panel-foot" textareaProps={{ref: composer, className: "sp-textarea", maxLength: s.ask?.maxInput ?? 1000}}>
                {liquid.tide && <div aria-hidden className="sp-tide"><span/><span/><span/></div>}
                <div className="sp-composer-row">
                  {liquid.composerExtra?.(chat) ?? <span/>}
                  <Chat.Submit chat={chat} className="sp-fill sp-submit" send={<ArrowUpIcon/>} stop={<SquareIcon className="sp-stop-icon"/>}/>
                </div>
              </Chat.Composer>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** Writes the floating header's and composer's heights to `--sp-top` / `--sp-bottom` on the panel, so the content rests clear of them. */
function useOverlayInsets(head: HTMLElement | null, foot: HTMLElement | null) {
  useEffect(() => {
    const panel = (head ?? foot)?.closest<HTMLElement>(".sp-panel")
    if (!panel) return
    const write = () => {
      panel.style.setProperty("--sp-top", `${head?.offsetHeight ?? 0}px`)
      panel.style.setProperty("--sp-bottom", `${foot?.offsetHeight ?? 0}px`)
    }
    write()
    const ro = new ResizeObserver(write)
    if (head) ro.observe(head)
    if (foot) ro.observe(foot)
    return () => ro.disconnect()
  }, [head, foot])
}

/** The visual viewport while `active` (phones with the panel open): it shrinks when the keyboard opens, which `svh`/`dvh` do not. */
function usePhoneViewport(active: boolean) {
  const [vp, setVp] = useState<{top: number; height: number} | null>(null)
  useEffect(() => {
    const vv = window.visualViewport
    if (!active || !vv) {
      setVp(null)
      return
    }
    const update = () => setVp({top: vv.offsetTop, height: vv.height})
    update()
    vv.addEventListener("resize", update)
    vv.addEventListener("scroll", update)
    return () => {
      vv.removeEventListener("resize", update)
      vv.removeEventListener("scroll", update)
    }
  }, [active])
  return vp
}

/** Swipe-down-to-close for the phone sheet: pointer handlers for its grab area. */
function useSheetDrag(sheet: RefObject<HTMLDivElement | null>, close: () => void, enabled: boolean) {
  const start = useRef<number | null>(null)
  const dy = useRef(0)
  const set = (y: number, animate: boolean) => {
    const el = sheet.current
    if (!el) return
    el.style.transition = animate ? "transform 200ms ease-out" : "none"
    el.style.transform = y ? `translateY(${y}px)` : ""
  }
  useEffect(() => {
    if (enabled) set(0, false)
  }, [enabled])
  if (!enabled) return {}
  return {
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest("button")) return
      start.current = e.clientY
      dy.current = 0
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
      if (start.current === null) return
      dy.current = Math.max(0, e.clientY - start.current)
      set(dy.current, false)
    },
    onPointerUp: () => {
      if (start.current === null) return
      start.current = null
      if (dy.current > 80) close()
      else set(0, true)
    },
    onPointerCancel: () => {
      start.current = null
      set(0, true)
    },
  }
}
