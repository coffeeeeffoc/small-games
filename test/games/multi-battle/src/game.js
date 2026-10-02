import { FAMILIES, UPGRADE_COSTS } from './content.js';
import { clone, createPlayer, def, random, seedOf, stats, compareBig, emptyPrep } from './shared.js';
import { applyAction, startRound } from './economy.js';
import { simulateBattle } from './battle.js';

export const VERSION = 1;
const botNames = ['秋灯客', '白石先生', '薄荷骑士', '拾星者', '铁砧老友', '晚风信使', '橘子船长'];
const families = Object.keys(FAMILIES).filter(key => key !== 'neutral');
const shuffle = (list, rng) => {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random(rng) * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
};
const strength = card => {
  const s = stats(card);
  // ponytail: AI score saturates at 1e6; use BigInt ranking if real matches reach it. Combat stays exact.
  return Number((s.attack * 2n + s.health) > 1000000n ? 1000000n : s.attack * 2n + s.health) + def(card).tier * 3;
};
const owns = p => [...p.board, ...p.hand].filter(card => card && def(card).type === 'character');

function spellAction(p, spell) {
  const key = def(spell).key;
  const board = p.board.filter(Boolean);
  const all = owns(p);
  const best = [...board].sort((a, b) => strength(b) - strength(a));
  let targets = [];
  if (key === 'open_market') return { type: 'cast', uid: spell.uid, targets };
  if (key === 'targeted_order') return { type: 'cast', uid: spell.uid, choice: p.family === 'arcana' ? 'spell' : p.family === 'armory' ? 'equipment' : 'character', targets };
  if (key === 'rally') return board.length ? { type: 'cast', uid: spell.uid, targets } : null;
  if (key === 'chorus') targets = best.slice(0, 2);
  else if (['bequest', 'succession', 'exchange'].includes(key)) {
    const donors = [...all].sort((a, b) => compareBig(b.level, a.level));
    const receiver = [...board].sort((a, b) => {
      const role = c => def(c).tier * 3 + (['queen','cannoneer','duelist','shieldbreaker','successor'].includes(def(c).key) ? 8 : 0);
      return role(b) - role(a);
    })[0];
    const donor = donors.find(card => card !== receiver && card.level > 1n && (key !== 'exchange' || card.level > receiver?.level));
    if (!receiver || !donor || (def(donor).tier >= def(receiver).tier && p.board.includes(donor) && def(donor).key !== 'vessel')) return null;
    targets = [donor, receiver];
  } else if (key === 'offering') {
    if (board.length < 3) return null;
    const candidate = [...board].filter(c => !c.prep.opening.includes('offering')).sort((a,b) => strength(a) - strength(b))[0];
    targets = candidate ? [candidate] : [];
  } else if (key === 'paper_reinforcements') {
    const target = board.find(c => !c.prep.deathSummon);
    targets = target ? [target] : [];
  } else if (key === 'overload') targets = best.filter(c => c.equipment.length).slice(0,1);
  else if (key === 'reinforce') targets = board.slice(0,1);
  else targets = (['training','potential'].includes(key) && !best.length ? all : best).slice(0,1);
  const count = ['chorus','bequest','succession','exchange'].includes(key) ? 2 : 1;
  return targets.length === count ? { type: 'cast', uid: spell.uid, targets: targets.map(c => c.uid) } : null;
}

