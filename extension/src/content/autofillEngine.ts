import { FormField } from './adapters/types';
import { Profile, StoredAnswer } from '../core/models';
import { CanonicalField, resolveCanonicalValue, isFieldSensitive } from '../core/fieldSchema';
import { mapElementToCanonical } from '../core/fieldMapper';
import {
  setNativeValue,
  fillSelectElement,
  fillRadioOrCheckbox,
  fillComboboxWidget,
  fillFileInput
} from '../core/filler';

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
    data: ArrayBuffer | Blob;
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
 * Implements scored matching with 0.60 confidence threshold.
 */
export function mapFieldValue(
  field: FormField,
  profile: Profile,
  answers: StoredAnswer[]
): { value: string; confidence: 'high' | 'medium' | 'low'; reason: string; canonical?: CanonicalField } | null {
  const normLabel = normalizeText(field.label);

  // 1. Stored Answers Matching (Exact & Fuzzy Pattern Matching)
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

  // 2. Canonical Scored Mapper (Autocomplete -> Known IDs -> Label Regex -> Heuristics)
  const mapping = mapElementToCanonical(field.element, {
    id: field.id,
    name: field.name,
    type: field.type,
    labelText: field.label
  });

  if (mapping.canonical && mapping.confidence >= 0.6) {
    // Check sensitive fields: Only fill if explicitly configured in profile
    if (isFieldSensitive(mapping.canonical)) {
      const sensitiveVal = resolveCanonicalValue(mapping.canonical, profile);
      if (!sensitiveVal) {
        return null; // Leave blank per Section 1 rule 5
      }
      return {
        value: sensitiveVal,
        confidence: mapping.confidence >= 0.85 ? 'high' : 'medium',
        reason: mapping.reason,
        canonical: mapping.canonical
      };
    }

    const value = resolveCanonicalValue(mapping.canonical, profile);
    if (value) {
      return {
        value,
        confidence: mapping.confidence >= 0.85 ? 'high' : 'medium',
        reason: mapping.reason,
        canonical: mapping.canonical
      };
    }
  }

  // 3. Fallback Heuristic for Common Legal/Authorization Questions
  if (
    normLabel.includes('authorized to work') ||
    normLabel.includes('work authorization') ||
    field.name.toLowerCase().includes('work_auth')
  ) {
    const isAuthorized = profile.workAuthorization.authorizedCountries.length > 0;
    return {
      value: isAuthorized ? 'Yes' : 'No',
      confidence: 'high',
      reason: 'profile:workAuthorization',
      canonical: 'work_authorization'
    };
  }

  if (
    normLabel.includes('sponsorship') ||
    normLabel.includes('require visa') ||
    field.name.toLowerCase().includes('sponsorship')
  ) {
    return {
      value: profile.workAuthorization.requiresSponsorship ? 'Yes' : 'No',
      confidence: 'high',
      reason: 'profile:sponsorship',
      canonical: 'requires_sponsorship'
    };
  }

  return null;
}

/**
 * Fills form fields using framework-safe setters, combobox handlers, and DataTransfer for file uploads.
 */
export async function executeAutofill(
  fields: FormField[],
  payload: AutofillPayload
): Promise<FillResult> {
  const filledFields: FormField[] = [];
  const emptyFields: FormField[] = [];
  const snapshot: Record<string, string> = {};

  for (const field of fields) {
    // 1. File Upload (Resume / CV)
    if (field.type === 'file') {
      const isResume =
        field.name.toLowerCase().includes('resume') ||
        field.id.toLowerCase().includes('resume') ||
        field.label.toLowerCase().includes('resume') ||
        field.label.toLowerCase().includes('cv');

      if (isResume && payload.resumeFile && payload.resumeFile.data) {
        const success = fillFileInput(field.element as HTMLInputElement, payload.resumeFile);
        if (success) {
          field.matchedValue = payload.resumeFile.fileName;
          field.confidence = 'high';
          field.matchedReason = 'resume:default';
          filledFields.push(field);
          snapshot[field.name || field.id] = `[Uploaded: ${payload.resumeFile.fileName}]`;
          continue;
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
      if (field.type === 'combobox') {
        const filled = await fillComboboxWidget(field.element, match.value);
        if (filled) {
          field.matchedValue = match.value;
          field.confidence = match.confidence;
          field.matchedReason = match.reason;
          field.canonical = match.canonical;
          filledFields.push(field);
          snapshot[field.name || field.id] = match.value;
        } else {
          emptyFields.push(field);
        }
      } else if (field.type === 'select') {
        const filled = fillSelectElement(field.element as HTMLSelectElement, match.value);
        if (filled) {
          field.matchedValue = (field.element as HTMLSelectElement).value;
          field.confidence = match.confidence;
          field.matchedReason = match.reason;
          field.canonical = match.canonical;
          filledFields.push(field);
          snapshot[field.name || field.id] = (field.element as HTMLSelectElement).value;
        } else {
          emptyFields.push(field);
        }
      } else if (field.type === 'radio' || field.type === 'checkbox') {
        const desiredState = match.value.toLowerCase() === 'yes' || match.value.toLowerCase() === 'true';
        const filled = fillRadioOrCheckbox(field.element as HTMLInputElement, desiredState);
        if (filled) {
          field.matchedValue = match.value;
          field.confidence = match.confidence;
          field.matchedReason = match.reason;
          field.canonical = match.canonical;
          filledFields.push(field);
          snapshot[field.name || field.id] = match.value;
        } else {
          emptyFields.push(field);
        }
      } else {
        // Text, Email, Tel, URL, Textarea
        setNativeValue(field.element as HTMLInputElement | HTMLTextAreaElement, match.value);
        field.matchedValue = match.value;
        field.confidence = match.confidence;
        field.matchedReason = match.reason;
        field.canonical = match.canonical;
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
