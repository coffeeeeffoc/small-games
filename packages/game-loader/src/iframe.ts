import {
  HostError,
  gameManifestSchema,
  hostMessageSchema,
  hostResponseSchema,
  type GameHost,
  type GameManifest,
  type HostMessage,
  type JsonValue,
} from '@coffeeeeffoc/game-contract';

import { manifestsMatch, requireStrictCsp } from './artifact-validation.js';
import { dispatchHostRequest, serializeHostError } from './host-dispatch.js';
import { BrowserIframePlatform, type IframePlatform } from './iframe-platform.js';
import { IframeLifecycle } from './iframe-lifecycle.js';

/** Immutable remote artifact selected from a trusted Game Catalog. */
export type RemoteGameArtifact = Readonly<{
  entryUrl: string;
  manifest: GameManifest;
}>;

/** Runtime options for one isolated iframe Game loader. */
export type IframeGameLoaderOptions = Readonly<{
  shellOrigin?: string;
  timeoutMs?: number;
  platform?: IframePlatform;
}>;

/** Loads one verified remote Game and brokers its complete Host/lifecycle boundary. */
export class IframeGameLoader {
  private readonly shellOrigin: string;
  private readonly timeoutMs: number;
  private readonly platform: IframePlatform;
  private frame: ReturnType<IframePlatform['createFrame']> | null = null;
  private stopListening: (() => void) | null = null;
  private launchAbort: AbortController | null = null;
  private host: GameHost | null = null;
  private artifact: RemoteGameArtifact | null = null;
  private generation = 0;
  private connected = false;
  private readonly lifecycle = new IframeLifecycle();
  private cleaning: Promise<void> | null = null;

  constructor(options: IframeGameLoaderOptions = {}) {
    this.shellOrigin = options.shellOrigin ?? window.location.origin;
    this.timeoutMs = options.timeoutMs ?? 5_000;
    this.platform = options.platform ?? new BrowserIframePlatform();
  }

  /** Verifies and launches an Artifact, resolving only after a valid iframe handshake. */
  async launch(
    artifactInput: RemoteGameArtifact,
    target: HTMLElement,
    host: GameHost,
  ): Promise<void> {
    const generation = ++this.generation;
    await this.cleanup();
    if (generation !== this.generation)
      throw new HostError({ code: 'CANCELLED', message: 'Remote Game launch cancelled' });
    const parsed = gameManifestSchema.safeParse(artifactInput.manifest);
    if (!parsed.success)
      throw new HostError({ code: 'INVALID_INPUT', message: 'Remote Game manifest is invalid' });
    const artifact = { ...artifactInput, manifest: parsed.data };
    const artifactUrl = new URL(artifact.entryUrl, this.shellOrigin);
    if (artifactUrl.origin === this.shellOrigin)
      throw new HostError({
        code: 'INVALID_INPUT',
        message: 'Remote Game must use an independent origin',
      });
    if (!artifact.manifest.loadModes.includes('iframe'))
      throw new HostError({ code: 'UNAVAILABLE', message: 'Game does not support iframe loading' });
    if (
      host.session.gameId !== artifact.manifest.gameId ||
      host.session.gameVersion !== artifact.manifest.version
    )
      throw new HostError({ code: 'INVALID_INPUT', message: 'Game Session identity mismatch' });
    const missing = artifact.manifest.capabilities.find(
      (capability) => !host.session.capabilities.includes(capability),
    );
    if (missing)
      throw new HostError({
        code: 'CAPABILITY_MISSING',
        message: `Missing capability: ${missing}`,
      });

    const abort = new AbortController();
    this.launchAbort = abort;
    const timeout = setTimeout(() => abort.abort('timeout'), this.timeoutMs);
    try {
      const fetched = await this.platform.fetchArtifact(artifactUrl.href, abort.signal);
      if (generation !== this.generation) abort.abort('cancelled');
      requireStrictCsp(fetched.csp, this.shellOrigin);
      const integrity = await this.platform.sha256(fetched.body);
      if (generation !== this.generation) abort.abort('cancelled');
      if (integrity !== artifact.manifest.integrity)
        throw new HostError({ code: 'INVALID_INPUT', message: 'Remote Game integrity mismatch' });
      if (abort.signal.aborted)
        throw new HostError({ code: 'CANCELLED', message: 'Remote Game launch was cancelled' });
      this.host = {
        ...host,
        session: Object.freeze({
          ...host.session,
          capabilities: Object.freeze([...artifact.manifest.capabilities]),
        }),
      };
      this.artifact = artifact;
      this.frame = this.platform.createFrame(target, fetched.body, fetched.csp);
      await this.awaitHandshake(abort.signal);
    } catch (error) {
      const abortReason = abort.signal.aborted ? abort.signal.reason : null;
      if (this.launchAbort === abort) this.launchAbort = null;
      if (generation === this.generation) await this.cleanup();
      if (abortReason)
        throw new HostError({
          code: abortReason === 'timeout' ? 'TIMEOUT' : 'CANCELLED',
          message:
            abortReason === 'timeout' ? 'Remote Game timed out' : 'Remote Game launch cancelled',
          retryable: true,
        });
      throw error;
    } finally {
      clearTimeout(timeout);
      if (this.launchAbort === abort) this.launchAbort = null;
    }
  }

