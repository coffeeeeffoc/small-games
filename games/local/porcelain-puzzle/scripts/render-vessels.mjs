import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderVesselBatch } from './vessel-batch.mjs';
import { createRequire } from 'node:module';
import { dirname, resolve, relative, isAbsolute, sep } from 'node:path';
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
  const directory = await renderVesselBatch({
    root,
    vessels,
    render: (vessel) =>
      page.evaluate(
        async (v) => (await import('/scripts/ceramic-studio.mjs')).renderVessel(v),
        vessel,
      ),
    validateImage: (bytes) =>
      page.evaluate(async (base64) => {
        const image = new Image();
        image.src = 'data:image/webp;base64,' + base64;
        await image.decode();
        if (image.width !== 480 || image.height !== 600)
          throw Error('Unexpected studio texture dimensions');
        const canvas = document.createElement('canvas');
        canvas.width = 480;
        canvas.height = 600;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        const pixels = ctx.getImageData(0, 0, 480, 600).data;
        if (!pixels.some((value, i) => i % 4 === 3 && value === 255))
          throw Error('Empty studio surface');
      }, bytes.toString('base64')),
    checkpoint: async (stage, count) => {
      if (stage === 'image' && count % 10 === 0)
        console.log(`Rendered ${count / 10}/10 material collections`);
    },
  });
  console.log('Activated complete vessel batch: ' + directory);
} finally {
  await browser.close();
  server.close();
}
