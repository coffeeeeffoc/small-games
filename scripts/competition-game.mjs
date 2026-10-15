import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { prepareH5Service } from './competition-h5-service.mjs';
import {
  competitionService,
  serviceEnvironment,
  serviceGames,
} from './competition-service-config.mjs';

const { values } = parseArgs({
  options: {
    game: { type: 'string' },
    dev: { type: 'boolean' },
    'with-service': { type: 'boolean' },
    'without-service': { type: 'boolean' },
  },
});
if (!serviceGames.includes(values.game)) throw new Error(`Choose --game ${serviceGames.join('|')}`);
const env = serviceEnvironment(process.argv.slice(2));
competitionService({ env, local: true });
const root = fileURLToPath(new URL('../', import.meta.url));
const game = path.join(
  root,
  values.game === 'xiangqi-five' ? 'games/submodules/xiangqi-five' : `games/local/${values.game}`,
);
execFileSync(
  process.execPath,
  [values.game === 'xiangqi-five' ? 'build.js' : 'scripts/build.mjs'],
  { cwd: game, env, stdio: 'inherit' },
);
await prepareH5Service(values.game, path.join(game, 'dist'), { env, local: true });
if (values.dev) {
  const directory = path.join(game, 'dist');
  const mime = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.woff2': 'font/woff2',
    '.wav': 'audio/wav',
  };
  const server = createServer(async (req, res) => {
    try {
      if (!['GET', 'HEAD'].includes(req.method)) {
        res.writeHead(405).end();
        return;
      }
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const filename = path.resolve(
        directory,
        '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''),
      );
      if (
        !filename.startsWith(directory + path.sep) ||
        /[\\\0]/.test(pathname) ||
        pathname.split('/').some((part) => part.startsWith('.')) ||
        !(await stat(filename)).isFile()
      )
        throw new Error('Not found');
      res.writeHead(200, {
        'Content-Type': mime[path.extname(filename)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(req.method === 'HEAD' ? undefined : await readFile(filename));
    } catch {
      res.writeHead(404).end('Not found');
    }
  });
  server.listen(Number(env.PORT || 43700), '127.0.0.1', () =>
    console.log(`${values.game}: http://127.0.0.1:${server.address().port}`),
  );
}
