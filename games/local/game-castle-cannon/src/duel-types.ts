export type Side = 0 | 1;
export type Point = { x: number; y: number; z: number };
export type Ammo = 'solid' | 'blast';
export type Command =
  | { type: 'aim'; pitch: number; yaw: number }
  | { type: 'charge' | 'fire' | 'cancel' | 'retreat' | 'heal' | 'leave' }
  | { type: 'crouch'; down: boolean }
  | { type: 'station'; id: string }
  | { type: 'ammo'; ammo: Ammo };
export interface Gun {
  repair: number | null;
  id: string;
  label: string;
  node: string;
  position: Point;
  bunker: boolean;
  hp: number;
  pitch: number;
  yaw: number;
  reload: number;
  ammo: Ammo;
  charge: number | null;
  firedAt: number;
}
export interface Structure {
  id: string;
  side: Side;
  position: Point;
  size: Point;
  hp: number;
  maxHp: number;
  kind: 'wall' | 'tower' | 'keep' | 'gate';
}
export interface Fighter {
  side: Side;
  hp: number;
  medicines: number;
  position: Point;
  node: string;
  destination: string;
  route: Point[];
  station: string | null;
  crouched: boolean;
  healing: number | null;
  healOnArrival: boolean;
  destroyed: boolean;
  guns: Gun[];
  lastShot: {
    pitch: number;
    yaw: number;
    power: number;
    impact: Point | null;
    trail: Point[];
  } | null;
  lastInput: number;
}
export interface Shell {
  id: number;
  side: Side;
  ammo: Ammo;
  position: Point;
  velocity: Point;
  power: number;
  age: number;
  trail: Point[];
}
export interface Impact {
  id: number;
  position: Point;
  at: number;
  ammo: Ammo;
  hit: string;
}
export interface Duel {
  version: 'duel-v1';
  mapId: string;
  time: number;
  tick: number;
  nextId: number;
  fighters: [Fighter, Fighter];
  structures: Structure[];
  shells: Shell[];
  impacts: Impact[];
  result: {
    winner: Side | null;
    reason: 'death' | 'leave' | 'disconnect' | 'time' | 'inactive';
  } | null;
}
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
export const direction = (side: Side) => (side === 0 ? 1 : -1);
