import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
const root = new URL('../', import.meta.url);
const server = createServer(async (_req, res) =>
  res
    .writeHead(200, { 'Content-Type': 'text/javascript' })
    .end(await readFile(new URL('src/render.mjs', root))),
);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
});
try {
  const page = await browser.newPage();
  const url = `http://127.0.0.1:${server.address().port}/art.mjs`;
  await page.goto(url);
  const art = await page.evaluate(async (url) => (await import(url)).bakeArt(), url);
  await mkdir(new URL('assets/resources/art/', root), { recursive: true });
  for (const [name, data] of Object.entries(art))
    await writeFile(new URL(`assets/resources/art/${name}.png`, root), Buffer.from(data, 'base64'));
  console.log(`Baked ${Object.keys(art).length} original industrial textures/sprites offline.`);
} finally {
  await browser.close();
  server.close();
}
