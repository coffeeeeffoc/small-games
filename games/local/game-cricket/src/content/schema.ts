import { z } from 'zod';
export const cricketContentSchema = z.object({ title: z.string().min(1).max(80) });
export type CricketContent = z.infer<typeof cricketContentSchema>;
