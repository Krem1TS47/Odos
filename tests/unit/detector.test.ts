import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { detectAts, extractJobPosting, isApplicationFormPresent } from '../../extension/src/detect';

function loadFixture(relPath: string): Document {
  const fullPath = path.resolve(__dirname, '../fixtures', relPath);
  const html = fs.readFileSync(fullPath, 'utf-8');
  return new DOMParser().parseFromString(html, 'text/html');
}

function createDoc(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

describe('ATS Detection Engine (Step 2)', () => {
  // --------------------------------------------------------------------------
  // Greenhouse Fixtures
  // --------------------------------------------------------------------------
  describe('Greenhouse Detection', () => {
    it('detects Greenhouse Classic board on hosted domain', () => {
      const doc = loadFixture('greenhouse/greenhouse_classic.html');
      const result = detectAts('https://boards.greenhouse.io/acme/jobs/12345', doc);

      expect(result.ats).toBe('greenhouse');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
      expect(result.pageType).toBe('application');
      expect(result.matchedSignals.some((s) => s.includes('host:'))).toBe(true);
      expect(result.matchedSignals.some((s) => s.includes('dom:'))).toBe(true);
    });

    it('detects Greenhouse Classic board on a CUSTOM domain without host match', () => {
      const doc = loadFixture('greenhouse/greenhouse_classic.html');
      // Simulate vanity domain (e.g. careers.acme.com)
      const result = detectAts('https://careers.acme.com/apply/frontend-engineer', doc);

      expect(result.ats).toBe('greenhouse');
      expect(result.confidence).toBeGreaterThanOrEqual(0.6);
      expect(result.pageType).toBe('application');
      // Host signal should NOT have fired
      expect(result.matchedSignals.some((s) => s.includes('host:'))).toBe(false);
      // DOM signals must have claimed the match
      expect(result.matchedSignals.some((s) => s.includes('dom:'))).toBe(true);
    });

    it('detects Greenhouse Modern React board (job-boards.greenhouse.io)', () => {
      const doc = loadFixture('greenhouse/greenhouse_new_board.html');
      const result = detectAts('https://job-boards.greenhouse.io/anthropic/jobs/5183044008', doc);

      expect(result.ats).toBe('greenhouse');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
      expect(result.pageType).toBe('application');
    });

    it('detects Greenhouse custom integration via script signals on Waymo careers', () => {
      const doc = loadFixture('greenhouse/waymo_careers_home.html');
      const result = detectAts('https://careers.withwaymo.com', doc);

      expect(result.ats).toBe('greenhouse');
      expect(result.matchedSignals.some((s) => s.includes('scriptSrc:'))).toBe(true);
      // Should not fire host signal
      expect(result.matchedSignals.some((s) => s.includes('host:'))).toBe(false);
    });

    it('detects Greenhouse via gh_jid URL parameter on custom domain', () => {
      const doc = createDoc('<html><body><div id="job"><p>Apply below</p></div></body></html>');
      const result = detectAts('https://custom-career.com/job?gh_jid=987654&gh_src=linkedin', doc);

      expect(result.ats).toBe('greenhouse');
      expect(result.matchedSignals).toContain('urlParam:gh_jid');
      expect(result.matchedSignals).toContain('urlParam:gh_src');
    });
  });

  // --------------------------------------------------------------------------
  // Lever Fixtures
  // --------------------------------------------------------------------------
  describe('Lever Detection', () => {
    it('detects Lever on hosted domain with full application form', () => {
      const doc = loadFixture('lever/lever_application.html');
      const result = detectAts('https://jobs.lever.co/palantir/ac978161-6f46-4f6b-ad9e-a258e642751c/apply', doc);

      expect(result.ats).toBe('lever');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
      expect(result.pageType).toBe('application');
      expect(result.matchedSignals.some((s) => s.includes('dom:form#application-form'))).toBe(true);
      expect(result.matchedSignals.some((s) => s.includes('urls['))).toBe(true);
    });

    it('detects Lever on a custom vanity domain without host match', () => {
      const doc = loadFixture('lever/lever_application.html');
      const result = detectAts('https://careers.palantir.com/openings/engineer/apply', doc);

      expect(result.ats).toBe('lever');
      expect(result.pageType).toBe('application');
      expect(result.matchedSignals.some((s) => s.includes('host:'))).toBe(false);
      expect(result.matchedSignals.some((s) => s.includes('dom:'))).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Ashby Fixtures
  // --------------------------------------------------------------------------
  describe('Ashby Detection', () => {
    it('detects Ashby on hosted domain with _systemfield_* attributes', () => {
      const doc = loadFixture('ashby/ashby_application.html');
      const result = detectAts('https://jobs.ashbyhq.com/ashby/0020099f-9bb3-4da9-9808-4556564f5301/application', doc);

      expect(result.ats).toBe('ashby');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
      expect(result.pageType).toBe('application');
      expect(result.matchedSignals.some((s) => s.includes('_systemfield_name'))).toBe(true);
      expect(result.matchedSignals.some((s) => s.includes('_systemfield_email'))).toBe(true);
    });

    it('detects Ashby on custom domain without host match', () => {
      const doc = loadFixture('ashby/ashby_application.html');
      const result = detectAts('https://careers.innovate.io/jobs/apply', doc);

      expect(result.ats).toBe('ashby');
      expect(result.pageType).toBe('application');
      expect(result.matchedSignals.some((s) => s.includes('host:'))).toBe(false);
      expect(result.matchedSignals.some((s) => s.includes('_systemfield_'))).toBe(true);
    });

    it('detects Ashby via ashby_jid URL param', () => {
      const doc = createDoc('<html><body><div id="ashby_embed"></div></body></html>');
      const result = detectAts('https://custom-site.com/careers?ashby_jid=123', doc);

      expect(result.ats).toBe('ashby');
      expect(result.matchedSignals).toContain('urlParam:ashby_jid');
      expect(result.matchedSignals).toContain('dom:#ashby_embed');
    });
  });

  // --------------------------------------------------------------------------
  // Workday Fixtures
  // --------------------------------------------------------------------------
  describe('Workday Detection', () => {
    it('detects Workday via host and data-automation-id attributes', () => {
      const doc = loadFixture('workday/workday_listing.html');
      const result = detectAts('https://workday.wd5.myworkdayjobs.com/en-US/Workday', doc);

      expect(result.ats).toBe('workday');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
      expect(result.matchedSignals.some((s) => s.includes('myworkdayjobs'))).toBe(true);
      expect(result.matchedSignals.some((s) => s.includes('[data-automation-id]'))).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // JSON-LD JobPosting Extraction
  // --------------------------------------------------------------------------
  describe('JSON-LD JobPosting Extraction', () => {
    it('extracts top-level JobPosting schema', () => {
      const html = `
        <html>
        <head>
          <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "JobPosting",
            "title": "Senior Systems Engineer",
            "description": "<p>Build high-scale distributed systems.</p>",
            "datePosted": "2026-10-15",
            "employmentType": "FULL_TIME",
            "hiringOrganization": {
              "@type": "Organization",
              "name": "CloudCorp"
            },
            "jobLocation": {
              "@type": "Place",
              "address": {
                "@type": "PostalAddress",
                "addressLocality": "Seattle",
                "addressRegion": "WA",
                "addressCountry": "US"
              }
            }
          }
          </script>
        </head>
        <body><div id="job-description">Job details</div></body>
        </html>
      `;
      const doc = createDoc(html);
      const posting = extractJobPosting(doc);

      expect(posting).toBeDefined();
      expect(posting?.title).toBe('Senior Systems Engineer');
      expect(posting?.company).toBe('CloudCorp');
      expect(posting?.location).toBe('Seattle, WA, US');
      expect(posting?.description).toContain('Build high-scale distributed systems.');
      expect(posting?.employmentType).toBe('FULL_TIME');

      const result = detectAts('https://jobs.example.com/posting/1', doc);
      expect(result.pageType).toBe('listing');
      expect(result.jobPosting?.company).toBe('CloudCorp');
    });

    it('extracts JobPosting nested inside @graph schema array', () => {
      const html = `
        <html>
        <head>
          <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "BreadcrumbList",
                "itemListElement": []
              },
              {
                "@type": "JobPosting",
                "title": "Machine Learning Research Intern",
                "hiringOrganization": "DeepMind Partner Labs",
                "jobLocationType": "TELECOMMUTE"
              }
            ]
          }
          </script>
        </head>
        <body><div class="job-description">ML role details</div></body>
        </html>
      `;
      const doc = createDoc(html);
      const posting = extractJobPosting(doc);

      expect(posting).toBeDefined();
      expect(posting?.title).toBe('Machine Learning Research Intern');
      expect(posting?.company).toBe('DeepMind Partner Labs');
      expect(posting?.location).toBe('Remote');
    });
  });

  // --------------------------------------------------------------------------
  // Page Type & Generic Heuristics
  // --------------------------------------------------------------------------
  describe('Page Type & Generic Heuristics', () => {
    it('returns unknown for generic non-job pages', () => {
      const doc = createDoc('<html><body><header>About Us</header><main><p>Company info</p></main></body></html>');
      const result = detectAts('https://example.com/about', doc);

      expect(result.ats).toBeNull();
      expect(result.confidence).toBe(0);
      expect(result.pageType).toBe('unknown');
    });

    it('classifies unknown ATS with resume file upload & contact inputs as generic application', () => {
      const html = `
        <html>
        <body>
          <form id="custom_apply_form">
            <h2>Apply for this role</h2>
            <input type="text" name="applicant_name" placeholder="Your name" />
            <input type="email" name="applicant_email" placeholder="Your email" />
            <input type="file" name="applicant_resume" />
          </form>
        </body>
        </html>
      `;
      const doc = createDoc(html);
      const isApp = isApplicationFormPresent(doc, null);
      expect(isApp).toBe(true);

      const result = detectAts('https://careers.startup.io/apply', doc);
      expect(result.ats).toBeNull(); // Routes to generic adapter
      expect(result.pageType).toBe('application');
    });
  });
});
