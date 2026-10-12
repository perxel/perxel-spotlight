"use client"

// `@perxel/spotlight/liquid`: the default skin. Glass gate and panel, themed with CSS variables.
// The gate and the panel are lazy chunks that import the skin's CSS themselves, so a page's first
// load holds only the provider and the triggers, and no stylesheet. (`@perxel/spotlight/liquid.css`
// is also exported, for a bundler that does not load CSS imported from a package.)

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
// The light parts of `./react`, so a site on the skin imports from one place.
export {Trigger, useSpotlight, isMac, shortcutLabel} from "../react/provider.js"
export {localStorageAdapter} from "../core/storage.js"
export {turnstileWidget} from "../react/turnstile.js"
