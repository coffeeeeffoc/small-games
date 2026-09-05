import { z } from 'zod';
import { HostError, hostErrorSchema, type JsonValue } from '@coffeeeeffoc/game-contract';

export const lifecycleRequestSchema = z.object({ requestId: z.string().min(1) }).strict();
export const iframeInitSchema = z
  .object({
    gameVersion: z.string().min(1),
    releaseChannel: z.enum(['development', 'canary', 'stable']),
    adAuthority: z.enum(['host', 'managed', 'none']),
    locale: z.string().min(1),
    capabilities: z.array(z.enum(['content', 'storage', 'advertising', 'telemetry', 'navigation'])),
  })
  .strict();
const acknowledgementSchema = z
  .object({
    requestId: z.string().min(1),
    error: hostErrorSchema.optional(),
  })
  .strict();

/** Correlates lifecycle acknowledgements, with bounded waits and explicit cancellation. */
export class IframeLifecycle {
  private nextId = 0;
  private pending = new Map<
    string,
    { resolve(): void; reject(error: unknown): void; timer: ReturnType<typeof setTimeout> }
  >();

  request(post: (payload: JsonValue) => void, timeoutMs: number): Promise<void> {
    const requestId = `lifecycle:${++this.nextId}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new HostError({ code: 'TIMEOUT', message: 'Remote lifecycle timed out' }));
      }, timeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
      post({ requestId });
    });
  }

  acknowledge(payload: JsonValue): void {
    const parsed = acknowledgementSchema.safeParse(payload);
    if (!parsed.success) return;
    const pending = this.pending.get(parsed.data.requestId);
    if (!pending) return;
    this.pending.delete(parsed.data.requestId);
    clearTimeout(pending.timer);
    if (parsed.data.error) pending.reject(new HostError(parsed.data.error));
    else pending.resolve();
  }

  cancel(): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new HostError({ code: 'CANCELLED', message: 'Remote lifecycle cancelled' }));
    }
    this.pending.clear();
  }
}
