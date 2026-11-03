/** Dependency-free location helpers (kept out of the zod models so the content script stays small). */

/**
 * Splits a free-text location ("San Jose, CA, United States") into address parts.
 */
export function parseLocationString(location: string): { city: string; state: string; country: string } {
  const parts = (location || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return { city: '', state: '', country: '' };
  if (parts.length === 1) return { city: parts[0], state: '', country: '' };
  if (parts.length === 2) return { city: parts[0], state: parts[1], country: '' };
  return { city: parts[0], state: parts[1], country: parts[parts.length - 1] };
}

