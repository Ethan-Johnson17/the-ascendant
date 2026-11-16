/**
 * Which websites count as credible publishers for automatically verified sources (GAME_DESIGN.md
 * §8: academic publications, universities, museums, textbooks, primary sources). Subject-neutral:
 * this is data, and adding a site needs no code change. A page from any other site can still be
 * suggested, but it stays "unverified" and is never cited.
 */

export type PublisherKind = 'museum' | 'university' | 'government' | 'library' | 'academic_publisher' | 'encyclopedia';

export const publisherKindNames: Readonly<Record<PublisherKind, string>> = {
  museum: 'Museum',
  university: 'University',
  government: 'Government or public body',
  library: 'Library or archive',
  academic_publisher: 'Academic publisher',
  encyclopedia: 'Encyclopedia',
};

/** Host names (and their subdomains). */
const sites: Readonly<Record<string, PublisherKind>> = {
  // Museums
  'metmuseum.org': 'museum',
  'britishmuseum.org': 'museum',
  'louvre.fr': 'museum',
  'penn.museum': 'museum',
  'isac.uchicago.edu': 'museum',
  'si.edu': 'museum',
  'getty.edu': 'museum',
  'vam.ac.uk': 'museum',
  'nhm.ac.uk': 'museum',
  'smb.museum': 'museum',
  // Libraries and archives
  'loc.gov': 'library',
  'bl.uk': 'library',
  'archive.org': 'library',
  'openlibrary.org': 'library',
  'europeana.eu': 'library',
  // Academic publishers and scholarly indexes
  'doi.org': 'academic_publisher',
  'jstor.org': 'academic_publisher',
  'cambridge.org': 'academic_publisher',
  'academic.oup.com': 'academic_publisher',
  'oxfordre.com': 'academic_publisher',
  'tandfonline.com': 'academic_publisher',
  'springer.com': 'academic_publisher',
  'journals.uchicago.edu': 'academic_publisher',
  'sciencedirect.com': 'academic_publisher',
  'nature.com': 'academic_publisher',
  'ncbi.nlm.nih.gov': 'academic_publisher',
  // Encyclopedias
  'britannica.com': 'encyclopedia',
  'wikipedia.org': 'encyclopedia',
  'plato.stanford.edu': 'encyclopedia',
  'iep.utm.edu': 'encyclopedia',
};

/** Domain endings that mark universities and public bodies. */
const suffixes: readonly (readonly [string, PublisherKind])[] = [
  ['.edu', 'university'],
  ['.ac.uk', 'university'],
  ['.edu.au', 'university'],
  ['.ac.jp', 'university'],
  ['.gov', 'government'],
  ['.gov.uk', 'government'],
  ['.europa.eu', 'government'],
];

/** The kind of publisher a URL belongs to, or null if it isn't on the trusted list. */
export function publisherKindOf(rawUrl: string): PublisherKind | null {
  let host: string;
  try {
    host = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
  for (const [site, kind] of Object.entries(sites)) if (host === site || host.endsWith(`.${site}`)) return kind;
  for (const [suffix, kind] of suffixes) if (host.endsWith(suffix)) return kind;
  return null;
}
