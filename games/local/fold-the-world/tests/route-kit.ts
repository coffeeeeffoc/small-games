import assert from 'node:assert/strict';
import { Puzzle } from '../src/game';
import { STEP } from '../src/physics';
import type { Direction } from '../src/geometry';
export type Action = { kind: 'walk' | 'jump'; x: number } | { kind:'fold'; crease: string; direction: Direction } | { kind:'unfold' };
export const walk = (x: number): Action => ({kind:'walk',x});
export const jump = (x: number): Action => ({kind:'jump',x});
export const fold = (crease = 'A', direction: Direction = 'right-to-left'): Action => ({kind:'fold',crease,direction});
export const unfold: Action = {kind:'unfold'};
export function runAction(game: Puzzle, action: Action): void {
  const beforeDeaths = game.deaths;
  const tick = (axis = 0, jump = false): void => {
    game.tick(STEP,{axis,jump});
    assert.equal(game.deaths,beforeDeaths,`Death during ${JSON.stringify(action)} at ${JSON.stringify(game.body)}`);
  };
  if (action.kind === 'fold' || action.kind === 'unfold') {
    for(let i=0;i<30;i++) tick();
    assert.ok(game.request(action.kind === 'fold' ? {crease:action.crease,direction:action.direction} : null),`${JSON.stringify(action)}: ${game.message}, body=${JSON.stringify(game.body)}`);
    for(let i=0;i<75;i++) tick();
    return;
  }
  let airborne = false;
  for(let i=0;i<1100;i++) {
    const distance = action.x - game.body.x;
    // Full steering in air preserves useful jump range; ease on ground to stop reliably.
    const axis = Math.max(-1,Math.min(1,distance / (game.body.grounded ? 10 : 8)));
    tick(axis,action.kind === 'jump' && i === 0);
    airborne ||= !game.body.grounded;
    if (game.mode === 'COMPLETED') return;
    if (Math.abs(action.x-game.body.x)<3 && Math.abs(game.body.vx)<8 && game.body.grounded && (action.kind==='walk'||airborne)) return;
  }
  assert.fail(`Could not ${JSON.stringify(action)}: ${JSON.stringify(game.body)}`);
}
export function runRoute(game: Puzzle, actions: readonly Action[]): void {
  for(let i=0;i<10;i++) game.tick(STEP,{axis:0,jump:false});
  for(const action of actions) runAction(game,action);
}
