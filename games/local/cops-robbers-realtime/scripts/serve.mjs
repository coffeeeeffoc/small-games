import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { h5ServiceConfig, serviceBundle, serviceHtml, serviceEnvironment } from '../../../../scripts/competition-h5-service.mjs';

const root = resolve(process.argv.includes("--dist") ? "dist" : ".");
const port = Number(process.env.PORT || 43690);
const env = serviceEnvironment(process.argv.slice(2));
const service = !process.argv.includes('--dist') || env.COMPETITION_SERVICE_ENABLED !== undefined
  ? h5ServiceConfig('cops-robbers-realtime', { env, local: true }) : null;
const competition = service?.competitionEnabled ? await serviceBundle('cops-robbers-realtime') : null;
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
};
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === '/competition.js' && service) {
      res.writeHead(competition ? 200 : 404, { 'Content-Type': mime['.js'] });
      res.end(competition || 'Not found');
      return;
    }
    if (url.pathname === "/publishing.js") {
      res.writeHead(200, { "Content-Type": mime[".js"], "Cache-Control": "no-store" });
      res.end(await readFile(new URL("../../../../platforms/h5/publishing.js", import.meta.url)));
      return;
    }
    const file = resolve(root, "." + decodeURIComponent(url.pathname));
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    const path = (await stat(file)).isDirectory()
      ? resolve(file, "index.html")
      : file;
    res.writeHead(200, {
      "Content-Type": mime[extname(path)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    const content = await readFile(path);
    res.end(extname(path) === '.html' && service ? serviceHtml(content.toString(), service) : content);
  } catch {
    res
      .writeHead(404, { "Content-Type": "text/plain; charset=utf-8" })
      .end("Not found");
  }
}).listen({ port, host: "127.0.0.1", exclusive: true }, () =>
  console.log(`别跑！街区围捕 — http://127.0.0.1:${port}`),
);
