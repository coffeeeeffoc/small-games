import { LEVELS } from './levels.mjs';

const EPSILON = 0.00001;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const normalized = (x, y) => {
  const d = Math.hypot(x, y) || 1;
  return { x: x / d, y: y / d };
};
const levelFor = (state) => LEVELS[state.levelId];
const rulesFor = (state) => levelFor(state).rules;
const upgraded = (state, id) => state.contracts.includes(id);
export const getRoom = (state, id = state.roomId) => state.rooms[id];
export const getSnapshot = (state) => structuredClone(state);
export const serializeGame = (state) => JSON.stringify(getSnapshot(state));
const config = {
  blot: { hp: 8, r: 20, speed: 90, ink: 4, name: '洇墨灵' },
  spitter: { hp: 9, r: 22, speed: 65, ink: 5, name: '吐墨者' },
  guard: { hp: 22, r: 28, speed: 88, ink: 7, name: '断笔守卫' },
  boss: { hp: 110, r: 43, speed: 70, ink: 0, name: '终页守门者' },
};
const nextId = (state, prefix) => `${prefix}-${++state.serial}`;
function effect(state, type, x, y, props = {}) {
  const life = props.life ?? 0.36;
  state.effects.push({ id: nextId(state, 'fx'), type, x, y, life, maxLife: life, ...props });
}
function notice(state, message) {
  state.message = message;
  state.messageTimer = 3.2;
  state.log.push(message);
  if (state.log.length > 30) state.log.shift();
}
function spawnEnemy(state, data, index = 0) {
  const type = config[data.type] ? data.type : 'blot';
  return {
    id: nextId(state, 'foe'),
    type,
    ...config[type],
    maxHp: data.hp ?? config[type].hp,
    state: 'chase',
    timer: 0.7 + index * 0.22,
    aimX: -1,
    aimY: 0,
    phase: 1,
    cycle: 0,
    windupTime: 0.8,
    attackKind: 'lunge',
    ...data,
    hp: data.hp ?? config[type].hp,
  };
}
function loadRoom(state, id, spawn) {
  const room = getRoom(state, id);
  if (!room.visited) {
    room.visited = true;
    state.stats.roomsVisited++;
    room.enemies = room.enemySpawns.map((data, i) => spawnEnemy(state, data, i));
  }
  state.roomId = id;
  state.enemies = room.enemies;
  state.pickups = room.pickups;
  state.projectiles = [];
  state.effects = [];
  Object.assign(state.player, spawn, { dashTimer: 0, invuln: Math.max(state.player.invuln, 0.65) });
  state.transitionCd = 0.8;
  state.roomIntroTimer = 2.5;
  notice(state, room.subtitle);
}
export function createGame(levelId = 'chapter-1') {
  const level = LEVELS[levelId];
  if (!level) throw new Error(`未知章节：${levelId}`);
  const state = {
    version: 2,
    levelId,
    status: 'ready',
    roomId: level.start,
    serial: 0,
    time: 0,
    seals: 0,
    contracts: [],
    log: [],
    message: '',
    messageTimer: 0,
    transitionCd: 0,
    player: {
      ...level.spawn,
      ...level.initial,
      r: 17,
      aimX: 1,
      aimY: 0,
      dashCd: 0,
      dashTimer: 0,
      dashX: 1,
      dashY: 0,
      meleeCd: 0,
      shootCd: 0,
      invuln: 0,
      healCd: 0,
    },
    enemies: [],
    projectiles: [],
    pickups: [],
    effects: [],
    rooms: Object.fromEntries(
      level.rooms.map((room) => [
        room.id,
        {
          ...structuredClone(room),
          visited: false,
          cleared: !room.enemySpawns.length && !room.waves.length,
          rewardClaimed: false,
          waveIndex: 0,
          waveTimer: 0,
          enemies: [],
          pickups: [],
        },
      ]),
    ),
    stats: {
      spent: { attack: 0, heal: 0, explore: 0, trade: 0 },
      shots: 0,
      hits: 0,
      freeAttacks: 0,
      dashes: 0,
      enemiesDefeated: 0,
      inkRecovered: 0,
      damageTaken: 0,
      roomsVisited: 0,
      heals: 0,
      trades: 0,
      bridgesDrawn: 0,
      drawn: 0,
      kills: 0,
      inkSpent: 0,
    },
  };
  loadRoom(state, level.start, level.spawn);
  return state;
}
function solidObstacles(room) {
  return room.obstacles.filter(
    (obstacle) =>
      !obstacle.bridgeId || !room.bridges.find((bridge) => bridge.id === obstacle.bridgeId)?.drawn,
  );
}
function circleRect(actor, rect) {
  return (
    Math.hypot(
      actor.x - clamp(actor.x, rect.x, rect.x + rect.w),
      actor.y - clamp(actor.y, rect.y, rect.y + rect.h),
    ) < actor.r
  );
}
function blocked(room, actor) {
  return (
    actor.x - actor.r < 33 ||
    actor.y - actor.r < 33 ||
    actor.x + actor.r > room.width - 33 ||
    actor.y + actor.r > room.height - 33 ||
    solidObstacles(room).some((rect) => circleRect(actor, rect))
  );
}
function moveActor(room, actor, dx, dy) {
  // Small substeps avoid tunnelling through corners during a dash or charge.
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 8));
  let moved = false;
  for (let i = 0; i < steps; i++) {
    const oldX = actor.x;
    actor.x = clamp(actor.x + dx / steps, 33 + actor.r, room.width - 33 - actor.r);
    if (solidObstacles(room).some((rect) => circleRect(actor, rect))) actor.x = oldX;
    const oldY = actor.y;
    actor.y = clamp(actor.y + dy / steps, 33 + actor.r, room.height - 33 - actor.r);
    if (solidObstacles(room).some((rect) => circleRect(actor, rect))) actor.y = oldY;
    moved ||= actor.x !== oldX || actor.y !== oldY;
  }
  return moved;
}
function spend(state, amount, category) {
  if (state.player.ink < amount) return false;
  state.player.ink -= amount;
  state.stats.spent[category] += amount;
  state.stats.inkSpent += amount;
  return true;
}
function addPickup(state, kind, x, y, value) {
  state.pickups.push({
    id: nextId(state, 'drop'),
    kind,
    x,
    y,
    r: kind === 'seal' ? 15 : 9,
    value,
    age: 0,
  });
}
function reward(state, rewards, x, y) {
  if (rewards.ink) addPickup(state, 'ink', x - 14, y, rewards.ink);
  if (rewards.hp) addPickup(state, 'heart', x + 14, y, rewards.hp);
  if (rewards.seals) addPickup(state, 'seal', x, y - 12, rewards.seals);
}
function hurtEnemy(state, enemy, damage, fromX, fromY, knockback = 0) {
  if (enemy.hp <= 0) return;
  enemy.hp = Math.max(0, enemy.hp - damage);
  enemy.flash = 0.15;
  state.stats.hits++;
  effect(state, 'hit', enemy.x, enemy.y, { radius: enemy.r, text: `−${damage}`, life: 0.42 });
  if (knockback && enemy.type !== 'boss') {
    const direction = normalized(enemy.x - fromX, enemy.y - fromY);
    moveActor(getRoom(state), enemy, direction.x * knockback, direction.y * knockback);
  }
  if (!enemy.hp) {
    state.stats.enemiesDefeated++;
    state.stats.kills++;
    effect(state, 'death', enemy.x, enemy.y, { radius: enemy.r + 12, life: 0.7 });
    if (enemy.ink) addPickup(state, 'ink', enemy.x, enemy.y, enemy.ink);
    if (state.stats.enemiesDefeated % 5 === 0 && enemy.type !== 'boss')
      addPickup(state, 'heart', enemy.x + 18, enemy.y, 1);
  }
}
function hurtPlayer(state, damage, source) {
  const p = state.player;
  if (p.invuln > 0 || state.status !== 'playing') return false;
  p.hp = Math.max(0, p.hp - damage);
  p.invuln = 1.0;
  state.stats.damageTaken += damage;
  state.shake = 0.22;
  effect(state, 'hit', p.x, p.y, { radius: 27, text: `−${damage} ♥`, life: 0.55 });
  if (source) {
    const direction = normalized(p.x - source.x, p.y - source.y);
    moveActor(getRoom(state), p, direction.x * 24, direction.y * 24);
  }
  if (p.hp === 0) {
    state.status = 'lost';
    notice(state, '这一页被墨吞没了。看准红色蓄力，再闪避反击。');
  }
  return true;
}
function shoot(state, owner, x, y, dx, dy, props = {}) {
  const direction = normalized(dx, dy);
  const speed = props.speed ?? (owner === 'player' ? 620 : 175);
  state.projectiles.push({
    id: nextId(state, 'shot'),
    owner,
    x,
    y,
    vx: direction.x * speed,
    vy: direction.y * speed,
    r: owner === 'player' ? 6 : 9,
    damage: props.damage ?? 1,
    life: props.life ?? 4,
    ...props,
  });
}
function playerActions(state, input, dt) {
  const p = state.player;
  const rules = rulesFor(state);
  for (const key of ['dashCd', 'meleeCd', 'shootCd', 'invuln', 'healCd'])
    p[key] = Math.max(0, p[key] - dt);
  if (
    Number.isFinite(input.aimX) &&
    Number.isFinite(input.aimY) &&
    Math.hypot(input.aimX - p.x, input.aimY - p.y) > 2
  ) {
    const aim = normalized(input.aimX - p.x, input.aimY - p.y);
    p.aimX = aim.x;
    p.aimY = aim.y;
  }
  const mx = clamp(Number(input.moveX) || 0, -1, 1),
    my = clamp(Number(input.moveY) || 0, -1, 1);
  const move = normalized(mx, my);
  const magnitude = Math.min(1, Math.hypot(mx, my));
  if (input.dash && p.dashCd <= EPSILON) {
    p.dashX = magnitude ? move.x : p.aimX;
    p.dashY = magnitude ? move.y : p.aimY;
    p.dashTimer = rules.dashDuration;
    p.dashCd = upgraded(state, 'brush-step') ? 0.72 : rules.dashCooldown;
    p.invuln = Math.max(p.invuln, rules.dashInvuln);
    state.stats.dashes++;
    effect(state, 'dash', p.x, p.y, { angle: Math.atan2(p.dashY, p.dashX), life: 0.26 });
  }
  if (p.dashTimer > 0) {
    const dashDt = Math.min(dt, p.dashTimer);
    moveActor(getRoom(state), p, p.dashX * 720 * dashDt, p.dashY * 720 * dashDt);
    p.dashTimer = Math.max(0, p.dashTimer - dt);
  } else {
    const speed = rules.speed * (upgraded(state, 'brush-step') ? 1.1 : 1);
    moveActor(getRoom(state), p, move.x * speed * magnitude * dt, move.y * speed * magnitude * dt);
  }
  if (input.melee && p.meleeCd <= EPSILON) {
    p.meleeCd = rules.meleeCooldown;
    state.stats.freeAttacks++;
    effect(state, 'slash', p.x, p.y, {
      angle: Math.atan2(p.aimY, p.aimX),
      radius: rules.meleeRange,
      life: 0.2,
    });
    for (const enemy of state.enemies) {
      const d = distance(p, enemy);
      const facing = ((enemy.x - p.x) * p.aimX + (enemy.y - p.y) * p.aimY) / (d || 1);
      if (enemy.hp > 0 && d <= rules.meleeRange + enemy.r && facing > -0.15)
        hurtEnemy(
          state,
          enemy,
          rules.meleeDamage + (upgraded(state, 'fine-nib') ? 1 : 0),
          p.x,
          p.y,
          17,
        );
    }
  }
  if (input.shoot && p.shootCd <= EPSILON) {
    if (spend(state, rules.attackCost, 'attack')) {
      p.shootCd = rules.attackCooldown;
      state.stats.shots++;
      shoot(state, 'player', p.x + p.aimX * 22, p.y + p.aimY * 22, p.aimX, p.aimY, {
        damage: rules.attackDamage + (upgraded(state, 'fine-nib') ? 1 : 0),
      });
      effect(state, 'shot', p.x + p.aimX * 25, p.y + p.aimY * 25, {
        angle: Math.atan2(p.aimY, p.aimX),
        life: 0.1,
      });
    } else if (state.messageTimer < 1)
      notice(state, '墨水不足：干笔与闪避不消耗墨水，击败墨灵可拾取补给。');
  }
}
function beginWindup(state, enemy) {
  const p = state.player;
  const aim = normalized(p.x - enemy.x, p.y - enemy.y);
  enemy.aimX = aim.x;
  enemy.aimY = aim.y;
  enemy.state = 'windup';
  enemy.attackKind =
    enemy.type === 'spitter'
      ? 'burst'
      : enemy.type === 'boss'
        ? enemy.cycle % 2 === 0
          ? 'charge'
          : 'burst'
        : enemy.type === 'guard'
          ? 'charge'
          : 'lunge';
  enemy.windupTime =
    enemy.type === 'blot' ? 0.7 : enemy.type === 'boss' && enemy.phase === 2 ? 0.72 : 0.95;
  enemy.timer = enemy.windupTime;
  enemy.range = enemy.attackKind === 'burst' ? 430 : enemy.type === 'blot' ? 138 : 380;
}
function enemyAttack(state, enemy) {
  enemy.cycle++;
  if (enemy.attackKind === 'burst') {
    const count = enemy.type === 'boss' ? (enemy.phase === 2 ? 9 : 5) : 3;
    const spacing = enemy.type === 'boss' ? 0.25 : 0.14;
    const angle = Math.atan2(enemy.aimY, enemy.aimX);
    for (let i = 0; i < count; i++) {
      const a = angle + (i - (count - 1) / 2) * spacing;
      shoot(
        state,
        'enemy',
        enemy.x + Math.cos(a) * (enemy.r + 12),
        enemy.y + Math.sin(a) * (enemy.r + 12),
        Math.cos(a),
        Math.sin(a),
        { speed: enemy.type === 'boss' ? (enemy.phase === 2 ? 225 : 185) : 165 },
      );
    }
    enemy.state = 'recover';
    enemy.timer = enemy.type === 'boss' ? 1.35 : 1.5;
  } else {
    enemy.state = 'attack';
    enemy.timer = enemy.type === 'blot' ? 0.26 : 0.47;
    enemy.hitPlayer = false;
  }
}
function advanceEnemy(state, enemy, dt) {
  if (enemy.hp <= 0) return;
  enemy.flash = Math.max(0, (enemy.flash || 0) - dt);
  if (enemy.type === 'boss' && enemy.hp <= enemy.maxHp / 2 && enemy.phase === 1) {
    enemy.phase = 2;
    notice(state, '墨潮翻涌！守门者进入第二阶段，先躲开红色蓄力。');
    effect(state, 'text', enemy.x, enemy.y - 60, { text: '墨潮 · 第二阶段', life: 2 });
  }
  enemy.timer -= dt;
  const p = state.player;
  const d = distance(p, enemy);
  if (enemy.state === 'chase') {
    const direction = normalized(p.x - enemy.x, p.y - enemy.y);
    let speed = enemy.speed;
    if (enemy.type === 'spitter' && d < 170) speed *= -0.7;
    else if (enemy.type === 'spitter' && d < 315) speed = 0;
    else if (enemy.type === 'boss' && d < 190) speed = 0;
    moveActor(getRoom(state), enemy, direction.x * speed * dt, direction.y * speed * dt);
    const triggerRange = enemy.type === 'blot' ? 148 : enemy.type === 'spitter' ? 430 : 450;
    if (d < triggerRange && enemy.timer <= 0) beginWindup(state, enemy);
  } else if (enemy.state === 'windup') {
    if (enemy.timer <= 0) enemyAttack(state, enemy);
  } else if (enemy.state === 'attack') {
    const speed = enemy.type === 'blot' ? 440 : enemy.type === 'boss' ? 680 : 650;
    moveActor(getRoom(state), enemy, enemy.aimX * speed * dt, enemy.aimY * speed * dt);
    if (!enemy.hitPlayer && distance(p, enemy) < p.r + enemy.r + 5)
      enemy.hitPlayer = hurtPlayer(state, enemy.type === 'boss' ? 2 : 1, enemy);
    if (enemy.timer <= 0) {
      enemy.state = 'recover';
      enemy.timer = enemy.type === 'boss' ? 1.65 : enemy.type === 'guard' ? 1.5 : 1.05;
    }
  } else if (enemy.timer <= 0) {
    enemy.state = 'chase';
    enemy.timer = enemy.type === 'boss' && enemy.phase === 2 ? 0.1 : 0.28;
  }
}
function advanceProjectiles(state, dt) {
  const room = getRoom(state);
  for (const shot of state.projectiles) {
    if (shot.life <= 0) continue;
    // Sweep with samples shorter than a projectile diameter, including fast ink shots.
    const steps = Math.max(1, Math.ceil((Math.hypot(shot.vx, shot.vy) * dt) / 7));
    for (let i = 0; i < steps && shot.life > 0; i++) {
      shot.x += (shot.vx * dt) / steps;
      shot.y += (shot.vy * dt) / steps;
      // Projectiles can cross a chasm; pillars still block both sides' shots.
      if (
        shot.x < 28 ||
        shot.x > room.width - 28 ||
        shot.y < 28 ||
        shot.y > room.height - 28 ||
        room.obstacles.some((rect) => rect.kind !== 'pit' && circleRect(shot, rect))
      ) {
        shot.life = 0;
        break;
      }
      if (shot.owner === 'player') {
        const hit = state.enemies.find(
          (enemy) => enemy.hp > 0 && distance(shot, enemy) < shot.r + enemy.r,
        );
        if (hit) {
          hurtEnemy(state, hit, shot.damage, shot.x - shot.vx, shot.y - shot.vy, 4);
          shot.life = 0;
        }
      } else if (distance(shot, state.player) < shot.r + state.player.r) {
        hurtPlayer(state, shot.damage, shot);
        shot.life = 0;
      }
    }
    shot.life -= dt;
  }
  state.projectiles = state.projectiles.filter((shot) => shot.life > 0);
}
function collectPickups(state, dt) {
  const p = state.player;
  for (const pickup of state.pickups) {
    pickup.age += dt;
    let d = distance(pickup, p);
    if (d < 118 || (pickup.kind === 'seal' && getRoom(state).cleared)) {
      const direction = normalized(p.x - pickup.x, p.y - pickup.y);
      const travel = Math.min(d, (pickup.kind === 'seal' ? 450 : 360) * dt);
      pickup.x += direction.x * travel;
      pickup.y += direction.y * travel;
      d = distance(pickup, p);
    }
    if (d < p.r + pickup.r + 5) {
      pickup.collected = true;
      if (pickup.kind === 'ink') {
        const amount = Math.min(p.maxInk - p.ink, pickup.value);
        p.ink += amount;
        state.stats.inkRecovered += amount;
        effect(state, 'pickup', p.x, p.y - 25, { text: `+${amount} 墨`, life: 0.8 });
      }
      if (pickup.kind === 'heart') {
        const amount = Math.min(p.maxHp - p.hp, pickup.value);
        p.hp += amount;
        effect(state, 'pickup', p.x, p.y - 25, { text: `+${amount} ♥`, life: 0.8 });
      }
      if (pickup.kind === 'seal') {
        state.seals += pickup.value;
        effect(state, 'pickup', p.x, p.y - 25, { text: '钥印 +1', life: 1.5 });
        notice(
          state,
          state.seals >= levelFor(state).requiredSeals
            ? '两枚钥印已齐！回到洗笔驿站，打开东侧墨之门。'
            : '第一枚钥印到手！穿过东门，北上断笔兵营。',
        );
      }
    }
  }
  const retained = state.pickups.filter((pickup) => !pickup.collected);
  state.pickups.splice(0, state.pickups.length, ...retained);
}
function finishEncounter(state, dt) {
  const room = getRoom(state);
  room.enemies = state.enemies = state.enemies.filter((enemy) => enemy.hp > 0);
  if (room.cleared || state.enemies.length) return;
  if (room.waveIndex < room.waves.length) {
    if (!room.waveTimer) {
      room.waveTimer = 1.5;
      notice(state, '新的墨影正在聚拢……');
      effect(state, 'text', 480, 280, { text: '下一波守卫', life: 1.5 });
    }
    room.waveTimer -= dt;
    if (room.waveTimer <= 0) {
      room.enemies = state.enemies = room.waves[room.waveIndex++].map((data, i) =>
        spawnEnemy(state, data, i),
      );
      for (const enemy of state.enemies)
        effect(state, 'death', enemy.x, enemy.y, { radius: enemy.r + 25, life: 0.7 });
      room.waveTimer = 0;
    }
    return;
  }
  room.cleared = true;
  if (room.clearReward && !room.rewardClaimed) {
    reward(state, room.clearReward, state.player.x, state.player.y - 35);
    room.rewardClaimed = true;
  }
  if (room.id === levelFor(state).gate) {
    state.status = 'won';
    state.projectiles = [];
    notice(state, '终页已写完。每一滴墨，都留下了你的选择。');
  } else
    notice(
      state,
      room.id === 'archive'
        ? '书库安全了。走近北侧藏墨匣，自动拾取战利品。'
        : '墨影散去，前方的门已经开启。',
    );
}
export function getObjective(state) {
  const room = getRoom(state);
  if (state.status === 'won') return '墨之门已开启 · 第一章完成';
  if (state.status === 'lost') return '重新落笔，再试一次';
  if (room.id === 'gate') return '击败终页守门者';
  if (state.seals >= 2) return '前往洗笔驿站东门 · 挑战墨之门';
  if (room.id === 'archive')
    return room.cleared ? '走近北侧墨匣 · 34 墨 + 2 生命' : '可选宝库 · 清场后领取补给';
  if (state.seals === 1) return '前往驿站北门 · 夺回第二枚钥印';
  return '沿东侧门前进 · 寻找第一枚钥印';
}
export function getNearbyInteractable(state) {
  const room = getRoom(state);
  return (
    [...room.objects.filter((object) => !object.used), ...room.portals]
      .map((object) => ({ ...object, type: object.kind, distance: distance(state.player, object) }))
      .filter((object) => object.distance <= 106)
      .sort((a, b) => a.distance - b.distance)[0] ?? null
  );
}
function portalReason(state, portal) {
  const room = getRoom(state);
  if (portal.requiresClear && !room.cleared) return '先击败本房间的墨灵';
  if (portal.requiresSeals && state.seals < portal.requiresSeals)
    return `墨之门需要 ${portal.requiresSeals} 枚钥印（已有 ${state.seals}）`;
  if (portal.bridgeId && !room.bridges.find((bridge) => bridge.id === portal.bridgeId)?.drawn)
    return '先在锚点之间画出墨桥';
  return '';
}
function interactWith(state, object) {
  if (!object) return { ok: false, message: '走近门、墨匣、泉水或契约师后互动' };
  if (distance(state.player, object) > 106) return { ok: false, message: '再靠近一些' };
  if (object.kind === 'portal') {
    const reason = portalReason(state, object);
    if (reason) return { ok: false, message: reason };
    loadRoom(state, object.target, object.spawn);
    return { ok: true, message: `进入${getRoom(state).name}`, roomChanged: true };
  }
  if (object.used) return { ok: false, message: '这里的补给已经取走了' };
  if (object.requiresClear && !getRoom(state).cleared)
    return { ok: false, message: '先击败守护墨匣的墨灵' };
  if (object.kind === 'merchant')
    return { ok: true, message: '用同一池墨，换取本局永久能力。', shop: true };
  if (object.kind === 'spring' && state.player.hp >= state.player.maxHp)
    return { ok: false, message: '生命已满，泉水可以留到之后再用' };
  object.used = true;
  reward(state, object.reward ?? {}, object.x, object.y);
  effect(state, object.kind === 'spring' ? 'heal' : 'pickup', object.x, object.y, {
    radius: 50,
    life: 0.8,
  });
  return {
    ok: true,
    message: object.kind === 'spring' ? '泉水恢复生命，只能使用一次' : '墨匣开启，靠近即可拾取补给',
  };
}
export function command(state, action = {}) {
  let result;
  const p = state.player;
  if (action.type === 'restart') {
    Object.assign(state, createGame(action.levelId ?? state.levelId));
    state.status = 'playing';
    return { ok: true, message: '重新落笔' };
  }
  if (action.type === 'start') {
    if (state.status === 'ready') {
      state.status = 'playing';
      return { ok: true, message: '移动、瞄准，在纸上留下你的笔迹' };
    }
    return { ok: false, message: '冒险已经开始' };
  }
  if (state.status !== 'playing') return { ok: false, message: '先开始一局冒险' };
  if (action.type === 'heal') {
    const rules = rulesFor(state);
    if (p.hp >= p.maxHp) result = { ok: false, message: '生命已满' };
    else if (p.healCd > 0) result = { ok: false, message: '恢复中的笔迹尚未干透' };
    else if (!spend(state, rules.healCost, 'heal'))
      result = { ok: false, message: `治疗需要 ${rules.healCost} 墨` };
    else {
      p.hp = Math.min(p.maxHp, p.hp + rules.healAmount);
      p.healCd = 0.65;
      state.stats.heals++;
      effect(state, 'heal', p.x, p.y, { radius: 60, life: 0.8 });
      result = { ok: true, message: `消耗 ${rules.healCost} 墨，恢复 ${rules.healAmount} 生命` };
    }
  } else if (action.type === 'draw') {
    const bridge = getRoom(state).bridges.find((item) => item.id === action.bridgeId);
    if (!bridge) result = { ok: false, message: '这里没有可绘制的桥' };
    else if (bridge.drawn) result = { ok: false, message: '墨桥已经画好了' };
    else if (distance(p, bridge.from) > 125)
      result = { ok: false, message: '先走近墨桥下方的笔尖锚点' };
    else if (!spend(state, bridge.cost, 'explore'))
      result = { ok: false, message: `绘桥需要 ${bridge.cost} 墨；东侧主路免费通行` };
    else {
      bridge.drawn = true;
      state.stats.bridgesDrawn++;
      state.stats.drawn++;
      effect(state, 'draw', bridge.from.x, bridge.from.y, { to: bridge.to, radius: 90, life: 1.2 });
      result = { ok: true, message: '墨桥成形！北侧宝库有 34 墨与 2 生命' };
    }
  } else if (action.type === 'buy') {
    const contract = levelFor(state).contracts.find((item) => item.id === action.contractId);
    const merchant = getRoom(state).objects.find((item) => item.kind === 'merchant');
    if (!merchant || distance(p, merchant) > 130)
      result = { ok: false, message: '走近契约师才能签约' };
    else if (!contract) result = { ok: false, message: '没有这份契约' };
    else if (upgraded(state, contract.id)) result = { ok: false, message: '这份契约已经生效' };
    else if (!spend(state, contract.price, 'trade'))
      result = { ok: false, message: `这份契约需要 ${contract.price} 墨` };
    else {
      state.contracts.push(contract.id);
      state.stats.trades++;
      if (contract.effect === 'health') {
        p.maxHp += 2;
        p.hp = Math.min(p.maxHp, p.hp + 2);
      }
      effect(state, 'pickup', p.x, p.y, { text: contract.name, life: 1.5 });
      result = { ok: true, message: `${contract.name}生效：${contract.description}` };
    }
  } else if (action.type === 'interact') {
    const room = getRoom(state);
    const objectId = action.objectId ?? action.target;
    const object = objectId
      ? [...room.objects, ...room.portals].find((item) => item.id === objectId)
      : getNearbyInteractable(state);
    // getNearbyInteractable returns a view; mutate the actual object for one-shot rewards.
    const actual =
      object && [...room.objects, ...room.portals].find((item) => item.id === object.id);
    result = interactWith(state, actual);
  } else result = { ok: false, message: '未知动作' };
  notice(state, result.message);
  return result;
}
/** The caller controls pause; dt is seconds, clamped to protect tab-switch resumes. */
export function step(state, input = {}, dt = 1 / 60) {
  if (state.status !== 'playing') return state;
  dt = clamp(Number(dt) || 0, 0, 0.05);
  if (!dt) return state;
  state.time += dt;
  for (const key of ['messageTimer', 'transitionCd', 'roomIntroTimer', 'shake'])
    state[key] = Math.max(0, (state[key] || 0) - dt);
  for (const item of state.effects) item.life -= dt;
  state.effects = state.effects.filter((item) => item.life > 0);
  playerActions(state, input, dt);
  for (const enemy of state.enemies) advanceEnemy(state, enemy, dt);
  advanceProjectiles(state, dt);
  if (state.status !== 'playing') return state;
  finishEncounter(state, dt);
  collectPickups(state, dt);
  const room = getRoom(state);
  for (const object of room.objects)
    if (object.autoOpen && !object.used && room.cleared && distance(state.player, object) < 72)
      interactWith(state, object);
  if (state.transitionCd <= 0 && state.status === 'playing' && room.cleared) {
    const portal = room.portals.find(
      (item) => distance(state.player, item) < item.r * 0.63 && !portalReason(state, item),
    );
    if (portal) interactWith(state, portal);
  }
  return state;
}

