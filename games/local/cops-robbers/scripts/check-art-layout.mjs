import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { levels } from '../src/levels.js';
import { solutions } from '../src/solutions.js';
import { initialState, step } from '../src/engine.js';

const base = (process.env.BASE_URL || 'http://127.0.0.1:43447').replace(/\/$/, '');
const executablePath = process.env.BROWSER_EXECUTABLE || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const report = { base, checks: [], passed: false };
await mkdir('outputs', { recursive: true });

async function load(surface, id) {
  await surface.goto(`${base}/?level=${id}&motion=reduce`);
  await surface.waitForFunction(id => document.body.dataset.level === String(id)
    && document.body.dataset.phase === 'planning', id);
  await surface.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function snapshot(surface) {
  return surface.evaluate(() => ({
    cops: [...document.querySelectorAll('#board [id^="cop-actor-"]')]
      .sort((a, b) => Number(a.id.split('-').at(-1)) - Number(b.id.split('-').at(-1)))
      .map(actor => Number(actor.dataset.node)),
    robbers: [...document.querySelectorAll('#board [id^="robber-actor-"]')]
      .sort((a, b) => Number(a.id.split('-').at(-1)) - Number(b.id.split('-').at(-1)))
      .map(actor => Number(actor.dataset.node)),
    turn: Number(document.body.dataset.turn),
  }));
}
function stateView(state) {
  return { cops: state.cops, robbers: state.robbers.filter(node => node >= 0), turn: state.turn };
}
async function runtimeNodePoint(surface, node) {
  return surface.locator(`#target-${node}`).evaluate(target => {
    const point = new DOMPoint(target.cx.baseVal.value, target.cy.baseVal.value).matrixTransform(target.getScreenCTM());
    return { x: point.x, y: point.y };
  });
}
async function assets(surface) {
  return surface.evaluate(async () => {
    const urls = new Set();
    for (const image of document.querySelectorAll('#board image')) {
      const href = image.getAttribute('href') || image.getAttribute('xlink:href');
      if (href && !href.startsWith('data:')) urls.add(new URL(href, location.href).href);
    }
    for (const element of document.querySelectorAll('#board, #board .scenery, .map-frame')) {
      for (const match of getComputedStyle(element).backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
        urls.add(new URL(match[1], location.href).href);
      }
    }
    return Promise.all([...urls].map(async url => {
      const image = new Image();
      image.src = url;
      await image.decode();
      let alpha;
      if (url.includes('patrol-characters')) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 64;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, 64, 64);
        const data = context.getImageData(0, 0, 64, 64).data;
        alpha = { transparent: 0, painted: 0 };
        for (let index = 3; index < data.length; index += 4) {
          if (data[index] < 10) alpha.transparent++;
          if (data[index] > 200) alpha.painted++;
        }
      }
      return { url, width: image.naturalWidth, height: image.naturalHeight, alpha };
    }));
  });
}
async function check(name, options, run) {
  const context = await browser.newContext({ hasTouch: true, ...options });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  try {
    const details = await run(page, context);
    assert.deepEqual(errors, [], 'No browser or resource errors');
    report.checks.push({ name, passed: true, details });
    console.log(`PASS ${name}`);
  } catch (error) {
    report.checks.push({ name, passed: false, failure: error.stack, errors });
    await page.screenshot({ path: `outputs/art-layout-failure-${report.checks.length}.png`, fullPage: true }).catch(() => {});
    throw error;
  } finally { await context.close(); }
}

