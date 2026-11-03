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


const DEFAULT_LABEL_SELECTORS = [
  'label',
  'legend',
  '.application-label',
  '.card-field-name',
  '[class*="label"]',
  '[class*="Label"]',
  '[class*="question-title"]',
  '[class*="questionTitle"]',
  '.label',
  'h3',
  'h4',
  'span.title'
];

/**
 * Descendants that are never part of the question: required markers, help/description,
 * validation and "no results" messages, upload button captions, screen-reader duplicates.
 */
const NOISE_SELECTOR = [
  '.required',
  '[class*="asterisk"]',
  '[class*="required-mark"]',
  '[class*="error"]',
  '[class*="Error"]',
  '[class*="hint"]',
  '[class*="help"]',
  '[class*="description"]',
  '[class*="Description"]',
  '[class*="dropdown-no-results"]',
  '[class*="no-results"]',
  '[class*="resume-upload"]',
  '[class*="default-label"]',
  '[class*="filename"]',
  '[aria-live]',
  '[role="alert"]',
  'svg',
  'button',
  'select',
  'option',
  'input',
  'textarea',
  'ul',
  'ol'
].join(', ');

const CONTROL_QUERY = 'input:not([type="hidden"]), select, textarea, [role="combobox"], [contenteditable="true"]';

/** Strips required markers and collapses whitespace. */
export function cleanLabelText(text: string): string {
  return (text || '')
    .replace(/[✱＊]/g, '*')
    .replace(/\s+/g, ' ')
    .replace(/\s*\*+\s*$/, ' *')
    .trim();
}

/**
 * Text of an element without its noise descendants (helper text, errors, nested controls,
 * option lists). This is what stops Lever's "Current location ✱No location found..." and
 * "Resume/CV ✱ATTACH RESUME/CV Couldn't auto-read resume" labels.
 */
export function ownText(el: Element | null | undefined): string {
  if (!el) return '';
  // Prefer an explicit label/text child (Lever: .application-label > .text).
  const preferred = el.matches('.application-label, [class*="label"]')
    ? el.querySelector(':scope > .text')
    : el.querySelector(':scope > .application-label, :scope > [class*="label"]:not(input):not(select)');
  const target = preferred && (preferred.textContent || '').trim() ? preferred : el;
  const clone = target.cloneNode(true) as Element;
  clone.querySelectorAll(NOISE_SELECTOR).forEach((n) => {
    // Keep the "*" signal from required markers so callers can derive `required`.
    if (n.matches('.required, [class*="asterisk"], [class*="required-mark"]')) {
      n.replaceWith(clone.ownerDocument!.createTextNode(' *'));
    } else {
      n.remove();
    }
  });
  return cleanLabelText(clone.textContent || '');
}

function textOf(el: Element | null | undefined): string {
  return ownText(el);
}

/** Controls that are part of the same field as `el` (its own group / search box / button pair). */
function sameFieldControls(el: Element): Set<Element> {
  const set = new Set<Element>([el]);
  const name = el.getAttribute('name');
  if (name) {
    const root = el.closest('form') || el.ownerDocument;
    root?.querySelectorAll(`[name="${escapeCss(name)}"]`).forEach((n) => set.add(n));
  }
  return set;
}

/**
 * Finds the question text for a control by walking up to the smallest container that holds
 * a label-like element and no other field's control. A label that is an option of this
 * field (e.g. a radio's "Yes") is skipped.
 */
