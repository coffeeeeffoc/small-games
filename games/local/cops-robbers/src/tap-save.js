import { levels } from './levels.js';
import { relayLevels } from './relay.js';
import { quickTrials } from './quick-trials.js';
import { campaignRecord } from './progress.js';
const catalogs = { completed: [levels, 'standard'], relayCompleted: [relayLevels, 'relay'], quickCompleted: [quickTrials, 'quick'] };
export function validateTapProgress(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('无效的巡逻进度');
  const result = { version: 1 };
  for (const [field, [catalog, mode]] of Object.entries(catalogs)) {
    result[field] = {};
    for (const level of catalog) {
      const record = campaignRecord(level, value[field]?.[level.id], undefined, mode);
      if (record) result[field][level.id] = record;
    }
  }
  return result;
}
export function mergeTapProgress(local, incoming) {
  const result = validateTapProgress(local), other = validateTapProgress(incoming);
  for (const [field, [catalog, mode]] of Object.entries(catalogs)) for (const level of catalog) {
    const record = campaignRecord(level, result[field][level.id], other[field][level.id]?.turns, mode);
    if (record) result[field][level.id] = record;
  }
  return result;
}
export const tapProgressScore = value => Object.keys(catalogs).reduce((total, key) => total + Object.keys(validateTapProgress(value)[key]).length, 0);
export const tapProgressSummary = value => `正常闯关 ${tapProgressScore(value)} 关（含使用提示）`;
