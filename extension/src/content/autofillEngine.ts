/**
 * Autofill engine: maps discovered fields to values and applies them under the
 * verified-fill contract.
 *
 * RUN_ODOS (content/index.ts)
 *   ├─ findMatchingAdapter ─► Greenhouse | Lever | Ashby | Workday | Generic
 *   ├─ GET_PAGE_DATA (profile, answers, resume)                 ──► background
 *   ├─ processDynamicAdditions ── click "+Add" once, guarded ──► DOM
 *   ├─ adapter.discoverFields ─► core/controlClassifier ─► FormField[] (groups, variants, rows)
 *   └─ executeAutofill (this file)
 *        └─ per field: resolveFieldValue
 *             ├─ section-aware canonical (education/experience rows)
 *             ├─ stored answers: scored lexical matcher (answerMatcher.ts) >= 0.75
 *             ├─ canonical mapper (fieldMapper.ts) >= 0.6 → resolveCanonicalValue(rowIndex)
 *             ├─ work-auth / sponsorship heuristics
 *             └─ semantic tier (background Prompt API) when lexical < floor
 *           → hint = CANONICAL_DICTIONARY / answer category
 *           → applyFill: fillCombobox | fillSelect | fillRadioGroup | fillCheckbox(Group) | fillTextField
 *           → FillOutcome: verified | unverified | failed(+suggestion)
 *        → FillResult { filledFields (verified+unverified), emptyFields (failed/skipped), snapshot }
 *   └─ ReviewPanel ─► Fill / Fill & remember / Undo / Mark Submitted (save-on-submit diff)
 */

import { AutofillPayload as BaseAutofillPayload, FillSource, FormField } from './adapters/types';
import { Profile, StoredAnswer, StoredAnswerCategory } from '../core/models';
import {
  CanonicalField,
  resolveCanonicalValue,
  isFieldSensitive,
  resolveDictionaryHint
} from '../core/fieldSchema';
import { mapElementToCanonical } from '../core/fieldMapper';
import {
  FillOutcome,
  fillCheckbox,
  fillCheckboxGroup,
  fillCombobox,
  fillFileInput,
  fillRadioGroup,
  fillSelect,
  fillTextField,
  reconcileField
} from '../core/filler';
import { STORED_ANSWER_FLOOR, findBestStoredAnswer, rankStoredAnswers } from '../core/answerMatcher';
import { SemanticMatchFn } from '../core/semantic/types';

export interface FillResult {
  /** Fields with status verified or unverified. */
  filledFields: FormField[];
  /** Fields with status failed or skipped (needs review). */
  emptyFields: FormField[];
  fieldValuesSnapshot: Record<string, string>;
  verifiedCount: number;
  unverifiedCount: number;
}

export interface AutofillPayload extends BaseAutofillPayload {
  /** Optional semantic tier (content script bridges to the background provider). */
  semanticMatch?: SemanticMatchFn;
}

export interface ResolvedValue {
  value: string;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  canonical?: CanonicalField;
  source: FillSource;
  answerCategory?: StoredAnswerCategory;
  answerId?: string;
}

/**
 * Normalizes string for matching (lowercase, alphanumeric only)
 */
function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Inside a repeatable education/experience/website row, generic labels ("Start date",
 * "Company") map to the row's canonical fields rather than the global ones.
 */
