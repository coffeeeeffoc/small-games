import { LOADOUT_KINDS } from './src/content/rules.mjs';
export const TIERS = ['普通', '精良', '稀有', '史诗'];
export const CARD_NAMES = {
  troops: '先锋援兵',
  production: '丰仓募兵',
  attack: '锐刃军令',
  rate: '疾攻号角',
  defense: '坚甲军阵',
  health: '养兵方略',
  speed: '轻骑驿令',
  general: '招贤令',
  weapon: '守城弩机',
  territory: '坚城营造',
};
export const PROBABILITIES = Object.freeze({
  leading: [30, 40, 25, 5],
  middle: [45, 35, 17, 3],
  last: [65, 25, 9, 1],
});
export const rewardBand = (rank, count) =>
  rank === 1 ? 'leading' : rank >= count ? 'last' : 'middle';
export function cardDescription(card) {
  const bonus = 12 + card.tier * 8;
  return card.kind === 'troops'
    ? '出生城一次获得 ' + (4 + card.tier * 4) + ' 兵'
    : card.kind === 'general'
      ? '出生城开放点将，附近招募速度 +' + bonus + '%'
      : card.kind === 'weapon'
        ? '出生城配备弓弩，附近兵器伤害 +' + bonus + '%'
        : card.kind === 'territory'
          ? '出生城增加城防，附近容量与城防 +' + bonus + '%'
          : '出生城周围95步内，' +
            {
              production: '产兵',
              attack: '攻击',
              rate: '攻速',
              defense: '防御',
              health: '生命',
              speed: '行军',
            }[card.kind] +
            ' +' +
            bonus +
            '%';
}
const validCard = (c) =>
  c &&
  typeof c.id === 'string' &&
  c.id.length <= 160 &&
  LOADOUT_KINDS.includes(c.kind) &&
  Number.isInteger(c.tier) &&
  c.tier >= 0 &&
  c.tier <= 3 &&
  ['daily', 'single'].includes(c.duration) &&
  Number.isFinite(c.expiresAt) &&
  c.expiresAt >= 0;
export function normalizeArmory(raw) {
  const cards = Array.isArray(raw?.cards)
    ? raw.cards
        .filter(validCard)
        .map((c) => ({
          id: c.id,
          kind: c.kind,
          tier: c.tier,
          duration: c.duration,
          expiresAt: c.expiresAt,
        }))
    : [];
  const unique = [...new Map(cards.map((c) => [c.id, c])).values()];
  const equipped = [...new Set(Array.isArray(raw?.equipped) ? raw.equipped : [])]
    .filter((id) => unique.some((c) => c.id === id))
    .filter(
      (id, i, ids) =>
        !ids
          .slice(0, i)
          .some(
            (previous) =>
              unique.find((c) => c.id === previous).duration ===
              unique.find((c) => c.id === id).duration,
          ),
    )
    .slice(0, 2);
  const receipts = {};
  if (raw?.receipts && typeof raw.receipts === 'object' && !Array.isArray(raw.receipts))
    for (const [id, receipt] of Object.entries(raw.receipts)) {
      if (id.length <= 128 && validCard(receipt?.card) && typeof receipt.upgraded === 'boolean')
        Object.defineProperty(receipts, id, {
          value: { card: { ...receipt.card }, upgraded: receipt.upgraded },
          enumerable: true,
          writable: true,
          configurable: true,
        });
    }
  return { cards: unique, equipped, receipts };
}
export function currentCards(armory, now = Date.now()) {
  return armory.cards.filter((c) => c.duration === 'single' || c.expiresAt > now);
}
export function equippedCards(armory, now = Date.now()) {
  return currentCards(armory, now).filter((c) => armory.equipped.includes(c.id));
}
export function equipCard(armory, id, now = Date.now()) {
  const card = currentCards(armory, now).find((c) => c.id === id);
  if (!card) return false;
  if (armory.equipped.includes(id)) armory.equipped = armory.equipped.filter((i) => i !== id);
  else
    armory.equipped = [
      ...armory.equipped.filter(
        (i) => armory.cards.find((c) => c.id === i)?.duration !== card.duration,
      ),
      id,
    ];
  return true;
}
export function consumeCards(armory, ids) {
  const spent = new Set(
    armory.cards.filter((c) => ids.includes(c.id) && c.duration === 'single').map((c) => c.id),
  );
  armory.cards = armory.cards.filter((c) => !spent.has(c.id));
  armory.equipped = armory.equipped.filter((id) => !spent.has(id));
}
export function drawCard(armory, result, matchId, random = Math.random, now = Date.now()) {
  if (typeof matchId !== 'string' || !matchId || matchId.length > 128)
    throw new TypeError('Invalid match ID');
  if (Object.hasOwn(armory.receipts, matchId)) return armory.receipts[matchId].card;
  if (
    !result?.completed ||
    result.rewardEligible === false ||
    !['timeout', 'elimination'].includes(result.reason)
  )
    return null;
  const rank = result.rankings?.find((r) => r.factionId === 0)?.rank;
  const count = result.rankings?.length;
  if (!Number.isInteger(rank) || rank < 1 || rank > count) return null;
  const sample = () => {
    const n = random();
    if (!Number.isFinite(n) || n < 0 || n >= 1)
      throw new RangeError('Random sample must be in [0,1)');
    return n;
  };
  const roll = sample() * 100,
    weights = PROBABILITIES[rewardBand(rank, count)];
  let tier = 0,
    total = weights[0];
  while (roll >= total && tier < 3) total += weights[++tier];
  const kind = LOADOUT_KINDS[Math.floor(sample() * LOADOUT_KINDS.length)];
  const duration = sample() < 0.3 ? 'daily' : 'single';
  const card = {
    id: 'reward:' + matchId,
    kind,
    tier,
    duration,
    expiresAt:
      duration === 'daily'
        ? (Math.floor((now + 8 * 3600000) / 86400000) + 1) * 86400000 - 8 * 3600000
        : 0,
  };
  armory.cards.push(card);
  Object.defineProperty(armory.receipts, matchId, {
    value: { card: { ...card }, upgraded: false },
    enumerable: true,
    writable: true,
    configurable: true,
  });
  return card;
}
export function upgradeCard(armory, matchId, status) {
  const receipt = Object.hasOwn(armory.receipts, matchId) && armory.receipts[matchId];
  if (status !== 'completed' || !receipt || receipt.upgraded || receipt.card.tier === 3)
    return false;
  const card = armory.cards.find((c) => c.id === receipt.card.id);
  if (!card) return false;
  card.tier = receipt.card.tier + 1;
  receipt.card = { ...card };
  receipt.upgraded = true;
  return true;
}
