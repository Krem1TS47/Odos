import { AtsAdapter, FormField } from './types';
import { collectControls, describeControl } from '../../core/controlClassifier';
import { escapeCss } from '../../core/dom';

import { Job } from '../../core/models';
import { detectPageCaptcha, CaptchaDetection } from '../captcha';

export class WorkdayAdapter implements AtsAdapter {
  id = 'workday';
  name = 'Workday';

  matches(url: URL, doc: Document): boolean {
    const isDomain =
      url.hostname.includes('.myworkdayjobs.com') ||
      url.hostname.includes('.myworkdaysite.com') ||
      url.hostname.includes('workday.com');

    if (isDomain) return true;

    // Check for Workday automation attributes
    const hasWorkdayAutomation =
      doc.querySelector('[data-automation-id="jobTitle"]') !== null ||
      doc.querySelector('[data-automation-id="legalNameSection_firstName"]') !== null ||
      doc.querySelector('[data-automation-id="jobPostingHeader"]') !== null ||
      doc.querySelector('[data-automation-id="file-upload-input-ref"]') !== null ||
      doc.querySelector('[data-automation-id="bottom-navigation-next-button"]') !== null;

    return hasWorkdayAutomation;
  }

  extractJob(doc: Document, url: URL): Partial<Job> {
    // 1. Company
    let company = '';
    const logoEl = doc.querySelector(
      '[data-automation-id="logo"] img, [data-automation-id="logoLink"] img, .wd-logo img'
    );
    if (logoEl instanceof HTMLImageElement && logoEl.alt) {
      company = logoEl.alt.replace(/ logo$/i, '').trim();
    }

    if (!company) {
      const headerTitle = doc.querySelector('[data-automation-id="headerTitle"]');
      if (headerTitle?.textContent) {
        company = headerTitle.textContent.trim();
      }
    }

    if (!company) {
      // Subdomain in myworkdayjobs: <company>.wd1.myworkdayjobs.com
      const subparts = url.hostname.split('.');
      if (subparts.length >= 3 && subparts[0] !== 'www') {
        company = subparts[0].replace(/[-_]/g, ' ');
        company = company.charAt(0).toUpperCase() + company.slice(1);
      }
    }

    // 2. Title
    let title = '';
    const titleEl = doc.querySelector(
      '[data-automation-id="jobTitle"], [data-automation-id="jobPostingHeader"] h2, h1'
    );
    if (titleEl?.textContent) {
      title = titleEl.textContent.trim();
    } else {
      const rawTitle = doc.title || '';
      title = rawTitle.split(/[-|–—:]/)[0].trim();
    }

    // 3. Location
    let location = '';
    const locEl = doc.querySelector(
      '[data-automation-id="locations"], [data-automation-id="location"], [data-automation-id="remoteType"]'
    );
    if (locEl?.textContent) {
      location = locEl.textContent.trim();
    }

    // 4. Description
    let descriptionText = '';
    const descEl = doc.querySelector(
      '[data-automation-id="jobPostingDescription"], [data-automation-id="job-posting-details"]'
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
      doc.querySelector('form') ||
      doc.querySelector('[data-automation-id="form-page"]') ||
      doc.querySelector('main') ||
      doc.body;

    if (!form) return [];

    const WRAPPER_IDS = new Set(['dropdownWidget', 'select-button', 'searchWidget', 'selectWidget', 'multiselectInputContainer']);

    const autoIdFor = (el: HTMLElement): string => {
      const direct = el.getAttribute('data-automation-id') || '';
      const parent =
        el.closest('[data-automation-id]:not([data-automation-id="form-page"])')?.getAttribute('data-automation-id') || '';
      if (direct && !WRAPPER_IDS.has(direct)) return direct;
      // Walk past wrapper widgets to the field-level automation id
      let node: Element | null = el.parentElement;
      while (node) {
        const id = node.getAttribute('data-automation-id');
        if (id && id !== 'form-page' && !WRAPPER_IDS.has(id)) return id;
        node = node.parentElement;
      }
      return parent || direct;
    };

    const friendlyLabel = (autoId: string, name: string): string => {
      const normAutoId = autoId.toLowerCase();
      if (autoId === 'legalNameSection_firstName') return 'First Name';
      if (autoId === 'legalNameSection_lastName') return 'Last Name';
      if (autoId === 'email') return 'Email Address';
      if (autoId === 'phone-number') return 'Phone Number';
      if (normAutoId.includes('phone-device-type')) return 'Phone Device Type';
      if (normAutoId.includes('countryregion') || normAutoId.includes('state')) return 'State';
      if (normAutoId.includes('country')) return 'Country';
      if (autoId === 'addressSection_addressLine1') return 'Address Line 1';
      if (autoId === 'addressSection_city') return 'City';
      if (autoId === 'addressSection_postalCode') return 'Postal Code';
      if (normAutoId.includes('source')) return 'How Did You Hear About Us?';
      if (normAutoId.includes('school') || normAutoId.includes('institution')) return 'School / University';
      if (normAutoId.includes('degree')) return 'Degree';
      if (normAutoId.includes('fieldofstudy') || normAutoId.includes('field-of-study') || normAutoId.includes('major')) return 'Field of Study';
      if (normAutoId.includes('gpa')) return 'GPA';
      if (normAutoId.includes('websitetype') || normAutoId.includes('website-type')) return 'Website Type';
      if (autoId === 'file-upload-input-ref') return 'Resume / CV';
      return autoId || name;
    };

    const controls = collectControls(form, doc);
    return controls.map((control, index) => {
      const autoId = autoIdFor(control.element);
      const field = describeControl(control, index, doc, {
        idPrefix: 'wd_field',
        identify: (c) => ({
          name: c.element.getAttribute('name') || autoId,
          id: c.element.getAttribute('id') || autoId || `wd_field_${index}`
        }),
        labelExtras: {
          attributeLabel: (_el, d) => {
            if (!autoId) return null;
            const lbl = d.querySelector(`[data-automation-id="${escapeCss(autoId)}Label"]`);
            return lbl?.textContent || null;
          },
          fallbackToName: false
        },
        finalizeLabel: (label, c) => {
          const name = c.element.getAttribute('name') || autoId;
          const lower = label.toLowerCase();
          if (!label || lower === 'select one' || lower === 'select') return friendlyLabel(autoId, name);
          return label;
        },
        isRequired: (c) => Boolean(c.element.closest('div')?.querySelector('[data-automation-id="requiredStar"]'))
      });
      field.isCustomQuestion = !autoId.startsWith('legalNameSection_') && autoId !== 'email' && autoId !== 'phone-number';
      return field;
    });
  }

  confirmationDetected(url: URL, doc: Document): boolean {
    const urlPattern = /confirmation|applied|thankyou|success/i;
    if (urlPattern.test(url.href)) {
      return true;
    }

    const confEl = doc.querySelector(
      '[data-automation-id="applicationConfirmation"], [data-automation-id="thankYouNotice"]'
    );
    if (confEl) return true;

    const headings = Array.from(doc.querySelectorAll('h1, h2, h3, p'));
    for (const h of headings) {
      const text = (h.textContent || '').trim().toLowerCase();
      if (text.includes('application submitted') || text.includes('thank you for applying')) {
        return true;
      }
    }

    return false;
  }

  detectCaptcha(doc: Document): CaptchaDetection {
    return detectPageCaptcha(doc);
  }
}
