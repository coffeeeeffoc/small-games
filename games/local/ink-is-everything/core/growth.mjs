import { nextId, effect, notice } from './events.mjs';
import { getPlayerStats } from './stats.mjs';
import { restoreInk } from './resources.mjs';

export function synchronizeMaximum(state, restoreDifference = false) {
  const previous = state.player.maxInk;
  state.player.maxInk = getPlayerStats(state).maxInk;
  state.player.ink = Math.min(state.player.ink, state.player.maxInk);
  if (restoreDifference) restoreInk(state, Math.max(0, state.player.maxInk - previous), 'growth');
}
export function queueReward(state, { pool, title, source = 'equipment' } = {}) {
  const definition = state.definition;
  const candidates = [
    ...new Set(pool ?? definition.progression.rewardPool ?? Object.keys(definition.equipment)),
  ].filter(
    (id) =>
      definition.equipment[id] &&
      (state.equipment[id] ?? 0) < (definition.equipment[id].maxRank ?? 1),
  );
  if (!candidates.length) {
    restoreInk(state, definition.progression.fallbackInk, 'pickup');
    return null;
  }
  // Deterministic rotation makes a saved reward stable, without repeatedly rerolling on reload.
  const offset = state.stats.rewardsOffered % candidates.length;
  const choices = [...candidates.slice(offset), ...candidates.slice(0, offset)].slice(
    0,
    definition.progression.choiceCount,
  );
  const result = {
    id: nextId(state, 'reward'),
    source,
    title: title ?? definition.progression.choiceTitle ?? '选择成长',
    choices,
  };
  state.pendingRewards.push(result);
  state.stats.rewardsOffered++;
  return result;
}
export function gainExperience(state, value) {
  if (value <= 0 || state.status === 'lost') return;
  const progression = state.progression,
    definition = state.definition.progression;
  progression.xp += value;
  while (progression.xp >= progression.nextXp) {
    progression.xp -= progression.nextXp;
    progression.level++;
    progression.nextXp = definition.baseNextXp + (progression.level - 1) * definition.xpGrowth;
    synchronizeMaximum(state);
    restoreInk(state, definition.inkPerLevel, 'growth');
    state.stats.levelsGained++;
    effect(state, 'levelup', state.player.x, state.player.y, {
      text: `Lv.${progression.level}`,
      radius: 80,
      life: 1.1,
    });
    queueReward(state, {
      source: 'level',
      title: `${definition.levelTitle ?? '升级'} · ${progression.level}`,
    });
  }
}
export function equipItem(state, id) {
  const item = state.definition.equipment[id];
  if (!item || (state.equipment[id] ?? 0) >= (item.maxRank ?? 1)) return false;
  state.equipment[id] = (state.equipment[id] ?? 0) + 1;
  synchronizeMaximum(state, true);
  // Deferred rewards may coexist with purchases; maxed options must not strand the queue.
  const retained = [];
  for (const pending of state.pendingRewards) {
    pending.choices = pending.choices.filter(
      (choice) => (state.equipment[choice] ?? 0) < (state.definition.equipment[choice].maxRank ?? 1),
    );
    if (pending.choices.length) retained.push(pending);
    else restoreInk(state, state.definition.progression.fallbackInk, 'pickup');
  }
  state.pendingRewards.splice(0, state.pendingRewards.length, ...retained);
  state.stats.equipmentFound++;
  effect(state, 'gear', state.player.x, state.player.y, {
    text: `${item.name} +${state.equipment[id]}`,
    life: 1.3,
  });
  notice(state, `${item.name} · ${state.equipment[id]}/${item.maxRank ?? 1}`);
  return true;
}
export function chooseReward(state, itemId) {
  const pending = state.pendingRewards[0];
  if (!pending || !pending.choices.includes(itemId))
    return { ok: false, message: '请选择当前奖励中的装备' };
  if ((state.equipment[itemId] ?? 0) >= (state.definition.equipment[itemId].maxRank ?? 1))
    return { ok: false, message: '该装备已达上限' };
  state.pendingRewards.shift();
  equipItem(state, itemId);
  state.stats.rewardsChosen++;
  return { ok: true, message: state.message };
}
