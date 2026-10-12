"use client"

// `@perxel/spotlight/liquid`: the default skin. Glass gate and panel, themed with CSS variables
// (import `@perxel/spotlight/liquid.css` once). The gate and the panel are lazy chunks: a page's
// first load holds only the provider and the triggers.

import {SpotlightProvider} from "../react/provider.js"
import type {GateProps, Loader, PanelProps, SpotlightProps} from "../types.js"
import {LiquidContext, type LiquidOptions} from "./context.js"

const gate: Loader<GateProps> = () => import("./gate.js")
const panel: Loader<PanelProps> = () => import("./panel.js")

export type SpotlightLiquidProps = Omit<SpotlightProps, "gate" | "panel"> & LiquidOptions

/** The provider with the liquid gate and panel. Wrap the app (or the part that offers search/ask). */
export function SpotlightLiquid({logo, privacyNote, handoff, composerExtra, uiTools, localHosts, tide, gateProps, panelProps, className, ...props}: SpotlightLiquidProps) {
  const options: LiquidOptions = {logo, privacyNote, handoff, composerExtra, uiTools, localHosts, tide, gateProps, panelProps, className}
  return (
    <LiquidContext.Provider value={options}>
      <SpotlightProvider {...props} gate={gate} panel={panel}/>
    </LiquidContext.Provider>
  )
}

export type {LiquidOptions}
