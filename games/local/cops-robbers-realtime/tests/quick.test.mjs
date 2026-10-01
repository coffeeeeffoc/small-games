import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,startGame,commandCop,stepGame} from '../src/engine.js';
import {LEVELS,getLevels} from '../src/levels.js';
import {readPuzzleLink,puzzleUrl} from '../src/share.js';
test('three authored short arenas can be won with ordinary delayed commands and lose if neglected',()=>{
  const timings=[];
  for(const trial of getLevels('quick')){
    assert.ok(!LEVELS.some(level=>JSON.stringify({nodes:level.nodes,edges:level.edges})===JSON.stringify({nodes:trial.nodes,edges:trial.edges})));
    const game=createGame(trial);startGame(game);let dispatched=0;
    for(let tick=0;tick<trial.timeLimit*10 && game.phase==='playing';tick++){
      const next=trial.solution[dispatched];
      if(next && game.time>=1.2+dispatched*.35){assert.equal(commandCop(game,next.cop,trial.nodes[next.node]),true);dispatched++;}
      stepGame(game,.1);
    }
    assert.equal(game.phase,'won');assert.ok(game.time<trial.par);timings.push(game.time.toFixed(2));
    const idle=createGame(trial);startGame(idle);
    for(let tick=0;tick<trial.timeLimit*10+1 && idle.phase==='playing';tick++)stepGame(idle,.1);
    assert.equal(idle.phase,'lost');assert.ok(idle.events.some(event=>event.reason==='timeout'));
    assert.ok(idle.robbers.some(actor=>!actor.caught));
  }
  console.log('Quick human-reaction win times:',timings.join('/'),'seconds');
});
test('quick links validate three-map range and pin public solo rules',()=>{
  assert.equal(readPuzzleLink('https://example.test/game?mode=quick&level=4'),null);
  assert.deepEqual(readPuzzleLink('https://example.test/game?mode=quick&level=3&role=robber&rule=relay&first=robber'),{mode:'quick',level:3,role:'cop',rule:'standard',first:null});
  const puzzle={mode:'quick',level:2,role:'cop',rule:'standard',first:null};
  assert.deepEqual(readPuzzleLink(puzzleUrl('https://u:secret@example.test/game?token=secret',puzzle)),puzzle);
});
