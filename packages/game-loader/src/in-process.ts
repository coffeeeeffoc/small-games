import {
  HostError,
  type GameDefinition,
  type GameHost,
  type GameInstance,
} from '@coffeeeeffoc/game-contract';

/** Serializes trusted in-process Game lifecycle transitions for one Shell viewport. */
export class InProcessGameLoader {
  private current: GameInstance | null = null;
  private queue: Promise<void> = Promise.resolve();

  /** Disposes any current Game before mounting the next trusted definition. */
  launch(definition: GameDefinition, target: HTMLElement, host: GameHost): Promise<void> {
    return this.enqueue(async () => {
      if (!definition.manifest.loadModes.includes('in-process')) {
        throw new HostError({
          code: 'UNAVAILABLE',
          message: 'Game does not support trusted in-process loading',
        });
      }
      await this.disposeCurrent();
      this.current = await definition.mount(target, host);
    });
  }

  /** Pauses the active Game after any pending launch completes. */
  pause(): Promise<void> {
    return this.enqueue(() => this.current?.pause());
  }

  /** Resumes the active Game after any pending launch completes. */
  resume(): Promise<void> {
    return this.enqueue(() => this.current?.resume());
  }

  /** Disposes the active Game exactly once and leaves the loader reusable. */
  dispose(): Promise<void> {
    return this.enqueue(() => this.disposeCurrent());
  }

  private enqueue(operation: () => void | Promise<void>): Promise<void> {
    const result = this.queue.then(operation);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async disposeCurrent(): Promise<void> {
    const instance = this.current;
    if (!instance) return;
    await instance.dispose();
    if (this.current === instance) this.current = null;
  }
}
