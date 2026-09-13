import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FAMILIES } from '../src/content.js';
import { beginBattle, finishBattle, newGame, nextRound, runBot } from '../src/game.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const families = Object.keys(FAMILIES).filter(key => key !== 'neutral');
const seeds = Array.from({ length: 30 }, (_, index) => `balance-smoke-${String(index + 1).padStart(2, '0')}`);
const started = performance.now();
const runs = [];
let slowestBeginBattle = { ms: 0 };
let longestFrames = { count: 0 };

function validate(game) {
  assert.ok(game.round <= 18);
  for (const p of game.players) {
    assert.ok(Number.isInteger(p.gold) && p.gold >= 0, `${p.id} 金币非法`);
    assert.equal(p.board.length, 6);
    assert.ok(p.hand.length <= 10, `${p.id} 手牌超过10格`);
    for (const card of [...p.board, ...p.hand].filter(Boolean)) {
      assert.ok(typeof card.level === 'bigint' && card.level >= 1n, `${card.uid} 等级非法`);
    }
  }
}

for (const family of families) {
  for (const seed of seeds) {
    let game = newGame(seed, 'standard');
    game.players[0].family = family;
    let firstP5Round = null;
    let firstEliminationRound = null;
    for (let step = 0; step < 18 && game.phase !== 'ended'; step++) {
      assert.equal(game.phase, 'prep');
      game.players[0] = runBot(game.players[0], game.difficulty);
      if (game.players[0].level === 5 && firstP5Round === null) firstP5Round = game.round;
      validate(game);
      const began = performance.now();
      game = beginBattle(game);
      const ms = performance.now() - began;
      assert.equal(game.phase, 'battle');
      if (ms > slowestBeginBattle.ms) slowestBeginBattle = { ms, family, seed, round: game.round };
      if (game.battle.frames.length > longestFrames.count) longestFrames = { count: game.battle.frames.length, family, seed, round: game.round };
      validate(game);
      game = finishBattle(game);
      validate(game);
      if (firstEliminationRound === null && game.players.some(p => p.hp <= 0)) firstEliminationRound = game.round;
      if (game.phase === 'result') game = nextRound(game);
    }
    assert.equal(game.phase, 'ended', `${family}/${seed} 未按上限结束`);
    validate(game);
    assert.ok(game.rank >= 1 && game.rank <= 8);
    const human = game.players[0];
    runs.push({ family, seed, rank: game.rank, rounds: game.round, battleWins: human.wins,
      finalLevel: human.level, finalHp: human.hp, firstP5Round, firstEliminationRound,
      endReason: human.hp <= 0 ? 'human-eliminated' : game.players.filter(p => p.hp > 0).length === 1 ? 'last-survivor' : 'round-limit' });
    if (runs.length % 5 === 0) console.log(`[${runs.length}/180] ${FAMILIES[family].title} · ${(performance.now() - started).toFixed(0)} ms`);
  }
}

const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const summary = Object.fromEntries(families.map(family => {
  const group = runs.filter(run => run.family === family);
  const p5 = group.filter(run => run.firstP5Round !== null);
  const battles = group.reduce((sum, run) => sum + run.rounds, 0);
  return [family, {
    title: FAMILIES[family].title,
    games: group.length,
    averageRank: average(group.map(run => run.rank)),
    championshipRate: group.filter(run => run.rank === 1).length / group.length,
    battleWinRate: group.reduce((sum, run) => sum + run.battleWins, 0) / battles,
    averageRounds: average(group.map(run => run.rounds)),
    p5ReachRate: p5.length / group.length,
    averageFirstP5RoundAmongReached: average(p5.map(run => run.firstP5Round)),
    rankCounts: Array.from({ length: 8 }, (_, index) => group.filter(run => run.rank === index + 1).length)
  }];
}));
const report = {
  generatedAt: new Date().toISOString(),
  scope: 'AI经营规则与性能烟测。六流派各用相同30种子，真人席位也交由标准机器人按流派偏好经营；未修改金币、等级、商店或战斗结果。不是人类试玩，也不能据此判定真实玩法平衡。',
  definitions: {
    championshipRate: '真人最终名次为1的局数占比',
    battleWinRate: '真人获胜战斗数 / 真人实际参加战斗数；平局不算胜',
    averageRounds: '真人淘汰、最后一人获胜或18回合收官时的轮次均值；真人淘汰后没有继续模拟其余席位',
    averageFirstP5RoundAmongReached: '仅计算本局实际达到P5的样本',
    performance: '当前Node运行环境的墙钟耗时，beginBattle包括7名机器人的经营、全大厅战斗和真人战斗帧记录；不是手机性能或FPS验证'
  },
  games: runs.length,
  seeds,
  summary,
  performance: { totalMs: performance.now() - started, slowestBeginBattle, longestFrames },
  validation: '全部180局结束于18回合以内；经营、锁定、结算状态检查金币非负、战场6格、手牌不超过10、角色等级为正BigInt。',
  runs
};
mkdirSync(resolve(root, 'artifacts'), { recursive: true });
const output = resolve(root, 'artifacts/balance-smoke.json');
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.table(Object.values(summary).map(s => ({
  流派: s.title, 局数: s.games, 平均名次: s.averageRank.toFixed(2), 夺冠率: `${(s.championshipRate * 100).toFixed(1)}%`,
  战斗胜率: `${(s.battleWinRate * 100).toFixed(1)}%`, 平均局长: s.averageRounds.toFixed(2),
  P5比例: `${(s.p5ReachRate * 100).toFixed(1)}%`, 首次P5: s.averageFirstP5RoundAmongReached?.toFixed(2) ?? '—'
})));
console.log(`180局通过；最慢beginBattle ${slowestBeginBattle.ms.toFixed(2)} ms；最长 ${longestFrames.count} 帧；报告 ${output}`);
