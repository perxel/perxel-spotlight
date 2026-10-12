import {createOpenRouter} from "@openrouter/ai-sdk-provider"
import {contentSource, createAskHandler, mcpSource, toolSource} from "@perxel/spotlight/server"
import {jsonSchema, tool} from "ai"
import {docs} from "../../docs"

const openrouter = createOpenRouter({apiKey: process.env.OPENROUTER_API_KEY})

// One route, three kinds of source: the sample pages, a function, and (with SPOTLIGHT_MCP=1) the
// public tools of mcp.perxel.com.
export const POST = createAskHandler({
  model: openrouter("anthropic/claude-haiku-5.5"),
  system: "You answer questions about a sample studio site, only from tool results. Be short. Link the pages you used.",
  sources: [
    contentSource({docs}),
    toolSource({
      get_time: tool({
        description: "The current time on the server (ISO 8601).",
        inputSchema: jsonSchema<Record<string, never>>({type: "object", properties: {}}),
        execute: async () => ({now: new Date().toISOString()}),
      }),
    }),
    ...(process.env.SPOTLIGHT_MCP ? [mcpSource({url: "https://mcp.perxel.com/mcp", tools: ["search_content", "get_item"], fixed: () => ({locale: "en"})})] : []),
  ],
  onFinish: (turn) => console.log("[ask]", turn.question, "→", turn.tools.map((t) => t.name).join(", ") || "no tools", `${turn.timing.totalMs}ms`, `${turn.usage.inputTokens} in`),
})
