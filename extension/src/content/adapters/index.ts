import { AtsAdapter } from './types';
import { GreenhouseAdapter } from './greenhouse';
import { LeverAdapter } from './lever';
import { AshbyAdapter } from './ashby';

export * from './types';
export * from './greenhouse';
export * from './lever';
export * from './ashby';

export const ALL_ADAPTERS: AtsAdapter[] = [
  new GreenhouseAdapter(),
  new LeverAdapter(),
  new AshbyAdapter()
];

export function findMatchingAdapter(url: URL, doc: Document): AtsAdapter | null {
  for (const adapter of ALL_ADAPTERS) {
    if (adapter.matches(url, doc)) {
      return adapter;
    }
  }
  return null;
}
