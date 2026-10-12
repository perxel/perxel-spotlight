// `@perxel/spotlight/server`: an optional chat endpoint for Ask. Web-standard (`Request` →
// `Response`), any AI SDK model, tools from the site's pages, its own functions or a remote MCP.

export {createAskHandler, sourcesIn, type AskErrorCode, type AskHandlerOptions, type AskTurn} from "./handler.js"
export {contentSource, mcpSource, toolSource, passagesOf, sectionOf, resetMcpCache, type ContentDoc, type ContentSourceOptions, type McpSourceOptions} from "./sources.js"
export {turnstile, type TurnstileOptions} from "./turnstile.js"
export type {AskContext, AskSource, Cited, ToolRun} from "./types.js"
