import {
  HostError,
  type GameDefinition,
  type GameHost,
  type GameManifest,
} from '@coffeeeeffoc/game-contract';

import { IframeGameLoader, type RemoteGameArtifact } from './iframe.js';
import { InProcessGameLoader } from './in-process.js';

/** Ordered remote and built-in candidates for one catalog launch. */
export type FallbackLaunchPlan = Readonly<{
  target: RemoteGameArtifact;
  lastKnownGood?: RemoteGameArtifact | null;
  builtIn: GameDefinition;
  rememberLastKnownGood?: (artifact: RemoteGameArtifact) => void;
}>;

/** Observable source and version selected after fallback resolution. */
export type LaunchResult = Readonly<{
  source: 'target' | 'last-known-good' | 'built-in';
  version: string;
}>;

type Loader = Readonly<{
  launch(artifact: RemoteGameArtifact, target: HTMLElement, host: GameHost): Promise<void>;
  pause(): void | Promise<void>;
  resume(): void | Promise<void>;
  dispose(): void | Promise<void>;
}>;

/** Tracks repeated version failures and temporarily suppresses known-bad candidates. */
export class VersionCircuitBreaker {
  private readonly failures = new Map<string, { count: number; openedAt: number | null }>();

  constructor(
    private readonly threshold = 2,
    private readonly cooldownMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  /** Returns whether a version is still inside its failure cooldown. */
  isOpen(manifest: GameManifest): boolean {
    const state = this.failures.get(this.key(manifest));
    if (!state || state.openedAt === null) return false;
    if (this.now() - state.openedAt < this.cooldownMs) return true;
    this.failures.delete(this.key(manifest));
    return false;
  }

  /** Records one failed launch and opens the circuit at the configured threshold. */
  recordFailure(manifest: GameManifest): void {
    const key = this.key(manifest);
    const current = this.failures.get(key) ?? { count: 0, openedAt: null };
    const count = current.count + 1;
    this.failures.set(key, { count, openedAt: count >= this.threshold ? this.now() : null });
  }

  /** Clears prior failures after a successful verified launch. */
  recordSuccess(manifest: GameManifest): void {
    this.failures.delete(this.key(manifest));
  }

  private key(manifest: GameManifest): string {
    return `${manifest.gameId}@${manifest.version}`;
  }
}

/** Resolves target, last-known-good, and built-in versions without leaving partial frames. */
export class FallbackGameLoader {
  private active: Loader | InProcessGameLoader | null = null;
  private generation = 0;

  constructor(
    private readonly createRemote: () => Loader = () => new IframeGameLoader(),
    private readonly breaker = new VersionCircuitBreaker(),
    private readonly inProcess = new InProcessGameLoader(),
  ) {}

  /** Attempts the target, then a distinct LKG, before mounting the compatible built-in Game. */
  async launch(
    plan: FallbackLaunchPlan,
    target: HTMLElement,
    createHost: (manifest: GameManifest) => GameHost,
  ): Promise<LaunchResult> {
    const generation = ++this.generation;
    await this.disposeActive();
    if (generation !== this.generation)
      throw new HostError({ code: 'CANCELLED', message: 'Game launch was cancelled' });
    const candidates: Array<
      Readonly<{ source: 'target' | 'last-known-good'; artifact: RemoteGameArtifact }>
    > = [{ source: 'target', artifact: plan.target }];
    if (plan.target.manifest.gameId !== plan.builtIn.manifest.gameId)
      throw new HostError({ code: 'INVALID_INPUT', message: 'Catalog Game identity mismatch' });
    if (
      plan.lastKnownGood &&
      plan.lastKnownGood.manifest.gameId === plan.builtIn.manifest.gameId &&
      plan.lastKnownGood.manifest.version !== plan.target.manifest.version
    )
      candidates.push({ source: 'last-known-good', artifact: plan.lastKnownGood });

    for (const candidate of candidates) {
      if (this.breaker.isOpen(candidate.artifact.manifest)) continue;
      const loader = this.createRemote();
      this.active = loader;
      try {
        await loader.launch(candidate.artifact, target, createHost(candidate.artifact.manifest));
        if (generation !== this.generation)
          throw new HostError({ code: 'CANCELLED', message: 'Game launch was cancelled' });
        this.breaker.recordSuccess(candidate.artifact.manifest);
        plan.rememberLastKnownGood?.(candidate.artifact);
        return { source: candidate.source, version: candidate.artifact.manifest.version };
      } catch {
        if (generation !== this.generation)
          throw new HostError({ code: 'CANCELLED', message: 'Game launch was cancelled' });
        this.breaker.recordFailure(candidate.artifact.manifest);
        await loader.dispose();
        if (generation !== this.generation)
          throw new HostError({ code: 'CANCELLED', message: 'Game launch was cancelled' });
        if (this.active === loader) this.active = null;
        target.replaceChildren();
      }
    }

    if (!plan.builtIn.manifest.loadModes.includes('in-process'))
      throw new HostError({
        code: 'UNAVAILABLE',
        message: 'No compatible Game fallback is available',
      });
    this.active = this.inProcess;
    await this.inProcess.launch(plan.builtIn, target, createHost(plan.builtIn.manifest));
    if (generation !== this.generation)
      throw new HostError({ code: 'CANCELLED', message: 'Game launch was cancelled' });
    return { source: 'built-in', version: plan.builtIn.manifest.version };
  }

  /** Pauses whichever candidate won the launch race. */
  async pause(): Promise<void> {
    await this.active?.pause();
  }

  /** Resumes whichever candidate won the launch race. */
  async resume(): Promise<void> {
    await this.active?.resume();
  }

  /** Disposes the active candidate and leaves the resolver reusable. */
  async dispose(): Promise<void> {
    this.generation += 1;
    await this.disposeActive();
  }

  private async disposeActive(): Promise<void> {
    const active = this.active;
    this.active = null;
    await active?.dispose();
  }
}