export function sectionCanonical(field: FormField): CanonicalField | undefined {
  if (!field.repeatSection) return undefined;
  const l = field.label.toLowerCase();
  if (field.repeatSection === 'education') {
    if (/school|university|college|institution/.test(l)) return 'education_school';
    if (/degree|qualification/.test(l)) return 'education_degree';
    if (/field of study|major|discipline|area of study|concentration/.test(l)) return 'education_field';
    if (/gpa|grade/.test(l)) return 'education_gpa';
    if (/start|from|begin/.test(l)) return 'education_start_date';
    if (/end|to\b|graduat|completion|complete/.test(l)) return 'education_end_date';
  }
  if (field.repeatSection === 'experience') {
    if (/company|employer|organization|organisation/.test(l)) return 'experience_company';
    if (/title|role|position/.test(l)) return 'experience_title';
    if (/start|from|begin/.test(l)) return 'experience_start_date';
    if (/end|to\b|until|through/.test(l)) return 'experience_end_date';
    if (/description|responsibilit|summary|duties|accomplish/.test(l)) return 'experience_summary';
  }
  if (field.repeatSection === 'website') {
    if (/type|kind/.test(l)) return 'website_type';
    if (/url|link|website|address/.test(l)) return 'website';
  }
  return undefined;
}

function websiteForRow(profile: Profile, row: number): { url: string; type: string } | null {
  const list = [
    { url: profile.contact.linkedin, type: 'LinkedIn' },
    { url: profile.contact.github, type: 'GitHub' },
    { url: profile.contact.website, type: 'Portfolio' }
  ].filter((w) => Boolean(w.url));
  return list[row] || null;
}

/**
 * Maps a form field to a value from the profile or stored answers (lexical tiers only).
 */
export function mapFieldValue(
  field: FormField,
  profile: Profile,
  answers: StoredAnswer[]
): ResolvedValue | null {
  const normLabel = normalizeText(field.label);
  const rowIndex = field.rowIndex ?? 0;

  // 0. Row-aware canonical inside repeatable sections
  const rowCanonical = sectionCanonical(field);
  if (rowCanonical) {
    if (field.repeatSection === 'website') {
      const w = websiteForRow(profile, rowIndex);
      if (w) {
        return {
          value: rowCanonical === 'website_type' ? w.type : w.url,
          confidence: 'high',
          reason: `section:website[${rowIndex}]`,
          canonical: rowCanonical,
          source: 'profile'
        };
      }
    } else {
      const v = resolveCanonicalValue(rowCanonical, profile, answers, { rowIndex });
      if (v) return { value: v, confidence: 'high', reason: `section:${field.repeatSection}[${rowIndex}]`, canonical: rowCanonical, source: 'profile' };
    }
  }

  // 1. Stored answers via the scored lexical matcher (best across all answers)
  const best = findBestStoredAnswer(field.label, answers);
  if (best && best.score >= STORED_ANSWER_FLOOR) {
    return {
      value: best.answer.answer,
      confidence: best.answer.autoFill ? 'high' : 'medium',
      reason: `answer:${best.strategy}:${best.score.toFixed(2)}`,
      source: 'answer',
      answerCategory: best.answer.category,
      answerId: best.answer.id
    };
  }

  // 2. Canonical scored mapper (autocomplete -> known ids -> label regex -> heuristics)
  const mapping = mapElementToCanonical(field.element, {
    id: field.id,
    name: field.name,
    type: field.type,
    labelText: field.label
  });

  if (mapping.canonical && mapping.confidence >= 0.6) {
    const value = resolveCanonicalValue(mapping.canonical, profile, answers, { rowIndex });
    if (isFieldSensitive(mapping.canonical) && !value) {
      return null; // Sensitive: blank unless explicitly configured
    }
    if (value) {
      return {
        value,
        confidence: mapping.confidence >= 0.85 ? 'high' : 'medium',
        reason: mapping.reason,
        canonical: mapping.canonical,
        source: 'profile'
      };
    }
  }

  // 3. Fallback heuristics for legal / authorization questions
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
      canonical: 'work_authorization',
      source: 'heuristic'
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
      canonical: 'requires_sponsorship',
      source: 'heuristic'
    };
  }

  return null;
}

/**
 * Lexical tiers first; when they fail, asks the semantic tier (if provided) to pick a
 * stored answer or an option. Returns null when nothing is confident enough.
 */
