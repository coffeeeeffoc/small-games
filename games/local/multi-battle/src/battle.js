import { clone, def, random, seedOf, stats } from './shared.js';

/** Resolve the six-slot battle copies; remaining and teams are always [left, right]. */
export function simulateBattle(leftBoard, rightBoard, seed, { record = true } = {}) {
  const rng = { rng: typeof seed === 'number' ? seed : seedOf(seed) };
  const firstSide = random(rng) < 0.5 ? 0 : 1;
  const sideOrder = [firstSide, 1 - firstSide];
  const teams = [leftBoard, rightBoard].map((board, side) => {
    if (!Array.isArray(board) || board.length > 6) throw new Error('战场最多六格');
    return Array.from({ length: 6 }, (_, slot) => {
      const card = board[slot];
      if (!card) return null;
      if (def(card)?.type !== 'character' || typeof card.level !== 'bigint' || card.level < 1n) throw new Error('战场角色无效');
      const values = stats(card, true);
      return { ...clone(card), ...values, maxHealth: values.health, token: false, side, slot,
        taunt: def(card).key === 'mercenary', battleUsed: {} };
    });
  });
  const original = teams.map(team => team.filter(Boolean));
  const startingHealth = original.map(team => new Map(team.map(unit => [unit, unit.health])));
  const summoned = [0, 0];
  const frames = [];
  const queue = [];
  let actions = 0;
  const alive = unit => unit && teams[unit.side][unit.slot] === unit && unit.health > 0n;
  const ordered = () => sideOrder.flatMap(side => teams[side].filter(Boolean));
  const name = unit => def(unit)?.name ?? (unit.defId.endsWith('ash_puppet') ? '灰烬纸偶' : '替身纸偶');
  const emit = (type, text, actor, target, targets) => {
    if (record) frames.push({ type, text, ...(actor ? { actor: actor.uid } : {}),
      ...(target ? { target: target.uid } : {}), ...(targets ? { targets: targets.map(unit => unit.uid) } : {}), teams: clone(teams) });
  };
  const heal = (unit, amount) => {
    const missing = unit.maxHealth - unit.health;
    const restored = amount < missing ? amount : missing;
    unit.health += restored;
    return restored;
  };
  const drain = () => {
    // All repeatable death listeners and summons have card-defined limits; no arbitrary chain truncation.
    for (let cursor = 0; cursor < queue.length; cursor++) queue[cursor]();
    queue.length = 0;
  };

  function summon(source, key, attack, health) {
    if (summoned[source.side] >= 12) return;
    const team = teams[source.side];
    const slot = team[source.slot] ? team.indexOf(null) : source.slot;
    if (slot < 0) return;
    const unit = { uid: `battle-${source.side}-token-${++summoned[source.side]}`, defId: `token.ember.${key}`,
      level: 1n, equipment: [], prep: {}, attack, health, maxHealth: health, shield: 0n,
      token: true, side: source.side, slot, taunt: false, battleUsed: {} };
    team[slot] = unit;
    emit('summon', `${name(source)}召唤${name(unit)}`, source, unit);
  }

  function enqueueDeath(dead, survivors) {
    const sources = [...survivors.filter(unit => unit.side === dead.side), dead].sort((a, b) => a.slot - b.slot);
    for (const source of sources) {
      const key = def(source)?.key;
      if (source === dead) {
        if (key === 'gravekeeper') queue.push(() => summon(source, 'ash_puppet', 2n, 3n));
        for (const item of source.equipment) if (def(item).key === 'wick') queue.push(() => {
          const targets = teams[source.side].filter(Boolean);
          for (const target of targets) target.shield += 3n;
          if (targets.length) emit('skill', `${name(source)}的余烬灯芯为友军增加 3 护盾`, source, null, targets);
        });
        if (source.prep.deathSummon) queue.push(() => {
          summon(source, 'decoy', 1n, 2n);
          summon(source, 'decoy', 1n, 2n);
        });
      } else if (key === 'reaper') queue.push(() => {
        if (!alive(source) || (source.battleUsed.reaper || 0) >= 6) return;
        source.battleUsed.reaper = (source.battleUsed.reaper || 0) + 1;
        source.attack += 1n;
        const restored = heal(source, 2n);
        emit('skill', `${name(source)}收割余烬：+1 攻击，恢复 ${restored} 生命`, source);
      });
      else if (key === 'queen') queue.push(() => {
        if (!alive(source) || (source.battleUsed.queen || 0) >= 3) return;
        const target = teams[1 - source.side].filter(Boolean).reduce((lowest, unit) => !lowest || unit.health < lowest.health ? unit : lowest, null);
        if (!target) return;
        source.battleUsed.queen = (source.battleUsed.queen || 0) + 1;
        damage([[target, source.attack]], 'skill', `${name(source)}焚冕追击 ${name(target)}，造成 ${source.attack} 伤害`, source, target);
      });
    }
  }

  function removeDead(wounded = []) {
    const dead = ordered().filter(unit => unit.health <= 0n);
    for (const unit of dead) teams[unit.side][unit.slot] = null;
    if (dead.length) emit('death', `${dead.map(name).join('、')}阵亡`, null, dead[0], dead);
    const survivors = ordered();
    for (const unit of survivors) if (wounded.includes(unit) && def(unit)?.key === 'duelist') queue.push(() => {
      if (!alive(unit) || unit.battleUsed.duelist || unit.health * 2n > unit.maxHealth) return;
      unit.battleUsed.duelist = 1;
      const restored = heal(unit, unit.attack);
      emit('skill', `${name(unit)}绝地奋战，恢复 ${restored} 生命`, unit);
    });
    // Freeze each event's listeners after the entire simultaneous death batch has left the board.
    for (const unit of dead) enqueueDeath(unit, survivors);
  }

  function damage(hits, type, text, actor, target) {
    const wounded = [];
    const saved = [];
    for (const [unit, amount] of hits) {
      if (!alive(unit)) continue;
      const absorbed = amount < unit.shield ? amount : unit.shield;
      unit.shield -= absorbed;
      const loss = amount - absorbed;
      if (loss <= 0n) continue;
      const healthBefore = unit.health;
      unit.health -= loss;
      if (unit.health <= 0n && !unit.battleUsed.last_stand && unit.equipment.some(item => def(item).key === 'last_stand')) {
        unit.health = 1n;
        unit.battleUsed.last_stand = 1;
        saved.push(unit);
      }
      if (unit.health < healthBefore) wounded.push(unit);
    }
    emit(type, text, actor, target, hits.map(([unit]) => unit));
    for (const unit of saved) emit('skill', `${name(unit)}的不屈挂坠使其保留 1 生命`, unit);
    removeDead(wounded);
  }

  function opening(source, effect) {
    if (!alive(source)) return;
    const enemies = teams[1 - source.side].filter(Boolean);
    if (effect === 'offering') {
      const allies = teams[source.side].filter(unit => unit && unit !== source);
      for (const unit of allies) unit.attack += 2n;
      source.health = 0n;
      emit('skill', `${name(source)}赴火：其他友军 +2 攻击，自身牺牲`, source, null, allies);
      removeDead();
    } else if (enemies.length) {
      if (effect === 'starfall') {
        const amount = source.attack / 2n;
        damage(enemies.map(unit => [unit, amount]), 'skill', `${name(source)}释放星落仪式，全体敌人受到 ${amount} 伤害`, source);
      } else if (effect === 'cannon' || effect === 'firemark') {
        const target = enemies[Math.floor(random(rng) * enemies.length)];
        const amount = effect === 'cannon' ? source.attack : source.level + 4n;
        damage([[target, amount]], 'skill', `${name(source)}${effect === 'cannon' ? '符文射击' : '引爆焰印'}，对 ${name(target)}造成 ${amount} 伤害`, source, target);
      }
    }
  }

  emit('start', `${firstSide === 0 ? '我方' : '对方'}率先行动`);
  for (const unit of ordered()) {
    const key = def(unit).key;
    if (key === 'rivet_guard' && unit.equipment.length) {
      unit.shield += 4n;
      emit('skill', `${name(unit)}获得 4 护盾`, unit);
    }
    if (key === 'commander') {
      const targets = teams[unit.side].filter(target => target && target.equipment.length === 2);
      for (const target of targets) target.shield += 6n;
      if (targets.length) emit('skill', `${name(unit)}为满装友军增加 6 护盾`, unit, null, targets);
    }
    for (const item of unit.equipment) if (def(item).key === 'tempered_plate') {
      unit.shield += unit.level + 2n;
      emit('skill', `${name(unit)}的百炼战甲增加 ${unit.level + 2n} 护盾`, unit);
    }
  }
  const openers = ordered().flatMap(source => source.prep.opening.map(effect => ({ source, effect })));
  for (const { source, effect } of openers) { opening(source, effect); drain(); }

  const hasUnits = side => teams[side].some(Boolean);
  const cursors = [0, 0];
  let side = firstSide;
  while (hasUnits(0) && hasUnits(1) && actions < 60) {
    let actor;
    for (let offset = 0; offset < 6; offset++) {
      actor = teams[side][(cursors[side] + offset) % 6];
      if (actor) break;
    }
    cursors[side] = (actor.slot + 1) % 6;
    const enemies = teams[1 - side].filter(Boolean);
    const target = enemies.find(unit => unit.taunt) || enemies[0];
    const attack = actor.attack + (def(actor)?.key === 'shieldbreaker' && target.shield > 0n ? 4n : 0n);
    const counter = target.attack;
    actions++;
    damage([[target, attack], [actor, counter]], 'attack', `${name(actor)}攻击 ${name(target)}（${attack} 伤害 / ${counter} 反击）`, actor, target);
    drain();
    if (alive(actor) && def(actor)?.key === 'medic') {
      const ally = teams[side].filter(Boolean).reduce((lowest, unit) => !lowest || unit.health * lowest.maxHealth < lowest.health * unit.maxHealth ? unit : lowest, null);
      const restored = heal(ally, 2n);
      if (restored) emit('skill', `${name(actor)}为 ${name(ally)}恢复 ${restored} 生命`, actor, ally);
    }
    side = 1 - side;
  }

  const ratios = original.map((team, side) => ({
    current: team.reduce((sum, unit) => sum + (alive(unit) ? (unit.health < startingHealth[side].get(unit) ? unit.health : startingHealth[side].get(unit)) : 0n), 0n),
    initial: team.reduce((sum, unit) => sum + startingHealth[side].get(unit), 0n)
  }));
  const timedOut = actions === 60 && hasUnits(0) && hasUnits(1);
  let winner = null;
  if (hasUnits(0) !== hasUnits(1)) winner = hasUnits(0) ? 0 : 1;
  else if (timedOut) {
    const left = ratios[0].current * ratios[1].initial;
    const right = ratios[1].current * ratios[0].initial;
    if (left !== right) winner = left > right ? 0 : 1;
  }
  emit('end', `${timedOut ? '达到 60 行动，比较本体生命留存比例。' : ''}${winner === null ? '本场平局' : winner === 0 ? '我方获胜' : '对方获胜'}`);
  return { winner, remaining: original.map(team => team.filter(alive).length), actions, frames,
    summoned, firstSide, timedOut, ratios, teams: clone(teams), rng: rng.rng };
}
