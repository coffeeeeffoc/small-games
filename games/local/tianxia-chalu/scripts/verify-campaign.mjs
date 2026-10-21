import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  LEVELS,
  createMatch,
  tick,
  planRoutes,
  switchRoute,
  validateLevels,
} from '../src/core/index.mjs';

// Find a reproducible normal-difficulty win with commands only; this is not human balance testing.
assert.deepEqual(validateLevels(), { valid: true, errors: [] });
const rows = [];
for (const level of LEVELS) {
  let witness = null,
    attempts = 0;
  search: for (const style of ['aggressive', 'expansionist', 'defensive']) {
    for (const interval of [2, 4])
      for (let seed = 0; seed < 16; seed++) {
        attempts++;
        const state = createMatch({ levelId: level.id, seed, difficulty: 'normal' });
        const commands = [];
        let next = 0;
        while (state.status === 'playing') {
          if (state.time + 1e-9 >= next) {
            for (const command of planRoutes(state, 0, style)) {
              if (
                state.junctions.find((j) => j.id === command.junctionId).routeIndex ===
                command.routeIndex
              )
                continue;
              if (switchRoute(state, 0, command.junctionId, command.routeIndex).ok)
                commands.push({ step: state.stepCount, ...command });
            }
            next += interval;
          }
          tick(state, 0.1);
          assert(
            state.cities.every(
              (c) => Number.isInteger(c.troops) && c.troops >= 0 && c.troops <= c.capacity,
            ),
          );
          assert(
            state.packets.every(
              (p) => Number.isInteger(p.troops) && p.troops >= 0 && Number.isFinite(p.damage),
            ),
          );
        }
        if (state.result.outcome === 'victory') {
          const replay = createMatch({ levelId: level.id, seed, difficulty: 'normal' });
          let index = 0;
          while (replay.status === 'playing') {
            while (commands[index]?.step === replay.stepCount) {
              const c = commands[index++];
              assert(switchRoute(replay, 0, c.junctionId, c.routeIndex).ok);
            }
            tick(replay, 0.1);
          }
          assert.deepEqual(replay, state);
          witness = {
            seed,
            style,
            interval,
            elapsed: state.time,
            reason: state.result.reason,
            replayed: true,
            digest: createHash('sha256').update(JSON.stringify(state)).digest('hex'),
            commands,
          };
          break search;
        }
      }
  }
  rows.push({
    order: level.order,
    levelId: level.id,
    name: level.name,
    chapter: level.chapter,
    cities: level.cities.length,
    roads: level.roads.length,
    attempts,
    witness,
  });
  console.log(
    level.order +
      '/100 ' +
      level.id +
      ': ' +
      (witness
        ? 'WIN + exact replay, seed=' + witness.seed + ', attempts=' + attempts
        : 'NO WITNESS'),
  );
}
const hash = createHash('sha256');
for (const f of [
  'src/core/index.mjs',
  'src/core/effects.mjs',
  'src/content/rules.mjs',
  'src/content/levels.mjs',
  'src/content/catalog.mjs',
  ...LEVELS.map((l) => 'src/content/maps/' + l.id + '.mjs'),
])
  hash
    .update(f + '\0')
    .update((await readFile(new URL('../' + f, import.meta.url), 'utf8')).replaceAll('\r\n', '\n'));
const passed = rows.every((r) => r.witness);
const report = {
  rulesVersion: 2,
  rulesHash: hash.digest('hex'),
  difficulty: 'normal',
  loadout: [],
  method:
    'Public switchRoute commands only, no state edits; every successful command stream replayed from a fresh state and compared exactly',
  maps: rows.length,
  passed,
  wins: rows.filter((r) => r.witness).length,
  attempts: rows.reduce((s, r) => s + r.attempts, 0),
  rows,
};
await writeFile(
  new URL('../docs/design/cocos-2026-10-22/campaign-solutions.json', import.meta.url),
  JSON.stringify(report, null, 2) + '\n',
);
await writeFile(
  new URL('../docs/design/cocos-2026-10-22/campaign-results.md', import.meta.url),
  '# 100 张地图可通关验证\n\n普通难度、零装备，公开军令驱动；成功指令流重新开局逐步重放并比较完整最终状态。自动策略搜索不代表每个随机布局均已人工平衡。\n\n' +
    '地图 ' +
    rows.length +
    '；验证胜利 ' +
    report.wins +
    '；搜索对局 ' +
    report.attempts +
    '；规则散列 ' +
    report.rulesHash +
    '。\n\n' +
    '| 关 | 地图 | 章 | 城/路 | 胜利 seed | 用时 | 重放 |\n| --- | --- | --- | --- | --- | --- | --- |\n' +
    rows
      .map(
        (r) =>
          '| ' +
          r.order +
          ' | ' +
          r.name +
          ' · ' +
          r.levelId +
          ' | ' +
          r.chapter +
          ' | ' +
          r.cities +
          '/' +
          r.roads +
          ' | ' +
          (r.witness?.seed ?? '未找到') +
          ' | ' +
          (r.witness?.elapsed ?? '—') +
          ' | ' +
          (r.witness ? '完全一致' : '待查') +
          ' |',
      )
      .join('\n') +
    '\n',
);
console.log(
  JSON.stringify({ maps: report.maps, wins: report.wins, attempts: report.attempts, passed }),
);
assert(
  passed,
  'Some maps have no verified winning command stream; inspect campaign-solutions.json',
);
