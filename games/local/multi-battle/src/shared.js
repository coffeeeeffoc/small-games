import { CARD_BY_ID, PRICES } from './content.js';

export const clone = value => structuredClone(value);
export const def = card => CARD_BY_ID[typeof card === 'string' ? card : card.defId];
export function random(state) {
  let x = state.rng >>> 0 || 0x9e3779b9;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  state.rng = x >>> 0;
  return state.rng / 4294967296;
}
export function seedOf(text) {
  let seed = 2166136261;
  for (const c of String(text)) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619);
  return seed >>> 0 || 1;
}
export const emptyPrep = () => ({ attack: 0n, health: 0n, shield: 0n, opening: [], deathSummon: false });
export function createCard(player, defId) {
  if (!def(defId)) throw new Error('未知卡牌');
  return { uid: `${player.id}-${player.nextId++}`, defId, level: 1n, equipment: [], prep: emptyPrep(), used: {}, price: PRICES[def(defId).type] };
}
export function createPlayer(id, name, seed, family = 'neutral') {
  return { id, name, family, level: 1, hp: 30, gold: 0, wins: 0, round: 0, extraGold: 0, frozen: false, rng: seed >>> 0 || 1, nextId: 1, board: Array(6).fill(null), hand: [], shop: Array(5).fill(null), log: [] };
}
export function stats(card, withPrep = true) {
  const d = def(card);
  if (!d || d.type !== 'character') return { attack: 0n, health: 0n, shield: 0n };
  let attack = BigInt(d.attack) + card.level - 1n;
  let health = BigInt(d.health) + 2n * (card.level - 1n);
  for (const item of card.equipment) { attack += BigInt(def(item).attackBonus || 0); health += BigInt(def(item).healthBonus || 0); }
  if (withPrep) { attack += card.prep.attack; health += card.prep.health; }
  return { attack: attack < 1n ? 1n : attack, health: health < 1n ? 1n : health, shield: withPrep ? card.prep.shield : 0n };
}
export const compareBig = (a, b) => a < b ? -1 : a > b ? 1 : 0;
export function formatNumber(value) {
  const v = BigInt(value);
  if (v < 10000n) return v.toString();
  for (const [size, suffix] of [[1000000000000n, '万亿'], [100000000n, '亿'], [10000n, '万']]) {
    if (v >= size) return `${v / size}.${(v % size) * 10n / size}${suffix}`;
  }
}
export function encode(value) { return JSON.stringify(value, (_, v) => typeof v === 'bigint' ? { $integer: v.toString() } : v); }
export function decode(text) {
  return JSON.parse(text, (_, v) => {
    if (v && typeof v === 'object' && '$integer' in v) {
      if (Object.keys(v).length !== 1 || typeof v.$integer !== 'string' || !/^-?\d+$/.test(v.$integer)) throw new Error('存档整数格式损坏');
      return BigInt(v.$integer);
    }
    return v;
  });
}
