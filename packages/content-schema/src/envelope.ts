import { z, type ZodType } from 'zod';

/** Runtime schema for the versioned wrapper shared by every Game-owned Dynamic Content schema. */
export const dynamicContentEnvelopeSchema = z.object({
  gameId: z.string().min(1),
  schemaVersion: z.number().int().positive(),
  revision: z.number().int().nonnegative(),
  payload: z.unknown(),
});

/** Versioned Dynamic Content plus a Game-owned payload. */
export type DynamicContentEnvelope<T = unknown> = Omit<
  z.infer<typeof dynamicContentEnvelopeSchema>,
  'payload'
> & { payload: T };

/** Field-level validation error suitable for Creator Studio. */
export type ContentValidationIssue = {
  path: Array<string | number>;
  message: string;
};

/** Result of validating both the common envelope and Game-owned payload. */
export type ContentValidationResult<T> =
  | { success: true; data: DynamicContentEnvelope<T> }
  | { success: false; issues: ContentValidationIssue[] };

/** Validates an envelope and prefixes payload issue paths for UI consumers. */
export function validateContentEnvelope<T>(
  payloadSchema: ZodType<T>,
  input: unknown,
): ContentValidationResult<T> {
  const envelope = dynamicContentEnvelopeSchema.safeParse(input);
  if (!envelope.success) {
    return {
      success: false,
      issues: envelope.error.issues.map((issue) => ({
        path: issue.path.filter((part): part is string | number => typeof part !== 'symbol'),
        message: issue.message,
      })),
    };
  }

  const payload = payloadSchema.safeParse(envelope.data.payload);
  if (!payload.success) {
    return {
      success: false,
      issues: payload.error.issues.map((issue) => ({
        path: [
          'payload',
          ...issue.path.filter((part): part is string | number => typeof part !== 'symbol'),
        ],
        message: issue.message,
      })),
    };
  }

  return { success: true, data: { ...envelope.data, payload: payload.data } };
}
