import { chooseRounds, restoreJourney } from './game.js';

export function validDay(day) {
  if (typeof day !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(day)) return false;
  const time = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === day;
}
export function today(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function seededRandom(key) {
  let seed = 2166136261;
  for (const char of key) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
export function validChallenge(value) {
  return value && validDay(value.day) && ['all', 'china'].includes(value.region) && typeof value.timed === 'boolean';
}
export function dailyDeck(catalog, challenge) {
  if (!validChallenge(challenge)) throw new Error('每日旅途规则无效。');
  // Footprints never affect the shared deck. Stable IDs make catalog traversal order irrelevant.
  const ordered = [...catalog].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return chooseRounds(ordered, challenge.region, seededRandom(`history-v1:${challenge.day}:${challenge.region}`));
}
export function challengeKey(challenge) {
  return `${challenge.day}:${challenge.region}:${challenge.timed ? 1 : 0}`;
}
export function restoreDailyJourney(value, catalog) {
  if (!validChallenge(value?.daily) || value.practice || value.region !== value.daily.region || value.timed !== value.daily.timed) return null;
  const journey = restoreJourney(value, catalog);
  if (!journey || JSON.stringify(journey.deck.map(round => round.id)) !== JSON.stringify(dailyDeck(catalog, value.daily).map(round => round.id))) return null;
  return { ...journey, daily: value.daily };
}
export function parseChallenge(search) {
  const params = new URLSearchParams(search);
  if (!params.has('daily')) return { challenge: null, error: false };
  const challenge = { day: params.get('daily'), region: params.get('region') ?? 'all', timed: params.get('timed') === '1' };
  if (search.length > 512 || ['daily', 'v', 'region', 'timed'].some(key => params.getAll(key).length > 1)
      || !validChallenge(challenge) || ![null, '1'].includes(params.get('v'))
      || ![null, '0', '1'].includes(params.get('timed'))) return { challenge: null, error: true };
  return { challenge, error: false };
}
export function challengeUrl(location, challenge) {
  if (!validChallenge(challenge)) throw new Error('每日旅途规则无效。');
  const url = new URL(location.href);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('请通过网页地址打开旅途。');
  url.username = ''; url.password = '';
  url.search = ''; url.hash = '';
  url.searchParams.set('daily', challenge.day);
  url.searchParams.set('v', '1');
  url.searchParams.set('region', challenge.region);
  url.searchParams.set('timed', challenge.timed ? '1' : '0');
  return url.href;
}
