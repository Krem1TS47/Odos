import { CanonicalField } from './fieldSchema';
import { escapeCss } from './dom';

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

/**
 * Options for ATS-specific label resolution extras.
 */
export interface LabelResolutionExtras {
  /** Element id suffixes/prefixes that name a label element, e.g. ['-label'] -> `${id}-label`. */
  idSuffixes?: string[];
  /** Container selectors to search for a label/heading when no direct label exists. */
  containerSelectors?: string[];
  /** Selectors tried inside the container, in order. */
  labelSelectors?: string[];
  /** ATS-specific attribute-driven lookup (e.g. Workday `[data-automation-id="<id>Label"]`). */
  attributeLabel?: (el: HTMLElement, doc: Document) => string | null | undefined;
  /** Fall back to the element's name attribute (default true). */
  fallbackToName?: boolean;
}

const DEFAULT_CONTAINER_SELECTORS = [
  '.field-wrapper',
  '.field',
  '.form-group',
  '.input-container',
  '.select__container',
  '.application-question',
  '.application-additional',
  '.card-field',
  '[role="group"]',
  'fieldset'
];

const DEFAULT_LABEL_SELECTORS = [
  'label',
  'legend',
  '.application-label',
  '.card-field-name',
  '.label',
  'h3',
  'h4',
  'span.title'
];

function textOf(el: Element | null | undefined): string {
  return (el?.textContent || '').replace(/\s+/g, ' ').trim();
}

/**
 * Resolves the visible or accessible label text for a form control.
 * Shared by every adapter (eng review R12). Order:
 *  aria-label -> aria-labelledby (multi-id join) -> label[for] -> id-suffix labels ->
 *  wrapping label -> container heading -> ATS attribute lookup -> placeholder -> name.
 * The returned text keeps any "*" so callers can derive `required` from it.
 */
export function resolveFieldLabel(el: HTMLElement, doc: Document = document, extras: LabelResolutionExtras = {}): string {
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const parts = labelledBy
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => textOf(doc.getElementById(id)))
      .filter(Boolean);
    if (parts.length > 0) return parts.join(' ');
  }

  const id = el.getAttribute('id') || '';
  if (id) {
    const forLabel = doc.querySelector(`label[for="${escapeCss(id)}"]`);
    if (textOf(forLabel)) return textOf(forLabel);

    const suffixes = extras.idSuffixes ?? ['-label', '_label'];
    for (const suffix of suffixes) {
      const candidate = doc.getElementById(`${id}${suffix}`);
      if (textOf(candidate)) return textOf(candidate);
    }
  }

  const parentLabel = el.closest('label');
  if (textOf(parentLabel)) return textOf(parentLabel);

  const containerSelectors = [...(extras.containerSelectors || []), ...DEFAULT_CONTAINER_SELECTORS];
  const labelSelectors = [...(extras.labelSelectors || []), ...DEFAULT_LABEL_SELECTORS];
  const container = el.closest(containerSelectors.join(', '));
  if (container) {
    for (const sel of labelSelectors) {
      const candidates = Array.from(container.querySelectorAll(sel));
      const heading = candidates.find((c) => !c.querySelector('input, select, textarea') || c === parentLabel);
      if (textOf(heading)) return textOf(heading);
    }
  }

  if (extras.attributeLabel) {
    const attr = extras.attributeLabel(el, doc);
    if (attr && attr.trim()) return attr.trim();
  }

  const placeholder = el.getAttribute('placeholder');
  if (placeholder && placeholder.trim()) return placeholder.trim();

  if (extras.fallbackToName !== false) {
    return el.getAttribute('name') || '';
  }
  return '';
}

/**
 * Back-compat wrapper: label text without the name fallback.
 */
export function getElementLabelText(el: HTMLElement): string {
  return resolveFieldLabel(el, el.ownerDocument || document, { fallbackToName: false });
}

/**
 * Scored mapping engine: element attributes + label text -> CanonicalField.
 * Accepts either an ElementContext object or a live HTMLElement (with optional overrides).
 */
