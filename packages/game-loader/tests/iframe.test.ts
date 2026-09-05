import { describe, expect, it, vi } from 'vitest';

import { IframeGameLoader } from '@coffeeeeffoc/game-loader';

import { artifact, fakePlatform, handshake, host, manifest } from './iframe.fixture.js';

describe('IframeGameLoader', () => {
  it('verifies isolation, handshakes, brokers validated requests, and owns lifecycle', async () => {
    const fake = fakePlatform();
    const gameHost = host();
    const target = { replaceChildren: vi.fn() } as unknown as HTMLElement;
    const loader = new IframeGameLoader({
      shellOrigin: 'https://shell.example',
      platform: fake.platform,
    });
    const launch = loader.launch(artifact, target, gameHost);
    await vi.waitFor(() => expect(fake.hasListener()).toBe(true));
    fake.emit(handshake(), 'https://games.example');
    expect(fake.hasListener()).toBe(true);
    fake.emit(handshake(), 'null', {} as WindowProxy);
    expect(fake.posted).toHaveLength(1);
    expect(fake.posted[0]).toMatchObject({ kind: 'event', name: 'init' });
    fake.emit(handshake());
    await launch;
    expect(fake.posted[1]).toMatchObject({ kind: 'event', name: 'mount' });

    fake.emit({
      protocolVersion: 1,
      kind: 'request',
      gameId: 'cultivation',
      sessionId: 'session-1',
      id: 'read-1',
      method: 'storage.read',
      params: { key: 'save' },
    });
    await vi.waitFor(() => expect(fake.posted).toHaveLength(3));
    expect(fake.posted[2]).toMatchObject({
      kind: 'response',
      id: 'read-1',
      result: { value: { qi: 7 }, version: 'v1' },
    });
    fake.emit({
      protocolVersion: 1,
      kind: 'request',
      gameId: 'cultivation',
      sessionId: 'session-1',
      id: 'ad-1',
      method: 'ads.offer',
      params: { id: 'reward', reward: { qi: 1 } },
    });
    await vi.waitFor(() => expect(fake.posted).toHaveLength(4));
    expect(fake.posted[3]).toMatchObject({
      kind: 'response',
      id: 'ad-1',
      error: { code: 'CAPABILITY_MISSING' },
    });
    for (const [id, method, params] of [
      ['telemetry-1', 'telemetry.track', { name: 'attempt' }],
      ['navigation-1', 'navigation.navigate', { destination: '/outside' }],
    ] as const) {
      fake.emit({
        protocolVersion: 1,
        kind: 'request',
        gameId: 'cultivation',
        sessionId: 'session-1',
        id,
        method,
        params,
      });
      await vi.waitFor(() =>
        expect(
          fake.posted.some((message) => message.kind === 'response' && message.id === id),
        ).toBe(true),
      );
      expect(
        fake.posted.find((message) => message.kind === 'response' && message.id === id),
      ).toMatchObject({ error: { code: 'CAPABILITY_MISSING' } });
    }
    vi.mocked(gameHost.storage.read).mockResolvedValueOnce({
      value: (() => undefined) as never,
      version: 'bad',
    });
    fake.emit({
      protocolVersion: 1,
      kind: 'request',
      gameId: 'cultivation',
      sessionId: 'session-1',
      id: 'read-2',
      method: 'storage.read',
      params: { key: 'save' },
    });
    await vi.waitFor(() => expect(fake.posted).toHaveLength(7));
    expect(fake.posted[6]).toMatchObject({
      kind: 'response',
      id: 'read-2',
      error: { code: 'INVALID_INPUT' },
    });
    await loader.pause();
    await loader.resume();
    await loader.dispose();
    expect(fake.posted.slice(-3).map((message) => ('name' in message ? message.name : ''))).toEqual(
      ['pause', 'resume', 'dispose'],
    );
    expect(fake.remove).toHaveBeenCalledOnce();
  });

  it.each([
    {
      name: 'same origin',
      candidate: { ...artifact, entryUrl: 'https://shell.example/game.html' },
      code: 'INVALID_INPUT',
    },
    {
      name: 'missing capability',
      candidate: artifact,
      host: { ...host(), session: { ...host().session, capabilities: ['content'] as const } },
      code: 'CAPABILITY_MISSING',
    },
  ])('rejects $name before creating a frame', async ({ candidate, host: candidateHost, code }) => {
    const fake = fakePlatform();
    const loader = new IframeGameLoader({
      shellOrigin: 'https://shell.example',
      platform: fake.platform,
    });
    await expect(
      loader.launch(candidate, {} as HTMLElement, candidateHost ?? host()),
    ).rejects.toMatchObject({ code });
    expect(fake.platform.createFrame).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'integrity', sha256: 'sha256-bad', csp: undefined, message: 'integrity' },
    { name: 'CSP', sha256: undefined, csp: "default-src 'self'", message: 'CSP' },
    {
      name: 'duplicate CSP directives',
      sha256: undefined,
      csp: "default-src 'none'; script-src https://evil.example; script-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors https://shell.example",
      message: 'CSP',
    },
    {
      name: 'additional exfiltration CSP directives',
      sha256: undefined,
      csp: "default-src 'none'; script-src data:; connect-src 'none'; img-src https:; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors https://shell.example",
      message: 'CSP',
    },
  ])('rejects invalid $name before execution', async ({ sha256, csp, message }) => {
    const fake = fakePlatform({
      ...(sha256 ? { sha256: vi.fn(async () => sha256) } : {}),
      ...(csp
        ? {
            fetchArtifact: vi.fn(async () => ({ body: new ArrayBuffer(1), csp })),
          }
        : {}),
    });
    const loader = new IframeGameLoader({
      shellOrigin: 'https://shell.example',
      platform: fake.platform,
    });
    await expect(loader.launch(artifact, {} as HTMLElement, host())).rejects.toThrow(message);
    expect(fake.platform.createFrame).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'protocol', claim: { ...handshake(), protocolVersion: 2 } },
    { name: 'session', claim: { ...handshake(), sessionId: 'other-session' } },
    {
      name: 'manifest',
      claim: { ...handshake(), manifest: { ...manifest, version: '9.0.0' } },
    },
  ])('rejects an invalid $name handshake from the expected frame', async ({ claim }) => {
    const fake = fakePlatform();
    const loader = new IframeGameLoader({
      shellOrigin: 'https://shell.example',
      platform: fake.platform,
    });
    const launch = expect(loader.launch(artifact, {} as HTMLElement, host())).rejects.toMatchObject(
      { code: 'INVALID_INPUT' },
    );
    await vi.waitFor(() => expect(fake.hasListener()).toBe(true));
    fake.emit(claim);
    await launch;
    expect(fake.remove).toHaveBeenCalledOnce();
  });

  it('times out an unresponsive frame and cancels a pending launch on dispose', async () => {
    vi.useFakeTimers();
    const first = fakePlatform();
    const timed = new IframeGameLoader({
      shellOrigin: 'https://shell.example',
      platform: first.platform,
      timeoutMs: 20,
    });
    const timeoutLaunch = expect(
      timed.launch(artifact, {} as HTMLElement, host()),
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(20);
    await timeoutLaunch;
    expect(first.remove).toHaveBeenCalledOnce();

    const second = fakePlatform();
    const cancelled = new IframeGameLoader({
      shellOrigin: 'https://shell.example',
      platform: second.platform,
      timeoutMs: 20,
    });
    const cancelledLaunch = expect(
      cancelled.launch(artifact, {} as HTMLElement, host()),
    ).rejects.toMatchObject({ code: 'CANCELLED' });
    await vi.advanceTimersByTimeAsync(0);
    expect(second.hasListener()).toBe(true);
    await cancelled.dispose();
    await cancelledLaunch;
    vi.useRealTimers();
  });

  it('lets only the newest overlapping launch own the frame and listener', async () => {
    let finishFirst!: (value: { body: ArrayBuffer; csp: string }) => void;
    const fake = fakePlatform({
      fetchArtifact: vi
        .fn()
        .mockImplementationOnce(() => new Promise((resolve) => (finishFirst = resolve)))
        .mockResolvedValue({
          body: new ArrayBuffer(1),
          csp: "default-src 'none'; script-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors https://shell.example",
        }),
    });
    const loader = new IframeGameLoader({
      shellOrigin: 'https://shell.example',
      platform: fake.platform,
    });
    const first = expect(loader.launch(artifact, {} as HTMLElement, host())).rejects.toMatchObject({
      code: 'CANCELLED',
    });
    await vi.waitFor(() => expect(fake.platform.fetchArtifact).toHaveBeenCalledOnce());
    const secondLaunch = loader.launch(artifact, {} as HTMLElement, host());
    await vi.waitFor(() => expect(fake.hasListener()).toBe(true));
    fake.emit(handshake());
    await secondLaunch;
    finishFirst({
      body: new ArrayBuffer(1),
      csp: "default-src 'none'; script-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors https://shell.example",
    });
    await first;
    expect(fake.platform.createFrame).toHaveBeenCalledOnce();
    await loader.dispose();
    expect(fake.remove).toHaveBeenCalledOnce();
  });
});
