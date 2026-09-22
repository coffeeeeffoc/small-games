import { z } from 'zod';
import { readFile } from 'node:fs/promises';
import { createKartServer } from './server.ts';

const port = z.coerce
  .number()
  .int()
  .min(1)
  .max(65535)
  .parse(process.env.KART_SERVER_PORT ?? 43003);
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
// Use the same private endpoint as the client build, so start/dev/share agree.
if (process.env.KART_ALLOWED_ORIGINS === undefined) {
  let endpoint = process.env.KART_SERVER_URL;
  if (endpoint === undefined) {
    try {
      const release = JSON.parse(
        await readFile(
          new URL('../../../games/local/carding-car/release-config.local.json', import.meta.url),
          'utf8',
        ),
      );
      endpoint = release.multiplayerServerUrl;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  if (endpoint) {
    const url = new URL(endpoint);
    if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.hash)
      throw new Error(
        'KART_SERVER_URL / multiplayerServerUrl must be a WS(S) URL without credentials',
      );
    url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
    origins.push(url.origin, `http://127.0.0.1:${port}`, `http://localhost:${port}`);
  }
}
for (const origin of origins) {
  if (!/^https?:$/.test(new URL(origin).protocol) || new URL(origin).origin !== origin)
    throw new Error('KART_ALLOWED_ORIGINS must contain HTTP(S) origins');
}
const { app } = createKartServer({ origins, maxRooms, logger: true });
try {
  await app.listen({ host: process.env.HOST ?? '127.0.0.1', port });
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE')
    console.error(`卡丁车端口 ${port} 已被占用，请检查已有服务；不会自动改用其他端口。`);
  throw error;
}
console.log(`好友联机本地端口：${port}；Sakura FRP 本地目标必须与此端口一致。`);
if (process.env.PORT && process.env.PORT !== String(port))
  console.log(
    '已忽略通用 PORT 环境变量；如需更改监听端口，请显式设置 KART_SERVER_PORT 并同步修改 FRP。',
  );
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void app.close();
  });
