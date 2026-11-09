import { z } from 'zod';

const name = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/);
/** Successful deployment evidence; this is not a live health probe. */
export const backendDeploymentSchema = z
  .object({
    version: name,
    sourceSHA: z
      .string()
      .regex(/^[a-f0-9]{40}$/)
      .nullable(),
    release: z.string().regex(/^[a-z0-9][a-z0-9-]{0,127}$/),
    mode: z.enum(['execute', 'rollback']),
    services: z.array(name).min(1).max(16),
    activeImages: z.record(name, z.string().min(1).max(512)),
    verifiedAt: z.number().int().positive().max(8640000000000000),
    nightRules: z.object({ ranked: name, multiplayer: name }).strict().optional(),
  })
  .strict();
export type BackendDeployment = z.infer<typeof backendDeploymentSchema>;
