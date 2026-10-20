import { describe, it, expect } from 'vitest';
import { canonicalizeUrl, generateDedupeKey } from '../../extension/src/core/dedupe';

describe('Job Deduplication', () => {
  it('canonicalizes URLs by removing query parameters, hashes, and trailing slashes', () => {
    const raw = 'https://boards.greenhouse.io/acme/jobs/12345/?gh_src=linkedin#application';
    expect(canonicalizeUrl(raw)).toBe('https://boards.greenhouse.io/acme/jobs/12345');
  });

  it('generates consistent dedupe keys across casing and extra whitespace', () => {
    const key1 = generateDedupeKey(
      'Acme Corp',
      'Senior Software Engineer',
      'https://boards.greenhouse.io/acme/jobs/101?source=indeed'
    );
    const key2 = generateDedupeKey(
      'acme corp ',
      ' senior software engineer ',
      'https://boards.greenhouse.io/acme/jobs/101/'
    );

    expect(key1).toBe(key2);
    expect(key1).toBe('acmecorp::seniorsoftwareengineer::https://boards.greenhouse.io/acme/jobs/101');
  });
});
