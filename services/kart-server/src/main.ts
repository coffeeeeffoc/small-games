import { z } from 'zod';
import { createKartServer } from './server.ts';

const port = z.coerce
  .number()
  .int()
  .min(1)
  .max(65535)
  .parse(process.env.PORT ?? 43003);
const maxRooms = z.coerce
  .number()
  .int()
  .min(1)
  .max(100)
  .parse(process.env.KART_MAX_ROOMS ?? 16);
const origins = (process.env.KART_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
for (const origin of origins) {
  if (!/^https?:$/.test(new URL(origin).protocol) || new URL(origin).origin !== origin)
    throw new Error('KART_ALLOWED_ORIGINS must contain HTTP(S) origins');
}
const { app } = createKartServer({ origins, maxRooms, logger: true });
await app.listen({ host: process.env.HOST ?? '127.0.0.1', port });
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void app.close();
  });
