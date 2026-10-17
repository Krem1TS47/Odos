/**
 * Normalizes a URL by stripping tracking parameters, hashes, and trailing slashes.
 */
export function canonicalizeUrl(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    // Remove query params and hashes for canonical identification
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/+$/, '').toLowerCase();
  } catch {
    return urlStr.trim().toLowerCase().replace(/\/+$/, '');
  }
}

/**
 * Normalizes a text string (lowercase, alphanumeric only).
 */
export function normalizeToken(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Computes the unique deduplication key for a job posting.
 */
export function generateDedupeKey(company: string, title: string, url: string): string {
  const normCompany = normalizeToken(company);
  const normTitle = normalizeToken(title);
  const normUrl = canonicalizeUrl(url);
  return `${normCompany}::${normTitle}::${normUrl}`;
}
