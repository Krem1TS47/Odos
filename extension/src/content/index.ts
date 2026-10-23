import { findMatchingAdapter } from './adapters';
import { executeAutofill } from './autofillEngine';
import { ReviewPanelController } from './ui/panel';
import { detectAts } from '../detect';
import { detectPageCaptcha } from './captcha';

console.log('[Odos] Content script active on:', window.location.href);

let currentPanel: ReviewPanelController | null = null;
let currentApplicationId: string | null = null;
let currentSnapshot: Record<string, string> = {};
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

  // 2. Discover Fields
  const fields = adapter.discoverFields(document);
  if (fields.length === 0) {
    throw new Error('No interactive form fields discovered on this page.');
  }

  // Snapshot initial field values before filling (for Undo capability)
  const initialSnapshot: Record<string, string> = {};
  for (const f of fields) {
    if (f.element instanceof HTMLInputElement || f.element instanceof HTMLTextAreaElement || f.element instanceof HTMLSelectElement) {
      initialSnapshot[f.name || f.id] = f.element.value;
    }
  }

  // 3. Request Profile and Stored Answers from Background (Single request per page: Section 6)
  const bgDataResp = await chrome.runtime.sendMessage({ type: 'GET_PAGE_DATA' });
  if (!bgDataResp?.success) {
    throw new Error(bgDataResp?.error || 'Failed to fetch user data from Odos.');
  }

  const { profile, answers, defaultResume } = bgDataResp.data;

  // 4. Retrieve Resume Binary if available
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

  // 5. Log Application as Prefilled (deduplicated by dedupeKey)
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

  // 6. Execute Autofill with Framework-Safe Setters
  const fillResult = await executeAutofill(fields, {
    profile,
    answers,
    resumeFile
  });

  currentSnapshot = fillResult.fieldValuesSnapshot;

  // 7. Render Review Panel in Closed Shadow DOM
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
    onUndoPrefill: () => {
      for (const f of fillResult.filledFields) {
        if (f.element instanceof HTMLInputElement || f.element instanceof HTMLTextAreaElement || f.element instanceof HTMLSelectElement) {
          f.element.value = initialSnapshot[f.name || f.id] || '';
        }
      }
      if (currentPanel) {
        currentPanel.destroy();
        currentPanel = null;
      }
    }
  });
  currentPanel.render();

  // 8. Attach Post-Submit Observer
  setupPostSubmitObserver(adapter);

  return `Odos prefilled ${fillResult.filledFields.length} fields. Please review and submit.`;
}

function markSubmitted(): void {
  if (!currentApplicationId) return;

  chrome.runtime.sendMessage({
    type: 'LOG_SUBMISSION',
    payload: {
      applicationId: currentApplicationId,
      submittedAnswers: currentSnapshot,
      resumeId: currentResumeId
    }
  });

  if (currentPanel) {
    currentPanel.showSubmittedNotice();
  }
}

function setupPostSubmitObserver(adapter: ReturnType<typeof findMatchingAdapter>): void {
  if (!adapter) return;

  // Check periodically or on mutation if confirmation appeared
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

  // Also check on URL popstate / hashchange
  window.addEventListener('popstate', checkConfirmation, { once: true });
  window.addEventListener('hashchange', checkConfirmation, { once: true });
}
