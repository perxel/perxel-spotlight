// `@perxel/spotlight/react`: what a page's first load needs, and nothing more. The provider (state,
// the shortcut, lazy loading of the gate and panel modules, the iOS keyboard bridge), a trigger,
// `useSpotlight`. No styling: state is in `data-*` attributes. The gate's parts are in
// `@perxel/spotlight/gate` and the chat's in `@perxel/spotlight/chat`: import those only from the
// lazily loaded gate and panel modules.

export {SpotlightProvider, Trigger, useSpotlight, isMac, shortcutLabel, defaultNavigate, type SpotlightState} from "./provider.js"
export {localStorageAdapter, noPersist} from "../core/storage.js"
export {fold, emailIn} from "../core/fold.js"
export {turnstileWidget, type TurnstileWidget, type TurnstileWidgetOptions} from "./turnstile.js"
export {defineAction} from "../types.js"
export type * from "../types.js"
