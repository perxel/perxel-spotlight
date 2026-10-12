"use client"

import {useSyncExternalStore} from "react"

/** Below this the panel is a bottom sheet and the gate sits near the top edge (matches the CSS). */
export const PHONE_QUERY = "(max-width: 1023.98px)"
export const REDUCED_MOTION = "(prefers-reduced-motion: reduce)"

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ")
}

/** A media query, `false` on the server and during hydration. */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = matchMedia(query)
      m.addEventListener("change", cb)
      return () => m.removeEventListener("change", cb)
    },
    () => matchMedia(query).matches,
    () => false,
  )
}
