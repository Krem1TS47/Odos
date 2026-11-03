/**
 * Typed wrappers for every message the content script sends to the background worker.
 * Keeps chrome.runtime calls (and their failure modes) out of the run logic.
 */

import { Application, Job, Profile, StoredAnswer, ResumeMetadata } from '../../core/models';
import { SemanticDecision, SemanticRequest } from '../../core/semantic/types';
import { OdosSettings, DEFAULT_SETTINGS } from '../../core/settings';

export interface PageData {
  profile: Profile;
  answers: StoredAnswer[];
  defaultResume?: ResumeMetadata;
  settings: OdosSettings;
}

export interface ResumeFile {
  fileName: string;
  fileType: string;
  data: ArrayBuffer;
}

/** Carried across a full page load so a multi-page run resumes the same application. */
export interface RunContinuation {
  applicationId: string;
  jobId: string;
  pageIndex: number;
  adapterId: string;
  submittedSoFar: Record<string, string>;
}

async function send<T = any>(message: Record<string, unknown>): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const resp = await chrome.runtime.sendMessage(message);
    return resp ?? { success: false, error: 'No response from Odos background' };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export async function getPageData(): Promise<PageData> {
  const resp = await send<PageData>({ type: 'GET_PAGE_DATA' });
  if (!resp.success || !resp.data) throw new Error(resp.error || 'Failed to fetch user data from Odos.');
  return { ...resp.data, settings: resp.data.settings ?? DEFAULT_SETTINGS };
}

export async function getResumeFile(resumeId: string): Promise<ResumeFile | null> {
  const resp = await send<{ fileName: string; fileType: string; base64Data?: string; data?: ArrayBuffer }>({ type: 'GET_RESUME_BINARY', resumeId });
  if (!resp.success || !resp.data) return null;
  if (resp.data.base64Data) {
    const binary = atob(resp.data.base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { fileName: resp.data.fileName, fileType: resp.data.fileType, data: bytes.buffer };
  }
  if (resp.data.data) return { fileName: resp.data.fileName, fileType: resp.data.fileType, data: resp.data.data };
  return null;
}

export async function logPrefilledApplication(payload: { company?: string; title?: string; url: string; descriptionText?: string; resumeId?: string }): Promise<{ job: Job; application: Application; isDuplicate: boolean }> {
  const resp = await send<{ job: Job; application: Application; isDuplicate: boolean }>({ type: 'LOG_PREFILLED_APPLICATION', payload });
  if (!resp.success || !resp.data) throw new Error(resp.error || 'Failed to log application in local database.');
  return resp.data;
}

export async function getApplicationRecord(applicationId: string, jobId: string): Promise<{ job: Job; application: Application } | null> {
  const resp = await send<{ job: Job; application: Application }>({ type: 'GET_APPLICATION', applicationId, jobId });
  return resp.success && resp.data ? resp.data : null;
}

export function logSubmission(payload: { applicationId: string; submittedAnswers: Record<string, string>; resumeId?: string }): void {
  void send({ type: 'LOG_SUBMISSION', payload });
}

export async function saveAnswer(input: { question: string; answer: string; answerId?: string; autoFill?: boolean }): Promise<boolean> {
  const resp = await send({ type: 'SAVE_ANSWER', payload: input });
  if (!resp.success) console.warn('[Odos] Could not save answer:', resp.error);
  return resp.success;
}

/** Bridges the engine's semantic tier to the background worker's on-device provider. */
export async function semanticMatch(request: SemanticRequest): Promise<SemanticDecision | null> {
  const resp = await send<{ decision: SemanticDecision | null }>({ type: 'SEMANTIC_MATCH', payload: request });
  return resp.success ? (resp.data?.decision ?? null) : null;
}

/** Ask the background to resume this run on the next page load of this tab (60 s window). */
export function armContinuation(continuation: RunContinuation): void {
  void send({ type: 'ARM_CONTINUATION', continuation });
}

export function disarmContinuation(): void {
  void send({ type: 'DISARM_CONTINUATION' });
}
