import { allowedOrigins, createTianxiaServer } from './server.mjs';

const port = Number(process.env.TIANXIA_SERVER_PORT || 43004);
const maxMatches = Number(process.env.TIANXIA_MAX_MATCHES || 64);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('TIANXIA_SERVER_PORT 必须为 1–65535');
if (!Number.isInteger(maxMatches) || maxMatches < 1 || maxMatches > 256)
  throw new Error('TIANXIA_MAX_MATCHES 必须为 1–256');
const host = process.env.TIANXIA_SERVER_HOST || '127.0.0.1';
const app = await createTianxiaServer({
  dataDir: process.env.TIANXIA_DATA_DIR,
  origins: allowedOrigins(process.env.TIANXIA_ALLOWED_ORIGINS),
  maxMatches,
});
await app.listen(port, host);
console.log(`天下岔路权威对局服务 http://${host}:${port}/play/`);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, async () => {
    await app.close();
    process.exit(0);
  });
