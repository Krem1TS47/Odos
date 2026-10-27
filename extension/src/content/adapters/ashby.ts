import { AtsAdapter, FormField } from './types';
import { collectControls, describeControl } from '../../core/controlClassifier';

import { Job } from '../../core/models';
import { detectPageCaptcha, CaptchaDetection } from '../captcha';

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

    const controls = collectControls(form, doc);
    return controls.map((control, index) => {
      const field = describeControl(control, index, doc, {
        idPrefix: 'ashby_field',
        labelExtras: { idSuffixes: ['-label'] },
        finalizeLabel: (label, c) => {
          const name = c.element.getAttribute('name') || '';
          const id = c.element.getAttribute('id') || '';
          if (label) return label;
          if (name === '_systemfield_name' || id === '_systemfield_name') return 'Full name';
          if (name === '_systemfield_email' || id === '_systemfield_email') return 'Email';
          if (name === '_systemfield_resume' || id === '_systemfield_resume') return 'Resume/CV';
          return label;
        },
        isRequired: (c) => Boolean(c.element.closest('div')?.querySelector('[aria-hidden="true"]')?.textContent?.includes('*'))
      });
      field.isCustomQuestion = !field.id.startsWith('_systemfield_') && !field.name.startsWith('_systemfield_');
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