/** Rebuild geometry from chapter data; reject old or damaged snapshots, never trust saved rules. */
export function restoreGame(snapshot) {
  try {
    const saved = typeof snapshot === 'string' ? JSON.parse(snapshot) : structuredClone(snapshot);
    if (
      !saved ||
      saved.version !== 2 ||
      !LEVELS[saved.levelId] ||
      !['playing', 'ready', 'won', 'lost'].includes(saved.status)
    )
      return null;
    const fresh = createGame(saved.levelId);
    if (
      !fresh.rooms[saved.roomId] ||
      !saved.player ||
      !saved.rooms ||
      !Array.isArray(saved.contracts)
    )
      return null;
    const p = saved.player;
    for (const key of Object.keys(fresh.player))
      if (typeof p[key] !== 'number' || !Number.isFinite(p[key])) return null;
    if (
      p.hp < 0 ||
      p.hp > p.maxHp ||
      p.maxHp < 6 ||
      p.maxHp > 8 ||
      p.ink < 0 ||
      p.ink > 100 ||
      p.maxInk !== 100 ||
      p.r !== 17 ||
      p.x < 33 ||
      p.x > 927 ||
      p.y < 33 ||
      p.y > 567
    )
      return null;
    if (
      !Number.isFinite(saved.time) ||
      saved.time < 0 ||
      !Number.isInteger(saved.seals) ||
      saved.seals < 0 ||
      saved.seals > 2 ||
      !Number.isInteger(saved.serial) ||
      saved.serial < 0
    )
      return null;
    if (
      saved.contracts.some(
        (id) => !levelFor(fresh).contracts.some((contract) => contract.id === id),
      ) ||
      new Set(saved.contracts).size !== saved.contracts.length
    )
      return null;
    const validActor = (actor) =>
      actor &&
      ['x', 'y', 'r', 'hp', 'maxHp', 'timer', 'aimX', 'aimY'].every((key) =>
        Number.isFinite(actor[key]),
      ) &&
      config[actor.type] &&
      ['chase', 'windup', 'attack', 'recover'].includes(actor.state) &&
      actor.hp >= 0 &&
      actor.hp <= actor.maxHp;
    for (const [id, room] of Object.entries(fresh.rooms)) {
      const previous = saved.rooms[id];
      if (
        !previous ||
        !Array.isArray(previous.enemies) ||
        !Array.isArray(previous.pickups) ||
        !Array.isArray(previous.objects) ||
        !Array.isArray(previous.bridges) ||
        previous.enemies.length > 30 ||
        !previous.enemies.every(validActor)
      )
        return null;
      if (
        !previous.pickups.every(
          (drop) =>
            ['ink', 'heart', 'seal'].includes(drop.kind) &&
            ['x', 'y', 'r', 'value', 'age'].every((key) => Number.isFinite(drop[key])) &&
            drop.value > 0,
        )
      )
        return null;
      if (
        !Number.isInteger(previous.waveIndex) ||
        previous.waveIndex < 0 ||
        previous.waveIndex > room.waves.length ||
        !Number.isFinite(previous.waveTimer)
      )
        return null;
      Object.assign(room, {
        visited: Boolean(previous.visited),
        cleared: Boolean(previous.cleared),
        rewardClaimed: Boolean(previous.rewardClaimed),
        waveIndex: previous.waveIndex,
        waveTimer: previous.waveTimer,
        enemies: previous.enemies,
        pickups: previous.pickups,
      });
      for (const object of room.objects)
        object.used = Boolean(previous.objects.find((item) => item.id === object.id)?.used);
      for (const bridge of room.bridges)
        bridge.drawn = Boolean(previous.bridges.find((item) => item.id === bridge.id)?.drawn);
    }
    Object.assign(fresh, {
      roomId: saved.roomId,
      status: saved.status,
      player: p,
      time: saved.time,
      seals: saved.seals,
      contracts: saved.contracts,
      serial: saved.serial,
    });
    const room = getRoom(fresh);
    if (!room.visited || blocked(room, p)) return null;
    for (const [key, value] of Object.entries(fresh.stats)) {
      if (key === 'spent') {
        for (const category of Object.keys(value)) {
          if (!Number.isFinite(saved.stats?.spent?.[category]) || saved.stats.spent[category] < 0)
            return null;
          fresh.stats.spent[category] = saved.stats.spent[category];
        }
      } else {
        if (!Number.isFinite(saved.stats?.[key]) || saved.stats[key] < 0) return null;
        fresh.stats[key] = saved.stats[key];
      }
    }
    fresh.enemies = room.enemies;
    fresh.pickups = room.pickups;
    // Resume in the same fight, keeping hostile shots and every attack cooldown intact.
    if (
      !Array.isArray(saved.projectiles) ||
      saved.projectiles.length > 300 ||
      !saved.projectiles.every(
        (shot) =>
          ['player', 'enemy'].includes(shot.owner) &&
          ['x', 'y', 'vx', 'vy', 'r', 'damage', 'life'].every((key) => Number.isFinite(shot[key])),
      )
    )
      return null;
    fresh.projectiles = saved.projectiles;
    fresh.effects = [];
    fresh.transitionCd = Math.max(0, Number(saved.transitionCd) || 0);
    notice(fresh, '回到未写完的这一页。');
    return fresh;
  } catch {
    return null;
  }
}
