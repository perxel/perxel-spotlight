"use client"

import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ComponentType,
  type ReactNode,
} from "react"
import {localStorageAdapter} from "../core/conversation.js"
import {mergeCopy} from "../core/copy.js"
import type {
  Action,
  AskConfig,
  GateProps,
  Loader,
  Navigate,
  PanelProps,
  PersistAdapter,
  SearchConfig,
  SpotlightCopy,
  SpotlightMode,
  SpotlightProps,
  SpotlightRequest,
} from "../types.js"

/** Everything the gate, the panel and the triggers read. */
export interface SpotlightState {
  mode: SpotlightMode
  /** On and with something to show: triggers render, the shortcut is bound. */
  available: boolean
  search: SearchConfig | undefined
  ask: AskConfig | undefined
  actions: Action[]
  copy: SpotlightCopy
  navigate: Navigate
  /** Where the conversation is kept (`ask.persist`, default `localStorage`). */
  persist: PersistAdapter
  gateOpen: boolean
  /** Open the gate. Call it inside the click or key handler: iOS opens the keyboard only inside the gesture. */
  openGate: () => void
  closeGate: () => void
  setGateOpen: (open: boolean) => void
  panelOpen: boolean
  setPanelOpen: (open: boolean) => void
  /** Start downloading the gate (pointer enter, focus, touch start on a trigger). */
  prefetch: () => void
  /** From the gate: close it and give the panel its job. */
  handOff: (request: SpotlightRequest) => void
  /** The panel's current job; `n` changes with every new one. */
  request: {n: number; r: SpotlightRequest} | null
  /** The gate closed by itself (Escape, outside, the shortcut): focus goes back where it was. */
  restoreFocus: () => void
}

const SpotlightContext = createContext<SpotlightState | null>(null)

/** The provider's state. Outside a provider: an unavailable stub, so a trigger renders nothing. */
export function useSpotlight(): SpotlightState {
  return useContext(SpotlightContext) ?? STUB
}

const noop = () => {}
const STUB: SpotlightState = {
  mode: "none",
  available: false,
  search: undefined,
  ask: undefined,
  actions: [],
  copy: mergeCopy(),
  navigate: noop,
  persist: {read: () => null, write: noop},
  gateOpen: false,
  openGate: noop,
  closeGate: noop,
  setGateOpen: noop,
  panelOpen: false,
  setPanelOpen: noop,
  prefetch: noop,
  handOff: noop,
  request: null,
  restoreFocus: noop,
}

/** Apple keyboard: the shortcut is ⌘ there, Ctrl elsewhere. Client only. */
export function isMac(): boolean {
  const nav = navigator as Navigator & {userAgentData?: {platform?: string}}
  return /mac|iphone|ipad|ipod/i.test(nav.userAgentData?.platform || nav.platform || nav.userAgent)
}

/** The shortcut as shown to the visitor ("⌘K", "Ctrl K"); `null` when off. Client only. */
export function shortcutLabel(shortcut: string | false = "mod+k"): string | null {
  if (!shortcut) return null
  const key = shortcut.split("+").at(-1)!.toUpperCase()
  return isMac() ? `⌘${key}` : `Ctrl ${key}`
}

/** Default navigation: a hash on this page scrolls; anything else is a page load. */
export const defaultNavigate: Navigate = (url, {newTab}) => {
  if (newTab) {
    window.open(url, "_blank", "noopener")
    return
  }
  const u = new URL(url, location.href)
  if (u.origin === location.origin && u.pathname === location.pathname && u.search === location.search && u.hash) {
    location.hash = u.hash
    return
  }
  location.assign(u.href)
}

function useLazy<P>(loader: Loader<P> | undefined): ComponentType<P> | null {
  // One lazy component per loader: pass a stable (module-level) loader.
  return useMemo(() => (loader ? lazy(loader) : null), [loader]) as ComponentType<P> | null
}

/** True once the page is idle after load (`delay` ms), or at the first input, whichever comes first. */
function useIdle(delay: number | false): boolean {
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    if (delay === false) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const wake = () => setIdle(true)
    const events = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const
    const start = () => {
      timer = setTimeout(wake, delay)
    }
    if (document.readyState === "complete") start()
    else window.addEventListener("load", start, {once: true})
    for (const e of events) window.addEventListener(e, wake, {once: true, passive: true})
    return () => {
      clearTimeout(timer)
      window.removeEventListener("load", start)
      for (const e of events) window.removeEventListener(e, wake)
    }
  }, [delay])
  return idle
}

