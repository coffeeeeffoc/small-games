import { z, type ZodType } from 'zod';

import {
  HostError,
  hostMessageSchema,
  type GameDefinition,
  type GameHost,
  type GameInstance,
  type GameSessionContext,
  type HostMessage,
  type JsonValue,
} from '@coffeeeeffoc/game-contract';
import { lifecycleRequestSchema, iframeInitSchema as initSchema } from './iframe-lifecycle.js';
import {
  serializeHostError,
  contentResultSchema as contentSchema,
  storageResultSchema as storageSchema,
  rewardResultSchema as rewardSchema,
} from './host-dispatch.js';

import { browserClientPlatform, type IframeClientPlatform } from './iframe-client-platform.js';
export type { IframeClientPlatform } from './iframe-client-platform.js';

/** Trusted Shell origin and replaceable browser primitives for a remote Game entry. */
export type IframeGameClientOptions = Readonly<{
  shellOrigin: string;
  platform?: IframeClientPlatform;
  timeoutMs?: number;
}>;

type PendingRequest = Readonly<{
  schema: ZodType<JsonValue>;
  resolve(value: JsonValue): void;
  reject(reason: unknown): void;
  timer: ReturnType<typeof setTimeout>;
}>;

/** Remote-side bridge that exposes only validated Game Host RPC and lifecycle messages. */
export class IframeGameClient {
  private readonly platform: IframeClientPlatform;
  private readonly timeoutMs: number;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly stopListening: () => void;
  private session: GameSessionContext | null = null;
  private instance: GameInstance | null = null;
  private nextId = 0;
  private disposed = false;
  private mounting: Promise<void> | null = null;
  private paused = false;
  private disposal: Promise<void> | null = null;

  constructor(
    private readonly definition: GameDefinition,
    private readonly options: IframeGameClientOptions,
  ) {
    this.platform = options.platform ?? browserClientPlatform();
    this.timeoutMs = options.timeoutMs ?? 5_000;
    this.stopListening = this.platform.listen((event) => this.receive(event));
  }

  /** Stops the bridge, rejects pending RPC, and disposes the mounted Game. */
  dispose(): Promise<void> {
    this.disposal ??= this.finishDisposal();
    return this.disposal;
  }

  private async finishDisposal(): Promise<void> {
    try {
      await this.mounting?.catch(() => undefined);
      const instance = this.instance;
      this.instance = null;
      await instance?.dispose();
    } finally {
      this.disposed = true;
      this.stopListening();
      for (const request of this.pending.values()) {
        clearTimeout(request.timer);
        request.reject(new HostError({ code: 'CANCELLED', message: 'Iframe Game disposed' }));
      }
      this.pending.clear();
    }
  }

  private receive(event: MessageEvent<unknown>): void {
    if (
      this.disposed ||
      event.source !== this.platform.parent ||
      event.origin !== this.options.shellOrigin
    )
      return;
    const parsed = hostMessageSchema.safeParse(event.data);
    if (!parsed.success) return;
    const message = parsed.data;
    if (!this.session) {
      if (message.kind !== 'event' || message.name !== 'init') return;
      this.initialize(message.gameId, message.sessionId, message.payload);
      return;
    }
    if (message.gameId !== this.session.gameId || message.sessionId !== this.session.sessionId)
      return;
    if (message.kind === 'response') this.receiveResponse(message);
    if (message.kind === 'event') void this.handleLifecycle(message.name, message.payload);
  }

  private initialize(gameId: string, sessionId: string, payload: JsonValue): void {
    const init = initSchema.safeParse(payload);
    if (
      !init.success ||
      gameId !== this.definition.manifest.gameId ||
      init.data.gameVersion !== this.definition.manifest.version
    )
      return;
    this.session = Object.freeze({
      ...init.data,
      gameId,
      sessionId,
      capabilities: Object.freeze([...init.data.capabilities]),
    });
    this.platform.post(
      {
        protocolVersion: 1,
        kind: 'handshake',
        gameId,
        sessionId,
        manifest: this.definition.manifest,
      },
      this.options.shellOrigin,
    );
  }

