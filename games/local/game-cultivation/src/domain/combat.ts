import { cue, finishTrial, hurt, playing, remember, type Trial } from './trial-types.js';
import { direction, distance, enemy, segmentHits, sizeOf } from './world.js';

function tickSwords(s: Trial, dt: number) {
  for (const sword of s.swords) {
    sword.age += dt;
    sword.previous = { x: sword.x, y: sword.y };
    if (sword.age > 0.42 && !sword.returning) {
      sword.returning = true;
      sword.hits = [];
    }
    if (sword.returning) {
      const d = direction(sword, s.player);
      sword.velocity = { x: d.x * 760, y: d.y * 760 };
    }
    sword.x += sword.velocity.x * dt;
    sword.y += sword.velocity.y * dt;
    if (
      !sword.returning &&
      s.obstacles.some((o) => o.hp > 0 && segmentHits(sword.previous, sword, o, o.r))
    ) {
      sword.returning = true;
      sword.hits = [];
      cue(s, 'stone', sword);
      continue;
    }
    if (sword.returning && !s.relics.includes('return')) continue;
    for (const target of s.enemies) {
      if (
        target.hp <= 0 ||
        sword.hits.includes(target.id) ||
        !segmentHits(sword.previous, sword, target, target.r + 5)
      )
        continue;
      sword.hits.push(target.id);
      if (target.kind === 'eye' && s.exposed <= 0) {
        cue(s, 'stone', target, '劫眼未开 · 先躲过这一轮雷');
        continue;
      }
      const armored = target.kind === 'stone' && target.mode !== 'recover' && !sword.strong;
      const damage = Math.round(sword.damage * (armored ? 0.25 : 1));
      target.hp = Math.max(0, target.hp - damage);
      target.flash = 0.18;
      s.hits++;
      cue(s, armored ? 'stone' : 'hit', target);
      if (target.kind === 'bamboo' && target.mode === 'tell') {
        target.mode = 'recover';
        target.timer = 0.9;
      }
      if (target.hp === 0) {
        if (target.kind === 'foxSeal') {
          s.fox = 'following';
          s.foxPosition = { x: target.x, y: target.y };
          cue(s, 'fox', target, '封印已破 · 小狐狸轻轻跟上了你');
          remember(s, '救出残阵中的小狐狸');
        } else if (target.kind !== 'eye') {
          s.kills++;
          s.qi = Math.min(100, s.qi + 8);
          cue(
            s,
            'qi',
            target,
            target.kind === 'dummy' ? '断剑应声 · 可以出关了' : '余气归身 · 真气 +8',
          );
        }
      }
    }
  }
  s.swords = s.swords.filter((p) => p.age < 1.7 && !(p.returning && distance(p, s.player) < 20));
}
function tickEnemies(s: Trial, dt: number) {
  for (const e of s.enemies) {
    e.flash = Math.max(0, e.flash - dt);
    if (e.hp <= 0 || (e.kind !== 'bamboo' && e.kind !== 'stone')) continue;
    e.timer -= dt;
    if (e.mode === 'idle') {
      const dist = distance(e, s.player),
        reach = e.kind === 'stone' ? 175 : 125;
      if (dist > 310) continue;
      e.direction = direction(e, s.player);
      if (dist > reach) {
        const next = { x: e.x + e.direction.x * dt * 48, y: e.y + e.direction.y * dt * 48 };
        if (!s.obstacles.some((o) => o.hp > 0 && distance(o, next) < o.r + e.r))
          Object.assign(e, next);
      } else {
        e.mode = 'tell';
        e.timer = e.kind === 'stone' ? 1.05 : 0.8;
        e.hit = false;
        if (s.fox === 'following') cue(s, 'fox', s.foxPosition, '灵狐竖耳示警 · 留意妖兽蓄势');
      }
    } else if (e.mode === 'tell' && e.timer <= 0) {
      e.mode = 'rush';
      e.timer = e.kind === 'stone' ? 0.52 : 0.34;
    } else if (e.mode === 'rush') {
      const speed = e.kind === 'stone' ? 380 : 340,
        bounds = sizeOf(s.scene);
      e.x = Math.max(24, Math.min(bounds.x - 24, e.x + e.direction.x * speed * dt));
      e.y = Math.max(24, Math.min(bounds.y - 24, e.y + e.direction.y * speed * dt));
      const obstacle = s.obstacles.find((o) => o.hp > 0 && distance(e, o) < e.r + o.r);
      if (obstacle) {
        e.mode = 'recover';
        e.timer = 2.2;
        if (e.kind === 'stone' && obstacle.kind === 'pillar') {
          obstacle.hp = 0;
          e.hp = Math.max(1, e.hp - 22);
          cue(s, 'stone', e, '借柱破甲 · 趁失衡出剑！');
          remember(s, '引石兽撞断残柱');
        }
      }
      if (!e.hit && distance(e, s.player) < e.r + 13) {
        e.hit = true;
        hurt(s, s.balance.enemyDamage, e.kind === 'stone' ? '石兽冲撞' : '竹妖扑击');
      }
      if (e.timer <= 0) {
        e.mode = 'recover';
        e.timer = 1.2;
      }
    } else if (e.mode === 'recover' && e.timer <= 0) e.mode = 'idle';
  }
}
function tickTribulation(s: Trial, dt: number) {
  s.trialTime += dt;
  s.cycle -= dt;
  if (s.tree) {
    s.tree.life -= dt;
    if (s.tree.life <= 0) s.tree = null;
  }
  const eye = s.enemies.find((e) => e.kind === 'eye');
  if (eye && eye.hp <= 0) {
    s.wave++;
    s.lightning = [];
    s.exposed = 0;
    s.cycle = 1.8;
    remember(s, `亲手击破第 ${s.wave} 重劫眼`);
    if (s.wave === 3) {
      finishTrial(s, true, '云开见月，筑基已成。');
      return;
    }
    s.enemies = [enemy(`eye-${s.wave}`, 'eye', s.wave === 1 ? 155 : 325, 160, s.balance.eyeHealth)];
    cue(s, 'bell', s.player, `第 ${s.wave + 1} 重雷劫 · 留意连续雷纹`);
  }
  if (s.cycle <= 0) {
    const target = s.tree ?? s.player;
    s.lightning = Array.from({ length: s.wave + 1 }, (_, i) => ({
      x: Math.max(50, Math.min(430, target.x + (i === 0 ? 0 : i === 1 ? -95 : 95))),
      y: Math.max(70, Math.min(490, target.y + (i === 0 ? 0 : -45))),
      radius: 53,
      timer: 0.95 + i * 0.25,
      life: 0.4,
      struck: false,
    }));
    s.cycle = 6.4;
    s.exposed = 0;
    if (s.tree) {
      s.tree = null;
      remember(s, '以避雷木引走一轮雷');
    }
  }
  for (const bolt of s.lightning) {
    if (bolt.struck) {
      bolt.life -= dt;
      continue;
    }
    bolt.timer -= dt;
    if (bolt.timer <= 0) {
      bolt.struck = true;
      cue(s, 'thunder', bolt);
      if (distance(s.player, bolt) < bolt.radius) hurt(s, s.balance.lightningDamage, '落雷');
      for (const o of s.obstacles) if (o.hp > 0 && distance(o, bolt) < bolt.radius + o.r) o.hp = 0;
      if (s.lightning.every((b) => b.struck)) {
        s.exposed = 4.4;
        cue(s, 'bell', eye, '劫眼已开 · 御剑破劫！');
      }
    }
  }
  s.lightning = s.lightning.filter((b) => !b.struck || b.life > 0);
  if (s.trialTime >= s.balance.tribulationSeconds && playing(s))
    finishTrial(s, false, '香尽，劫眼未破。下一次抓住雷后的空当。');
}
export function tickCombat(s: Trial, dt: number) {
  tickSwords(s, dt);
  if (s.phase === 'tribulation') tickTribulation(s, dt);
  else if (s.phase === 'explore') tickEnemies(s, dt);
}
