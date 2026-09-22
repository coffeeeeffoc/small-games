import assert from 'node:assert/strict';
import test from 'node:test';
import { rankedResultText, type CompetitionBoard } from '../assets/scripts/CompetitionClient.ts';

test('ranked result compares real before/after and preserves unknown versus first record', () => {
  const me = {playerId:'test',rank:3,score:-219766,secondary:0};
  const board: CompetitionBoard = {top:[me],me,eligiblePlayers:105,previous:{...me,rank:2,score:-218000},threshold:null};
  assert.match(rankedResultText(board,{...me,rank:5,score:-240000}),/排名变化 \+2/);
  assert.match(rankedResultText(board,null),/首次有效纪录/);
  assert.match(rankedResultText(board,undefined),/暂无比较依据/);
  assert.match(rankedResultText(board,me),/个人最佳 219.766 秒/);
  assert.match(rankedResultText(board,me),/距上一名快 1.766 秒/);
  assert.match(rankedResultText({...board,me:null},null),/尚无有效成绩/);
  assert.doesNotMatch(rankedResultText({...board,me:null},null),/全站第/);
});
