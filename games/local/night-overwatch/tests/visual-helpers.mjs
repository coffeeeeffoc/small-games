import { press as pressInput } from './flight-browser.mjs';

// Wait for actual rendered frames and completed panel transitions. Fixed wall-clock
// delays can capture outgoing panels or click the previous layout on software GPUs.
export async function settleVisuals(page) {
  await page.evaluate(async () => {
    const { director, Director } = await System.import('cc');
    for (let frame = 0; frame < 2; frame++)
      await new Promise(resolve => director.once(Director.EVENT_AFTER_DRAW, resolve));
  });
  await page.waitForFunction(async () => {
    const { director, UIOpacity, isValid } = await System.import('cc');
    const panels = director.getScene().getComponentsInChildren(UIOpacity)
      .filter(component => isValid(component.node) && component.node.activeInHierarchy && component.node.name === 'Panel');
    return panels.length <= 1 && panels.every(component => component.opacity === 255);
  }, null, { timeout: 15000 });
}

export async function press(page, id, touch = false, expand = false) {
  await pressInput(page, id, touch, expand);
  await settleVisuals(page);
}
