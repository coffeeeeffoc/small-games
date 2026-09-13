import { z } from 'zod';

/** Runtime schema for one mutation offered to an arena creature. */
export const traitSchema = z.object({
  name: z.string(),
  icon: z.string(),
  attack: z.number(),
  hp: z.number(),
  speed: z.number(),
  desc: z.string(),
});
/** Runtime schema for arena leagues, rivals, species, and mutation pool. */
export const arenaContentSchema = z.object({
  ranks: z.array(z.string().min(1)).length(5),
  rivals: z.array(z.tuple([z.string().min(1), z.string().min(1)])).length(5),
  species: z.array(z.tuple([z.string().min(1), z.string().min(1)])).min(1),
  traits: z.array(traitSchema).min(3),
});
/** Validated dynamic content consumed by the arena game. */
export type ArenaContent = z.infer<typeof arenaContentSchema>;
/** A stat-changing mutation from the arena content pool. */
export type Trait = z.infer<typeof traitSchema>;
