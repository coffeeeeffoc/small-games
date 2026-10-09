// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { createInMemoryGameHost } from '@coffeeeeffoc/game-host';
import { castleCannonCanvasDefinition } from './index.js';
import { castleCannonGameDefinition } from './definition.js';

vi.mock('./index.js', () => ({
  castleCannonManifest: {},
  castleCannonCanvasDefinition: { mount: vi.fn() },
}));

it('does not replay a pointer click with detail zero as a keyboard action', async () => {
  const action = vi.fn();
  vi.mocked(castleCannonCanvasDefinition.mount).mockImplementation(async (target) => {
    target.onAction?.(action);
    target.present?.(
      [{ id: 'scope', label: '望远镜', x: 768, y: 112, w: 170, h: 64 }],
      'playing',
      'playing',
    );
    return { pause() {}, resume() {}, async dispose() {} };
  });
  const target = document.createElement('div');
  document.body.append(target);
  const instance = await castleCannonGameDefinition.mount(target, createInMemoryGameHost());
  try {
    const button = target.querySelector('button[data-action="scope"]')!;
    for (const pointerType of ['touch', 'mouse', 'pen']) {
      const click = new MouseEvent('click', { bubbles: true, detail: 0 });
      Object.defineProperty(click, 'pointerType', { value: pointerType });
      button.dispatchEvent(click);
    }
    expect(action).not.toHaveBeenCalled();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    expect(action).toHaveBeenCalledExactlyOnceWith('scope');
  } finally {
    await instance.dispose();
    target.remove();
  }
});
