import { z } from 'zod';
import { safeFetch, type FetchLike } from '../research/safeFetch.ts';

/**
 * English Wikipedia, read by the server (never the browser, never the AI): the source text AI
 * lessons are written from (GAME_DESIGN.md "New subjects"). Uses the public MediaWiki API with the
 * same guarded fetch as source checks. Only article titles and search words are sent.
 */

const api = 'https://en.wikipedia.org/w/api.php';

export interface WikiArticle {
  readonly title: string;
  readonly url: string;
  readonly pageId: number;
}

export interface WikiText extends WikiArticle {
  readonly revisionId: number | null;
  /** Plain text, trimmed to the limit, without reference-style sections. */
  readonly text: string;
}

const pagesSchema = z.object({
  query: z
    .object({
      pages: z.array(
        z.object({
          pageid: z.number().optional(),
          title: z.string(),
          missing: z.boolean().optional(),
          invalid: z.boolean().optional(),
          fullurl: z.string().optional(),
          pageprops: z.record(z.string(), z.unknown()).optional(),
          extract: z.string().optional(),
          revisions: z.array(z.object({ revid: z.number() })).optional(),
        }),
      ),
    })
    .optional(),
});

const searchSchema = z.object({ query: z.object({ search: z.array(z.object({ title: z.string() })) }).optional() });

/** Sections that list other works rather than explain the subject. */
const skipSections = /^(see also|references|notes|footnotes|citations|sources|bibliography|further reading|external links|gallery|works cited|explanatory notes)$/i;

/** Keeps the introduction and the explaining sections, in order, up to `maxChars` (whole paragraphs). */
export function trimArticle(extract: string, maxChars: number): string {
  const out: string[] = [];
  let size = 0;
  let skipping = false;
  for (const raw of extract.split(/\n+/)) {
    const line = raw.trim();
    if (!line) continue;
    const heading = /^(=+)\s*(.*?)\s*\1$/.exec(line);
    if (heading) {
      skipping = skipSections.test(heading[2] ?? '');
      if (!skipping) {
        out.push(`\n${heading[2]}`);
        size += (heading[2] ?? '').length + 1;
      }
      continue;
    }
    if (skipping) continue;
    if (size + line.length > maxChars) break;
    out.push(line);
    size += line.length + 1;
  }
  return out.join('\n').trim();
}

export function createWikipedia(fetch: FetchLike, timeoutMs = 8000) {
  const getJson = async (params: Record<string, string>): Promise<unknown> => {
    const q = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
    const r = await safeFetch(`${api}?${q}`, { fetch, timeoutMs, maxBytes: 3_000_000, accept: 'application/json' });
    if (!r.ok) return null;
    try {
      return JSON.parse(r.page.body);
    } catch {
      return null;
    }
  };

  /** The article with this title (following redirects), or null if missing or a disambiguation page. */
  async function find(title: string): Promise<WikiArticle | null> {
    const parsed = pagesSchema.safeParse(await getJson({ action: 'query', redirects: '1', prop: 'info|pageprops', inprop: 'url', ppprop: 'disambiguation', titles: title }));
    const page = parsed.success ? parsed.data.query?.pages[0] : undefined;
    if (!page || page.missing || page.invalid || !page.pageid || !page.fullurl) return null;
    if (page.pageprops && 'disambiguation' in page.pageprops) return null;
    if (!page.fullurl.startsWith('https://en.wikipedia.org/')) return null;
    return { title: page.title, url: page.fullurl, pageId: page.pageid };
  }

  /** Top search hits for a phrase (titles only). */
  async function search(phrase: string, limit = 3): Promise<string[]> {
    const parsed = searchSchema.safeParse(await getJson({ action: 'query', list: 'search', srsearch: phrase, srlimit: String(limit), srnamespace: '0' }));
    return parsed.success ? (parsed.data.query?.search ?? []).map((s) => s.title) : [];
  }

  return {
    find,
    search,
    /** The suggested article if it exists; otherwise the best search hit that does. */
    async resolve(suggested: string, fallbackPhrase: string): Promise<WikiArticle | null> {
      const direct = await find(suggested);
      if (direct) return direct;
      for (const t of await search(`${suggested} ${fallbackPhrase}`.trim())) {
        const hit = await find(t);
        if (hit) return hit;
      }
      return null;
    },
    /** The article's text (by page id), trimmed for a lesson. */
    async text(pageId: number, maxChars = 9000): Promise<WikiText | null> {
      const parsed = pagesSchema.safeParse(
        await getJson({ action: 'query', prop: 'extracts|info|revisions', inprop: 'url', rvprop: 'ids', explaintext: '1', exsectionformat: 'wiki', pageids: String(pageId) }),
      );
      const page = parsed.success ? parsed.data.query?.pages[0] : undefined;
      if (!page || page.missing || !page.pageid || !page.fullurl || !page.extract) return null;
      const text = trimArticle(page.extract, maxChars);
      if (text.length < 400) return null;
      return { title: page.title, url: page.fullurl, pageId: page.pageid, revisionId: page.revisions?.[0]?.revid ?? null, text };
    },
  };
}
export type Wikipedia = ReturnType<typeof createWikipedia>;
