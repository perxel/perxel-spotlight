// `@perxel/spotlight/react`: the headless layer. The provider (state, the shortcut, lazy loading
// of the gate and panel modules, the iOS keyboard bridge), a trigger, the gate's parts and hooks.
// No styling: state is in `data-*` attributes. The chat parts are in `@perxel/spotlight/chat`,
// so a page that never opens the panel never loads the AI SDK.

export {SpotlightProvider, Trigger, useSpotlight, isMac, shortcutLabel, defaultNavigate, type SpotlightState} from "./provider.js"
export {Gate, Marked, useGate, useGateContext, type GateApi, type UseGateOptions} from "./gate.js"
export {useSearchAsk, type SearchAskOption, type UseSearchAskOptions} from "./useSearchAsk.js"
export {localStorageAdapter, noPersist} from "../core/conversation.js"
export {defineAction} from "../types.js"
export type * from "../types.js"
