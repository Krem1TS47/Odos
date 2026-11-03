/**
 * Content script entry point: registers the message listener once per frame and hands work to
 * ApplicationRun. All logic lives in ./run/*.
 */

import { detectAts } from '../detect';
import { BUILD_ID } from '../core/buildInfo';
import { ApplicationRun } from './run/applicationRun';
import { looksLikeApplicationForm } from './run/frameGate';
import { RunContinuation } from './run/messaging';

let activeRun: ApplicationRun | null = null;

async function runOdos(continuation?: RunContinuation): Promise<string> {
  if (activeRun?.isRunning) return 'Odos is already working on this page.';
  activeRun?.cancel();
  activeRun = new ApplicationRun();
  return activeRun.start(continuation);
}

function registerMessageListener(): void {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'RUN_ODOS') {
      // Frames without an application form stay silent so the frame that has one answers.
      if (!looksLikeApplicationForm(document)) return false;
      runOdos(message.continuation)
        .then((status) => sendResponse({ success: true, status }))
        .catch((err) => sendResponse({ success: false, error: err?.message || String(err) }));
      return true;
    }

    if (message.type === 'GET_DETECTION') {
      if (window.top !== window && !looksLikeApplicationForm(document)) return false;
      try {
        sendResponse({ success: true, detection: detectAts(window.location.href, document) });
      } catch (err: any) {
        sendResponse({ success: false, error: err.message });
      }
      return false;
    }
    return false;
  });
}

const w = window as unknown as { __odosContentLoaded?: boolean };
if (!w.__odosContentLoaded) {
  w.__odosContentLoaded = true;
  console.log(`[Odos] Content script active (build ${BUILD_ID}) on:`, window.location.href);
  registerMessageListener();
}
