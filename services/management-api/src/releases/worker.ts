import type { FastifyInstance } from 'fastify';
import { projectionReceiptSchema } from '@coffeeeeffoc/release-contract';
import type { createPublicationStore } from './store.js';

/** One bounded delivery per tick; durable rows survive restart and lost acknowledgments. */
export function startPublicationWorker(
  app: FastifyInstance,
  store: ReturnType<typeof createPublicationStore>,
  url: string,
  token: string,
) {
  const controller = new AbortController();
  let running: Promise<unknown> | undefined;
  const tick = () => {
    if (running || controller.signal.aborted) return;
    running = store
      .deliverOne(async (event) => {
        const response = await fetch(new URL('/internal/v1/releases', url), {
          method: 'POST',
          redirect: 'error',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify(event),
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(3000)]),
        });
        if (!response.ok) {
          await response.body?.cancel();
          throw new Error('Projection unavailable');
        }
        return projectionReceiptSchema.parse(await response.json());
      })
      .catch(() => {
        app.log.warn('Publication delivery unavailable');
      })
      .finally(() => {
        running = undefined;
      });
  };
  const timer = setInterval(tick, 1000);
  timer.unref();
  app.addHook('onClose', async () => {
    clearInterval(timer);
    controller.abort();
    await running;
  });
}
