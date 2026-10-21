import { AtsAdapter, FormField, FormFieldType } from './types';
import { Job } from '../../core/models';
import { isSubmitControl } from '../submitGuard';
import { detectPageCaptcha, CaptchaDetection } from '../captcha';
import { deepQuerySelectorAll } from '../../core/dom';
import { getElementLabelText, mapElementToCanonical } from '../../core/fieldMapper';

export class GenericAdapter implements AtsAdapter {
  id = 'generic';
  name = 'Generic ATS';

  matches(_url: URL, doc: Document): boolean {
    // Matches if there is at least one interactive form with text/email/file inputs
    const inputs = deepQuerySelectorAll('input, select, textarea', doc);
    const visibleInputs = inputs.filter(
      (el) =>
        (el as HTMLInputElement).type !== 'hidden' &&
        !isSubmitControl(el) &&
        el.tagName !== 'BUTTON'
    );
    return visibleInputs.length >= 2;
  }

  extractJob(doc: Document, url: URL): Partial<Job> {
    // 1. Company fallback
    let company = '';
    const companyEl = doc.querySelector(
      '.company, .company-name, [class*="company"], [id*="company"], header img[alt]'
    );
    if (companyEl instanceof HTMLImageElement && companyEl.alt) {
      company = companyEl.alt.replace(/ logo$/i, '').trim();
    } else if (companyEl?.textContent) {
      company = companyEl.textContent.trim();
    }

    if (!company) {
      const parts = url.hostname.split('.');
      if (parts.length >= 2) {
        const raw = parts[parts.length - 2];
        company = raw.charAt(0).toUpperCase() + raw.slice(1);
      }
    }

    // 2. Title fallback
    let title = '';
    const titleEl = doc.querySelector('h1, [class*="job-title"], [class*="jobTitle"]');
    if (titleEl?.textContent) {
      title = titleEl.textContent.trim();
    } else {
      const rawTitle = doc.title || '';
      title = rawTitle.split(/[-|–—:]/)[0].trim() || 'Job Application';
    }

    // 3. Location fallback
    let location = '';
    const locEl = doc.querySelector(
      '.location, [class*="location"], [id*="location"], [class*="remote"]'
    );
    if (locEl?.textContent) {
      location = locEl.textContent.trim();
    }

    // 4. Description fallback
    let descriptionText = '';
    const descEl = doc.querySelector(
      '.description, [class*="description"], article, main'
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
    // Pierces open shadow roots to find inputs anywhere in the page
    const elements = deepQuerySelectorAll(
      'input, select, textarea, [role="combobox"]',
      doc
    ) as HTMLElement[];

    const fields: FormField[] = [];
    const seenElements = new Set<HTMLElement>();

    elements.forEach((el, index) => {
      if (seenElements.has(el)) return;
      seenElements.add(el);

      const inputEl = el as HTMLInputElement;

      // Invariant 1: Strictly ignore submit controls
      if (inputEl.type === 'hidden' || isSubmitControl(el)) return;
      if (el.tagName === 'BUTTON' && el.getAttribute('role') !== 'combobox') return;

      const name = el.getAttribute('name') || '';
      const id = el.getAttribute('id') || `generic_field_${index}`;
      const labelText = getElementLabelText(el) || el.getAttribute('placeholder') || name;
      const cleanLabel = labelText.replace(/[*]/g, '').trim();

      const isRequired =
        inputEl.required ||
        el.getAttribute('aria-required') === 'true' ||
        labelText.includes('*');

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

      let options: string[] | undefined;
      if (tag === 'SELECT') {
        const selectEl = el as HTMLSelectElement;
        options = Array.from(selectEl.options)
          .map((opt) => opt.text.trim())
          .filter((txt) => txt && !txt.startsWith('--'));
      }

      // Pre-map canonical field
      const mapping = mapElementToCanonical(el);

      fields.push({
        id,
        name,
        label: cleanLabel,
        type,
        element: el,
        required: isRequired,
        options,
        canonical: mapping.canonical,
        confidence: mapping.confidence
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
