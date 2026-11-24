import { OdosDatabase, db as defaultDb } from './db';
import {
  Profile,
  ProfileSchema,
  DEFAULT_PROFILE,
  StoredAnswer,
  StoredAnswerCategory,
  Job,
  JobSchema,
  Application,
  ApplicationSchema,
  ApplicationStatus,
  ApplicationEvent,
  ApplicationAudit,
  ApplicationAuditSchema
} from '../models';
import { canonicalizeJobUrl, isSameJobUrl, generateDedupeKey } from '../dedupe';

async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer();
  }
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

export interface ProfileLoadStatus {
  ok: boolean;
  /** Human-readable reason when the stored profile could not be parsed. */
  issue: string | null;
  /** Schema version found in storage (undefined when nothing stored). */
  storedVersion?: number;
}

export class StorageRepository {
  private db: OdosDatabase;
  private profileLoadStatus: ProfileLoadStatus = { ok: true, issue: null };

  constructor(customDb?: OdosDatabase) {
    this.db = customDb || defaultDb;
  }

  /**
   * Result of the most recent getProfile() parse. A failed parse never overwrites storage;
   * the dashboard shows a banner instead of silently presenting an empty profile.
   */
  getProfileLoadStatus(): ProfileLoadStatus {
    return this.profileLoadStatus;
  }

  // ==========================================
  // PROFILE OPERATIONS
  // ==========================================

  async getProfile(): Promise<Profile> {
    const record = await this.db.profile.get('current');
    if (!record) {
      this.profileLoadStatus = { ok: true, issue: null };
      return DEFAULT_PROFILE;
    }
    const validated = ProfileSchema.safeParse(record.profile);
    const storedVersion = (record.profile as any)?.schemaVersion;
    if (validated.success) {
      this.profileLoadStatus = { ok: true, issue: null, storedVersion };
      return validated.data;
    }
    const firstIssue = validated.error.issues[0];
    this.profileLoadStatus = {
      ok: false,
      storedVersion,
      issue: `Stored profile (schema v${storedVersion ?? '?'}) could not be read: ${firstIssue ? `${firstIssue.path.join('.')} ${firstIssue.message}` : 'invalid shape'}. It was left untouched; saving will overwrite it.`
    };
    console.warn('[Odos] Stored profile failed validation; using defaults without overwriting storage.', validated.error);
    return DEFAULT_PROFILE;
  }

  /** When the stored profile was last written (dashboard save or YAML sync). */
  async getProfileUpdatedAt(): Promise<string | null> {
    const record = await this.db.profile.get('current');
    return record?.updatedAt ?? null;
  }

  async saveProfile(profile: Profile): Promise<void> {
    const validated = ProfileSchema.parse(profile);
    await this.db.profile.put({
      key: 'current',
      profile: validated,
      updatedAt: new Date().toISOString()
    });
  }

  async syncFromYamlConfig(
    config: {
      profile: Profile;
      answers: StoredAnswer[];
      defaultResume?: { fileName: string; fileType: string; dataBase64: string };
    },
    force = false
  ): Promise<{ updated: boolean; answersCount: number; hasResume: boolean }> {
    const current = await this.getProfile();
    const hasData = current.contact.fullName !== '' || current.contact.email !== '';

    if (hasData && !force) {
      return { updated: false, answersCount: 0, hasResume: false };
    }

    // 1. Save Profile (keep resumes already uploaded through the dashboard)
    const keepResumes = current.resumes;
    await this.saveProfile({ ...ProfileSchema.parse(config.profile), resumes: keepResumes });

    // 2. Save Stored Answers
    for (const ans of config.answers) {
      await this.upsertAnswer(ans);
    }

    // 3. Save Resume if provided (skip when a resume with the same file name already exists,
    //    so repeated syncs do not pile up copies)
    let hasResume = false;
    const existingResumes = (await this.getProfile()).resumes;
    if (config.defaultResume && existingResumes.some((r) => r.fileName === config.defaultResume!.fileName)) {
      hasResume = true;
    } else if (config.defaultResume && config.defaultResume.dataBase64) {
      try {
        const binaryStr = atob(config.defaultResume.dataBase64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: config.defaultResume.fileType || 'application/pdf' });
        await this.saveResume(blob, {
          label: config.defaultResume.fileName.replace(/\.[^/.]+$/, ''),
          fileName: config.defaultResume.fileName,
          fileType: config.defaultResume.fileType,
          isDefault: true
        });
        hasResume = true;
      } catch (err) {
        console.warn('[Odos] Could not decode bundled resume binary:', err);
      }
    }

