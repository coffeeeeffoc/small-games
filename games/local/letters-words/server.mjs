import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const files = new Map([
  ['/index.html', 'text/html; charset=utf-8'],
  ['/style.css', 'text/css; charset=utf-8'],
  ['/app.mjs', 'text/javascript; charset=utf-8'],
  ['/game.mjs', 'text/javascript; charset=utf-8'],
  ['/favicon.svg', 'image/svg+xml'],
]);
const port = Number(process.env.PORT ?? 4186);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error('PORT 必须是 0 到 65535 的整数。');
}

const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-cache');
  const reply = (status, message) => {
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(req.method === 'HEAD' ? undefined : message);
  };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    reply(405, '405 Method Not Allowed');
    return;
  }
  let pathname;
  try {
    // Keep the original path: URL normalization would conceal ../ segments.
    pathname = decodeURIComponent((req.url ?? '/').split('?')[0]);
  } catch {
    reply(400, '400 Bad Request: 无效的请求路径。');
    return;
  }
  if (pathname === '/') pathname = '/index.html';
  if (!files.has(pathname)) {
    reply(404, '404 Not Found: 找不到此页面或文件。');
    return;
  }
  try {
    const body = await readFile(new URL(`.${pathname}`, import.meta.url));
    res.writeHead(200, {
      'Content-Type': files.get(pathname),
      'Content-Length': body.length,
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (error) {
    if (error.code === 'ENOENT') reply(404, '404 Not Found: 文件尚未创建。');
    else {
      console.error(error);
      reply(500, '500 Internal Server Error');
    }
  }
});

server.on('error', (error) => {
  console.error(`启动失败：${error.message}`);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  console.log(`游戏已启动：http://127.0.0.1:${server.address().port}`);
});
