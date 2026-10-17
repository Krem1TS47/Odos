import { z } from 'zod';

export const JobSchema = z.object({
  id: z.string().default(() => crypto.randomUUID()),
  company: z.string().min(1),
  title: z.string().min(1),
  location: z.string().optional(),
  url: z.string(),
  descriptionText: z.string().optional(),
  firstSeenAt: z.string().default(() => new Date().toISOString()),
  dedupeKey: z.string()
});

export const ApplicationStatusSchema = z.enum([
  'prefilled',
  'submitted',
  'interviewing',
  'offer',
  'rejected',
  'withdrawn',
  'abandoned'
]);

export const ApplicationEventSchema = z.object({
  id: z.string().default(() => crypto.randomUUID()),
  at: z.string().default(() => new Date().toISOString()),
  type: z.enum(['status_change', 'note', 'followup_due']),
  data: z.record(z.any()).default({})
});

export const ApplicationSchema = z.object({
  id: z.string().default(() => crypto.randomUUID()),
  jobId: z.string(),
  status: ApplicationStatusSchema.default('prefilled'),
  resumeId: z.string().optional(),
  prefilledAt: z.string().default(() => new Date().toISOString()),
  submittedAt: z.string().optional(),
  submittedAnswers: z.record(z.string()).optional().default({}),
  notes: z.string().optional().default(''),
  events: z.array(ApplicationEventSchema).default([])
});

export type Job = z.infer<typeof JobSchema>;
export type ApplicationStatus = z.infer<typeof ApplicationStatusSchema>;
export type ApplicationEvent = z.infer<typeof ApplicationEventSchema>;
export type Application = z.infer<typeof ApplicationSchema>;
