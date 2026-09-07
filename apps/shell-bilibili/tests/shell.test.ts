import { describe, expect, it, vi } from 'vitest';
import {
  loadReviewedGame,
  startBilibiliShell,
  reviewedCultivation as reviewed,
  reviewedOffice,
  reviewedArena,
} from '@coffeeeeffoc/shell-bilibili';
import { fakeSdk } from './fixture.js';

describe('reviewed Bilibili Shell', () => {
  it('remembers startup hide events until a deferred mount becomes ready', async () => {
    const { sdk } = fakeSdk();
    let finish!: (instance: { pause(): void; resume(): void; dispose(): Promise<void> }) => void;
    const pending = new Promise<{ pause(): void; resume(): void; dispose(): Promise<void> }>(
      (resolve) => {
        finish = resolve;
      },
    );
    const instance = { pause: vi.fn(), resume: vi.fn(), dispose: vi.fn(async () => undefined) };
    const mount = vi.fn(() => pending);
    const launch = startBilibiliShell(
      sdk,
      () => ({ ...reviewed, definition: { ...reviewed.definition, mount } }),
      { sessionId: 'pending' },
    );
    await vi.waitFor(() => expect(mount).toHaveBeenCalledOnce());
    vi.mocked(sdk.onHide).mock.calls[0][0]();
    finish(instance);
    const shell = await launch;
    expect(instance.pause).toHaveBeenCalledOnce();
    await shell.dispose();
  });

  it('contains SDK callback errors and always attempts idempotent Game cleanup', async () => {
    const { sdk } = fakeSdk();
    const instance = {
      pause() {
        throw new Error('pause');
      },
      resume() {
        throw new Error('resume');
      },
      dispose: vi.fn(async () => undefined),
    };
    const shell = await startBilibiliShell(
      sdk,
      () => ({ ...reviewed, definition: { ...reviewed.definition, mount: async () => instance } }),
      { sessionId: 'throwing' },
    );
    expect(() => vi.mocked(sdk.onHide).mock.calls[0][0]()).not.toThrow();
    expect(() => vi.mocked(sdk.onShow).mock.calls[0][0]()).not.toThrow();
    vi.mocked(sdk.offHide).mockImplementation(() => {
      throw new Error('SDK offHide');
    });
    vi.mocked(sdk.offShow).mockImplementation(() => {
      throw new Error('SDK offShow');
    });
    await shell.dispose();
    await shell.dispose();
    expect(instance.dispose).toHaveBeenCalledOnce();
    expect(sdk.offHide).toHaveBeenCalledOnce();
    expect(sdk.offShow).toHaveBeenCalledOnce();
  });

  it('unsubscribes visibility hooks when mounting fails', async () => {
    const { sdk } = fakeSdk();
    await expect(
      startBilibiliShell(
        sdk,
        () => ({
          ...reviewed,
          definition: {
            ...reviewed.definition,
            mount: async () => {
              throw new Error('bad mount');
            },
          },
        }),
        { sessionId: 'failed' },
      ),
    ).rejects.toThrow('bad mount');
    expect(sdk.offHide).toHaveBeenCalledOnce();
    expect(sdk.offShow).toHaveBeenCalledOnce();
  });

  it('runs the actual Canvas Game through complete gameplay, pause/resume and disposal', async () => {
    const fake = fakeSdk();
    const instance = await startBilibiliShell(fake.sdk, () => reviewed, {
      sessionId: 'native-play',
    });
    expect(fake.lines.map((line) => line.text)).toContain('三分钟修仙');
    instance.pause();
    expect(fake.lines.map((line) => line.text)).toContain('修行已暂停');
    expect(fake.rectangles).toHaveLength(0);
    instance.resume();
    for (let index = 0; index < reviewed.content.payload.events.length; index++) {
      fake.choose();
      await vi.waitFor(() =>
        expect(fake.lines.some((line) => line.text === '正在处理…')).toBe(false),
      );
    }
    expect(fake.lines.some((line) => line.text.includes('三章已毕'))).toBe(true);
    const saved = JSON.parse([...fake.records.values()][0]);
    expect(saved.value.cultivationChapter).toBe(3);
    expect(saved.value.bestCultivation).toBeGreaterThan(0);
    // All touch targets stay within the native viewport throughout the shipped campaign.
    expect(fake.rectangles.every((button) => button.y + button.height < 844)).toBe(true);
    await instance.dispose();
    expect(fake.hasTap()).toBe(false);
    expect(fake.sdk.offHide).toHaveBeenCalledOnce();
    expect(fake.sdk.offShow).toHaveBeenCalledOnce();
  });

  it.each([
    ['office', reviewedOffice, '打工人摸鱼记'],
    ['arena', reviewedArena, '电子斗蛐蛐'],
  ] as const)('loads and starts the predeclared %s Game', async (gameId, module, title) => {
    const fake = fakeSdk();
    const instance = await startBilibiliShell(fake.sdk, () => module, {
      gameId,
      sessionId: `native-${gameId}`,
    });
    expect(fake.sdk.loadSubpackage).toHaveBeenCalledWith(expect.objectContaining({ name: gameId }));
    expect(fake.lines.map((line) => line.text)).toContain(title);
    await instance.dispose();
  });

  it('preserves Office hold-to-slack behavior', async () => {
    const fake = fakeSdk();
    const instance = await startBilibiliShell(
      fake.sdk,
      () => ({
        ...reviewedOffice,
        content: {
          ...reviewedOffice.content,
          payload: { ...reviewedOffice.content.payload, experience: 'classic' },
        },
      }),
      { gameId: 'office', sessionId: 'office-parity' },
    );
    fake.choose();
    await vi.waitFor(() => expect(fake.rectangles.length).toBeGreaterThan(0));
    fake.press();
    expect(fake.lines.map((line) => line.text)).toContain('松手！切回表格');
    fake.release();
    expect(fake.lines.map((line) => line.text)).toContain('按住摸鱼');
    await instance.dispose();
  });

  it('shows all eight Arena battle steps before settlement', async () => {
    vi.useFakeTimers();
    try {
      const fake = fakeSdk();
      const instance = await startBilibiliShell(fake.sdk, () => reviewedArena, {
        gameId: 'arena',
        sessionId: 'arena-parity',
      });
      for (let choice = 0; choice < 4; choice += 1) {
        fake.choose();
        await vi.advanceTimersByTimeAsync(0);
      }
      expect(fake.lines.some((line) => line.text.includes('battle'))).toBe(true);
      for (let step = 1; step <= 8; step += 1) {
        await vi.advanceTimersByTimeAsync(260);
        expect(fake.lines.some((line) => line.text.includes(`battle`))).toBe(true);
      }
      await vi.advanceTimersByTimeAsync(260);
      expect(fake.lines.some((line) => line.text.includes('result'))).toBe(true);
      await instance.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('never resolves Game code until the predeclared SDK package succeeds', async () => {
    const { sdk } = fakeSdk();
    sdk.loadSubpackage = vi.fn((options) => options.fail());
    const getModule = vi.fn(() => reviewed);
    await expect(loadReviewedGame(sdk, 'cultivation', getModule)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    expect(getModule).not.toHaveBeenCalled();
    await expect(loadReviewedGame(undefined, 'cultivation', getModule)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
    await expect(
      loadReviewedGame(sdk, 'https://evil.example/game.js', getModule),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('bounds an unresponsive SDK and rejects incompatible reviewed metadata', async () => {
    const { sdk } = fakeSdk();
    sdk.loadSubpackage = () => undefined;
    await expect(loadReviewedGame(sdk, 'cultivation', () => reviewed, 5)).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
    sdk.loadSubpackage = (options) => options.success();
    await expect(
      loadReviewedGame(sdk, 'cultivation', () => ({
        ...reviewed,
        definition: {
          ...reviewed.definition,
          manifest: { ...reviewed.definition.manifest, entry: 'https://evil.example/game.js' },
        },
      })),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});
