import { CanonicalField } from './fieldSchema';

export interface FieldMappingResult {
  canonical?: CanonicalField;
  confidence: number; // 0..1
  source: 'autocomplete' | 'known_id' | 'label' | 'attribute_heuristic' | 'none';
  reason: string;
}

export interface ElementContext {
  id?: string;
  name?: string;
  type?: string;
  autocomplete?: string;
  placeholder?: string;
  labelText?: string;
  ariaLabel?: string;
}

/**
 * Normalizes text for regex/token matching.
 */
export function normalizeLabel(text: string): string {
  return text
    .toLowerCase()
    .replace(/[*\uff0a:?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeEscapeCSS(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/([!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

/**
 * Resolves visible or accessible label text for a given HTML element.
 */
export function getElementLabelText(el: HTMLElement): string {
  // 1. aria-label
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

  // 2. aria-labelledby
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const labelEl = document.getElementById(labelledBy);
    if (labelEl && labelEl.textContent?.trim()) {
      return labelEl.textContent.trim();
    }
  }

  // 3. <label for="id">
  if (el.id) {
    const forLabel = document.querySelector(`label[for="${safeEscapeCSS(el.id)}"]`);
    if (forLabel && forLabel.textContent?.trim()) {
      return forLabel.textContent.trim();
    }
  }

  // 4. Wrapping <label>
  const parentLabel = el.closest('label');
  if (parentLabel && parentLabel.textContent?.trim()) {
    return parentLabel.textContent.trim();
  }

  // 5. Preceding label or header in parent container
  const container = el.closest('.field, .form-group, .input-container, [role="group"]');
  if (container) {
    const heading = container.querySelector('label, .label, legend, h3, h4, span.title');
    if (heading && heading.textContent?.trim()) {
      return heading.textContent.trim();
    }
  }

  return '';
}

/**
 * Scored mapping engine: element attributes + label text -> CanonicalField.
 */
export function mapElementToCanonical(ctx: ElementContext): FieldMappingResult {
  const normLabel = normalizeLabel(ctx.labelText || ctx.ariaLabel || '');
  const autocomplete = (ctx.autocomplete || '').toLowerCase().trim();
  const id = (ctx.id || '').toLowerCase().trim();
  const name = (ctx.name || '').toLowerCase().trim();
  const placeholder = (ctx.placeholder || '').toLowerCase().trim();
  const type = (ctx.type || 'text').toLowerCase().trim();

  // --------------------------------------------------------------------------
  // 1. Autocomplete Attribute Matching (Confidence 0.95)
  // --------------------------------------------------------------------------
  if (autocomplete) {
    switch (autocomplete) {
      case 'given-name':
      case 'fname':
        return { canonical: 'first_name', confidence: 0.95, source: 'autocomplete', reason: `autocomplete:${autocomplete}` };
      case 'family-name':
      case 'lname':
        return { canonical: 'last_name', confidence: 0.95, source: 'autocomplete', reason: `autocomplete:${autocomplete}` };
      case 'name':
        return { canonical: 'full_name', confidence: 0.95, source: 'autocomplete', reason: 'autocomplete:name' };
      case 'email':
        return { canonical: 'email', confidence: 0.95, source: 'autocomplete', reason: 'autocomplete:email' };
      case 'tel':
      case 'tel-national':
        return { canonical: 'phone', confidence: 0.95, source: 'autocomplete', reason: `autocomplete:${autocomplete}` };
      case 'country':
      case 'country-name':
        return { canonical: 'country', confidence: 0.95, source: 'autocomplete', reason: `autocomplete:${autocomplete}` };
      case 'postal-code':
        return { canonical: 'postal_code', confidence: 0.95, source: 'autocomplete', reason: 'autocomplete:postal-code' };
      case 'address-line1':
      case 'street-address':
        return { canonical: 'address_line1', confidence: 0.95, source: 'autocomplete', reason: `autocomplete:${autocomplete}` };
      case 'address-level2':
        return { canonical: 'city', confidence: 0.95, source: 'autocomplete', reason: 'autocomplete:address-level2' };
      case 'address-level1':
        return { canonical: 'state', confidence: 0.95, source: 'autocomplete', reason: 'autocomplete:address-level1' };
    }
  }

  // --------------------------------------------------------------------------
  // 2. ATS-Specific Known Names / IDs (Confidence 0.95)
  // --------------------------------------------------------------------------
  // Lever exact names
  if (name === 'urls[linkedin]') return { canonical: 'linkedin', confidence: 0.95, source: 'known_id', reason: 'lever:urls[LinkedIn]' };
  if (name === 'urls[github]') return { canonical: 'github', confidence: 0.95, source: 'known_id', reason: 'lever:urls[GitHub]' };
  if (name === 'urls[portfolio]') return { canonical: 'portfolio', confidence: 0.95, source: 'known_id', reason: 'lever:urls[Portfolio]' };
  if (name === 'urls[other]') return { canonical: 'website', confidence: 0.95, source: 'known_id', reason: 'lever:urls[Other]' };
  if (name === 'org') return { canonical: 'current_company', confidence: 0.95, source: 'known_id', reason: 'lever:org' };
  if (name === 'comments') return { canonical: 'cover_letter', confidence: 0.95, source: 'known_id', reason: 'lever:comments' };
  if (name === 'resume' && type === 'file') return { canonical: 'resume', confidence: 0.95, source: 'known_id', reason: 'lever:resume' };

  // Ashby exact systemfield identifiers
  if (name === '_systemfield_name' || id === '_systemfield_name') {
    return { canonical: 'full_name', confidence: 0.95, source: 'known_id', reason: 'ashby:_systemfield_name' };
  }
  if (name === '_systemfield_email' || id === '_systemfield_email') {
    return { canonical: 'email', confidence: 0.95, source: 'known_id', reason: 'ashby:_systemfield_email' };
  }
  if (name === '_systemfield_resume' || id === '_systemfield_resume' || (type === 'file' && (id.includes('resume') || name.includes('resume')))) {
    return { canonical: 'resume', confidence: 0.95, source: 'known_id', reason: 'ashby:_systemfield_resume' };
  }

  // Workday automation IDs
  if (id === 'legalnamesection_firstname' || name === 'legalnamesection_firstname') {
    return { canonical: 'first_name', confidence: 0.95, source: 'known_id', reason: 'workday:legalNameSection_firstName' };
  }
  if (id === 'legalnamesection_lastname' || name === 'legalnamesection_lastname') {
    return { canonical: 'last_name', confidence: 0.95, source: 'known_id', reason: 'workday:legalNameSection_lastName' };
  }
  if (id === 'phone-number' || name === 'phone-number') {
    return { canonical: 'phone', confidence: 0.95, source: 'known_id', reason: 'workday:phone-number' };
  }
  if (id === 'addresssection_addressline1') {
    return { canonical: 'address_line1', confidence: 0.95, source: 'known_id', reason: 'workday:addressSection_addressLine1' };
  }
  if (id === 'addresssection_city') {
    return { canonical: 'city', confidence: 0.95, source: 'known_id', reason: 'workday:addressSection_city' };
  }
  if (id === 'addresssection_postalcode') {
    return { canonical: 'postal_code', confidence: 0.95, source: 'known_id', reason: 'workday:addressSection_postalCode' };
  }

  // Greenhouse exact IDs
  if (id === 'first_name' || name === 'job_application[first_name]') {
    return { canonical: 'first_name', confidence: 0.95, source: 'known_id', reason: 'greenhouse:first_name' };
  }
  if (id === 'last_name' || name === 'job_application[last_name]') {
    return { canonical: 'last_name', confidence: 0.95, source: 'known_id', reason: 'greenhouse:last_name' };
  }
  if (id === 'email' || name === 'job_application[email]') {
    return { canonical: 'email', confidence: 0.95, source: 'known_id', reason: 'greenhouse:email' };
  }
  if (id === 'phone' || name === 'job_application[phone]') {
    return { canonical: 'phone', confidence: 0.95, source: 'known_id', reason: 'greenhouse:phone' };
  }
  if (id === 'job_application_location' || name === 'job_application[location]') {
    return { canonical: 'location', confidence: 0.95, source: 'known_id', reason: 'greenhouse:location' };
  }

  // --------------------------------------------------------------------------
  // 3. Label Text Regex Matching (Confidence 0.80 - 0.85)
  // --------------------------------------------------------------------------
  if (normLabel) {
    // LinkedIn
    if (/linked\s*in/i.test(normLabel)) {
      return { canonical: 'linkedin', confidence: 0.85, source: 'label', reason: 'label:linkedin' };
    }

    // GitHub
    if (/git\s*hub/i.test(normLabel)) {
      return { canonical: 'github', confidence: 0.85, source: 'label', reason: 'label:github' };
    }

    // Twitter
    if (/(twitter|x handle)/i.test(normLabel)) {
      return { canonical: 'twitter', confidence: 0.85, source: 'label', reason: 'label:twitter' };
    }

    // Portfolio / Website
    if (/(portfolio|personal\s*website|website|personal\s*url|blog)/i.test(normLabel)) {
      return { canonical: 'website', confidence: 0.85, source: 'label', reason: 'label:website' };
    }

    // Resume / CV
    if (/(resume|cv|curriculum\s*vitae)/i.test(normLabel) && (type === 'file' || normLabel.includes('upload'))) {
      return { canonical: 'resume', confidence: 0.85, source: 'label', reason: 'label:resume' };
    }

    // Cover Letter
    if (/(cover\s*letter|letter\s*of\s*motivation)/i.test(normLabel)) {
      return { canonical: 'cover_letter', confidence: 0.85, source: 'label', reason: 'label:cover_letter' };
    }

    // Work Authorization (Tricky phrasing support)
    if (
      /(authorized|legally\s*authorized|eligible|eligibility)\s*(to|for)?\s*work/i.test(normLabel) ||
      /legally\s*permitted\s*to\s*work/i.test(normLabel)
    ) {
      return { canonical: 'work_authorization', confidence: 0.85, source: 'label', reason: 'label:work_authorization' };
    }

    // Sponsorship
    if (
      /sponsor/i.test(normLabel) ||
      /require\s*(visa|immigration)\s*sponsorship/i.test(normLabel) ||
      /future.*visa\s*sponsorship/i.test(normLabel)
    ) {
      return { canonical: 'requires_sponsorship', confidence: 0.85, source: 'label', reason: 'label:requires_sponsorship' };
    }

    // Relocation
    if (/(relocat|open\s*to\s*relocation|willing\s*to\s*relocate)/i.test(normLabel)) {
      return { canonical: 'relocation', confidence: 0.85, source: 'label', reason: 'label:relocation' };
    }

    // Referral source
    if (/(how\s*did\s*you\s*hear|referral\s*source|where\s*did\s*you\s*find)/i.test(normLabel)) {
      return { canonical: 'referral_source', confidence: 0.85, source: 'label', reason: 'label:referral_source' };
    }

    // Salary expectation
    if (/(salary|compensation|hourly\s*rate|pay\s*rate|desired\s*pay)/i.test(normLabel)) {
      return { canonical: 'salary_expectation', confidence: 0.85, source: 'label', reason: 'label:salary_expectation' };
    }

    // Pronouns
    if (/(pronoun|preferred\s*pronoun)/i.test(normLabel)) {
      return { canonical: 'pronouns', confidence: 0.85, source: 'label', reason: 'label:pronouns' };
    }

    // EEO Race
    if (/^(race|ethnicity|race\s*\/\s*ethnicity)/i.test(normLabel)) {
      return { canonical: 'eeo_race', confidence: 0.85, source: 'label', reason: 'label:eeo_race' };
    }

    // EEO Gender
    if (/^(gender|sex|gender\s*identity)/i.test(normLabel)) {
      return { canonical: 'eeo_gender', confidence: 0.85, source: 'label', reason: 'label:eeo_gender' };
    }

    // EEO Veteran
    if (/(veteran|protected\s*veteran|military\s*status)/i.test(normLabel)) {
      return { canonical: 'eeo_veteran', confidence: 0.85, source: 'label', reason: 'label:eeo_veteran' };
    }

    // EEO Disability
    if (/(disability|handicap|physical\s*or\s*mental\s*impairment)/i.test(normLabel)) {
      return { canonical: 'eeo_disability', confidence: 0.85, source: 'label', reason: 'label:eeo_disability' };
    }

    // First Name (with Preferred / Legal variants)
    if (/preferred\s*first\s*name/i.test(normLabel) || /^first\s*name/i.test(normLabel) || /^given\s*name/i.test(normLabel)) {
      return { canonical: 'first_name', confidence: 0.85, source: 'label', reason: 'label:first_name' };
    }

    // Last Name
    if (/^last\s*name/i.test(normLabel) || /^family\s*name/i.test(normLabel) || /^surname/i.test(normLabel)) {
      return { canonical: 'last_name', confidence: 0.85, source: 'label', reason: 'label:last_name' };
    }

    // Full Legal Name
    if (/(full\s*legal\s*name|full\s*name|^name$|your\s*name)/i.test(normLabel)) {
      return { canonical: 'full_name', confidence: 0.80, source: 'label', reason: 'label:full_name' };
    }

    // Email
    if (/e-?mail/i.test(normLabel)) {
      return { canonical: 'email', confidence: 0.85, source: 'label', reason: 'label:email' };
    }

    // Phone / Mobile
    if (/(phone|mobile|cell|telephone)/i.test(normLabel)) {
      return { canonical: 'phone', confidence: 0.85, source: 'label', reason: 'label:phone' };
    }

    // Location / City / Address
    if (/(current\s*)?location/i.test(normLabel)) {
      return { canonical: 'location', confidence: 0.80, source: 'label', reason: 'label:location' };
    }
    if (/^city/i.test(normLabel)) {
      return { canonical: 'city', confidence: 0.80, source: 'label', reason: 'label:city' };
    }
    if (/^(state|province|region)/i.test(normLabel)) {
      return { canonical: 'state', confidence: 0.80, source: 'label', reason: 'label:state' };
    }
    if (/(postal\s*code|zip\s*code)/i.test(normLabel)) {
      return { canonical: 'postal_code', confidence: 0.80, source: 'label', reason: 'label:postal_code' };
    }
    if (/^address/i.test(normLabel) || /^street/i.test(normLabel)) {
      return { canonical: 'address_line1', confidence: 0.80, source: 'label', reason: 'label:address_line1' };
    }

    // Current Company
    if (/(current\s*company|current\s*employer|company\s*name|organization)/i.test(normLabel)) {
      return { canonical: 'current_company', confidence: 0.80, source: 'label', reason: 'label:current_company' };
    }

    // Current Title
    if (/(current\s*title|current\s*role|job\s*title)/i.test(normLabel)) {
      return { canonical: 'current_title', confidence: 0.80, source: 'label', reason: 'label:current_title' };
    }
  }

  // --------------------------------------------------------------------------
  // 4. Name / ID / Placeholder Attribute Heuristics (Confidence 0.60 - 0.70)
  // --------------------------------------------------------------------------
  const attrBlob = `${id} ${name} ${placeholder}`;

  if (type === 'email' || attrBlob.includes('email')) {
    return { canonical: 'email', confidence: 0.70, source: 'attribute_heuristic', reason: 'attr:email' };
  }
  if (type === 'tel' || attrBlob.includes('phone') || attrBlob.includes('mobile')) {
    return { canonical: 'phone', confidence: 0.70, source: 'attribute_heuristic', reason: 'attr:phone' };
  }
  if (attrBlob.includes('firstname') || attrBlob.includes('first_name')) {
    return { canonical: 'first_name', confidence: 0.70, source: 'attribute_heuristic', reason: 'attr:first_name' };
  }
  if (attrBlob.includes('lastname') || attrBlob.includes('last_name')) {
    return { canonical: 'last_name', confidence: 0.70, source: 'attribute_heuristic', reason: 'attr:last_name' };
  }
  if (attrBlob.includes('fullname') || attrBlob.includes('full_name')) {
    return { canonical: 'full_name', confidence: 0.65, source: 'attribute_heuristic', reason: 'attr:full_name' };
  }
  if (attrBlob.includes('linkedin')) {
    return { canonical: 'linkedin', confidence: 0.70, source: 'attribute_heuristic', reason: 'attr:linkedin' };
  }
  if (attrBlob.includes('github')) {
    return { canonical: 'github', confidence: 0.70, source: 'attribute_heuristic', reason: 'attr:github' };
  }
  if (attrBlob.includes('location') || attrBlob.includes('city')) {
    return { canonical: 'location', confidence: 0.60, source: 'attribute_heuristic', reason: 'attr:location' };
  }
  if (type === 'file' && attrBlob.includes('resume')) {
    return { canonical: 'resume', confidence: 0.70, source: 'attribute_heuristic', reason: 'attr:resume' };
  }

  // --------------------------------------------------------------------------
  // 5. Unmatched / Low Confidence (< 0.60 => Do not fill)
  // --------------------------------------------------------------------------
  return {
    canonical: undefined,
    confidence: 0,
    source: 'none',
    reason: 'no_match'
  };
}
