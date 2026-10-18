const valid = value => Number.isFinite(value) && value > 0 && value < 86400;
const recordPattern = /^(challenge|classic|escape)-(cop|robber)-(100|[1-9]\d?)(:relay)?:(cop|robber|simultaneous):street-solo-v2$|^quick-cop-[1-3]:simultaneous:street-solo-v2$/;
export function validateTapProgress(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('无效的街区纪录');
  const result = { version: 1, records: {}, assisted: {}, verified: {} };
  for (const field of ['records', 'assisted', 'verified']) for (const [key, time] of Object.entries(value[field] || {})) {
    if (recordPattern.test(key) && valid(time)) result[field][key] = time;
  }
  return result;
}
export function mergeTapProgress(local, incoming) {
  const result = validateTapProgress(local), other = validateTapProgress(incoming);
  for (const field of ['records', 'assisted', 'verified']) for (const [key, time] of Object.entries(other[field])) result[field][key] = Math.min(result[field][key] || Infinity, time);
  return result;
}
export function nativeRecordKey(key) {
  try {
    const config = JSON.parse(key);
    return `${config.mode}-${config.role}-${config.level}${config.rule === 'relay' ? ':relay' : ''}:${config.first || 'simultaneous'}:${config.version}`;
  } catch { return ''; }
}
export function nativeTapProgress(best, verified) {
  const value = { records: {}, assisted: {}, verified: {} };
  for (const [key, time] of Object.entries(best || {})) {
    const assisted = key.startsWith('assisted:');
    value[assisted ? 'assisted' : 'records'][nativeRecordKey(assisted ? key.slice(9) : key)] = time;
  }
  for (const [key, time] of Object.entries(verified || {})) value.verified[nativeRecordKey(key)] = time;
  return validateTapProgress(value);
}
export function restoreNativeProgress(value, best, verified) {
  for (const field of ['records', 'assisted', 'verified']) for (const [key, time] of Object.entries(validateTapProgress(value)[field])) {
    const match = key.match(/^(challenge|classic|escape|quick)-(cop|robber)-(\d+)(:relay)?:(cop|robber|simultaneous):street-solo-v2$/);
    const nativeKey = JSON.stringify({ version: 'street-solo-v2', mode: match[1], role: match[2], level: +match[3], rule: match[4] ? 'relay' : 'standard', first: match[5] });
    const target = field === 'verified' ? verified : best, storageKey = (field === 'assisted' ? 'assisted:' : '') + nativeKey;
    target[storageKey] = Math.min(target[storageKey] || Infinity, time);
  }
}
export const tapProgressScore = value => new Set(Object.keys(validateTapProgress(value).verified).filter(key => /^challenge-cop-\d+:simultaneous:/.test(key)).map(key => key.split(':')[0])).size;
export const tapProgressSummary = value => `无辅助挑战 ${tapProgressScore(value)} 关 · 保存通关纪录`;
