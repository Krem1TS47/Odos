import { FormField } from './adapters/types';
import { Profile, StoredAnswer } from '../core/models';
import { safeSetFieldValue } from './submitGuard';

export interface FillResult {
  filledFields: FormField[];
  emptyFields: FormField[];
  fieldValuesSnapshot: Record<string, string>;
}

export interface AutofillPayload {
  profile: Profile;
  answers: StoredAnswer[];
  resumeFile?: {
    fileName: string;
    fileType: string;
    data: ArrayBuffer;
  } | null;
}

/**
 * Normalizes string for matching (lowercase, alphanumeric only)
 */
function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Maps a form field to a value from user profile or stored answers.
 */
export function mapFieldValue(
  field: FormField,
  profile: Profile,
  answers: StoredAnswer[]
): { value: string; confidence: 'high' | 'medium' | 'low'; reason: string } | null {
  const normLabel = normalizeText(field.label);
  const normName = normalizeText(field.name);
  const normId = normalizeText(field.id);
  const autocomplete = (field.element.getAttribute('autocomplete') || '').toLowerCase();

  // -------------------------------------------------------------
  // 1. Autocomplete Attribute Matching (Highest Confidence)
  // -------------------------------------------------------------
  if (autocomplete === 'given-name' || autocomplete === 'fname') {
    return { value: profile.contact.firstName, confidence: 'high', reason: 'autocomplete:given-name' };
  }
  if (autocomplete === 'family-name' || autocomplete === 'lname') {
    return { value: profile.contact.lastName, confidence: 'high', reason: 'autocomplete:family-name' };
  }
  if (autocomplete === 'name') {
    return { value: profile.contact.fullName, confidence: 'high', reason: 'autocomplete:name' };
  }
  if (autocomplete === 'email') {
    return { value: profile.contact.email, confidence: 'high', reason: 'autocomplete:email' };
  }
  if (autocomplete === 'tel') {
    return { value: profile.contact.phone, confidence: 'high', reason: 'autocomplete:tel' };
  }

  // -------------------------------------------------------------
  // 2. Name & ID Token Matching (High Confidence)
  // -------------------------------------------------------------
  // First Name
  if (
    normName.includes('first name') ||
    normName.includes('firstname') ||
    normId.includes('first_name') ||
    normLabel === 'first name'
  ) {
    return { value: profile.contact.firstName, confidence: 'high', reason: 'name:firstName' };
  }

  // Last Name
  if (
    normName.includes('last name') ||
    normName.includes('lastname') ||
    normId.includes('last_name') ||
    normLabel === 'last name'
  ) {
    return { value: profile.contact.lastName, confidence: 'high', reason: 'name:lastName' };
  }

  // Full Name
  if (
    normName.includes('full name') ||
    normName === 'name' ||
    normId === 'name' ||
    normLabel === 'full name'
  ) {
    return { value: profile.contact.fullName, confidence: 'high', reason: 'name:fullName' };
  }

  // Email
  if (field.type === 'email' || normName.includes('email') || normLabel.includes('email')) {
    return { value: profile.contact.email, confidence: 'high', reason: 'type/name:email' };
  }

  // Phone
  if (field.type === 'tel' || normName.includes('phone') || normLabel.includes('phone') || normLabel.includes('mobile')) {
    return { value: profile.contact.phone, confidence: 'high', reason: 'type/name:phone' };
  }

  // Location / Address
  if (normName.includes('location') || normLabel === 'location' || normLabel.includes('city')) {
    return { value: profile.contact.location, confidence: 'medium', reason: 'name:location' };
  }

  // LinkedIn
  if (normName.includes('linkedin') || normLabel.includes('linkedin')) {
    return { value: profile.contact.linkedin || '', confidence: 'high', reason: 'name:linkedin' };
  }

  // GitHub
  if (normName.includes('github') || normLabel.includes('github')) {
    return { value: profile.contact.github || '', confidence: 'high', reason: 'name:github' };
  }

  // Portfolio / Website
  if (
    normName.includes('portfolio') ||
    normLabel.includes('portfolio') ||
    normName.includes('website') ||
    normLabel.includes('website')
  ) {
    return { value: profile.contact.website || '', confidence: 'high', reason: 'name:website' };
  }

  // Work Authorization / Sponsorship (Legal/Eligibility: only use stored answers/profile)
  if (
    normLabel.includes('authorized to work') ||
    normLabel.includes('work authorization') ||
    normName.includes('work_auth')
  ) {
    const isAuthorized = profile.workAuthorization.authorizedCountries.length > 0;
    return { value: isAuthorized ? 'Yes' : 'No', confidence: 'high', reason: 'profile:workAuthorization' };
  }

  if (
    normLabel.includes('sponsorship') ||
    normLabel.includes('require visa') ||
    normName.includes('sponsorship')
  ) {
    return {
      value: profile.workAuthorization.requiresSponsorship ? 'Yes' : 'No',
      confidence: 'high',
      reason: 'profile:sponsorship'
    };
  }

  // -------------------------------------------------------------
  // 3. Stored Answers Matching (Exact & Fuzzy Pattern Matching)
  // -------------------------------------------------------------
  for (const stored of answers) {
    for (const pattern of stored.questionPatterns) {
      const normPattern = normalizeText(pattern);
      if (
        normLabel === normPattern ||
        normLabel.includes(normPattern) ||
        normPattern.includes(normLabel)
      ) {
        return {
          value: stored.answer,
          confidence: stored.autoFill ? 'high' : 'medium',
          reason: `answerPattern:${stored.category}`
        };
      }
    }
  }

  return null;
}

