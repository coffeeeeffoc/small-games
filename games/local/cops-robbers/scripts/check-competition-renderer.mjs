import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import rules from '../../../../services/runtime-api/rules/cops.mjs';
import { solutions } from '../src/solutions.js';

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(process.env.BASE_URL || 'http://127.0.0.1:43441');
  await page.waitForSelector('#board');
  const state = rules.initial(0), plan = solutions[state.levelId][0];
  const cop = Math.max(0, plan.findIndex((node, i) => node !== state.board.cops[i]));
  const hits = await page.evaluate(async state => {
    const { createRenderer } = await import('/src/competition-renderer.js');
    const canvas = document.createElement('canvas'); canvas.width = 390; canvas.height = 560;
    document.body.replaceChildren(canvas); document.body.style.margin = '0';
    const renderer = createRenderer(), ctx = canvas.getContext('2d');
    const hits = renderer.draw(ctx, canvas.width, canvas.height, state);
    window.actions = [];
    canvas.addEventListener('click', event => {
      const bounds = canvas.getBoundingClientRect(), action = renderer.tap(event.clientX - bounds.x, event.clientY - bounds.y, state);
      if (action) window.actions.push(action);
      renderer.draw(ctx, canvas.width, canvas.height, state);
    });
    return hits;
  }, state);
  const selection = hits.find(hit => hit.action.local === cop);
  await page.mouse.click(selection.x + selection.w / 2, selection.y + selection.h / 2);
  assert.equal((await page.evaluate(() => window.actions)).length, 0, 'Selecting a police officer must not move');
  const target = hits.find(hit => hit.action.target === plan[cop]);
  await page.mouse.click(target.x + target.w / 2, target.y + target.h / 2);
  assert.deepEqual(await page.evaluate(() => window.actions), [{ type: 'move', cop, target: plan[cop] }]);
  // This is real browser Canvas/input evidence only; backend and native tool evidence are separate.
  await page.screenshot({ path: 'outputs/competition-canvas.png' });
  console.log('PASS real Canvas selection and legal move intent at 390px; no local settlement');
} finally { await browser.close(); }