export function SpotlightProvider({
  search,
  ask,
  actions = [],
  gate,
  panel,
  navigate = defaultNavigate,
  shortcut = "mod+k",
  enabled = true,
  copy,
  prefetch: prefetchWhen = true,
  children,
}: SpotlightProps) {
  const mode: SpotlightMode = search && ask ? "both" : search ? "search" : ask ? "ask" : "none"
  const available = enabled && mode !== "none"
  const merged = useMemo(() => mergeCopy(copy), [copy])
  const persist = useMemo(() => (ask?.persist === false ? {read: () => null, write: () => {}} : ask?.persist ?? localStorageAdapter()), [ask?.persist])

  const Gate = useLazy<GateProps>(gate)
  const Panel = useLazy<PanelProps>(ask ? panel : undefined)

  const [panelOpen, setPanelOpenRaw] = useState(false)
  // Once opened, the panel stays mounted (hidden when closed) so the conversation survives.
  const [panelMounted, setPanelMounted] = useState(false)
  const setPanelOpen = useCallback((next: boolean) => {
    if (next) setPanelMounted(true)
    setPanelOpenRaw(next)
  }, [])
  const [gateOpen, setGateOpenRaw] = useState(false)
  const [gateMounted, setGateMounted] = useState(false)
  const [request, setRequest] = useState<{n: number; r: SpotlightRequest} | null>(null)

  const prefetch = useCallback(() => {
    void gate().catch(() => undefined)
  }, [gate])
  const idle = useIdle(prefetchWhen === false ? false : prefetchWhen === true ? 1500 : prefetchWhen)
  useEffect(() => {
    if (idle && available) prefetch()
  }, [idle, available, prefetch])

  // iOS opens the keyboard only for a focus inside the tap itself, and the gate may still be
  // loading then. So the tap focuses this always-present field, and the gate moves the focus to
  // its own input once mounted (iOS keeps the keyboard up across that move).
  const bridge = useRef<HTMLInputElement>(null)
  const returnFocus = useRef<Element | null>(null)
  const askRef = useRef(ask)
  askRef.current = ask

  const openGate = useCallback(() => {
    const active = document.activeElement
    if (active !== bridge.current && !active?.closest("[data-spotlight-gate]")) returnFocus.current = active
    bridge.current?.focus({preventScroll: true})
    setGateMounted(true)
    setGateOpenRaw(true)
    if (panel && askRef.current) void panel().catch(() => undefined)
    void Promise.resolve(askRef.current?.prepare?.()).catch(() => undefined)
  }, [panel])
  const closeGate = useCallback(() => setGateOpenRaw(false), [])
  const setGateOpen = useCallback((open: boolean) => (open ? openGate() : closeGate()), [openGate, closeGate])
  const restoreFocus = useCallback(() => {
    const el = returnFocus.current as HTMLElement | null
    returnFocus.current = null
    if (el && el !== document.body && el.isConnected) el.focus({preventScroll: true})
    else bridge.current?.blur()
  }, [])

  const handOff = useCallback(
    (r: SpotlightRequest) => {
      returnFocus.current = null
      setGateOpenRaw(false)
      setRequest((prev) => ({n: (prev?.n ?? 0) + 1, r}))
      setPanelOpen(true)
    },
    [setPanelOpen],
  )

  // The shortcut opens the gate from anywhere, even from a text field or over the open panel;
  // pressed again it closes the gate, like Spotlight.
  const gateOpenRef = useRef(gateOpen)
  gateOpenRef.current = gateOpen
  useEffect(() => {
    if (!available || !shortcut) return
    const key = shortcut.split("+").at(-1)!.toLowerCase()
    const mac = isMac()
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== key || e.altKey || e.shiftKey) return
      if (mac ? !e.metaKey || e.ctrlKey : !e.ctrlKey || e.metaKey) return
      e.preventDefault()
      if (gateOpenRef.current) setGateOpenRaw(false)
      else openGate()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [available, shortcut, openGate])

  const value = useMemo<SpotlightState>(
    () => ({
      mode,
      available,
      search,
      ask,
      actions,
      copy: merged,
      navigate,
      persist,
      gateOpen,
      openGate,
      closeGate,
      setGateOpen,
      panelOpen,
      setPanelOpen,
      prefetch,
      handOff,
      request,
      restoreFocus,
    }),
    [mode, available, search, ask, actions, merged, navigate, persist, gateOpen, openGate, closeGate, setGateOpen, panelOpen, setPanelOpen, prefetch, handOff, request, restoreFocus],
  )

  return (
    <SpotlightContext.Provider value={value}>
      {children}
      {available && (
        // 16px: iOS zooms into any smaller field. Not `readOnly`: iOS opens no keyboard for one.
        <input
          ref={bridge}
          aria-hidden
          tabIndex={-1}
          data-spotlight-bridge=""
          style={{position: "fixed", top: 0, left: 0, width: 1, height: 1, fontSize: 16, opacity: 0, pointerEvents: "none", border: 0, padding: 0}}
        />
      )}
      {available && gateMounted && Gate && (
        <Suspense fallback={null}>
          <Gate open={gateOpen} onOpenChange={setGateOpen}/>
        </Suspense>
      )}
      {available && ask && panelMounted && Panel && (
        <Suspense fallback={null}>
          <Panel open={panelOpen} onOpenChange={setPanelOpen}/>
        </Suspense>
      )}
    </SpotlightContext.Provider>
  )
}

/**
 * A headless trigger: a `<button>` that opens the gate and prefetches it on pointer enter, focus
 * and touch. Renders nothing while Spotlight is unavailable, unless `always` (for a trigger that
 * must be in the server HTML, so the layout never shifts).
 */
export function Trigger({children, always, onClick, ...props}: ButtonHTMLAttributes<HTMLButtonElement> & {always?: boolean; children?: ReactNode}) {
  const s = useSpotlight()
  if (!s.available && !always) return null
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      data-spotlight-trigger=""
      {...props}
      onClick={(e) => {
        onClick?.(e)
        if (!e.defaultPrevented) s.openGate()
      }}
      onPointerEnter={(e) => {
        props.onPointerEnter?.(e)
        s.prefetch()
      }}
      onFocus={(e) => {
        props.onFocus?.(e)
        s.prefetch()
      }}
      onTouchStart={(e) => {
        props.onTouchStart?.(e)
        s.prefetch()
      }}
    >
      {children}
    </button>
  )
}
