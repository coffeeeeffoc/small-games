import { WEAPONS } from '../content/levels.ts';
import { damageEnemy } from './combat.ts';
import { memberPosition, supplyPosition, supplyReachable } from './geometry.ts';
import { HZ, type Effect, type GameState, type Reward, type Supply } from './types.ts';
export function emit(state: GameState, effect: Omit<Effect, 'id' | 'tick'>) {
  state.effects.push({ ...effect, id: ++state.effectId, tick: state.tick });
}
function grant(state: GameState, reward: Reward) {
  const alive = state.members.filter((m) => m.hp > 0);
  if (reward.kind === 'weapon') {
    // Equipping never clears an existing cooldown. Prefer members without this weapon.
    alive
      .filter((m) => m.weapon !== reward.weapon)
      .slice(0, reward.count)
      .forEach((m) => {
        m.weapon = reward.weapon;
      });
  } else if (reward.kind === 'rescue') {
    const added = Math.min(12 - alive.length, reward.amount);
    for (let i = 0; i < added; i++)
      state.members.push({
        id: state.nextMember++,
        hp: 20,
        weapon: 'rifle',
        nextShot: state.tick + 10,
      });
    state.stats.rescued += added;
    state.shield = Math.min(120, state.shield + (reward.amount - added) * 15);
  } else if (reward.kind === 'shield') state.shield = Math.min(120, state.shield + reward.amount);
  else if (reward.kind === 'heal')
    alive.forEach((m) => {
      m.hp = Math.min(20, m.hp + reward.amount);
    });
  else if (reward.kind === 'haste') state.hasteUntil = state.tick + reward.amount;
  else
    for (const enemy of state.enemies) {
      if (enemy.kind === 'boss' && enemy.hp > 0) {
        damageEnemy(state, enemy, reward.amount, state.x, 7, true);
        enemy.armorUntil = state.tick + HZ * 12;
        emit(state, { kind: 'blast', x: enemy.x, z: enemy.z, label: '吊架落物 · 破甲 12 秒' });
      }
    }
}
export function settleTiers(state: GameState, supply: Supply) {
  while (
    supply.claimed < supply.config.tiers.length &&
    supply.damage >= supply.config.tiers[supply.claimed].damage
  ) {
    const tier = supply.config.tiers[supply.claimed],
      id = `${supply.config.id}:${supply.claimed}`;
    supply.claimed++;
    if (!state.grants.some((g) => g.id === id)) {
      state.grants.push({ id, tick: state.tick, label: tier.label });
      grant(state, tier.reward);
      state.stats.score += 80;
      const p = supplyPosition(supply, state.tick);
      emit(state, { kind: 'reward', ...p, label: tier.label });
    }
    if (supply.config.group)
      for (const other of state.supplies) {
        if (other !== supply && other.config.group === supply.config.group)
          other.status = 'excluded';
      }
  }
  if (supply.claimed === supply.config.tiers.length) supply.status = 'claimed';
}
export function damageSupply(
  state: GameState,
  supply: Supply,
  damage: number,
  source: Pick<Effect, 'fromX' | 'fromZ' | 'weapon'> = {},
) {
  if (
    supply.status !== 'active' ||
    state.tick > supply.config.end ||
    !Number.isFinite(damage) ||
    damage <= 0
  )
    return;
  const effective = Math.min(damage, supply.config.tiers.at(-1)!.damage - supply.damage);
  supply.damage += effective;
  state.stats.supplyDamage += effective;
  if (
    effective > 0 &&
    !state.effects.some(
      (e) => e.kind === 'hit' && e.entityId === supply.config.id && state.tick - e.tick < 5,
    )
  ) {
    emit(state, {
      kind: 'hit',
      ...supplyPosition(supply, state.tick),
      ...source,
      surface: 'supply',
      entityId: supply.config.id,
    });
  }
  // Grant after all attacks in the tick, so new equipment does not change its sibling shots.
}
export function updateFocus(state: GameState) {
  const live = state.members.filter((m) => m.hp > 0);
  const old = state.supplies.find((s) => s.config.id === state.focus);
  const canUse = (s: Supply) =>
    live.some((m) => {
      const p = memberPosition(state, m);
      return supplyReachable(state, s, p.x, p.z, WEAPONS[m.weapon].range);
    });
  if (old && state.x * old.config.side >= 2.55 && canUse(old)) return;
  state.focus = null;
  const next = state.supplies.find((s) => state.x * s.config.side >= 2.9 && canUse(s));
  if (!next) {
    state.candidate = null;
    state.focusTicks = 0;
    return;
  }
  if (state.candidate !== next.config.id) {
    state.candidate = next.config.id;
    state.focusTicks = 0;
  }
  if (++state.focusTicks >= 5) state.focus = next.config.id;
}
export function estimatedDps(state: GameState, supply?: Supply) {
  return state.members
    .filter((m) => m.hp > 0)
    .reduce((sum, m) => {
      const p = memberPosition(state, m),
        w = WEAPONS[m.weapon];
      if (supply && !supplyReachable(state, supply, p.x, p.z, w.range)) return sum;
      return (
        sum + (w.damage * HZ) / Math.ceil(w.cooldown * (state.hasteUntil > state.tick ? 0.65 : 1))
      );
    }, 0);
}
