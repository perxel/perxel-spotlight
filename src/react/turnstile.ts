// Cloudflare Turnstile in the browser, for `ask.prepare` and `ask.body`: the script is injected
// only when `prepare()` first runs (the gate opening), the widget runs invisibly
// ("interaction-only": a checkbox shows only when Cloudflare is unsure). A token is single use;
// `token()` hands the ready one over and the widget starts on the next.
//
//   const bot = turnstileWidget({siteKey})
//   ask={{endpoint: "/api/ask", prepare: bot.prepare, body: async () => ({turnstileToken: await bot.token()})}}
//
// Pairs with `turnstile({secret})` from `@perxel/spotlight/server`.

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string
  reset: (id: string) => void
  remove: (id: string) => void
}

const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
let loading: Promise<TurnstileApi> | null = null

function load(): Promise<TurnstileApi> {
  const w = window as Window & {turnstile?: TurnstileApi}
  if (w.turnstile) return Promise.resolve(w.turnstile)
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script")
    script.src = SRC
    script.async = true
    script.onload = () => (w.turnstile ? resolve(w.turnstile) : reject(new Error("turnstile")))
    script.onerror = () => {
      loading = null
      reject(new Error("turnstile"))
    }
    document.head.appendChild(script)
  })
  return loading
}

export interface TurnstileWidgetOptions {
  siteKey: string
  /** The widget's language (`auto` by default). */
  language?: string
  /** Class on the container the widget renders into (appended to `<body>`): place its checkbox. */
  className?: string
}

export interface TurnstileWidget {
  /** Load the script and start on a token. Safe to call often. */
  prepare: () => void
  /** A fresh token (waits for one if none is ready); `undefined` if Turnstile failed. */
  token: () => Promise<string | undefined>
  /** Remove the widget and its container. */
  dispose: () => void
}

export function turnstileWidget({siteKey, language = "auto", className}: TurnstileWidgetOptions): TurnstileWidget {
  let el: HTMLDivElement | null = null
  let widgetId: string | null = null
  let ready: Promise<TurnstileApi> | null = null
  let token: string | null = null
  let waiting: ((t: string | undefined) => void)[] = []

  const start = () => {
    if (ready) return ready
    el = document.createElement("div")
    el.dataset.spotlightTurnstile = ""
    if (className) el.className = className
    else Object.assign(el.style, {position: "fixed", left: "50%", bottom: "16px", transform: "translateX(-50%)", zIndex: "2147483000"})
    document.body.appendChild(el)
    ready = load().then((api) => {
      widgetId = api.render(el!, {
        sitekey: siteKey,
        appearance: "interaction-only",
        language,
        callback: (t: string) => {
          const next = waiting.shift()
          if (next) {
            next(t)
            api.reset(widgetId!)
          } else token = t
        },
        "error-callback": () => {
          for (const w of waiting) w(undefined)
          waiting = []
        },
      })
      return api
    })
    ready.catch(() => {
      for (const w of waiting) w(undefined)
      waiting = []
    })
    return ready
  }

  return {
    prepare: () => void start().catch(() => undefined),
    async token() {
      const api = await start().catch(() => null)
      if (!api) return undefined
      if (token) {
        const t = token
        token = null
        if (widgetId) api.reset(widgetId) // the next call gets a fresh one
        return t
      }
      return new Promise((resolve) => waiting.push(resolve))
    },
    dispose() {
      const w = window as Window & {turnstile?: TurnstileApi}
      if (widgetId) w.turnstile?.remove(widgetId)
      el?.remove()
      el = null
      ready = null
      widgetId = null
      token = null
    },
  }
}