export function mapElementToCanonical(
  elOrCtx: HTMLElement | ElementContext,
  overrides?: Partial<ElementContext>
): FieldMappingResult {
  let ctx: ElementContext;

  if (typeof (elOrCtx as HTMLElement).nodeType === 'number') {
    const el = elOrCtx as HTMLElement;
    const inputEl = el as HTMLInputElement;
    ctx = {
      id: el.id || undefined,
      name: el.getAttribute('name') || undefined,
      type: inputEl.type || el.tagName.toLowerCase(),
      autocomplete: el.getAttribute('autocomplete') || undefined,
      placeholder: el.getAttribute('placeholder') || undefined,
      labelText: getElementLabelText(el) || undefined,
      ariaLabel: el.getAttribute('aria-label') || undefined,
      ...overrides
    };
  } else {
    ctx = { ...(elOrCtx as ElementContext), ...overrides };
  }

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
  // Standard Name IDs across ATSs
  if (name === 'first_name' || id === 'first_name') return { canonical: 'first_name', confidence: 0.95, source: 'known_id', reason: 'known_id:first_name' };
  if (name === 'last_name' || id === 'last_name') return { canonical: 'last_name', confidence: 0.95, source: 'known_id', reason: 'known_id:last_name' };
  if (name === 'name' || id === 'name' || name === 'full_name' || id === 'full_name') return { canonical: 'full_name', confidence: 0.95, source: 'known_id', reason: 'known_id:full_name' };
  if (name === 'email' || id === 'email') return { canonical: 'email', confidence: 0.95, source: 'known_id', reason: 'known_id:email' };
  if (name === 'phone' || id === 'phone') return { canonical: 'phone', confidence: 0.95, source: 'known_id', reason: 'known_id:phone' };

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
  if (id === 'phone-device-type' || name === 'phone-device-type') {
    return { canonical: 'phone_device_type', confidence: 0.95, source: 'known_id', reason: 'workday:phone-device-type' };
  }
  if (id === 'addresssection_addressline1' || name === 'addresssection_addressline1') {
    return { canonical: 'address_line1', confidence: 0.95, source: 'known_id', reason: 'workday:addressSection_addressLine1' };
  }
  if (id === 'addresssection_city' || name === 'addresssection_city') {
    return { canonical: 'city', confidence: 0.95, source: 'known_id', reason: 'workday:addressSection_city' };
  }
  if (id === 'addresssection_country' || name === 'addresssection_country') {
    return { canonical: 'country', confidence: 0.95, source: 'known_id', reason: 'workday:addressSection_country' };
  }
  if (id === 'addresssection_countryregion' || name === 'addresssection_countryregion') {
    return { canonical: 'state', confidence: 0.95, source: 'known_id', reason: 'workday:addressSection_countryRegion' };
  }
  if (id === 'addresssection_postalcode' || name === 'addresssection_postalcode') {
    return { canonical: 'postal_code', confidence: 0.95, source: 'known_id', reason: 'workday:addressSection_postalCode' };
  }

  // Workday / Generic Education & Experience known IDs
  if (id.includes('fieldofstudy') || name.includes('fieldofstudy') || id.includes('field-of-study') || name.includes('field_of_study')) {
    return { canonical: 'education_field', confidence: 0.95, source: 'known_id', reason: 'known_id:field_of_study' };
  }
  if (id.includes('websitetype') || name.includes('websitetype') || id.includes('website-type') || name.includes('website_type')) {
    return { canonical: 'website_type', confidence: 0.95, source: 'known_id', reason: 'known_id:website_type' };
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

    // Years of experience
    if (/(years?\s*of\s*(professional\s*|relevant\s*|work\s*)?experience|how\s*many\s*years|total\s*experience)/i.test(normLabel)) {
      return { canonical: 'years_experience', confidence: 0.85, source: 'label', reason: 'label:years_experience' };
    }

    // Availability / earliest start date
    if (/(earliest\s*start|start\s*date|available\s*to\s*start|when\s*(can|could)\s*you\s*start|availability\s*date|date\s*available)/i.test(normLabel)) {
      return { canonical: 'start_date', confidence: 0.85, source: 'label', reason: 'label:start_date' };
    }

    // Notice period
    if (/notice\s*period/i.test(normLabel)) {
      return { canonical: 'notice_period', confidence: 0.85, source: 'label', reason: 'label:notice_period' };
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
    if (/^country(\s*\/?\s*region)?$/i.test(normLabel) || /country\s*(of\s*residence|\/\s*territory)/i.test(normLabel)) {
      return { canonical: 'country', confidence: 0.85, source: 'label', reason: 'label:country' };
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
    if (/(address\s*line\s*2|apartment|apt\s*\/?\s*suite|suite\s*\/?\s*unit)/i.test(normLabel)) {
      return { canonical: 'address_line2', confidence: 0.80, source: 'label', reason: 'label:address_line2' };
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

    // Education: Degree
    if (/(degree|education\s*level|highest\s*education)/i.test(normLabel)) {
      return { canonical: 'education_degree', confidence: 0.85, source: 'label', reason: 'label:education_degree' };
    }

    // Education: School / University (excludes open-ended memory/essay prompts or textareas)
    if (
      type !== 'textarea' &&
      /(school|university|institution)(\s*name)?$/i.test(normLabel) &&
      !/(memory|essay|tell us|why|describe)/i.test(normLabel)
    ) {
      return { canonical: 'education_school', confidence: 0.85, source: 'label', reason: 'label:education_school' };
    }

    // Education: Field of Study / Major
    if (/(field\s*of\s*study|major|discipline|area\s*of\s*study)/i.test(normLabel)) {
      return { canonical: 'education_field', confidence: 0.85, source: 'label', reason: 'label:education_field' };
    }

    // Education: GPA
    if (/^gpa|grade\s*point\s*average/i.test(normLabel)) {
      return { canonical: 'education_gpa', confidence: 0.85, source: 'label', reason: 'label:education_gpa' };
    }

    // Website / Link Type dropdown
    if (/(website\s*type|link\s*type|url\s*type|media\s*type)/i.test(normLabel)) {
      return { canonical: 'website_type', confidence: 0.85, source: 'label', reason: 'label:website_type' };
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