export function runBot(original, difficulty = 'standard') {
  let p = original;
  let rolls = 0;
  const decision = { rng: p.botRng || seedOf(`${p.id}-decisions`) };
  for (let step = 0; step < 40; step++) {
    const board = p.board.filter(Boolean), all = owns(p), options = [];
    const add = (action, score) => { if (score > 0) options.push({ action, score: score + random(decision) * (difficulty === 'easy' ? 10 : 2) }); };
    for (const card of p.hand) {
      const d = def(card);
      if (d.type === 'character') {
        const same = board.find(c => c.defId === card.defId);
        if (same && (board.length >= 4 || p.hand.length > 6)) add({ type:'merge', sourceUid:card.uid, targetUid:same.uid }, 120);
        const empty = p.board.indexOf(null);
        if (empty !== -1) add({ type:'deploy', uid:card.uid, slot:empty }, 110 + strength(card));
        else {
          const worst = [...board].sort((a,b) => strength(a) - strength(b))[0];
          if (strength(card) > strength(worst) + 4) add({type:'deploy',uid:card.uid,slot:p.board.indexOf(worst)}, 85);
          else if (!same && p.hand.length > 3) add({type:'sell',uid:card.uid}, 10);
        }
      } else if (d.type === 'equipment') {
        const target = [...board].sort((a,b) => strength(b) - strength(a)).find(c => c.equipment.length < 2 && !c.equipment.some(e => e.defId === card.defId));
        if (target) add({type:'equip',uid:card.uid,targetUid:target.uid}, 100);
        else if (p.hand.length > 5) add({type:'sell',uid:card.uid}, 15);
      } else {
        const action = spellAction(p, card);
        if (action) add(action, ['open_market','targeted_order'].includes(d.key) ? 12 : 90);
        else if (p.hand.length > 7) add({type:'sell',uid:card.uid}, 10);
      }
    }
    const targetLevel = Math.min(5, 1 + Math.floor((p.round - 1) / 2));
    if (p.level < targetLevel && p.gold >= UPGRADE_COSTS[p.level] && board.length >= Math.min(4, p.round)) add({type:'upgrade'}, 105);
    const saving = p.level < targetLevel && p.hp > 10;
    const reserve = saving && board.length >= 4 ? Math.max(0, UPGRADE_COSTS[p.level] - Math.min(4 + p.round, 12)) : 0;
    if (p.hand.length < 10) p.shop.forEach((card, slot) => {
      if (!card || p.gold - card.price < reserve) return;
      const d = def(card), same = all.some(c => c.defId === card.defId);
      const affinity = d.family === p.family ? 9 : d.family === 'neutral' ? 3 : 0;
      if (d.type === 'character') {
        const worst = board.length ? Math.min(...board.map(strength)) : 0;
        if (board.length < 6 || same || strength(card) > worst + 5) add({type:'buy',slot}, 20 + affinity + (same ? 18 : 0) + (board.length < 6 ? 35 : 0) + d.tier);
      } else if (d.type === 'equipment') {
        if (board.some(c => c.equipment.length < 2 && !c.equipment.some(e=>e.defId===card.defId))) add({type:'buy',slot}, 25 + affinity);
      } else if (board.length && spellAction(p,card)) add({type:'buy',slot}, 18 + affinity);
    });
    if (p.gold >= 4 && rolls < 3 && !saving) add({type:'reroll'}, 7);
    options.sort((a,b) => b.score-a.score);
    let applied = false;
    for (const { action } of options) {
      const result = applyAction(p, action);
      if (!result.ok) continue;
      p = result.player; if (action.type === 'reroll') rolls++;
      applied = true; break;
    }
    if (!applied) break;
  }
  p = clone(p);
  p.botRng = decision.rng;
  // ponytail: six-slot role sorting, revisit if movement or spatial skills are added.
  const frontKeys = ['mercenary','gravekeeper','rivet_guard','echo_guard','keeper','commander'];
  const rearKeys = ['queen','reaper','cannoneer','conductor','archivist','medic'];
  const rank = c => frontKeys.includes(def(c).key) ? 0 : rearKeys.includes(def(c).key) ? 2 : 1;
  const units = p.board.filter(Boolean).sort((a,b)=>rank(a)-rank(b));
  p.board = Array(6).fill(null);
  for (const unit of units) {
    const preferred = rearKeys.includes(def(unit).key) ? [3,4,5,0,1,2] : [0,1,2,3,4,5];
    p.board[preferred.find(slot => !p.board[slot])] = unit;
  }
  return p;
}

function setPairs(game) {
  const alive = game.players.filter(p => p.hp > 0).map(p=>p.id);
  let ids = shuffle(alive, game);
  game.ghostPlayerId = null;
  if (ids.length % 2) {
    const fewest = Math.min(...ids.map(id => game.ghostCounts[id] || 0));
    const candidates = ids.filter(id => (game.ghostCounts[id] || 0) === fewest && id !== game.lastGhostId);
    const id = candidates[0] ?? ids[0];
    ids = ids.filter(other => other !== id);
    const fallen = game.players.filter(p=>p.hp<=0 && p.lastBoard);
    const source = fallen[Math.floor(random(game) * fallen.length)];
    game.ghostPlayerId = id;
    game.lastGhostId = id;
    game.ghostCounts[id] = (game.ghostCounts[id] || 0) + 1;
    game.ghost = { id:'ghost', mirror:true, name:`${source.name}的镜像`, family:source.family, level:source.level, hp:0, board:clone(source.lastBoard), sourceId:source.id };
  } else game.ghost = null;
  let best = ids;
  let cost = Infinity;
  for (let attempt=0; attempt<12; attempt++) {
    const candidate = attempt ? shuffle(ids,game) : ids;
    let repeats = 0;
    for(let i=0;i<candidate.length;i+=2) if(game.previousOpponents[candidate[i]]===candidate[i+1]) repeats++;
    if(repeats<cost) { cost=repeats; best=candidate; }
    if(!cost) break;
  }
  game.pairs = [];
  for(let i=0;i<best.length;i+=2) game.pairs.push(best[i] === 'human' || best[i+1] !== 'human' ? [best[i],best[i+1]] : [best[i+1],best[i]]);
  if(game.ghostPlayerId) game.pairs.push([game.ghostPlayerId,'ghost']);
  const pair = game.pairs.find(pair=>pair.includes('human'));
  game.opponentId = pair?.find(id=>id!=='human') ?? null;
}