  /** Sends a validated lifecycle pause event to the active remote Game. */
  async pause(): Promise<void> {
    await this.transition('pause');
  }

  /** Sends a validated lifecycle resume event to the active remote Game. */
  async resume(): Promise<void> {
    await this.transition('resume');
  }

  /** Cancels pending work, requests remote disposal, and removes the sandbox. */
  async dispose(): Promise<void> {
    this.generation += 1;
    await this.cleanup();
  }

  private async cleanup(): Promise<void> {
    if (this.cleaning) return this.cleaning;
    const cleaning = this.performCleanup();
    this.cleaning = cleaning;
    try {
      await cleaning;
    } finally {
      if (this.cleaning === cleaning) this.cleaning = null;
    }
  }

  private async performCleanup(): Promise<void> {
    this.launchAbort?.abort('cancelled');
    this.launchAbort = null;
    const frame = this.frame;
    try {
      if (this.connected) await this.transition('dispose');
      else if (frame && this.host) this.sendLifecycle('dispose');
    } finally {
      if (this.frame === frame) {
        this.lifecycle.cancel();
        this.stopListening?.();
        frame?.remove();
        this.stopListening = null;
        this.frame = null;
        this.host = null;
        this.artifact = null;
        this.connected = false;
      }
    }
  }

  private awaitHandshake(signal: AbortSignal): Promise<void> {
    const frame = this.frame;
    const host = this.host;
    const artifact = this.artifact;
    if (!frame || !host || !artifact)
      return Promise.reject(new HostError({ code: 'CANCELLED', message: 'Launch is not active' }));
    return new Promise((resolve, reject) => {
      let handshaken = false;
      const onAbort = () =>
        reject(new HostError({ code: 'CANCELLED', message: 'Launch cancelled' }));
      signal.addEventListener('abort', onAbort, { once: true });
      this.stopListening = this.platform.listen((event) => {
        if (event.source !== frame.source || event.origin !== 'null') return;
        const parsed = hostMessageSchema.safeParse(event.data);
        if (!parsed.success) {
          reject(new HostError({ code: 'INVALID_INPUT', message: 'Malformed iframe message' }));
          return;
        }
        const message = parsed.data;
        if (
          message.gameId !== artifact.manifest.gameId ||
          message.sessionId !== host.session.sessionId
        ) {
          reject(
            new HostError({ code: 'INVALID_INPUT', message: 'Iframe message identity mismatch' }),
          );
          return;
        }
        if (handshaken) {
          if (message.kind === 'event' && message.name === 'lifecycle-complete')
            this.lifecycle.acknowledge(message.payload);
          if (message.kind === 'request') void this.answer(message);
          if (message.kind === 'event' && message.name === 'ready' && message.payload === null) {
            signal.removeEventListener('abort', onAbort);
            this.stopListening?.();
            this.stopListening = this.platform.listen((nextEvent) => this.handleMessage(nextEvent));
            resolve();
          }
          if (message.kind === 'event' && message.name === 'mount-failed')
            reject(new HostError({ code: 'UNAVAILABLE', message: 'Remote Game mount failed' }));
          return;
        }
        if (message.kind !== 'handshake') {
          reject(
            new HostError({ code: 'INVALID_INPUT', message: 'Iframe handshake was required' }),
          );
          return;
        }
        if (!manifestsMatch(message.manifest, artifact.manifest)) {
          reject(
            new HostError({ code: 'INVALID_INPUT', message: 'Iframe manifest claim mismatch' }),
          );
          return;
        }
        handshaken = true;
        this.connected = true;
        this.sendLifecycle('mount');
      });
      frame.post({
        protocolVersion: 1,
        kind: 'event',
        gameId: artifact.manifest.gameId,
        sessionId: host.session.sessionId,
        name: 'init',
        payload: {
          gameVersion: host.session.gameVersion,
          releaseChannel: host.session.releaseChannel,
          adAuthority: host.session.adAuthority,
          locale: host.session.locale,
          capabilities: [...host.session.capabilities],
        },
      });
    });
  }

