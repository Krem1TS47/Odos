import Dexie, { type Table } from 'dexie';
import type { Job, Application, Profile, StoredAnswer, ApplicationAudit } from '../models';

export interface ResumeBlobRecord {
  id: string; // matches ResumeMetadata.id
  data: ArrayBuffer;
  fileName: string;
  fileType: string;
}

export interface ProfileRecord {
  key: 'current';
  profile: Profile;
  updatedAt: string;
}

export class OdosDatabase extends Dexie {
  jobs!: Table<Job, string>;
  applications!: Table<Application, string>;
  profile!: Table<ProfileRecord, string>;
  answers!: Table<StoredAnswer, string>;
  resumeBlobs!: Table<ResumeBlobRecord, string>;
  applicationAudits!: Table<ApplicationAudit, string>;

  constructor(dbName = 'OdosDB') {
    super(dbName);
    this.version(1).stores({
      jobs: 'id, dedupeKey, company, title, firstSeenAt',
      applications: 'id, jobId, status, prefilledAt, submittedAt',
      profile: 'key',
      answers: 'id, category, autoFill, *questionPatterns',
      resumeBlobs: 'id'
    });
    this.version(2).stores({
      applicationAudits: 'id, url, canonicalUrl, company, title, appliedAt, applicationId, jobId'
    });
  }
}

export const db = new OdosDatabase();
