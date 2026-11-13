import { z } from 'zod';

const rule = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
const rules = z
  .object({ current: rule, supported: z.array(rule).min(1).max(64) })
  .strict()
  .refine((value) => value.supported.includes(value.current));
/** Executable rules loaded by one running process, independent of release admission settings. */
export const nightRuntimeSchema = z
  .object({
    instanceId: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[^\p{Cc}]+$/u),
    ranked: rules,
    multiplayer: rules,
  })
  .strict();
export type NightRuntime = z.infer<typeof nightRuntimeSchema>;
