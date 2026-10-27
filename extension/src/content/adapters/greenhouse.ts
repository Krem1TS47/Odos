import { AtsAdapter, FormField } from './types';
import { collectControls, describeControl } from '../../core/controlClassifier';

import { Job } from '../../core/models';
import { detectPageCaptcha, CaptchaDetection } from '../captcha';

export class GreenhouseAdapter implements AtsAdapter {
  id = 'greenhouse';
  name = 'Greenhouse';

  matches(url: URL, doc: Document): boolean {
    const isDomain =
      url.hostname.includes('boards.greenhouse.io') ||
      url.hostname.includes('job-boards.greenhouse.io') ||
      url.hostname.includes('boards.eu.greenhouse.io') ||
      url.hostname.includes('job-boards.eu.greenhouse.io');

    if (isDomain) return true;

    // Check for query parameters used by Greenhouse on custom domains
    if (url.searchParams.has('gh_jid') || url.searchParams.has('gh_src')) {
      return true;
    }

    // Check for embedded Greenhouse forms or iframes on employer custom domains
    const hasGreenhouseForm =
      doc.querySelector('form#application_form') !== null ||
      doc.querySelector('form#apply_form') !== null ||
      doc.querySelector('form#application-form') !== null ||
      doc.querySelector('input[name^="job_application["]') !== null ||
      doc.querySelector('#grnhse_app') !== null ||
      doc.querySelector('iframe#grnhse_iframe') !== null ||
      doc.querySelector('script[src*="greenhouse.io/embed/job_board"]') !== null;

    return hasGreenhouseForm;
  }

  extractJob(doc: Document, url: URL): Partial<Job> {
    // 1. Company
    let company = '';
    const companyEl = doc.querySelector('.company-name, #header .company-name, .job-company');
    if (companyEl?.textContent) {
      company = companyEl.textContent.trim().replace(/^at\s+/i, '').trim();
    } else {
      // Check document title "Role at Company"
      const titleMatch = (doc.title || '').match(/\s+(?:at|@)\s+([^–—|-]+)$/i);
      if (titleMatch) {
        company = titleMatch[1].trim();
      } else {
        // Fallback from URL path: /<company-token>/jobs/...
        const pathParts = url.pathname.split('/').filter(Boolean);
        if (pathParts.length >= 1 && pathParts[0] !== 'jobs') {
          const raw = pathParts[0].replace(/[-_]/g, ' ');
          company = raw.charAt(0).toUpperCase() + raw.slice(1);
        }
      }
    }

    // 2. Title
    let title = '';
    const titleEl = doc.querySelector('.app-title, #header h1, h1.job-title, h1.section-header, h1');
    if (titleEl?.textContent) {
      title = titleEl.textContent.trim();
    } else {
      // Fallback to page title (e.g. "Software Engineer at Acme")
      const rawTitle = doc.title || '';
      const match = rawTitle.match(/^(.*?)\s+(?:at|@)\s+(.*?)(?:\s*[-|–—:]\s*.*)?$/i);
      if (match) {
        title = match[1].trim();
      } else {
        title = rawTitle.split(/[-|–—:]/)[0].trim();
      }
    }

    // 3. Location
    let location = '';
    const locationEl = doc.querySelector(
      '.job__location, .location, #header .location, .job-location'
    );
    if (locationEl?.textContent) {
      location = locationEl.textContent.trim();
    }

    // 4. Job description
    let descriptionText = '';
    const descEl = doc.querySelector(
      '#job-description, .job-description, #content .job-description, .job-description--content'
    );
    if (descEl?.textContent) {
      descriptionText = descEl.textContent.trim();
    }

    return {
      company: company || 'Unknown Company',
      title: title || 'Job Application',
      location,
      url: url.href,
      descriptionText
    };
  }

  discoverFields(doc: Document): FormField[] {
    const form =
      doc.querySelector('form#application_form') ||
      doc.querySelector('form#application-form') ||
      doc.querySelector('form.application--form') ||
      doc.querySelector('form#apply_form') ||
      doc.querySelector('form#application') ||
      doc.querySelector('.application--questions') ||
      doc.querySelector('form');

    if (!form) return [];

    const controls = collectControls(form, doc);
    return controls.map((control, index) => {
      const field = describeControl(control, index, doc, {
        idPrefix: 'field',
        labelExtras: {
          idSuffixes: ['-label'],
          containerSelectors: ['.field-wrapper', '.field', '.form-group', '.input-container', '.select__container']
        },
        isRequired: (c) =>
          Boolean(c.element.closest('.field-wrapper, .field, .form-group')?.querySelector('.asterisk, .required, [aria-hidden="true"]'))
      });
      field.isCustomQuestion = field.id.startsWith('question_') || field.name.includes('answers');
      return field;
    });
  }

  confirmationDetected(url: URL, doc: Document): boolean {
    const urlPattern = /confirmation|applied|thank_you|success/i;
    if (urlPattern.test(url.href)) {
      return true;
    }

    const confirmationEl = doc.querySelector('#application_confirmation, .application-confirmation');
    if (confirmationEl) return true;

    const headings = Array.from(doc.querySelectorAll('h1, h2, h3, p, div.message'));
    for (const h of headings) {
      const text = (h.textContent || '').trim().toLowerCase();
      if (
        text.includes('thank you for applying') ||
        text.includes('application submitted') ||
        text.includes('application was submitted') ||
        text.includes('thanks for applying')
      ) {
        return true;
      }
    }

    return false;
  }

  detectCaptcha(doc: Document): CaptchaDetection {
    return detectPageCaptcha(doc);
  }
}