export async function resolveFieldValue(field: FormField, payload: AutofillPayload): Promise<ResolvedValue | null> {
  const lexical = mapFieldValue(field, payload.profile, payload.answers);
  if (lexical) return lexical;

  if (!payload.semanticMatch || field.type === 'file') return null;
  if (!field.label || field.label.trim().length < 4) return null;

  const ranked = rankStoredAnswers(field.label, payload.answers, 8);
  const candidates = (ranked.length > 0 ? ranked.map((r) => r.answer) : payload.answers.slice(0, 12)).map((a) => ({
    id: a.id,
    answer: a.answer,
    patterns: a.questionPatterns
  }));
  if (candidates.length === 0 && !(field.options && field.options.length > 0)) return null;

  try {
    const decision = await payload.semanticMatch({
      question: field.label,
      section: field.repeatSection,
      fieldType: field.type,
      options: field.options,
      candidates
    });
    if (!decision || decision.kind === 'none') return null;
    if (decision.kind === 'answer') {
      const answer = payload.answers.find((a) => a.id === decision.answerId);
      if (!answer) return null;
      return {
        value: answer.answer,
        confidence: 'medium',
        reason: `ai:answer:${decision.confidence.toFixed(2)}`,
        source: 'ai',
        answerCategory: answer.category,
        answerId: answer.id
      };
    }
    if (decision.kind === 'option' && field.options && decision.optionIndex !== undefined) {
      const text = field.options[decision.optionIndex];
      if (!text) return null;
      return { value: text, confidence: 'medium', reason: `ai:option:${decision.confidence.toFixed(2)}`, source: 'ai' };
    }
  } catch (err) {
    console.warn('[Odos] Semantic tier failed; continuing without it:', err);
  }
  return null;
}

function stripPhonePrefix(field: FormField, value: string): string {
  if (field.name.toLowerCase().includes('phone') || field.id.toLowerCase().includes('phone')) {
    if (value.startsWith('+1')) return value.slice(2).trim();
    if (value.startsWith('+')) return value.replace(/^\+\d{1,3}\s*/, '').trim();
  }
  return value;
}

/**
 * Applies a value to a field using the right filler for its type. Exported so the review
 * panel's "Fill" action goes through exactly the same path as autofill.
 */
export async function fillFieldWithValue(field: FormField, value: string, hintCategory?: string): Promise<FillOutcome> {
  const el = field.element;
  switch (field.type) {
    case 'combobox':
      return fillCombobox({
        element: el,
        desired: value,
        trigger: field.trigger,
        searchInput: el instanceof HTMLInputElement ? el : undefined,
        optionSource: field.optionSource,
        variant: field.dropdownVariant,
        hintCategory,
        doc: el.ownerDocument || document
      });
    case 'select':
      return fillSelect(el as HTMLSelectElement, value, hintCategory);
    case 'radio_group':
      return fillRadioGroup(field.groupElements || [el as HTMLInputElement], value, hintCategory, field.options);
    case 'radio':
      return fillRadioGroup([el as HTMLInputElement], value, hintCategory, field.options);
    case 'checkbox_group':
      return fillCheckboxGroup(field.groupElements || [el as HTMLInputElement], value, hintCategory, field.options);
    case 'checkbox':
      return fillCheckbox(el as HTMLInputElement, value, field.label);
    case 'file':
      return { status: 'skipped', reason: 'file_requires_binary' };
    default:
      return fillTextField(el, value);
  }
}

function recordOutcome(field: FormField, outcome: FillOutcome, resolved: ResolvedValue | null): void {
  field.status = outcome.status;
  field.statusReason = outcome.reason;
  field.suggestion = outcome.suggestion;
  if (resolved) {
    field.confidence = resolved.confidence;
    field.matchedReason = resolved.reason;
    field.canonical = resolved.canonical;
    field.source = resolved.source;
    field.answerId = resolved.answerId;
  }
  if (outcome.status === 'verified' || outcome.status === 'unverified') {
    field.matchedValue = outcome.value;
  }
}