export function newGame(seedText = String(Date.now()), difficulty = 'standard') {
  seedText = String(seedText).trim().slice(0,80) || String(Date.now());
  const seating = {rng:seedOf(`${seedText}/seats`)};
  const botFamilies = shuffle([...families, families[Math.floor(random(seating)*families.length)]], seating);
  const players = [createPlayer('human','你',seedOf(`${seedText}/human/shop`)), ...botNames.map((name,i)=>createPlayer(`bot${i}`,name,seedOf(`${seedText}/bot${i}/shop`),botFamilies[i]))];
  players.forEach(p=>{p.botRng=seedOf(`${seedText}/${p.id}/decisions`);p.lastBoard=null;p.eliminatedRound=null;});
  const game = {version:VERSION,rulesVersion:1,contentVersion:1,seedText,difficulty:difficulty==='easy'?'easy':'standard',phase:'prep',round:1,rng:seedOf(`${seedText}/pairs`),players:players.map(p=>startRound(p,1)),tieOrder:shuffle(players.map(p=>p.id),seating),previousOpponents:{},lastGhostId:null,ghostCounts:{},opponentId:null,pairs:[],battle:null,lastResult:null,rank:null};
  setPairs(game);
  return game;
}

export function dispatch(game, action) {
  if (game.phase !== 'prep') return { ok:false, game, error:'只有备战阶段可以经营', events:[] };
  const result = applyAction(game.players[0], action);
  if (!result.ok) return { ...result, game };
  const updated = { ...game, players:[result.player,...game.players.slice(1)] };
  return { ok:true, game:updated, events:result.events };
}

export function opponent(game) {
  const p = game.opponentId === 'ghost' ? game.ghost : game.players.find(p=>p.id===game.opponentId);
  if (!p) return null;
  if (game.phase === 'prep' && p.id !== 'ghost') return {...p, board:p.lastBoard || Array(6).fill(null)};
  return p;
}

export function beginBattle(original) {
  if(original.phase !== 'prep') return original;
  const game = clone(original);
  game.players = game.players.map((p,i)=>i && p.hp>0 ? runBot(p,game.difficulty) : p);
  for(const p of game.players) if(p.hp>0) p.lastBoard=clone(p.board);
  game.pendingResults = [];
  for (const [leftId,rightId] of game.pairs) {
    const left=game.players.find(p=>p.id===leftId);
    const right=rightId==='ghost'?game.ghost:game.players.find(p=>p.id===rightId);
    const human=leftId==='human';
    const battle=simulateBattle(left.board,right.board,seedOf(`${game.seedText}/${game.round}/${leftId}/${rightId}`),{record:human});
    game.pendingResults.push({leftId,rightId,winner:battle.winner,remaining:battle.remaining});
    if(human) {game.battle=battle;game.battle.opponentName=right.name;}
  }
  game.phase='battle';
  return game;
}

export function standings(game) {
  return [...game.players].sort((a,b)=>{
    const aliveA=a.hp>0,aliveB=b.hp>0;
    if(aliveA!==aliveB) return aliveA?-1:1;
    if(!aliveA && a.eliminatedRound!==b.eliminatedRound) return (b.eliminatedRound||0)-(a.eliminatedRound||0);
    return b.hp-a.hp || b.wins-a.wins || game.tieOrder.indexOf(a.id)-game.tieOrder.indexOf(b.id);
  });
}

export function finishBattle(original) {
  if(original.phase!=='battle') return original;
  const game=clone(original);
  const base=2+Math.floor((game.round-1)/4);
  for(const result of game.pendingResults) {
    const left=game.players.find(p=>p.id===result.leftId),right=game.players.find(p=>p.id===result.rightId);
    const leftDamage=result.winner===0?0:result.winner===null?base:base+Math.min(6,result.remaining[1]);
    const rightDamage=result.winner===1?0:result.winner===null?base:base+Math.min(6,result.remaining[0]);
    left.hp-=leftDamage;
    if(right) right.hp-=rightDamage;
    if(result.winner===0) left.wins++;
    if(result.winner===1 && right) right.wins++;
    game.previousOpponents[left.id]=result.rightId;
    if(right) game.previousOpponents[right.id]=left.id;
    if(left.id==='human') game.lastResult={winner:result.winner,damage:leftDamage,opponentName:game.battle.opponentName,reason:game.battle.timedOut?'行动上限 · 本体生命留存比例判定':'战场胜负'};
  }
  for(const p of game.players) {
    if(p.hp<=0 && !p.eliminatedRound) p.eliminatedRound=game.round;
    for(const card of [...p.board,...p.hand].filter(Boolean)) card.prep=emptyPrep();
  }
  game.pendingResults=[];
  const ended=game.players[0].hp<=0 || game.players.filter(p=>p.hp>0).length<=1 || game.round>=18;
  game.phase=ended?'ended':'result';
  if(ended) game.rank=standings(game).findIndex(p=>p.id==='human')+1;
  return game;
}

export function nextRound(original) {
  if(original.phase!=='result') return original;
  const game=clone(original);
  game.round++;
  game.players=game.players.map(p=>p.hp>0?startRound(p,game.round):p);
  game.phase='prep';game.battle=null;game.lastResult=null;
  setPairs(game);
  return game;
}
