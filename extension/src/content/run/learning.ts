import { FormField } from '../adapters/types';
import { normalizeOptionText } from '../../core/dropdownResolver';
import { readFieldValue } from './fieldValues';

export const SENSITIVE_QUESTION = /password|social security|\bssn\b|date of birth|\bdob\b|credit card|bank|routing|passport number|driver'?s? licen[cs]e number/i;

/** Whether an answer to this field may be proposed for the answer bank. */
export function isLearnable(field: FormField): boolean {
  if (field.type === 'file') return false;
  if (!field.label || field.label.trim().split(/\s+/).length < 2) return false;
  return !SENSITIVE_QUESTION.test(field.label);
}

/**
 * Learning loop on the page itself: when the user answers a field Odos left for review (or
 * corrects one it was unsure of), call `propose` with the question and the answer.
 */
export function attachLearningListeners(fields: FormField[], propose: (field: FormField, value: string) => void): () => void {
  const cleanups: Array<() => void> = [];
  for (const field of fields) {
    if (!isLearnable(field)) continue;
    const targets: Element[] = field.groupElements?.length
      ? field.groupElements
      : field.groupButtons?.length
        ? field.groupButtons
        : [field.element, ...(field.trigger ? [field.trigger] : [])];
    const onAnswer = () => {
      // Read after the widget has updated its display.
      setTimeout(() => {
        const value = readFieldValue(field).trim();
        if (!value) return;
        if (field.status === 'verified' && field.matchedValue && normalizeOptionText(value) === normalizeOptionText(field.matchedValue)) return;
        propose(field, value);
      }, 250);
    };
    const events = field.groupButtons ? ['change', 'focusout', 'click'] : ['change', 'focusout'];
    for (const t of targets) {
      for (const e of events) {
        t.addEventListener(e, onAnswer);
        cleanups.push(() => t.removeEventListener(e, onAnswer));
      }
    }
  }
  return () => cleanups.forEach((c) => c());
}
