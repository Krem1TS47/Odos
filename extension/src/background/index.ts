import { repository } from '../core/storage/repository';
import { generateDedupeKey } from '../core/dedupe';
import { Job } from '../core/models';
import bundledConfig from '../core/config/bundledConfig.json';
import { PromptApiProvider, SemanticMatcher, SemanticRequest } from '../core/semantic';
import { loadSettings } from '../core/settings';

// Semantic tier (eng review R6b): the on-device Prompt API is reachable from extension
// contexts, so the content script asks the worker over messaging. Unavailable => null.
const semanticMatcher = new SemanticMatcher(new PromptApiProvider(), { timeoutMs: 2500 });

// Keep the extension's data in step with config/*.yaml (bundled at build time).
//  - First install: seed everything.
//  - Later builds: re-sync automatically when the bundle changed AND the profile has not been
//    edited in the dashboard since the last sync. Otherwise leave it and let the dashboard
//    show the drift banner ("Reload from YAML").
//  - Stored answers always sync by stable id (ans_N); answers learned on pages are untouched.
async function syncBundledConfig(): Promise<void> {
  const bundledAt = (bundledConfig as any).bundledAt as string | undefined;
  const meta = (await chrome.storage.local.get('odos_sync')).odos_sync as { bundledAt?: string; syncedAt?: number } | undefined;
  const updatedAt = await repository.getProfileUpdatedAt();
  const editedSinceSync = Boolean(meta?.syncedAt && updatedAt && Date.parse(updatedAt) > meta.syncedAt + 5000);
  const bundleChanged = !meta || meta.bundledAt !== bundledAt;

  let force = false;
  if (meta && bundleChanged && !editedSinceSync) force = true;

  const result = await repository.syncFromYamlConfig(bundledConfig as any, force);
  if (!result.updated) {
    // Profile kept (user data or dashboard edits): still bring bundled answers up to date.
    for (const ans of (bundledConfig as any).answers || []) {
      await repository.upsertAnswer(ans);
    }
  }
  await chrome.storage.local.set({ odos_sync: { bundledAt, syncedAt: Date.now(), profileSynced: result.updated || meta?.bundledAt === bundledAt } });
  console.log(`[Odos] config sync: ${result.updated ? 'profile+answers synced from YAML' : 'answers synced; profile kept'} (bundle ${bundledAt})`);
}

chrome.runtime.onInstalled.addListener(() => {
  syncBundledConfig().catch((err) => console.warn('[Odos] YAML sync skipped or failed:', err));
});

// ---------------------------------------------------------------------------
// Multi-page continuation: when a step change reloads the page, the content script's run ends.
// The run arms a continuation before advancing; on the next completed load of that tab the
// background sends RUN_ODOS with it, so the same application record continues.
// ---------------------------------------------------------------------------
const CONTINUATION_TTL_MS = 60_000;
const continuationKey = (tabId: number) => `odos_continuation_${tabId}`;

async function armContinuation(tabId: number, continuation: unknown): Promise<void> {
  await chrome.storage.session.set({ [continuationKey(tabId)]: { continuation, expiresAt: Date.now() + CONTINUATION_TTL_MS } });
}

async function resumeContinuation(tabId: number): Promise<void> {
  const key = continuationKey(tabId);
  const stored = (await chrome.storage.session.get(key))[key] as { continuation: unknown; expiresAt: number } | undefined;
  if (!stored) return;
  await chrome.storage.session.remove(key);
  if (Date.now() > stored.expiresAt) return;
  const send = () => chrome.tabs.sendMessage(tabId, { type: 'RUN_ODOS', continuation: stored.continuation });
  try {
    await send();
  } catch {
    // Content script not declared for this host: inject (works while the tab keeps the
    // activeTab grant or the host is in optional permissions), then retry once.
    try {
      await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ['content.js'] });
      await new Promise((r) => setTimeout(r, 300));
      await send();
    } catch (err) {
      console.warn('[Odos] Could not resume the run on the new page:', err);
    }
  }
}

chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'complete') {
    // Give document_idle content scripts a moment to register their listener.
    setTimeout(() => void resumeContinuation(tabId), 800);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.session.remove(continuationKey(tabId));
});

