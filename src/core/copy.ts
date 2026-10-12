import type {SpotlightCopy} from "../types.js"

/** English defaults. A site passes its own strings (any language) through `copy`. */
export const defaultCopy: SpotlightCopy = {
  gateTitle: "Search",
  placeholder: "Search or ask…",
  placeholderSearch: "Search…",
  placeholderAsk: "Ask a question…",
  hintAsk: "to ask AI",
  hintOpen: "to open",
  kinds: {},
  results: (n) => (n === 1 ? "1 result" : `${n} results`),
  panelTitle: "Ask",
  newChat: "New chat",
  close: "Close",
  back: "Back",
  send: "Send",
  stop: "Stop",
  thinking: "Looking it up",
  sources: "Sources",
  scrollToEnd: "Scroll to the newest message",
  errors: {
    generic: "Something went wrong. Please try again.",
    rate_limited: "Too many questions at once. Please wait a minute.",
    verify_failed: "We could not check that you are not a bot. Please reload and try again.",
    conversation_limit: "This conversation is at its limit. Start a new chat.",
    budget: "Ask is resting for today. Please try again tomorrow.",
    upstream: "The answer could not be written. Please try again.",
    bad_request: "That message could not be sent.",
  },
}

export function mergeCopy(copy?: Partial<SpotlightCopy>): SpotlightCopy {
  if (!copy) return defaultCopy
  return {
    ...defaultCopy,
    ...copy,
    kinds: {...defaultCopy.kinds, ...copy.kinds},
    errors: {...defaultCopy.errors, ...copy.errors},
  }
}
