import { findMatchingAdapter } from './adapters';
import { FormField } from './adapters/types';
import { executeAutofill, fillFieldWithValue } from './autofillEngine';
import { ReviewPanelController, ManualEdit } from './ui/panel';
import { detectAts } from '../detect';
import { detectPageCaptcha } from './captcha';
import { processDynamicAdditions } from '../core/repeatableManager';
import { captureFieldSnapshot, FieldSnapshot, readDisplayedValue, restoreField, FillOutcome } from '../core/filler';
import { resolveDictionaryHint } from '../core/fieldSchema';
import { SemanticDecision, SemanticRequest } from '../core/semantic/types';
import { normalizeOptionText } from '../core/dropdownResolver';

console.log('[Odos] Content script active on:', window.location.href);

let currentPanel: ReviewPanelController | null = null;
let currentApplicationId: string | null = null;
let currentFields: FormField[] = [];
let currentSnapshots = new Map<FormField, FieldSnapshot>();
let currentResumeId: string | undefined = undefined;

// Listen for messages from background worker or popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'RUN_ODOS') {
    handleRunOdos()
      .then((res) => sendResponse({ success: true, status: res }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // async response
  }

  if (message.type === 'GET_DETECTION') {
    try {
      const detection = detectAts(window.location.href, document);
      sendResponse({ success: true, detection });
    } catch (err: any) {
      sendResponse({ success: false, error: err.message });
    }
    return false;
  }
});

/**
 * Bridges the engine's semantic tier to the background worker's on-device provider.
 */
async function semanticMatchViaBackground(request: SemanticRequest): Promise<SemanticDecision | null> {
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'SEMANTIC_MATCH', payload: request });
    return resp?.success ? (resp.data?.decision ?? null) : null;
  } catch {
    return null;
  }
}

