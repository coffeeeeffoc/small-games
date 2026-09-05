import { z } from 'zod';

/** Persistence/transport shape; envelope validity is owned by its Game schema. */
export const draftSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(120),
  revision: z.number().int().nonnegative(),
  envelope: z.unknown(),
});
/** A mutable Management draft, identified by UUID and an optimistic revision. */
export type ContentDraft = z.infer<typeof draftSchema>;
/** Save atomically matches the supplied revision, returning undefined on conflict. */
export type DraftStore = {
  list(): Promise<ContentDraft[]>;
  get(id: string): Promise<ContentDraft | undefined>;
  create(draft: ContentDraft): Promise<ContentDraft>;
  save(draft: ContentDraft): Promise<ContentDraft | undefined>;
};
