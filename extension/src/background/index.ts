import { repository } from '../core/storage/repository';
import { generateDedupeKey } from '../core/dedupe';
import { Job } from '../core/models';
import bundledConfig from '../core/config/bundledConfig.json';

// Automatically seed profile, answers, and resumes from bundled repo YAML on extension install/update
chrome.runtime.onInstalled.addListener(async () => {
  try {
    await repository.syncFromYamlConfig(bundledConfig as any, false);
    console.log('[Odos] Seeded initial data from repo YAML.');
  } catch (err) {
    console.warn('[Odos] Initial YAML seed skipped or error:', err);
  }
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
              hasResumeBlob: Boolean(defaultResumeBlob)
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

          sendResponse({
            success: true,
            data: {
              id: bufferRecord.id,
              fileName: bufferRecord.fileName,
              fileType: bufferRecord.fileType,
              data: bufferRecord.data
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

        case 'SYNC_FROM_REPO_CONFIG': {
          const result = await repository.syncFromYamlConfig(bundledConfig as any, true);
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
