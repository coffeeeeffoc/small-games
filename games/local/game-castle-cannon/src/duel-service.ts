import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDuelServer } from './duel-server.js';
export { createDuelServer };
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const service = createDuelServer({
    staticRoot: resolve('dist'),
    origins: process.env.DUEL_ORIGINS?.split(','),
  });
  const port = Number(process.env.PORT ?? 4179);
  service.server.listen(port, process.env.HOST ?? '127.0.0.1', () =>
    process.stdout.write(`双城炮战: http://127.0.0.1:${port}/play/\n`),
  );
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => service.stop());
}
