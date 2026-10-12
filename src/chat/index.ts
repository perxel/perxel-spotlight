// `@perxel/spotlight/chat`: the chat half (imports the AI SDK). Import it only from the panel
// module the provider loads lazily, so pages never load it until the gate hands over a question.

export {useAskChat, defaultTransport, type AskChat, type ChatView, type UseAskChatOptions} from "./useAskChat.js"
export {Chat} from "./parts.js"
export {calledTool, sourcesOf, textOf, toolOutputOf, latestFromVisitor} from "../core/messages.js"
