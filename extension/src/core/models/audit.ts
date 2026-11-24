import { z } from 'zod';

export const ApplicationAuditSchema = z.object({
  id: z.string().default(() => crypto.randomUUID()),
  url: z.string().min(1),
  canonicalUrl: z.string().min(1),
  company: z.string().min(1),
  title: z.string().min(1),
  appliedAt: z.string().default(() => new Date().toISOString()),
  applicationId: z.string().optional(),
  jobId: z.string().optional(),
  source: z.enum(['extension', 'manual', 'auto_detection']).default('extension'),
  notes: z.string().optional().default('')
});

export type ApplicationAudit = z.infer<typeof ApplicationAuditSchema>;
