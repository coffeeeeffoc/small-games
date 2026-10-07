import assert from 'node:assert/strict';

// Observe state only. Every action below goes through the player's visible controls.
export async function enterGame(page, touch = false) {
  if (await page.locator('#start-game').isVisible()) {
    if (touch) await page.locator('#start-game').tap();
    else await page.locator('#start-game').click();
  }
  await page.locator('#game[data-page="play"]').waitFor();
}

export async function openLevels(page, touch = false) {
  const activate = (locator) => (touch ? locator.tap() : locator.click());
  if (await page.locator('#menu').isVisible()) await activate(page.locator('#menu'));
  await activate(page.locator('#home-levels'));
  await page.locator('#game[data-page="levels"]').waitFor();
}

export async function retryGame(page, touch = false) {
  if (touch) await page.locator('#pause').tap();
  else await page.locator('#pause').click();
  if (touch) await page.locator('#retry').tap();
  else await page.locator('#retry').click();
  await page.locator('#game[data-page="play"]').waitFor();
}

export async function findLevel(page, id, touch = false) {
  const locator = page.locator(`[data-level="${id}"]`);
  // Chapter navigation is a player action; the DOM only contains the current ten cards.
  for (let i = 0; i < 10 && !(await locator.isVisible()); i++) {
    if (!(await page.locator('#chapter-next').isEnabled())) break;
    if (touch) await page.locator('#chapter-next').tap();
    else await page.locator('#chapter-next').click();
  }
  for (let i = 0; i < 10 && !(await locator.isVisible()); i++) {
    if (!(await page.locator('#chapter-prev').isEnabled())) break;
    if (touch) await page.locator('#chapter-prev').tap();
    else await page.locator('#chapter-prev').click();
  }
  assert(await locator.isVisible(), `Level ${id} is available in its chapter`);
  return locator;
}

// Include ancestor transforms so the same scene gestures work in physical landscape
// and in the complete-game rotation used when the browser cannot lock orientation.
export async function scenePoint(page, x, y) {
  return page.locator('#canvas').evaluate(
    (canvas, point) => {
      let matrix = new DOMMatrix();
      for (let node = canvas; node; node = node.parentElement) {
        const transform = getComputedStyle(node).transform;
        if (transform !== 'none') matrix = new DOMMatrix(transform).multiply(matrix);
      }
      const width = canvas.offsetWidth,
        height = canvas.offsetHeight;
      const corners = [
        [0, 0],
        [width, 0],
        [0, height],
        [width, height],
      ];
      const minX = Math.min(...corners.map(([a, b]) => matrix.a * a + matrix.c * b));
      const minY = Math.min(...corners.map(([a, b]) => matrix.b * a + matrix.d * b));
      const bounds = canvas.getBoundingClientRect();
      const localX = (point.x * width) / 480,
        localY = (point.y * height) / 520;
      return {
        x: bounds.x + matrix.a * localX + matrix.c * localY - minX,
        y: bounds.y + matrix.b * localX + matrix.d * localY - minY,
      };
    },
    { x, y },
  );
}
