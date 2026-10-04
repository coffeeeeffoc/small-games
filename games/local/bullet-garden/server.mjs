import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const options = { '--host': '127.0.0.1', '--port': '4410', '--root': '.' };
const args = process.argv.slice(2).filter((arg) => arg !== '--');
for (let index = 0; index < args.length; index += 2) {
  if (!Object.hasOwn(options, args[index]) || !args[index + 1]) {
    throw new Error('Usage: node server.mjs [--host 127.0.0.1] [--port 4410] [--root dist]');
  }
  options[args[index]] = args[index + 1];
}
const port = Number(options['--port']);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
const root = await realpath(path.resolve(directory, options['--root']));
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
};

const server = http.createServer(async (request, response) => {
  const send = (status, message) => {
    response.writeHead(status, {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : message);
  };
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.setHeader('Allow', 'GET, HEAD');
    send(405, 'Method not allowed');
    return;
  }
  try {
    let urlPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (urlPath.includes('\\') || urlPath.includes('\0') || urlPath.split('/').includes('..')) {
      send(400, 'Invalid path');
      return;
    }
    for (const prefix of ['/bullet-garden', '/games/bullet-garden']) {
      if (urlPath === prefix) {
        response.writeHead(308, { Location: `${prefix}/` }).end();
        return;
      }
      if (urlPath.startsWith(`${prefix}/`)) {
        urlPath = urlPath.slice(prefix.length);
        break;
      }
    }
    if (urlPath === '/') urlPath = '/index.html';
    // Serve runtime assets only, never development files, tests or repository metadata.
    if (!/^\/(?:index\.html|(?:style|home|display)\.css|favicon\.svg|src\/[^?#]+)$/.test(urlPath)) {
      send(404, 'Not found');
      return;
    }
    const file = await realpath(path.resolve(root, `.${urlPath}`));
    if (!file.startsWith(`${root}${path.sep}`) || !(await stat(file)).isFile()) {
      send(404, 'Not found');
      return;
    }
    const body = await readFile(file);
    response.writeHead(200, {
      'Content-Type': mime[path.extname(file)] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    if (error instanceof URIError || error.code === 'ERR_INVALID_URL') send(400, 'Invalid URL');
    else if (['ENOENT', 'ENOTDIR', 'EACCES'].includes(error.code)) send(404, 'Not found');
    else {
      console.error(error);
      send(500, 'Internal server error');
    }
  }
});
server.on('error', (error) => {
  console.error(`Bullet Garden server failed: ${error.message}`);
  process.exitCode = 1;
});
server.listen(port, options['--host'], () => {
  console.log(`Bullet Garden http://${options['--host']}:${port}/`);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close(() => process.exit(0)));
}
