import { z } from 'zod';
import { safeFetch, type FetchLike } from './safeFetch.ts';

/**
 * Free library catalogues used to confirm that a book or article really exists (server only):
 * Open Library for books, Crossref for journal articles. Only titles, author names and DOIs are
 * sent, never anything about the player.
 */

export interface CatalogueRecord {
  readonly title: string;
  readonly authors: readonly string[];
  readonly year: number | null;
  readonly publisher: string | null;
  readonly url: string;
  readonly doi?: string;
}

const stop = new Set(['the', 'and', 'of', 'a', 'an', 'in', 'on', 'to', 'for', 'from', 'with', 'by', 'at', 'its', 'their']);
export const titleTokens = (s: string) =>
  (s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9]+/g) ?? []).filter((t) => !stop.has(t) && t.length > 1);

/** Dice similarity of two titles' word sets (0–1). Ignores case, accents, punctuation and small words. */
export function titleSimilarity(a: string, b: string): number {
  const x = new Set(titleTokens(a));
  const y = new Set(titleTokens(b));
  if (x.size === 0 || y.size === 0) return 0;
  let shared = 0;
  for (const t of x) if (y.has(t)) shared++;
  return (2 * shared) / (x.size + y.size);
}

/** Compares the main part of a title, ignoring a subtitle after ":" on either side. */
export function titlesMatch(claimed: string, found: string, threshold = 0.75): boolean {
  const main = (s: string) => s.split(/[:—–]/)[0] ?? s;
  return Math.max(titleSimilarity(claimed, found), titleSimilarity(main(claimed), main(found))) >= threshold;
}

const surname = (name: string) => titleTokens(name).at(-1) ?? '';
/** True when no author was claimed, or the claimed author's surname is among the record's. */
export function authorMatches(claimed: string | undefined, authors: readonly string[]): boolean {
  if (!claimed?.trim()) return true;
  const want = claimed.split(/,|&|\band\b/).map(surname).filter(Boolean);
  const have = new Set(authors.map(surname));
  return want.some((s) => have.has(s));
}

const openLibrarySchema = z.object({
  docs: z.array(
    z.object({
      key: z.string(),
      title: z.string(),
      author_name: z.array(z.string()).optional(),
      first_publish_year: z.number().optional(),
      publisher: z.array(z.string()).optional(),
    }),
  ),
});

const crossrefWork = z.object({
  DOI: z.string(),
  title: z.array(z.string()).optional(),
  author: z.array(z.object({ given: z.string().optional(), family: z.string().optional(), name: z.string().optional() })).optional(),
  'container-title': z.array(z.string()).optional(),
  publisher: z.string().optional(),
  issued: z.object({ 'date-parts': z.array(z.array(z.number().nullable())) }).optional(),
});
type CrossrefWork = z.infer<typeof crossrefWork>;

const fromCrossref = (w: CrossrefWork): CatalogueRecord => ({
  title: w.title?.[0] ?? '',
  authors: (w.author ?? []).map((a) => a.name ?? [a.given, a.family].filter(Boolean).join(' ')),
  year: w.issued?.['date-parts']?.[0]?.[0] ?? null,
  publisher: w['container-title']?.[0] ?? w.publisher ?? null,
  url: `https://doi.org/${w.DOI}`,
  doi: w.DOI,
});

export interface Catalogues {
  findBook(title: string, author?: string): Promise<CatalogueRecord | null>;
  findArticle(title: string, author?: string, doi?: string): Promise<CatalogueRecord | null>;
}

export function createCatalogues(fetch: FetchLike, timeoutMs = 8000): Catalogues {
  const getJson = async (url: string): Promise<unknown> => {
    const r = await safeFetch(url, { fetch, timeoutMs, maxBytes: 1_000_000, accept: 'application/json' });
    if (!r.ok) return null;
    try {
      return JSON.parse(r.page.body);
    } catch {
      return null;
    }
  };

  return {
    async findBook(title, author) {
      const q = new URLSearchParams({ title, limit: '8', fields: 'key,title,author_name,first_publish_year,publisher' });
      if (author?.trim()) q.set('author', author.trim());
      const parsed = openLibrarySchema.safeParse(await getJson(`https://openlibrary.org/search.json?${q}`));
      if (!parsed.success) return null;
      const hit = parsed.data.docs.find((d) => titlesMatch(title, d.title) && authorMatches(author, d.author_name ?? []));
      if (!hit) return null;
      return {
        title: hit.title,
        authors: hit.author_name ?? [],
        year: hit.first_publish_year ?? null,
        publisher: hit.publisher?.[0] ?? null,
        url: `https://openlibrary.org${hit.key}`,
      };
    },

    async findArticle(title, author, doi) {
      const cleanDoi = doi?.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
      if (cleanDoi && /^10\.\d{4,9}\/\S+$/.test(cleanDoi)) {
        const one = z.object({ message: crossrefWork }).safeParse(await getJson(`https://api.crossref.org/works/${encodeURIComponent(cleanDoi)}`));
        if (one.success) {
          const rec = fromCrossref(one.data.message);
          // A real DOI that belongs to a different work is a wrong citation, not a match.
          return titlesMatch(title, rec.title) ? rec : null;
        }
      }
      const q = new URLSearchParams({ 'query.bibliographic': [title, author ?? ''].join(' ').trim(), rows: '5' });
      const list = z.object({ message: z.object({ items: z.array(crossrefWork) }) }).safeParse(await getJson(`https://api.crossref.org/works?${q}`));
      if (!list.success) return null;
      const hit = list.data.message.items.map(fromCrossref).find((r) => titlesMatch(title, r.title) && authorMatches(author, r.authors));
      return hit ?? null;
    },
  };
}
