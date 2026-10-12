"use client"

import type {ComponentProps, ComponentPropsWithoutRef, ReactNode, Ref} from "react"
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
        maxLength={1000}
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

export const Chat = {Messages, Content, ScrollButton, Composer, Submit}
