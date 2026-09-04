import { z } from 'zod';

/** Runtime schema for the fixed five-day office campaign. */
export const officeContentSchema = z.object({
  days: z
    .array(
      z.object({
        name: z.string().min(1),
        task: z.string().min(1),
        inspectionChance: z.number().min(0).max(1),
        color: z.string().min(1),
        target: z.number().int().positive(),
        duration: z.number().int().positive(),
      }),
    )
    .length(5),
});

/** Validated Dynamic Content owned by the office Game. */
export type OfficeContent = z.infer<typeof officeContentSchema>;
