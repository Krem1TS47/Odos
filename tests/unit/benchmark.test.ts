import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { GreenhouseAdapter } from '../../extension/src/content/adapters/greenhouse';
import { executeAutofill } from '../../extension/src/content/autofillEngine';
import { DEFAULT_PROFILE } from '../../extension/src/core/models';

describe('Performance Budget Benchmark (Section 6)', () => {
  it('discovers and prefills typical Greenhouse form in strictly under 1 second', async () => {
    const fixturePath = path.resolve(__dirname, '../fixtures/greenhouse_job_board.html');
    const fixtureHtml = fs.readFileSync(fixturePath, 'utf-8');

    const profile = {
      ...DEFAULT_PROFILE,
      contact: {
        ...DEFAULT_PROFILE.contact,
        firstName: 'Benjamin',
        lastName: 'Ching',
        fullName: 'Benjamin Ching',
        email: 'ben@example.com',
        phone: '4088299844'
      },
      workAuthorization: {
        authorizedCountries: ['United States'],
        requiresSponsorship: false
      }
    };

    const answers = [
      {
        id: '1',
        questionPatterns: ['how did you hear about this job'],
        category: 'logistics' as const,
        answer: 'Company website',
        autoFill: true
      }
    ];

    const iterations = 25;
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      document.documentElement.innerHTML = fixtureHtml;
      const adapter = new GreenhouseAdapter();

      const start = performance.now();
      const fields = adapter.discoverFields(document);
      await executeAutofill(fields, { profile, answers });
      const duration = performance.now() - start;
      times.push(duration);
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    console.log(`\n⚡ Form Fill Benchmark: Average time ${avg.toFixed(2)} ms (Budget: < 1000 ms)`);

    expect(avg).toBeLessThan(1000);
  });
});
