// Small text helpers on their own (folding for matching, finding an email), so light modules (an
// action's `fromSearch`) can use them without the search engine or the message helpers.

/**
 * Lowercase, accents and other combining marks removed, `đ` folded to `d`, a dot or apostrophe
 * inside a word dropped ("Next.js" → "nextjs"), anything else that is not a letter or digit
 * turned into a space. "Dịch vụ & SEO" → "dich vu seo".
 */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/(?<=[\p{L}\p{N}])[.'’](?=[\p{L}\p{N}])/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

/** Email addresses in a text (global). */
export const EMAIL_IN_TEXT = /[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[a-z]{2,}/gi

/** The first email address in a text. */
export function emailIn(text: string): string | undefined {
  return text.match(new RegExp(EMAIL_IN_TEXT.source, "i"))?.[0]
}
