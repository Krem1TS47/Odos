import { AtsAdapter, FormField } from '../adapters/types';
import { executeAutofill, FillResult } from '../autofillEngine';
import { captureFieldSnapshot, FieldSnapshot } from '../../core/filler';
import { processDynamicAdditions } from '../../core/repeatableManager';
import { waitForSettle } from '../../core/dom';
import { Profile, StoredAnswer } from '../../core/models';
import { SemanticMatchFn } from '../../core/semantic/types';
import { ResumeFile } from './messaging';

export interface PageFillInput {
  adapter: AtsAdapter;
  profile: Profile;
  answers: StoredAnswer[];
  resumeFile: ResumeFile | null;
  semanticMatch?: SemanticMatchFn;
  doc?: Document;
}

export interface PageFillResult extends FillResult {
  fields: FormField[];
  snapshots: Map<FormField, FieldSnapshot>;
}

const FOLLOW_UP_DELAY_MS = 400;

function mergeInto(target: FillResult, extra: FillResult): void {
  target.filledFields.push(...extra.filledFields);
  target.emptyFields.push(...extra.emptyFields);
  target.verifiedCount += extra.verifiedCount;
  target.unverifiedCount += extra.unverifiedCount;
  Object.assign(target.fieldValuesSnapshot, extra.fieldValuesSnapshot);
}

/**
 * Fills the step that is currently on screen:
 *   "+ Add" rows -> wait for the DOM to settle -> discover -> snapshot (for Undo) -> fill ->
 *   one follow-up scan for questions revealed by earlier answers.
 */
export async function fillCurrentPage(input: PageFillInput): Promise<PageFillResult> {
  const doc = input.doc ?? document;
  const { adapter, profile, answers } = input;

  try {
    await processDynamicAdditions(doc, profile);
  } catch (err) {
    console.warn('[Odos] Dynamic additions error:', err);
  }

  await waitForSettle(doc.body, 400, 3000);
  const fields = adapter.discoverFields(doc);
  const snapshots = new Map<FormField, FieldSnapshot>();
  for (const f of fields) snapshots.set(f, captureFieldSnapshot(f));

  const engine = { profile, answers, adapterId: adapter.id, semanticMatch: input.semanticMatch };
  const result = await executeAutofill(fields, { ...engine, resumeFile: input.resumeFile });

  try {
    await new Promise((r) => setTimeout(r, FOLLOW_UP_DELAY_MS));
    const known = new Set<Element>(fields.flatMap((f) => [f.element, ...(f.groupElements || []), ...(f.groupButtons || [])]));
    const later = adapter.discoverFields(doc).filter((f) => !known.has(f.element));
    if (later.length > 0) {
      for (const f of later) snapshots.set(f, captureFieldSnapshot(f));
      mergeInto(result, await executeAutofill(later, { ...engine, resumeFile: null }));
      fields.push(...later);
    }
  } catch (err) {
    console.warn('[Odos] Follow-up scan failed:', err);
  }

  return { ...result, fields, snapshots };
}
