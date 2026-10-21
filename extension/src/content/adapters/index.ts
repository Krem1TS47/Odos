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

export function findMatchingAdapter(url: URL, doc: Document): AtsAdapter | null {
  // 1. Try specific ATS adapters first
  for (const adapter of SPECIFIC_ADAPTERS) {
    if (adapter.matches(url, doc)) {
      return adapter;
    }
  }

  // 2. Fall back to Generic heuristic adapter if form fields exist
  if (GENERIC_ADAPTER.matches(url, doc)) {
    return GENERIC_ADAPTER;
  }

  return null;
}
