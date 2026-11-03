import { AtsAdapter } from './types';
import { GreenhouseAdapter } from './greenhouse';
import { LeverAdapter } from './lever';
import { AshbyAdapter } from './ashby';
import { WorkdayAdapter } from './workday';
import { GenericAdapter } from './generic';

export * from './types';
export * from './greenhouse';
export * from './lever';
export * from './ashby';
export * from './workday';
export * from './generic';

export const SPECIFIC_ADAPTERS: AtsAdapter[] = [
  new GreenhouseAdapter(),
  new LeverAdapter(),
  new AshbyAdapter(),
  new WorkdayAdapter()
];

export const GENERIC_ADAPTER: AtsAdapter = new GenericAdapter();

export const ALL_ADAPTERS: AtsAdapter[] = [
  ...SPECIFIC_ADAPTERS,
  GENERIC_ADAPTER
];

/** Hostnames that identify an ATS unambiguously. Checked before any DOM marker. */
const ATS_HOSTS: Array<{ id: string; pattern: RegExp }> = [
  { id: 'greenhouse', pattern: /(^|\.)(job-)?boards(\.eu)?\.greenhouse\.io$/i },
  { id: 'lever', pattern: /(^|\.)jobs(\.eu)?\.lever\.co$/i },
  { id: 'ashby', pattern: /(^|\.)jobs\.ashbyhq\.com$/i },
  { id: 'workday', pattern: /\.(myworkdayjobs|myworkdaysite)\.com$|(^|\.)workday\.com$/i }
];

/** Iframe/script sources that mean the real form lives in a child frame. */
const EMBEDDED_ATS_SRC = /(greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs\.com|myworkdaysite\.com|smartrecruiters\.com|icims\.com|workable\.com)/i;

/**
 * True when this document only hosts an embedded ATS iframe: the fill must run in the
 * iframe's own frame, never on the parent careers page.
 */
export function hostsEmbeddedAtsForm(doc: Document): boolean {
  return Array.from(doc.querySelectorAll('iframe[src]')).some((f) => EMBEDDED_ATS_SRC.test(f.getAttribute('src') || ''));
}

/**
 * Picks the adapter for this frame:
 *   1. hostname match (authoritative; avoids Greenhouse claiming Lever's form#application-form)
 *   2. DOM markers, most specific adapters first (Lever and Ashby before Greenhouse)
 *   3. Generic
 */
export function findMatchingAdapter(url: URL, doc: Document): AtsAdapter | null {
  const byHost = ATS_HOSTS.find((h) => h.pattern.test(url.hostname));
  if (byHost) {
    const adapter = SPECIFIC_ADAPTERS.find((a) => a.id === byHost.id);
    if (adapter) return adapter;
  }

  const markerOrder = ['workday', 'lever', 'ashby', 'greenhouse'];
  for (const id of markerOrder) {
    const adapter = SPECIFIC_ADAPTERS.find((a) => a.id === id);
    if (adapter && adapter.matches(url, doc)) return adapter;
  }

  if (GENERIC_ADAPTER.matches(url, doc)) {
    return GENERIC_ADAPTER;
  }

  return null;
}
