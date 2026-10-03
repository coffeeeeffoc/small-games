export type Theme = 'home' | 'garden' | 'light' | 'mirror' | 'cosmos';
export type Mode = 'A' | 'B';
export type Dir = 0 | 1 | 2 | 3; // north(-Z), east(+X), south(+Z), west(-X); Y is up.
export const DIRECTIONS = [
  { x: 0, z: -1 },
  { x: 1, z: 0 },
  { x: 0, z: 1 },
  { x: -1, z: 0 },
];
export const SPACING = 8,
  HALF = 3,
  DOOR = 1.15,
  RADIUS = 0.24,
  EYE = 1.62;
export interface Room {
  id: string;
  x: number;
  z: number;
  theme: Theme;
  landmark: string;
  variant: number;
}
export interface Edge {
  id: string;
  a: string;
  b: string;
  gate?: string;
}
export interface Surface {
  room: string;
  dir: Dir;
}
export interface Switch extends Surface {
  id: string;
  label: string;
}
export interface Level {
  id: number;
  name: string;
  theme: Theme;
  version: number;
  seed: number;
  rooms: Room[];
  edges: Edge[];
  entry: string;
  exit: Surface;
  mirrors: Surface[];
  switches: Switch[];
  required: string[];
  minLoops: number;
  tutorial: string;
  design: string; // training, loop, misreading and correction recorded together.
}
export type MarkKind = 'visited' | 'arrow' | 'cleared' | 'return' | 'reference';
export const MARKS: Record<
  MarkKind,
  { symbol: string; label: string; help: string; color: string }
> = {
  visited: { symbol: '●', label: '来过', help: '我到过这里', color: '#c4debc' },
  arrow: { symbol: '↑', label: '方向箭头', help: '我选择的方向', color: '#f1d68b' },
  cleared: { symbol: '✓', label: '已排查', help: '我的判断：暂时不查这条支路', color: '#9cd6de' },
  return: { symbol: '◇', label: '待回访', help: '这里还有未解决的事情', color: '#efb4a0' },
  reference: { symbol: '✦', label: '参考点', help: '辨认空间的位置', color: '#ddd0f1' },
};
export interface Mark {
  kind: MarkKind;
  direction: Dir;
}
export interface Run {
  level: number;
  version: number;
  seed: number;
  mode: Mode;
  viewedMap: boolean;
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  current: string;
  visited: string[];
  candidates: string[];
  verified: Partial<Record<string, 'passage' | 'mirror'>>;
  walked: string[];
  found: string[];
  marks: Record<string, Mark>;
  activated: string[];
  seconds: number;
  placed: number;
  finished: boolean;
  familiar: boolean;
  tutorialDismissed: boolean;
}
export interface Settings {
  fov: number;
  sensitivity: number;
  quality: 'low' | 'high';
  mini: boolean;
  sound: boolean;
}
export interface RecordEntry {
  seconds: number;
  rooms: number;
  marks: number;
  clears: number;
}
export interface Save {
  version: 1;
  unlocked: number;
  played: number[];
  records: Record<string, RecordEntry>;
  settings: Settings;
  run?: Run;
}
export interface Box {
  x: number;
  z: number;
  w: number;
  d: number;
  room: string;
  gate?: string;
  furniture?: boolean;
}
export interface Target {
  id: string;
  kind: 'opening' | 'mirror' | 'switch' | 'exit' | 'anchor';
  room: string;
  dir: Dir;
  x: number;
  y: number;
  z: number;
  label: string;
  switchId?: string;
}
export const roomPosition = (r: Room) => ({ x: r.x * SPACING, z: r.z * SPACING });
export function sideOf(a: Room, b: Room): Dir {
  return b.x > a.x ? 1 : b.x < a.x ? 3 : b.z > a.z ? 2 : 0;
}
export const openingId = (room: string, dir: Dir) => `${room}:${dir}`;
