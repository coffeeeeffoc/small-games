export type Point = { x: number; y: number; depth: number };
export type Turn = { plane: string; angle: number };
export function rotateVector(vector: number[], turn: Turn | null): number[];
export function piecePose(
  event: { type: string; plane: string; direction: number; from: number[][]; to: number[][] },
  progress: number,
): { cells: number[][]; rotation: Turn | null };
export const cubeFaces: {
  axis: number;
  sign: number;
  vertices: number[][];
  normal: number[];
  center: boolean;
}[];
export class Projection {
  camera: { yaw: number; pitch: number };
  dims: number[];
  flip: { axis: number; angle: number } | null;
  width: number;
  height: number;
  scale: number;
  distance: number;
  centerX: number;
  centerY: number;
  setView(view: string): void;
  velocity: { x: number; y: number };
  orbit(dx: number, dy: number, seconds?: number): void;
  coast(seconds: number): void;
  stopOrbit(): void;
  planeDelta(dx: number, dy: number, anchor?: number[]): { x: number; y: number };
  _rotate(point: number[]): number[];
  _normal(axis: number, sign: number): number[];
  _direction(): number[];
  _fit(): void;
  _corners(origin?: number[], size?: number[]): Point[];
  project(point: number[]): Point;
}
