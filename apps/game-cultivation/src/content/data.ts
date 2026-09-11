import type { DynamicContentEnvelope } from '@coffeeeeffoc/content-schema';
import { defaultTrialBalance, type CultivationContent } from './schema.js';
export const defaultCultivationContent: CultivationContent = {
  title: '三分钟修仙',
  balance: defaultTrialBalance,
};
export const defaultCultivationEnvelope: DynamicContentEnvelope<CultivationContent> = {
  gameId: 'cultivation',
  schemaVersion: 3,
  revision: 1,
  payload: defaultCultivationContent,
};
