// `@perxel/spotlight`: the core. No React, no AI SDK: the search engine, the conversation store
// and message helpers, the contracts. Safe anywhere (browser, server, build scripts).

export {buildIndex, fold, groupByKind, markTerms, search} from "./core/search.js"
export {
  calledTool,
  conversationState,
  emailIn,
  latestFromVisitor,
  localStorageAdapter,
  noPersist,
  sourcesOf,
  textOf,
  toolName,
  toolOutputOf,
  type ConversationState,
} from "./core/conversation.js"
export {defaultCopy, mergeCopy} from "./core/copy.js"
export {defineAction} from "./types.js"
export type * from "./types.js"