try {
  for (const [width, height] of [[320, 568], [390, 844], [844, 390], [1440, 900], [1920, 1080]]) {
    await check(`scene geometry and road hit targets at ${width}x${height}`, { viewport: { width, height } }, async page => {
      const details = [];
      for (const id of [1, 40, 60, 84, 90, 100]) {
        await load(page, id);
        const layout = await page.evaluate(() => {
          const bounds = element => {
            if (element instanceof SVGSVGElement && element.classList.contains('character-sprite')) {
              // A clipped atlas image can extend outside its nested SVG in getBoundingClientRect.
              // The visible portrait is the viewport described by the crop's viewBox.
              const box = element.viewBox.baseVal, matrix = element.getScreenCTM();
              const a = new DOMPoint(box.x, box.y).matrixTransform(matrix);
              const b = new DOMPoint(box.x + box.width, box.y + box.height).matrixTransform(matrix);
              return { x: a.x, y: a.y, right: b.x, bottom: b.y, width: b.x - a.x, height: b.y - a.y };
            }
            const box = element.getBoundingClientRect();
            return { x: box.x, y: box.y, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
          };
          const board = document.getElementById('board');
          const labels = [...board.querySelectorAll('.node-label')].map(label => {
            const rect = bounds(label.querySelector('rect'));
            const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
            return { node: Number(label.dataset.node), rect, hit: top?.closest('[data-node]')?.dataset.node };
          });
          const actors = [...board.querySelectorAll('.actor')].map(actor => ({
            id: actor.id,
            graphic: bounds(actor.querySelector('.character-sprite') || actor.querySelector('.illustrated-character, .figure')),
            bitmap: !!actor.querySelector('image[href*="assets/"]'),
          }));
          return {
            board: bounds(board), viewBox: board.getAttribute('viewBox'), labels, actors,
            controls: ['focus-toggle', 'restart', 'undo', 'hint'].map(id => ({ id, ...bounds(document.getElementById(id)) })),
            scrollWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth, viewportHeight: innerHeight,
          };
        });
        assert.ok(layout.scrollWidth <= width, `Level ${id} causes horizontal scrolling`);
        assert.ok(layout.board.x >= -1 && layout.board.right <= width + 1
          && layout.board.y >= -1 && layout.board.bottom <= height + 1, `Level ${id} board leaves the viewport`);
        assert.equal(layout.labels.length, levels[id - 1].nodes.length);
        for (const label of layout.labels) {
          assert.equal(label.hit, String(label.node), `Level ${id} road ${label.node + 1} is covered by another control`);
          assert.ok(label.rect.x >= layout.board.x - 1 && label.rect.right <= layout.board.right + 1
            && label.rect.y >= layout.board.y - 1 && label.rect.bottom <= layout.board.bottom + 1,
          `Level ${id} road ${label.node + 1} label is clipped`);
        }
        assert.equal(layout.actors.length, levels[id - 1].cops.length + levels[id - 1].robbers.length);
        for (const actor of layout.actors) {
          assert.ok(actor.bitmap, `${actor.id} is missing its default illustrated sprite`);
          assert.ok(actor.graphic.x >= layout.board.x - 1 && actor.graphic.right <= layout.board.right + 1
            && actor.graphic.y >= layout.board.y - 1 && actor.graphic.bottom <= layout.board.bottom + 1,
          `Level ${id} ${actor.id} is clipped at ${width}x${height}: ${JSON.stringify(actor.graphic)}`);
        }
        for (const control of layout.controls) {
          assert.ok(control.x >= -1 && control.right <= width + 1 && control.y >= -1 && control.bottom <= height + 1,
            `${control.id} leaves the viewport`);
          assert.ok(control.width >= 44 && control.height >= 44, `${control.id} is too small for touch`);
        }
        assert.equal(await page.locator('[data-game-fullscreen]:visible, #level-select:visible, #settings:visible').count(), 0);
        const decoded = await assets(page);
        assert.ok(decoded.length >= 2, 'Scene and character bitmap assets must both load');
        assert.ok(decoded.every(image => image.width > 0 && image.height > 0));
        for (const image of decoded.filter(image => image.alpha)) {
          assert.ok(image.alpha.transparent > 100 && image.alpha.painted > 100,
            'Character atlas must retain transparency and painted character pixels');
        }
        const before = initialState(levels[id - 1]), plan = solutions[id][0];
        const cop = Math.max(0, plan.findIndex((node, index) => node !== before.cops[index]));
        await page.getByTestId(`cop-${cop}`).tap();
        await page.getByTestId(`node-${plan[cop]}`).tap();
        await page.waitForFunction(() => document.body.dataset.turn === '1'
          && ['planning', 'won', 'lost'].includes(document.body.dataset.phase))
          .catch(error => { throw new Error(`Level ${id}: a legal direct tap did not complete the first turn`, { cause: error }); });
        assert.deepEqual(await snapshot(page), stateView(step(levels[id - 1], before, plan).state));
        await page.getByTestId('undo').tap();
        assert.deepEqual(await snapshot(page), stateView(before), `Level ${id} undo must restore both teams`);
        if (id === 84) await page.screenshot({ path: `outputs/art-play-${width}x${height}.png` });
        details.push({ id, viewBox: layout.viewBox, board: layout.board, actors: layout.actors, decoded });
      }
      return details;
    });
  }

  for (const embedded of [false, true]) {
    for (const mode of [
      { name: 'default', query: '', stored: null, enabled: false },
      { name: 'URL', query: '&dev=1', stored: null, enabled: true },
      { name: 'storage', query: '', stored: 'true', enabled: true },
      { name: 'explicit-off', query: '&dev=0', stored: 'true', enabled: false },
    ]) {
      await check(`${embedded ? 'iframe' : 'standalone'} developer ${mode.name} with touch input`,
        { viewport: { width: 390, height: 844 } }, async (page, context) => {
          await context.addInitScript(value => {
            if (value === null) localStorage.removeItem('dev');
            else localStorage.setItem('dev', value);
          }, mode.stored);
          let surface = page;
          if (embedded) {
            await page.route('**/__art-frame__*', route => route.fulfill({ contentType: 'text/html', body:
              `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}iframe{display:block;width:100vw;height:100dvh;border:0}</style><iframe src="${base}/?level=1&motion=reduce${mode.query}"></iframe>` }));
            await page.goto(`${base}/__art-frame__`);
            await page.locator('iframe').waitFor();
            surface = await (await page.locator('iframe').elementHandle()).contentFrame();
          } else await page.goto(`${base}/?level=1&motion=reduce${mode.query}`);
          await surface.waitForFunction(enabled => document.body.dataset.phase === 'planning'
            && window.SmallGamesDev?.isEnabled() === enabled, mode.enabled);
          assert.equal(await surface.locator('small-games-devtools').count(), mode.enabled ? 1 : 0);
          const before = initialState(levels[0]), plan = solutions[1][0];
          const cop = plan.findIndex((node, index) => node !== before.cops[index]);
          const session = await context.newCDPSession(page);
          await session.send('Emulation.setTouchEmulationEnabled', { enabled: true });
          const touch = (type, point) => session.send('Input.dispatchTouchEvent', { type,
            touchPoints: point ? [{ ...point, id: 1 }] : [] });
          if (mode.enabled) {
            const tools = surface.locator('small-games-devtools');
            await tools.getByRole('button', { name: '开发者调试', exact: true }).tap();
            await tools.getByLabel('显示触点', { exact: true }).check();
            await tools.getByRole('button', { name: '关闭', exact: true }).tap();
          }
          const actor = await surface.getByTestId(`cop-${cop}`).boundingBox();
          await touch('touchStart', { x: actor.x + actor.width / 2, y: actor.y + actor.height / 2 });
          await touch('touchMove', await runtimeNodePoint(surface, plan[cop]));
          assert.equal(await surface.locator('.drag-line').count(), 1);
          if (mode.enabled) assert.equal(await surface.locator('small-games-devtools .touch').count(), 1);
          await touch('touchCancel');
          assert.equal(await surface.locator('.drag-line').count(), 0);
          assert.equal(await surface.locator('small-games-devtools .touch').count(), 0);
          assert.deepEqual(await snapshot(surface), stateView(before), 'Cancelled touch must preserve both teams');
          await surface.getByTestId(`cop-${cop}`).tap();
          await surface.getByTestId(`node-${plan[cop]}`).tap();
          await surface.waitForFunction(() => document.body.dataset.turn === '1' && document.body.dataset.phase === 'planning');
          assert.deepEqual(await snapshot(surface), stateView(step(levels[0], before, plan).state));
          await session.detach();
          return { embedded, mode: mode.name, enabled: mode.enabled };
        });
    }
  }
  report.passed = true;
  console.log(`PASS ${report.checks.length} art layout and developer touch scenarios`);
} finally {
  await writeFile('outputs/art-layout-report.json', JSON.stringify(report, null, 2));
  await browser.close();
}
