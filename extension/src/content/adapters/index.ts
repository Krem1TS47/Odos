import { AtsAdapter } from './types';
import { GreenhouseAdapter } from './greenhouse';

export * from './types';
export * from './greenhouse';

export const ALL_ADAPTERS: AtsAdapter[] = [
  new GreenhouseAdapter()
];

export function findMatchingAdapter(url: URL, doc: Document): AtsAdapter | null {
  for (const adapter of ALL_ADAPTERS) {
    if (adapter.matches(url, doc)) {
      return adapter;
    }
  }
  return null;
}
