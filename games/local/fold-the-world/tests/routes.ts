import assert from 'node:assert/strict';
import { Puzzle } from '../src/game';
import { STEP } from '../src/physics';
import type { Direction } from '../src/geometry';
export type Action = { kind: 'walk' | 'jump'; x: number } | { kind:'fold'; crease: string; direction: Direction } | { kind:'unfold' };
const walk = (x: number): Action => ({kind:'walk',x});
const jump = (x: number): Action => ({kind:'jump',x});
const fold = (crease = 'A', direction: Direction = 'right-to-left'): Action => ({kind:'fold',crease,direction});
const unfold: Action = {kind:'unfold'};
// Authored waypoints, not a solver. All changes to the body go through Puzzle.tick / stepBody.
export const routes: readonly Action[][] = [
  [fold(),walk(440)],
  [fold('A','left-to-right'),walk(740)],
  [fold('B'),walk(530)],
  [fold(),walk(230),jump(325),walk(440)],
  [fold(),walk(300),jump(385),walk(440)],
  [fold(),walk(405),walk(105)],
  [fold(),walk(450),unfold,jump(510),walk(535)],
  [fold(),walk(445),walk(170),unfold,walk(100)],
  [fold(),walk(515),unfold,fold('B'),jump(455),walk(441),jump(375),walk(395),jump(465),walk(495)],
  [fold(),jump(210),walk(235),jump(365),walk(550),unfold,walk(850),jump(918),jump(955),fold('B','left-to-right'),jump(875),walk(820),jump(775),walk(750)],
  [fold(),walk(510),unfold,fold('B'),jump(435),walk(402),jump(330),walk(310),jump(375),unfold,walk(445)],
  [fold(),jump(210),walk(235),jump(365),walk(550),unfold,walk(850),jump(918),jump(955),fold('B','left-to-right'),jump(875),walk(820),jump(775),unfold,walk(715)],
  [fold(),walk(480),unfold,fold('B'),jump(540),jump(465),walk(500),jump(565),unfold,fold('C'),jump(485),jump(565),walk(605)],
  [fold(),walk(480),unfold,fold('B'),jump(540),jump(465),walk(380),walk(470),jump(540),unfold,fold(),jump(470),walk(330)],
  [fold(),walk(480),unfold,fold('B'),jump(540),jump(465),walk(380),walk(480),jump(565),unfold,fold('C'),jump(485),jump(620),unfold,walk(550),fold(),walk(470),walk(170),unfold,walk(105)],
  [fold(),jump(210),walk(235),jump(365),walk(550),unfold,walk(840),jump(918),jump(955),fold('B','left-to-right'),jump(875),walk(820),jump(775),walk(720),jump(630),unfold,fold('C'),jump(550),walk(560),jump(630),unfold,walk(550),fold(),walk(503),walk(335),jump(270),jump(210),walk(170),walk(105)],
];
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