    return { updated: true, answersCount: config.answers.length, hasResume };
  }

  async saveResume(
    blob: Blob,
    metadata: { label: string; fileName: string; fileType?: string; isDefault?: boolean }
  ): Promise<string> {
    const id = crypto.randomUUID();
    const currentProfile = await this.getProfile();

    const resumeMetadata = {
      id,
      label: metadata.label,
      fileName: metadata.fileName,
      fileType: metadata.fileType || blob.type || 'application/pdf',
      fileSize: blob.size,
      isDefault: metadata.isDefault ?? currentProfile.resumes.length === 0,
      uploadedAt: new Date().toISOString()
    };

    if (resumeMetadata.isDefault) {
      currentProfile.resumes.forEach((r) => (r.isDefault = false));
    }

    currentProfile.resumes.push(resumeMetadata);

    const arrayBuffer = await blobToArrayBuffer(blob);

    await this.db.transaction('rw', [this.db.profile, this.db.resumeBlobs], async () => {
      await this.saveProfile(currentProfile);
      await this.db.resumeBlobs.put({
        id,
        data: arrayBuffer,
        fileName: resumeMetadata.fileName,
        fileType: resumeMetadata.fileType
      });
    });

    return id;
  }

  async getResumeBlob(id: string): Promise<{ id: string; blob: Blob; fileName: string; fileType: string } | undefined> {
    const record = await this.db.resumeBlobs.get(id);
    if (!record) return undefined;
    const blob = new Blob([record.data], { type: record.fileType });
    return {
      id: record.id,
      blob,
      fileName: record.fileName,
      fileType: record.fileType
    };
  }

  async getResumeBuffer(id: string): Promise<{ id: string; data: ArrayBuffer; fileName: string; fileType: string } | undefined> {
    const record = await this.db.resumeBlobs.get(id);
    if (!record) return undefined;
    return {
      id: record.id,
      data: record.data,
      fileName: record.fileName,
      fileType: record.fileType
    };
  }

  async deleteResume(id: string): Promise<void> {
    const profile = await this.getProfile();
    profile.resumes = profile.resumes.filter((r) => r.id !== id);

    if (profile.resumes.length > 0 && !profile.resumes.some((r) => r.isDefault)) {
      profile.resumes[0].isDefault = true;
    }

    await this.db.transaction('rw', [this.db.profile, this.db.resumeBlobs], async () => {
      await this.saveProfile(profile);
      await this.db.resumeBlobs.delete(id);
    });
  }

  async setDefaultResume(id: string): Promise<void> {
    const profile = await this.getProfile();
    profile.resumes.forEach((r) => {
      r.isDefault = r.id === id;
    });
    await this.saveProfile(profile);
  }

  // ==========================================
  // STORED ANSWERS OPERATIONS
  // ==========================================

  async listAnswers(category?: StoredAnswerCategory): Promise<StoredAnswer[]> {
    if (category) {
      return this.db.answers.where('category').equals(category).toArray();
    }
    return this.db.answers.toArray();
  }

  async getAnswer(id: string): Promise<StoredAnswer | undefined> {
    return this.db.answers.get(id);
  }

  async upsertAnswer(answer: StoredAnswer): Promise<string> {
    await this.db.answers.put(answer);
    return answer.id;
  }

  async deleteAnswer(id: string): Promise<void> {
    await this.db.answers.delete(id);
  }

  /**
   * Adds a question pattern to an existing answer (deduplicated, case-insensitive).
   */
  async addPatternToAnswer(id: string, pattern: string): Promise<StoredAnswer | undefined> {
    const existing = await this.db.answers.get(id);
    if (!existing) return undefined;
    const norm = pattern.trim().toLowerCase();
    if (!norm) return existing;
    if (!existing.questionPatterns.some((p) => p.trim().toLowerCase() === norm)) {
      existing.questionPatterns = [...existing.questionPatterns, pattern.trim()];
      await this.db.answers.put(existing);
    }
    return existing;
  }

  /**
   * Learning loop entry point: remembers an answer for a question seen on a form.
   * With `answerId`, the question becomes another pattern of that answer; otherwise a new
   * stored answer is created (or an identical existing answer gains the pattern).
   */
  async rememberAnswer(input: {
    question: string;
    answer: string;
    answerId?: string;
    category?: StoredAnswerCategory;
    autoFill?: boolean;
  }): Promise<StoredAnswer> {
    const question = input.question.trim();
    const answerText = input.answer.trim();
    if (!question || !answerText) throw new Error('Question and answer are required');

    if (input.answerId) {
      const updated = await this.addPatternToAnswer(input.answerId, question);
      if (updated) return updated;
    }

    const all = await this.db.answers.toArray();
    const same = all.find((a) => a.answer.trim().toLowerCase() === answerText.toLowerCase() && (!input.category || a.category === input.category));
    if (same) {
      const updated = await this.addPatternToAnswer(same.id, question);
      if (updated) return updated;
    }

    const created: StoredAnswer = {
      id: crypto.randomUUID(),
      questionPatterns: [question],
      category: input.category || guessAnswerCategory(question),
      answer: answerText,
      autoFill: input.autoFill ?? true
    };
    await this.db.answers.put(created);
    return created;
  }

  /**
   * Find matching stored answer by checking pattern inclusion or equality.
   */
  async findMatchingAnswer(questionText: string): Promise<StoredAnswer | null> {
    const normQ = questionText.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim();
    const answers = await this.db.answers.toArray();

    for (const ans of answers) {
      for (const pattern of ans.questionPatterns) {
        const normPattern = pattern.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim();
        if (normQ === normPattern || normQ.includes(normPattern) || normPattern.includes(normQ)) {
          return ans;
        }
      }
    }
    return null;
  }

  // ==========================================
  // JOBS & APPLICATIONS OPERATIONS
  // ==========================================

  async getJob(id: string): Promise<Job | undefined> {
    return this.db.jobs.get(id);
  }

  async findJobByDedupeKey(dedupeKey: string): Promise<Job | undefined> {
    return this.db.jobs.where('dedupeKey').equals(dedupeKey).first();
  }

  async upsertJob(job: Job): Promise<string> {
    const validated = JobSchema.parse(job);
    await this.db.jobs.put(validated);
    return validated.id;
  }

  async listJobs(): Promise<Job[]> {
    return this.db.jobs.orderBy('firstSeenAt').reverse().toArray();
  }

  async getApplication(id: string): Promise<Application | undefined> {
    return this.db.applications.get(id);
  }

  async getApplicationByJobId(jobId: string): Promise<Application | undefined> {
    return this.db.applications.where('jobId').equals(jobId).first();
  }

  async createPrefilledApplication(jobId: string, resumeId?: string): Promise<Application> {
    const app: Application = {
      id: crypto.randomUUID(),
      jobId,
      status: 'prefilled',
      resumeId,
      prefilledAt: new Date().toISOString(),
      submittedAnswers: {},
      notes: '',
      events: [
        {
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          type: 'status_change',
          data: { from: null, to: 'prefilled' }
        }
      ]
    };

    const validated = ApplicationSchema.parse(app);
    await this.db.applications.put(validated);
    return validated;
  }

  async updateApplicationStatus(
    id: string,
    newStatus: ApplicationStatus,
    note?: string
  ): Promise<Application> {
    const app = await this.db.applications.get(id);
    if (!app) {
      throw new Error(`Application ${id} not found`);
    }

    const previousStatus = app.status;
    app.status = newStatus;
    if (newStatus === 'submitted' && !app.submittedAt) {
      app.submittedAt = new Date().toISOString();
    }

    const event: ApplicationEvent = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      type: 'status_change',
      data: { from: previousStatus, to: newStatus, note }
    };
    app.events.push(event);

    if (note) {
      app.notes = app.notes ? `${app.notes}\n${note}` : note;
    }

    const validated = ApplicationSchema.parse(app);
    await this.db.applications.put(validated);

    if (newStatus === 'submitted') {
      try {
        const job = await this.db.jobs.get(app.jobId);
        if (job) {
          await this.recordApplicationAudit({
            url: job.url,
            company: job.company,
            title: job.title,
            appliedAt: app.submittedAt || new Date().toISOString(),
            applicationId: app.id,
            jobId: job.id,
            source: 'manual'
          });
        }
      } catch (auditErr) {
        console.warn('[Odos] Failed to record application audit entry on status update:', auditErr);
      }
    }

    return validated;
  }

  async markApplicationSubmitted(
    id: string,
    submittedAnswers: Record<string, string>,
    resumeId?: string
  ): Promise<Application> {
    const app = await this.db.applications.get(id);
    if (!app) {
      throw new Error(`Application ${id} not found`);
    }

    const previousStatus = app.status;
    app.status = 'submitted';
    app.submittedAt = new Date().toISOString();
    app.submittedAnswers = submittedAnswers;
    if (resumeId) app.resumeId = resumeId;

    app.events.push({
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      type: 'status_change',
      data: { from: previousStatus, to: 'submitted', snapshotCount: Object.keys(submittedAnswers).length }
    });

    const validated = ApplicationSchema.parse(app);
    await this.db.applications.put(validated);

    try {
      const job = await this.db.jobs.get(app.jobId);
      if (job) {
        await this.recordApplicationAudit({
          url: job.url,
          company: job.company,
          title: job.title,
          appliedAt: app.submittedAt || new Date().toISOString(),
          applicationId: app.id,
          jobId: job.id,
          source: 'extension'
        });
      }
    } catch (auditErr) {
      console.warn('[Odos] Failed to record application audit entry on submit:', auditErr);
    }

    return validated;
  }

  async addApplicationNote(id: string, noteText: string): Promise<Application> {
    const app = await this.db.applications.get(id);
    if (!app) {
      throw new Error(`Application ${id} not found`);
    }

    app.notes = app.notes ? `${app.notes}\n${noteText}` : noteText;
    app.events.push({
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      type: 'note',
      data: { note: noteText }
    });

    const validated = ApplicationSchema.parse(app);
    await this.db.applications.put(validated);
    return validated;
  }

  async listApplications(): Promise<Application[]> {
    return this.db.applications.orderBy('prefilledAt').reverse().toArray();
  }

  // ==========================================
  // AUDIT OPERATIONS (Applied Links / Duplicates)
  // ==========================================

  async recordApplicationAudit(
    audit: Partial<ApplicationAudit> & { url: string; company: string; title: string }
  ): Promise<ApplicationAudit> {
    const canonicalUrl = audit.canonicalUrl || canonicalizeJobUrl(audit.url);
    const existing = await this.db.applicationAudits.where('canonicalUrl').equals(canonicalUrl).first();

    const record: ApplicationAudit = {
      id: existing?.id || audit.id || crypto.randomUUID(),
      url: audit.url,
      canonicalUrl,
      company: audit.company.trim(),
      title: audit.title.trim(),
      appliedAt: audit.appliedAt || new Date().toISOString(),
      applicationId: audit.applicationId || existing?.applicationId,
      jobId: audit.jobId || existing?.jobId,
      source: audit.source || existing?.source || 'extension',
      notes: audit.notes ?? existing?.notes ?? ''
    };

    const validated = ApplicationAuditSchema.parse(record);
    await this.db.applicationAudits.put(validated);
    return validated;
  }

  async findAuditByUrl(url: string): Promise<ApplicationAudit | undefined> {
    if (!url) return undefined;
    const canonical = canonicalizeJobUrl(url);
    const byCanonical = await this.db.applicationAudits.where('canonicalUrl').equals(canonical).first();
    if (byCanonical) return byCanonical;

    // Fallback: check across all audits if any match using isSameJobUrl
    const all = await this.db.applicationAudits.toArray();
    return all.find((a) => isSameJobUrl(a.url, url) || isSameJobUrl(a.canonicalUrl, url));
  }

  async checkDuplicateApplication(params: {
    url: string;
    company?: string;
    title?: string;
  }): Promise<{ isDuplicate: boolean; audit?: ApplicationAudit; application?: Application; job?: Job }> {
    if (!params.url) return { isDuplicate: false };

    // 1. Check applicationAudits
    const audit = await this.findAuditByUrl(params.url);
    if (audit) {
      let app: Application | undefined;
      let job: Job | undefined;
      if (audit.applicationId) app = await this.db.applications.get(audit.applicationId);
      if (audit.jobId) job = await this.db.jobs.get(audit.jobId);
      return { isDuplicate: true, audit, application: app, job };
    }

    // 2. Check submitted applications in applications table
    const targetCanonical = canonicalizeJobUrl(params.url);
    const allJobs = await this.db.jobs.toArray();
    for (const j of allJobs) {
      if (isSameJobUrl(j.url, params.url) || canonicalizeJobUrl(j.url) === targetCanonical) {
        const app = await this.getApplicationByJobId(j.id);
        if (app && app.status === 'submitted') {
          // Found an already submitted application; auto-record an audit entry
          const newAudit = await this.recordApplicationAudit({
            url: j.url,
            company: j.company,
            title: j.title,
            appliedAt: app.submittedAt || app.prefilledAt,
            applicationId: app.id,
            jobId: j.id,
            source: 'auto_detection'
          });
          return { isDuplicate: true, audit: newAudit, application: app, job: j };
        }
      }
    }

    // 3. If company and title are provided, check dedupe key
    if (params.company && params.title) {
      const dedupeKey = generateDedupeKey(params.company, params.title, params.url);
      const jobByKey = await this.findJobByDedupeKey(dedupeKey);
      if (jobByKey) {
        const app = await this.getApplicationByJobId(jobByKey.id);
        if (app && app.status === 'submitted') {
          const newAudit = await this.recordApplicationAudit({
            url: jobByKey.url,
            company: jobByKey.company,
            title: jobByKey.title,
            appliedAt: app.submittedAt || app.prefilledAt,
            applicationId: app.id,
            jobId: jobByKey.id,
            source: 'auto_detection'
          });
          return { isDuplicate: true, audit: newAudit, application: app, job: jobByKey };
        }
      }
    }

    return { isDuplicate: false };
  }

  async listApplicationAudits(): Promise<ApplicationAudit[]> {
    return this.db.applicationAudits.orderBy('appliedAt').reverse().toArray();
  }

  async deleteApplicationAudit(id: string): Promise<void> {
    await this.db.applicationAudits.delete(id);
  }

  async clearApplicationAudits(): Promise<void> {
    await this.db.applicationAudits.clear();
  }

  // ==========================================
  // WIPE ALL DATA
  // ==========================================

  async wipeAllData(): Promise<void> {
    await this.db.transaction(
      'rw',
      [this.db.jobs, this.db.applications, this.db.profile, this.db.answers, this.db.resumeBlobs, this.db.applicationAudits],
      async () => {
        await this.db.jobs.clear();
        await this.db.applications.clear();
        await this.db.profile.clear();
        await this.db.answers.clear();
        await this.db.resumeBlobs.clear();
        await this.db.applicationAudits.clear();
      }
    );
  }
}

