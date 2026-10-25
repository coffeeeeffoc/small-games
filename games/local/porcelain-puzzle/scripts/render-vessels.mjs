import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { vessels } from '../src/content.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const three = resolve(dirname(createRequire(import.meta.url).resolve('three')), '..');
const server = createServer(async (req, res) => {
  try {
    if (req.url === '/') {
      res.setHeader('Content-Type', 'text/html');
      res.end(
        '<script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>',
      );
      return;
    }
    const url = new URL(req.url, 'http://localhost'),
      library = url.pathname.startsWith('/three/'),
      directory = library ? three : root,
      suffix = library ? url.pathname.slice(7) : '.' + url.pathname,
      file = resolve(directory, decodeURIComponent(suffix)),
      rel = relative(directory, file);
    assert(!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep));
    res.setHeader('Content-Type', file.endsWith('.png') ? 'image/png' : 'text/javascript');
    res.end(await readFile(file));
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const directory = join(root, 'assets/vessels');
  await mkdir(directory, { recursive: true });
  const outlines = [];
  for (const vessel of vessels) {
    const result = await page.evaluate(
      async (v) => (await import('/scripts/ceramic-studio.mjs')).renderVessel(v),
      vessel,
    );
    assert(result.outline.length > 200 && result.webp.length > 1000, `Empty artwork: ${vessel.id}`);
    await writeFile(join(directory, `${vessel.id}.webp`), Buffer.from(result.webp, 'base64'));
    if (vessel.theme === 0) outlines.push(result.outline);
    else
      assert.deepEqual(
        result.outline,
        outlines[vessel.shape],
        `Material changed silhouette: ${vessel.id}`,
      );
    if (vessel.shape === 9) console.log(`Rendered ${vessel.theme + 1}/10 material collections`);
  }
  await writeFile(
    join(root, 'src/vessel-contours.mjs'),
    `// Alpha contours of the baked studio artwork; regenerate with pnpm art:render.\n// prettier-ignore\nexport const vesselContours = ${JSON.stringify(outlines)};\n`,
  );
} finally {
  await browser.close();
  server.close();
}
