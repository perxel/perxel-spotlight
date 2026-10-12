import type {ToolSet} from "ai"

/** What every check, source and hook gets about the request. */
export interface AskContext {
  request: Request
  /** The request body's own fields, `messages` left out (locale, page, a bot-check token). */
  body: Record<string, unknown>
  /** The chat id the client sent, if any. */
  id: string | null
  /** The visitor's question (the last message's text). */
  question: string
  /** The conversation before it, text only. */
  history: {role: "user" | "assistant"; text: string}[]
}

/** A set of tools for the model. `contentSource`, `toolSource` and `mcpSource` make them. */
export interface AskSource {
  /** Prefixes this source's tools when a name is already taken by an earlier source. */
  name: string
  tools(ctx: AskContext): ToolSet | Promise<ToolSet>
}

/** A tool run in one turn. */
export interface ToolRun {
  name: string
  ms: number
  ok: boolean
  input: unknown
}

/** A cited source. */
export interface Cited {
  url: string
  title: string
}
