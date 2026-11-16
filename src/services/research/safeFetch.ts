/**
 * Fetching pages from the open web, safely, for source checking (server only).
 *
 * Only public https addresses with a normal host name are fetched: no IP addresses, no local or
 * internal names, no other ports, no credentials in the URL. Redirects are followed by hand (at
 * most three) and every hop is checked again. Bodies are capped in size and time. Nothing fetched
 * here is ever sent to an AI: it is only searched by our own code.
 */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Identifies the app to the sites it checks, without any personal details. */
export const userAgent = 'TheAscendant/0.1 (educational game; automated source check)';

export interface FetchedPage {
  readonly url: string;
  readonly status: number;
  readonly contentType: string;
  readonly body: string;
}

export type FetchOutcome = { ok: true; page: FetchedPage } | { ok: false; reason: string };

const blockedSuffixes = ['.local', '.localhost', '.internal', '.intranet', '.lan', '.home', '.corp', '.test', '.invalid', '.example'];

/** Why a URL may not be fetched, or null when it may. */
export function unsafeUrlReason(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return 'not a valid address';
  }
  if (url.protocol !== 'https:') return 'not an https address';
  if (url.username || url.password) return 'address contains credentials';
  if (url.port && url.port !== '443') return 'unusual port';
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host.includes('.')) return 'not a public host name';
  if (/^\[.*\]$/.test(host) || host.includes(':')) return 'IP addresses are not fetched';
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || /^0x[0-9a-f]+$/i.test(host) || /^\d+$/.test(host)) return 'IP addresses are not fetched';
  if (host === 'localhost' || blockedSuffixes.some((s) => host.endsWith(s))) return 'not a public host name';
  return null;
}

export interface SafeFetchOptions {
  readonly fetch: FetchLike;
  readonly timeoutMs?: number;
  readonly maxBytes?: number;
  readonly maxRedirects?: number;
  readonly accept?: string;
}

async function readCapped(res: Response, maxBytes: number): Promise<string | null> {
  if (!res.body) return await res.text();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(all);
}

export async function safeFetch(raw: string, options: SafeFetchOptions): Promise<FetchOutcome> {
  const timeoutMs = options.timeoutMs ?? 8000;
  const maxBytes = options.maxBytes ?? 2_000_000;
  const maxRedirects = options.maxRedirects ?? 3;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let current = raw;
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const unsafe = unsafeUrlReason(current);
      if (unsafe) return { ok: false, reason: unsafe };
      let res: Response;
      try {
        res = await options.fetch(current, {
          redirect: 'manual',
          signal: controller.signal,
          headers: { 'User-Agent': userAgent, Accept: options.accept ?? 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5' },
        });
      } catch {
        return { ok: false, reason: controller.signal.aborted ? 'the page took too long' : 'the page could not be reached' };
      }
      if (res.status >= 300 && res.status < 400) {
        const next = res.headers.get('location');
        if (!next) return { ok: false, reason: 'redirect without a destination' };
        current = new URL(next, current).toString();
        continue;
      }
      const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
      if (res.status !== 200) return { ok: false, reason: `the site answered ${res.status}` };
      const body = await readCapped(res, maxBytes);
      if (body === null) return { ok: false, reason: 'the page is too large' };
      return { ok: true, page: { url: current, status: res.status, contentType, body } };
    }
    return { ok: false, reason: 'too many redirects' };
  } catch {
    return { ok: false, reason: controller.signal.aborted ? 'the page took too long' : 'the page could not be read' };
  } finally {
    clearTimeout(timer);
  }
}

// ───────────────────────────────────────────── Reading HTML (just enough to check a source)

const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
export const decodeEntities = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1]?.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return entities[e.toLowerCase()] ?? m;
  });

/** The page's own titles: <title>, og:title and the first <h1>. */
export function pageTitles(html: string): string[] {
  const out: string[] = [];
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  if (title) out.push(title);
  const og = /<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']*)["']/i.exec(html)?.[1] ?? /<meta[^>]+content=["']([^"']*)["'][^>]*property=["']og:title["']/i.exec(html)?.[1];
  if (og) out.push(og);
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1];
  if (h1) out.push(h1.replace(/<[^>]+>/g, ' '));
  return out.map((t) => decodeEntities(t).replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/** Visible text, roughly: scripts, styles and tags removed. */
export function pageText(html: string): string {
  return decodeEntities(
    html
      // The <head> holds the title, which is checked separately: "about the topic" needs the body.
      .replace(/<(head|title|script|style|noscript|template|svg)[\s>][\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}