  private handleMessage(event: MessageEvent<unknown>): void {
    const frame = this.frame;
    const host = this.host;
    const artifact = this.artifact;
    if (!frame || !host || !artifact || event.source !== frame.source || event.origin !== 'null')
      return;
    const message = hostMessageSchema.safeParse(event.data);
    if (!message.success) return;
    if (
      message.data.gameId !== artifact.manifest.gameId ||
      message.data.sessionId !== host.session.sessionId
    )
      return;
    if (message.data.kind === 'event' && message.data.name === 'lifecycle-complete') {
      this.lifecycle.acknowledge(message.data.payload);
      return;
    }
    if (message.data.kind !== 'request') return;
    void this.answer(message.data);
  }

  private async answer(request: Extract<HostMessage, { kind: 'request' }>): Promise<void> {
    const host = this.host;
    const artifact = this.artifact;
    const frame = this.frame;
    if (!host || !artifact || !frame) return;
    try {
      const result = await dispatchHostRequest(host, request.method, request.params);
      if (this.frame !== frame) return;
      frame.post(
        hostResponseSchema.parse({
          protocolVersion: 1,
          kind: 'response',
          gameId: artifact.manifest.gameId,
          sessionId: host.session.sessionId,
          id: request.id,
          result,
        }),
      );
    } catch (error) {
      if (this.frame !== frame) return;
      frame.post(
        hostResponseSchema.parse({
          protocolVersion: 1,
          kind: 'response',
          gameId: artifact.manifest.gameId,
          sessionId: host.session.sessionId,
          id: request.id,
          error: serializeHostError(error),
        }),
      );
    }
  }

  private transition(name: 'pause' | 'resume' | 'dispose'): Promise<void> {
    if (!this.frame) return Promise.resolve();
    return this.lifecycle.request((payload) => this.sendLifecycle(name, payload), this.timeoutMs);
  }

  private sendLifecycle(
    name: 'mount' | 'pause' | 'resume' | 'dispose',
    payload: JsonValue = null,
  ): void {
    if (!this.frame || !this.host || !this.artifact) return;
    this.frame.post({
      protocolVersion: 1,
      kind: 'event',
      gameId: this.artifact.manifest.gameId,
      sessionId: this.host.session.sessionId,
      name,
      payload,
    });
  }
}
