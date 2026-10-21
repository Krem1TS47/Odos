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

export class AshbyAdapter implements AtsAdapter {
  id = 'ashby';
  name = 'Ashby';

  matches(url: URL, doc: Document): boolean {
    const isDomain = url.hostname.includes('jobs.ashbyhq.com');
    if (isDomain) return true;

    // Check for query parameters used by Ashby
    if (url.searchParams.has('ashby_jid')) return true;

    // Check for Ashby markers on custom domains (never select by hashed classes!)
    const hasAshbyMarker =
      doc.querySelector('#ashby_embed') !== null ||
      doc.querySelector('[id^="_systemfield_"]') !== null ||
      doc.querySelector('input[name^="_systemfield_"]') !== null ||
      doc.querySelector('script[src*="jobs.ashbyhq.com"]') !== null;

    return hasAshbyMarker;
  }

  extractJob(doc: Document, url: URL): Partial<Job> {
    // 1. Company
    let company = '';
    const companyEl = doc.querySelector(
      'header img[alt], [data-qa="company-name"], a[href^="/"] h2'
    );
    if (companyEl instanceof HTMLImageElement && companyEl.alt) {
      company = companyEl.alt.replace(/ logo$/i, '').trim();
    } else if (companyEl?.textContent) {
      company = companyEl.textContent.trim();
    }

    if (!company) {
      // Ashby URLs: /<company>/<uuid> or /<company>/<uuid>/application
      const pathParts = url.pathname.split('/').filter(Boolean);
      if (pathParts.length >= 1) {
        const raw = pathParts[0].replace(/[-_]/g, ' ');
        company = raw.charAt(0).toUpperCase() + raw.slice(1);
      }
    }

    // 2. Title
    let title = '';
    const titleEl = doc.querySelector('h1, header h1, [data-qa="job-title"]');
    if (titleEl?.textContent) {
      title = titleEl.textContent.trim();
    } else {
      const rawTitle = doc.title || '';
      const match = rawTitle.match(/^(.*?)\s+(?:at|@|-|–|—)\s+(.*?)$/i);
      if (match) {
        title = match[1].trim();
        if (!company) company = match[2].trim();
      } else {
        title = rawTitle.split(/[-|–—:]/)[0].trim();
      }
    }

    // 3. Location
    let location = '';
    const locationEl = doc.querySelector(
      '[data-qa="job-location"], header p, header div > span'
    );
    if (locationEl?.textContent) {
      const text = locationEl.textContent.trim();
      if (!text.toLowerCase().includes('apply')) {
        location = text;
      }
    }

    // 4. Description
    let descriptionText = '';
    const descEl = doc.querySelector(
      '[data-qa="job-description"], main section, #job-description'
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
    // Note: Do NOT use CSS classes to find the Ashby form or inputs (classes are hashed)
    const form =
      doc.querySelector('form') ||
      doc.querySelector('main') ||
      doc.body;

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
      const id = el.getAttribute('id') || `ashby_field_${index}`;

      // Extract label
      let labelText = '';

      // 1. label[for="id"]
      if (id && !id.startsWith('ashby_field_')) {
        const labelEl = doc.querySelector(`label[for="${escapeCss(id)}"]`);
        if (labelEl?.textContent) {
          labelText = labelEl.textContent;
        }
      }

      // 2. id-label
      if (!labelText && id) {
        const labelEl = doc.getElementById(`${id}-label`);
        if (labelEl?.textContent) {
          labelText = labelEl.textContent;
        }
      }

      // 3. Parent label
      if (!labelText) {
        const parentLabel = el.closest('label');
        if (parentLabel?.textContent) {
          labelText = parentLabel.textContent;
        }
      }

      // 4. Wrapping field container (search previous sibling or parent container heading/label)
      if (!labelText) {
        const container = el.parentElement;
        const containerLabel = container?.querySelector('label');
        if (containerLabel?.textContent) {
          labelText = containerLabel.textContent;
        }
      }

      // 5. Attribute fallbacks
      if (!labelText) {
        labelText = el.getAttribute('aria-label') || el.getAttribute('placeholder') || name;
      }

      // Clean default names for Ashby system fields
      if (name === '_systemfield_name' || id === '_systemfield_name') {
        labelText = labelText || 'Full name';
      } else if (name === '_systemfield_email' || id === '_systemfield_email') {
        labelText = labelText || 'Email';
      } else if (name === '_systemfield_resume' || id === '_systemfield_resume') {
        labelText = labelText || 'Resume/CV';
      }

      const cleanLabel = labelText.replace(/[*]/g, '').trim();

      // Determine required
      const isRequired =
        inputEl.required ||
        el.getAttribute('aria-required') === 'true' ||
        labelText.includes('*') ||
        Boolean(el.closest('div')?.querySelector('[aria-hidden="true"]')?.textContent?.includes('*'));

      // Determine type
      let type: FormFieldType = 'text';
      const tag = el.tagName.toUpperCase();
      const role = el.getAttribute('role');

      if (role === 'combobox') {
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

      const isCustomQuestion = !id.startsWith('_systemfield_') && !name.startsWith('_systemfield_');

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