export function questionTextFor(
  el: HTMLElement,
  optionLabels: string[] = [],
  extras: LabelResolutionExtras = {},
  groupMembers: Element[] = []
): string {
  const own = sameFieldControls(el);
  groupMembers.forEach((m) => own.add(m));
  const optionSet = new Set(optionLabels.map((o) => cleanLabelText(o).toLowerCase()));
  const labelSelectors = [...(extras.labelSelectors || []), ...DEFAULT_LABEL_SELECTORS].join(', ');
  let node: Element | null = el.parentElement;
  for (let depth = 0; depth < 7 && node; depth++) {
    // Stop once the container clearly holds another field.
    const controls = Array.from(node.querySelectorAll(CONTROL_QUERY)).filter((c) => !own.has(c) && !c.closest('[role="listbox"]'));
    const foreign = controls.filter((c) => {
      const t = (c.getAttribute('type') || '').toLowerCase();
      return !(t === 'radio' || t === 'checkbox') || !own.has(c);
    });
    // Above the immediate parent, a container that also holds another field's control is
    // shared between fields: its labels are not ours.
    if (foreign.length > 0 && depth > 0) break;
    const candidates = Array.from(node.querySelectorAll(labelSelectors)).filter((c) => {
      if (c === el || c.contains(el) && c.tagName !== 'LABEL') return false;
      const t = ownText(c);
      if (!t || t.length < 2) return false;
      if (optionSet.has(t.replace(/\s*\*$/, '').toLowerCase())) return false;
      // A label wrapping one of this field's own option inputs is an option label, and a label
      // wrapping some other field's control belongs to that field.
      if (c.tagName === 'LABEL' && Array.from(own).some((o) => o !== el && c.contains(o))) return false;
      if (Array.from(c.querySelectorAll(CONTROL_QUERY)).some((x) => !own.has(x))) return false;
      if (c.tagName === 'LABEL' && c.querySelector('input[type="radio"], input[type="checkbox"]') && optionSet.size > 0) return false;
      return true;
    });
    // Prefer a candidate that comes before the control in document order.
    const before = candidates.filter((c) => c.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
    const pick = before[0] || candidates[0];
    if (pick) return ownText(pick);
    node = node.parentElement;
  }
  return '';
}

/**
 * Resolves the visible or accessible label text for a form control.
 * Shared by every adapter (eng review R12). Order:
 *  aria-labelledby (multi-id join) -> label[for] -> id-suffix labels -> wrapping label's own
 *  text -> question container (no foreign fields) -> aria-label -> ATS attribute lookup ->
 *  placeholder -> name.
 * The returned text keeps a trailing "*" when the field is marked required.
 */
export function resolveFieldLabel(el: HTMLElement, doc: Document = document, extras: LabelResolutionExtras = {}): string {
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
  // Some ATSs (Ashby) point label[for] at the field's name rather than an id.
  const name = el.getAttribute('name');
  if (name) {
    const forName = doc.querySelector(`label[for="${escapeCss(name)}"]`);
    if (textOf(forName)) return textOf(forName);
  }

  const parentLabel = el.closest('label');
  if (parentLabel && textOf(parentLabel)) return textOf(parentLabel);

  const ariaLabel = (el.getAttribute('aria-label') || '').trim();
  const genericAria = /^(select one|select|search|toggle flyout|open|clear|choose|dropdown)$/i;
  if (ariaLabel && !genericAria.test(ariaLabel)) return ariaLabel;

  const question = questionTextFor(el, [], extras);
  if (question) return question;

  if (extras.attributeLabel) {
    const attr = extras.attributeLabel(el, doc);
    if (attr && attr.trim()) return attr.trim();
  }

  const placeholder = el.getAttribute('placeholder');
  if (placeholder && placeholder.trim() && !/^(start typing|search|select|type here|choose)/i.test(placeholder.trim())) {
    return placeholder.trim();
  }

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

    // Referral source ("how did you hear", "how you heard about", "where did you find/learn")
    if (/(how|where)\s+(did\s+)?you\s+(first\s+)?(hear|heard|find|found|learn|learned|discover)\b|referral\s*source|heard\s+about\s+(us|this)|source\s+of\s+(application|referral)/i.test(normLabel)) {
      return { canonical: 'referral_source', confidence: 0.85, source: 'label', reason: 'label:referral_source' };
    }

    // Salary expectation
    if (/(salary|compensation|hourly\s*rate|pay\s*rate|desired\s*pay)/i.test(normLabel)) {
      return { canonical: 'salary_expectation', confidence: 0.85, source: 'label', reason: 'label:salary_expectation' };
    }

    // Years of experience (a number; "Do you have 4+ years of X?" is a yes/no question, not this)
    if (
      /(years?\s*of\s*(professional\s*|relevant\s*|work\s*)?experience|how\s*many\s*years|total\s*experience)/i.test(normLabel) &&
      !/^(do|are|have|is|will|would|can)\b/i.test(normLabel) &&
      !/\d+\s*\+?\s*years?/i.test(normLabel)
    ) {
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

    // Preferred name (before first name and pronouns)
    if (/^(preferred|nick)\s*(first\s*)?name\b|what would you like (us )?to call you/i.test(normLabel) && !/pronunc/i.test(normLabel)) {
      return { canonical: 'first_name', confidence: 0.8, source: 'label', reason: 'label:preferred_name' };
    }

    // Pronouns (whole word: "pronounce" is not "pronouns")
    if (/\bpronouns?\b/i.test(normLabel)) {
      return { canonical: 'pronouns', confidence: 0.85, source: 'label', reason: 'label:pronouns' };
    }

    // EEO Race / ethnicity ("Which ethnicity(ies) do you identify with?")
    if (/^(race|ethnicity|race\s*\/\s*ethnicity)/i.test(normLabel) || /\b(race|ethnicit(y|ies)|ethnic\s*(group|background|origin))\b/i.test(normLabel)) {
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

    // Full Legal Name (not "how do you pronounce your name")
    if (/(full\s*legal\s*name|full\s*name|^name$|your\s*name)/i.test(normLabel) && !/pronunc|pronounce|spell|phonetic/i.test(normLabel)) {
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
    if (
      /^country(\s*\/?\s*region)?$/i.test(normLabel) ||
      /country\s*(of\s*residence|\/\s*territory)/i.test(normLabel) ||
      /\b(which|what)\s+country\s+(do\s+you|are\s+you)\s+(live|reside|located|based|intend|plan|currently)/i.test(normLabel)
    ) {
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

    // Current / most recent company
    if (/((current|most\s*recent|latest|present)\s*(company|employer|organi[sz]ation)|^company\s*name$|^employer$)/i.test(normLabel)) {
      return { canonical: 'current_company', confidence: 0.80, source: 'label', reason: 'label:current_company' };
    }

    // Current / most recent title
    if (/((current|most\s*recent|latest|present)\s*(job\s*)?(title|role|position)|^job\s*title$|^title$)/i.test(normLabel)) {
      return { canonical: 'current_title', confidence: 0.80, source: 'label', reason: 'label:current_title' };
    }

    // Education: Degree
    if (/(degree|education\s*level|highest\s*education)/i.test(normLabel)) {
      return { canonical: 'education_degree', confidence: 0.85, source: 'label', reason: 'label:education_degree' };
    }

    // Education: School / University (excludes open-ended memory/essay prompts or textareas)
    if (
      type !== 'textarea' &&
      (/(school|university|institution|college)(\s*name)?$/i.test(normLabel) ||
        /\b(which|what|name of (your|the))\s+(university|school|college|institution)\b/i.test(normLabel) ||
        /\b(university|school|college)\b.*\b(attend|attending|attended|enrolled|studying)\b/i.test(normLabel)) &&
      !/(memory|essay|tell us|why|describe|city|location|country|state|graduat|gpa|major|degree)/i.test(normLabel)
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
