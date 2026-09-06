import { z } from 'zod';

/** Persistence/transport shape; envelope validity is owned by the Managed Ad schema. */
export const adDraftSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(120),
  revision: z.number().int().nonnegative(),
  envelope: z.unknown(),
});
/** A mutable Managed Ad draft, identified by UUID and an optimistic revision. */
export type AdDraft = z.infer<typeof adDraftSchema>;
/** Save atomically matches the supplied revision, returning undefined on conflict. */
export type AdDraftStore = {
  list(): Promise<AdDraft[]>;
  get(id: string): Promise<AdDraft | undefined>;
  create(draft: AdDraft): Promise<AdDraft>;
  save(draft: AdDraft): Promise<AdDraft | undefined>;
};
