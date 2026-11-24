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
 * Normalizes a job application URL by stripping tracking parameters, hashes,
 * trailing slashes, and common application path suffixes (/apply, /application, /app)
 * so that a job listing URL and its application form URL map to the same canonical identifier.
 */
export function canonicalizeJobUrl(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    parsed.search = '';
    parsed.hash = '';
    let path = parsed.pathname.replace(/\/+$/, '');
    path = path.replace(/\/(apply|application|app)$/i, '');
    parsed.pathname = path;
    return parsed.toString().replace(/\/+$/, '').toLowerCase();
  } catch {
    let clean = urlStr.trim().toLowerCase().replace(/[?#].*$/, '').replace(/\/+$/, '');
    clean = clean.replace(/\/(apply|application|app)$/i, '');
    return clean.replace(/\/+$/, '');
  }
}

/**
 * Checks if two URLs point to the same job posting / application form.
 */
export function isSameJobUrl(urlA: string, urlB: string): boolean {
  if (!urlA || !urlB) return false;
  return canonicalizeJobUrl(urlA) === canonicalizeJobUrl(urlB);
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
  const normUrl = canonicalizeJobUrl(url);
  return `${normCompany}::${normTitle}::${normUrl}`;
}
