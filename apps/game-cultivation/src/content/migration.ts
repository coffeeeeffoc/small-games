import {
  dynamicContentEnvelopeSchema,
  validateContentEnvelope,
  type ContentValidationResult,
  type ContentMigration,
} from '@coffeeeeffoc/content-schema';
import { cultivationContentSchema, type CultivationContent } from './schema.js';

/** v1 had a fixed display title; v2 makes it editable without changing game rules. */
export const cultivationTitleMigration: ContentMigration<unknown, CultivationContent> = {
  fromVersion: 1,
  toVersion: 2,
  migrate(payload) {
    const legacy = cultivationContentSchema.omit({ title: true }).parse(payload);
    return { ...legacy, title: '三分钟修仙' };
  },
};

/** Validates the source version first, then returns a fresh current-version envelope. */
export function normalizeCultivationContent(
  input: unknown,
): ContentValidationResult<CultivationContent> {
  const wrapper = dynamicContentEnvelopeSchema.safeParse(input);
  if (!wrapper.success)
    return {
      success: false,
      issues: wrapper.error.issues.map((issue) => ({
        path: issue.path.map((part) => (typeof part === 'number' ? part : String(part))),
        message: issue.message,
      })),
    };
  const envelope = wrapper.data;
  if (envelope.gameId !== 'cultivation')
    return { success: false, issues: [{ path: ['gameId'], message: '必须是 cultivation 内容' }] };
  if (envelope.schemaVersion !== 1 && envelope.schemaVersion !== 2)
    return {
      success: false,
      issues: [{ path: ['schemaVersion'], message: '不支持的修仙 schema 版本' }],
    };
  if (envelope.schemaVersion === 1) {
    const legacy = validateContentEnvelope(
      cultivationContentSchema.omit({ title: true }),
      envelope,
    );
    if (!legacy.success) return legacy;
    return {
      success: true,
      data: {
        ...envelope,
        schemaVersion: 2,
        payload: cultivationTitleMigration.migrate(legacy.data.payload),
      },
    };
  }
  return validateContentEnvelope(cultivationContentSchema, envelope);
}
