import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { levels } from '../src/levels.js';
import { solutions } from '../src/solutions.js';
import { initialState, step } from '../src/engine.js';

const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium' });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await page.goto(`${process.env.BASE_URL || 'http://127.0.0.1:43447'}/?level=86`);
  await page.waitForSelector('#robber-actor-0');
  await page.evaluate(() => {
    window.movementFrames = [];
    const sample = () => {
      window.movementFrames.push({ phase: document.body.dataset.phase, turn: Number(document.body.dataset.turn),
        actors: [...document.querySelectorAll('#actor-layer .actor')].map(actor => {
          const matrix = new DOMMatrixReadOnly(getComputedStyle(actor).transform);
          return { id: actor.id, node: Number(actor.dataset.node), x: matrix.e, y: matrix.f };
        }) });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  let state = initialState(levels[85]);
  for (const plan of solutions[86].slice(0, 8)) {
    const cop = Math.max(0, plan.findIndex((n, i) => n !== state.cops[i]));
    await page.getByTestId(`cop-${cop}`).tap();
    const selection = await page.evaluate(() => {
      const actor = document.querySelector('#actor-layer .cop[aria-pressed=true]');
      return { ringFill: getComputedStyle(actor.querySelector('.selection-ring')).fill,
        groundOpacity: getComputedStyle(document.getElementById(`target-${actor.dataset.node}`)).opacity };
    });
    assert.equal(selection.ringFill, 'none');
    assert.equal(selection.groundOpacity, '0', 'Selected cop has only one selection marker');
    await page.evaluate(() => { window.movementFrames = []; });
    await page.getByTestId(`node-${plan[cop]}`).tap();
    const result = step(levels[85], state, plan);
    await page.waitForFunction(turn => Number(document.body.dataset.turn) === turn
      && ['planning', 'won', 'lost'].includes(document.body.dataset.phase), result.state.turn);
    const frames = await page.evaluate(() => window.movementFrames);
    for (const kind of ['cop', 'robber']) {
      const from = kind === 'cop' ? state.cops : state.robbers;
      const to = kind === 'cop' ? plan : result.robberMoves;
      for (let i = 0; i < from.length; i++) {
        if (from[i] < 0 || to[i] < 0 || from[i] === to[i]) continue;
        assert.ok(levels[85].adj[from[i]].includes(to[i]), 'Each move follows a graph edge');
        const samples = frames.filter(frame => frame.phase === (kind === 'cop' ? 'police' : 'robbers'))
          .map(frame => frame.actors.find(actor => actor.id === `${kind}-actor-${i}`)).filter(Boolean);
        const a = { ...levels[85].nodes[from[i]] }, b = { ...levels[85].nodes[to[i]] };
        if (kind === 'robber') {
          const offset = (positions, node) => {
            const same = positions.flatMap((n, index) => n === node ? [index] : []);
            return (same.indexOf(i) - (same.length - 1) / 2) * 14;
          };
          a.x += offset(from, from[i]); b.x += offset(to, to[i]);
        }
        const ay = 50 + a.y * 800 / 600 + 12, by = 50 + b.y * 800 / 600 + 12;
        const dx = b.x - a.x, dy = by - ay, lengthSquared = dx * dx + dy * dy;
        const progress = samples.map(p => ((p.x - a.x) * dx + (p.y - ay) * dy) / lengthSquared);
        assert.ok(progress.some(t => t > .05 && t < .95), `${kind}-${i} must visibly travel instead of teleporting`);
        for (const [index, p] of samples.entries()) {
          assert.ok(progress[index] >= -.01 && progress[index] <= 1.01);
          assert.ok(Math.abs((p.x - a.x) * dy - (p.y - ay) * dx) / Math.sqrt(lengthSquared) < 1, `Animation stays on the road: ${kind}-${i}, ${from[i]}->${to[i]}, point ${JSON.stringify(p)}, expected ${a.x},${ay}->${b.x},${by}`);
          if (index) assert.ok(progress[index] >= progress[index - 1] - .01, 'Animation never jumps backwards');
        }
      }
    }
    state = result.state;
  }
  for (const viewport of [{ width: 562, height: 650 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto(`${process.env.BASE_URL || 'http://127.0.0.1:43447'}/?level=86&motion=reduce`);
    await page.waitForSelector('#exit-sign-layer .escape-sign');
    const signs = await page.evaluate(() => [...document.querySelectorAll('.escape-sign')].map(sign => {
      const box = sign.getBoundingClientRect(), board = document.getElementById('board').getBoundingClientRect();
      return { inside: box.x >= board.x && box.right <= board.right && box.y >= board.y && box.bottom <= board.bottom,
        topLayer: sign.parentElement === document.getElementById('board').lastElementChild };
    }));
    assert.ok(signs.every(sign => sign.inside && sign.topLayer));
    await page.locator('#board').screenshot({ path: `outputs/movement-board-${viewport.width}.png` });
  }
  console.log('PASS eight animated turns: adjacent roads, continuous motion, single selection and unobscured exit signs');
} finally { await browser.close(); }
