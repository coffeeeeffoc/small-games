import { z } from 'zod';

const statsDeltaSchema = z.object({
  body: z.number().int().optional(),
  spirit: z.number().int().optional(),
  luck: z.number().int().optional(),
});

/** Runtime schema for the fixed three-chapter, eighteen-event cultivation campaign. */
export const cultivationContentSchema = z.object({
  title: z.string().min(1).max(80),
  chapters: z
    .array(
      z.object({ name: z.string().min(1), subtitle: z.string().min(1), color: z.string().min(1) }),
    )
    .length(3),
  events: z
    .array(
      z.object({
        age: z.number().int().positive(),
        chapter: z.number().int().min(1).max(3),
        title: z.string().min(1),
        text: z.string().min(1),
        boss: z.boolean().optional(),
        choices: z
          .array(
            z.object({
              text: z.string().min(1),
              result: z.string().min(1),
              delta: statsDeltaSchema,
            }),
          )
          .length(2),
      }),
    )
    .length(18),
});

/** Validated Dynamic Content owned by the cultivation Game. */
export type CultivationContent = z.infer<typeof cultivationContentSchema>;
