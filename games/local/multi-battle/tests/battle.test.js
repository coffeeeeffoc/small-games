import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS } from '../src/content.js';
import { clone, createCard, createPlayer, stats } from '../src/shared.js';
import { simulateBattle } from '../src/battle.js';

let nextPlayer = 0;
function unit(key, options = {}) {
  const player = createPlayer(`test-${nextPlayer++}`, '测试', 1);
  const card = createCard(player, CARDS.find(item => item.key === key).id);
  card.level = options.level ?? 1n;
  card.equipment = (options.equip || []).map(key => createCard(player, CARDS.find(item => item.key === key).id));
  const base = stats(card);
  if (options.attack !== undefined) card.prep.attack = BigInt(options.attack) - base.attack;
  if (options.health !== undefined) card.prep.health = BigInt(options.health) - base.health;
  card.prep.shield = BigInt(options.shield || 0);
  card.prep.opening = options.opening || [];
  card.prep.deathSummon = options.deathSummon || false;
  return card;
}
const board = (...cards) => Array.from({ length: 6 }, (_, index) => cards[index] || null);
const attackFrames = result => result.frames.filter(frame => frame.type === 'attack');

test('both combatants submit damage and die together; empty boards do not divide by zero', () => {
  const result = simulateBattle(board(unit('mercenary', { attack: 9 })), board(unit('mercenary', { attack: 9 })), 1);
  assert.equal(result.actions, 1);
  assert.equal(result.winner, null);
  assert.deepEqual(result.remaining, [0, 0]);
  const death = result.frames.find(frame => frame.type === 'death');
  assert.equal(death.targets.length, 2);
  assert.ok(death.teams.every(team => team.every(card => card === null)));
  assert.equal(simulateBattle(board(), board(), 1).winner, null);
  assert.equal(simulateBattle(board(unit('broker')), board(), 1).winner, 0);
});

test('preparation and all passive shields precede opening damage', () => {
  const cannon = unit('cannoneer', { attack: 20, opening: ['cannon'] });
  const guard = unit('rivet_guard', { shield: 5, equip: ['tempered_plate', 'coat'] });
  const result = simulateBattle(board(cannon), board(guard, unit('commander')), 1);
  const shotIndex = result.frames.findIndex(frame => frame.text.includes('符文射击'));
  assert.equal(result.frames[shotIndex - 1].teams[1][0].shield, 18n);
  const shot = result.frames[shotIndex];
  assert.equal(shot.target, guard.uid);
  assert.equal(shot.teams[1][0].health, 17n);
  assert.equal(shot.teams[1][0].shield, 0n);
});

test('starfall damages a complete enemy batch; a simultaneously dead queen cannot react', () => {
  const caster = unit('cannoneer', { attack: 40, opening: ['starfall'] });
  const result = simulateBattle(board(caster), board(unit('gravekeeper'), unit('queen')), 1);
  const star = result.frames.find(frame => frame.text.includes('星落仪式'));
  assert.equal(star.targets.length, 2);
  assert.ok(star.teams[1].filter(Boolean).every(card => card.health <= 0n));
  assert.equal(result.frames.find(frame => frame.type === 'death').targets.length, 2);
  assert.ok(!result.frames.some(frame => frame.text.includes('焚冕追击')));
  assert.equal(result.summoned[1], 1);
  const zero = simulateBattle(board(unit('cannoneer', { attack: 1, opening: ['starfall'] })), board(unit('broker')), 1);
  assert.equal(zero.frames.find(frame => frame.text.includes('星落仪式')).teams[1][0].health, 6n);
});

test('each opening shot settles its summon chain before the next shot retargets', () => {
  const caster = unit('cannoneer', { attack: 10, opening: ['cannon', 'cannon'] });
  const result = simulateBattle(board(caster), board(unit('gravekeeper', { deathSummon: true })), 1);
  const shots = result.frames.map((frame, index) => frame.text.includes('符文射击') ? index : -1).filter(index => index >= 0);
  assert.equal(shots.length, 2);
  assert.equal(result.frames.slice(shots[0], shots[1]).filter(frame => frame.type === 'summon').length, 3);
  assert.match(result.frames[shots[1]].target, /token/);
});

test('dead preparation sources skip their remaining abilities, including opposing openers', () => {
  const left = unit('cannoneer', { opening: ['firemark', 'firemark'] });
  const right = unit('cannoneer', { attack: 100, opening: ['cannon', 'cannon'] });
  const result = simulateBattle(board(left), board(right), 8192);
  assert.equal(result.firstSide, 1);
  assert.equal(result.winner, 1);
  assert.equal(result.actions, 0);
  assert.ok(!result.frames.some(frame => frame.text.includes('焰印')));
  const sacrifice = unit('gravekeeper', { opening: ['offering', 'cannon'] });
  const other = simulateBattle(board(sacrifice, unit('broker')), board(unit('mercenary')), 1);
  assert.ok(!other.frames.some(frame => frame.actor === sacrifice.uid && frame.text.includes('符文射击')));
});

test('last stand stops one lethal damage instance but never a sacrifice', () => {
  const wearer = unit('mercenary', { equip: ['last_stand'] });
  const result = simulateBattle(board(wearer), board(unit('broker', { attack: 100, health: 100 })), 1);
  const saved = result.frames.filter(frame => frame.text.includes('保留 1 生命'));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].teams[0][0].health, 1n);
  assert.equal(result.remaining[0], 0);
  const sacrifice = unit('gravekeeper', { opening: ['offering'], equip: ['last_stand', 'wick'], deathSummon: true });
  const offerings = simulateBattle(board(sacrifice, unit('reaper'), unit('queen')), board(unit('broker', { health: 100 })), 1);
  assert.ok(!offerings.frames.some(frame => frame.text.includes('保留 1 生命')));
  const wick = offerings.frames.find(frame => frame.text.includes('余烬灯芯'));
  assert.equal(wick.teams[0][0].defId, 'token.ember.ash_puppet');
  assert.equal(wick.teams[0][0].shield, 3n);
  assert.equal(offerings.summoned[0], 3);
  const harvest = offerings.frames.find(frame => frame.text.includes('收割余烬'));
  assert.equal(harvest.teams[0][1].attack, 6n);
  assert.ok(offerings.frames.find(frame => frame.text.includes('焚冕追击')).text.includes('6 伤害'));
});

