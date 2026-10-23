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

    const elements = form.querySelectorAll<HTMLElement>(
      'input, select, textarea, [role="combobox"], [aria-haspopup="listbox"], [data-automation-id]'
    );

    const fields: FormField[] = [];
    const seenElements = new Set<HTMLElement>();

    elements.forEach((el, index) => {
      // Only inspect interactive input/select/textarea controls or combobox/listbox triggers
      const tag = el.tagName.toUpperCase();
      const isCombobox =
        el.getAttribute('role') === 'combobox' ||
        el.getAttribute('aria-haspopup') === 'listbox' ||
        el.getAttribute('data-automation-id') === 'select-button' ||
        el.getAttribute('data-automation-id') === 'dropdownWidget' ||
        el.getAttribute('data-automation-id') === 'searchWidget';
      const isInput = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || isCombobox;
      if (!isInput) return;

      if (seenElements.has(el)) return;
      seenElements.add(el);

      const inputEl = el as HTMLInputElement;

      // Invariant 1: Strictly ignore submit or navigation controls
      if (inputEl.type === 'hidden' || isSubmitControl(el)) return;
      if (tag === 'BUTTON' && !isCombobox) return;

      // Extract automation ID, falling back to parent container with data-automation-id
      const directAutoId = el.getAttribute('data-automation-id') || '';
      const parentAutoId = el.closest('[data-automation-id]:not([data-automation-id="form-page"])')?.getAttribute('data-automation-id') || '';
      const autoId = (directAutoId && directAutoId !== 'dropdownWidget' && directAutoId !== 'select-button')
        ? directAutoId
        : (parentAutoId || directAutoId);

      const name = el.getAttribute('name') || autoId;
      const id = el.getAttribute('id') || autoId || `wd_field_${index}`;

      // Extract label
      let labelText = '';

      // 0. aria-labelledby (Standard for Workday Canvas Kit comboboxes and buttons)
      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        const ids = labelledBy.split(/\s+/).filter(Boolean);
        const textParts = ids
          .map((lblId) => doc.getElementById(lblId)?.textContent?.trim())
          .filter(Boolean);
        if (textParts.length > 0) {
          labelText = textParts.join(' ');
        }
      }

      // 1. label[for="id"]
      if (!labelText && id && !id.startsWith('wd_field_')) {
        const labelEl = doc.querySelector(`label[for="${escapeCss(id)}"]`);
        if (labelEl?.textContent) {
          labelText = labelEl.textContent;
        }
      }

      // 2. Preceding or wrapping label/legend
      if (!labelText) {
        const parentLabel = el.closest('label');
        if (parentLabel?.textContent) {
          labelText = parentLabel.textContent;
        }
      }

      // 3. Workday automation label conventions: [data-automation-id="<autoId>Label"]
      if (!labelText && autoId) {
        const autoLabel = doc.querySelector(`[data-automation-id="${escapeCss(autoId)}Label"]`);
        if (autoLabel?.textContent) {
          labelText = autoLabel.textContent;
        }
      }

      // 4. Attribute fallbacks
      if (!labelText) {
        labelText = el.getAttribute('aria-label') || el.getAttribute('placeholder') || '';
      }

      // 5. Friendly names for common Workday automation IDs
      const normAutoId = autoId.toLowerCase();
      if (!labelText || labelText.toLowerCase() === 'select one' || labelText.toLowerCase() === 'select') {
        if (autoId === 'legalNameSection_firstName') labelText = 'First Name';
        else if (autoId === 'legalNameSection_lastName') labelText = 'Last Name';
        else if (autoId === 'email') labelText = 'Email Address';
        else if (autoId === 'phone-number') labelText = 'Phone Number';
        else if (normAutoId.includes('phone-device-type')) labelText = 'Phone Device Type';
        else if (normAutoId.includes('countryregion') || normAutoId.includes('state')) labelText = 'State';
        else if (normAutoId.includes('country')) labelText = 'Country';
        else if (autoId === 'addressSection_addressLine1') labelText = 'Address Line 1';
        else if (autoId === 'addressSection_city') labelText = 'City';
        else if (autoId === 'addressSection_postalCode') labelText = 'Postal Code';
        else if (normAutoId.includes('source')) labelText = 'How Did You Hear About Us?';
        else if (normAutoId.includes('school') || normAutoId.includes('institution')) labelText = 'School / University';
        else if (normAutoId.includes('degree')) labelText = 'Degree';
        else if (normAutoId.includes('fieldofstudy') || normAutoId.includes('field-of-study') || normAutoId.includes('major')) labelText = 'Field of Study';
        else if (normAutoId.includes('gpa')) labelText = 'GPA';
        else if (normAutoId.includes('websitetype') || normAutoId.includes('website-type')) labelText = 'Website Type';
        else if (autoId === 'file-upload-input-ref') labelText = 'Resume / CV';
        else labelText = autoId || name;
      }

      const cleanLabel = labelText.replace(/[*]/g, '').trim();

      // Determine required
      const isRequired =
        inputEl.required ||
        el.getAttribute('aria-required') === 'true' ||
        labelText.includes('*') ||
        Boolean(el.closest('div')?.querySelector('[data-automation-id="requiredStar"]'));

      // Determine type
      let type: FormFieldType = 'text';
      const role = el.getAttribute('role');

      if (role === 'combobox' || el.getAttribute('aria-haspopup') === 'listbox') {
        type = 'combobox';
      } else if (tag === 'SELECT') {
        type = 'select';
      } else if (tag === 'TEXTAREA') {
        type = 'textarea';
      } else if (inputEl.type === 'email' || autoId === 'email') {
        type = 'email';
      } else if (inputEl.type === 'tel' || autoId === 'phone-number') {
        type = 'tel';
      } else if (inputEl.type === 'file' || autoId === 'file-upload-input-ref') {
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

      const isCustomQuestion = !autoId.startsWith('legalNameSection_') && autoId !== 'email' && autoId !== 'phone-number';

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
