import type { WebGLRenderer } from 'three';
import type { Battle } from './rules.js';
/** Rebuild the full caster map on damage and after the cannon finishes turning. */
export class SceneShadows {
  private destroyed = -1;
  private finalAt: number | null = null;
  private lastTurn = 0;
  private pending = false;
  reset(renderer: WebGLRenderer) {
    this.destroyed = -1;
    this.finalAt = null;
    this.pending = false;
    renderer.shadowMap.needsUpdate = true;
  }
  update(b: Battle, turned: boolean, renderer: WebGLRenderer) {
    const count = b.modules.filter((m) => m.hp === 0).length;
    if (count !== this.destroyed) {
      this.destroyed = count;
      this.finalAt = b.time + 1.5;
      renderer.shadowMap.needsUpdate = true;
    }
    if (turned) {
      this.lastTurn = Date.now();
      this.pending = true;
    }
    if (this.pending && !turned && Date.now() - this.lastTurn >= 200) {
      this.pending = false;
      renderer.shadowMap.needsUpdate = true;
    }
    if (this.finalAt !== null && b.time >= this.finalAt) {
      this.finalAt = null;
      renderer.shadowMap.needsUpdate = true;
    }
  }
}
