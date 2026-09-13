import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, beginBattle, finishBattle, nextRound, runBot } from '../src/game.js';
import { createCard, clone } from '../src/shared.js';
import { saveGame, loadGame, exportGame, importGame, SAVE_KEY } from '../src/storage.js';
import { CARDS } from '../src/content.js';

test('48 definitions remain unique and all types cover tiers 1–5',()=>{
  assert.equal(CARDS.length,48);assert.equal(new Set(CARDS.map(c=>c.id)).size,48);
  for(const type of ['character','spell','equipment']) for(let tier=1;tier<=5;tier++) assert.ok(CARDS.some(c=>c.type===type&&c.tier===tier));
});
test('precise large levels survive save/load, invalid imports do not overwrite prior save',()=>{
  const game=newGame('storage');
  game.players[0].board[0]=createCard(game.players[0],'character.neutral.mercenary');
  game.players[0].board[0].level=9007199254740993123456789n;
  const store=new Map(), storage={getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)};
  assert.equal(saveGame(game,storage).ok,true);
  assert.deepEqual(loadGame(storage).game,game);
  const previous=store.get(SAVE_KEY);
  const invalid=clone(game);invalid.players[0].board[0].level=0n;
  assert.equal(saveGame(invalid,storage).ok,false);
  assert.equal(store.get(SAVE_KEY),previous);
  assert.throws(()=>importGame('{broken'));
  assert.equal(saveGame(game,{setItem:()=>{throw new Error('QuotaExceeded');}}).ok,false);
});
test('every phase and battle interruption is serializable and settles once',()=>{
  let game=newGame('resume-phase');game.players[0]=runBot(game.players[0]);
  game=importGame(exportGame(beginBattle(game)));
  assert.equal(game.phase,'battle');
  game=importGame(exportGame(finishBattle(game)));
  assert.strictEqual(finishBattle(game),game);
  if(game.phase==='result') {
    game=importGame(exportGame(nextRound(game)));
    assert.equal(game.round,2);
  }
});
test('trust boundary rejects duplicate cards, wrong types, invalid seeds and unknown versions',()=>{
  const base=newGame('validate');
  for(const mutate of [g=>g.version=99,g=>g.players[0].rng=-1,g=>g.players[0].board[0]=g.players[0].shop[3],g=>g.players[0].hand.push(g.players[0].shop[0]),g=>g.tieOrder.fill('human'),g=>g.pairs[0][0]=g.pairs[0][1]]) {
    const bad=clone(base);mutate(bad);assert.throws(()=>exportGame(bad));
  }
});
test('overkill frames with negative health remain importable after real multi-round play',()=>{
  let game=newGame('1'),sawOverkill=false;
  for(let round=1;round<=3;round++) {
    game.players[0]=runBot(game.players[0]);game=beginBattle(game);
    sawOverkill ||= game.battle.frames.some(f=>f.teams.flat().some(c=>c&&c.health<0n));
    assert.deepEqual(importGame(exportGame(game)),game);
    game=finishBattle(game);
    assert.deepEqual(importGame(exportGame(game)),game);
    if(game.phase==='ended') break;
    game=nextRound(game);
  }
  assert.equal(sawOverkill,true);
});
