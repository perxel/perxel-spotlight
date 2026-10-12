import type {AskContext} from "./types.js"

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

export interface TurnstileOptions {
  secret: string | undefined
  /** The body field holding the token (default `turnstileToken`). */
  field?: string
  /** Accept only tokens issued on these hostnames (default: any the site key allows). */
  hostnames?: string[]
  fetcher?: typeof fetch
}

/**
 * A `verify` check: Cloudflare Turnstile. The client sends a fresh token with every question (a
 * token is single use; the client widget makes the next one in the background). No secret: every
 * request is refused, so a missing environment variable never opens the endpoint.
 */
export function turnstile({secret, field = "turnstileToken", hostnames, fetcher = fetch}: TurnstileOptions) {
  return async (ctx: AskContext): Promise<boolean> => {
    const token = ctx.body[field]
    if (!secret || typeof token !== "string" || !token || token.length > 2048) return false
    const form = new FormData()
    form.set("secret", secret)
    form.set("response", token)
    const ip = ctx.request.headers.get("cf-connecting-ip") ?? ctx.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    if (ip) form.set("remoteip", ip)
    try {
      const res = await fetcher(SITEVERIFY, {method: "POST", body: form})
      const out = (await res.json()) as {success?: boolean; hostname?: string}
      if (!out.success) return false
      return !hostnames || (!!out.hostname && hostnames.includes(out.hostname))
    } catch {
      return false
    }
  }
}
