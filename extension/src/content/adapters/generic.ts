import { AtsAdapter, FormField } from './types';
import { Job } from '../../core/models';
import { isSubmitControl } from '../submitGuard';
import { detectPageCaptcha, CaptchaDetection } from '../captcha';
import { deepQuerySelectorAll } from '../../core/dom';
import { mapElementToCanonical } from '../../core/fieldMapper';
import { collectControls, describeControl } from '../../core/controlClassifier';

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
    // Pierces open shadow roots to find controls anywhere in the page
    const controls = collectControls(doc, doc, { deep: true });

    return controls.map((control, index) => {
      const field = describeControl(control, index, doc, { idPrefix: 'generic_field' });
      // Pre-map canonical field for callers that want a quick confidence read
      const mapping = mapElementToCanonical(control.element, { labelText: field.label });
      field.canonical = mapping.canonical;
      field.confidence = mapping.confidence;
      return field;
    });
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