/**
 * Guesses a stored-answer category from the question text.
 */
export function guessAnswerCategory(question: string): StoredAnswerCategory {
  const q = question.toLowerCase();
  if (/authori[sz]|sponsor|visa|eligib|legally|work permit|citizen/.test(q)) return 'eligibility';
  if (/gender|race|ethnic|veteran|disabilit|pronoun|sexual orientation/.test(q)) return 'demographic';
  if (/why|motivat|interest|tell us|describe|what excites|cover letter/.test(q)) return 'motivation';
  if (/hear about|start date|availability|notice|salary|relocat|remote|location|travel|hours|schedule|phone type/.test(q)) return 'logistics';
  return 'other';
}

export interface YamlDriftReport {
  drifted: boolean;
  differences: string[];
}

/**
 * Compares stored data with the bundled config/*.yaml so the dashboard can say when the
 * extension is filling from older data than the files on disk.
 */
export function compareWithBundled(
  stored: Profile,
  storedAnswers: StoredAnswer[],
  bundled: { profile: Profile; answers: StoredAnswer[]; defaultResume?: { fileName: string } | null }
): YamlDriftReport {
  const b = ProfileSchema.parse(bundled.profile);
  const differences: string[] = [];
  const c1 = stored.contact;
  const c2 = b.contact;
  for (const k of ['firstName', 'lastName', 'email', 'phone', 'location', 'linkedin', 'github', 'website'] as const) {
    if ((c1[k] || '') !== (c2[k] || '')) differences.push(`contact.${k}`);
  }
  if (JSON.stringify(stored.workAuthorization) !== JSON.stringify(b.workAuthorization)) differences.push('work authorization');
  const schools = (p: Profile) => p.education.map((e) => `${e.school}|${e.degree}|${e.field}`).join(';');
  if (schools(stored) !== schools(b)) differences.push('education');
  const jobs = (p: Profile) => p.experience.map((e) => `${e.company}|${e.title}`).join(';');
  if (jobs(stored) !== jobs(b)) differences.push('experience');
  const storedById = new Map(storedAnswers.map((a) => [a.id, a]));
  const missing = bundled.answers.filter((a) => {
    const s = storedById.get(a.id);
    return !s || s.answer !== a.answer || s.questionPatterns.join('|') !== a.questionPatterns.join('|');
  });
  if (missing.length > 0) differences.push(`${missing.length} stored answer(s)`);
  if (bundled.defaultResume && !stored.resumes.some((r) => r.fileName === bundled.defaultResume!.fileName)) {
    differences.push('resume');
  }
  return { drifted: differences.length > 0, differences };
}

export const repository = new StorageRepository();
