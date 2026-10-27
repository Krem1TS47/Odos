import { AtsAdapter, FormField } from './types';
import { collectControls, describeControl } from '../../core/controlClassifier';

import { Job } from '../../core/models';
import { detectPageCaptcha, CaptchaDetection } from '../captcha';

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

    const friendly: Record<string, string> = {
      name: 'Full name',
      email: 'Email',
      phone: 'Phone',
      org: 'Current company',
      location: 'Current location',
      'urls[LinkedIn]': 'LinkedIn URL',
      'urls[GitHub]': 'GitHub URL',
      'urls[Portfolio]': 'Portfolio URL',
      'urls[Other]': 'Other website',
      comments: 'Additional information',
      resume: 'Resume/CV'
    };

    const controls = collectControls(form, doc);
    return controls.map((control, index) => {
      const field = describeControl(control, index, doc, {
        idPrefix: 'lever_field',
        labelExtras: {
          containerSelectors: ['.application-question', '.application-additional', '.card-field', '.form-group'],
          labelSelectors: ['.application-label', '.text', 'label', 'h4', '.card-field-name']
        },
        finalizeLabel: (label, c) => {
          const name = c.element.getAttribute('name') || '';
          if ((!label || label === name) && friendly[name]) return friendly[name];
          return label;
        },
        isRequired: (c) => Boolean(c.element.closest('.application-question, .card-field')?.querySelector('.required, [data-qa="required"]'))
      });
      field.isCustomQuestion = field.name.startsWith('cards[') || field.name.startsWith('custom_');
      return field;
    });
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
