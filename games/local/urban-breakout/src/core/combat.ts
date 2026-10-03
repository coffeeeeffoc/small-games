import { ENEMIES, WEAPONS } from '../content/levels.ts';
import { clamp, memberPosition, randomFor, supplyPosition, supplyReachable } from './geometry.ts';
import { damageSupply, emit } from './rewards.ts';
import { HZ, PLAYER_Z, type Enemy, type GameState, type Member, type WeaponId } from './types.ts';
export function damageEnemy(
  state: GameState,
  enemy: Enemy,
  damage: number,
  fromX: number,
  fromZ: number,
  explosive = false,
  weapon?: WeaponId,
) {
  if (enemy.hp <= 0) return;
  const frontal = Math.abs(fromX - enemy.x) / Math.max(0.1, Math.abs(fromZ - enemy.z)) < 0.35;
  const armored =
    !explosive &&
    ((enemy.kind === 'shield' && frontal) ||
      (enemy.kind === 'boss' && enemy.armorUntil <= state.tick));
  if (enemy.kind === 'shield' && armored) damage *= 0.25;
  if (enemy.kind === 'boss' && armored) damage *= 0.6;
  state.stats.forwardDamage += Math.min(enemy.hp, damage);
  enemy.hp -= damage;
  if (state.tick - enemy.hitTick >= 8) {
    enemy.hitTick = state.tick;
    emit(state, {
      kind: 'hit',
      x: enemy.x,
      z: enemy.z,
      fromX,
      fromZ,
      weapon,
      entityId: enemy.id,
      enemyKind: enemy.kind,
      surface: armored ? 'armor' : 'flesh',
    });
  }
  if (enemy.hp <= 0) {
    state.stats.kills++;
    state.stats.score += ENEMIES[enemy.kind].score;
    if (enemy.kind === 'boss') state.bossDefeated = true;
    emit(state, {
      kind: 'death',
      x: enemy.x,
      z: enemy.z,
      fromX,
      fromZ,
      weapon,
      entityId: enemy.id,
      enemyKind: enemy.kind,
    });
  }
}
function hurtMember(state: GameState, member: Member, amount: number) {
  const absorb = Math.min(state.shield, amount);
  state.shield -= absorb;
  amount -= absorb;
  if (amount <= 0) return;
  const p = memberPosition(state, member);
  member.hp = Math.max(0, member.hp - amount);
  emit(state, { kind: 'hurt', ...p, label: member.hp <= 0 ? '队员失守 −1' : undefined });
  if (member.hp === 0) state.stats.lost++;
}
export function spawnWaves(state: GameState) {
  for (const wave of state.level.waves) {
    if (wave.tick !== state.tick) continue;
    for (let i = 0; i < wave.count; i++) {
      const id = `${wave.id}:${i}`,
        def = ENEMIES[wave.kind];
      state.enemies.push({
        id,
        kind: wave.kind,
        x: clamp(
          (wave.x ?? 0) +
            (randomFor(state.seed, `${id}:x`) - 0.5) * (wave.x === undefined ? 7 : 2.2),
          -4.2,
          4.2,
        ),
        z: (wave.z ?? -24) - Math.floor(i / 5) * 0.85,
        hp: wave.hp ?? def.hp,
        maxHp: wave.hp ?? def.hp,
        nextAttack: 0,
        hitTick: -100,
        born: state.tick,
        aimX: 0,
        armorUntil: 0,
        dashX: 0,
        dashZ: 0,
      });
    }
    if (wave.kind === 'runner' || wave.kind === 'boss')
      emit(state, {
        kind: 'warning',
        enemyKind: wave.kind,
        x: 0,
        z: 0,
        label:
          wave.kind === 'boss'
            ? '街口冲撞者 · 横移躲开橙红预警'
            : '冲刺者接近 · 离开补给带，回防！',
      });
  }
}
export function shoot(state: GameState) {
  const supply = state.supplies.find((s) => s.config.id === state.focus);
  // ponytail: bounded <= 80 enemies per wave; spatial buckets when measured target scans dominate.
  for (const member of state.members) {
    if (member.hp <= 0 || state.tick < member.nextShot) continue;
    const p = memberPosition(state, member),
      w = WEAPONS[member.weapon];
    let target: { x: number; z: number } | undefined;
    let enemy: Enemy | undefined;
    if (supply) {
      if (supplyReachable(state, supply, p.x, p.z, w.range))
        target = supplyPosition(supply, state.tick);
      // The entire squad has given up front fire, even members out of supply range.
    } else {
      enemy = state.enemies
        .filter(
          (e) =>
            e.hp > 0 &&
            e.z <= p.z + 0.2 &&
            Math.hypot(e.x - p.x, e.z - p.z) <= w.range &&
            Math.abs(e.x - p.x) <= 1.8 + Math.max(0, p.z - e.z) * 0.34,
        )
        .sort((a, b) => b.z - a.z || a.id.localeCompare(b.id))[0];
      if (enemy) target = enemy;
    }
    if (!target) continue;
    member.nextShot =
      state.tick + Math.ceil(w.cooldown * (state.hasteUntil > state.tick ? 0.65 : 1));
    state.stats.shots++;
    emit(state, {
      kind: 'shot',
      ...p,
      toX: target.x,
      toZ: target.z,
      weapon: member.weapon,
      memberId: member.id,
    });
    if (member.weapon === 'grenade') {
      const travel = Math.max(8, Math.ceil((Math.hypot(target.x - p.x, target.z - p.z) / 18) * HZ));
      const landing = supply ? supplyPosition(supply, state.tick + travel) : target;
      state.projectiles.push({
        id: `${member.id}:${state.tick}`,
        x: p.x,
        z: p.z,
        fromX: p.x,
        fromZ: p.z,
        toX: landing.x,
        toZ: landing.z,
        born: state.tick,
        land: state.tick + travel,
        damage: w.damage,
        supplyId: supply?.config.id ?? null,
      });
    } else if (supply)
      damageSupply(state, supply, w.damage, { fromX: p.x, fromZ: p.z, weapon: member.weapon });
    else if (enemy) {
      if (member.weapon === 'shotgun') {
        const aim = Math.atan2(enemy.x - p.x, p.z - enemy.z);
        for (const e of state.enemies) {
          const distance = Math.hypot(e.x - p.x, e.z - p.z);
          if (
            e.hp > 0 &&
            e.z <= p.z &&
            distance <= w.range &&
            Math.abs(Math.atan2(e.x - p.x, p.z - e.z) - aim) < 0.36
          )
            damageEnemy(state, e, w.damage, p.x, p.z, false, member.weapon);
        }
      } else damageEnemy(state, enemy, w.damage, p.x, p.z, false, member.weapon);
    }
  }
}
export function projectiles(state: GameState) {
  for (const p of state.projectiles) {
    const t = clamp((state.tick - p.born) / (p.land - p.born), 0, 1);
    p.x = p.fromX + (p.toX - p.fromX) * t;
    p.z = p.fromZ + (p.toZ - p.fromZ) * t;
    if (state.tick < p.land) continue;
    emit(state, { kind: 'blast', x: p.toX, z: p.toZ });
    // One explosion, geometric coverage. No duplicate forward damage for a crate shot.
    for (const e of state.enemies)
      if (Math.hypot(e.x - p.toX, e.z - p.toZ) <= WEAPONS.grenade.radius)
        damageEnemy(state, e, p.damage, p.fromX, p.fromZ, true, 'grenade');
    for (const supply of state.supplies) {
      const q = supplyPosition(supply, state.tick);
      if (Math.hypot(q.x - p.toX, q.z - p.toZ) <= WEAPONS.grenade.radius)
        damageSupply(state, supply, p.damage);
    }
  }
  state.projectiles = state.projectiles.filter((p) => p.land > state.tick);
}
export function skill(state: GameState) {
  if (state.skillReady > state.tick) return;
  state.skillReady = state.tick + 24 * HZ;
  emit(state, { kind: 'blast', x: state.x, z: 1, label: '震荡弹 · 前方清场' });
  for (const enemy of state.enemies)
    if (Math.hypot(enemy.x - state.x, enemy.z - 1) <= 9)
      damageEnemy(state, enemy, 90, state.x, PLAYER_Z, true);
}
export function moveEnemies(state: GameState) {
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue;
    const live = state.members.filter((m) => m.hp > 0);
    if (!live.length) break;
    const member = live.reduce((a, b) => {
      const pa = memberPosition(state, a),
        pb = memberPosition(state, b);
      return Math.hypot(pa.x - enemy.x, pa.z - enemy.z) <=
        Math.hypot(pb.x - enemy.x, pb.z - enemy.z)
        ? a
        : b;
    });
    const p = memberPosition(state, member),
      def = ENEMIES[enemy.kind];
    if (enemy.kind === 'boss') {
      const cycle = (state.tick - enemy.born) % 210;
      if (cycle === 60 || cycle === 140) {
        enemy.aimX = state.x;
        emit(state, { kind: 'warning', x: enemy.aimX, z: enemy.z, enemyKind: 'boss' });
      }
      if (cycle === 90) {
        enemy.dashX = enemy.x;
        enemy.dashZ = enemy.z;
      }
      if (cycle >= 90 && cycle <= 114) {
        const progress = cycle <= 102 ? (cycle - 90) / 12 : (114 - cycle) / 12;
        enemy.x = enemy.dashX + (enemy.aimX - enemy.dashX) * progress;
        enemy.z = enemy.dashZ + (PLAYER_Z - 1 - enemy.dashZ) * progress;
      } else enemy.z = Math.min(0, enemy.z + def.speed / HZ);
      if (cycle === 102 || cycle === 182) {
        const radius = cycle === 102 ? 1.35 : 2.15;
        for (const m of live)
          if (Math.abs(memberPosition(state, m).x - enemy.aimX) < radius)
            hurtMember(state, m, cycle === 102 ? 12 : 8);
        emit(state, {
          kind: 'blast',
          x: enemy.aimX,
          z: PLAYER_Z,
          label: cycle === 102 ? '冲撞' : '震地',
        });
      }
    } else {
      enemy.x += clamp(p.x - enemy.x, (-def.speed * 0.65) / HZ, (def.speed * 0.65) / HZ);
      enemy.z = Math.min(p.z - 0.7, enemy.z + def.speed / HZ);
      if (Math.hypot(p.x - enemy.x, p.z - enemy.z) < 1.15 && state.tick >= enemy.nextAttack) {
        hurtMember(state, member, def.damage);
        enemy.nextAttack = state.tick + def.cooldown;
      }
    }
  }
  state.enemies = state.enemies.filter((e) => e.hp > 0);
}
