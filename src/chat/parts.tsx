"use client"

import type {ComponentProps, ComponentPropsWithoutRef, ReactNode, Ref} from "react"
import * as Dialog from "@radix-ui/react-dialog"
import {memo} from "react"
import {Streamdown} from "streamdown"
import {StickToBottom, useStickToBottomContext} from "use-stick-to-bottom"
import type {AskChat} from "./useAskChat.js"

/**
 * The conversation's scroll box: stays scrolled to the bottom while an answer streams, unless the
 * visitor scrolled up. `Chat.Content` holds the messages; `Chat.ScrollButton` shows while not at
 * the bottom.
 */
function Messages({children, ...props}: ComponentPropsWithoutRef<"div">) {
  return (
    <StickToBottom initial="smooth" resize="smooth" role="log" data-spotlight-messages="" {...props}>
      {children}
    </StickToBottom>
  )
}

/** The scrolling element and the content inside it (`viewportProps` go on the scrolling one). */
function Content({children, viewportProps, ...props}: ComponentPropsWithoutRef<"div"> & {viewportProps?: ComponentPropsWithoutRef<"div">}) {
  const {scrollRef, contentRef} = useStickToBottomContext()
  return (
    <div ref={scrollRef} data-spotlight-viewport="" data-lenis-prevent="" {...viewportProps}>
      <div ref={contentRef} data-spotlight-content="" {...props}>{children}</div>
    </div>
  )
}

/** Back to the newest message; renders only while scrolled up. */
function ScrollButton({onClick, ...props}: ComponentPropsWithoutRef<"button">) {
  const {isAtBottom, scrollToBottom} = useStickToBottomContext()
  if (isAtBottom) return null
  return (
    <button
      type="button"
      data-spotlight-scroll-button=""
      {...props}
      onClick={(e) => {
        onClick?.(e)
        void scrollToBottom()
      }}
    />
  )
}

/**
 * The composer: a form with a growing textarea; Enter sends, Shift+Enter breaks the line.
 * `children` render after the textarea (the send or stop button: `Chat.Submit`).
 */
function Composer({chat, children, textareaProps, ...props}: {chat: AskChat; children?: ReactNode; textareaProps?: ComponentPropsWithoutRef<"textarea"> & {ref?: Ref<HTMLTextAreaElement>}} & Omit<ComponentProps<"form">, "children">) {
  return (
    <form
      data-spotlight-composer=""
      {...props}
      onSubmit={(e) => {
        e.preventDefault()
        chat.send(chat.input)
      }}
    >
      <textarea
        value={chat.input}
        onChange={(e) => chat.setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            chat.send(chat.input)
          }
        }}
        placeholder={chat.copy.placeholderAsk}
        aria-label={chat.copy.placeholderAsk}
        maxLength={chat.maxInput}
        rows={1}
        {...textareaProps}
      />
      {children}
    </form>
  )
}

/** Send while idle (disabled with nothing typed), stop while an answer runs. `data-action` says which. */
function Submit({chat, send, stop, ...props}: {chat: AskChat; send?: ReactNode; stop?: ReactNode} & ComponentPropsWithoutRef<"button">) {
  return chat.busy ? (
    <button type="button" data-spotlight-submit="" data-action="stop" aria-label={chat.copy.stop} {...props} onClick={() => void chat.stop()}>{stop}</button>
  ) : (
    <button type="submit" data-spotlight-submit="" data-action="send" aria-label={chat.copy.send} disabled={!chat.input.trim()} {...props}>{send}</button>
  )
}

/**
 * An answer's markdown, streamed safely (Streamdown), unstyled: style it through `className`.
 * Links open in place (the panel decides where they go); memoised on the text.
 */
const Markdown = memo(
  ({text, className}: {text: string; className?: string}) => (
    <Streamdown className={className} linkSafety={{enabled: false}}>
      {text}
    </Streamdown>
  ),
  (a, b) => a.text === b.text && a.className === b.className,
)

/**
 * The panel's dialog (Radix): non-modal by default, so the page stays usable behind it; a press
 * outside does not close it (only `Chat.Close` or Escape). `modal` for a sheet over the page.
 * State: `data-state` (open/closed), `data-spotlight-panel`. Put a `Chat.Title` inside.
 */
function Panel({open, onOpenChange, modal = false, children, ...props}: {open: boolean; onOpenChange: (open: boolean) => void; modal?: boolean} & ComponentPropsWithoutRef<"div">) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange} modal={modal}>
      <Dialog.Portal>
        <Dialog.Content
          data-spotlight-panel=""
          aria-describedby={undefined}
          onInteractOutside={(e) => {
            if (!modal) e.preventDefault()
          }}
          {...props}
        >
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** The panel's accessible title (shown; hide it yourself if you want it for screen readers only). */
const Title = Dialog.Title
/** Closes the panel. */
const Close = Dialog.Close

export const Chat = {Panel, Title, Close, Messages, Content, ScrollButton, Composer, Submit, Markdown}
