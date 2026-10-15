import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { adConfiguration, configurationScript } from './ad-config.mjs';
import { h5ServiceConfig, serviceBundle, serviceHtml, serviceEnvironment } from '../../../../scripts/competition-h5-service.mjs';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(project, process.argv.includes('--dist') ? 'dist' : '.');
const port = Number(process.env.PORT || 43420);
const env = serviceEnvironment(process.argv.slice(2));
const service = !process.argv.includes('--dist') || env.COMPETITION_SERVICE_ENABLED !== undefined
  ? h5ServiceConfig('cops-robbers', { env, local: true }) : null;
const competition = service?.competitionEnabled ? await serviceBundle('cops-robbers') : null;
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT 必须是 0–65535 的整数；0 自动选择空闲端口。');
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
};
const inside = (base, path) => {
  const rel = relative(base, path);
  return !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`);
};
const canonicalRoot = await realpath(root).catch(() => {
  throw new Error(`找不到 ${root}。预览构建产物前请先运行 npm run build。`);
});
if (!inside(await realpath(project), canonicalRoot)) throw new Error('静态目录必须位于项目内。');

export const server = createServer(async (request, response) => {
  const send = (status, message) => {
    response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
    response.end(request.method === 'HEAD' ? undefined : message);
  };
  if (!['GET', 'HEAD'].includes(request.method)) return send(405, 'Method not allowed');
  try {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const name = path === '/' ? 'index.html' : path.slice(1);
    if (name === 'competition.js' && service) {
      if (!competition) return send(404, 'Not found');
      response.writeHead(200, { 'Content-Type': mime['.js'] });
      return response.end(request.method === 'HEAD' ? undefined : competition);
    }
    if (['publishing.js', 'platform-ads.js', 'platform-config.js'].includes(name) && !process.argv.includes('--dist')) {
      const content = name === 'platform-config.js' ? configurationScript(adConfiguration(false))
        : await readFile(resolve(project, '../../../platforms/h5', name));
      response.writeHead(200, { 'Content-Type': mime['.js'], 'X-Content-Type-Options': 'nosniff' });
      return response.end(request.method === 'HEAD' ? undefined : content);
    }
    const allowed = name === 'index.html' || name === 'dev-mode.js' || name === 'competition.js' || ['publishing.js', 'platform-ads.js', 'platform-config.js'].includes(name) || /^favicon\.(svg|ico|png)$/.test(name)
      || /^(src|assets)\//.test(name);
    if (!allowed || /[\\\0]/.test(name) || name.split('/').some(part => part.startsWith('.'))
      || !mime[extname(name).toLowerCase()]) return send(404, 'Not found');
    const target = resolve(root, name);
    if (!inside(root, target)) return send(404, 'Not found');
    const canonical = await realpath(target);
    if (!inside(canonicalRoot, canonical) || canonical !== resolve(canonicalRoot, name)
      || !(await stat(canonical)).isFile()) return send(404, 'Not found');
    let content = await readFile(canonical);
    if (name === 'index.html' && service) content = Buffer.from(serviceHtml(content.toString(), service));
    response.writeHead(200, {
      'Content-Type': mime[extname(name).toLowerCase()], 'Content-Length': content.length,
      'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch (error) {
    if (error instanceof URIError || error.code === 'ERR_INVALID_URL') return send(400, 'Bad request');
    if (['ENOENT', 'ENOTDIR', 'EACCES'].includes(error.code)) return send(404, 'Not found');
    console.error(error);
    send(500, 'Server error');
  }
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE'
    ? `端口 ${port} 已被占用。请关闭占用进程或设置 PORT 后重试。`
    : `静态服务启动失败：${error.message}`);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => console.log(`围捕小队 ${process.argv.includes('--dist') ? '构建预览' : '开发服务'}：http://127.0.0.1:${server.address().port}`));
