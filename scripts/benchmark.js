import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';
import { GreenhouseAdapter } from '../extension/src/content/adapters/greenhouse.js';
import { executeAutofill } from '../extension/src/content/autofillEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fixturePath = path.resolve(__dirname, '../tests/fixtures/greenhouse_job_board.html');
const fixtureHtml = fs.readFileSync(fixturePath, 'utf-8');

const sampleProfile = {
  schemaVersion: 1,
  contact: {
    fullName: 'Benjamin Ching',
    firstName: 'Benjamin',
    lastName: 'Ching',
    email: 'benbenching@gmail.com',
    phone: '4088299844',
    location: 'San Jose, CA',
    linkedin: 'https://linkedin.com/in/ben',
    github: 'https://github.com/ben',
    website: 'https://ben.com'
  },
  workAuthorization: {
    authorizedCountries: ['United States'],
    requiresSponsorship: false
  },
  education: [],
  experience: [],
  skills: ['TypeScript', 'React'],
  resumes: []
};

const sampleAnswers = [
  {
    id: '1',
    questionPatterns: ['how did you hear about this job'],
    category: 'logistics',
    answer: 'Company website',
    autoFill: true
  }
];

async function runBenchmark() {
  console.log('⚡ Running Odos Performance Benchmark...\n');

  const iterations = 50;
  const times = [];

  for (let i = 0; i < iterations; i++) {
    const dom = new JSDOM(fixtureHtml, { url: 'https://boards.greenhouse.io/acme/jobs/12345' });
    const doc = dom.window.document;
    const adapter = new GreenhouseAdapter();

    const start = performance.now();
    const fields = adapter.discoverFields(doc);
    await executeAutofill(fields, {
      profile: sampleProfile,
      answers: sampleAnswers
    });
    const duration = performance.now() - start;
    times.push(duration);
  }

  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);

  console.log(`⏱️ Discovery + Prefill Benchmark Results (${iterations} iterations):`);
  console.log(`   Average: ${avgTime.toFixed(2)} ms`);
  console.log(`   Min:     ${minTime.toFixed(2)} ms`);
  console.log(`   Max:     ${maxTime.toFixed(2)} ms`);
  console.log(`   Budget:  < 1000.00 ms (1.0 second)\n`);

  if (avgTime > 1000) {
    console.error(`❌ Benchmark failed: Average fill time ${avgTime.toFixed(2)}ms exceeded 1000ms budget!`);
    process.exit(1);
  } else {
    console.log(`✅ Performance benchmark PASSED! (Prefill completes in ${(avgTime / 1000).toFixed(3)}s)`);
  }
}

runBenchmark().catch((err) => {
  console.error('Benchmark error:', err);
  process.exit(1);
});
