// `@perxel/spotlight/gate`: the gate's headless parts and hooks (Radix dialog, the search engine).
// Import it only from the gate module the provider loads lazily, so pages never load it until
// the gate first opens (or is prefetched).

export {Gate, Marked, useGate, useGateContext, type GateApi, type UseGateOptions} from "./parts.js"
export {useSearchAsk, type SearchAskOption, type UseSearchAskOptions} from "./useSearchAsk.js"
