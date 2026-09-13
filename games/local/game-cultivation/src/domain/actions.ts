import { cancelTrialInput, cue, playing, remember, type Trial } from './trial-types.js';
import {
  createWorld,
  direction,
  distance,
  enemy,
  portals,
  relicSites,
  sizeOf,
  springs,
  type Scene,
} from './world.js';

export function enterScene(s: Trial, scene: Scene) {
  if (s.scene === 'forest') s.forest = { enemies: s.enemies, obstacles: s.obstacles };
  cancelTrialInput(s);
  s.swords = [];
  s.lightning = [];
  s.scene = scene;
  Object.assign(s, scene === 'forest' && s.forest ? s.forest : createWorld(scene));
  s.player = scene === 'forest' ? { x: 170, y: 970 } : { x: 240, y: 410 };
  s.foxPosition = { x: s.player.x - 35, y: s.player.y + 25 };
  if (scene === 'summit') {
    s.phase = 'tribulation';
    s.trialTime = 0;
    s.wave = 0;
    s.cycle = 1.5;
    s.enemies = [enemy('eye-0', 'eye', 240, 160, s.balance.eyeHealth)];
    cue(s, 'bell', s.player, '雷纹先现，劫眼后开。躲雷，再出剑。');
  } else
    cue(
      s,
      'bell',
      s.player,
      scene === 'forest'
        ? '雾竹秘境 · 沿石径寻缘，留真气迎劫。'
        : '山腰洞府 · 按住吐纳，松开收气。',
    );
}
export function nearby(s: Trial) {
  const relic =
    s.scene === 'forest'
      ? relicSites.find(
          (site) =>
            !s.collected.includes(site.relic) &&
            distance(s.player, site) < 66 &&
            site.guardians.every((id) => !s.enemies.some((e) => e.id === id && e.hp > 0)),
        )
      : undefined;
  const portal = portals[s.scene].find((p) => distance(p, s.player) < 65);
  const spring = springs[s.scene].find(
    (p) => distance(p, s.player) < 68 && !s.enemies.some((e) => e.id === p.guarded && e.hp > 0),
  );
  return { relic, portal, spring };
}
export function interact(s: Trial, held: boolean) {
  if (!playing(s)) return;
  if (!held) {
    if (s.breathing !== null) {
      const amount = Math.min(100 - s.qi, s.breathing * s.balance.breathGain);
      s.qi += amount;
      s.breathing = null;
      if (amount > 1) {
        cue(s, 'qi', s.player, `灵气入体 +${Math.floor(amount)}`);
        remember(s, '在灵脉收稳一口真气');
      }
    }
    return;
  }
  const { relic, portal, spring } = nearby(s);
  if (relic) {
    if (s.relics.length === 2) {
      s.pending = relic.relic;
      cancelTrialInput(s);
    } else {
      s.relics.push(relic.relic);
      s.collected.push(relic.relic);
      cue(s, 'bell', s.player, '机缘入袖 · 新的出手机会');
    }
  } else if (portal) enterScene(s, portal.to);
  else if (spring && s.breathCooldown <= 0 && s.charge === null) {
    s.breathing = 0;
    s.move = { x: 0, y: 0 };
  }
}
export function chooseRelic(s: Trial, index: number) {
  if (!s.pending || !Number.isInteger(index) || index < -1 || index > 1) return;
  if (index >= 0) s.relics[index] = s.pending;
  s.collected.push(s.pending);
  s.pending = null;
}
export function action(
  s: Trial,
  kind: 'start' | 'charge' | 'release' | 'dodge' | 'shield' | 'wood' | 'cancel',
) {
  if (kind === 'cancel') {
    cancelTrialInput(s);
    return;
  }
  if (kind === 'start' && s.phase === 'ready') {
    s.phase = 'explore';
    cue(s, 'bell', s.player, '先在灵脉吐纳，再御剑出关。');
    return;
  }
  if (!playing(s)) return;
  if (kind === 'charge' && s.shield <= 0 && s.attackCooldown <= 0 && s.charge === null) {
    s.charge = 0;
    s.breathing = null;
  }
  if (kind === 'release' && s.charge !== null) releaseSword(s);
  if (kind === 'dodge' && s.dodgeCooldown <= 0) {
    s.charge = null;
    s.breathing = null;
    s.dodge = 0.22;
    s.dodgeCooldown = 1.1;
    s.invulnerable = 0.32;
    if (Math.hypot(s.move.x, s.move.y) > 0.1) s.facing = direction({ x: 0, y: 0 }, s.move);
    cue(s, 'dodge');
  }
  if (kind === 'shield' && s.relics.includes('shield') && s.qi >= 15 && s.shield <= 0) {
    s.qi -= 15;
    s.shield = 2.5;
    s.charge = null;
    s.breathing = null;
    cue(s, 'qi', s.player, '灵玉护心 · 护盾消耗真气');
  }
  if (kind === 'wood' && s.scene === 'summit' && s.relics.includes('wood') && !s.woodUsed) {
    s.tree = { ...s.player, life: 12 };
    s.woodUsed = true;
    cue(s, 'qi', s.player, '引雷木扎根 · 下一轮雷将落在此处');
  }
}
function releaseSword(s: Trial) {
  const charged = (s.charge ?? 0) >= 0.55 && s.qi >= 18;
  let target = s.aim;
  if (!target) {
    const nearest = s.enemies
      .filter((e) => e.hp > 0 && distance(s.player, e) < 310)
      .sort((a, b) => distance(a, s.player) - distance(b, s.player))[0];
    target = nearest ?? { x: s.player.x + s.facing.x * 100, y: s.player.y + s.facing.y * 100 };
  }
  s.facing = direction(s.player, target);
  if (charged) s.qi -= 18;
  s.swords.push({
    ...s.player,
    previous: { ...s.player },
    velocity: { x: s.facing.x * 650, y: s.facing.y * 650 },
    age: 0,
    damage: charged ? s.balance.chargedDamage : s.balance.quickDamage,
    strong: charged,
    returning: false,
    hits: [],
  });
  s.charge = null;
  s.attackCooldown = charged ? 0.4 : 0.24;
  cue(s, 'sword');
}
/** Axis-separated collision lets the player slide along stones without passing through them. */
export function movePlayer(s: Trial, dt: number) {
  const d = s.dodge > 0 ? s.facing : s.move;
  const speed = s.dodge > 0 ? 470 : s.balance.moveSpeed * (s.charge !== null ? 0.48 : 1);
  const length = Math.max(1, Math.hypot(d.x, d.y)),
    bounds = sizeOf(s.scene);
  for (const axis of ['x', 'y'] as const) {
    const old = s.player[axis];
    s.player[axis] = Math.max(
      32,
      Math.min(bounds[axis] - 32, old + (d[axis] / length) * speed * dt),
    );
    if (s.obstacles.some((o) => o.hp > 0 && distance(s.player, o) < o.r + 12)) s.player[axis] = old;
  }
  if (Math.hypot(d.x, d.y) > 0.1) {
    if (s.charge === null) s.facing = direction({ x: 0, y: 0 }, d);
    s.steps += dt;
    if (s.steps > 0.36) {
      s.steps = 0;
      cue(s, 'step');
    }
  }
}
