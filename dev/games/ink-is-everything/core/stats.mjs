import { clamp } from './math.mjs';

export function getPlayerStats(state) {
  const definition = state.definition;
  const result = {
    ...definition.rules,
    maxInk:
      definition.initial.maxInk +
      (state.progression.level - 1) * definition.progression.maxInkPerLevel,
  };
  for (const [id, rank] of Object.entries(state.equipment)) {
    for (const [key, value] of Object.entries(definition.equipment[id]?.modifiers ?? {})) {
      if (typeof value === 'number' && Number.isFinite(value))
        result[key] = (result[key] ?? 0) + value * rank;
    }
  }
  result.maxInk = Math.max(1, result.maxInk);
  result.attackCost = Math.max(1, result.attackCost ?? 6);
  result.attackDamage = Math.max(0, result.attackDamage ?? 8);
  result.attackCooldown = Math.max(0.12, result.attackCooldown ?? 0.4);
  result.meleeDamage = Math.max(0, result.meleeDamage ?? 5);
  result.meleeRange = Math.max(1, result.meleeRange ?? 65);
  result.meleeCooldown = Math.max(0.15, result.meleeCooldown ?? 0.45);
  result.novaCost = Math.max(1, result.novaCost ?? 14);
  result.novaDamage = Math.max(0, result.novaDamage ?? 14);
  result.novaRadius = Math.max(1, result.novaRadius ?? 135);
  result.novaCooldown = Math.max(0.5, result.novaCooldown ?? 4);
  result.dashCooldown = Math.max(0.4, result.dashCooldown ?? 1.1);
  result.dashDuration = Math.max(0.05, result.dashDuration ?? 0.18);
  result.dashInvuln = Math.min(result.dashCooldown * 0.65, Math.max(0, result.dashInvuln ?? 0.22));
  result.speed = Math.max(50, result.speed ?? 222);
  result.lifeSteal = clamp(result.lifeSteal, 0, 1);
  result.killRestore = Math.max(0, result.killRestore);
  result.dropReturnRatio = clamp(
    result.dropReturnRatio ?? 0.5,
    0,
    Math.min(0.9, result.maxDropReturnRatio ?? 0.8),
  );
  result.pickupRadius = Math.max(1, result.pickupRadius);
  return result;
}
export function getEquipmentSummary(state) {
  return Object.entries(state.equipment).map(([id, rank]) => ({
    ...state.definition.equipment[id],
    id,
    rank,
    nextRank: rank + 1,
  }));
}
export function getRewardChoices(state) {
  const pending = state.pendingRewards[0];
  if (!pending) return [];
  return pending.choices.map((id) => ({
    ...state.definition.equipment[id],
    id,
    rank: state.equipment[id] ?? 0,
    nextRank: (state.equipment[id] ?? 0) + 1,
  }));
}
