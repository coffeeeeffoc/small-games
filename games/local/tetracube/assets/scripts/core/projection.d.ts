export type Point = { x: number; y: number; depth: number };
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
  orbit(dx: number, dy: number): void;
  planeDelta(dx: number, dy: number, anchor?: number[]): { x: number; y: number };
  _rotate(point: number[]): number[];
  _normal(axis: number, sign: number): number[];
  _direction(): number[];
  _fit(): void;
  _corners(origin?: number[], size?: number[]): Point[];
  project(point: number[]): Point;
}
