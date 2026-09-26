import { buildWorld, movingSide, overlaps, SAFE_BAND, type Fold, type Level, type WorldEntity } from './geometry';
import { bodyOverlaps, fell, makeBody, STEP, stepBody, type Input } from './physics';
import { TEXT } from './strings';
export type Mode = 'PLAYING' | 'FOLD_PREVIEW' | 'FOLD_ANIMATING' | 'PAUSED' | 'DEAD' | 'COMPLETED';
export const FOLD_SECONDS = 0.56;
export class Puzzle {
  readonly level: Level;
  body;
  mode: Mode = 'PLAYING'; fold: Fold | null = null; world: WorldEntity[];
  collected = new Set<string>(); folds = 0; unfolds = 0; elapsed = 0; message = '';
  target: Fold | null = null; preview = 0; animation = 0; deadTime = 0; deaths = 0; revision = 0;
  returning = false; private startProgress = 0;
  private pausedMode: Mode = 'PLAYING';
  get visualTransition(): boolean { return this.mode === 'PAUSED' && this.pausedMode === 'FOLD_ANIMATING'; }
  constructor(level: Level) { this.level = level; this.body = makeBody(level.spawn); this.world = buildWorld(level, null); }
  restart(): void {
    this.body = makeBody(this.level.spawn); this.mode = 'PLAYING'; this.fold = null; this.target = null;
    this.collected.clear(); this.folds = 0; this.unfolds = 0; this.elapsed = 0; this.preview = 0; this.message = '';
    this.world = buildWorld(this.level, null); this.revision++;
  }
  safety(target: Fold | null): string {
    if (this.fold && target) return TEXT.nested;
    const operation = this.fold ?? target;
    if (!operation) return TEXT.nested;
    const c = this.level.creases.find(c => c.id === operation.crease);
    if (!c || !c.directions.includes(operation.direction)) return TEXT.side;
    const b = this.body;
    if (!b.grounded || Math.abs(b.vx) > 8 || Math.abs(b.vy) > 0.01) return TEXT.grounded;
    const fixedSide = operation.direction === 'right-to-left' ? b.x + b.w <= c.x - SAFE_BAND : b.x >= c.x + SAFE_BAND;
    if (!fixedSide) return TEXT.side;
    const supports = this.level.entities.filter(e => e.kind === 'platform' && !movingSide(e, c.x, operation.direction) && Math.abs(b.y + b.h - e.y) < 0.01).sort((a,z)=>a.x-z.x);
    let covered = b.x;
    for (const e of supports) if(e.x <= covered + 0.001 && e.x + e.w > covered) covered = e.x + e.w;
    if (covered < b.x + b.w - 0.001) return this.fold ? TEXT.fixed : TEXT.side;
    const targetWorld = buildWorld(this.level, target, this.collected);
    if (targetWorld.some(e => (e.kind === 'platform' || e.kind === 'spike') && overlaps(b, e))) return TEXT.blocked;
    return '';
  }
  beginPreview(target: Fold | null): boolean {
    if (this.mode !== 'PLAYING') return false;
    this.message = this.safety(target);
    if (this.message) return false;
    this.target = target; this.preview = 0; this.mode = 'FOLD_PREVIEW'; this.revision++; return true;
  }
  cancelPreview(): void {
    if (this.mode !== 'FOLD_PREVIEW') return;
    this.mode = 'PLAYING'; this.preview = 0; this.target = null; this.revision++;
  }
  releasePreview(): void {
    if (this.mode !== 'FOLD_PREVIEW') return;
    this.returning = this.preview < 0.5;
    this.startProgress = this.preview; this.animation = 0; this.mode = 'FOLD_ANIMATING'; this.revision++;
  }
  request(target: Fold | null): boolean {
    if (!this.beginPreview(target)) return false;
    this.preview = 0.5; this.releasePreview(); this.preview = 0; this.startProgress = 0; return true;
  }
  pause(): void {
    if (this.mode === 'FOLD_PREVIEW') this.cancelPreview();
    if (this.mode === 'PLAYING' || this.mode === 'FOLD_ANIMATING') { this.pausedMode = this.mode; this.mode = 'PAUSED'; this.revision++; }
  }
  resume(): void { if (this.mode === 'PAUSED') { this.mode = this.pausedMode; this.revision++; } }
  tick(dt: number, input: Input): void {
    if (this.mode === 'FOLD_ANIMATING') {
      this.animation += dt;
      const t = Math.min(1, this.animation / (this.returning ? 0.22 : FOLD_SECONDS));
      this.preview = this.startProgress + ((this.returning ? 0 : 1) - this.startProgress) * (t * t * (3 - 2 * t));
      if (t >= 1) {
        if (!this.returning) {
          const reason = this.safety(this.target);
          if (!reason) { this.fold = this.target; this.world = buildWorld(this.level, this.fold, this.collected); if (this.fold) this.folds++; else this.unfolds++; this.body.buffer = 0; }
          else this.message = reason;
        }
        this.mode = 'PLAYING'; this.preview = 0; this.target = null; this.revision++;
      }
      return;
    }
    if (this.mode === 'DEAD') { this.deadTime += dt; if (this.deadTime > 0.35) this.restart(); return; }
    if (this.mode !== 'PLAYING') return;
    this.elapsed += dt;
    stepBody(this.body, this.world.filter(e => e.kind === 'platform'), input, dt);
    if (fell(this.body) || bodyOverlaps(this.body, this.world.filter(e => e.kind === 'spike'))) { this.mode = 'DEAD'; this.deadTime = 0; this.deaths++; this.message = TEXT.failed; this.revision++; return; }
    for (const e of this.world) if (e.kind === 'key' && overlaps(this.body, e)) { this.collected.add(e.id); this.revision++; }
    this.world = this.world.filter(e => e.kind !== 'key' || !this.collected.has(e.id));
    if (this.world.some(e => e.kind === 'exit' && overlaps(this.body, e))) {
      if (this.collected.size === this.level.entities.filter(e => e.kind === 'key').length) { this.mode = 'COMPLETED'; this.revision++; }
      else this.message = TEXT.keyNeeded;
    }
  }
}
// Bound wall-clock debt; focus changes discard it, so the player never catches up offscreen.
export class FixedClock {
  private debt = 0;
  reset(): void { this.debt = 0; }
  advance(milliseconds: number, step: () => void): number {
    if (!Number.isFinite(milliseconds) || milliseconds < 0 || milliseconds > 150) { this.reset(); return 0; }
    this.debt += Math.min(milliseconds / 1000, 0.1);
    let count = 0;
    while (this.debt + 1e-9 >= STEP && count < 12) { this.debt -= STEP; count++; step(); }
    return count;
  }
}