/**
 * Fills form fields using framework-safe setters, combobox handlers, and DataTransfer for file uploads.
 */
export async function executeAutofill(fields: FormField[], payload: AutofillPayload): Promise<FillResult> {
  const filledFields: FormField[] = [];
  const emptyFields: FormField[] = [];
  const snapshot: Record<string, string> = {};
  let verifiedCount = 0;
  let unverifiedCount = 0;

  const isWorkday = payload.adapterId === 'workday';

  for (const field of fields) {
    // 1. File upload (resume / CV)
    if (field.type === 'file') {
      const isResume =
        field.name.toLowerCase().includes('resume') ||
        field.id.toLowerCase().includes('resume') ||
        field.label.toLowerCase().includes('resume') ||
        field.label.toLowerCase().includes('cv');

      // Workday invariant: programmatic file injection crashes Workday's uploader, so the
      // adapter id (not page sniffing) decides the skip.
      if (isWorkday) {
        field.status = 'skipped';
        field.statusReason = 'workday_upload_requires_human';
        emptyFields.push(field);
        continue;
      }

      if (isResume && payload.resumeFile && payload.resumeFile.data) {
        const success = fillFileInput(field.element as HTMLInputElement, payload.resumeFile);
        if (success) {
          field.matchedValue = payload.resumeFile.fileName;
          field.confidence = 'high';
          field.matchedReason = 'resume:default';
          field.source = 'resume';
          field.status = 'verified';
          filledFields.push(field);
          verifiedCount++;
          snapshot[field.name || field.id] = `[Uploaded: ${payload.resumeFile.fileName}]`;
          continue;
        }
      }

      field.status = 'failed';
      field.statusReason = isResume ? 'no_resume_available' : 'file_not_resume';
      emptyFields.push(field);
      continue;
    }

    // 2. Value mapping
    const resolved = await resolveFieldValue(field, payload);
    if (!resolved || !resolved.value) {
      field.status = 'failed';
      field.statusReason = 'no_match';
      const ranked = rankStoredAnswers(field.label, payload.answers, 1);
      if (ranked.length > 0 && ranked[0].score >= 0.5) {
        field.suggestion = { text: ranked[0].answer.answer, score: ranked[0].score, source: 'answer' };
      }
      emptyFields.push(field);
      continue;
    }

    const valToSet = stripPhonePrefix(field, resolved.value);
    const hint = resolveDictionaryHint(resolved.canonical, resolved.answerCategory, field.label);

    // 3. Fill under the verified-fill contract
    try {
      const outcome = await fillFieldWithValue(field, valToSet, hint);
      recordOutcome(field, outcome, resolved);
      if (outcome.status === 'verified' || outcome.status === 'unverified') {
        filledFields.push(field);
        if (outcome.status === 'verified') verifiedCount++;
        else unverifiedCount++;
        snapshot[field.name || field.id] = outcome.value || valToSet;
      } else {
        emptyFields.push(field);
      }
    } catch (err) {
      console.warn(`[Odos] Error setting field ${field.label}:`, err);
      field.status = 'failed';
      field.statusReason = 'exception';
      emptyFields.push(field);
    }
  }

  // Post-fill reconciliation: frameworks may wipe a text value during re-render.
  await new Promise((r) => setTimeout(r, 50));
  for (const f of filledFields) {
    const textLike = f.element instanceof HTMLInputElement || f.element instanceof HTMLTextAreaElement;
    if (textLike && f.type !== 'file' && f.type !== 'combobox' && f.type !== 'checkbox' && f.type !== 'radio' && f.matchedValue) {
      reconcileField(f.element, f.matchedValue);
    }
  }

  return { filledFields, emptyFields, fieldValuesSnapshot: snapshot, verifiedCount, unverifiedCount };
}
