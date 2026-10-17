import { AtsAdapter, FormField, FormFieldType } from './types';
import { Job } from '../../core/models';
import { isSubmitControl } from '../submitGuard';

function escapeCss(str: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(str);
  }
  return str.replace(/([!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

export class GreenhouseAdapter implements AtsAdapter {
  id = 'greenhouse';

  matches(url: URL, doc: Document): boolean {
    const isDomain =
      url.hostname.includes('boards.greenhouse.io') ||
      url.hostname.includes('job-boards.greenhouse.io');

    if (isDomain) return true;

    // Check for embedded Greenhouse form on employer custom domains
    const hasGreenhouseForm =
      doc.querySelector('form#application_form') !== null ||
      doc.querySelector('form#apply_form') !== null ||
      doc.querySelector('input[name^="job_application["]') !== null;

    return hasGreenhouseForm;
  }

  extractJob(doc: Document, url: URL): Partial<Job> {
    // 1. Company
    let company = '';
    const companyEl = doc.querySelector('.company-name, #header .company-name, .job-company');
    if (companyEl?.textContent) {
      company = companyEl.textContent.trim().replace(/^at\s+/i, '').trim();
    } else {
      // Fallback from URL path: /<company-token>/jobs/...
      const pathParts = url.pathname.split('/').filter(Boolean);
      if (pathParts.length >= 1 && pathParts[0] !== 'jobs') {
        company = pathParts[0].replace(/-/g, ' ');
      }
    }

    // 2. Title
    let title = '';
    const titleEl = doc.querySelector('.app-title, #header h1, h1.job-title, h1');
    if (titleEl?.textContent) {
      title = titleEl.textContent.trim();
    } else {
      // Fallback to page title (e.g. "Software Engineer at Acme")
      const rawTitle = doc.title || '';
      const match = rawTitle.match(/^(.*?)\s+(?:at|@)\s+(.*?)(?:\s*[-|–—:]\s*.*)?$/i);
      if (match) {
        title = match[1].trim();
        if (!company) company = match[2].trim();
      } else {
        title = rawTitle.split(/[-|–—:]/)[0].trim();
      }
    }

    // 3. Location
    let location = '';
    const locationEl = doc.querySelector('.location, #header .location, .job-location');
    if (locationEl?.textContent) {
      location = locationEl.textContent.trim();
    }

    // 4. Job description
    let descriptionText = '';
    const descEl = doc.querySelector('#job-description, .job-description, #content .job-description');
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
      doc.querySelector('form#apply_form') ||
      doc.querySelector('form#application') ||
      doc.querySelector('form');

    if (!form) return [];

    const elements = form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      'input, select, textarea'
    );

    const fields: FormField[] = [];

    elements.forEach((el, index) => {
      // Ignore hidden inputs, submit controls, and buttons
      if (el.type === 'hidden' || isSubmitControl(el)) return;

      const name = el.getAttribute('name') || '';
      const id = el.getAttribute('id') || `field_${index}`;

      // Extract label
      let labelText = '';
      if (id) {
        const labelEl = doc.querySelector(`label[for="${escapeCss(id)}"]`);
        if (labelEl?.textContent) {
          labelText = labelEl.textContent;
        }
      }

      if (!labelText) {
        const parentLabel = el.closest('label');
        if (parentLabel?.textContent) {
          labelText = parentLabel.textContent;
        }
      }

      if (!labelText) {
        const container = el.closest('.field, .form-group, .input-container');
        const containerLabel = container?.querySelector('label');
        if (containerLabel?.textContent) {
          labelText = containerLabel.textContent;
        }
      }

      if (!labelText) {
        labelText = el.getAttribute('aria-label') || el.getAttribute('placeholder') || name;
      }

      // Clean label (remove asterisks, excess whitespace)
      const cleanLabel = labelText.replace(/[*]/g, '').trim();

      // Determine required
      const isRequired =
        el.required ||
        el.getAttribute('aria-required') === 'true' ||
        labelText.includes('*') ||
        Boolean(el.closest('.field, .form-group')?.querySelector('.asterisk, .required'));

      // Determine type
      let type: FormFieldType = 'text';
      const tag = el.tagName.toUpperCase();

      if (tag === 'SELECT') {
        type = 'select';
      } else if (tag === 'TEXTAREA') {
        type = 'textarea';
      } else if (el.type === 'email') {
        type = 'email';
      } else if (el.type === 'tel') {
        type = 'tel';
      } else if (el.type === 'url') {
        type = 'url';
      } else if (el.type === 'file') {
        type = 'file';
      } else if (el.type === 'checkbox') {
        type = 'checkbox';
      } else if (el.type === 'radio') {
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

      fields.push({
        id,
        name,
        label: cleanLabel,
        type,
        element: el,
        required: isRequired,
        options
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
}
