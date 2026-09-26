import Matter from 'phaser/src/physics/matter-js/CustomMain.js';
import { Physics } from '../src/physics';
import { Simulation } from '../src/simulation';
import { C } from '../src/config';
import { levels, type Level } from '../src/levels';
export const make = (level: Level = levels[0]) => new Simulation(new Physics(Matter, Matter.Engine.create()), level);
export function step(s: Simulation, ms: number) { for (let n = 0; n < Math.round(ms / C.step); n++) s.advance(C.step); }
export function charge(s: Simulation, ms: number, direction = { x: 0.7, y: -0.8 }) { s.setAim(direction); const started = s.begin('test'); step(s, ms); return started && s.releaseCharge('test'); }
