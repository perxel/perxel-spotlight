"use client"

import {useEffect, useLayoutEffect, useState} from "react"
import "./liquid.css"
import {Gate, useGateContext} from "../gate/parts.js"
import type {GateProps} from "../types.js"
import {useLiquid} from "./context.js"
import {ArrowDownIcon, ArrowUpIcon, ArrowUpRightIcon, CornerDownLeftIcon, SearchIcon, XIcon} from "./icons.js"
import {cx, PHONE_QUERY, REDUCED_MOTION, useMedia} from "./util.js"

/** Phones: the gate's top in px, under the close button floating above the box; and its results' distance from the keyboard. */
const PHONE_TOP = 64
const PHONE_BOTTOM = 16

/** Phones: the visible height (it shrinks when the keyboard opens), so the results end above the keyboard. */
function useVisibleHeight(active: boolean) {
  const [h, setH] = useState<number | null>(null)
  useEffect(() => {
    const vv = window.visualViewport
    if (!active || !vv) {
      setH(null)
      return
    }
    const update = () => setH(vv.height)
    update()
    vv.addEventListener("resize", update)
    return () => vv.removeEventListener("resize", update)
  }, [active])
  return h
}

/**
 * The liquid gate: like Spotlight, a glass box near the top over a dimmed, blurred page; under it,
 * only when something matches, one glass group with every result. A hint in the box says what
 * Enter does (keyboards), a send button replaces it on touch screens.
 */
export default function LiquidGate({open, onOpenChange}: GateProps) {
  const liquid = useLiquid()
  const phone = useMedia(PHONE_QUERY)
  const visible = useVisibleHeight(open && phone)
  const room = visible ? visible - PHONE_TOP - PHONE_BOTTOM : null
  return (
    <Gate.Root
      open={open}
      onOpenChange={onOpenChange}
      overlayProps={{className: cx("sp-overlay", liquid.className)}}
      {...liquid.gateProps}
      className={cx("sp-gate", liquid.className, liquid.gateProps?.className)}
      style={room ? {maxHeight: room} : undefined}
    >
      <Body phone={phone} room={room}/>
    </Gate.Root>
  )
}

function Body({phone, room}: {phone: boolean; room: number | null}) {
  const g = useGateContext()
  const {search} = g

  // The highlight is one glass piece that slides from row to row. Measured from the active row;
  // coming from nothing it appears in place instead of sliding from the last row.
  const [hl, setHl] = useState<{top: number; height: number; on: boolean; jump: boolean}>({top: 0, height: 0, on: false, jump: true})
  useLayoutEffect(() => {
    const el = search.active === -1 ? null : document.getElementById(search.optionProps(search.active).id)
    setHl((h) => (el ? {top: el.offsetTop, height: el.offsetHeight, on: true, jump: !h.on} : {...h, on: false}))
    el?.scrollIntoView({block: "nearest", behavior: matchMedia(REDUCED_MOTION).matches ? "auto" : "smooth"})
  }, [search.active, search.results])

  return (
    <>
      {/* Phones: a glass circle floating above the box's top right corner (desktop: Escape, a press outside). */}
      <Gate.Close className="sp-liquid sp-glass sp-gate-close">
        <XIcon/>
      </Gate.Close>
      <div className="sp-liquid sp-glass sp-gate-box">
        <SearchIcon className="sp-gate-icon"/>
        <Gate.Input className="sp-gate-input"/>
        {phone ? (
          <Gate.Send className="sp-fill sp-gate-send"><ArrowUpIcon/></Gate.Send>
        ) : (
          // Each hint is always mounted and slides open or shut: ↑↓ while there are results, ↵ once
          // text is typed, both only while the box has focus.
          <span aria-hidden className="sp-gate-hints">
            <span data-on={(g.focused && search.count > 0) || undefined} className="sp-hint">
              <kbd className="sp-kbd sp-kbd-arrows"><ArrowUpIcon/><ArrowDownIcon/></kbd>
            </span>
            <span data-on={(g.focused && !!g.typed && !!g.hint) || undefined} className="sp-hint">
              <span className="sp-hint-enter">
                <kbd className="sp-kbd"><CornerDownLeftIcon/></kbd>
                <span key={g.hint ?? ""} className="sp-fade-in">{g.hint}</span>
              </span>
            </span>
          </span>
        )}
      </div>

      {search.count > 0 && (
        <div className="sp-liquid sp-glass sp-gate-results">
          <div className="sp-scroll" data-lenis-prevent="" style={room ? {maxHeight: room - 56 - 8} : undefined}>
            <Gate.Results className="sp-gate-list">
              {({index, ...result}) => (
                <Gate.Item
                  result={result}
                  index={index}
                  className="sp-row"
                  style={{animationDelay: `${Math.min(index, 8) * 25}ms`}}
                >
                  <span className="sp-row-text">
                    <span className="sp-row-title"><Gate.Marked text={result.doc.title} marks={result.titleMarks}/></span>
                    {result.snippet ? (
                      <span className="sp-row-sub sp-truncate"><Gate.Marked {...result.snippet}/></span>
                    ) : result.doc.subtitle ? (
                      <span className="sp-row-sub">{result.doc.subtitle}</span>
                    ) : null}
                  </span>
                  <span className="sp-row-kind">
                    {g.kindLabel(result.doc.kind)}
                    <ArrowUpRightIcon className="sp-row-arrow"/>
                  </span>
                </Gate.Item>
              )}
            </Gate.Results>
            <span
              aria-hidden
              data-on={hl.on || undefined}
              data-jump={hl.jump || undefined}
              className="sp-liquid sp-liquid-accent sp-hl"
              style={{transform: `translateY(${hl.top}px)`, height: hl.height}}
            />
          </div>
        </div>
      )}
    </>
  )
}
