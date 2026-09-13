import {
  dynamicContentEnvelopeSchema,
  validateContentEnvelope,
  type ContentValidationResult,
} from '@coffeeeeffoc/content-schema';
import { cricketContentSchema, type CricketContent } from './schema.js';
export function normalizeCricketContent(input: unknown): ContentValidationResult<CricketContent> {
  const envelope = dynamicContentEnvelopeSchema.safeParse(input);
  if (!envelope.success || envelope.data.gameId !== 'cricket' || envelope.data.schemaVersion !== 1)
    return {
      success: false,
      issues: [{ path: [], message: 'Invalid cricket content identity or version' }],
    };
  return validateContentEnvelope(cricketContentSchema, envelope.data);
}
