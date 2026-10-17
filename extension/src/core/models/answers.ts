import { z } from 'zod';

export const StoredAnswerCategorySchema = z.enum([
  'eligibility',
  'demographic',
  'motivation',
  'logistics',
  'other'
]);

export const StoredAnswerSchema = z.object({
  id: z.string().default(() => crypto.randomUUID()),
  questionPatterns: z.array(z.string()).min(1),
  category: StoredAnswerCategorySchema,
  answer: z.string(),
  autoFill: z.boolean().default(false)
});

export type StoredAnswerCategory = z.infer<typeof StoredAnswerCategorySchema>;
export type StoredAnswer = z.infer<typeof StoredAnswerSchema>;
