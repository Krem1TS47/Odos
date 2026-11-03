import { FormField } from '../adapters/types';
import { FieldSnapshot, readDisplayedValue } from '../../core/filler';
import { normalizeOptionText } from '../../core/dropdownResolver';

export interface ManualEdit {
  field: FormField;
  value: string;
}

/**
 * Reads the value a field currently shows, for submission records, manual-edit capture and
 * "is this required field answered?" checks.
 */
export function readFieldValue(field: FormField): string {
  const el = field.element;
  switch (field.type) {
    case 'select': {
      const s = el as HTMLSelectElement;
      return s.selectedIndex >= 0 ? (s.options[s.selectedIndex]?.text || '').trim() : '';
    }
    case 'radio_group': {
      const idx = (field.groupElements || []).findIndex((g) => g.checked);
      return idx >= 0 ? field.options?.[idx] || field.groupElements![idx].value : '';
    }
    case 'checkbox_group':
      return (field.groupElements || [])
        .map((g, i) => (g.checked ? field.options?.[i] || g.value : ''))
        .filter(Boolean)
        .join('; ');
    case 'checkbox':
    case 'radio':
      return (el as HTMLInputElement).checked ? 'Yes' : '';
    case 'button_group': {
      const pressed = (field.groupButtons || []).find((b) => b.getAttribute('aria-pressed') === 'true' || b.getAttribute('aria-checked') === 'true');
      return pressed ? (pressed.textContent || '').trim() : '';
    }
    case 'combobox':
      return readDisplayedValue(el, field.trigger);
    case 'file':
      return (el as HTMLInputElement).files?.[0]?.name || '';
    default:
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value;
      return (el.textContent || '').trim();
  }
}

const PLACEHOLDER_VALUE = /^(select( one)?|select\.\.\.|choose( one)?|please select|--.*)$/i;

/** True when the field currently holds a real answer. */
export function hasAnswer(field: FormField): boolean {
  const v = readFieldValue(field).trim();
  return v.length > 0 && !PLACEHOLDER_VALUE.test(v);
}

function snapshotValueText(field: FormField, snap: FieldSnapshot | undefined): string {
  if (!snap) return '';
  switch (field.type) {
    case 'radio_group': {
      const idx = (field.groupElements || []).findIndex((g) => g.value === snap.checkedValue);
      return idx >= 0 ? field.options?.[idx] || snap.checkedValue || '' : '';
    }
    case 'checkbox_group':
      return (snap.checkedValues || []).join('; ');
    case 'checkbox':
    case 'radio':
      return snap.checked ? 'Yes' : '';
    case 'combobox':
      return snap.displayed || snap.value || '';
    case 'select': {
      const s = field.element as HTMLSelectElement;
      const idx = snap.selectedIndex ?? -1;
      return idx >= 0 ? (s.options[idx]?.text || '').trim() : '';
    }
    default:
      return snap.value || '';
  }
}

/**
 * Fields whose current value was typed/chosen by the user (not by Odos) since discovery.
 */
export function collectManualEdits(fields: FormField[], snapshots: Map<FormField, FieldSnapshot>): ManualEdit[] {
  const edits: ManualEdit[] = [];
  for (const field of fields) {
    if (field.type === 'file') continue;
    const current = readFieldValue(field).trim();
    if (!current) continue;
    const initial = snapshotValueText(field, snapshots.get(field)).trim();
    if (normalizeOptionText(current) === normalizeOptionText(initial)) continue;
    const odosValue = field.status === 'verified' || field.status === 'unverified' ? field.matchedValue || '' : '';
    if (odosValue && normalizeOptionText(current) === normalizeOptionText(odosValue)) continue;
    if (!field.label || field.label.length < 3) continue;
    edits.push({ field, value: current });
  }
  return edits;
}

/** name -> value for every field that currently holds something (submission record). */
export function snapshotAnswers(fields: FormField[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = readFieldValue(f);
    if (v) out[f.name || f.id || f.label] = v;
  }
  return out;
}
