import { prepareLevel, initialState, solve } from './engine.js';

const ring = start => Array.from({length:6},(_,i) => [start+i,start+(i+1)%6]);
export const quickTrials = [
  { id:1, name:'两侧夹击', par:2, turnLimit:2, cops:[0,4], robbers:[2], exits:[5],
    nodes:[[100,180],[300,100],[500,180],[500,420],[300,500],[100,420]], edges:ring(0),
    tip:'两位队员从两侧各推进一步。绕去出口会浪费机会。', lesson:'守口的人向内收紧，才能把安全的小圈变成包围。' },
  { id:2, name:'先封后追', par:2, turnLimit:3, cops:[1,2,6], robbers:[0], exits:[5],
    nodes:[[300,300],[140,300],[460,300],[300,140],[300,460],[300,540],[140,460]], edges:[[0,1],[0,2],[0,3],[0,4],[4,5],[4,6]],
    tip:'先让 3 号封住下方岔路，再由队友收口。', lesson:'先封住能逃远的路，再把对手逼向可合围的短巷。' },
  { id:3, name:'双巷分工', par:4, turnLimit:4, cops:[0,4,6,10], robbers:[2,8], exits:[5,11],
    nodes:[[100,100],[300,100],[500,100],[500,240],[300,240],[100,240],[100,360],[300,360],[500,360],[500,500],[300,500],[100,500]],
    edges:[...ring(0),...ring(6),[5,6]], tip:'1、2 号负责上巷，3、4 号负责下巷。每侧都要两面收紧。',
    lesson:'抓到一人只是半程：留住另一侧的分工，不要全队围着同一个目标。' },
].map(raw => prepareLevel({...raw,mode:'quick',chapter:0,nodes:raw.nodes.map(([x,y])=>({x,y}))}));
export const quickOutcome = (level,state) => state.robbers.includes(-2) ? 'lost' : state.robbers.every(node=>node===-1) ? (state.turn <= level.turnLimit ? 'won' : 'lost') : state.turn >= level.turnLimit ? 'lost' : 'planning';
export const solveQuick = (level,state) => solve(level,state,{maxDepth:Math.max(0,level.turnLimit-state.turn),maxStates:24000});
export const quickSolutions = Object.fromEntries(quickTrials.map(level => [level.id,solveQuick(level,initialState(level))]));
if (quickTrials.some(level=>!quickSolutions[level.id])) throw new Error('Quick trial requires a complete legal win witness.');