test('taunt overrides frontline and shieldbreaker bonus applies only to active damage', () => {
  const taunt = unit('mercenary');
  const defender = board(unit('broker'), null, null, null, taunt);
  const result = simulateBattle(board(unit('shieldbreaker')), defender, 1);
  assert.equal(attackFrames(result)[0].target, taunt.uid);
  const breaker = unit('shieldbreaker', { health: 100, shield: 20 });
  const other = unit('broker', { health: 100, shield: 20 });
  const attacks = attackFrames(simulateBattle(board(breaker), board(other), 1));
  assert.equal(attacks[0].teams[1][0].shield, 11n);
  assert.equal(attacks[0].teams[0][0].shield, 18n);
  assert.equal(attacks[1].teams[1][0].shield, 6n);
  assert.equal(attacks[1].teams[0][0].shield, 16n);
});

test('medic heals after its surviving active attack, never after counterattacking', () => {
  const medic = unit('medic');
  const result = simulateBattle(board(medic), board(unit('broker', { health: 100 })), 1);
  const indices = result.frames.map((frame, index) => frame.type === 'attack' ? index : -1).filter(index => index >= 0);
  assert.ok(result.frames.slice(indices[0], indices[1]).some(frame => frame.text.includes('恢复 2 生命')));
  assert.ok(!result.frames.slice(indices[1], indices[2]).some(frame => frame.text.includes('恢复')));
  const killed = simulateBattle(board(unit('medic')), board(unit('broker', { attack: 100, health: 100 })), 1);
  assert.ok(!killed.frames.some(frame => frame.text.includes('恢复')));
});

test('duelist reacts once to surviving health loss, after shields and simultaneous removal', () => {
  const duelist = unit('duelist', { shield: 10 });
  const result = simulateBattle(board(duelist), board(unit('broker', { attack: 9, health: 200 })), 1);
  const attacks = attackFrames(result);
  assert.equal(attacks[0].teams[0][0].health, 16n);
  assert.equal(attacks[1].teams[0][0].health, 8n);
  const heal = result.frames.filter(frame => frame.text.includes('绝地奋战'));
  assert.equal(heal.length, 1);
  assert.equal(heal[0].teams[0][0].health, 15n);
  const killed = simulateBattle(board(unit('duelist')), board(unit('broker', { attack: 100, health: 100 })), 1);
  assert.ok(!killed.frames.some(frame => frame.text.includes('绝地奋战')));
  const bothDead = simulateBattle(board(unit('broker', { attack: 12, health: 1 })), board(unit('reaper')), 1);
  assert.ok(!bothDead.frames.some(frame => frame.text.includes('收割余烬')));
});

test('60-action result uses exact original-health ratios and ignores shields', () => {
  const left = unit('broker', { attack: 1, health: 1000, shield: 1000 });
  const right = unit('broker', { attack: 1, health: 1000 });
  const result = simulateBattle(board(left), board(right), 1);
  assert.equal(result.actions, 60);
  assert.equal(result.timedOut, true);
  assert.equal(result.winner, 0);
  assert.deepEqual(result.ratios, [{ current: 1000n, initial: 1000n }, { current: 940n, initial: 1000n }]);
  const tied = simulateBattle(board(left), board(clone(left)), 1);
  assert.equal(tied.winner, null);
});

test('summons use available fixed slots, count only actual successes, and never exceed 12', () => {
  let reachedCap = false;
  for (let seed = 1; seed <= 20; seed++) {
    const caster = unit('cannoneer', { level: 100n, opening: Array(30).fill('firemark') });
    const enemy = board(...Array.from({ length: 6 }, () => unit('gravekeeper', { deathSummon: true })));
    const result = simulateBattle(board(caster), enemy, seed);
    assert.ok(result.summoned[1] <= 12);
    reachedCap ||= result.summoned[1] === 12;
    assert.equal(result.summoned[1], result.frames.filter(frame => frame.type === 'summon').length);
    assert.ok(result.frames.every(frame => frame.teams.every(team => team.length === 6)));
    assert.equal(result.remaining[1], 0);
  }
  assert.ok(reachedCap, 'fixture must exercise the summon cap');
});

test('huge levels stay exact, battle never mutates permanent input, and fast mode is identical', () => {
  const huge = 90071992547409931234567890n;
  const left = board(unit('cannoneer', { level: huge, equip: ['shortsword'], opening: ['starfall', 'cannon'] }));
  const right = board(unit('mercenary', { level: huge, equip: ['last_stand'] }));
  const before = clone([left, right]);
  const full = simulateBattle(left, right, 12345);
  assert.equal(full.frames[0].teams[0][0].attack, huge + 4n);
  const star = full.frames.find(frame => frame.text.includes('星落仪式'));
  assert.equal(star.teams[1][0].health, 2n * huge + 11n - (huge + 4n) / 2n);
  const fast = simulateBattle(left, right, 12345, { record: false });
  assert.deepEqual({ ...full, frames: [] }, fast);
  assert.deepEqual(full, simulateBattle(left, right, 12345));
  assert.deepEqual([left, right], before);
  assert.throws(() => simulateBattle(board(unit('training')), board(), 1), /战场角色无效/);
});
