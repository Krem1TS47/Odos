import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { WorkdayAdapter } from '../../extension/src/content/adapters/workday';
import { GenericAdapter } from '../../extension/src/content/adapters/generic';
import { executeAutofill } from '../../extension/src/content/autofillEngine';
import { Profile, DEFAULT_PROFILE } from '../../extension/src/core/models';

describe('Workday and Generic Adapters (Step 9 & 10)', () => {
  describe('Workday Adapter', () => {
    let adapter: WorkdayAdapter;
    let listingHtml: string;

    beforeEach(() => {
      adapter = new WorkdayAdapter();
      const fixturePath = path.resolve(__dirname, '../fixtures/workday/workday_listing.html');
      listingHtml = fs.readFileSync(fixturePath, 'utf-8');
      document.documentElement.innerHTML = listingHtml;
    });

    it('matches Workday URLs and automation markers', () => {
      const url = new URL('https://adobe.wd5.myworkdayjobs.com/en-US/external/job/San-Jose/Software-Engineer_R123');
      expect(adapter.matches(url, document)).toBe(true);
    });

    it('extracts job details from Workday listing fixture', () => {
      const url = new URL('https://adobe.wd5.myworkdayjobs.com/en-US/external/job/San-Jose/Software-Engineer_R123');
      const job = adapter.extractJob(document, url);

      expect(job.title).toBeTruthy();
      expect(job.company).toBeTruthy();
      expect(job.url).toBe(url.href);
    });

    it('discovers fields on Workday application page with automation IDs', () => {
      // Simulate Workday multi-step application form page
      document.body.innerHTML = `
        <div data-automation-id="form-page">
          <input data-automation-id="legalNameSection_firstName" id="input-1" type="text" />
          <input data-automation-id="legalNameSection_lastName" id="input-2" type="text" />
          <input data-automation-id="email" id="input-3" type="email" />
          <input data-automation-id="phone-number" id="input-4" type="tel" />
          <input data-automation-id="addressSection_addressLine1" id="input-5" type="text" />
          <input data-automation-id="addressSection_city" id="input-6" type="text" />
          <input data-automation-id="addressSection_postalCode" id="input-7" type="text" />
          <input data-automation-id="file-upload-input-ref" id="input-8" type="file" />
          <button data-automation-id="bottom-navigation-next-button" type="button">Save and Continue</button>
        </div>
      `;

      const fields = adapter.discoverFields(document);
      expect(fields.length).toBe(8);

      const labels = fields.map(f => f.label.toLowerCase());
      expect(labels).toContain('first name');
      expect(labels).toContain('last name');
      expect(labels).toContain('email address');

      // Invariant 1: Never returns next-button or submit controls
      const submitControls = fields.filter(f => f.type as any === 'submit' || f.element.tagName === 'BUTTON');
      expect(submitControls.length).toBe(0);
    });

    it('autofills Workday fields using framework-safe setters', async () => {
      document.body.innerHTML = `
        <div data-automation-id="form-page">
          <input data-automation-id="legalNameSection_firstName" id="input-1" type="text" />
          <input data-automation-id="legalNameSection_lastName" id="input-2" type="text" />
          <input data-automation-id="email" id="input-3" type="email" />
          <input data-automation-id="phone-number" id="input-4" type="tel" />
        </div>
      `;

      const fields = adapter.discoverFields(document);
      const profile: Profile = {
        ...DEFAULT_PROFILE,
        contact: {
          ...DEFAULT_PROFILE.contact,
          firstName: 'Margaret',
          lastName: 'Hamilton',
          fullName: 'Margaret Hamilton',
          email: 'margaret@apollo.nasa.gov',
          phone: '6175550199'
        }
      };

      const result = await executeAutofill(fields, { profile, answers: [] });
      expect(result.filledFields.length).toBe(4);

      const fName = document.querySelector('[data-automation-id="legalNameSection_firstName"]') as HTMLInputElement;
      const lName = document.querySelector('[data-automation-id="legalNameSection_lastName"]') as HTMLInputElement;
      const email = document.querySelector('[data-automation-id="email"]') as HTMLInputElement;

      expect(fName.value).toBe('Margaret');
      expect(lName.value).toBe('Hamilton');
      expect(email.value).toBe('margaret@apollo.nasa.gov');
    });

    it('discovers and autofills Workday custom combobox listboxes (Phone Device Type, Country, State)', async () => {
      document.body.innerHTML = `
        <div data-automation-id="form-page">
          <div data-automation-id="phone-device-type">
            <label id="phone-device-label">Phone Device Type*</label>
            <button type="button" aria-haspopup="listbox" aria-labelledby="phone-device-label" id="btn-device-type">Select one</button>
          </div>
          <div data-automation-id="addressSection_country">
            <label id="country-label">Country*</label>
            <button type="button" aria-haspopup="listbox" aria-labelledby="country-label" id="btn-country">Select one</button>
          </div>
          <div data-automation-id="addressSection_countryRegion">
            <label id="region-label">State*</label>
            <button type="button" aria-haspopup="listbox" aria-labelledby="region-label" id="btn-state">Select one</button>
          </div>
        </div>
        <div id="popup-container">
          <ul role="listbox">
            <li role="option" data-automation-id="promptOption">Mobile</li>
            <li role="option" data-automation-id="promptOption">Landline</li>
            <li role="option" data-automation-id="promptOption">United States</li>
            <li role="option" data-automation-id="promptOption">California</li>
          </ul>
        </div>
      `;

      const fields = adapter.discoverFields(document);
      expect(fields.length).toBe(3);
      expect(fields[0].type).toBe('combobox');
      expect(fields[0].label).toBe('Phone Device Type');
      expect(fields[1].label).toBe('Country');
      expect(fields[2].label).toBe('State');

      const profile: Profile = {
        ...DEFAULT_PROFILE,
        contact: {
          ...DEFAULT_PROFILE.contact,
          location: 'San Jose, California, United States'
        }
      };

      const result = await executeAutofill(fields, { profile, answers: [] });
      expect(result.filledFields.length).toBe(3);
      expect(result.filledFields.map(f => f.matchedValue)).toEqual(['Mobile', 'United States', 'California']);
    });
  });

  describe('Generic Heuristic Fallback Adapter', () => {
    let generic: GenericAdapter;

    beforeEach(() => {
      generic = new GenericAdapter();
      document.body.innerHTML = '';
    });

    it('matches custom forms and pierces shadow roots', () => {
      const host = document.createElement('div');
      document.body.appendChild(host);

      if (typeof host.attachShadow === 'function') {
        const shadow = host.attachShadow({ mode: 'open' });
        shadow.innerHTML = `
          <form id="custom-career-form">
            <label for="c-first">First name</label>
            <input id="c-first" type="text" />
            <label for="c-last">Last name</label>
            <input id="c-last" type="text" />
            <label for="c-email">Email</label>
            <input id="c-email" type="email" />
            <input type="submit" value="Apply Now" />
          </form>
        `;

        const url = new URL('https://company.careers.com/job/123');
        expect(generic.matches(url, document)).toBe(true);

        const fields = generic.discoverFields(document);
        expect(fields.length).toBe(3);

        const fieldIds = fields.map(f => f.id);
        expect(fieldIds).toContain('c-first');
        expect(fieldIds).toContain('c-last');
        expect(fieldIds).toContain('c-email');

        // Submit Guard verification: No submit button returned
        const submitControls = fields.filter(f => f.type as any === 'submit' || f.element.tagName === 'BUTTON');
        expect(submitControls.length).toBe(0);
      }
    });

    it('extracts fallback job details from heading and meta tags', () => {
      document.body.innerHTML = `
        <h1 class="job-title">Senior Distributed Systems Engineer</h1>
        <div class="company-name">Acme Cloud Inc.</div>
        <div class="location">Remote - US</div>
      `;

      const url = new URL('https://acmecloud.com/careers/senior-engineer');
      const job = generic.extractJob(document, url);

      expect(job.title).toBe('Senior Distributed Systems Engineer');
      expect(job.company).toBe('Acme Cloud Inc.');
      expect(job.location).toBe('Remote - US');
    });
  });
});