/**
 * Fills form fields using framework-safe setters and DataTransfer for file uploads.
 */
export async function executeAutofill(
  fields: FormField[],
  payload: AutofillPayload
): Promise<FillResult> {
  const filledFields: FormField[] = [];
  const emptyFields: FormField[] = [];
  const snapshot: Record<string, string> = {};

  for (const field of fields) {
    // 1. File Upload (Resume)
    if (field.type === 'file') {
      const isResume =
        field.name.toLowerCase().includes('resume') ||
        field.id.toLowerCase().includes('resume') ||
        field.label.toLowerCase().includes('resume') ||
        field.label.toLowerCase().includes('cv');

      if (isResume && payload.resumeFile && payload.resumeFile.data) {
        try {
          const file = new File(
            [payload.resumeFile.data],
            payload.resumeFile.fileName,
            { type: payload.resumeFile.fileType }
          );

          if (typeof DataTransfer !== 'undefined') {
            const dt = new DataTransfer();
            dt.items.add(file);
            (field.element as HTMLInputElement).files = dt.files;
          }

          field.element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
          field.element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

          field.matchedValue = payload.resumeFile.fileName;
          field.confidence = 'high';
          field.matchedReason = 'resume:default';
          filledFields.push(field);
          snapshot[field.name || field.id] = `[Uploaded: ${payload.resumeFile.fileName}]`;
          continue;
        } catch (err) {
          console.warn('[Odos] Could not attach resume file via DataTransfer:', err);
        }
      }

      emptyFields.push(field);
      continue;
    }

    // 2. Value Mapping
    const match = mapFieldValue(field, payload.profile, payload.answers);

    if (!match || !match.value) {
      emptyFields.push(field);
      continue;
    }

    // 3. Framework-Safe Value Setting
    try {
      if (field.type === 'select') {
        const selectEl = field.element as HTMLSelectElement;
        const normVal = normalizeText(match.value);

        let optionMatched = false;
        for (let i = 0; i < selectEl.options.length; i++) {
          const opt = selectEl.options[i];
          const optText = normalizeText(opt.text);
          const optVal = normalizeText(opt.value);

          if (optText === normVal || optVal === normVal || optText.startsWith(normVal)) {
            selectEl.selectedIndex = i;
            selectEl.value = opt.value;
            optionMatched = true;
            break;
          }
        }

        if (optionMatched) {
          selectEl.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
          selectEl.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
          field.matchedValue = selectEl.value;
          field.confidence = match.confidence;
          field.matchedReason = match.reason;
          filledFields.push(field);
          snapshot[field.name || field.id] = selectEl.value;
        } else {
          emptyFields.push(field);
        }
      } else {
        // Text, Email, Tel, URL, Textarea
        safeSetFieldValue(field.element, match.value);
        field.matchedValue = match.value;
        field.confidence = match.confidence;
        field.matchedReason = match.reason;
        filledFields.push(field);
        snapshot[field.name || field.id] = match.value;
      }
    } catch (err) {
      console.warn(`[Odos] Error setting field ${field.label}:`, err);
      emptyFields.push(field);
    }
  }

  return {
    filledFields,
    emptyFields,
    fieldValuesSnapshot: snapshot
  };
}
