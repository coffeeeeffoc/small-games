import { describe, expect, it } from 'vitest';
import { exerciseGameLifecycle } from '@coffeeeeffoc/game-contract-test';
import { createInMemoryGameHost } from '@coffeeeeffoc/game-host';
import {
  cricketCanvasDefinition as definition,
  defaultCricketEnvelope,
  type CricketCanvasTarget,
} from '@coffeeeeffoc/game-cricket/canvas';

function surface() {
  const lines: string[] = [];
  let listening = false;
  const context = {
    save() {},
    restore() {},
    scale() {},
    translate() {},
    rotate() {},
    beginPath() {},
    ellipse() {},
    fill() {},
    stroke() {},
    moveTo() {},
    lineTo() {},
    bezierCurveTo() {},
    quadraticCurveTo() {},
    clip() {},
    createLinearGradient() {
      return { addColorStop() {} };
    },
    createRadialGradient() {
      return { addColorStop() {} };
    },
    fillRect() {},
    clearRect() {
      lines.length = 0;
    },
    fillText(text: string) {
      lines.push(text);
    },
    measureText(text: string) {
      return { width: text.length * 17 };
    },
  } as unknown as CanvasRenderingContext2D;
  const target: CricketCanvasTarget = {
    canvas: { width: 390, height: 844, getContext: () => context },
    onTap() {
      listening = true;
      return () => {
        listening = false;
      };
    },
  };
  return { target, lines, isListening: () => listening };
}

function host() {
  return createInMemoryGameHost({
    session: { gameId: 'cricket', gameVersion: definition.manifest.version },
    content: defaultCricketEnvelope,
  });
}

describe('Cricket Canvas Game Contract', () => {
  it('uses the same lifecycle vectors and can remount without DOM or SDK globals', async () => {
    const fake = surface();
    await exerciseGameLifecycle(definition, fake.target, host());
    expect(fake.isListening()).toBe(false);
    expect(fake.lines).toEqual([]);
  });
  it('rejects missing capabilities and incompatible content', async () => {
    const base = host();
    await expect(
      definition.mount(surface().target, {
        ...base,
        session: { ...base.session, capabilities: [] },
      }),
    ).rejects.toMatchObject({ code: 'CAPABILITY_MISSING' });
    await expect(
      definition.mount(surface().target, {
        ...base,
        content: {
          load: async () => ({
            ...defaultCricketEnvelope,
            schemaVersion: definition.manifest.contentSchemaVersion + 1,
          }),
        },
      }),
    ).rejects.toMatchObject({ code: 'CONTENT_INCOMPATIBLE' });
  });
  it('mounts without advertising or available save storage', async () => {
    const base = host();
    const fake = surface();
    const instance = await definition.mount(fake.target, {
      ...base,
      session: { ...base.session, capabilities: ['content', 'storage'] },
      storage: {
        read: async () => {
          throw new Error('offline');
        },
        write: async () => {
          throw new Error('offline');
        },
      },
    });
    expect(fake.isListening()).toBe(true);
    instance.pause();
    instance.resume();
    await instance.dispose();
    expect(fake.isListening()).toBe(false);
  });
});
