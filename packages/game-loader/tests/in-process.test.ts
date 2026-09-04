import { describe, expect, it, vi } from 'vitest';

import type { GameDefinition, GameHost } from '@coffeeeeffoc/game-contract';

import { InProcessGameLoader } from '@coffeeeeffoc/game-loader';

const manifest = {
  gameId: 'fixture',
  version: '1.0.0',
  gameContractVersion: 1 as const,
  contentSchemaVersion: 1,
  capabilities: [],
  loadModes: ['in-process'] as const,
  entry: 'index.html',
  integrity: 'fixture',
};

describe('InProcessGameLoader', () => {
  it('serializes launch, pause, resume, replacement, and disposal', async () => {
    const first = { pause: vi.fn(), resume: vi.fn(), dispose: vi.fn(async () => undefined) };
    const second = { pause: vi.fn(), resume: vi.fn(), dispose: vi.fn(async () => undefined) };
    const definition: GameDefinition = {
      manifest,
      mount: vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second),
    };
    const loader = new InProcessGameLoader();
    const target = {} as HTMLElement;

    await loader.launch(definition, target, {} as GameHost);
    await loader.pause();
    await loader.resume();
    await loader.launch(definition, target, {} as GameHost);
    await loader.dispose();
    await loader.dispose();

    expect(first.pause).toHaveBeenCalledOnce();
    expect(first.resume).toHaveBeenCalledOnce();
    expect(first.dispose).toHaveBeenCalledOnce();
    expect(second.dispose).toHaveBeenCalledOnce();
  });

  it('rejects a definition without in-process support', async () => {
    const loader = new InProcessGameLoader();
    const definition = {
      manifest: { ...manifest, loadModes: ['iframe'] as const },
      mount: vi.fn(),
    };

    await expect(
      loader.launch(definition, {} as HTMLElement, {} as GameHost),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    expect(definition.mount).not.toHaveBeenCalled();
  });

  it('keeps a failed disposal as the active blocker until a retry succeeds', async () => {
    const instance = {
      pause: vi.fn(),
      resume: vi.fn(),
      dispose: vi
        .fn()
        .mockRejectedValueOnce(new Error('teardown failed'))
        .mockResolvedValueOnce(undefined),
    };
    const definition: GameDefinition = { manifest, mount: vi.fn().mockResolvedValue(instance) };
    const loader = new InProcessGameLoader();
    await loader.launch(definition, {} as HTMLElement, {} as GameHost);

    await expect(loader.dispose()).rejects.toThrow('teardown failed');
    await loader.dispose();

    expect(instance.dispose).toHaveBeenCalledTimes(2);
  });
});
