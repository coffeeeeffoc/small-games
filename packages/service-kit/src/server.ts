import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { z } from 'zod';

/** Readiness-only dependency seam; shutdown releases its connection resources. */
export interface DependencyProbe {
  check(): Promise<void>;
  close(): Promise<void> | void;
}

/** Vendor-neutral request span accepted by an OpenTelemetry adapter. */
export interface RequestSpanExporter {
  exportSpan(
    span: Readonly<{
      requestId: string;
      gameSessionId?: string;
      method: string;
      route: string;
      statusCode: number;
      durationMs: number;
    }>,
  ): Promise<void> | void;
}

const gameSessionId = (headers: Record<string, string | string[] | undefined>) => {
  const value = headers['x-game-session-id'];
  return typeof value === 'string' ? value : undefined;
};

/** Shared HTTP plumbing for the two services, with no business data or routes. */
export function createService(
  name: 'management' | 'runtime',
  dependencies: Record<string, DependencyProbe>,
  logger: FastifyServerOptions['logger'] = true,
  exporter?: RequestSpanExporter,
) {
  const app = Fastify({ logger, requestTimeout: 10_000, bodyLimit: 1_048_576 });
  const telemetry: RequestSpanExporter =
    exporter ??
    ({
      exportSpan: (span) => app.log.info({ otelSpan: span }, 'OpenTelemetry request span'),
    } satisfies RequestSpanExporter);
  app.addHook('onRequest', (request, _reply, done) => {
    const sessionId = gameSessionId(request.headers);
    if (sessionId) {
      request.log = request.log.child({ gameSessionId: sessionId });
      request.log.info('Game Session request');
    }
    done();
  });
  app.addHook('onResponse', async (request, reply) => {
    const sessionId = gameSessionId(request.headers);
    try {
      await telemetry.exportSpan({
        requestId: request.id,
        ...(sessionId ? { gameSessionId: sessionId } : {}),
        method: request.method,
        route: request.routeOptions.url ?? request.url,
        statusCode: reply.statusCode,
        durationMs: reply.elapsedTime,
      });
    } catch {
      request.log.warn('Telemetry export failed');
    }
  });
  app.get('/health/live', async () => ({ service: name, status: 'ok' }));
  app.get('/health', async (_request, reply) => {
    const results = await Promise.all(
      Object.entries(dependencies).map(async ([dependency, probe]) => {
        try {
          await probe.check();
          return [dependency, 'ok'] as const;
        } catch {
          // Never return or log connection strings, SDK credentials or raw errors.
          app.log.warn({ dependency }, 'Readiness dependency unavailable');
          return [dependency, 'unavailable'] as const;
        }
      }),
    );
    const ready = results.every(([, status]) => status === 'ok');
    return reply.code(ready ? 200 : 503).send({
      service: name,
      status: ready ? 'ok' : 'degraded',
      dependencies: Object.fromEntries(results),
    });
  });
  app.addHook('onClose', async () => {
    const results = await Promise.allSettled(
      Object.values(dependencies).map((dep) => Promise.resolve().then(() => dep.close())),
    );
    if (results.some((result) => result.status === 'rejected')) {
      app.log.warn('A dependency did not close cleanly');
    }
  });
  return app;
}

async function closeService(app: FastifyInstance) {
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      app.close(),
      new Promise<never>((_resolve, reject) => {
        deadline = setTimeout(() => reject(new Error('Shutdown deadline exceeded')), 3000);
      }),
    ]);
  } finally {
    clearTimeout(deadline);
  }
}

/** Starts a loopback-only local service and drains it on terminal shutdown. */
export async function listenService(app: FastifyInstance, defaultPort: number) {
  const port = z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .parse(process.env.PORT ?? defaultPort);
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    void closeService(app).catch(() => {
      app.log.error('Service shutdown failed');
      process.exit(1);
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  app.addHook('onClose', async () => {
    process.removeListener('SIGINT', shutdown);
    process.removeListener('SIGTERM', shutdown);
  });
  try {
    await app.listen({ host: '127.0.0.1', port });
  } catch (error) {
    try {
      await closeService(app);
    } catch {
      app.log.error('Startup cleanup failed');
    }
    const code = (error as NodeJS.ErrnoException | null)?.code;
    const reason =
      code === 'EACCES'
        ? 'EACCES: permission denied; check OS reserved ports'
        : code === 'EADDRINUSE'
          ? 'EADDRINUSE'
          : 'check its configured port';
    throw new Error(`Service failed to listen on 127.0.0.1:${port} (${reason})`);
  }
}
