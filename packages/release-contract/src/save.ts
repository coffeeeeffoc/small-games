import { jsonValueSchema } from '@coffeeeeffoc/game-contract';
import { z } from 'zod';

export const saveKeySchema = z
  .string()
  .min(1)
  .max(128)
  .refine((key) => !key.includes('/'));
export const saveVersionSchema = z.string().regex(/^[1-9]\d*$/);
export const saveRecordSchema = z
  .object({ value: jsonValueSchema, version: saveVersionSchema })
  .strict();
export const saveWriteSchema = z
  .object({ value: jsonValueSchema, expectedVersion: saveVersionSchema.nullable() })
  .strict();
export type SaveRecord = z.infer<typeof saveRecordSchema>;
export type SaveWrite = z.infer<typeof saveWriteSchema>;
