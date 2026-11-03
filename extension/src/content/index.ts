import { findMatchingAdapter, hostsEmbeddedAtsForm } from './adapters';
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
import { waitForSettle } from '../core/dom';
import { buildDiagnostics, diagnosticsToText, logDiagnostics } from '../core/diagnostics';
import { BUILD_ID } from '../core/buildInfo';

console.log(`[Odos] Content script active (build ${BUILD_ID}) on:`, window.location.href);

let currentPanel: ReviewPanelController | null = null;
let currentApplicationId: string | null = null;
let currentAdapterId = '';
let currentFields: FormField[] = [];
let currentSnapshots = new Map<FormField, FieldSnapshot>();
let currentResumeId: string | undefined = undefined;
let submissionRecorded = false;

function extensionVersion(): string {
  try {
    return chrome.runtime?.getManifest?.().version || '';
  } catch {
    return '';
  }
}

function currentDiagnosticsText(): string {
  return diagnosticsToText(buildDiagnostics({ fields: currentFields, adapterId: currentAdapterId, url: window.location.href, version: extensionVersion() }));
}

/**
 * Does this frame hold an application form worth filling? Every frame of the tab receives
 * RUN_ODOS; only frames that pass answer it. A careers page that embeds the ATS in an iframe,
 * or a page with a newsletter box and a search field, must not be "filled".
 */
export function looksLikeApplicationForm(doc: Document): boolean {
  if (hostsEmbeddedAtsForm(doc) && doc.querySelectorAll('input:not([type="hidden"]), select, textarea').length < 6) return false;
  const visible = Array.from(doc.querySelectorAll<HTMLElement>('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="search"]), select, textarea, [role="combobox"]'));
  if (visible.length < 3) return false;
  const hasIdentity = Boolean(
    doc.querySelector('input[type="email"], input[name*="email" i], input[id*="email" i], input[autocomplete="email"], input[type="file"], input[name*="name" i], input[id*="first" i], [data-automation-id*="legalName"], [data-automation-id^="formField-"]')
  );
  return hasIdentity;
}

const w = window as unknown as { __odosContentLoaded?: boolean };
if (!w.__odosContentLoaded) {
  w.__odosContentLoaded = true;
  registerMessageListener();
}

function registerMessageListener(): void {
// Listen for messages from background worker or popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'RUN_ODOS') {
    // Frames without an application form stay silent so the frame that has one answers.
    if (!looksLikeApplicationForm(document)) return false;
    handleRunOdos()
      .then((res) => sendResponse({ success: true, status: res }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // async response
  }

  if (message.type === 'GET_DETECTION') {
    if (window.top !== window && !looksLikeApplicationForm(document)) return false;
    try {
      const detection = detectAts(window.location.href, document);
      sendResponse({ success: true, detection });
    } catch (err: any) {
      sendResponse({ success: false, error: err.message });
    }
    return false;
  }
});
}

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

const SENSITIVE_QUESTION = /password|social security|\bssn\b|date of birth|\bdob\b|credit card|bank|routing|passport number|driver'?s? licen[cs]e number/i;

/**
 * Learning loop on the page itself: when the user answers a field Odos left for review (or
 * corrects one it was unsure of), propose remembering that answer in the panel.
 */
function attachLearningListeners(fields: FormField[], panelRef: () => ReviewPanelController | null): void {
  for (const field of fields) {
    if (field.type === 'file') continue;
    if (!field.label || field.label.trim().split(/\s+/).length < 2 || SENSITIVE_QUESTION.test(field.label)) continue;
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
        if (field.matchedValue && normalizeOptionText(value) === normalizeOptionText(field.matchedValue) && field.status === 'verified') return;
        panelRef()?.proposeAnswer(field, value);
      }, 250);
    };
    for (const t of targets) {
      t.addEventListener('change', onAnswer);
      t.addEventListener('focusout', onAnswer);
      if (field.groupButtons) t.addEventListener('click', onAnswer);
    }
  }
}

async function saveAnswer(input: { question: string; answer: string; answerId?: string; autoFill?: boolean }): Promise<boolean> {
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

  // 4. Discover fields once the page has stopped rendering (static and dynamically added)
  await waitForSettle(document.body, 400, 3000);
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
  currentAdapterId = adapter.id;
  submissionRecorded = false;

  // 7. Execute autofill under the verified-fill contract
  const fillResult = await executeAutofill(fields, {
    profile,
    answers,
    resumeFile,
    adapterId: adapter.id,
    semanticMatch: semanticMatchViaBackground
  });

  // Second pass: answers often reveal follow-up questions ("Yes, I need sponsorship" ->
  // "Which visa?"). Rediscover once and fill anything new.
  try {
    await new Promise((r) => setTimeout(r, 400));
    const known = new Set(fields.map((f) => f.element));
    const later = adapter.discoverFields(document).filter((f) => !known.has(f.element) && !(f.groupElements || []).some((g) => known.has(g)));
    if (later.length > 0) {
      for (const f of later) currentSnapshots.set(f, captureFieldSnapshot(f));
      const more = await executeAutofill(later, { profile, answers, resumeFile: null, adapterId: adapter.id, semanticMatch: semanticMatchViaBackground });
      fields.push(...later);
      fillResult.filledFields.push(...more.filledFields);
      fillResult.emptyFields.push(...more.emptyFields);
      fillResult.unverifiedCount += more.unverifiedCount;
      fillResult.verifiedCount += more.verifiedCount;
      Object.assign(fillResult.fieldValuesSnapshot, more.fieldValuesSnapshot);
    }
  } catch (err) {
    console.warn('[Odos] Follow-up scan failed:', err);
  }
  currentFields = fields;

  // Diagnostics: console summary on every run (collapsed), copyable from the panel.
  logDiagnostics(buildDiagnostics({ fields, adapterId: adapter.id, url: window.location.href, version: extensionVersion() }));

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
    },
    getDiagnostics: currentDiagnosticsText,
    buildId: BUILD_ID
  });
  currentPanel.render();

  // Learn from what the user types into fields Odos could not (or was unsure how to) fill.
  attachLearningListeners([...fillResult.emptyFields, ...fillResult.filledFields.filter((f) => f.status === 'unverified')], () => currentPanel);

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

function markSubmitted(auto = false): void {
  if (!currentApplicationId || submissionRecorded) return;
  submissionRecorded = true;

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
  } else if (auto) {
    // The panel is gone but the application went through: keep what the user typed by hand as
    // draft answers (autoFill off, reviewable in the dashboard) so the next form benefits.
    const edits = collectManualEdits(currentFields, currentSnapshots);
    for (const e of edits) {
      saveAnswer({ question: e.field.label, answer: e.value, autoFill: false });
    }
    if (edits.length > 0) console.log(`[Odos] Saved ${edits.length} hand-typed answer(s) as drafts.`);
  }
}

function setupPostSubmitObserver(adapter: ReturnType<typeof findMatchingAdapter>): void {
  if (!adapter) return;

  const checkConfirmation = () => {
    const url = new URL(window.location.href);
    if (adapter.confirmationDetected(url, document)) {
      markSubmitted(true);
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
