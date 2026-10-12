"use client"

import {useSpotlight, Trigger, shortcutLabel} from "@perxel/spotlight/react"
import {SpotlightLiquid} from "@perxel/spotlight/liquid"
import {defineAction, type SearchDoc} from "@perxel/spotlight"
import {useEffect, useState} from "react"

type Mode = "both" | "search" | "ask"

const loadDocs = () => import("./docs").then((m) => m.docs as SearchDoc[])

const contact = defineAction<{message?: string}>({
  id: "contact",
  search: {title: "Send us a message", keywords: ["contact", "email", "hire"]},
  fromSearch: (q) => ({message: q}),
  title: "Contact",
  label: "Open the contact form",
  hint: "to open the form",
  view: ({input, back}) => (
    <form style={{padding: 16, display: "flex", flexDirection: "column", gap: 12}} onSubmit={(e) => (e.preventDefault(), back())}>
      <label>Message<textarea defaultValue={input?.message} style={{display: "block", width: "100%", minHeight: 120}}/></label>
      <button type="submit">Send (does nothing)</button>
    </form>
  ),
})

export function Demo() {
  const [mode, setMode] = useState<Mode>("both")
  useEffect(() => {
    const m = new URLSearchParams(location.search).get("mode")
    if (m === "search" || m === "ask" || m === "both") setMode(m)
  }, [])
  return (
    <SpotlightLiquid
      key={mode}
      search={mode !== "ask" ? searchConfig : undefined}
      ask={mode !== "search" ? askConfig : undefined}
      actions={[contact]}
      tide
      privacyNote={<>Questions go to an AI model through this example's own route. Nothing is stored.</>}
    >
      <main style={{maxWidth: 640, margin: "15vh auto", padding: 24}}>
        <h1 style={{fontWeight: 300}}>@perxel/spotlight</h1>
        <p>Mode: {(["both", "search", "ask"] as Mode[]).map((m) => <a key={m} href={`?mode=${m}`} style={{marginRight: 12, fontWeight: m === mode ? 600 : 400}}>{m}</a>)}</p>
        <Open/>
      </main>
    </SpotlightLiquid>
  )
}

const searchConfig = {load: loadDocs, kindOrder: ["action", "page", "post"]}
const askConfig = {endpoint: "/api/ask", body: () => ({page: location.pathname})}

function Open() {
  const s = useSpotlight()
  const [label, setLabel] = useState("⌘K")
  useEffect(() => setLabel(shortcutLabel() ?? ""), [])
  return <Trigger style={{padding: "10px 18px", borderRadius: 999}}>{label} Open ({s.mode})</Trigger>
}
