/**
 * Quote checks for AI-written lessons: every lesson section, Codex entry and question must carry a
 * short quote, and the quote must really appear in the text it was written from. Comparison ignores
 * case, punctuation, accents and spacing, so "Tigris–Euphrates" matches "tigris euphrates".
 */

export const minQuoteChars = 15;
export const maxQuoteChars = 200;

export const normalizeForQuote = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** A searchable form of the source text, built once per text. */
export function quoteIndex(text: string) {
  const haystack = ` ${normalizeForQuote(text)} `;
  return {
    /** True when `quote` is long enough and appears, word for word, in the text. */
    has(quote: string): boolean {
      const q = normalizeForQuote(quote);
      if (q.length < minQuoteChars || quote.length > maxQuoteChars + 20) return false;
      return haystack.includes(` ${q} `);
    },
  };
}
