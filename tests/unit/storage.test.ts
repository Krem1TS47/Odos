import { describe, it, expect, beforeEach } from 'vitest';
import { OdosDatabase } from '../../extension/src/core/storage/db';
import { StorageRepository } from '../../extension/src/core/storage/repository';
import { DEFAULT_PROFILE } from '../../extension/src/core/models';

describe('StorageRepository (IndexedDB via Dexie)', () => {
  let db: OdosDatabase;
  let repo: StorageRepository;

  beforeEach(async () => {
    db = new OdosDatabase(`TestDB_${Math.random()}`);
    repo = new StorageRepository(db);
  });

  it('saves and retrieves profile', async () => {
    const initial = await repo.getProfile();
    expect(initial.contact.fullName).toBe('');

    const updated = {
      ...DEFAULT_PROFILE,
      contact: {
        ...DEFAULT_PROFILE.contact,
        fullName: 'Benjamin Ching',
        firstName: 'Benjamin',
        lastName: 'Ching',
        email: 'ben@example.com'
      }
    };

    await repo.saveProfile(updated);
    const retrieved = await repo.getProfile();
    expect(retrieved.contact.fullName).toBe('Benjamin Ching');
    expect(retrieved.contact.email).toBe('ben@example.com');
  });

  it('stores and retrieves resume binary blobs with metadata', async () => {
    const resumeBlob = new Blob(['sample pdf content'], { type: 'application/pdf' });
    const resumeId = await repo.saveResume(resumeBlob, {
      label: 'Main Resume',
      fileName: 'resume.pdf'
    });

    expect(resumeId).toBeDefined();

    const profile = await repo.getProfile();
    expect(profile.resumes.length).toBe(1);
    expect(profile.resumes[0].isDefault).toBe(true);

    const blobRecord = await repo.getResumeBlob(resumeId);
    expect(blobRecord).toBeDefined();
    expect(blobRecord?.fileName).toBe('resume.pdf');
    expect(blobRecord?.blob.size).toBe(resumeBlob.size);
  });

  it('performs CRUD and pattern lookup on stored answers', async () => {
    await repo.upsertAnswer({
      id: 'ans-1',
      questionPatterns: ['how did you hear about us', 'referral source'],
      category: 'logistics',
      answer: 'LinkedIn Jobs',
      autoFill: true
    });

    const all = await repo.listAnswers();
    expect(all.length).toBe(1);

    const match = await repo.findMatchingAnswer('How did you hear about us?');
    expect(match).not.toBeNull();
    expect(match?.answer).toBe('LinkedIn Jobs');

    const noMatch = await repo.findMatchingAnswer('What are your salary expectations?');
    expect(noMatch).toBeNull();
  });

  it('manages jobs and prefilled applications', async () => {
    const jobId = await repo.upsertJob({
      id: 'job-1',
      company: 'Acme Labs',
      title: 'Full Stack Engineer',
      url: 'https://boards.greenhouse.io/acmelabs/jobs/123',
      firstSeenAt: new Date().toISOString(),
      dedupeKey: 'acmelabs::fullstackengineer::https://boards.greenhouse.io/acmelabs/jobs/123'
    });

    const existing = await repo.findJobByDedupeKey('acmelabs::fullstackengineer::https://boards.greenhouse.io/acmelabs/jobs/123');
    expect(existing).toBeDefined();
    expect(existing?.id).toBe(jobId);

    const app = await repo.createPrefilledApplication(jobId);
    expect(app.status).toBe('prefilled');
    expect(app.events.length).toBe(1);

    const submitted = await repo.markApplicationSubmitted(app.id, {
      first_name: 'Benjamin',
      email: 'ben@example.com'
    });

    expect(submitted.status).toBe('submitted');
    expect(submitted.submittedAnswers?.first_name).toBe('Benjamin');
    expect(submitted.submittedAt).toBeDefined();
  });

  it('clears all data on wipeAllData', async () => {
    await repo.upsertJob({
      id: 'job-wipe',
      company: 'Wipe Co',
      title: 'Engineer',
      url: 'https://wipe.example.com',
      firstSeenAt: new Date().toISOString(),
      dedupeKey: 'wipe::engineer::url'
    });

    await repo.wipeAllData();
    const jobs = await repo.listJobs();
    expect(jobs.length).toBe(0);
  });
});
