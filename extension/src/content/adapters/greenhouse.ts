import { AtsAdapter, FormField, FormFieldType } from './types';
import { Job } from '../../core/models';
import { isSubmitControl } from '../submitGuard';
import { detectPageCaptcha, CaptchaDetection } from '../captcha';

function escapeCss(str: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(str);
  }
  return str.replace(/([!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

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

    const elements = form.querySelectorAll<HTMLElement>(
      'input, select, textarea, [role="combobox"]'
    );

    const fields: FormField[] = [];
    const seenElements = new Set<HTMLElement>();

    elements.forEach((el, index) => {
      if (seenElements.has(el)) return;
      seenElements.add(el);

      const inputEl = el as HTMLInputElement;

      // Ignore hidden inputs, submit controls, and buttons
      if (inputEl.type === 'hidden' || isSubmitControl(el)) return;
      if (el.tagName === 'BUTTON' && el.getAttribute('role') !== 'combobox') return;

      const name = el.getAttribute('name') || '';
      const id = el.getAttribute('id') || `field_${index}`;

      // Extract label
      let labelText = '';

      // 1. label[for="id"]
      if (id) {
        const labelEl = doc.querySelector(`label[for="${escapeCss(id)}"]`);
        if (labelEl?.textContent) {
          labelText = labelEl.textContent;
        }
      }

      // 2. id-label (common in modern React Greenhouse boards)
      if (!labelText && id) {
        const labelEl = doc.getElementById(`${id}-label`);
        if (labelEl?.textContent) {
          labelText = labelEl.textContent;
        }
      }

      // 3. aria-labelledby
      if (!labelText) {
        const labelledBy = el.getAttribute('aria-labelledby');
        if (labelledBy) {
          const labelEl = doc.getElementById(labelledBy);
          if (labelEl?.textContent) {
            labelText = labelEl.textContent;
          }
        }
      }

      // 4. Wrapping label
      if (!labelText) {
        const parentLabel = el.closest('label');
        if (parentLabel?.textContent) {
          labelText = parentLabel.textContent;
        }
      }

      // 5. Container label
      if (!labelText) {
        const container = el.closest('.field-wrapper, .field, .form-group, .input-container, .select__container');
        const containerLabel = container?.querySelector('label');
        if (containerLabel?.textContent) {
          labelText = containerLabel.textContent;
        }
      }

      // 6. Attribute fallbacks
      if (!labelText) {
        labelText = el.getAttribute('aria-label') || el.getAttribute('placeholder') || name;
      }

      // Clean label
      const cleanLabel = labelText.replace(/[*]/g, '').trim();

      // Determine required
      const isRequired =
        inputEl.required ||
        el.getAttribute('aria-required') === 'true' ||
        labelText.includes('*') ||
        Boolean(el.closest('.field-wrapper, .field, .form-group')?.querySelector('.asterisk, .required, [aria-hidden="true"]'));

      // Determine type
      let type: FormFieldType = 'text';
      const tag = el.tagName.toUpperCase();
      const role = el.getAttribute('role');

      if (role === 'combobox' || el.classList.contains('select__input')) {
        type = 'combobox';
      } else if (tag === 'SELECT') {
        type = 'select';
      } else if (tag === 'TEXTAREA') {
        type = 'textarea';
      } else if (inputEl.type === 'email') {
        type = 'email';
      } else if (inputEl.type === 'tel') {
        type = 'tel';
      } else if (inputEl.type === 'url') {
        type = 'url';
      } else if (inputEl.type === 'file') {
        type = 'file';
      } else if (inputEl.type === 'checkbox') {
        type = 'checkbox';
      } else if (inputEl.type === 'radio') {
        type = 'radio';
      }

      // Options for selects
      let options: string[] | undefined;
      if (tag === 'SELECT') {
        const selectEl = el as HTMLSelectElement;
        options = Array.from(selectEl.options)
          .map((opt) => opt.text.trim())
          .filter((txt) => txt && !txt.startsWith('--'));
      }

      const isCustomQuestion = id.startsWith('question_') || name.includes('answers');

      fields.push({
        id,
        name,
        label: cleanLabel,
        type,
        element: el,
        required: isRequired,
        options,
        isCustomQuestion
      });
    });

    return fields;
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
