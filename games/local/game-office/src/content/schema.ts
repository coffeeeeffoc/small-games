import { z } from 'zod';

/** Dynamic Content for the first-person office week. */
export const officeContentSchema = z.object({
  experience: z.literal('first-person-week'),
  seed: z.number().int().min(0).max(0xffffffff).default(20260912),
});

export type OfficeContent = z.infer<typeof officeContentSchema>;