  private async handleLifecycle(name: string, payload: JsonValue): Promise<void> {
    const request = lifecycleRequestSchema.safeParse(payload);
    if (name === 'mount' && payload === null) {
      try {
        await this.receiveLifecycle(name, payload);
      } catch {
        this.sendEvent('mount-failed');
      }
      return;
    }
    if (!['pause', 'resume', 'dispose'].includes(name) || (payload !== null && !request.success))
      return;
    let error;
    try {
      await this.receiveLifecycle(name, null);
    } catch (reason) {
      error = serializeHostError(reason);
    }
    if (request.success && this.session) {
      this.platform.post(
        {
          protocolVersion: 1,
          kind: 'event',
          gameId: this.session.gameId,
          sessionId: this.session.sessionId,
          name: 'lifecycle-complete',
          payload: { requestId: request.data.requestId, ...(error ? { error } : {}) },
        },
        this.options.shellOrigin,
      );
    }
  }

  private async receiveLifecycle(name: string, payload: JsonValue): Promise<void> {
    if (payload !== null || !this.session) return;
    if (name === 'mount' && !this.instance && !this.mounting) {
      this.mounting = this.mountGame(this.session);
      await this.mounting;
    } else if (name === 'pause') {
      this.paused = true;
      this.instance?.pause();
    } else if (name === 'resume') {
      this.paused = false;
      this.instance?.resume();
    } else if (name === 'dispose') {
      await this.dispose();
    }
  }

  private async mountGame(session: GameSessionContext): Promise<void> {
    this.instance = await this.definition.mount(this.platform.target, this.createHost(session));
    if (this.disposal || this.disposed) return;
    if (this.paused) this.instance.pause();
    this.sendEvent('ready');
  }

  private sendEvent(name: 'ready' | 'mount-failed'): void {
    if (!this.session || this.disposed) return;
    this.platform.post(
      {
        protocolVersion: 1,
        kind: 'event',
        gameId: this.session.gameId,
        sessionId: this.session.sessionId,
        name,
        payload: null,
      },
      this.options.shellOrigin,
    );
  }

  private receiveResponse(message: Extract<HostMessage, { kind: 'response' }>): void {
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    clearTimeout(pending.timer);
    if (message.error) {
      pending.reject(new HostError(message.error));
      return;
    }
    const result = pending.schema.safeParse(message.result);
    if (!result.success) {
      pending.reject(new HostError({ code: 'INVALID_INPUT', message: 'Host response is invalid' }));
      return;
    }
    pending.resolve(result.data);
  }

  private createHost(session: GameSessionContext): GameHost {
    return {
      session,
      content: {
        load: () => this.request('content.load', null, contentSchema),
      },
      storage: {
        read: (key) => this.request('storage.read', { key }, storageSchema.nullable()),
        write: (key, value, expectedVersion) =>
          this.request(
            'storage.write',
            expectedVersion === undefined ? { key, value } : { key, value, expectedVersion },
            storageSchema,
          ),
      },
      ads: {
        offer: (opportunity) => this.request('ads.offer', opportunity, rewardSchema),
      },
      telemetry: {
        track: async (name, properties) => {
          await this.request(
            'telemetry.track',
            properties === undefined ? { name } : { name, properties },
            z.null(),
          );
        },
      },
      navigation: {
        navigate: async (destination) => {
          await this.request('navigation.navigate', { destination }, z.null());
        },
      },
    };
  }

  private request<T extends JsonValue>(
    method: string,
    params: JsonValue,
    schema: ZodType<T>,
  ): Promise<T> {
    const session = this.session;
    if (!session || this.disposed)
      return Promise.reject(
        new HostError({ code: 'CANCELLED', message: 'Iframe Game is not active' }),
      );
    const id = `${session.sessionId}:${++this.nextId}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new HostError({
            code: 'TIMEOUT',
            message: 'Game Host request timed out',
            retryable: true,
          }),
        );
      }, this.timeoutMs);
      this.pending.set(id, {
        schema: schema as ZodType<JsonValue>,
        resolve: resolve as (value: JsonValue) => void,
        reject,
        timer,
      });
      this.platform.post(
        {
          protocolVersion: 1,
          kind: 'request',
          gameId: session.gameId,
          sessionId: session.sessionId,
          id,
          method,
          params,
        },
        this.options.shellOrigin,
      );
    });
  }
}

/** Starts the remote iframe bridge for one framework-neutral Game definition. */
export const startIframeGame = (
  definition: GameDefinition,
  options: IframeGameClientOptions,
): IframeGameClient => new IframeGameClient(definition, options);
