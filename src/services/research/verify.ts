import type { Catalogues } from './catalogues.ts';
import { titlesMatch, titleTokens } from './catalogues.ts';
import { pageText, pageTitles, safeFetch, type FetchLike } from './safeFetch.ts';
import { publisherKindOf, type PublisherKind } from './trustedPublishers.ts';

/**
 * Checks a suggested source before the game will ever cite it (AI_SYSTEM.md "Citation integrity").
 * Deterministic: our own code fetches and compares; no AI is involved and fetched text is never sent
 * to one.
 *
 * - Web page: the address is safe, the page loads, its title matches the claimed title, it is about
 *   the topic, and it belongs to a trusted publisher.
 * - Book: found in Open Library with a matching title (and author, if one was given).
 * - Article: found in Crossref with a matching title (by DOI if one was given, else by search).
 *
 * Anything that fails stays "unverified" and is never shown as a citation.
 */

export interface SourceCandidate {
  readonly kind: 'web' | 'book' | 'article';
  readonly title: string;
  readonly author?: string;
  readonly publisher?: string;
  readonly year?: number;
  readonly url?: string;
  readonly doi?: string;
}

export interface Check {
  readonly name: 'safe_address' | 'page_loaded' | 'title_matches' | 'about_topic' | 'trusted_publisher' | 'catalogue_match';
  readonly passed: boolean;
  readonly detail: string;
}

export interface CheckedSource {
  readonly kind: SourceCandidate['kind'];
  readonly title: string;
  readonly author: string | null;
  readonly publisher: string | null;
  readonly year: number | null;
  /** Where the player can find it: the page itself, the DOI, or the catalogue record. */
  readonly url: string | null;
  readonly doi: string | null;
  readonly status: 'verified' | 'unverified';
  readonly publisherKind: PublisherKind | null;
  readonly checks: readonly Check[];
}

export interface VerifyDeps {
  readonly fetch: FetchLike;
  readonly catalogues: Catalogues;
  readonly timeoutMs?: number;
}

const blank = (s: string | undefined) => (s && s.trim() ? s.trim() : null);

/** True when at least `min` of the topic's key words appear in the text. */
export function aboutTopic(text: string, topicWords: readonly string[], min = 2): boolean {
  const have = new Set(titleTokens(text));
  const words = [...new Set(topicWords.flatMap((w) => titleTokens(w)).filter((w) => w.length >= 4))];
  const needed = Math.min(min, words.length);
  return needed > 0 && words.filter((w) => have.has(w)).length >= needed;
}

export async function verifySource(c: SourceCandidate, topicWords: readonly string[], deps: VerifyDeps): Promise<CheckedSource> {
  const base = {
    kind: c.kind, title: c.title.trim(), author: blank(c.author), publisher: blank(c.publisher), year: c.year && c.year > 0 ? c.year : null,
    url: blank(c.url), doi: blank(c.doi), publisherKind: null as PublisherKind | null,
  };
  const checks: Check[] = [];
  const done = (over: Partial<CheckedSource> = {}): CheckedSource => ({
    ...base, ...over, checks, status: checks.length > 0 && checks.every((k) => k.passed) ? 'verified' : 'unverified',
  });

  if (c.kind === 'book') {
    const rec = await deps.catalogues.findBook(c.title, c.author).catch(() => null);
    checks.push({ name: 'catalogue_match', passed: !!rec, detail: rec ? 'Found in Open Library' : 'Not found in Open Library with this title and author' });
    if (!rec) return done();
    return done({ title: rec.title, author: rec.authors.join(', ') || base.author, year: rec.year ?? base.year, publisher: base.publisher ?? rec.publisher, url: rec.url });
  }

  if (c.kind === 'article') {
    const rec = await deps.catalogues.findArticle(c.title, c.author, c.doi).catch(() => null);
    checks.push({ name: 'catalogue_match', passed: !!rec, detail: rec ? 'Found in Crossref' : 'Not found in Crossref with this title (and DOI or author)' });
    if (!rec) return done();
    return done({ title: rec.title, author: rec.authors.join(', ') || base.author, year: rec.year ?? base.year, publisher: rec.publisher ?? base.publisher, url: rec.url, doi: rec.doi ?? base.doi, publisherKind: 'academic_publisher' });
  }

  // Web page
  if (!base.url) {
    checks.push({ name: 'safe_address', passed: false, detail: 'No address was given' });
    return done();
  }
  const kind = publisherKindOf(base.url);
  checks.push({ name: 'trusted_publisher', passed: !!kind, detail: kind ? `Trusted publisher (${kind})` : 'Not on the trusted publisher list' });
  const fetched = await safeFetch(base.url, { fetch: deps.fetch, timeoutMs: deps.timeoutMs ?? 8000 });
  if (!fetched.ok) {
    const unsafe = /address|host|port|credentials|IP/.test(fetched.reason);
    checks.push(unsafe ? { name: 'safe_address', passed: false, detail: fetched.reason } : { name: 'page_loaded', passed: false, detail: fetched.reason });
    return done({ publisherKind: kind });
  }
  checks.push({ name: 'page_loaded', passed: true, detail: 'The page loaded' });
  const html = fetched.page.body;
  const titles = pageTitles(html);
  const titleOk = titles.some((t) => titlesMatch(c.title, t, 0.6) || titlesMatch(t, c.title, 0.6));
  checks.push({ name: 'title_matches', passed: titleOk, detail: titleOk ? 'The page title matches' : `The page title is “${(titles[0] ?? 'none').slice(0, 120)}”` });
  const topical = aboutTopic(pageText(html).slice(0, 300_000), topicWords);
  checks.push({ name: 'about_topic', passed: topical, detail: topical ? 'The page is about the topic' : 'The page does not mention the topic' });
  return done({ url: fetched.page.url, publisherKind: kind });
}
