import type { DynamicContentEnvelope } from '@coffeeeeffoc/content-schema';
import type { OfficeContent } from './schema.js';

export const defaultOfficeContent: OfficeContent = {
  experience: 'first-person-week',
  seed: 20260912,
};

export const defaultOfficeEnvelope: DynamicContentEnvelope<OfficeContent> = {
  gameId: 'office',
  schemaVersion: 2,
  revision: 1,
  payload: defaultOfficeContent,
};
