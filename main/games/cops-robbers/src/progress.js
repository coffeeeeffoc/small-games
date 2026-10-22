import { optimalRelaySolutions } from './optimal-solutions.js';

// One scoring rule for H5, Cocos and the legacy native campaign.
export const campaignPar = (level, mode = 'standard') => {
  const par = mode === 'relay' ? optimalRelaySolutions[level.id]?.length : level.par;
  if (!Number.isInteger(par) || par <= 0) throw new Error(`Missing ${mode} scoring reference for level ${level.id}`);
  return par;
};
export const campaignStars = (level, turns, mode = 'standard') => {
  const par = campaignPar(level, mode);
  return turns <= par ? 3 : turns <= par + 3 ? 2 : 1;
};
export function campaignRecord(level, previous, turns = previous?.turns, mode = 'standard') {
  const valid = value => Number.isInteger(value) && value > 0 && value < 100000 &&
    (mode !== 'quick' || value <= level.turnLimit);
  const candidates = [previous?.turns, turns].filter(valid);
  if (!candidates.length) return null;
  const best = Math.min(...candidates);
  return { turns: best, stars: campaignStars(level, best, mode) };
}

// Catalog order owns progression. Existing completed IDs remain replayable.
export const levelUnlocked = (catalog, records, id, developer = false) => {
  const index = catalog.findIndex(level=>level.id===id);
  return index >= 0 && (developer || index === 0 || Boolean(records[id]) || Boolean(records[catalog[index-1].id]));
};
export const nextPlayable = (catalog, records) => catalog.find((level,index)=>(index===0 || records[level.id] || records[catalog[index-1].id]) && !records[level.id]) || catalog[0];