/**
 * Reads the value a field currently shows, for submission records and manual-edit capture.
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
    case 'combobox':
      return readDisplayedValue(el, field.trigger);
    case 'file':
      return (el as HTMLInputElement).files?.[0]?.name || '';
    default:
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value;
      return (el.textContent || '').trim();
  }
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

async function saveAnswer(input: { question: string; answer: string; answerId?: string }): Promise<boolean> {
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'SAVE_ANSWER', payload: input });
    return Boolean(resp?.success);
  } catch (err) {
    console.warn('[Odos] Could not save answer:', err);
    return false;
  }
}

export async function handleRunOdos(): Promise<string> {
  const currentUrl = new URL(window.location.href);
  const adapter = findMatchingAdapter(currentUrl, document);

  if (!adapter) {
    throw new Error('No supported ATS form detected on this page.');
  }

  // Detect ATS scoring & CAPTCHA status
  const detection = detectAts(window.location.href, document);
  const captcha = adapter.detectCaptcha ? adapter.detectCaptcha(document) : detectPageCaptcha(document);

  // 1. Extract Job Details
  const jobPartial = adapter.extractJob(document, currentUrl);

  // 2. Request Profile and Stored Answers from Background (single request per page)
  const bgDataResp = await chrome.runtime.sendMessage({ type: 'GET_PAGE_DATA' });
  if (!bgDataResp?.success) {
    throw new Error(bgDataResp?.error || 'Failed to fetch user data from Odos.');
  }

  const { profile, answers, defaultResume } = bgDataResp.data;

  // 3. Repeatable sections ("+ Add Education" ...) exactly once, before discovery, so the
  //    new rows are discovered and filled in this run (eng review R9).
  try {
    await processDynamicAdditions(document, profile);
  } catch (err) {
    console.warn('[Odos] Dynamic additions error:', err);
  }

  // 4. Discover fields (static and dynamically added)
  const fields = adapter.discoverFields(document);
  if (fields.length === 0) {
    throw new Error('No interactive form fields discovered on this page.');
  }
  currentFields = fields;

  // Snapshot every field so Undo can reverse each type (eng review R13)
  currentSnapshots = new Map();
  for (const f of fields) {
    currentSnapshots.set(f, captureFieldSnapshot(f));
  }

  // 5. Retrieve resume binary if available
  let resumeFile: { fileName: string; fileType: string; data: ArrayBuffer } | null = null;
  if (defaultResume?.id) {
    currentResumeId = defaultResume.id;
    const binResp = await chrome.runtime.sendMessage({
      type: 'GET_RESUME_BINARY',
      resumeId: defaultResume.id
    });
    if (binResp?.success && binResp.data?.base64Data) {
      const binaryString = atob(binResp.data.base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      resumeFile = {
        fileName: binResp.data.fileName,
        fileType: binResp.data.fileType,
        data: bytes.buffer
      };
    } else if (binResp?.success && binResp.data?.data) {
      resumeFile = {
        fileName: binResp.data.fileName,
        fileType: binResp.data.fileType,
        data: binResp.data.data
      };
    }
  }

  // 6. Log application as prefilled (deduplicated by dedupeKey)
  const logResp = await chrome.runtime.sendMessage({
    type: 'LOG_PREFILLED_APPLICATION',
    payload: {
      company: jobPartial.company,
      title: jobPartial.title,
      url: jobPartial.url || window.location.href,
      descriptionText: jobPartial.descriptionText,
      resumeId: currentResumeId
    }
  });

  if (!logResp?.success) {
    throw new Error(logResp?.error || 'Failed to log application in local database.');
  }

  const { job, application, isDuplicate } = logResp.data;
  currentApplicationId = application.id;

  // 7. Execute autofill under the verified-fill contract
  const fillResult = await executeAutofill(fields, {
    profile,
    answers,
    resumeFile,
    adapterId: adapter.id,
    semanticMatch: semanticMatchViaBackground
  });

  // 8. Render review panel in closed shadow DOM
  if (currentPanel) {
    currentPanel.destroy();
  }

  currentPanel = new ReviewPanelController({
    job,
    application,
    detection,
    atsName: adapter.name,
    filledFields: fillResult.filledFields,
    emptyFields: fillResult.emptyFields,
    captcha,
    isDuplicate,
    onConfirmSubmitted: () => {
      markSubmitted();
    },
    onUndoPrefill: async () => {
      for (const f of fillResult.filledFields) {
        const snap = currentSnapshots.get(f);
        if (!snap) continue;
        try {
          await restoreField(f, snap);
          f.status = undefined;
          f.matchedValue = undefined;
        } catch (err) {
          console.warn('[Odos] Undo failed for field', f.label, err);
        }
      }
      if (currentPanel) {
        currentPanel.destroy();
        currentPanel = null;
      }
    },
    onFillField: async (field: FormField, value: string, remember: boolean): Promise<FillOutcome> => {
      const hint = resolveDictionaryHint(field.canonical, undefined, field.label);
      const outcome = await fillFieldWithValue(field, value, hint);
      field.status = outcome.status;
      field.statusReason = outcome.reason;
      if (outcome.status === 'verified' || outcome.status === 'unverified') {
        field.matchedValue = outcome.value;
        field.source = 'manual';
        field.suggestion = undefined;
      }
      if (remember && field.label) {
        await saveAnswer({ question: field.label, answer: value, answerId: field.answerId });
      }
      return outcome;
    },
    getManualEdits: () => collectManualEdits(currentFields, currentSnapshots),
    onSaveAnswers: async (edits: ManualEdit[]) => {
      for (const e of edits) {
        await saveAnswer({ question: e.field.label, answer: e.value });
      }
    }
  });
  currentPanel.render();

  // 9. Attach post-submit observer
  setupPostSubmitObserver(adapter);

  const check = fillResult.unverifiedCount > 0 ? ` (${fillResult.unverifiedCount} to check)` : '';
  return `Odos prefilled ${fillResult.filledFields.length} fields${check}. Please review and submit.`;
}

function currentSubmissionSnapshot(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of currentFields) {
    const v = readFieldValue(f);
    if (v) out[f.name || f.id] = v;
  }
  return out;
}

function markSubmitted(): void {
  if (!currentApplicationId) return;

  chrome.runtime.sendMessage({
    type: 'LOG_SUBMISSION',
    payload: {
      applicationId: currentApplicationId,
      submittedAnswers: currentSubmissionSnapshot(),
      resumeId: currentResumeId
    }
  });

  if (currentPanel) {
    currentPanel.showSubmittedNotice();
  }
}

function setupPostSubmitObserver(adapter: ReturnType<typeof findMatchingAdapter>): void {
  if (!adapter) return;

  const checkConfirmation = () => {
    const url = new URL(window.location.href);
    if (adapter.confirmationDetected(url, document)) {
      markSubmitted();
      observer.disconnect();
    }
  };

  const observer = new MutationObserver(() => {
    checkConfirmation();
  });

  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('popstate', checkConfirmation, { once: true });
  window.addEventListener('hashchange', checkConfirmation, { once: true });
}
