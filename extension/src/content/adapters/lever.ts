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

export class LeverAdapter implements AtsAdapter {
  id = 'lever';
  name = 'Lever';

  matches(url: URL, doc: Document): boolean {
    const isDomain =
      url.hostname.includes('jobs.lever.co') ||
      url.hostname.includes('jobs.eu.lever.co');

    if (isDomain) return true;

    // Check for Lever form markers on custom vanity domains
    const hasLeverForm =
      doc.querySelector('form#application-form') !== null ||
      doc.querySelector('.application-form') !== null ||
      doc.querySelector('input[name^="cards["]') !== null ||
      doc.querySelector('input[name="urls[LinkedIn]"]') !== null ||
      doc.querySelector('script[src*="lever.co"]') !== null;

    return hasLeverForm;
  }

  extractJob(doc: Document, url: URL): Partial<Job> {
    // 1. Company
    let company = '';
    const companyEl = doc.querySelector(
      '.main-header-logo img, .company-name, .posting-headline h2, [data-qa="company-name"]'
    );
    if (companyEl instanceof HTMLImageElement && companyEl.alt) {
      company = companyEl.alt.replace(/ logo$/i, '').trim();
    } else if (companyEl?.textContent) {
      company = companyEl.textContent.trim().replace(/^at\s+/i, '').trim();
    }

    if (!company) {
      // Parse from title "Role - Company" or URL path /<company>/<uuid>
      const rawTitle = doc.title || '';
      const match = rawTitle.match(/^([^-|–—]+)\s*[-|–—]\s*(.+)$/);
      if (match) {
        // Lever titles often format as: "Company - Job Title"
        company = match[1].trim();
      } else {
        const pathParts = url.pathname.split('/').filter(Boolean);
        if (pathParts.length >= 1) {
          const raw = pathParts[0].replace(/[-_]/g, ' ');
          company = raw.charAt(0).toUpperCase() + raw.slice(1);
        }
      }
    }

    // 2. Title
    let title = '';
    const titleEl = doc.querySelector('.posting-headline h2, h2, h1');
    if (titleEl?.textContent) {
      title = titleEl.textContent.trim();
    } else {
      const rawTitle = doc.title || '';
      const match = rawTitle.match(/^([^-|–—]+)\s*[-|–—]\s*(.+)$/);
      if (match) {
        title = match[2].trim();
      } else {
        title = rawTitle.split(/[-|–—:]/)[0].trim();
      }
    }

    // 3. Location
    let location = '';
    const locationEl = doc.querySelector('.posting-category.location, .sort-by-time.posting-category, .location');
    if (locationEl?.textContent) {
      location = locationEl.textContent.trim().replace(/^[/\s-]+/, '').trim();
    }

    // 4. Description
    let descriptionText = '';
    const descEl = doc.querySelector('.posting-description, [data-qa="job-description"], .section.page-centered');
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
      doc.querySelector('form#application-form') ||
      doc.querySelector('.application-form') ||
      doc.querySelector('form');

    if (!form) return [];

    const elements = form.querySelectorAll<HTMLElement>(
      'input, select, textarea'
    );

    const fields: FormField[] = [];
    const seenElements = new Set<HTMLElement>();

    elements.forEach((el, index) => {
      if (seenElements.has(el)) return;
      seenElements.add(el);

      const inputEl = el as HTMLInputElement;

      // Ignore hidden inputs, submit controls, and buttons
      if (inputEl.type === 'hidden' || isSubmitControl(el)) return;
      if (el.tagName === 'BUTTON') return;

      const name = el.getAttribute('name') || '';
      const id = el.getAttribute('id') || `lever_field_${index}`;

      // Extract label
      let labelText = '';

      // 1. label[for="id"]
      if (id && id !== `lever_field_${index}`) {
        const labelEl = doc.querySelector(`label[for="${escapeCss(id)}"]`);
        if (labelEl?.textContent) {
          labelText = labelEl.textContent;
        }
      }

      // 2. Parent label or closest wrapping question container
      if (!labelText) {
        const parentLabel = el.closest('label');
        if (parentLabel?.textContent) {
          labelText = parentLabel.textContent;
        }
      }

      // 3. Lever structure: .application-question, .application-additional
      if (!labelText) {
        const questionContainer = el.closest(
          '.application-question, .application-additional, .card-field, .form-group'
        );
        const textLabel = questionContainer?.querySelector(
          '.application-label, .text, label, h4, .card-field-name'
        );
        if (textLabel?.textContent) {
          labelText = textLabel.textContent;
        }
      }

      // 4. Attribute fallbacks
      if (!labelText) {
        labelText = el.getAttribute('aria-label') || el.getAttribute('placeholder') || name;
      }

      // If the field is one of Lever's standard fields, provide clean default label
      if (!labelText || labelText === name) {
        if (name === 'name') labelText = 'Full name';
        else if (name === 'email') labelText = 'Email';
        else if (name === 'phone') labelText = 'Phone';
        else if (name === 'org') labelText = 'Current company';
        else if (name === 'location') labelText = 'Current location';
        else if (name === 'urls[LinkedIn]') labelText = 'LinkedIn URL';
        else if (name === 'urls[GitHub]') labelText = 'GitHub URL';
        else if (name === 'urls[Portfolio]') labelText = 'Portfolio URL';
        else if (name === 'urls[Other]') labelText = 'Other website';
        else if (name === 'comments') labelText = 'Additional information';
        else if (name === 'resume') labelText = 'Resume/CV';
      }

      const cleanLabel = labelText.replace(/[*]/g, '').trim();

      // Determine required
      const isRequired =
        inputEl.required ||
        el.getAttribute('aria-required') === 'true' ||
        labelText.includes('*') ||
        Boolean(el.closest('.application-question, .card-field')?.querySelector('.required, [data-qa="required"]'));

      // Determine type
      let type: FormFieldType = 'text';
      const tag = el.tagName.toUpperCase();

      if (tag === 'SELECT') {
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

      const isCustomQuestion = name.startsWith('cards[') || name.startsWith('custom_');

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
    const urlPattern = /confirmation|applied|thank_you|thanks/i;
    if (urlPattern.test(url.href)) {
      return true;
    }

    const confirmationEl = doc.querySelector(
      '.application-confirmation, .confirmation, [data-qa="confirmation-page"]'
    );
    if (confirmationEl) return true;

    const headings = Array.from(doc.querySelectorAll('h1, h2, h3, p'));
    for (const h of headings) {
      const text = (h.textContent || '').trim().toLowerCase();
      if (
        text.includes('application submitted') ||
        text.includes('thank you for applying') ||
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
