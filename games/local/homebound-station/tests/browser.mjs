import { chromium, expect } from '@playwright/test';
import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { canDispatch, splitPlans } from '../src/simulation.ts';

const output = new URL('../test-results/', import.meta.url); await mkdir(output, { recursive: true });
const server = process.env.GAME_URL ? undefined : await preview({ preview: { host: '127.0.0.1', port: 4327, strictPort: true } });
const base = process.env.GAME_URL ?? 'http://127.0.0.1:4327/';
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? 'chrome', headless: true });
const report = { browser: await browser.version(), base, results: [], errors: [] };
try {
  await Promise.all([false, true].map(async mobile => {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 }, hasTouch: mobile, isMobile: mobile });
    const page = await context.newPage();
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400 && r.url().startsWith(base)) report.errors.push(`${r.status()} ${r.url()}`); });
    const shot = name => page.screenshot({ path: fileURLToPath(new URL(`${mobile ? 'mobile' : 'desktop'}-${name}.png`, output)) });
    const click = async selector => { const locator = typeof selector === 'string' ? page.locator(selector) : selector; if (mobile) await locator.tap(); else await locator.click(); };
    const state = () => page.evaluate(() => window.homeboundSnapshot());
    try {
      await page.goto(base); await expect(page.locator('[data-level="0"]')).toBeVisible(); await shot('menu'); await click('[data-level="0"]');
      await click('#fullscreen'); await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
      await click('#fullscreen'); await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
      for (let level = 1; level <= 3; level++) {
        if (level > 1) await click('[data-action="next"]');
        await shot(`level${level}-start`); await click('#speed');
        if (level === 2) {
          await click('[data-vehicle="巡01"]');
          const s = await state(); expect(s.vehicles[0].bayId).toBe('T2'); expect(s.vehicles[0].groupId).toBe('T02');
          expect(s.groups[0].state).toBe('ready'); // T1 is six people; a four-passenger car takes T2's two people.
        }
        const deadline = Date.now() + 180000;
        while (!(await state()).won && Date.now() < deadline) {
          const raw = await state(), sim = { ...raw, delivered: new Set(raw.delivered) };
          const group = sim.groups.find(g => splitPlans(sim, g.id).length);
          if (group) {
            const shortcut = page.locator(`[data-inspect-group="${group.id}"]`);
            if (await shortcut.isVisible()) await click(shortcut); else await click(`[data-group="${group.id}"]`);
            await click('#split'); await expect(page.locator('#confirm-split')).toBeDisabled(); await click('#consent');
            await shot(`level${level}-split`); await click('#confirm-split');
            continue;
          }
          const car = sim.vehicles.find(v => canDispatch(sim, v.id).ok);
          if (car) {
            const count = raw.services.length; await click(`[data-vehicle="${car.id}"]`);
            await expect.poll(async () => (await state()).services.length).toBe(count + 1);
          }
          await page.waitForTimeout(120);
        }
        const s = await state(); expect(s.won).toBe(true); expect(s.vehicles.every(v => v.state === 'removed')).toBe(true);
        expect(s.delivered.length).toBe(s.target); expect(new Set(s.delivered).size).toBe(s.target); expect(s.bays.every(b => b.state === 'free')).toBe(true);
        expect(new Set(s.services.map(j => j.vehicleId)).size).toBe(s.vehicles.length);
        if (level === 2) expect(s.splits).toBeGreaterThan(0);
        await shot(`level${level}-complete`); report.results.push({ mobile, level, vehicles: s.vehicles.length, delivered: s.delivered.length, time: s.time, splits: s.splits, allCarsExited: true });
        console.log(`${mobile ? 'touch' : 'desktop'} level ${level} complete: ${s.vehicles.length} cars / ${s.delivered.length} passengers`);
      }
      await page.reload(); await expect(page.locator('[data-level="2"]')).toBeEnabled(); await click('[data-level="2"]');
      expect((await state()).services).toHaveLength(0);
      for (const size of mobile ? [{ width: 360, height: 740 }, { width: 844, height: 390 }] : []) {
        await page.setViewportSize(size); await page.waitForTimeout(100); await shot(`layout-${size.width}`);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
    } catch (error) { await shot('failure'); throw error; }
    finally { await context.close(); }
  }));
  expect(report.errors).toEqual([]); console.log(JSON.stringify(report, null, 2));
} catch (error) { report.failure = String(error); throw error; }
finally { await writeFile(new URL('browser-report.json', output), JSON.stringify(report, null, 2)); await browser.close(); if (server) await new Promise(resolve => server.httpServer.close(resolve)); }