// Handle extension keyboard shortcut (e.g. Alt+Shift+O)
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'run_odos') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'RUN_ODOS' });
      } catch {
        // Fallback for custom domains via activeTab: inject content script on demand
        if (chrome.scripting) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id, allFrames: true },
              files: ['content.js']
            });
            setTimeout(() => {
              if (tab.id) chrome.tabs.sendMessage(tab.id, { type: 'RUN_ODOS' });
            }, 250);
          } catch (injectErr) {
            console.warn('[Odos] On-demand script injection failed:', injectErr);
          }
        }
      }
    }
  }
});

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case 'GET_PAGE_DATA': {
          const profile = await repository.getProfile();
          const answers = await repository.listAnswers();
          const defaultResumeMeta = profile.resumes.find((r) => r.isDefault) || profile.resumes[0];

          let defaultResumeBlob = null;
          if (defaultResumeMeta) {
            defaultResumeBlob = await repository.getResumeBlob(defaultResumeMeta.id);
          }

          sendResponse({
            success: true,
            data: {
              profile,
              answers,
              defaultResume: defaultResumeMeta,
              hasResumeBlob: Boolean(defaultResumeBlob),
              settings: await loadSettings()
            }
          });
          break;
        }

        case 'GET_RESUME_BINARY': {
          const resumeId = message.resumeId;
          const bufferRecord = await repository.getResumeBuffer(resumeId);
          if (!bufferRecord) {
            sendResponse({ success: false, error: 'Resume not found' });
            return;
          }

          // Convert ArrayBuffer to Base64 string for safe Chrome MV3 IPC messaging
          const bytes = new Uint8Array(bufferRecord.data);
          let binary = '';
          const len = bytes.byteLength;
          for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64 = btoa(binary);

          sendResponse({
            success: true,
            data: {
              id: bufferRecord.id,
              fileName: bufferRecord.fileName,
              fileType: bufferRecord.fileType,
              base64Data: base64
            }
          });
          break;
        }

        case 'LOG_PREFILLED_APPLICATION': {
          const { company, title, url, descriptionText } = message.payload;
          const dedupeKey = generateDedupeKey(company, title, url);

          let job = await repository.findJobByDedupeKey(dedupeKey);
          let isDuplicate = false;

          if (!job) {
            const newJob: Job = {
              id: crypto.randomUUID(),
              company,
              title,
              url,
              descriptionText: descriptionText || '',
              firstSeenAt: new Date().toISOString(),
              dedupeKey
            };
            await repository.upsertJob(newJob);
            job = newJob;
          } else {
            isDuplicate = true;
          }

          let app = await repository.getApplicationByJobId(job.id);
          if (!app) {
            app = await repository.createPrefilledApplication(job.id, message.payload.resumeId);
          }

          sendResponse({ success: true, data: { job, application: app, isDuplicate } });
          break;
        }

        case 'LOG_SUBMISSION': {
          const { applicationId, submittedAnswers, resumeId } = message.payload;
          const updated = await repository.markApplicationSubmitted(applicationId, submittedAnswers, resumeId);
          sendResponse({ success: true, data: { application: updated } });
          break;
        }

        case 'GET_APPLICATION': {
          const application = await repository.getApplication(message.applicationId);
          const job = await repository.getJob(message.jobId);
          sendResponse(application && job ? { success: true, data: { application, job } } : { success: false, error: 'Application not found' });
          break;
        }

        case 'ARM_CONTINUATION': {
          const tabId = _sender.tab?.id;
          if (tabId !== undefined) await armContinuation(tabId, message.continuation);
          sendResponse({ success: tabId !== undefined });
          break;
        }

        case 'DISARM_CONTINUATION': {
          const tabId = _sender.tab?.id;
          if (tabId !== undefined) await chrome.storage.session.remove(continuationKey(tabId));
          sendResponse({ success: true });
          break;
        }

        case 'SAVE_ANSWER': {
          const { question, answer, answerId, category, autoFill } = message.payload || {};
          const saved = await repository.rememberAnswer({ question, answer, answerId, category, autoFill });
          sendResponse({ success: true, data: { answer: saved } });
          break;
        }

        case 'SEMANTIC_MATCH': {
          const request = message.payload as SemanticRequest;
          const decision = await semanticMatcher.match(request);
          sendResponse({ success: true, data: { decision, provider: semanticMatcher.providerId } });
          break;
        }

        case 'SEMANTIC_STATUS': {
          const available = await semanticMatcher.isAvailable();
          sendResponse({ success: true, data: { available, provider: semanticMatcher.providerId } });
          break;
        }

        case 'SYNC_FROM_REPO_CONFIG': {
          const result = await repository.syncFromYamlConfig(bundledConfig as any, true);
          await chrome.storage.local.set({ odos_sync: { bundledAt: (bundledConfig as any).bundledAt, syncedAt: Date.now(), profileSynced: true } });
          const updatedProfile = await repository.getProfile();
          const updatedAnswers = await repository.listAnswers();
          sendResponse({
            success: true,
            data: {
              profile: updatedProfile,
              answers: updatedAnswers,
              syncedAnswersCount: result.answersCount,
              hasResume: result.hasResume,
              bundledAt: (bundledConfig as any).bundledAt
            }
          });
          break;
        }

        case 'INJECT_CONTENT_SCRIPT': {
          const tabId = message.tabId;
          if (chrome.scripting && tabId) {
            await chrome.scripting.executeScript({
              target: { tabId, allFrames: true },
              files: ['content.js']
            });
            sendResponse({ success: true });
          } else {
            sendResponse({ success: false, error: 'Scripting API not available or tabId missing' });
          }
          break;
        }

        default:
          sendResponse({ success: false, error: `Unknown message type: ${message.type}` });
      }
    } catch (err: any) {
      console.error('[Odos Background Error]', err);
      sendResponse({ success: false, error: err.message });
    }
  })();

  return true; // Keep message port open for async response
});
