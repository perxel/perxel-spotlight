// `@perxel/spotlight`: the core. No React, no AI SDK: the search engine, the conversation store
// and message helpers, the contracts. Safe anywhere (browser, server, build scripts).

export {buildIndex, fold, groupByKind, markTerms, search} from "./core/search.js"
export {conversationState, localStorageAdapter, noPersist, type ConversationState} from "./core/storage.js"
export {calledTool, latestFromVisitor, sourcesOf, textOf, toolName, toolOutputOf} from "./core/messages.js"
export {emailIn} from "./core/fold.js"
export {defaultCopy, mergeCopy} from "./core/copy.js"
export {defineAction} from "./types.js"
export type * from "./types.js"
