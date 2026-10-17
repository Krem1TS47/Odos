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
  ApplicationEvent
} from '../models';

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

export class StorageRepository {
  private db: OdosDatabase;

  constructor(customDb?: OdosDatabase) {
    this.db = customDb || defaultDb;
  }

  // ==========================================
  // PROFILE OPERATIONS
  // ==========================================

  async getProfile(): Promise<Profile> {
    const record = await this.db.profile.get('current');
    if (!record) {
      return DEFAULT_PROFILE;
    }
    const validated = ProfileSchema.safeParse(record.profile);
    return validated.success ? validated.data : DEFAULT_PROFILE;
  }

  async saveProfile(profile: Profile): Promise<void> {
    const validated = ProfileSchema.parse(profile);
    await this.db.profile.put({
      key: 'current',
      profile: validated,
      updatedAt: new Date().toISOString()
    });
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
  // WIPE ALL DATA
  // ==========================================

  async wipeAllData(): Promise<void> {
    await this.db.transaction(
      'rw',
      [this.db.jobs, this.db.applications, this.db.profile, this.db.answers, this.db.resumeBlobs],
      async () => {
        await this.db.jobs.clear();
        await this.db.applications.clear();
        await this.db.profile.clear();
        await this.db.answers.clear();
        await this.db.resumeBlobs.clear();
      }
    );
  }
}

export const repository = new StorageRepository();
