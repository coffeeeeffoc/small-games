import { pathToFileURL } from 'node:url';

export const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
    : '@playwright/test'
);

export const browserOptions = {
  ...(process.env.PLAYWRIGHT_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
    : { channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' }),
  headless: true,
};

export async function activate(page, selector) {
  const control = typeof selector === 'string' ? page.locator(selector) : selector;
  if (await page.evaluate(() => navigator.maxTouchPoints > 0)) await control.tap();
  else await control.click();
}

export async function continueGame(page) {
  if (await page.locator('#resume-button').isVisible()) {
    await activate(page, '#resume-button');
  } else if (await page.locator('#focus-button').isVisible()) {
    await activate(page, '#focus-button');
  }
  await page.locator('#board').waitFor({ state: 'visible' });
}

export async function goHome(page) {
  for (let count = 0; count < 6; count++) {
    if (await page.locator('#home-button').isVisible()) {
      await activate(page, '#home-button');
      break;
    }
    const dismiss = page.locator('dialog[open] [data-close]').last();
    if (await dismiss.isVisible()) {
      await activate(page, dismiss);
      continue;
    }
    if (await page.locator('#pause-button').isVisible()) {
      await activate(page, '#pause-button');
      continue;
    }
    break;
  }
  await page.locator('#focus-button').waitFor({ state: 'visible' });
}

export async function openLibrary(page) {
  await goHome(page);
  await activate(page, '#learn-button');
  await activate(page, '#open-library');
  await page.locator('#library-dialog').waitFor({ state: 'visible' });
}

export async function openImport(page) {
  await goHome(page);
  await activate(page, '#learn-button');
  await activate(page, '#my-words-button');
  await page.locator('#import-dialog').waitFor({ state: 'visible' });
}

export async function openSettings(page) {
  await goHome(page);
  await activate(page, '#settings-button');
  await page.locator('#settings-dialog').waitFor({ state: 'visible' });
}

export async function openHelp(page) {
  if (await page.locator('#pause-button').isVisible()) {
    await activate(page, '#pause-button');
    await activate(page, '#help-button');
  } else {
    await activate(page, '#home-help-button');
  }
  await page.locator('#help-dialog').waitFor({ state: 'visible' });
}

export async function pauseGame(page) {
  if (!(await page.locator('#pause-dialog').isVisible())) {
    if (await page.locator('#focus-button').isVisible()) await continueGame(page);
    await activate(page, '#pause-button');
  }
  await page.locator('#pause-dialog').waitFor({ state: 'visible' });
}

export const boardSnapshot = page => page.locator('.tile').evaluateAll(tiles => tiles.map(tile => ({
  id: tile.dataset.tileId, char: tile.dataset.char,
  left: tile.style.left, top: tile.style.top, z: tile.style.zIndex,
  selected: tile.getAttribute('aria-pressed'),
})));
